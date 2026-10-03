/**
 * P9-BE-20 — students approved from the school roster; P9-BE-21 — prospects
 * decided automatically (item 24, programme owner 2026-10-03).
 *
 * "Phase 2 overrides Phase 1's manual rules": a step is automatic when every
 * safety check passes (student-auto-rules.ts), and held for the right person
 * — the school's advisor, or SALES / BTG — with the reason, when one fails.
 *
 *  - SUBMITTED → UNDER_REVIEW on submit, as the system.
 *  - UNDER_REVIEW → APPROVED on an exact roster match (`rosterVerdict`);
 *    otherwise the application waits with `reviewReasons` in words, which
 *    only the advisor and BTG read.
 *  - APPROVED → ACTIVE the moment the guardian gate is met (student-moves.ts
 *    `activateIfReadyIn`); the sales code on ACTIVE (`issueStudentCodeIn`).
 *  - A prospect is refused for a held category, accepted when clean, held
 *    for SALES otherwise (`prospectVerdict`).
 *
 * GUARDIANS ARE NOT VERIFIED HERE. The athlete precedent verifies a guardian
 * automatically from an in-app guardian agreement (athlete-signup.ts
 * `guardianAgreed`). A student's guardian has no such flow: no setup page,
 * no in-app agreement, and a student consent (content-rights.ts
 * `recordSubjectConsent`) is recorded by BTG from a signed form and itself
 * requires a guardian already verified. So verification stays with BTG
 * (guardian.ts `verifyGuardian`), and that verification activates the
 * student (`activateWardStudentsIn`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import { send } from "../lib/email";
import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import { norm, sameName } from "./name-match";
import { overlaps, restrictionConflicts } from "./restrictions";
import { normalizeSchoolDomain, prospectVerdict, rosterVerdict, STUDENT_HOLD } from "./student-auto-rules";
import {
  activateIfReadyIn,
  decideProspectIn,
  heldCategories,
  issueStudentCodeIn,
  lockSchoolReview,
  moveStudentIn,
  PROSPECT_DECIDE_SELECT,
  STUDENT_MOVE_SELECT,
  SYSTEM,
} from "./student-moves";

type Tx = Prisma.TransactionClient;

const DAY = 864e5;
const app = () => env.APP_URL.replace(/\/+$/, "");
const lock = (tx: Tx, key: string) => tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const REVIEW_SELECT = { ...STUDENT_MOVE_SELECT, propertyId: true, legalName: true, gradYear: true, email: true, reviewReasons: true } as const;

/* ── P9-BE-20 · the application ─────────────────────────────────────────── */

export type ReviewOutcome = { outcome: "approved" | "held" | "skipped"; reasons?: string[] };

/**
 * Pick a submitted application up and decide it from the roster, as the
 * system, inside the caller's transaction. One school at a time (an advisory
 * lock), so two applications with one name cannot both pass "no existing
 * student". Idempotent: a student no longer SUBMITTED / UNDER_REVIEW is left
 * alone, and a held one whose reasons have not changed writes nothing.
 */
export async function autoReviewStudentIn(tx: Tx, tenantId: string, studentId: string, now = new Date()): Promise<ReviewOutcome> {
  const first = await tx.student.findFirst({ where: { tenantId, id: studentId }, select: { propertyId: true } });
  if (!first) return { outcome: "skipped" };
  await lockSchoolReview(tx, tenantId, first.propertyId);
  let s = await tx.student.findFirst({ where: { tenantId, id: studentId }, select: REVIEW_SELECT });
  if (!s) return { outcome: "skipped" };
  if (s.state === "SUBMITTED") {
    await moveStudentIn(tx, SYSTEM(tenantId), s, "UNDER_REVIEW", { automatic: true, now });
    s = { ...s, state: "UNDER_REVIEW" };
  }
  if (s.state !== "UNDER_REVIEW") return { outcome: "skipped" };

  const [roster, existing, school] = await Promise.all([
    /* The roster of THIS student's school, and only it — an empty one approves nobody. */
    tx.rosterEntry.findMany({ where: { tenantId, propertyId: s.propertyId }, select: { id: true, legalName: true, gradYear: true } }),
    tx.student.findMany({
      where: { tenantId, propertyId: s.propertyId, state: { in: ["APPROVED", "ACTIVE", "SUSPENDED"] }, id: { not: s.id } },
      select: { legalName: true },
    }),
    tx.property.findFirst({ where: { tenantId, id: s.propertyId }, select: { emailDomain: true } }),
  ]);
  const verdict = rosterVerdict({
    legalName: s.legalName, gradYear: s.gradYear, birthDate: s.birthDate, ageBand: s.ageBand, email: s.email,
    roster, existing, schoolDomain: school?.emailDomain ?? null,
  }, now);

  if (verdict.approve) {
    await moveStudentIn(tx, SYSTEM(tenantId), s, "APPROVED", { automatic: true, rosterEntryId: verdict.rosterEntryId, now });
    await audit(tx, SYSTEM(tenantId), "student.autoApprove", "Student", s.id, {
      after: { automatic: true, rosterEntryId: verdict.rosterEntryId },
    });
    return { outcome: "approved" };
  }
  if (!sameList(s.reviewReasons, verdict.reasons)) {
    await tx.student.updateMany({
      /* tenant-scope: the student loaded above, in its tenant; only while still waiting. */
      where: { id: s.id, tenantId, state: "UNDER_REVIEW" }, data: { reviewReasons: verdict.reasons },
    });
    await audit(tx, SYSTEM(tenantId), "student.holdForAdvisor", "Student", s.id, {
      before: { reasons: s.reviewReasons }, after: { reasons: verdict.reasons },
    });
  }
  return { outcome: "held", reasons: verdict.reasons };
}

/* ── P9-BE-21 · the prospect ────────────────────────────────────────────── */

export type ProspectOutcome = { outcome: "accepted" | "rejected" | "held" | "skipped"; reasons?: string[] };

/** Restriction windows are read from today for a year — the editions a prospect could be sold into. */
const RESTRICTION_HORIZON_DAYS = 365;

/**
 * Decide a just-submitted prospect as the system, inside the caller's
 * transaction. One business name at a time (an advisory lock on its `norm`),
 * so two students bringing in the same business cannot both be accepted. A
 * prospect already held for a person is theirs and is left alone.
 */
export async function autoDecideProspectIn(tx: Tx, tenantId: string, prospectId: string, now = new Date()): Promise<ProspectOutcome> {
  const first = await tx.studentProspect.findFirst({ where: { tenantId, id: prospectId }, select: { businessName: true } });
  if (!first) return { outcome: "skipped" };
  await lock(tx, `student-prospect:${tenantId}:${norm(first.businessName)}`);
  const p = await tx.studentProspect.findFirst({
    where: { tenantId, id: prospectId }, select: { ...PROSPECT_DECIDE_SELECT, reviewReasons: true },
  });
  if (!p || p.state !== "SUBMITTED" || p.reviewReasons.length > 0) return { outcome: "skipped" };

  const propertyId = p.student.propertyId;
  const window = { startsOn: now, endsOn: new Date(now.getTime() + RESTRICTION_HORIZON_DAYS * DAY) };
  const [held, schoolConflicts, athleteRows, athleteProfiles, sponsors, prospects] = await Promise.all([
    heldCategories(tx, tenantId, propertyId),
    /* restrictions.ts, the school's own rows (SCHOOL_POLICY, LEAGUE_RULE, PROHIBITED). */
    restrictionConflicts(tx, { tenantId, propertyId, categories: [p.category], ...window }),
    /* The athletes at the school: their own restriction rows… */
    tx.brandRestriction.findMany({
      where: { tenantId, category: p.category, athlete: { is: { tenantId, propertyId } } },
      select: { startsOn: true, endsOn: true },
    }),
    /* …and Phase 1's restricted categories on their profiles. */
    tx.athlete.count({ where: { tenantId, propertyId, restrictedCategories: { has: p.category } } }),
    /* Names only, every sponsor in the tenant: the match is the exact `norm`, which no SQL filter reproduces. */
    tx.sponsor.findMany({ where: { tenantId }, select: { name: true } }),
    tx.studentProspect.findMany({
      where: { tenantId, id: { not: p.id }, state: { in: ["SUBMITTED", "ACCEPTED"] } }, select: { businessName: true },
    }),
  ]);
  const nameless = norm(p.businessName) === "";
  const verdict = prospectVerdict({
    category: p.category,
    held,
    schoolConflicts: schoolConflicts.length,
    athleteConflicts: athleteRows.filter((r) => overlaps(r, window)).length + athleteProfiles,
    /* A name with no letters cannot be matched, so it is never "clearly new". */
    alreadySponsor: nameless || sponsors.some((x) => sameName(x.name, p.businessName)),
    openProspect: prospects.some((x) => sameName(x.businessName, p.businessName)),
  });

  if (verdict.decision === "REJECT") {
    await decideProspectIn(tx, SYSTEM(tenantId), p, { decision: "REJECT", reasonCode: verdict.reasonCode }, { automatic: true, now });
    return { outcome: "rejected" };
  }
  if (verdict.decision === "ACCEPT") {
    await decideProspectIn(tx, SYSTEM(tenantId), p, { decision: "ACCEPT" }, { automatic: true, now });
    return { outcome: "accepted" };
  }
  await tx.studentProspect.updateMany({
    /* tenant-scope: the prospect loaded above, in its tenant; only while undecided. */
    where: { id: p.id, tenantId, state: "SUBMITTED" }, data: { reviewReasons: verdict.reasons },
  });
  await audit(tx, SYSTEM(tenantId), "studentProspect.hold", "StudentProspect", p.id, { after: { reasons: verdict.reasons } });
  await tellSalesOfHold(tx, tenantId, p, verdict.reasons);
  return { outcome: "held", reasons: verdict.reasons };
}

/**
 * A held prospect is a person's to decide: SALES hears of it once, with the
 * reasons — or, in a tenant with no SALES user, its BTG admins. Once is the
 * key (the prospect and the recipient) and the hold itself, which happens
 * only on the first evaluation (a held prospect is never re-evaluated).
 */
async function tellSalesOfHold(tx: Tx, tenantId: string, p: { id: string; businessName: string; category: string; student: { displayName: string; propertyId: string } }, reasons: string[]) {
  const staff = (role: "SALES" | "BTG_ADMIN") =>
    tx.user.findMany({ where: { tenantId, roles: { has: role }, disabledAt: null }, select: { id: true, email: true }, orderBy: { id: "asc" } });
  let to = await staff("SALES");
  if (!to.length) to = await staff("BTG_ADMIN");
  if (!to.length) return;
  const school = await tx.property.findFirst({ where: { tenantId, id: p.student.propertyId }, select: { name: true } });
  for (const u of to) {
    await send(tx, tenantId, {
      template: "studentProspect.heldForSales", to: u.email, idempotencyKey: `studentProspect.heldForSales:${p.id}:${u.id}`,
      data: {
        businessName: p.businessName, category: p.category.replace(/_/g, " ").toLowerCase(), studentName: p.student.displayName,
        school: school?.name ?? "", reasons: reasons.map((r) => `• ${r}`).join("\n"), deskUrl: `${app()}/admin/next/prospects`,
      },
    });
  }
}

/**
 * P9-BE-20 — the school just supplied (more of) its roster: re-run the
 * verdict for every application at that school waiting ONLY because it
 * wasn't on a roster (NO_ROSTER / NOT_ON_ROSTER). Inside the upload's
 * transaction, under the same per-school lock; anything else that held an
 * application (two entries, an existing student, an adult's email) leaves it
 * where it is, with its reasons. Returns how many it approved.
 */
export async function recheckRosterHoldsIn(tx: Tx, tenantId: string, propertyId: string, now = new Date()): Promise<number> {
  await lockSchoolReview(tx, tenantId, propertyId);
  const rosterOnly: string[] = [STUDENT_HOLD.NO_ROSTER, STUDENT_HOLD.NOT_ON_ROSTER];
  const waiting = await tx.student.findMany({
    where: { tenantId, propertyId, state: "UNDER_REVIEW", reviewReasons: { isEmpty: false } },
    select: { id: true, reviewReasons: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let approved = 0;
  for (const w of waiting) {
    if (!w.reviewReasons.every((r) => rosterOnly.includes(r))) continue;
    if ((await autoReviewStudentIn(tx, tenantId, w.id, now)).outcome === "approved") approved++;
  }
  return approved;
}

/* ── the school's email domain (P9-BE-20 §2) ────────────────────────────── */

/** The roster's own reach: an advisor their school, BTG their tenant's. The
 *  domain is the school's other proof of who belongs, set beside its roster. */
function assertSchoolReach(actor: Actor, propertyId: string, action: "read" | "write") {
  assertAllowed(actor, "rosterEntry", action);
  if (scopeFor(actor.roles, "rosterEntry", action) === "own-property" && actor.propertyId !== propertyId) {
    throw new ForbiddenError("rosterEntry", action);
  }
}

/** GET /properties/:id/email-domain — the advisor desk's review settings. */
export async function readSchoolReviewSettings(actor: Actor, propertyId: string) {
  assertSchoolReach(actor, propertyId, "read");
  const school = await prisma.property.findFirst({
    where: { tenantId: actor.tenantId, id: propertyId, kind: "SCHOOL" }, select: { id: true, name: true, emailDomain: true },
  });
  if (!school) throw new ForbiddenError("rosterEntry", "read");
  const rosterEntries = await prisma.rosterEntry.count({ where: { tenantId: actor.tenantId, propertyId } });
  return { propertyId: school.id, school: school.name, emailDomain: school.emailDomain, rosterEntries };
}

/** PUT /properties/:id/email-domain — set or clear it (null). A free-mail provider is refused. */
export async function setSchoolEmailDomain(actor: Actor, propertyId: string, domain: string | null) {
  assertSchoolReach(actor, propertyId, "write");
  const emailDomain = normalizeSchoolDomain(domain);
  return prisma.$transaction(async (tx) => {
    const school = await tx.property.findFirst({
      where: { tenantId: actor.tenantId, id: propertyId, kind: "SCHOOL" }, select: { id: true, emailDomain: true },
    });
    if (!school) throw new ForbiddenError("rosterEntry", "write");
    await tx.property.updateMany({
      /* tenant-scope: the school loaded above, in the caller's tenant. */
      where: { id: school.id, tenantId: actor.tenantId }, data: { emailDomain },
    });
    await audit(tx, actor, "property.setEmailDomain", "Property", school.id, {
      before: { emailDomain: school.emailDomain }, after: { emailDomain },
    });
    return { propertyId: school.id, emailDomain };
  });
}

/* ── the safety net and the digest (worker) ─────────────────────────────── */

/**
 * The sweep behind the events: an application still SUBMITTED (submitted
 * before this rule, or whose pick-up failed), an APPROVED student whose
 * guardian was verified by some other road, an ACTIVE student with no code.
 * Each in its own transaction, so one failure leaves the rest to go through.
 * `tenantIds` scopes it (tests); the worker passes none.
 */
export async function sweepStudentAutomation(opts: { tenantIds?: readonly string[]; now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const take = opts.limit ?? 200;
  const scope: Prisma.StudentWhereInput = opts.tenantIds ? { tenantId: { in: [...opts.tenantIds] } } : {};
  const pick = (where: Prisma.StudentWhereInput) =>
    prisma.student.findMany({
      /* tenant-scope: the worker's sweep across every tenant (or the tenants named); each row is then acted on in its own tenant. */
      where: { ...scope, ...where }, select: { id: true, tenantId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take,
    });
  /* Only APPROVED students the gate could pass today — an adult by date or
     band, or anyone whose guardian is verified — so minors still waiting on
     a guardian never crowd the batch. activateIfReadyIn decides each. */
  const eighteenYearsAgo = new Date(now.getTime() - 18 * 365.25 * DAY);
  const [submitted, approved, uncoded] = await Promise.all([
    pick({ state: "SUBMITTED" }),
    pick({
      state: "APPROVED",
      OR: [{ guardian: { is: { verifiedAt: { not: null } } } }, { ageBand: "18_PLUS" }, { birthDate: { lte: eighteenYearsAgo } }],
    }),
    pick({ state: "ACTIVE", code: { is: null } }),
  ]);
  const out = { approved: 0, held: 0, activated: 0, coded: 0, failed: 0 };
  for (const s of submitted) {
    try {
      const r = await prisma.$transaction((tx) => autoReviewStudentIn(tx, s.tenantId, s.id, now));
      if (r.outcome === "approved") out.approved++;
      if (r.outcome === "held") out.held++;
    } catch { out.failed++; }
  }
  for (const s of approved) {
    try {
      if (await prisma.$transaction((tx) => activateIfReadyIn(tx, s.tenantId, s.id, now))) out.activated++;
    } catch { out.failed++; }
  }
  for (const s of uncoded) {
    try {
      await prisma.$transaction((tx) => issueStudentCodeIn(tx, SYSTEM(s.tenantId), s.tenantId, s.id));
      out.coded++;
    } catch { out.failed++; }
  }
  return out;
}

export const STUDENT_DIGEST_HOUR_UTC = 13;
const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * ONE email a day to each school's advisors: who the system approved from
 * the roster since the last one — not one email per student. Once a day is
 * held by the data: a school with any approval digested today (UTC) gets no
 * second digest until tomorrow, and the email's key is the school, the date
 * and the advisor. A school with no advisor keeps its approvals undigested
 * until it has one. `tenantIds` scopes it (tests); the worker passes none.
 */
export async function sendStudentApprovalDigests(now = new Date(), opts: { tenantIds?: readonly string[] } = {}) {
  const pending = await prisma.student.findMany({
    /* tenant-scope: the worker's daily digest across every tenant (or the tenants named); each school's is sent in its own tenant. */
    where: {
      autoApprovedAt: { not: null, lte: now }, autoApprovalDigestedAt: null,
      ...(opts.tenantIds ? { tenantId: { in: [...opts.tenantIds] } } : {}),
    },
    select: { tenantId: true, propertyId: true }, distinct: ["tenantId", "propertyId"],
  });
  const day = dateOf(now);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  let schools = 0;
  let students = 0;
  let failed = 0;
  for (const { tenantId, propertyId } of pending) {
    try {
      const n = await prisma.$transaction(async (tx) => {
        await lock(tx, `student-digest:${tenantId}:${propertyId}`);
        const today = await tx.student.count({ where: { tenantId, propertyId, autoApprovalDigestedAt: { gte: dayStart } } });
        if (today > 0) return 0;
        const fresh = await tx.student.findMany({
          where: { tenantId, propertyId, autoApprovedAt: { not: null, lte: now }, autoApprovalDigestedAt: null },
          select: { id: true, displayName: true, gradYear: true, state: true }, orderBy: [{ autoApprovedAt: "asc" }, { id: "asc" }],
        });
        const advisors = await tx.user.findMany({
          where: { tenantId, propertyId, roles: { has: "ADVISOR" }, disabledAt: null }, select: { id: true, email: true },
        });
        if (!fresh.length || !advisors.length) return 0;
        await tx.student.updateMany({
          /* tenant-scope: this school's students, loaded above in its tenant. */
          where: { tenantId, id: { in: fresh.map((s) => s.id) }, autoApprovalDigestedAt: null }, data: { autoApprovalDigestedAt: now },
        });
        await audit(tx, SYSTEM(tenantId), "student.autoApprovalDigest", "Property", propertyId, { after: { day, students: fresh.length } });
        const lines = fresh.map((s) =>
          `• ${s.displayName}${s.gradYear ? ` (class of ${s.gradYear})` : ""} — ${s.state === "APPROVED" ? "approved; joins the masthead once their guardian is verified" : s.state === "ACTIVE" ? "on the masthead" : s.state.toLowerCase()}`);
        for (const u of advisors) {
          await send(tx, tenantId, {
            template: "student.autoApprovedDigest", to: u.email, idempotencyKey: `student.autoApprovedDigest:${propertyId}:${day}:${u.id}`,
            data: { count: String(fresh.length), day, students: lines.join("\n"), deskUrl: `${app()}/advisor?auto=1` },
          });
        }
        return fresh.length;
      });
      if (n) { schools++; students += n; }
    } catch { failed++; }
  }
  return { schools, students, failed };
}
