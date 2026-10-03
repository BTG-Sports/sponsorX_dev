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
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import { BRAND_CATEGORIES } from "./brand-categories";
import { GUARDIAN_RELATIONSHIPS, requiresGuardian } from "./guardian-rules";
import { SELF_MOVES, type StudentState } from "./student-state";
import { pointsFor, salesMilestonesCrossed, type PointReason } from "./student-points";
import { readPage, type PageRequest } from "../lib/paging";
import { NOT_FOR_STUDENTS } from "./student-categories";
import {
  decideProspectIn,
  issueStudentCodeIn,
  moveStudentIn,
  ProspectDecisionError,
  PROSPECT_DECIDE_SELECT,
  STUDENT_MOVE_SELECT,
  StudentNotActiveError,
} from "./student-moves";
import { autoDecideProspectIn, autoReviewStudentIn } from "./student-auto";

/* Moved to student-moves.ts with the moves that throw them; re-exported where they always were. */
export { ProspectDecisionError, StudentNotActiveError } from "./student-moves";

export const MASTHEAD_ROLES = ["EDITOR", "WRITER", "PHOTOGRAPHER", "VIDEO", "DESIGNER", "SALES", "CORRESPONDENT"] as const;
export type MastheadRole = (typeof MASTHEAD_ROLES)[number];

/* P9-SEC-01 — moved to student-categories.ts (pure, for the rules); re-exported where it always was. */
export { NOT_FOR_STUDENTS } from "./student-categories";

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

/** P9-BE-20 — what the reviewers (the advisor, BTG) also see: why an
 *  application waits for them, and whether the system approved it. Never a
 *  student's or a guardian's read — they are told "your school is
 *  reviewing", not what the roster said. */
const REVIEWER_SELECT = { ...STUDENT_SELECT, reviewReasons: true, autoApprovedAt: true } as const;

/** Those who may decide an application (student.approve) read the review; nobody else does. */
const isReviewer = (actor: Actor) => !["deny", "deferred"].includes(scopeFor(actor.roles, "student", "approve"));
const selectFor = (actor: Actor) => (isReviewer(actor) ? REVIEWER_SELECT : STUDENT_SELECT);

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
 * the school's tenant and is picked up and decided from the roster in the
 * same transaction (P9-BE-20): approved on an exact match, otherwise waiting
 * for the school's advisor with the reasons.
 *
 * The answer is the RECEIPT — always `state: "SUBMITTED"`, whatever the
 * roster said. An anonymous caller is never told whether a name is on a
 * school's list of (mostly minor) students: the claim flow's rule
 * (featured.ts `submitClaim`). The student reads their status once signed in.
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
    await autoReviewStudentIn(tx, school.tenantId, student.id);
    return { id: student.id, state: "SUBMITTED", guardianRequired: minor };
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
    select: selectFor(actor),
  });
  if (!student) throw new ForbiddenError("student", "read");
  return student;
}

export async function listStudents(actor: Actor) {
  return prisma.student.findMany({
    where: { ...whereFor(actor, "student", "read") },
    select: selectFor(actor),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The advisor desk's five groups (2026-09-29, server paging) — the same
 * split the desk has always drawn, now a WHERE instead of a browser filter.
 * Every state lands in exactly one group.
 */
export const STUDENT_GROUPS = {
  waiting: ["SUBMITTED", "UNDER_REVIEW"],
  approved: ["APPROVED"],
  with: ["CHANGES_REQUESTED", "DRAFT"],
  roster: ["ACTIVE", "SUSPENDED"],
  closed: ["REJECTED", "INACTIVE"],
} as const satisfies Record<string, readonly StudentState[]>;
export type StudentGroup = keyof typeof STUDENT_GROUPS;
export const STUDENT_GROUP_KEYS = Object.keys(STUDENT_GROUPS) as StudentGroup[];

const groupOf = (state: string): StudentGroup | undefined =>
  STUDENT_GROUP_KEYS.find((g) => (STUDENT_GROUPS[g] as readonly string[]).includes(state));

/** `?q=` over the two names — both already in STUDENT_SELECT, so a search
 *  can only find what the caller would have been shown anyway. */
const studentSearch = (q?: string): Prisma.StudentWhereInput =>
  q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { legalName: { contains: q, mode: "insensitive" } }] } : {};

/**
 * GET /students?page= — one page of the caller's students, optionally one
 * group and a name search, plus every group's count (groupBy, not a fold):
 * the counts honour the search but not the group, so the desk's tabs say
 * what each would hold.
 *
 * P9-BE-20 — `auto` (reviewers only): the students the system approved from
 * the roster, newest approval first, whatever their state now; and the
 * reviewers' summary carries how many there are (`autoApproved`).
 */
export async function listStudentsPage(actor: Actor, req: PageRequest, opts: { group?: StudentGroup; q?: string; auto?: boolean } = {}) {
  const reviewer = isReviewer(actor);
  const auto = Boolean(opts.auto) && reviewer;
  const scope = { ...whereFor(actor, "student", "read"), ...studentSearch(opts.q) };
  const grouped: Prisma.StudentWhereInput = opts.group ? { ...scope, state: { in: [...STUDENT_GROUPS[opts.group]] } } : scope;
  const where: Prisma.StudentWhereInput = auto ? { ...grouped, autoApprovedAt: { not: null } } : grouped;
  const orderBy: Prisma.StudentOrderByWithRelationInput[] = auto ? [{ autoApprovedAt: "desc" }, { id: "desc" }] : [{ createdAt: "desc" }, { id: "desc" }];
  const [{ rows, page }, counts, autoApproved] = await Promise.all([
    readPage(
      req,
      () => prisma.student.count({ where: { ...where } }),
      (skip, take) =>
        prisma.student.findMany({ where: { ...where }, select: selectFor(actor), orderBy, skip, take }),
    ),
    prisma.student.groupBy({
      /* tenant-scope: `scope` is whereFor(student, read) plus the name search. */
      by: ["state"], where: { ...scope }, _count: { _all: true },
    }),
    reviewer ? prisma.student.count({ where: { ...scope, autoApprovedAt: { not: null } } /* tenant-scope: whereFor(student, read). */ }) : Promise.resolve(null),
  ]);
  const groups = Object.fromEntries(STUDENT_GROUP_KEYS.map((g) => [g, 0])) as Record<StudentGroup, number>;
  for (const c of counts) {
    const g = groupOf(c.state);
    if (g) groups[g] += c._count._all;
  }
  const all = STUDENT_GROUP_KEYS.reduce((n, g) => n + groups[g], 0);
  return { students: rows, page, summary: { groups, all, ...(autoApproved !== null ? { autoApproved } : {}) } };
}

/**
 * Move a student through the lifecycle. Submitting is the student's own act
 * (`write`); every other move is a review (`approve`) — the school's advisor
 * or BTG. ACTIVE needs a verified guardian for a minor, on the athlete's rule.
 * INACTIVE records when they left, and touches no attribution.
 *
 * P9-BE-20 — the system carries on from a person's move in the same
 * transaction: a submission is picked up and decided from the roster, an
 * approval activates at once when the guardian gate is met, and ACTIVE
 * issues the sales code (student-moves.ts). The answer is where the student
 * ended up.
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
      select: STUDENT_MOVE_SELECT,
    });
    if (!student) throw new ForbiddenError("student", action);
    const moved = await moveStudentIn(tx, actor, student, to, { reviewerNotes });
    if (moved !== "SUBMITTED") return { id: studentId, state: moved };
    await autoReviewStudentIn(tx, student.tenantId, studentId);
    const now = await tx.student.findFirstOrThrow({ where: { tenantId: student.tenantId, id: studentId }, select: { state: true } });
    return { id: studentId, state: now.state as StudentState };
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
 * campaign's. Written by BTG, never by the student it credits — and, since
 * P9-BE-20, by the system the moment a student goes ACTIVE.
 */
export async function issueStudentCode(actor: Actor, studentId: string): Promise<{ code: string }> {
  assertTenantWide(actor, "studentCode", "write");
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { ...whereFor(actor, "student", "read"), id: studentId },
      select: { id: true, tenantId: true },
    });
    if (!student) throw new ForbiddenError("studentCode", "write");
    return issueStudentCodeIn(tx, actor, student.tenantId, studentId);
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
  /* A NUL byte can never be a code, and Postgres refuses it (QA pass 7, F-1). */
  if (code.includes("\0")) throw new UnknownCodeError();
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
  /* P9-BE-18 — the system (userId null) credits the student for an automatic ad sale. */
  actor: { tenantId: string; userId: string | null },
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

const SALE_SELECT = { id: true, sponsorId: true, campaignId: true, editionId: true, value: true, originatedAt: true } as const;
const ACCRUAL_SELECT = { id: true, reason: true, points: true, editionId: true, accruedAt: true } as const;

/**
 * A student's attribution ledger. `totalCents` is the database's `_sum`, not
 * a fold over the rows — so a paged read (`req`) still answers the all-time
 * total. Without `req` the response is the legacy one: every row, newest
 * first.
 */
export async function studentSales(actor: Actor, studentId: string, req?: PageRequest | null) {
  assertAllowed(actor, "saleAttribution", "read");
  await getStudent(actor, studentId);
  const where = { ...whereFor(actor, "saleAttribution", "read"), studentId };
  const sum = prisma.salesAttribution.aggregate({ where: { ...where }, _sum: { value: true } });
  if (!req) {
    const [rows, agg] = await Promise.all([
      prisma.salesAttribution.findMany({ where: { ...where }, select: SALE_SELECT, orderBy: { originatedAt: "desc" } }),
      sum,
    ]);
    return { sales: rows, totalCents: agg._sum.value ?? 0 };
  }
  const [{ rows, page }, agg] = await Promise.all([
    readPage(
      req,
      () => prisma.salesAttribution.count({ where: { ...where } }),
      (skip, take) =>
        prisma.salesAttribution.findMany({ where: { ...where }, select: SALE_SELECT, orderBy: [{ originatedAt: "desc" }, { id: "desc" }], skip, take }),
    ),
    sum,
  ]);
  return { sales: rows, totalCents: agg._sum.value ?? 0, page };
}

/** A student's points. `balance` is `_sum(points)` — never stored, never a
 *  JS fold; a paged read still answers the whole balance. */
export async function studentPointsBalance(actor: Actor, studentId: string, req?: PageRequest | null) {
  assertAllowed(actor, "studentPoints", "read");
  await getStudent(actor, studentId);
  const where = { ...whereFor(actor, "studentPoints", "read"), studentId };
  const sum = prisma.studentPointAccrual.aggregate({ where: { ...where }, _sum: { points: true } });
  if (!req) {
    const [rows, agg] = await Promise.all([
      prisma.studentPointAccrual.findMany({ where: { ...where }, select: ACCRUAL_SELECT, orderBy: { accruedAt: "desc" } }),
      sum,
    ]);
    return { accruals: rows, balance: agg._sum.points ?? 0 };
  }
  const [{ rows, page }, agg] = await Promise.all([
    readPage(
      req,
      () => prisma.studentPointAccrual.count({ where: { ...where } }),
      (skip, take) =>
        prisma.studentPointAccrual.findMany({ where: { ...where }, select: ACCRUAL_SELECT, orderBy: [{ accruedAt: "desc" }, { id: "desc" }], skip, take }),
    ),
    sum,
  ]);
  return { accruals: rows, balance: agg._sum.points ?? 0, page };
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

/**
 * A student brings a business in. P9-BE-21 — decided at once, as the
 * system, in the same transaction (student-auto.ts `autoDecideProspectIn`):
 * refused when another sponsor holds the category, accepted when nothing is
 * in the way, otherwise held for SALES with the reasons. The answer says
 * where it landed — never why it was held.
 */
export async function submitProspect(
  actor: Actor,
  studentId: string,
  input: { businessName: string; category: string },
): Promise<{ id: string; state: ProspectState }> {
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
      where: { ...whereFor(actor, "student", "write"), id: studentId }, select: { id: true, tenantId: true, state: true },
    });
    if (!student) throw new ForbiddenError("studentProspect", "write");
    if (student.state !== "ACTIVE") throw new StudentNotActiveError("submit a prospect");
    const row = await tx.studentProspect.create({
      data: { tenantId: student.tenantId, studentId, businessName: input.businessName, category: input.category },
      select: { id: true },
    });
    await audit(tx, actor, "studentProspect.submit", "StudentProspect", row.id, { after: input });
    await autoDecideProspectIn(tx, student.tenantId, row.id);
    const now = await tx.studentProspect.findFirstOrThrow({ where: { tenantId: student.tenantId, id: row.id }, select: { state: true } });
    return { id: row.id, state: now.state as ProspectState };
  });
}

const PROSPECT_SELECT = {
  id: true, businessName: true, category: true, state: true, reasonCode: true, redirectCategories: true, decidedAt: true, createdAt: true,
} as const;
export const PROSPECT_STATES = ["SUBMITTED", "ACCEPTED", "REJECTED"] as const;
export type ProspectState = (typeof PROSPECT_STATES)[number];

export async function listProspects(actor: Actor, studentId: string) {
  assertAllowed(actor, "studentProspect", "read");
  await getStudent(actor, studentId);
  return prisma.studentProspect.findMany({
    where: { ...whereFor(actor, "studentProspect", "read"), studentId },
    select: PROSPECT_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * GET /students/:id/prospects?page= — one page, optionally narrowed to
 * states (`?state=SUBMITTED,ACCEPTED`), plus the per-state counts (groupBy)
 * the portal's "with SponsorX" tile and filter tabs read.
 */
export async function listProspectsPage(actor: Actor, studentId: string, req: PageRequest, opts: { states?: ProspectState[] } = {}) {
  assertAllowed(actor, "studentProspect", "read");
  await getStudent(actor, studentId);
  const scope = { ...whereFor(actor, "studentProspect", "read"), studentId };
  const where: Prisma.StudentProspectWhereInput = opts.states?.length ? { ...scope, state: { in: opts.states } } : scope;
  const [{ rows, page }, counts] = await Promise.all([
    readPage(
      req,
      () => prisma.studentProspect.count({ where: { ...where } }),
      (skip, take) =>
        prisma.studentProspect.findMany({ where: { ...where }, select: PROSPECT_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    ),
    prisma.studentProspect.groupBy({
      /* tenant-scope: `scope` is whereFor(studentProspect, read) and this student. */
      by: ["state"], where: { ...scope }, _count: { _all: true },
    }),
  ]);
  const states = Object.fromEntries(PROSPECT_STATES.map((s) => [s, 0])) as Record<ProspectState, number>;
  for (const c of counts) if (c.state in states) states[c.state as ProspectState] += c._count._all;
  return { prospects: rows, page, summary: { states, all: PROSPECT_STATES.reduce((n, s) => n + states[s], 0) } };
}

/* ── the prospect desk (P9-BE-21, P9-FE-11) ─────────────────────────────── */

export const PROSPECT_DESK_VIEWS = ["held", "auto", "all"] as const;
export type ProspectDeskView = (typeof PROSPECT_DESK_VIEWS)[number];

/** The desk's row: the student's own fields plus why it was held, whether
 *  the system decided it, and who brought it in from which school. */
const PROSPECT_DESK_SELECT = {
  ...PROSPECT_SELECT, reviewReasons: true, decidedAutomatically: true,
  student: { select: { id: true, displayName: true, property: { select: { name: true } } } },
} as const;

/**
 * GET /prospects?page= — SALES and BTG's desk across the tenant. `view`:
 * `held` (the default — undecided, waiting on a person, with the reasons),
 * `auto` (decided by the system) or `all`; and every view's count.
 */
export async function listProspectDesk(actor: Actor, req: PageRequest, opts: { view?: ProspectDeskView } = {}) {
  assertTenantWide(actor, "studentProspect", "approve");
  const scope = { ...whereFor(actor, "studentProspect", "approve") };
  const view = opts.view ?? "held";
  const narrow: Record<ProspectDeskView, Prisma.StudentProspectWhereInput> = {
    held: { state: "SUBMITTED" }, auto: { decidedAutomatically: true }, all: {},
  };
  const where = { ...scope, ...narrow[view] };
  const [{ rows, page }, held, auto, all] = await Promise.all([
    readPage(
      req,
      () => prisma.studentProspect.count({ where: { ...where } }),
      (skip, take) =>
        prisma.studentProspect.findMany({ where: { ...where }, select: PROSPECT_DESK_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    ),
    prisma.studentProspect.count({ where: { ...scope, ...narrow.held } /* tenant-scope: whereFor(studentProspect, approve). */ }),
    prisma.studentProspect.count({ where: { ...scope, ...narrow.auto } /* tenant-scope: whereFor(studentProspect, approve). */ }),
    prisma.studentProspect.count({ where: { ...scope } /* tenant-scope: whereFor(studentProspect, approve). */ }),
  ]);
  return { prospects: rows, page, summary: { held, auto, all } };
}

/**
 * Commercial operations decide a prospect — the one the system held, or any
 * still undecided. A rejection carries a reason code, notifies the student
 * (and a minor's guardian), and COSTS THEM NO SALES CREDIT (student-moves.ts
 * `decideProspectIn`, the same move the system makes).
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
      select: PROSPECT_DECIDE_SELECT,
    });
    if (!prospect) throw new ForbiddenError("studentProspect", "approve");
    return decideProspectIn(tx, actor, prospect, input);
  });
}
