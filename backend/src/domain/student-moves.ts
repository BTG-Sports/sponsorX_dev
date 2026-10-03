/**
 * The student and prospect moves themselves, shared by a person's decision
 * (student.ts) and the system's (student-auto.ts) — P9-BE-04, -07, -13 and
 * P9-BE-20, -21. One function per move so the two roads cannot drift: the
 * guardian gate, the login provisioning and the decline email are the same
 * whoever decides.
 *
 * Every write is conditional on the state it was read in, so a person and
 * the system acting at once move a row once; the loser is told (409).
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { BRAND_CATEGORIES } from "./brand-categories";
import { guardianReadiness, requiresGuardian } from "./guardian-rules";
import { provisionStudentLoginsIn } from "./athlete-login";
import { mayAutoActivate } from "./student-auto-rules";
import { NOT_FOR_STUDENTS } from "./student-categories";
import {
  canTransitionStudent,
  IllegalStudentTransitionError,
  StudentGuardianRequiredError,
  type StudentState,
} from "./student-state";

type Tx = Prisma.TransactionClient;

/** The system acting — no signed-in user behind it, as every sweep. */
export const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

export class StudentStateConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("This student was just moved by someone else — reload and try again.");
    this.name = "StudentStateConflictError";
  }
}

export class StudentNotActiveError extends Error {
  readonly status = 409;
  constructor(what: string) {
    super(`Only an ACTIVE student can ${what}.`);
    this.name = "StudentNotActiveError";
  }
}

export class ProspectDecisionError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ProspectDecisionError";
  }
}

/** What a move needs to know about the student. */
export const STUDENT_MOVE_SELECT = {
  id: true, tenantId: true, propertyId: true, state: true, birthDate: true, ageBand: true, guardianId: true,
  guardian: { select: { verifiedAt: true } },
} as const;

/** One approval at a time per school — the roster review's lock (student-auto.ts), so a
 *  person's approval and the system's cannot both pass "no student with this name". */
export const lockSchoolReview = (tx: Tx, tenantId: string, propertyId: string) =>
  tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `student-review:${tenantId}:${propertyId}`);
export type StudentMoveRow = Prisma.StudentGetPayload<{ select: typeof STUDENT_MOVE_SELECT }>;

/**
 * Move a student. The caller has already decided the actor may (a person's
 * scope, or the system's own rule). ACTIVE needs the guardian gate met —
 * unchanged, the athlete's rule. Leaving UNDER_REVIEW clears the hold's
 * reasons. APPROVED provisions the logins (P9-FE-06) and then activates at
 * once if the gate is already met (P9-BE-20 §3); ACTIVE issues the sales
 * code (§4). Both follow-ons are the system's, audited as such.
 */
export async function moveStudentIn(
  tx: Tx,
  actor: AuditActor,
  student: StudentMoveRow,
  to: StudentState,
  opts: { reviewerNotes?: string | null; automatic?: boolean; rosterEntryId?: string; now?: Date } = {},
): Promise<StudentState> {
  const from = student.state as StudentState;
  const now = opts.now ?? new Date();
  if (!canTransitionStudent(from, to)) throw new IllegalStudentTransitionError(from, to);
  if (to === "ACTIVE") {
    const readiness = guardianReadiness({
      birthDate: student.birthDate, ageBand: student.ageBand,
      guardianId: student.guardianId, guardianVerifiedAt: student.guardian?.verifiedAt ?? null,
    });
    if (readiness.status !== "not-required" && readiness.status !== "ready") throw new StudentGuardianRequiredError(readiness.reason);
  }
  if (to === "APPROVED") await lockSchoolReview(tx, student.tenantId, student.propertyId);
  const moved = await tx.student.updateMany({
    /* tenant-scope: the student the caller loaded, in its own tenant; only while still in the state it was read in. */
    where: { id: student.id, tenantId: student.tenantId, state: from },
    data: {
      state: to,
      ...(opts.reviewerNotes !== undefined ? { reviewerNotes: opts.reviewerNotes } : {}),
      ...(to === "INACTIVE" ? { leftAt: now } : {}),
      ...(from === "UNDER_REVIEW" ? { reviewReasons: [] } : {}),
      ...(opts.rosterEntryId ? { autoApprovedAt: now, autoApprovedRosterEntryId: opts.rosterEntryId } : {}),
    },
  });
  if (moved.count !== 1) throw new StudentStateConflictError();
  await audit(tx, actor, "student.transition", "Student", student.id, {
    before: { state: from },
    after: { state: to, ...(opts.automatic ? { automatic: true } : {}), ...(opts.rosterEntryId ? { rosterEntryId: opts.rosterEntryId } : {}) },
  });
  if (to === "APPROVED") {
    await provisionStudentLoginsIn(tx, actor, student.id);
    if (await activateIfReadyIn(tx, student.tenantId, student.id, now)) return "ACTIVE";
  }
  if (to === "ACTIVE") await issueStudentCodeIn(tx, SYSTEM(student.tenantId), student.tenantId, student.id);
  return to;
}

/**
 * P9-BE-20 §3 — APPROVED → ACTIVE as the system, the moment the guardian
 * gate is met: an adult at once, a minor when their guardian is verified.
 * Never for an unknown age. Returns whether it moved.
 */
export async function activateIfReadyIn(tx: Tx, tenantId: string, studentId: string, now = new Date()): Promise<boolean> {
  const s = await tx.student.findFirst({ where: { tenantId, id: studentId, state: "APPROVED" }, select: STUDENT_MOVE_SELECT });
  if (!s) return false;
  const readiness = guardianReadiness({
    birthDate: s.birthDate, ageBand: s.ageBand, guardianId: s.guardianId, guardianVerifiedAt: s.guardian?.verifiedAt ?? null,
  });
  if (!mayAutoActivate(s, readiness, now)) return false;
  try {
    await moveStudentIn(tx, SYSTEM(tenantId), s, "ACTIVE", { automatic: true, now });
  } catch (error) {
    /* Someone moved them first (nothing was written): theirs stands, and the
       caller's own act — a guardian's verification — is not undone for it. */
    if (error instanceof StudentStateConflictError) return false;
    throw error;
  }
  return true;
}

/**
 * P9-BE-20 §3 — a guardian was just verified: every APPROVED student they
 * look after, in their tenant, goes ACTIVE now if the gate is met. Called in
 * the verification's own transaction; the student sweep is the safety net
 * for a guardian verified by any other road.
 */
export async function activateWardStudentsIn(tx: Tx, tenantId: string, guardianId: string, now = new Date()): Promise<number> {
  const wards = await tx.student.findMany({
    where: { tenantId, guardianId, state: "APPROVED" }, select: { id: true }, orderBy: { createdAt: "asc" },
  });
  let moved = 0;
  for (const w of wards) if (await activateIfReadyIn(tx, tenantId, w.id, now)) moved++;
  return moved;
}

/**
 * Issue — or return — the student's one sales code (P9-BE-07). Idempotent:
 * a second call, or two at once, returns the one code (the studentId is
 * unique, and the insert skips a duplicate).
 */
export async function issueStudentCodeIn(tx: Tx, actor: AuditActor, tenantId: string, studentId: string): Promise<{ code: string }> {
  const student = await tx.student.findFirst({
    where: { tenantId, id: studentId }, select: { id: true, state: true, code: { select: { code: true } } },
  });
  if (!student) throw new StudentNotActiveError("be given a sales code");
  if (student.code) return { code: student.code.code };
  if (student.state !== "ACTIVE") throw new StudentNotActiveError("be given a sales code");
  const made = await tx.studentCode.createMany({
    data: [{ tenantId, studentId, code: randomBytes(9).toString("base64url") }], skipDuplicates: true,
  });
  const row = await tx.studentCode.findFirstOrThrow({ where: { tenantId, studentId }, select: { code: true } });
  if (made.count === 1) await audit(tx, actor, "studentCode.issue", "Student", studentId, { after: { automatic: actor.userId === null } });
  return { code: row.code };
}

/* ── prospects ──────────────────────────────────────────────────────────── */

/** Categories someone already holds exclusively at this school: the
 *  presenting sponsor of any edition still being planned, sold or produced. */
export async function heldCategories(tx: Tx, tenantId: string, propertyId: string): Promise<Set<string>> {
  const held = await tx.adSlot.findMany({
    where: {
      tenantId, kind: "PRESENTING", campaignId: { not: null },
      edition: { is: { state: { in: ["PLANNING", "SELLING", "CLOSED", "IN_PRODUCTION"] }, publication: { is: { propertyId } } } },
    },
    select: { campaign: { select: { brief: { select: { categories: true } } } } },
  });
  return new Set(held.flatMap((s) => s.campaign?.brief?.categories ?? []));
}

export const PROSPECT_DECIDE_SELECT = {
  id: true, tenantId: true, state: true, businessName: true, category: true,
  student: {
    select: {
      id: true, displayName: true, email: true, propertyId: true, birthDate: true, ageBand: true,
      guardian: { select: { email: true, legalName: true } },
    },
  },
} as const;
export type ProspectDecideRow = Prisma.StudentProspectGetPayload<{ select: typeof PROSPECT_DECIDE_SELECT }>;

/**
 * Decide a prospect. A rejection carries a reason code, notifies the student
 * — and a minor's guardian — and COSTS THEM NO SALES CREDIT: no attribution
 * row or point is touched. Where the refusal was a category someone else
 * holds, the student is offered the categories still open at their school.
 */
export async function decideProspectIn(
  tx: Tx,
  actor: AuditActor,
  prospect: ProspectDecideRow,
  input: { decision: "ACCEPT" | "REJECT"; reasonCode?: string | null },
  opts: { automatic?: boolean; now?: Date } = {},
): Promise<{ id: string; state: "ACCEPTED" | "REJECTED"; redirectCategories: string[] }> {
  if (prospect.state !== "SUBMITTED") throw new ProspectDecisionError(`This prospect was already ${prospect.state.toLowerCase()}.`);
  let redirectCategories: string[] = [];
  if (input.decision === "REJECT" && input.reasonCode === "CATEGORY_EXCLUSIVE") {
    const held = await heldCategories(tx, prospect.tenantId, prospect.student.propertyId);
    held.add(prospect.category);
    redirectCategories = BRAND_CATEGORIES.filter((c) => !held.has(c) && !NOT_FOR_STUDENTS.has(c));
  }
  const state = input.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  const moved = await tx.studentProspect.updateMany({
    /* tenant-scope: the prospect the caller loaded, in its own tenant; only while still undecided. */
    where: { id: prospect.id, tenantId: prospect.tenantId, state: "SUBMITTED" },
    data: {
      state, reasonCode: input.reasonCode ?? null, redirectCategories, decidedAt: opts.now ?? new Date(),
      ...(opts.automatic ? { decidedAutomatically: true } : {}),
    },
  });
  if (moved.count !== 1) throw new ProspectDecisionError("This prospect was just decided by someone else.");
  await audit(tx, actor, "studentProspect.decide", "StudentProspect", prospect.id, {
    after: { state, reasonCode: input.reasonCode ?? null, ...(opts.automatic ? { automatic: true } : {}) },
  });

  if (state === "REJECTED") {
    /* The student hears it from SponsorX, not from silence — and a minor's
       guardian hears it too (P9-BE-21). A minor with no email of their own
       is reached through their guardian alone. */
    const s = prospect.student;
    const data = {
      studentName: s.displayName, businessName: prospect.businessName,
      reason: input.reasonCode ?? "OTHER", openCategories: redirectCategories.join(", "),
    };
    const recipients: { to: string; seat: "student" | "guardian"; extra: Record<string, string> }[] = [];
    if (s.email) recipients.push({ to: s.email, seat: "student", extra: {} });
    if (s.guardian?.email && (requiresGuardian(s) || !s.email)) {
      recipients.push({ to: s.guardian.email, seat: "guardian", extra: { guardianName: s.guardian.legalName.split(/\s+/)[0] ?? "" } });
    }
    for (const r of recipients) {
      await enqueue(tx, prospect.tenantId, "notify.email", {
        tenantId: prospect.tenantId,
        template: "student.prospectDeclined",
        to: r.to,
        /* The student's key is the one it always was, so a decision retried
           across this change sends nothing twice. */
        idempotencyKey: r.seat === "student" ? `student.prospectDeclined:${prospect.id}` : `student.prospectDeclined:${prospect.id}:guardian`,
        data: { ...data, ...r.extra },
      });
    }
  }
  return { id: prospect.id, state, redirectCategories };
}
