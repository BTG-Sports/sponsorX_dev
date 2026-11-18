/**
 * A NEXT student's own profile — POL-BE-101 (found in staging practice,
 * 2026-11-17: a signed-in student had no page showing their own details).
 *
 * WHOSE RECORD. Always the caller's own: the Student row their login is
 * linked to (`User.studentId`, carried on the actor), inside their tenant
 * (`whereFor(student, …)` keeps the tenant and the matrix's `own` scope).
 * Nothing in the request names a student, so there is no id to swap. Only a
 * STUDENT login reaches it — an advisor, a guardian, BTG staff and a sponsor
 * are refused (403), even when they could read the row another way.
 *
 * WHAT IS EDITABLE. The display name, and nothing else. It is what is
 * published about a student (P9-SEC-01), so it is the student's to choose;
 * it takes effect at once and is audited, the athlete's "ordinary edit" rule
 * (athlete-profile-change.ts). The legal name, graduation year, school, roles,
 * state, date of birth and guardian are corrected by the school's faculty
 * advisor, so the read carries the advisor logins' email addresses (the data
 * model keeps no advisor name). A student who has left the programme
 * (INACTIVE) or was not accepted (REJECTED) changes nothing.
 *
 * WHAT IS NOT SHOWN, even to the student: the date of birth and age band
 * (they decide `minor` and stop there), the email on the application, the
 * guardian's name and contact (a minor sees only linked / verified), the
 * reviewer's notes and the roster reasons. No tax ID and no bank detail
 * exists on a student to show.
 */
import type { Actor } from "../auth/actor";
import { whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { requiresGuardian } from "./guardian-rules";
import type { StudentState } from "./student-state";
import type { MastheadRole } from "./student";

export class StudentProfileLockedError extends Error {
  readonly status = 409;
  readonly code = "student_profile_locked";
  constructor() {
    super("Your profile can't be changed: you're no longer on the programme. Ask your school's faculty advisor.");
    this.name = "StudentProfileLockedError";
  }
}

/** States in which a student no longer changes their own record. */
const LOCKED: ReadonlySet<string> = new Set<StudentState>(["INACTIVE", "REJECTED"]);

/** The most advisor addresses a profile lists. */
const MAX_ADVISORS = 5;

export type StudentProfile = {
  id: string;
  legalName: string;
  displayName: string;
  gradYear: number | null;
  school: { name: string };
  masthead: MastheadRole[];
  state: StudentState;
  leftAt: string | null;
  code: string | null;
  minor: boolean;
  guardian: { linked: boolean; verified: boolean } | null;
  advisors: Array<{ email: string; name: string | null }>;
  editable: ["displayName"];
};

/**
 * The caller's own Student row, as a where. A login that is not a STUDENT,
 * or a STUDENT with no linked record, is refused before any query: the
 * matrix gives an advisor or a guardian `student` reads too, but this is the
 * student's own page, not another way into theirs.
 */
function ownStudent(actor: Actor, action: "read" | "write") {
  if (!actor.roles.includes("STUDENT") || !actor.studentId) throw new ForbiddenError("student", action);
  return { ...whereFor(actor, "student", action), id: actor.studentId };
}

const PROFILE_SELECT = {
  id: true, tenantId: true, propertyId: true, legalName: true, displayName: true, gradYear: true,
  masthead: true, state: true, leftAt: true, birthDate: true, ageBand: true,
  property: { select: { name: true } },
  guardian: { select: { verifiedAt: true, rejectedAt: true } },
  code: { select: { code: true } },
} as const;

/** GET /students/me — the signed-in student's own profile. */
export async function getOwnStudentProfile(actor: Actor): Promise<StudentProfile> {
  const where = ownStudent(actor, "read");
  const row = await prisma.student.findFirst({ where: { ...where }, select: PROFILE_SELECT });
  if (!row) throw new ForbiddenError("student", "read");
  const advisors = await prisma.user.findMany({
    /* The student's own school, in the student's own tenant (the row above). */
    where: { tenantId: row.tenantId, propertyId: row.propertyId, roles: { has: "ADVISOR" }, disabledAt: null },
    select: { email: true, fullName: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_ADVISORS,
  });
  const minor = requiresGuardian({ birthDate: row.birthDate, ageBand: row.ageBand });
  return {
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    gradYear: row.gradYear,
    school: { name: row.property.name },
    masthead: row.masthead as MastheadRole[],
    state: row.state as StudentState,
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
    code: row.code?.code ?? null,
    minor,
    /* Status only: whether one is linked and BTG has verified them. */
    guardian: minor
      ? { linked: row.guardian !== null, verified: Boolean(row.guardian?.verifiedAt && !row.guardian.rejectedAt) }
      : null,
    /* POL-BE-103 — the name an advisor set on their own profile, beside the email. */
    advisors: advisors.map((a) => ({ email: a.email, name: a.fullName })),
    editable: ["displayName"],
  };
}

/** Inner runs of whitespace become one space; the contract has trimmed the ends. */
export const tidyDisplayName = (name: string) => name.replace(/\s+/g, " ").trim();

/**
 * PATCH /students/me — the student changes their display name. Effective at
 * once, audited with the before and after. The same name again writes and
 * audits nothing. Answers the profile as it now stands.
 */
export async function updateOwnDisplayName(actor: Actor, displayName: string): Promise<StudentProfile> {
  const where = ownStudent(actor, "write");
  const name = tidyDisplayName(displayName);
  await prisma.$transaction(async (tx) => {
    const row = await tx.student.findFirst({ where: { ...where }, select: { id: true, displayName: true, state: true } });
    if (!row) throw new ForbiddenError("student", "write");
    if (LOCKED.has(row.state)) throw new StudentProfileLockedError();
    const before = row.displayName;
    if (before === name) return;
    /* tenant-scope: the caller's own row, loaded above through whereFor(student, write). */
    await tx.student.update({ where: { id: row.id }, data: { displayName: name }, select: { id: true } });
    await audit(tx, actor, "student.displayNameUpdate", "Student", row.id, {
      before: { displayName: before }, after: { displayName: name },
    });
  });
  return getOwnStudentProfile(actor);
}
