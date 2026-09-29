/**
 * SponsorX NEXT students — P9-BE-04, -07, -13, -15, P9-SEC-01. Spec v2.0
 * §5.1, §5.5, §5.6, §6.3, §7.
 *
 * THREE CONCEPTS KEPT APART (§5.1): a student OWNS ATTRIBUTION — an immutable
 * `SalesAttribution` row per originated sale — but never the customer. The
 * customer relationship is `Sponsor.ownership`, set once and never moved; the
 * student currently working the account is `Sponsor.assignedStudentId`, and
 * reassigning it changes nothing about who originated what.
 *
 * MINORS. Nearly every student is one. The guardian rule is the athlete's
 * (`guardianReadiness`), the Guardian model is reused unchanged, and what is
 * published about a student is the display name and the school — never the
 * legal name, email, age or grade (P9-SEC-01).
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import { BRAND_CATEGORIES } from "./brand-categories";
import { GUARDIAN_RELATIONSHIPS, guardianReadiness, requiresGuardian } from "./guardian-rules";
import {
  canTransitionStudent,
  IllegalStudentTransitionError,
  SELF_MOVES,
  StudentGuardianRequiredError,
  type StudentState,
} from "./student-state";
import { pointsFor, salesMilestonesCrossed, type PointReason } from "./student-points";
import { provisionStudentLoginsIn } from "./athlete-login";

export const MASTHEAD_ROLES = ["EDITOR", "WRITER", "PHOTOGRAPHER", "VIDEO", "DESIGNER", "SALES", "CORRESPONDENT"] as const;
export type MastheadRole = (typeof MASTHEAD_ROLES)[number];

/**
 * Categories a school programme of minors does not sell (P9-SEC-01). A
 * student can neither bring one in nor be redirected towards one. Decided
 * here, conservatively, pending the school terms' own list (P9-PMO-02 §4
 * lets a school refuse more, never fewer).
 */
export const NOT_FOR_STUDENTS: ReadonlySet<string> = new Set([
  "ALCOHOL", "TOBACCO_VAPE", "GAMBLING", "CANNABIS", "FIREARMS", "ADULT",
  "POLITICAL", "RELIGIOUS", "PHARMA", "CRYPTO", "ENERGY_DRINK", "SUPPLEMENTS",
]);

/** §5.6 Sponsor Acceptance Check — why SponsorX declined a prospect. */
export const PROSPECT_REJECTION_REASONS = [
  "CATEGORY_EXCLUSIVE", "SCHOOL_RESTRICTION", "ATHLETE_CONFLICT", "BRAND_SAFETY", "OTHER",
] as const;
export type ProspectRejectionReason = (typeof PROSPECT_REJECTION_REASONS)[number];

/* ── errors ─────────────────────────────────────────────────────────────── */

export class NotASchoolError extends Error {
  readonly status = 422;
  constructor() {
    super("A student belongs to a school — a Property of kind SCHOOL.");
    this.name = "NotASchoolError";
  }
}

export class StudentNotActiveError extends Error {
  readonly status = 409;
  constructor(what: string) {
    super(`Only an ACTIVE student can ${what}.`);
    this.name = "StudentNotActiveError";
  }
}

export class UnknownCodeError extends Error {
  readonly status = 404;
  constructor() {
    /* Same answer for "no such code" and "that student has left": the
       resolver is public, and a distinction is an oracle. */
    super("That code is not valid.");
    this.name = "UnknownCodeError";
  }
}

export class StudentGuardianNotRequiredError extends Error {
  readonly status = 409;
  constructor() {
    super("This student is an adult; a guardian is linked only to a minor.");
    this.name = "StudentGuardianNotRequiredError";
  }
}

export class ProspectDecisionError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ProspectDecisionError";
  }
}

/* ── the student (P9-BE-04) ─────────────────────────────────────────────── */

export type StudentInput = {
  propertyId: string;
  legalName: string;
  displayName: string;
  email?: string | null;
  gradYear?: number | null;
  birthDate?: Date | null;
  ageBand?: string | null;
  masthead: MastheadRole[];
};

/** What staff, the advisor, the student and their guardian see. */
const STUDENT_SELECT = {
  id: true, propertyId: true, athleteId: true, guardianId: true, legalName: true,
  displayName: true, email: true, gradYear: true, masthead: true, state: true,
  reviewerNotes: true, leftAt: true, createdAt: true,
} as const;

async function assertSchool(tx: Prisma.TransactionClient, tenantId: string, propertyId: string): Promise<void> {
  const school = await tx.property.findFirst({ where: { tenantId, id: propertyId }, select: { kind: true } });
  if (!school || school.kind !== "SCHOOL") throw new NotASchoolError();
}

/** Staff or the school's advisor add a student. Lands in DRAFT. */
export async function createStudent(actor: Actor, input: StudentInput): Promise<{ id: string; state: StudentState }> {
  assertAllowed(actor, "student", "write");
  return prisma.$transaction(async (tx) => {
    /* There is no row to filter until it exists, so the scope is applied to
       the school instead: staff reach any school in the tenant, an advisor
       only their own, and a student adds nobody. */
    const scope = scopeFor(actor.roles, "student", "write");
    if (scope === "own" || scope === "ward" || (scope === "own-property" && input.propertyId !== actor.propertyId)) {
      throw new ForbiddenError("student", "write");
    }
    await assertSchool(tx, actor.tenantId, input.propertyId);
    const student = await tx.student.create({
      data: { tenantId: actor.tenantId, ...input, email: input.email?.toLowerCase() ?? null },
      select: { id: true, state: true },
    });
    await audit(tx, actor, "student.create", "Student", student.id, { after: { propertyId: input.propertyId } });
    return { id: student.id, state: student.state as StudentState };
  });
}

/**
 * The public "Become the Media" application (spec §8 `(public)/next/apply`).
 * No login — a student applying is not yet anyone's user. Lands SUBMITTED in
 * the school's tenant, for that school's advisor to review. Returns only the
 * id and state: nothing the applicant sent is echoed back.
 */
export type StudentApplicationGuardian = { legalName: string; email: string; relationship: string };

export async function applyAsStudent(
  input: Omit<StudentInput, "propertyId"> & { schoolSlug: string; guardian?: StudentApplicationGuardian | null },
): Promise<{ id: string; state: StudentState; guardianRequired: boolean }> {
  /* P9-FE-06 — the minor rule, the athlete's own: a student under 18 applies
     WITH a guardian, captured here and verified later by BTG before the
     student can go ACTIVE (transitionStudent). */
  const minor = requiresGuardian({ birthDate: input.birthDate ?? null, ageBand: input.ageBand ?? null });
  if (minor && !input.guardian) throw new StudentApplicationGuardianMissingError();
  return prisma.$transaction(async (tx) => {
    const school = await tx.property.findFirst({
      /* tenant-scope: public application — the school's own tenant is the one the student joins. */
      where: { slug: input.schoolSlug, kind: "SCHOOL" },
      select: { id: true, tenantId: true },
    });
    if (!school) throw new NotASchoolError();
    const { schoolSlug: _slug, guardian: g, ...fields } = input;
    const guardian = minor && g
      ? await tx.guardian.create({
          data: { tenantId: school.tenantId, legalName: g.legalName, email: g.email.toLowerCase(), relationship: g.relationship },
          select: { id: true },
        })
      : null;
    const student = await tx.student.create({
      data: {
        tenantId: school.tenantId, propertyId: school.id, ...fields, email: fields.email?.toLowerCase() ?? null,
        state: "SUBMITTED", guardianId: guardian?.id ?? null,
      },
      select: { id: true, state: true },
    });
    await audit(tx, { tenantId: school.tenantId, userId: null }, "student.apply", "Student", student.id, {
      after: { propertyId: school.id, guardianId: guardian?.id ?? null },
    });
    return { id: student.id, state: student.state as StudentState, guardianRequired: minor };
  });
}

/** P9-FE-06 — a student under 18 applies with a parent or guardian. */
export class StudentApplicationGuardianMissingError extends Error {
  readonly status = 422;
  constructor() {
    super("A student under 18 needs a parent or guardian on the application.");
    this.name = "StudentApplicationGuardianMissingError";
  }
}

export async function getStudent(actor: Actor, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { ...whereFor(actor, "student", "read"), id: studentId },
    select: STUDENT_SELECT,
  });
  if (!student) throw new ForbiddenError("student", "read");
  return student;
}

export async function listStudents(actor: Actor) {
  return prisma.student.findMany({
    where: { ...whereFor(actor, "student", "read") },
    select: STUDENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Move a student through the lifecycle. Submitting is the student's own act
 * (`write`); every other move is a review (`approve`) — the school's advisor
 * or BTG. ACTIVE needs a verified guardian for a minor, on the athlete's rule.
 * INACTIVE records when they left, and touches no attribution.
 */
export async function transitionStudent(
  actor: Actor,
  studentId: string,
  to: StudentState,
  reviewerNotes?: string | null,
): Promise<{ id: string; state: StudentState }> {
  const action = SELF_MOVES.has(to) ? "write" : "approve";
  assertAllowed(actor, "student", action);
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", action), id: studentId },
      select: {
        id: true, state: true, birthDate: true, ageBand: true, guardianId: true,
        guardian: { select: { verifiedAt: true } },
      },
    });
    if (!student) throw new ForbiddenError("student", action);
    const from = student.state as StudentState;
    if (!canTransitionStudent(from, to)) throw new IllegalStudentTransitionError(from, to);
    if (to === "ACTIVE") {
      const readiness = guardianReadiness({
        birthDate: student.birthDate, ageBand: student.ageBand,
        guardianId: student.guardianId, guardianVerifiedAt: student.guardian?.verifiedAt ?? null,
      });
      if (readiness.status !== "not-required" && readiness.status !== "ready") {
        throw new StudentGuardianRequiredError(readiness.reason);
      }
    }
    const updated = await tx.student.update({
      where: { id: studentId },
      data: {
        state: to as Prisma.StudentUpdateInput["state"],
        ...(reviewerNotes !== undefined ? { reviewerNotes } : {}),
        ...(to === "INACTIVE" ? { leftAt: new Date() } : {}),
      },
      select: { id: true, state: true },
    });
    await audit(tx, actor, "student.transition", "Student", studentId, { before: { state: from }, after: { state: to } });
    /* P9-FE-06 — approval is what makes a login worth having, the same rule
       as athletes (P3-BE-15): the student's, and a linked guardian's, in the
       decision's own transaction. */
    if (to === "APPROVED") await provisionStudentLoginsIn(tx, actor, studentId);
    return { id: updated.id, state: updated.state as StudentState };
  });
}

/** Link an authorised adult to a minor student — the Guardian model, reused
 *  unchanged, never verified on creation (BTG verifies, as for an athlete). */
export async function linkStudentGuardian(
  actor: Actor,
  studentId: string,
  input: { legalName: string; email: string; phone?: string | null; relationship: string },
): Promise<{ guardianId: string }> {
  assertAllowed(actor, "student", "write");
  if (!(GUARDIAN_RELATIONSHIPS as readonly string[]).includes(input.relationship)) {
    throw new ProspectDecisionError(`Unknown guardian relationship. Expected one of ${GUARDIAN_RELATIONSHIPS.join(", ")}.`);
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", "write"), id: studentId },
      select: { id: true, birthDate: true, ageBand: true, guardianId: true },
    });
    if (!student) throw new ForbiddenError("student", "write");
    if (!requiresGuardian(student)) throw new StudentGuardianNotRequiredError();
    const guardian = await tx.guardian.create({
      data: {
        tenantId: actor.tenantId, legalName: input.legalName, email: input.email.toLowerCase(),
        phone: input.phone ?? null, relationship: input.relationship,
      },
      select: { id: true },
    });
    await tx.student.update({ where: { id: studentId }, data: { guardianId: guardian.id }, select: { id: true } });
    await audit(tx, actor, "student.guardianLink", "Student", studentId, {
      before: { guardianId: student.guardianId }, after: { guardianId: guardian.id },
    });
    return { guardianId: guardian.id };
  });
}

/* ── the code (P9-BE-07) ────────────────────────────────────────────────── */

/**
 * Issue — or return — the student's sales code. ONE code per student,
 * across every sale they ever originate: the code is a person's, not a
 * campaign's. Written by BTG, never by the student it credits.
 */
export async function issueStudentCode(actor: Actor, studentId: string): Promise<{ code: string }> {
  assertTenantWide(actor, "studentCode", "write");
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", "read"), id: studentId },
      select: { id: true, state: true, code: { select: { code: true } } },
    });
    if (!student) throw new ForbiddenError("studentCode", "write");
    if (student.code) return { code: student.code.code };
    if (student.state !== "ACTIVE") throw new StudentNotActiveError("be given a sales code");
    const code = randomBytes(9).toString("base64url");
    await tx.studentCode.create({ data: { tenantId: actor.tenantId, studentId, code }, select: { id: true } });
    await audit(tx, actor, "studentCode.issue", "Student", studentId, {});
    return { code };
  });
}

export async function readStudentCode(actor: Actor, studentId: string): Promise<{ code: string | null }> {
  assertAllowed(actor, "studentCode", "read");
  const row = await prisma.studentCode.findFirst({
    where: { ...whereFor(actor, "studentCode", "read"), studentId },
    select: { code: true },
  });
  if (!row) {
    /* Distinguish "no code yet" from "not yours": reachable students only. */
    await getStudent(actor, studentId);
    return { code: null };
  }
  return { code: row.code };
}

/**
 * GET /s/[code] — PUBLIC. What a business that scanned or typed a student's
 * code sees before enquiring: who sent them, and from which school. The
 * display name and school only — never the legal name, email, age or grade
 * of a (usually minor) student (P9-SEC-01).
 */
export async function resolveStudentCode(code: string): Promise<{ code: string; studentName: string; school: string }> {
  const row = await prisma.studentCode.findFirst({
    /* tenant-scope: public resolver — the code is globally unique and unguessable. */
    where: { code, student: { is: { state: "ACTIVE" } } },
    select: { code: true, student: { select: { displayName: true, property: { select: { name: true } } } } },
  });
  if (!row) throw new UnknownCodeError();
  return { code: row.code, studentName: row.student.displayName, school: row.student.property.name };
}

/* ── attribution (P9-BE-07, -13) and points (P9-BE-15) ──────────────────── */

/**
 * Credit a closed sale to the student whose code the brief carries. Called
 * by the ad sale (edition.ts `sellCampaignSlots`), inside its transaction —
 * the sale and its credit commit together or not at all.
 *
 * Writes one SalesAttribution row (never updated, never deleted — Postgres
 * enforces it), a SALES_500 accrual for each $500 the student's total crosses,
 * and — only for an account with no earlier business — the customer
 * relationship: STUDENT_ORIGINATED, at the student's school. An account that
 * already existed keeps its ownership; that is what "never moves" means.
 */
export async function attributeSale(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "tenantId" | "userId">,
  sale: { studentCodeId: string; sponsorId: string; campaignId: string; editionId: string | null; valueCents: number },
): Promise<{ attributionId: string } | null> {
  const code = await tx.studentCode.findFirst({
    where: { tenantId: actor.tenantId, id: sale.studentCodeId },
    select: { student: { select: { id: true, state: true, propertyId: true } } },
  });
  if (!code || code.student.state !== "ACTIVE") return null;
  const student = code.student;

  const before = await tx.salesAttribution.aggregate({
    where: { tenantId: actor.tenantId, studentId: student.id }, _sum: { value: true },
  });
  const row = await tx.salesAttribution.create({
    data: {
      tenantId: actor.tenantId, studentId: student.id, sponsorId: sale.sponsorId,
      campaignId: sale.campaignId, editionId: sale.editionId, value: sale.valueCents,
    },
    select: { id: true },
  });

  const priorTotal = before._sum.value ?? 0;
  const crossed = salesMilestonesCrossed(priorTotal, priorTotal + sale.valueCents);
  for (let i = 0; i < crossed; i++) {
    await tx.studentPointAccrual.create({
      data: { tenantId: actor.tenantId, studentId: student.id, reason: "SALES_500", points: pointsFor("SALES_500"), editionId: sale.editionId },
    });
  }

  const earlier = await tx.campaign.count({
    where: { tenantId: actor.tenantId, sponsorId: sale.sponsorId, id: { not: sale.campaignId } },
  });
  if (earlier === 0) {
    await tx.sponsor.updateMany({
      where: { tenantId: actor.tenantId, id: sale.sponsorId, ownership: "SPONSORX", schoolPropertyId: null },
      data: { ownership: "STUDENT_ORIGINATED", schoolPropertyId: student.propertyId, assignedStudentId: student.id },
    });
  }
  await audit(tx, actor as Actor, "saleAttribution.create", "Student", student.id, {
    after: { sponsorId: sale.sponsorId, campaignId: sale.campaignId, value: sale.valueCents },
  });
  return { attributionId: row.id };
}

export async function studentSales(actor: Actor, studentId: string) {
  assertAllowed(actor, "saleAttribution", "read");
  await getStudent(actor, studentId);
  const rows = await prisma.salesAttribution.findMany({
    where: { ...whereFor(actor, "saleAttribution", "read"), studentId },
    select: { id: true, sponsorId: true, campaignId: true, editionId: true, value: true, originatedAt: true },
    orderBy: { originatedAt: "desc" },
  });
  return { sales: rows, totalCents: rows.reduce((s, r) => s + r.value, 0) };
}

export async function studentPointsBalance(actor: Actor, studentId: string) {
  assertAllowed(actor, "studentPoints", "read");
  await getStudent(actor, studentId);
  const rows = await prisma.studentPointAccrual.findMany({
    where: { ...whereFor(actor, "studentPoints", "read"), studentId },
    select: { id: true, reason: true, points: true, editionId: true, accruedAt: true },
    orderBy: { accruedAt: "desc" },
  });
  return { accruals: rows, balance: rows.reduce((s, r) => s + r.points, 0) };
}

/** Record points for published work — ARTICLE, INTERVIEW, PHOTO,
 *  APPOINTMENT, VIEWS_BONUS. Written by BTG (the system), never by the
 *  student credited. SALES_500 accrues only from an attributed sale. */
export async function accruePoints(
  actor: Actor,
  studentId: string,
  input: { reason: Exclude<PointReason, "SALES_500">; editionId?: string | null; points?: number },
): Promise<{ id: string; points: number }> {
  assertTenantWide(actor, "studentPoints", "write");
  const points = pointsFor(input.reason, input.points);
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", "read"), id: studentId }, select: { id: true },
    });
    if (!student) throw new ForbiddenError("studentPoints", "write");
    if (input.editionId) {
      const edition = await tx.edition.findFirst({ where: { tenantId: actor.tenantId, id: input.editionId }, select: { id: true } });
      if (!edition) throw new ForbiddenError("studentPoints", "write");
    }
    const row = await tx.studentPointAccrual.create({
      data: { tenantId: actor.tenantId, studentId, reason: input.reason, points, editionId: input.editionId ?? null },
      select: { id: true, points: true },
    });
    await audit(tx, actor, "studentPoints.accrue", "Student", studentId, { after: { reason: input.reason, points } });
    return row;
  });
}

/* ── representation (P9-BE-13) ──────────────────────────────────────────── */

/**
 * Hand an account to another student — or to nobody (null). Touches
 * `Sponsor.assignedStudentId` and NOTHING else: not ownership, not a single
 * attribution row. Who originated a sale is history; who works the account
 * now is a staffing decision.
 */
export async function assignAccountStudent(actor: Actor, sponsorId: string, studentId: string | null): Promise<{ sponsorId: string; assignedStudentId: string | null }> {
  assertTenantWide(actor, "sponsor", "write");
  return prisma.$transaction(async (tx) => {
    const sponsor = await tx.sponsor.findFirst({
      where: { ...whereFor(actor, "sponsor", "write"), id: sponsorId },
      select: { id: true, assignedStudentId: true },
    });
    if (!sponsor) throw new ForbiddenError("sponsor", "write");
    if (studentId) {
      const student = await tx.student.findFirst({ where: { tenantId: actor.tenantId, id: studentId }, select: { state: true } });
      if (!student) throw new ForbiddenError("student", "read");
      if (student.state !== "ACTIVE") throw new StudentNotActiveError("be assigned an account");
    }
    await tx.sponsor.update({ where: { id: sponsorId }, data: { assignedStudentId: studentId }, select: { id: true } });
    await audit(tx, actor, "sponsor.assignStudent", "Sponsor", sponsorId, {
      before: { assignedStudentId: sponsor.assignedStudentId }, after: { assignedStudentId: studentId },
    });
    return { sponsorId, assignedStudentId: studentId };
  });
}

/* ── prospects: the Sponsor Acceptance Check (P9-BE-13, §5.6) ───────────── */

export async function submitProspect(
  actor: Actor,
  studentId: string,
  input: { businessName: string; category: string },
): Promise<{ id: string }> {
  assertAllowed(actor, "studentProspect", "write");
  if (!(BRAND_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new ProspectDecisionError("Unknown brand category.");
  }
  if (NOT_FOR_STUDENTS.has(input.category)) {
    throw new ProspectDecisionError("That category is not one the student programme sells.");
  }
  return prisma.$transaction(async (tx) => {
    /* A student submits their own prospects (student.write is `own`); staff
       may file one for any student in the tenant. */
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", "write"), id: studentId }, select: { id: true, state: true },
    });
    if (!student) throw new ForbiddenError("studentProspect", "write");
    if (student.state !== "ACTIVE") throw new StudentNotActiveError("submit a prospect");
    const row = await tx.studentProspect.create({
      data: { tenantId: actor.tenantId, studentId, businessName: input.businessName, category: input.category },
      select: { id: true },
    });
    await audit(tx, actor, "studentProspect.submit", "StudentProspect", row.id, { after: input });
    return row;
  });
}

export async function listProspects(actor: Actor, studentId: string) {
  assertAllowed(actor, "studentProspect", "read");
  await getStudent(actor, studentId);
  return prisma.studentProspect.findMany({
    where: { ...whereFor(actor, "studentProspect", "read"), studentId },
    select: { id: true, businessName: true, category: true, state: true, reasonCode: true, redirectCategories: true, decidedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Categories someone already holds exclusively at this school: the
 *  presenting sponsor of any edition still being planned, sold or produced. */
async function heldCategories(tx: Prisma.TransactionClient, tenantId: string, propertyId: string): Promise<Set<string>> {
  const held = await tx.adSlot.findMany({
    where: {
      tenantId, kind: "PRESENTING", campaignId: { not: null },
      edition: { is: { state: { in: ["PLANNING", "SELLING", "CLOSED", "IN_PRODUCTION"] }, publication: { is: { propertyId } } } },
    },
    select: { campaign: { select: { brief: { select: { categories: true } } } } },
  });
  return new Set(held.flatMap((s) => s.campaign?.brief?.categories ?? []));
}

/**
 * Commercial operations decide a prospect. A rejection carries a reason code,
 * notifies the student, and COSTS THEM NO SALES CREDIT — no attribution row or
 * point is touched, here or anywhere a rejection is recorded. Where the refusal
 * was a category someone else holds, the student is offered the categories
 * still open at their school.
 */
export async function decideProspect(
  actor: Actor,
  prospectId: string,
  input: { decision: "ACCEPT" | "REJECT"; reasonCode?: ProspectRejectionReason },
): Promise<{ id: string; state: "ACCEPTED" | "REJECTED"; redirectCategories: string[] }> {
  assertTenantWide(actor, "studentProspect", "approve");
  if (input.decision === "REJECT" && !input.reasonCode) {
    throw new ProspectDecisionError("A rejection needs a reason code — the student is told why.");
  }
  return prisma.$transaction(async (tx) => {
    const prospect = await tx.studentProspect.findFirst({
      where: { ...whereFor(actor, "studentProspect", "approve"), id: prospectId },
      select: {
        id: true, state: true, businessName: true, category: true,
        student: { select: { id: true, displayName: true, email: true, propertyId: true, guardian: { select: { email: true } } } },
      },
    });
    if (!prospect) throw new ForbiddenError("studentProspect", "approve");
    if (prospect.state !== "SUBMITTED") throw new ProspectDecisionError(`This prospect was already ${prospect.state.toLowerCase()}.`);

    let redirectCategories: string[] = [];
    if (input.decision === "REJECT" && input.reasonCode === "CATEGORY_EXCLUSIVE") {
      const held = await heldCategories(tx, actor.tenantId, prospect.student.propertyId);
      held.add(prospect.category);
      redirectCategories = BRAND_CATEGORIES.filter((c) => !held.has(c) && !NOT_FOR_STUDENTS.has(c));
    }
    const state = input.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    await tx.studentProspect.update({
      where: { id: prospectId },
      data: { state, reasonCode: input.reasonCode ?? null, redirectCategories, decidedAt: new Date() },
      select: { id: true },
    });
    await audit(tx, actor, "studentProspect.decide", "StudentProspect", prospectId, {
      after: { state, reasonCode: input.reasonCode ?? null },
    });

    if (state === "REJECTED") {
      /* The student hears it from SponsorX, not from silence. A minor with no
         email of their own is reached through their guardian. */
      const to = prospect.student.email ?? prospect.student.guardian?.email ?? null;
      if (to) {
        await enqueue(tx, actor.tenantId, "notify.email", {
          tenantId: actor.tenantId,
          template: "student.prospectDeclined",
          to,
          idempotencyKey: `student.prospectDeclined:${prospectId}`,
          data: {
            studentName: prospect.student.displayName,
            businessName: prospect.businessName,
            reason: input.reasonCode!,
            openCategories: redirectCategories.join(", "),
          },
        });
      }
    }
    return { id: prospectId, state, redirectCategories };
  });
}
