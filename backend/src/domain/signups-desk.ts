/**
 * BTG's New sign-ups desk, for athletes and guardians — 2S1-BE-09, -10
 * (the screens are 2S1-FE-07, /admin/new-signups).
 *
 * Every automatic approval emails BTG's admins a link here. The desk shows
 * what the system approved and what it held, each with its checks, its
 * documents behind five-minute audited links, and its activity; and BTG's
 * three acts:
 *
 *   - APPROVE a held sign-up (a likely duplicate, the staff-confirmation
 *     setting) — the same steps the system takes, with BTG's name on them.
 *   - REJECT, with a reason that is emailed. After approval it withdraws the
 *     athlete's access (logins off, ACTIVE → SUSPENDED), ends their listings
 *     and holds their payouts (payout-holds.ts). Before approval it is the
 *     application desk's terminal rejection. REJECTING A GUARDIAN rejects
 *     every athlete they look after with them; rejecting an athlete leaves
 *     the guardian and their other athletes alone.
 *   - REINSTATE undoes exactly what a Reject did — logins back on, ACTIVE
 *     again, payouts BTG approved before it sent — and a guardian's Reinstate
 *     brings back the athletes their rejection took. Ended listings stay
 *     ended (the seller relists).
 *
 * 2S1-BE-13 — every Reject records an AccountClosure (account-closure.ts
 * `recordClosureIn`): the files go on the 30-day purge, and the rejected
 * account can ask BTG to come back from the reactivation page. A login a
 * self-closure had switched off is taken over (REJECT_TAKES_LOGINS), so a
 * self-closed account BTG then rejects can no longer reactivate itself.
 * Reinstate calls `reopenClosureIn`.
 *
 * Organisations (2S1-BE-06) and sponsors (2S1-BE-17) have their own
 * records; this file is athletes and guardians only.
 *
 * Only BTG reaches any of it: every function asks for the tenant-wide cell
 * (assertTenantWide), so an athlete's `own` reach on their application, or
 * a guardian's on their own record, never opens a document link.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { athleteNotificationKey, send } from "../lib/email";
import { presignPrivateDownload, SENSITIVE_DOCUMENT_TTL_SECONDS } from "../lib/storage";
import { transitionAthleteIn } from "./athlete";
import { recordClosureIn, reopenClosureIn, REJECT_TAKES_LOGINS } from "./account-closure";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { AthleteState } from "./athlete-state";
import { requiresGuardian } from "./guardian-rules";
import { contentTrustOf } from "./content-trust";
import {
  ATHLETE_SELECT, appUrl, approveSignupIn, evaluateAthleteSignup, firstNameOf, guardianAgreed, signupFacts, SignupError, type SignupAthlete,
} from "./athlete-signup";
import { checksPassed, DOCUMENT_WORDS, idKindFor, PROOF_WORDS, signupFlags, signupMissing, type AccountDocumentKind, type GuardianProofKind } from "./signup-rules";

type Tx = Prisma.TransactionClient;

export type SignupState = "AUTO_APPROVED" | "APPROVED" | "NEEDS_REVIEW" | "REJECTED";
export type SignupKind = "ATHLETE" | "GUARDIAN";

const APPROVED_STATES: readonly AthleteState[] = ["APPROVED", "ACTIVE", "SUSPENDED"];
const LIVE_LISTING = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED"] as const;

function ageOf(birthDate: Date | null, now = new Date()): number | null {
  if (!birthDate) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

const placeOf = (a: { stateCode: string | null; countryCode: string }) => [a.stateCode, a.countryCode].filter(Boolean).join(", ");

function athleteState(a: { state: string; reviewReasons: string[]; signupRejectedAt: Date | null; autoApproved: boolean }): SignupState {
  if (a.signupRejectedAt || a.state === "REJECTED") return "REJECTED";
  if (a.reviewReasons.length && (a.state === "SUBMITTED" || a.state === "UNDER_REVIEW")) return "NEEDS_REVIEW";
  return a.autoApproved ? "AUTO_APPROVED" : "APPROVED";
}

function guardianState(g: { rejectedAt: Date | null; autoVerified: boolean }): SignupState {
  if (g.rejectedAt) return "REJECTED";
  return g.autoVerified ? "AUTO_APPROVED" : "APPROVED";
}

const LIST_ATHLETE = {
  id: true, legalName: true, displayName: true, sport: true, school: true, state: true, birthDate: true, majorityAge: true, majorityKnown: true,
  countryCode: true, stateCode: true, reviewReasons: true, autoApproved: true, signupRejectedAt: true, createdAt: true, reviewedAt: true,
  guardian: { select: { legalName: true } }, property: { select: { name: true } },
} as const;

/** What a row on the desk is. */
function athleteRow(a: Prisma.AthleteGetPayload<{ select: typeof LIST_ATHLETE }>) {
  const age = ageOf(a.birthDate);
  const minor = requiresGuardian(a);
  const team = a.property?.name ?? a.school;
  return {
    id: a.id, kind: "ATHLETE" as SignupKind, name: a.legalName || a.displayName,
    sub: [a.sport, team, age !== null ? String(age) : null, minor && a.guardian ? `guardian ${a.guardian.legalName}` : null].filter(Boolean).join(" · "),
    signedUpAt: a.createdAt, state: athleteState(a), reasons: a.reviewReasons, flags: signupFlags(a),
  };
}

/**
 * The desk's list: every athlete the system approved or held, everyone BTG
 * rejected, and anyone in a place the age table doesn't know; and every
 * guardian approved or rejected. Newest first, with the counts the tabs show.
 */
export async function listSignups(actor: Actor) {
  assertTenantWide(actor, "athleteApplication", "approve");
  assertTenantWide(actor, "guardian", "write");
  const [athletes, guardians] = await Promise.all([
    prisma.athlete.findMany({
      where: {
        AND: [
          whereFor(actor, "athleteApplication", "read"),
          {
            OR: [
              { autoApproved: true }, { reviewReasons: { isEmpty: false } }, { signupRejectedAt: { not: null } }, { majorityKnown: false },
              { emailConfirmedAt: { not: null }, state: { in: [...APPROVED_STATES] } },
            ],
          },
        ],
      },
      select: LIST_ATHLETE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
    }),
    prisma.guardian.findMany({
      where: { AND: [whereFor(actor, "guardian", "read"), { OR: [{ verifiedAt: { not: null } }, { rejectedAt: { not: null } }] }] },
      select: {
        id: true, legalName: true, verifiedAt: true, rejectedAt: true, autoVerified: true,
        wards: { select: { legalName: true, displayName: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ verifiedAt: "desc" }, { id: "desc" }], take: 200,
    }),
  ]);
  const rows = [
    ...athletes.map(athleteRow),
    ...guardians.map((g) => ({
      id: g.id, kind: "GUARDIAN" as SignupKind, name: g.legalName,
      sub: g.wards.length
        ? `Guardian of ${g.wards[0]!.legalName || g.wards[0]!.displayName}${g.wards.length > 1 ? ` and ${g.wards.length - 1} more` : ""}`
        : "Guardian",
      signedUpAt: g.verifiedAt ?? g.rejectedAt!, state: guardianState(g), reasons: [] as string[], flags: [] as string[],
    })),
  ].sort((x, y) => y.signedUpAt.getTime() - x.signedUpAt.getTime());
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  return {
    signups: rows,
    counts: {
      all: rows.length,
      athletes: count((r) => r.kind === "ATHLETE"),
      guardians: count((r) => r.kind === "GUARDIAN"),
      review: count((r) => r.state === "NEEDS_REVIEW" || r.flags.length > 0),
    },
  };
}

/* ═══════════════════════ one sign-up ══════════════════════════════════ */

const ACTIVITY: Record<string, string> = {
  "athlete.apply": "Signed up",
  "athlete.submit": "Application submitted",
  "athlete.emailConfirmed": "Email confirmed",
  "guardian.link": "Named a guardian",
  "athlete.needsReview": "Held for BTG’s review",
  "athlete.autoApprove": "Approved automatically",
  "athlete.signupApprove": "Approved by BTG",
  "athlete.signupReject": "Rejected by BTG",
  "athlete.signupReinstate": "Reinstated by BTG",
  "athlete.reject": "Application rejected",
  "athlete.requestChanges": "Changes requested",
  "comingOfAge.start": "Reached the age of majority · 90 days to upload a government ID",
  "comingOfAge.complete": "Uploaded a government ID · took over their account",
  "comingOfAge.terminate": "90 days passed without a government ID · account ended",
  "guardian.emailConfirmed": "Opened the set-up link · email confirmed",
  "guardian.detailsUpdate": "Details saved",
  "guardian.autoVerify": "Approved automatically",
  "guardian.verify": "Approved by BTG",
  "guardian.signupReject": "Rejected by BTG",
  "guardian.signupReinstate": "Reinstated by BTG",
};

async function activityOf(tenantId: string, entity: "Athlete" | "Guardian", id: string, docs: { kind: string; uploadedAt: Date | null }[]) {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, entity, entityId: id, action: { in: Object.keys(ACTIVITY) } },
    select: { action: true, at: true, after: true }, orderBy: { at: "asc" }, take: 100,
  });
  const items = rows.map((r) => {
    const after = (r.after ?? {}) as Record<string, unknown>;
    const extra = r.action === "athlete.needsReview" && Array.isArray(after.reasons) ? `: ${(after.reasons as string[]).join(" · ")}`
      : (r.action.endsWith(".signupReject")) && typeof after.note === "string" ? `: ${after.note}` : "";
    return { at: r.at, text: `${ACTIVITY[r.action]}${extra}` };
  });
  for (const d of docs) if (d.uploadedAt) items.push({ at: d.uploadedAt, text: `${DOCUMENT_WORDS[d.kind as AccountDocumentKind] ?? "Document"} uploaded` });
  return items.sort((x, y) => x.at.getTime() - y.at.getTime());
}

const DOC_VIEW = { id: true, kind: true, proofKind: true, wardId: true, filename: true, uploadedAt: true } as const;
const day = (d: Date) => d.toISOString().slice(0, 10);

function docItem(d: { id: string; kind: string; proofKind: string | null; filename: string; uploadedAt: Date | null }, forWhom?: string) {
  const word = d.kind === "GUARDIANSHIP_PROOF" && d.proofKind ? PROOF_WORDS[d.proofKind as GuardianProofKind] : DOCUMENT_WORDS[d.kind as AccountDocumentKind];
  return { id: d.id, name: word ?? "Document", sub: `${forWhom ? `For ${forWhom} · ` : ""}${d.filename} · uploaded ${d.uploadedAt ? day(d.uploadedAt) : "—"}`, viewable: true };
}

async function athleteFor(actor: Actor, id: string, action: "read" | "approve" = "read"): Promise<SignupAthlete & { school: string | null; sport: string; reviewedAt: Date | null; signupRejectNote: string | null; signupRejectedVia: string | null }> {
  const a = await prisma.athlete.findFirst({
    where: { ...whereFor(actor, "athleteApplication", action), id },
    select: { ...ATHLETE_SELECT, school: true, reviewedAt: true, signupRejectNote: true, signupRejectedVia: true },
  });
  if (!a) throw new ForbiddenError("athleteApplication", action);
  return a;
}

/** One athlete as the desk shows them. */
export async function getAthleteSignup(actor: Actor, id: string) {
  assertTenantWide(actor, "athleteApplication", "approve");
  const a = await athleteFor(actor, id);
  const [facts, docs, approval, contentTrust] = await Promise.all([
    signupFacts(prisma, a),
    prisma.accountDocument.findMany({ where: { tenantId: a.tenantId, athleteId: a.id, uploadedAt: { not: null } }, select: DOC_VIEW, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findFirst({
      where: { tenantId: a.tenantId, entity: "Athlete", entityId: a.id, action: { in: ["athlete.autoApprove", "athlete.signupApprove", "athlete.approve"] } },
      select: { at: true }, orderBy: { at: "desc" },
    }),
    /* P5-BE-10 — BTG only (this read is): do their drafts skip BTG's review? */
    contentTrustOf(prisma, a.tenantId, a.id),
  ]);
  const age = ageOf(a.birthDate);
  const minor = facts.minor;
  const agreedAt = a.guardian ? await guardianAgreed(prisma, a.tenantId, a.id, a.guardian.id) : null;
  const state = athleteState(a);
  return {
    id: a.id, kind: "ATHLETE" as SignupKind, name: a.legalName || a.displayName, state,
    reasons: a.reviewReasons, flags: signupFlags(a), signedUpAt: a.createdAt,
    approvedAt: APPROVED_STATES.includes(a.state as AthleteState) ? approval?.at ?? a.reviewedAt : null,
    details: [
      { label: "Sport", value: a.sport },
      ...(a.school ? [{ label: "Team or school", value: a.school }] : []),
      { label: "Age", value: age === null ? "No date of birth" : `${age} · ${minor ? "a minor" : "an adult"}` },
      { label: "Place", value: a.majorityKnown ? `${placeOf(a)} · adult at ${a.majorityAge}` : `${placeOf(a)} · not in the age table (counted as 18)` },
      ...(a.guardian ? [{ label: "Guardian", value: `${a.guardian.legalName}${a.guardian.verifiedAt ? ` · approved ${day(a.guardian.verifiedAt)}` : " · not approved yet"}` }] : []),
      { label: "Email", value: a.emailConfirmedAt ? "Confirmed" : "Not confirmed yet" },
    ],
    checks: state === "AUTO_APPROVED" || state === "APPROVED"
      ? checksPassed({ minor, majorityAge: a.majorityAge, place: placeOf(a), majorityKnown: a.majorityKnown, guardianName: a.guardian?.legalName ?? null, idKind: idKindFor(minor) })
      : [],
    missing: state === "NEEDS_REVIEW" ? signupMissing(facts) : [],
    documents: [
      ...docs.map((d) => docItem(d)),
      ...(agreedAt && a.guardian ? [{ id: "guardian-agreement", name: "Guardian agreement", sub: `Accepted by ${a.guardian.legalName} · ${day(agreedAt)}`, viewable: false }] : []),
    ],
    activity: await activityOf(a.tenantId, "Athlete", a.id, docs),
    guardian: a.guardian ? { id: a.guardian.id, name: a.guardian.legalName, rejected: Boolean(a.guardian.rejectedAt) } : null,
    guardianOf: [],
    rejectNote: a.signupRejectNote,
    rejectedWithGuardian: a.signupRejectedVia === "GUARDIAN",
    contentTrust,
    can: {
      approve: state === "NEEDS_REVIEW",
      reject: state !== "REJECTED",
      reinstate: Boolean(a.signupRejectedAt) && !(a.signupRejectedVia === "GUARDIAN" && a.guardian?.rejectedAt),
    },
  };
}

async function guardianFor(actor: Actor, id: string) {
  const g = await prisma.guardian.findFirst({
    where: { ...whereFor(actor, "guardian", "write"), id },
    select: {
      id: true, tenantId: true, legalName: true, email: true, phone: true, relationship: true, emailConfirmedAt: true, verifiedAt: true,
      autoVerified: true, rejectedAt: true, rejectNote: true,
      wards: { select: { ...LIST_ATHLETE, signupRejectedVia: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!g) throw new ForbiddenError("guardian", "write");
  return g;
}

/** One guardian: their details, their documents, the athletes they look after. */
export async function getGuardianSignup(actor: Actor, id: string) {
  assertTenantWide(actor, "guardian", "write");
  const g = await guardianFor(actor, id);
  const docs = await prisma.accountDocument.findMany({ where: { tenantId: g.tenantId, guardianId: g.id, uploadedAt: { not: null } }, select: DOC_VIEW, orderBy: { createdAt: "asc" } });
  const agreements = await prisma.agreementAcceptance.findMany({
    where: { tenantId: g.tenantId, guardianId: g.id, agreement: { is: { kind: "GUARDIAN" } }, athleteId: { in: g.wards.map((w) => w.id) } },
    select: { athleteId: true, acceptedAt: true },
  });
  const proof = docs.filter((d) => d.kind === "GUARDIANSHIP_PROOF").at(-1);
  const nameOf = (athleteId: string | null) => g.wards.find((w) => w.id === athleteId);
  /* 2S1-BE-10 — proof is per child: say which child each one names. */
  const wardName = (athleteId: string | null) => { const w = nameOf(athleteId); return w ? w.legalName || w.displayName : undefined; };
  return {
    id: g.id, kind: "GUARDIAN" as SignupKind, name: g.legalName, state: guardianState(g), reasons: [] as string[], flags: [] as string[],
    signedUpAt: g.verifiedAt ?? g.rejectedAt, approvedAt: g.verifiedAt,
    details: [
      { label: "Relationship", value: g.relationship },
      { label: "Phone", value: g.phone ?? "Not given" },
      { label: "Email", value: g.emailConfirmedAt ? "Confirmed by opening the set-up link" : "Not confirmed yet" },
    ],
    checks: g.verifiedAt
      ? [
          "Email confirmed by opening the set-up link",
          ...(docs.some((d) => d.kind === "GUARDIAN_ID") ? ["Government ID uploaded"] : []),
          ...(proof ? [`Proof of guardianship uploaded: ${(PROOF_WORDS[proof.proofKind as GuardianProofKind] ?? "a document").toLowerCase()}`] : []),
          ...(agreements.length ? ["Guardian agreement accepted"] : []),
        ]
      : [],
    missing: [] as string[],
    documents: [
      ...docs.map((d) => docItem(d, d.kind === "GUARDIANSHIP_PROOF" ? wardName(d.wardId) : undefined)),
      ...agreements.map((x) => {
        const w = nameOf(x.athleteId);
        return { id: `agreement-${x.athleteId}`, name: "Guardian agreement", sub: `For ${w?.legalName || w?.displayName || "an athlete"} · accepted ${day(x.acceptedAt)}`, viewable: false };
      }),
    ],
    activity: await activityOf(g.tenantId, "Guardian", g.id, docs),
    guardian: null,
    guardianOf: g.wards.map((w) => ({ ...athleteRow(w), rejectedWithGuardian: w.signupRejectedVia === "GUARDIAN" })),
    rejectNote: g.rejectNote,
    rejectedWithGuardian: false,
    can: { approve: false, reject: !g.rejectedAt, reinstate: Boolean(g.rejectedAt) },
  };
}

/** BTG reads one identity document through a five-minute, audited link. */
export async function viewSignupDocument(actor: Actor, owner: "athletes" | "guardians", ownerId: string, documentId: string) {
  let tenantId: string;
  if (owner === "athletes") {
    assertTenantWide(actor, "athleteApplication", "approve");
    tenantId = (await athleteFor(actor, ownerId)).tenantId;
  } else {
    assertTenantWide(actor, "guardian", "write");
    tenantId = (await guardianFor(actor, ownerId)).tenantId;
  }
  const doc = await prisma.accountDocument.findFirst({
    where: { tenantId, id: documentId, ...(owner === "athletes" ? { athleteId: ownerId } : { guardianId: ownerId }) },
    select: { id: true, r2Key: true, uploadedAt: true },
  });
  if (!doc) throw new ForbiddenError(owner === "athletes" ? "athleteApplication" : "guardian", "read");
  if (!doc.uploadedAt) throw new SignupError("That document never finished uploading.");
  const url = await presignPrivateDownload(actor, doc.r2Key, { entity: "AccountDocument", entityId: doc.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}

/* ═══════════════════════ BTG's acts ══════════════════════════════════ */

/** Approve a sign-up the system held: the same steps it would have taken, by BTG. */
export async function approveHeldAthlete(actor: Actor, id: string) {
  assertTenantWide(actor, "athleteApplication", "approve");
  await prisma.$transaction(async (tx) => {
    const a = await tx.athlete.findFirst({ where: { ...whereFor(actor, "athleteApplication", "approve"), id }, select: ATHLETE_SELECT });
    if (!a) throw new ForbiddenError("athleteApplication", "approve");
    if (a.signupRejectedAt || !(a.state === "SUBMITTED" || a.state === "UNDER_REVIEW")) {
      throw new SignupError(`This sign-up is ${a.signupRejectedAt ? "rejected" : a.state.toLowerCase()} — there is nothing to approve.`);
    }
    const facts = await signupFacts(tx, a);
    const missing = signupMissing(facts);
    if (missing.length) throw new SignupError(`It's still waiting on the applicant: ${missing.join("; ")}.`);
    if (facts.minor && facts.guardian?.rejected) throw new SignupError("Their guardian is rejected — reinstate the guardian first, or reject this athlete.");
    await approveSignupIn(tx, a, actor);
  });
  return getAthleteSignup(actor, id);
}

/** After approval: access withdrawn, listings ended, payouts held (payout-holds.ts), the reason emailed. */
async function withdrawAthleteIn(tx: Tx, actor: Actor, a: { id: string; tenantId: string; state: string; email: string | null; legalName: string; displayName: string }, note: string, via: "ATHLETE" | "GUARDIAN") {
  if (a.state === "ACTIVE") await transitionAthleteIn(tx, actor, a.id, "SUSPENDED");
  await tx.athlete.update({
    /* tenant-scope: loaded by the caller through whereFor. */
    where: { id: a.id }, data: { signupRejectedAt: new Date(), signupRejectNote: note, signupRejectedBy: actor.userId, signupRejectedVia: via }, select: { id: true },
  });
  const logins = await tx.user.findMany({
    /* tenant-scope: the athlete's own logins, in their tenant. */
    where: { tenantId: a.tenantId, athleteId: a.id, ...REJECT_TAKES_LOGINS }, select: { id: true },
  });
  const off = await tx.user.updateMany({
    /* tenant-scope: the logins found just above, in the athlete's tenant. */
    where: { tenantId: a.tenantId, id: { in: logins.map((u) => u.id) } },
    data: { disabledAt: new Date(), disabledReason: `signupReject:athlete:${a.id}` },
  });
  await closeRejectedAthleteIn(tx, actor, a, note, logins.map((u) => u.id));
  const ended = await tx.listing.updateMany({
    /* tenant-scope: the athlete's own listings — sold by them, or of their items — in their tenant. */
    where: { tenantId: a.tenantId, state: { in: [...LIVE_LISTING] }, OR: [{ sellerAthleteId: a.id }, { item: { is: { athleteId: a.id } } }] },
    data: { state: "ARCHIVED" },
  });
  await audit(tx, actor, "athlete.signupReject", "Athlete", a.id, {
    before: { state: a.state }, after: { note, via, loginsSwitchedOff: off.count, listingsEnded: ended.count, suspendedByReject: a.state === "ACTIVE" },
  });
  if (a.email) {
    await send(tx, a.tenantId, {
      template: "athlete.accountRejected", to: a.email, idempotencyKey: `athlete.accountRejected:${a.id}:${Date.now()}`,
      data: { firstName: firstNameOf(a.legalName, a.displayName), note, supportUrl: `${appUrl()}/contact`, supportEmail: env.SUPPORT_EMAIL },
    });
  }
}

/** 2S1-BE-13 — the rejected athlete's closure: files kept 30 days, then purged; they can ask BTG to come back. */
async function closeRejectedAthleteIn(tx: Tx, actor: Actor, a: { id: string; email: string | null; legalName: string; displayName: string }, note: string, userIds: string[]) {
  await recordClosureIn(tx, actor, {
    subjectKind: "ATHLETE", subjectId: a.id, cause: "REJECTED", reason: note, userIds,
    contactEmail: a.email ?? "", displayName: firstNameOf(a.legalName, a.displayName),
  });
}

/** Reject an athlete. Their guardian, and the guardian's other athletes, are untouched. */
export async function rejectAthleteSignup(actor: Actor, id: string, rawNote: string) {
  assertTenantWide(actor, "athleteApplication", "approve");
  const note = rawNote.trim();
  if (!note) throw new SignupError("Rejecting needs a reason — the athlete is emailed it.", 422);
  await prisma.$transaction(async (tx) => {
    const a = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athleteApplication", "approve"), id },
      select: { ...ATHLETE_SELECT },
    });
    if (!a) throw new ForbiddenError("athleteApplication", "approve");
    if (a.signupRejectedAt || a.state === "REJECTED") throw new SignupError("This athlete is already rejected.");
    if (!APPROVED_STATES.includes(a.state as AthleteState)) {
      /* Not approved yet: the application desk's own terminal rejection. */
      if (a.state === "SUBMITTED") await transitionAthleteIn(tx, actor, a.id, "UNDER_REVIEW");
      await transitionAthleteIn(tx, actor, a.id, "REJECTED", note);
      await audit(tx, actor, "athlete.signupReject", "Athlete", a.id, { before: { state: a.state }, after: { note, via: "ATHLETE", beforeApproval: true } });
      /* Their ID documents are on the 30-day purge too. */
      await closeRejectedAthleteIn(tx, actor, a, note, []);
      if (a.email) {
        await send(tx, a.tenantId, {
          template: "athlete.rejected", to: a.email, idempotencyKey: athleteNotificationKey("athlete.rejected", a.id, "REJECTED"),
          data: { firstName: firstNameOf(a.legalName, a.displayName), portalUrl: `${appUrl()}/athlete`, reviewerNotes: note },
        });
      }
      return;
    }
    await withdrawAthleteIn(tx, actor, a, note, "ATHLETE");
    /* A minor's guardian hears of it too — they act for the account. */
    if (a.guardian && requiresGuardian(a)) {
      await send(tx, a.tenantId, {
        template: "athlete.accountRejected", to: a.guardian.email, idempotencyKey: `athlete.accountRejected:${a.id}:guardian:${Date.now()}`,
        data: { firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", note, supportUrl: `${appUrl()}/contact`, supportEmail: env.SUPPORT_EMAIL },
      });
    }
  });
  return getAthleteSignup(actor, id);
}

/** Undo what a rejection after approval did: logins back on, ACTIVE again. */
async function restoreAthleteIn(tx: Tx, actor: Actor, a: { id: string; tenantId: string; state: string; email: string | null; legalName: string; displayName: string }) {
  /* Back to ACTIVE only if it was this rejection that suspended them — never lifting a suspension it didn't make. */
  const last = await tx.auditLog.findFirst({
    where: { tenantId: a.tenantId, entity: "Athlete", entityId: a.id, action: "athlete.signupReject" }, select: { after: true }, orderBy: { at: "desc" },
  });
  const wasSuspended = a.state === "SUSPENDED" && (last?.after as { suspendedByReject?: boolean } | null)?.suspendedByReject === true;
  await tx.athlete.update({
    /* tenant-scope: loaded by the caller through whereFor. */
    where: { id: a.id }, data: { signupRejectedAt: null, signupRejectNote: null, signupRejectedBy: null, signupRejectedVia: null }, select: { id: true },
  });
  if (wasSuspended) await transitionAthleteIn(tx, actor, a.id, "ACTIVE");
  const on = await tx.user.updateMany({
    /* tenant-scope: the logins this rejection switched off, in the athlete's tenant. */
    where: { tenantId: a.tenantId, athleteId: a.id, disabledReason: `signupReject:athlete:${a.id}` },
    data: { disabledAt: null, disabledReason: null },
  });
  /* Payouts BTG approved before the Reject waited, held (payouts.ts sendPayout); they go now. */
  const waiting = await tx.payout.findMany({
    /* tenant-scope: the athlete's own payouts, named by their payee key (their tenant, type and id). */
    where: { payeeTenantId: a.tenantId, payeeType: "ATHLETE", payeeId: a.id, state: "APPROVED" }, select: { id: true, tenantId: true },
  });
  for (const p of waiting) await enqueue(tx, p.tenantId, "payouts.send", { payoutId: p.id });
  /* 2S1-BE-13 — back inside the 30 days: the closure ends and nothing is deleted. */
  await reopenClosureIn(tx, actor, "ATHLETE", a.id);
  await audit(tx, actor, "athlete.signupReinstate", "Athlete", a.id, { before: { state: a.state }, after: { loginsSwitchedOn: on.count, active: wasSuspended, payoutsResent: waiting.length } });
  if (a.email && APPROVED_STATES.includes(a.state as AthleteState)) {
    await send(tx, a.tenantId, {
      template: "athlete.accountReinstated", to: a.email, idempotencyKey: `athlete.accountReinstated:${a.id}:${Date.now()}`,
      data: { firstName: firstNameOf(a.legalName, a.displayName), portalUrl: `${appUrl()}/athlete` },
    });
  }
}

export async function reinstateAthleteSignup(actor: Actor, id: string) {
  assertTenantWide(actor, "athleteApplication", "approve");
  let recheck = false;
  await prisma.$transaction(async (tx) => {
    const a = await tx.athlete.findFirst({ where: { ...whereFor(actor, "athleteApplication", "approve"), id }, select: { ...ATHLETE_SELECT, signupRejectedVia: true } });
    if (!a) throw new ForbiddenError("athleteApplication", "approve");
    if (!a.signupRejectedAt) {
      throw new SignupError(a.state === "REJECTED" ? "This application was rejected before approval — they can apply again." : "Only a rejected athlete can be reinstated.");
    }
    if (a.signupRejectedVia === "GUARDIAN" && a.guardian?.rejectedAt) throw new SignupError(`Rejected with their guardian — reinstate ${a.guardian.legalName} to bring them back.`);
    await restoreAthleteIn(tx, actor, a);
    recheck = a.state === "SUBMITTED";
  });
  if (recheck) await evaluateAthleteSignup(id);
  return getAthleteSignup(actor, id);
}

/** Reject a guardian — and with them, every athlete they look after. */
export async function rejectGuardianSignup(actor: Actor, id: string, rawNote: string) {
  assertTenantWide(actor, "guardian", "write");
  assertTenantWide(actor, "athleteApplication", "approve");
  const note = rawNote.trim();
  if (!note) throw new SignupError("Rejecting needs a reason — the guardian is emailed it.", 422);
  await prisma.$transaction(async (tx) => {
    const g = await guardianForTx(tx, actor, id);
    if (g.rejectedAt) throw new SignupError("This guardian is already rejected.");
    await tx.guardian.update({
      /* tenant-scope: loaded through whereFor(guardian, write). */
      where: { id: g.id }, data: { rejectedAt: new Date(), rejectNote: note, rejectedBy: actor.userId }, select: { id: true },
    });
    const logins = await tx.user.findMany({
      /* tenant-scope: the guardian's own logins, in their tenant — never a ward's own. */
      where: { tenantId: g.tenantId, guardianId: g.id, athleteId: null, ...REJECT_TAKES_LOGINS }, select: { id: true },
    });
    const off = await tx.user.updateMany({
      /* tenant-scope: the logins found just above, in the guardian's tenant. */
      where: { tenantId: g.tenantId, id: { in: logins.map((u) => u.id) } },
      data: { disabledAt: new Date(), disabledReason: `signupReject:guardian:${g.id}` },
    });
    /* 2S1-BE-13 — the guardian's closure: their ID and proof go on the 30-day purge; they can ask BTG to come back. */
    await recordClosureIn(tx, actor, {
      subjectKind: "GUARDIAN", subjectId: g.id, cause: "REJECTED", reason: note, userIds: logins.map((u) => u.id),
      contactEmail: g.email, displayName: g.legalName.split(/\s+/)[0] ?? g.legalName,
    });
    const taken: string[] = [];
    for (const w of g.wards) {
      if (w.signupRejectedAt || w.state === "REJECTED") continue;
      if (APPROVED_STATES.includes(w.state as AthleteState)) {
        await withdrawAthleteIn(tx, actor, w, `Rejected with their guardian: ${note}`, "GUARDIAN");
      } else {
        /* Not approved yet: held, so the checks can never approve them while the guardian is rejected. */
        await tx.athlete.update({
          /* tenant-scope: the guardian's own ward, loaded with them. */
          where: { id: w.id }, data: { signupRejectedAt: new Date(), signupRejectNote: note, signupRejectedBy: actor.userId, signupRejectedVia: "GUARDIAN" }, select: { id: true },
        });
        await audit(tx, actor, "athlete.signupReject", "Athlete", w.id, { before: { state: w.state }, after: { note, via: "GUARDIAN", beforeApproval: true } });
        await closeRejectedAthleteIn(tx, actor, w, `Rejected with their guardian: ${note}`, []);
      }
      taken.push(w.legalName || w.displayName);
    }
    await audit(tx, actor, "guardian.signupReject", "Guardian", g.id, { after: { note, loginsSwitchedOff: off.count, athletesRejected: taken } });
    await send(tx, g.tenantId, {
      template: "guardian.accountRejected", to: g.email, idempotencyKey: `guardian.accountRejected:${g.id}:${Date.now()}`,
      data: { firstName: g.legalName.split(/\s+/)[0] ?? "", note, athletes: taken.join(", "), supportUrl: `${appUrl()}/contact`, supportEmail: env.SUPPORT_EMAIL },
    });
  });
  return getGuardianSignup(actor, id);
}

async function guardianForTx(tx: Tx, actor: Actor, id: string) {
  const g = await tx.guardian.findFirst({
    where: { ...whereFor(actor, "guardian", "write"), id },
    select: {
      id: true, tenantId: true, legalName: true, email: true, rejectedAt: true,
      wards: {
        select: { id: true, tenantId: true, state: true, email: true, legalName: true, displayName: true, signupRejectedAt: true, signupRejectedVia: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!g) throw new ForbiddenError("guardian", "write");
  return g;
}

/** Reinstate a guardian, and the athletes their rejection took with them. */
export async function reinstateGuardianSignup(actor: Actor, id: string) {
  assertTenantWide(actor, "guardian", "write");
  assertTenantWide(actor, "athleteApplication", "approve");
  const recheck: string[] = [];
  await prisma.$transaction(async (tx) => {
    const g = await guardianForTx(tx, actor, id);
    if (!g.rejectedAt) throw new SignupError("Only a rejected guardian can be reinstated.");
    await tx.guardian.update({
      /* tenant-scope: loaded through whereFor(guardian, write). */
      where: { id: g.id }, data: { rejectedAt: null, rejectNote: null, rejectedBy: null }, select: { id: true },
    });
    const on = await tx.user.updateMany({
      /* tenant-scope: the logins this rejection switched off, in the guardian's tenant. */
      where: { tenantId: g.tenantId, guardianId: g.id, disabledReason: `signupReject:guardian:${g.id}` },
      data: { disabledAt: null, disabledReason: null },
    });
    const back: string[] = [];
    for (const w of g.wards) {
      if (w.signupRejectedVia !== "GUARDIAN" || !w.signupRejectedAt) continue;
      await restoreAthleteIn(tx, actor, w);
      if (w.state === "SUBMITTED") recheck.push(w.id);
      back.push(w.legalName || w.displayName);
    }
    await reopenClosureIn(tx, actor, "GUARDIAN", g.id);
    await audit(tx, actor, "guardian.signupReinstate", "Guardian", g.id, { after: { loginsSwitchedOn: on.count, athletesReinstated: back } });
    await send(tx, g.tenantId, {
      template: "guardian.accountReinstated", to: g.email, idempotencyKey: `guardian.accountReinstated:${g.id}:${Date.now()}`,
      data: { firstName: g.legalName.split(/\s+/)[0] ?? "", athletes: back.join(", "), portalUrl: `${appUrl()}/athlete` },
    });
  });
  for (const w of recheck) await evaluateAthleteSignup(w);
  return getGuardianSignup(actor, id);
}
