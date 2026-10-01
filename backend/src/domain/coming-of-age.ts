/**
 * Coming of age — 2S1-BE-12.
 *
 * When a minor reaches their place's age of majority they have a 90-day
 * ALLOWANCE to become an adult account by uploading a government ID. Until
 * they do, control stays with the guardian (guardian-rules.ts
 * `guardianControls`), and throughout the 90 days:
 *
 *   - neither the athlete nor the guardian can add items or start anything
 *     new (guardian-acts.ts `assertMayCommit` — no new listings, offers or
 *     orders accepted, no new payout requests); orders and campaigns
 *     already under way carry on, deliveries and payouts included;
 *   - a reminder stays on both portals (`myComingOfAge`, read by the athlete
 *     home and settings pages);
 *   - reminder emails go to both at the start and 30, 14, 7 and 1 days
 *     before the end.
 *
 * Uploading a government ID (the coming-of-age page, by signed link) moves
 * control to the athlete — the guardian's link ends and they are told.
 *
 * If the 90 days run out, BOTH accounts are terminated: the athlete's login
 * is switched off and they are suspended, and so is the guardian's — unless
 * the guardian looks after other minors, when only their link to this
 * athlete ends. Listings end; anything under way goes to BTG to settle (BTG
 * is emailed); money already earned stays owed. A terminated account falls
 * under the 30-day retention rule: uploading the government ID within 30
 * days of termination brings it back.
 *
 * `sweepComingOfAge` runs on the worker's hourly timer and does all three —
 * start, remind, terminate — idempotently.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { send } from "../lib/email";
import { issueComingOfAgeToken, readComingOfAgeToken } from "../lib/signup-token";
import { transitionAthleteIn, type SystemActor } from "./athlete";
import { guardianControls } from "./guardian-rules";
import { COMING_OF_AGE_DAYS, comingOfAgeOpen, dayOfMajority, dueReminders, isMinorAt } from "./age-of-majority-rules";
import { finishAccountDocument, startAccountDocument, uploadedKinds } from "./account-documents";
import { appUrl, firstNameOf, SignupError } from "./athlete-signup";

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
/** A terminated account can come back this long after termination (2S1-BE-13's retention). */
export const RETENTION_DAYS = 30;

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const AUTO = (tenantId: string): SystemActor => ({ system: true, tenantId, userId: null, signupChecksPassed: true });

const SELECT = {
  id: true, tenantId: true, state: true, legalName: true, displayName: true, email: true, birthDate: true, ageBand: true,
  majorityAge: true, guardianId: true, comingOfAgeStartedAt: true, comingOfAgeDueAt: true, comingOfAgeReminders: true,
  comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  guardian: { select: { id: true, legalName: true, email: true } },
} as const;
type Row = Prisma.AthleteGetPayload<{ select: typeof SELECT }>;

const linkFor = (athleteId: string) => `${appUrl()}/coming-of-age/${encodeURIComponent(issueComingOfAgeToken(athleteId))}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

async function remind(tx: Tx, a: Row, daysBefore: number, template: "comingOfAge.started" | "comingOfAge.reminder") {
  const first = firstNameOf(a.legalName, a.displayName);
  const due = a.comingOfAgeDueAt!;
  const data = { athleteFirstName: first, age: String(a.majorityAge), dueDate: day(due), daysLeft: String(Math.max(0, Math.ceil((due.getTime() - Date.now()) / DAY))) };
  if (a.email) {
    await send(tx, a.tenantId, {
      template, to: a.email, idempotencyKey: `${template}:${a.id}:${daysBefore}:athlete`,
      data: { ...data, firstName: first, uploadUrl: linkFor(a.id), seat: "athlete" },
    });
  }
  if (a.guardian) {
    await send(tx, a.tenantId, {
      template, to: a.guardian.email, idempotencyKey: `${template}:${a.id}:${daysBefore}:guardian`,
      data: { ...data, firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", portalUrl: `${appUrl()}/athlete/settings/coming-of-age`, seat: "guardian" },
    });
  }
}

/** Open the allowance for one athlete who has come of age with a guardian still in control. */
async function startIn(tx: Tx, a: Row, now: Date) {
  const due = new Date(now.getTime() + COMING_OF_AGE_DAYS * DAY);
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: the athlete just found in its own tenant; only while not started. */
    where: { id: a.id, tenantId: a.tenantId, comingOfAgeStartedAt: null },
    data: { comingOfAgeStartedAt: now, comingOfAgeDueAt: due, comingOfAgeReminders: [90] },
  });
  if (moved.count !== 1) return false;
  await audit(tx, SYSTEM(a.tenantId), "comingOfAge.start", "Athlete", a.id, {
    after: { reachedOn: a.birthDate ? day(dayOfMajority(a.birthDate, a.majorityAge)) : null, age: a.majorityAge, dueAt: due.toISOString() },
  });
  await remind(tx, { ...a, comingOfAgeDueAt: due }, 90, "comingOfAge.started");
  return true;
}

/**
 * The 90 days ran out. The athlete: suspended, login off. The guardian:
 * login off too — unless they look after other minors, when only this link
 * ends. Listings end; BTG settles what is under way; earned money stays owed.
 */
async function terminateIn(tx: Tx, a: Row, now: Date) {
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: the athlete just found in its own tenant; only while the allowance is open. */
    where: { id: a.id, tenantId: a.tenantId, comingOfAgeTerminatedAt: null, comingOfAgeCompletedAt: null },
    data: { comingOfAgeTerminatedAt: now, guardianId: null },
  });
  if (moved.count !== 1) return false;
  if (a.state === "ACTIVE") await transitionAthleteIn(tx, AUTO(a.tenantId), a.id, "SUSPENDED");
  const athleteOff = await tx.user.updateMany({
    /* tenant-scope: the athlete's own logins, in their tenant. */
    where: { tenantId: a.tenantId, athleteId: a.id, disabledAt: null },
    data: { disabledAt: now, disabledReason: `comingOfAge:${a.id}` },
  });
  let guardianOff = 0;
  let otherWards = 0;
  if (a.guardian) {
    const others = await tx.athlete.findMany({
      where: { tenantId: a.tenantId, guardianId: a.guardian.id, id: { not: a.id }, state: { notIn: ["REJECTED"] } },
      select: { ...SELECT },
    });
    otherWards = others.filter((w) => guardianControls(w)).length;
    if (otherWards === 0) {
      guardianOff = (await tx.user.updateMany({
        /* tenant-scope: the guardian's own logins, in the athlete's tenant. */
        where: { tenantId: a.tenantId, guardianId: a.guardian.id, disabledAt: null },
        data: { disabledAt: now, disabledReason: `comingOfAge:${a.id}` },
      })).count;
    }
  }
  const listingsEnded = (await tx.listing.updateMany({
    /* tenant-scope: the athlete's own listings, in their tenant. */
    where: { tenantId: a.tenantId, state: { in: ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED"] }, OR: [{ sellerAthleteId: a.id }, { item: { is: { athleteId: a.id } } }] },
    data: { state: "ARCHIVED" },
  })).count;
  const [openOrders, openMarketplace] = await Promise.all([
    tx.campaignOrder.count({ where: { tenantId: a.tenantId, athleteId: a.id, state: { in: ["SENT", "ACCEPTED", "ACTIVE"] } } }),
    tx.marketplaceOrderLine.count({
      /* tenant-scope: the athlete's own sales — lines naming them as the seller, in the athlete's tenant. */
      where: { itemTenantId: a.tenantId, sellerAthleteId: a.id, order: { is: { state: { notIn: ["CLOSED", "CANCELLED", "REFUNDED"] } } } },
    }),
  ]);
  await audit(tx, SYSTEM(a.tenantId), "comingOfAge.terminate", "Athlete", a.id, {
    after: { guardianId: a.guardian?.id ?? null, athleteLoginsOff: athleteOff.count, guardianLoginsOff: guardianOff, guardianKeepsOtherAthletes: otherWards, listingsEnded, openOrders, openMarketplace },
  });
  const first = firstNameOf(a.legalName, a.displayName);
  const until = day(new Date(now.getTime() + RETENTION_DAYS * DAY));
  if (a.email) {
    await send(tx, a.tenantId, {
      template: "comingOfAge.terminated", to: a.email, idempotencyKey: `comingOfAge.terminated:${a.id}:athlete`,
      data: { firstName: first, athleteFirstName: first, until, uploadUrl: linkFor(a.id), seat: "athlete" },
    });
  }
  if (a.guardian) {
    await send(tx, a.tenantId, {
      template: "comingOfAge.terminated", to: a.guardian.email, idempotencyKey: `comingOfAge.terminated:${a.id}:guardian`,
      data: { firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", athleteFirstName: first, until, uploadUrl: "", seat: otherWards ? "guardian-others" : "guardian" },
    });
  }
  const staff = await tx.user.findMany({ where: { tenantId: a.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true } });
  for (const u of staff) {
    await send(tx, a.tenantId, {
      template: "comingOfAge.btgSettle", to: u.email, idempotencyKey: `comingOfAge.btgSettle:${a.id}:${u.id}`,
      data: { athleteName: a.legalName || a.displayName, openOrders: String(openOrders + openMarketplace), listingsEnded: String(listingsEnded), reviewUrl: `${appUrl()}/admin/new-signups/athletes/${a.id}` },
    });
  }
  return true;
}

/**
 * 2S1-BE-14 — a sensitive edit (a new date of birth, a move to a place with a
 * different age of majority) re-runs this athlete's coming of age at once,
 * inside the edit's transaction, rather than waiting for the hourly sweep:
 *
 *   - now an adult with a guardian still linked and no allowance yet → the
 *     90-day allowance starts (the same `startIn` the sweep runs);
 *   - a minor again while an allowance is open (the date was wrong) → the
 *     allowance closes; the guardian simply goes on acting for a minor.
 *
 * Returns what happened, so the edit can say so.
 */
export async function rerunComingOfAgeIn(tx: Tx, tenantId: string, athleteId: string, now = new Date()): Promise<"started" | "cancelled" | "unchanged"> {
  const a = await tx.athlete.findFirst({ where: { tenantId, id: athleteId }, select: SELECT });
  if (!a || a.comingOfAgeCompletedAt || a.comingOfAgeTerminatedAt) return "unchanged";
  const minor = isMinorAt(a.birthDate, a.majorityAge, now);
  if (!a.comingOfAgeStartedAt) {
    if (minor || !a.birthDate || !a.guardianId) return "unchanged";
    return (await startIn(tx, a, now)) ? "started" : "unchanged";
  }
  if (!minor) return "unchanged";
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: the athlete just found in its own tenant; only while the allowance is open. */
    where: { id: a.id, tenantId, comingOfAgeStartedAt: { not: null }, comingOfAgeCompletedAt: null, comingOfAgeTerminatedAt: null },
    data: { comingOfAgeStartedAt: null, comingOfAgeDueAt: null, comingOfAgeReminders: [] },
  });
  if (moved.count !== 1) return "unchanged";
  await audit(tx, SYSTEM(tenantId), "comingOfAge.cancel", "Athlete", a.id, {
    before: { startedAt: a.comingOfAgeStartedAt.toISOString(), dueAt: a.comingOfAgeDueAt?.toISOString() ?? null },
    after: { reason: "under the age of majority again after a date-of-birth or place change" },
  });
  return "cancelled";
}

/** Start, remind, terminate — for every athlete in every tenant. Idempotent; the worker runs it hourly. */
export async function sweepComingOfAge(now = new Date()) {
  let started = 0;
  let reminded = 0;
  let terminated = 0;
  /* Coming of age: a guardian still linked, a birth date past the place's age, no allowance yet.
     The youngest age in the table is 14, so anyone born after that can't be a candidate. */
  const floor = new Date(now);
  floor.setUTCFullYear(floor.getUTCFullYear() - 14);
  const candidates = await prisma.athlete.findMany({
    /* tenant-scope: the worker's sweep runs across every tenant; each write below stays in the athlete's own tenant. */
    where: {
      guardianId: { not: null }, birthDate: { not: null, lte: floor }, comingOfAgeStartedAt: null,
      comingOfAgeCompletedAt: null, comingOfAgeTerminatedAt: null, state: { in: ["APPROVED", "ACTIVE", "SUSPENDED"] },
    },
    select: SELECT, take: 500,
  });
  for (const a of candidates) {
    if (isMinorAt(a.birthDate, a.majorityAge, now)) continue;
    if (await prisma.$transaction((tx) => startIn(tx, a, now))) started++;
  }
  const open = await prisma.athlete.findMany({
    /* tenant-scope: the worker's sweep, across every tenant; each write stays in the athlete's own tenant. */
    where: { comingOfAgeStartedAt: { not: null }, comingOfAgeCompletedAt: null, comingOfAgeTerminatedAt: null },
    select: SELECT, take: 2000,
  });
  for (const a of open) {
    if (a.comingOfAgeDueAt! <= now) {
      if (await prisma.$transaction((tx) => terminateIn(tx, a, now))) terminated++;
      continue;
    }
    for (const d of dueReminders(a.comingOfAgeDueAt!, a.comingOfAgeReminders, now)) {
      await prisma.$transaction(async (tx) => {
        const moved = await tx.athlete.updateMany({
          /* tenant-scope: the athlete just found in its own tenant; only if this reminder isn't recorded yet. */
          where: { id: a.id, tenantId: a.tenantId, NOT: { comingOfAgeReminders: { has: d } } },
          data: { comingOfAgeReminders: { push: d } },
        });
        if (moved.count === 1) {
          await remind(tx, a, d, "comingOfAge.reminder");
          reminded++;
        }
      });
    }
  }
  return { started, reminded, terminated };
}

/* ═══════════════════════ taking over ═════════════════════════════════ */

/**
 * The athlete's government ID is in: control moves to them. During the
 * allowance the guardian's link ends and both are told; after termination
 * (within 30 days) the account comes back — ACTIVE, login on — as an adult.
 */
async function completeIn(tx: Tx, a: Row, now: Date) {
  const terminated = a.comingOfAgeTerminatedAt;
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: the athlete named by the signed link, in its own tenant. */
    where: { id: a.id, tenantId: a.tenantId, comingOfAgeCompletedAt: null },
    data: { comingOfAgeCompletedAt: now, guardianId: null },
  });
  if (moved.count !== 1) return;
  let reactivated = false;
  if (terminated) {
    if (a.state === "SUSPENDED") await transitionAthleteIn(tx, AUTO(a.tenantId), a.id, "ACTIVE");
    await tx.user.updateMany({
      /* tenant-scope: the logins termination switched off, in the athlete's tenant. */
      where: { tenantId: a.tenantId, athleteId: a.id, disabledReason: `comingOfAge:${a.id}` },
      data: { disabledAt: null, disabledReason: null },
    });
    reactivated = true;
  }
  await audit(tx, SYSTEM(a.tenantId), "comingOfAge.complete", "Athlete", a.id, { after: { previousGuardianId: a.guardianId, reactivated } });
  const first = firstNameOf(a.legalName, a.displayName);
  if (a.email) {
    await send(tx, a.tenantId, {
      template: "comingOfAge.completed", to: a.email, idempotencyKey: `comingOfAge.completed:${a.id}:athlete`,
      data: { firstName: first, athleteFirstName: first, portalUrl: `${appUrl()}/athlete`, seat: "athlete" },
    });
  }
  if (a.guardian) {
    await send(tx, a.tenantId, {
      template: "comingOfAge.completed", to: a.guardian.email, idempotencyKey: `comingOfAge.completed:${a.id}:guardian`,
      data: { firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", athleteFirstName: first, portalUrl: `${appUrl()}/athlete`, seat: "guardian" },
    });
  }
}

async function byToken(token: string) {
  const id = readComingOfAgeToken(token);
  if (!id) throw new SignupError("This link is not valid. Open the whole link from the email.", 400);
  const a = await prisma.athlete.findFirst({
    /* tenant-scope: the athlete named inside a signed coming-of-age token. */
    where: { id }, select: SELECT,
  });
  if (!a) throw new SignupError("This link is no longer valid.", 404);
  return a;
}

/** Can a government ID still take over this account? During the allowance, or within 30 days of termination. */
function windowOf(a: Row, now = new Date()) {
  if (a.comingOfAgeCompletedAt) return { open: false, reason: "done" as const };
  if (comingOfAgeOpen(a)) return { open: true, reason: "allowance" as const, until: a.comingOfAgeDueAt! };
  if (a.comingOfAgeTerminatedAt) {
    const until = new Date(a.comingOfAgeTerminatedAt.getTime() + RETENTION_DAYS * DAY);
    return until > now ? { open: true, reason: "reactivate" as const, until } : { open: false, reason: "expired" as const };
  }
  return { open: false, reason: "not-started" as const };
}

/** The coming-of-age page, by signed link: who, how long is left, is it done. */
export async function comingOfAgeByToken(token: string) {
  const a = await byToken(token);
  const w = windowOf(a);
  return {
    athleteFirstName: firstNameOf(a.legalName, a.displayName),
    ageOfMajority: a.majorityAge,
    reachedAt: a.birthDate ? dayOfMajority(a.birthDate, a.majorityAge) : null,
    dueAt: a.comingOfAgeDueAt,
    window: w.reason,
    until: "until" in w ? w.until : null,
    idUploaded: Boolean(a.comingOfAgeCompletedAt),
  };
}

export async function requestComingOfAgeUpload(token: string, input: { filename: string; contentType: string; bytes: number }) {
  const a = await byToken(token);
  const w = windowOf(a);
  if (!w.open) throw new SignupError(w.reason === "done" ? "Your government ID is already in — you're in control of your account." : "This link has expired. Contact BTG to come back.");
  return startAccountDocument({ tenantId: a.tenantId, athleteId: a.id }, { kind: "GOVERNMENT_ID", ...input });
}

export async function confirmComingOfAgeUpload(token: string, documentId: string) {
  const a = await byToken(token);
  if (!windowOf(a).open) throw new SignupError("This link has expired. Contact BTG to come back.");
  const doc = await finishAccountDocument({ tenantId: a.tenantId, athleteId: a.id }, documentId);
  if (doc.kind !== "GOVERNMENT_ID") throw new SignupError("Taking over needs a government ID.", 422);
  await prisma.$transaction((tx) => completeIn(tx, a, new Date()));
  return comingOfAgeByToken(token);
}

/* ═══════════════════════ the portals' reminder ═══════════════════════ */

/**
 * The reminder both portals show: for the athlete's own login, or the
 * guardian acting for them. `uploadPath` (the athlete's own login only) is
 * where their CTA goes; the guardian's CTA sends the athlete that link.
 */
export async function myComingOfAge(actor: Actor) {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE")) return { comingOfAge: null };
  const a = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.athleteId }, select: SELECT });
  if (!a || !comingOfAgeOpen(a)) return { comingOfAge: null };
  const kinds = await uploadedKinds(prisma, { tenantId: a.tenantId, athleteId: a.id });
  return {
    comingOfAge: {
      athleteFirstName: firstNameOf(a.legalName, a.displayName),
      ageOfMajority: a.majorityAge,
      reachedAt: a.birthDate ? dayOfMajority(a.birthDate, a.majorityAge) : a.comingOfAgeStartedAt,
      startedAt: a.comingOfAgeStartedAt,
      dueAt: a.comingOfAgeDueAt,
      idUploaded: kinds.has("GOVERNMENT_ID") && Boolean(a.comingOfAgeCompletedAt),
      seat: actor.actingFor ? ("guardian" as const) : ("athlete" as const),
      uploadPath: actor.actingFor ? null : `/coming-of-age/${encodeURIComponent(issueComingOfAgeToken(a.id))}`,
    },
  };
}

/** The guardian's "Send <athlete> the link": the coming-of-age page, emailed to the athlete. */
export async function sendComingOfAgeLink(actor: Actor) {
  if (!actor.actingFor || !actor.athleteId) throw new SignupError("Only the guardian acting for the athlete sends this link.", 403);
  const a = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.athleteId }, select: SELECT });
  if (!a || !comingOfAgeOpen(a)) throw new SignupError("There's no coming-of-age allowance running for this athlete.");
  if (!a.email) throw new SignupError("This athlete has no email on file — contact BTG.", 422);
  const sent = await prisma.outboxJob.count({
    where: { tenantId: a.tenantId, name: "notify.email", payload: { path: ["idempotencyKey"], string_starts_with: `comingOfAge.uploadLink:${a.id}:` } },
  });
  if (sent >= 10) throw new SignupError("This link has been sent many times already — contact BTG.", 429);
  await prisma.$transaction(async (tx) => {
    await send(tx, a.tenantId, {
      template: "comingOfAge.uploadLink", to: a.email!, idempotencyKey: `comingOfAge.uploadLink:${a.id}:${sent + 1}`,
      data: { firstName: firstNameOf(a.legalName, a.displayName), guardianName: a.guardian?.legalName ?? "Your guardian", uploadUrl: linkFor(a.id), dueDate: day(a.comingOfAgeDueAt!) },
    });
    await audit(tx, actor, "comingOfAge.linkSent", "Athlete", a.id, { after: { to: "athlete" } });
  });
  return { sent: true };
}
