/**
 * BTG's New sign-ups desk as ONE stream — P1-ART-15 (the screen is
 * /admin/new-signups, 2S1-FE-07 redesigned as the "Intake Stream").
 *
 * Every kind of sign-up the desk shows — organisations (2S1-BE-06), athletes
 * and guardians (2S1-BE-09 / -10), sponsors (2S1-BE-17) — newest first in a
 * single SERVER-PAGED list (the house rule: page, size, search and filters
 * run in the database; counts come from a summary, never from the rows on
 * screen). The per-kind endpoints (/signups, /onboarding/signups,
 * /sponsor-requests) are unchanged for their other callers.
 *
 * HOW ONE PAGE IS READ ACROSS FOUR TABLES, WITHOUT RAW SQL. The four tables
 * have no shared date column, so the stream is six SOURCES, each a plain
 * Prisma query under `whereFor` with exactly one real sort column (a guardian
 * is dated by `verifiedAt`, or `rejectedAt` if never verified — two sources;
 * an approved sponsor by `decidedAt`, a held one by `createdAt` — two more).
 * For page p of size s: count every source (the total), clamp the page, read
 * the id and date of the newest p·s rows of each source, merge them newest
 * first (`mergeNewest`), keep rows (p−1)·s … p·s, and only then load those
 * ids' full rows with the desks' own row builders. Exact, because the newest
 * N of a union are always among the newest N of each part; and it costs
 * p·s keys per source, which the desk's page sizes (12 / 24 / 60) keep small.
 *
 * Staying in Prisma keeps every read under `whereFor` (P8-SEC-02's static
 * test); a UNION in raw SQL would have stepped outside it.
 *
 * WHO SEES WHAT — no more than each kind's own endpoint allows. Each kind
 * joins only for a role that reads it tenant-wide: athletes for athlete
 * approve, guardians for guardian write (what /signups needs), sponsors for
 * inquiry read, organisations for onboarding read. A role that reads none
 * gets the same 403 as before. So Sales, which reads inquiries but no
 * athlete or guardian, gets a sponsors-only stream.
 *
 * EVERY STATE (the one intake page, 2026-11-21). The owner removed the
 * Onboarding and Sponsor requests desks: this stream is now the only list
 * of organisations and sponsors, so it carries every state they can be in —
 * a sponsor request still being finished or declined, an organisation asked
 * for changes or never submitted — not only what SponsorX approved or held.
 * Those are WAITING (theirs to finish) or DECLINED; `held` and Needs review
 * still mean BTG's move only.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { clampPage, pageInfo, type PageInfo, type PageRequest } from "../lib/paging";
import { ATHLETE_NEEDS_REVIEW, ATHLETE_ON_DESK, LIST_ATHLETE, LIST_GUARDIAN, athleteRow, guardianRow } from "./signups-desk";
import { INQUIRY_SELECT, summary as sponsorSummary } from "./sponsor-requests";
import { signupRow as organizationRow } from "./onboarding-profile";
import { ONBOARDING_SELECT } from "./onboarding";

import { mergeNewest, STREAM_KINDS, type StreamKey, type StreamKind } from "./signups-stream-rules";
import type { Problem } from "./hold-problems";

export type { StreamKind } from "./signups-stream-rules";
/** WAITING: with the applicant, not BTG (unfinished, asked for changes, a draft). DECLINED: a sponsor request BTG turned down. */
export type StreamState = "AUTO_APPROVED" | "APPROVED" | "NEEDS_REVIEW" | "WAITING" | "REJECTED" | "DECLINED";

export type StreamFilter = { kind?: StreamKind; review?: boolean; q?: string };

export type StreamRow = {
  kind: StreamKind;
  id: string;
  name: string;
  sub: string;
  signedUpAt: Date;
  state: StreamState;
  /** Why it is held, or what BTG noted — the desk's reason line. */
  reasons: string[];
  /** Athletes only: a place the age table doesn't know (counted as adult at 18). */
  flags: string[];
  /** POL-BE-42 — a held row's reasons as tags (hold-problems.ts); empty otherwise. */
  problems: Problem[];
};

/** A null sort date sorts last (Prisma `nulls: "last"`), so it merges as the oldest. */
const EPOCH = new Date(0);

/* ─────────────────────────── the six sources ─────────────────────────── */

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

type Source = {
  key: StreamKey["source"];
  kind: StreamKind;
  count: () => Promise<number>;
  keys: (n: number) => Promise<StreamKey[]>;
};

function tenantWide(actor: Actor, resource: Parameters<typeof assertTenantWide>[1], action: Parameters<typeof assertTenantWide>[2]): boolean {
  try {
    assertTenantWide(actor, resource, action);
    return true;
  } catch {
    return false;
  }
}

/** Which kinds this actor's stream holds: each one it reads tenant-wide. Throws (403) when it reads none. */
function kindsFor(actor: Actor): StreamKind[] {
  const kinds = STREAM_KINDS.filter((k) =>
    k === "ATHLETE" ? tenantWide(actor, "athleteApplication", "approve")
    : k === "GUARDIAN" ? tenantWide(actor, "guardian", "write")
    : k === "SPONSOR" ? tenantWide(actor, "inquiry", "read")
    : tenantWide(actor, "propertyOnboarding", "read"),
  );
  /* the same refusal, in the same shape, as before */
  if (kinds.length === 0) assertTenantWide(actor, "athleteApplication", "approve");
  return kinds;
}

function athleteWhere(actor: Actor, f: StreamFilter): Prisma.AthleteWhereInput {
  const and: Prisma.AthleteWhereInput[] = [whereFor(actor, "athleteApplication", "read"), ATHLETE_ON_DESK];
  if (f.review) and.push(ATHLETE_NEEDS_REVIEW);
  if (f.q) and.push({ OR: [{ legalName: contains(f.q) }, { displayName: contains(f.q) }, { school: contains(f.q) }, { sport: contains(f.q) }, { email: contains(f.q) }] });
  return { AND: and };
}

function guardianWhere(actor: Actor, f: StreamFilter, verified: boolean): Prisma.GuardianWhereInput {
  const and: Prisma.GuardianWhereInput[] = [
    whereFor(actor, "guardian", "read"),
    verified ? { verifiedAt: { not: null } } : { verifiedAt: null, rejectedAt: { not: null } },
  ];
  /* A guardian is never held for BTG: under Needs review there are none. */
  if (f.review) and.push({ id: { in: [] } });
  if (f.q) and.push({ OR: [{ legalName: contains(f.q) }, { email: contains(f.q) }] });
  return { AND: and };
}

/** held: waiting for BTG (reasons recorded) · waiting: NEW and not finished by them · decided: approved, declined or rejected. */
type InquirySource = "held" | "waiting" | "decided";

function inquiryWhere(actor: Actor, f: StreamFilter, source: InquirySource): Prisma.InquiryWhereInput {
  const and: Prisma.InquiryWhereInput[] = [
    whereFor(actor, "inquiry", "read"),
    source === "held" ? { state: "NEW", reviewReasons: { isEmpty: false } }
    : source === "waiting" ? { state: "NEW", reviewReasons: { isEmpty: true } }
    : { state: { in: ["APPROVED", "DECLINED", "REJECTED"] } },
  ];
  if (f.review && source !== "held") and.push({ id: { in: [] } });
  if (f.q) and.push({ OR: [{ companyName: contains(f.q) }, { firstName: contains(f.q) }, { lastName: contains(f.q) }, { email: contains(f.q) }] });
  return { AND: and };
}

/** Every state is listed; `drafts` splits the never-submitted ones off so they can be dated by when they were started. */
function organizationWhere(actor: Actor, f: StreamFilter, drafts = false): Prisma.PropertyOnboardingWhereInput {
  const and: Prisma.PropertyOnboardingWhereInput[] = [whereFor(actor, "propertyOnboarding", "read"), { submittedAt: drafts ? null : { not: null } }];
  /* onboarding-profile.ts signupStateOf: held unless rejected — waiting, suspended, or flagged after approval. A draft or an
     application sent back for changes is with the applicant, never BTG's move. */
  if (f.review) {
    and.push({
      state: { notIn: ["REJECTED", "DRAFT", "CHANGES_REQUESTED"] },
      OR: [{ state: { in: ["PENDING_REVIEW", "SUSPENDED"] } }, { flags: { isEmpty: false } }],
    });
  }
  if (f.q) and.push({ orgName: contains(f.q) });
  return { AND: and };
}

/** A sponsor request still with them: what they haven't done, from what the row records (the upload is the rest). */
function sponsorWaitingFor(i: { emailConfirmedAt: Date | null; businessType: string | null; businessTypeOther: string | null }): string[] {
  const out: string[] = [];
  if (!i.emailConfirmedAt) out.push("Hasn’t confirmed their email yet");
  if (!i.businessType || (i.businessType === "OTHER" && !i.businessTypeOther?.trim())) out.push("Hasn’t told us their business type yet");
  return out.length ? out : ["Waiting for their proof of business"];
}

function sources(actor: Actor, f: StreamFilter): Source[] {
  const kinds = kindsFor(actor).filter((k) => !f.kind || k === f.kind);
  const all: Source[] = [];
  if (kinds.includes("ATHLETE")) {
    const where = athleteWhere(actor, f);
    all.push({
      key: "athlete", kind: "ATHLETE",
      count: () => prisma.athlete.count({ where /* tenant-scope: athleteWhere starts with whereFor */ }),
      keys: async (n) => (await prisma.athlete.findMany({
        where, /* tenant-scope: athleteWhere starts with whereFor */
        select: { id: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: n,
      })).map((r) => ({ source: "athlete", kind: "ATHLETE", id: r.id, at: r.createdAt })),
    });
  }
  if (kinds.includes("GUARDIAN")) {
    for (const verified of [true, false]) {
      const where = guardianWhere(actor, f, verified);
      const col = verified ? "verifiedAt" : "rejectedAt";
      all.push({
        key: verified ? "guardianVerified" : "guardianRejected", kind: "GUARDIAN",
        count: () => prisma.guardian.count({ where /* tenant-scope: guardianWhere starts with whereFor */ }),
        keys: async (n) => (await prisma.guardian.findMany({
          where, /* tenant-scope: guardianWhere starts with whereFor */
          select: { id: true, verifiedAt: true, rejectedAt: true },
          orderBy: [verified ? { verifiedAt: "desc" } : { rejectedAt: "desc" }, { id: "desc" }], take: n,
        })).map((r) => ({ source: verified ? "guardianVerified" : "guardianRejected", kind: "GUARDIAN", id: r.id, at: r[col]! })),
      });
    }
  }
  if (kinds.includes("SPONSOR")) {
    const SPONSOR_SOURCES = [["decided", "sponsorApproved"], ["held", "sponsorHeld"], ["waiting", "sponsorWaiting"]] as const;
    for (const [source, key] of SPONSOR_SOURCES) {
      const where = inquiryWhere(actor, f, source);
      const byDecision = source === "decided";
      all.push({
        key, kind: "SPONSOR",
        count: () => prisma.inquiry.count({ where /* tenant-scope: inquiryWhere starts with whereFor */ }),
        keys: async (n) => (await prisma.inquiry.findMany({
          where, /* tenant-scope: inquiryWhere starts with whereFor */
          select: { id: true, createdAt: true, decidedAt: true },
          orderBy: byDecision ? [{ decidedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }] : [{ createdAt: "desc" }, { id: "desc" }],
          take: n,
        })).map((r) => ({ source: key, kind: "SPONSOR", id: r.id, at: byDecision ? r.decidedAt ?? EPOCH : r.createdAt })),
      });
    }
  }
  if (kinds.includes("ORGANIZATION")) {
    for (const drafts of [false, true]) {
      const where = organizationWhere(actor, f, drafts);
      const key = drafts ? "organizationDraft" : "organization";
      all.push({
        key, kind: "ORGANIZATION",
        count: () => prisma.propertyOnboarding.count({ where /* tenant-scope: organizationWhere starts with whereFor */ }),
        keys: async (n) => (await prisma.propertyOnboarding.findMany({
          where, /* tenant-scope: organizationWhere starts with whereFor */
          select: { id: true, submittedAt: true, createdAt: true },
          orderBy: drafts ? [{ createdAt: "desc" }, { id: "desc" }] : [{ submittedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          take: n,
        })).map((r) => ({ source: key, kind: "ORGANIZATION", id: r.id, at: drafts ? r.createdAt : r.submittedAt ?? EPOCH })),
      });
    }
  }
  return all;
}

/* ─────────────────────────── full rows for one page ─────────────────── */

async function rowsFor(actor: Actor, keys: StreamKey[]): Promise<StreamRow[]> {
  const ids = (kind: StreamKind) => keys.filter((k) => k.kind === kind).map((k) => k.id);
  const [athletes, guardians, inquiries, orgs] = await Promise.all([
    ids("ATHLETE").length
      ? prisma.athlete.findMany({ where: { AND: [whereFor(actor, "athleteApplication", "read"), { id: { in: ids("ATHLETE") } }] }, select: LIST_ATHLETE })
      : [],
    ids("GUARDIAN").length
      ? prisma.guardian.findMany({ where: { AND: [whereFor(actor, "guardian", "read"), { id: { in: ids("GUARDIAN") } }] }, select: LIST_GUARDIAN })
      : [],
    ids("SPONSOR").length
      ? prisma.inquiry.findMany({ where: { AND: [whereFor(actor, "inquiry", "read"), { id: { in: ids("SPONSOR") } }] }, select: INQUIRY_SELECT })
      : [],
    ids("ORGANIZATION").length
      ? prisma.propertyOnboarding.findMany({ where: { AND: [whereFor(actor, "propertyOnboarding", "read"), { id: { in: ids("ORGANIZATION") } }] }, select: ONBOARDING_SELECT })
      : [],
  ]);

  const byId = new Map<string, StreamRow>();
  for (const a of athletes) {
    const r = athleteRow(a);
    byId.set(`ATHLETE:${a.id}`, { kind: "ATHLETE", id: r.id, name: r.name, sub: r.sub, signedUpAt: r.signedUpAt, state: r.state, reasons: r.reasons, flags: r.flags, problems: r.problems });
  }
  for (const g of guardians) {
    const r = guardianRow(g);
    byId.set(`GUARDIAN:${g.id}`, { kind: "GUARDIAN", id: r.id, name: r.name, sub: r.sub, signedUpAt: r.signedUpAt, state: r.state, reasons: [], flags: [], problems: [] });
  }
  for (const i of inquiries) {
    const s = sponsorSummary(i);
    const fresh = s.state === "NEW";
    const note = i.decisionNote?.trim();
    const [state, reasons]: [StreamState, string[]] =
      fresh ? (s.reviewReasons.length ? ["NEEDS_REVIEW", s.reviewReasons] : ["WAITING", sponsorWaitingFor(i)])
      : s.state === "DECLINED" ? ["DECLINED", [note || "Declined by BTG"]]
      : s.state === "REJECTED" ? ["REJECTED", [note || "Rejected by BTG — logins off"]]
      : [s.autoApproved ? "AUTO_APPROVED" : "APPROVED", []];
    byId.set(`SPONSOR:${i.id}`, {
      kind: "SPONSOR", id: s.id, name: s.businessName, sub: s.contactName,
      signedUpAt: fresh ? s.createdAt : s.decidedAt ?? s.createdAt,
      state, reasons, flags: [], problems: s.problems,
    });
  }
  for (const o of orgs) {
    const r = organizationRow(o);
    /* With the applicant: sent back for changes, or never submitted. signupStateOf doesn't know these (its desk never listed them). */
    const notes = o.reviewNotes?.trim();
    const waiting: string[] | null =
      o.state === "CHANGES_REQUESTED" ? [notes ? `Asked for changes: ${notes}` : "Asked for changes"]
      : o.state === "DRAFT" ? ["Not submitted yet"]
      : null;
    /* The organisation desk's "approved" covers BTG's hand approvals too; the stream tells them apart. */
    const state: StreamState = waiting ? "WAITING" : r.state === "AUTO_APPROVED" && !r.autoApproved ? "APPROVED" : r.state;
    byId.set(`ORGANIZATION:${o.id}`, {
      kind: "ORGANIZATION", id: r.id, name: r.name, sub: r.sub, signedUpAt: r.signedUpAt, state,
      reasons: waiting ?? r.reasons, flags: [], problems: waiting ? [] : r.problems,
    });
  }
  /* A row that vanished between the key read and this one (deleted, rescoped) is skipped, not invented. */
  return keys.map((k) => byId.get(`${k.kind}:${k.id}`)).filter((r): r is StreamRow => Boolean(r));
}

/** GET /signups/stream — one page of the stream, newest first. */
export async function listSignupStream(actor: Actor, filter: StreamFilter, req: PageRequest): Promise<{ rows: StreamRow[]; page: PageInfo }> {
  const all = sources(actor, filter);
  const counts = await Promise.all(all.map((s) => s.count()));
  const total = counts.reduce((n, c) => n + c, 0);
  const at = clampPage(req, total);
  if (total === 0) return { rows: [], page: pageInfo(at, 0) };
  const need = at.skip + at.take;
  const lists = await Promise.all(all.map((s, i) => (counts[i] ? s.keys(need) : Promise.resolve([] as StreamKey[]))));
  return { rows: await rowsFor(actor, mergeNewest(lists, at.skip, at.take)), page: pageInfo(at, total) };
}

/* ─────────────────────────────── summary ────────────────────────────── */

export type KindSummary = { total: number; held: number; auto: number };

/** GET /signups/stream/summary — the hero's and the chips' figures, per kind. */
export async function signupStreamSummary(actor: Actor): Promise<{ kinds: Partial<Record<StreamKind, KindSummary>>; all: KindSummary }> {
  const kinds = kindsFor(actor);
  const none = { review: false } as StreamFilter;
  const held = { review: true } as StreamFilter;
  const sum = (ns: number[]) => ns.reduce((n, c) => n + c, 0);

  const per = await Promise.all(kinds.map(async (kind): Promise<[StreamKind, KindSummary]> => {
    if (kind === "ATHLETE") {
      const [total, h, auto] = await Promise.all([
        prisma.athlete.count({ where: athleteWhere(actor, none) /* tenant-scope: athleteWhere starts with whereFor */ }),
        prisma.athlete.count({ where: athleteWhere(actor, held) /* tenant-scope: athleteWhere starts with whereFor */ }),
        prisma.athlete.count({
          where: { AND: [athleteWhere(actor, none), { autoApproved: true, signupRejectedAt: null, NOT: [{ state: "REJECTED" }, ATHLETE_NEEDS_REVIEW] }] }, /* tenant-scope: athleteWhere starts with whereFor */
        }),
      ]);
      return [kind, { total, held: h, auto }];
    }
    if (kind === "GUARDIAN") {
      const [v, r, auto] = await Promise.all([
        prisma.guardian.count({ where: guardianWhere(actor, none, true) /* tenant-scope: guardianWhere starts with whereFor */ }),
        prisma.guardian.count({ where: guardianWhere(actor, none, false) /* tenant-scope: guardianWhere starts with whereFor */ }),
        prisma.guardian.count({ where: { AND: [guardianWhere(actor, none, true), { autoVerified: true, rejectedAt: null }] } /* tenant-scope: guardianWhere starts with whereFor */ }),
      ]);
      return [kind, { total: v + r, held: 0, auto }];
    }
    if (kind === "SPONSOR") {
      const [decided, h, waiting, auto] = await Promise.all([
        prisma.inquiry.count({ where: inquiryWhere(actor, none, "decided") /* tenant-scope: inquiryWhere starts with whereFor */ }),
        prisma.inquiry.count({ where: inquiryWhere(actor, none, "held") /* tenant-scope: inquiryWhere starts with whereFor */ }),
        prisma.inquiry.count({ where: inquiryWhere(actor, none, "waiting") /* tenant-scope: inquiryWhere starts with whereFor */ }),
        prisma.inquiry.count({ where: { AND: [inquiryWhere(actor, none, "decided"), { state: "APPROVED", autoApproved: true }] } /* tenant-scope: inquiryWhere starts with whereFor */ }),
      ]);
      return [kind, { total: decided + h + waiting, held: h, auto }];
    }
    const [submitted, drafts, h, auto] = await Promise.all([
      prisma.propertyOnboarding.count({ where: organizationWhere(actor, none) /* tenant-scope: organizationWhere starts with whereFor */ }),
      prisma.propertyOnboarding.count({ where: organizationWhere(actor, none, true) /* tenant-scope: organizationWhere starts with whereFor */ }),
      prisma.propertyOnboarding.count({ where: organizationWhere(actor, held) /* tenant-scope: organizationWhere starts with whereFor */ }),
      prisma.propertyOnboarding.count({
        where: { AND: [organizationWhere(actor, none), { state: "APPROVED", flags: { isEmpty: true }, autoApproved: true }] }, /* tenant-scope: organizationWhere starts with whereFor */
      }),
    ]);
    return [kind, { total: submitted + drafts, held: h, auto }];
  }));

  const out = Object.fromEntries(per) as Partial<Record<StreamKind, KindSummary>>;
  return {
    kinds: out,
    all: { total: sum(per.map(([, s]) => s.total)), held: sum(per.map(([, s]) => s.held)), auto: sum(per.map(([, s]) => s.auto)) },
  };
}

/**
 * POL-BE-15 — the Operations Board's sign-ups card: every sign-up held for a
 * person (the page's "Needs review", the same `held` figure as
 * signupStreamSummary) and since when the oldest has waited. Null where
 * /signups would refuse. A held sponsor is also a sponsor request, and a
 * waiting organisation also an onboarding — the board must not add them up.
 */
export async function signupsHeld(actor: Actor): Promise<{ waiting: number; oldestSince: string | null } | null> {
  if (!tenantWide(actor, "athleteApplication", "approve") || !tenantWide(actor, "guardian", "write")) return null;
  const kinds = kindsFor(actor);
  const held = { review: true } as StreamFilter;
  const none = Promise.resolve([0, null] as const);
  const [athletes, sponsors, orgs] = await Promise.all([
    Promise.all([
      prisma.athlete.count({ where: athleteWhere(actor, held) /* tenant-scope: athleteWhere starts with whereFor */ }),
      prisma.athlete.findFirst({ where: athleteWhere(actor, held) /* tenant-scope: athleteWhere starts with whereFor */, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt ?? null),
    ]),
    kinds.includes("SPONSOR")
      ? Promise.all([
          prisma.inquiry.count({ where: inquiryWhere(actor, held, "held") /* tenant-scope: inquiryWhere starts with whereFor */ }),
          prisma.inquiry.findFirst({ where: inquiryWhere(actor, held, "held") /* tenant-scope: inquiryWhere starts with whereFor */, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt ?? null),
        ])
      : none,
    kinds.includes("ORGANIZATION")
      ? Promise.all([
          prisma.propertyOnboarding.count({ where: organizationWhere(actor, held) /* tenant-scope: organizationWhere starts with whereFor */ }),
          prisma.propertyOnboarding.findFirst({ where: organizationWhere(actor, held) /* tenant-scope: organizationWhere starts with whereFor */, orderBy: { createdAt: "asc" }, select: { submittedAt: true, createdAt: true } }).then((r) => (r ? r.submittedAt ?? r.createdAt : null)),
        ])
      : none,
  ]);
  const dates = [athletes[1], sponsors[1], orgs[1]].filter((d): d is Date => d !== null);
  const oldest = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  return { waiting: athletes[0] + sponsors[0] + orgs[0], oldestSince: oldest?.toISOString() ?? null };
}
