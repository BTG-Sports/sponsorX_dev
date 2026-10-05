import { z } from "./zod";

import { STUDENT_STATES } from "../domain/student-state";
import { MASTHEAD_ROLES, PROSPECT_REJECTION_REASONS } from "../domain/student";
import { POINT_REASONS } from "../domain/student-points";
import { BrandCategory } from "./campaign";

/* --------------------------------------------------------------------------
   SponsorX NEXT students on the wire — P9-BE-04, -07, -13, -15.
   -------------------------------------------------------------------------- */

export const StudentState = z.enum(STUDENT_STATES).meta({
  id: "StudentState",
  description: "Mirrors AthleteState, advisor-reviewed, plus INACTIVE (left the programme). A minor reaches ACTIVE only with a verified guardian.",
});

/** Today as an ISO date (UTC) — the latest birthDate that can be true. */
const todayIso = () => new Date().toISOString().slice(0, 10);

const studentFields = {
  legalName: z.string().min(1).max(200),
  displayName: z.string().min(1).max(100),
  /** Optional on purpose — school email must not be a hard requirement. */
  email: z.email().nullable().optional(),
  gradYear: z.number().int().min(2020).max(2040).nullable().optional(),
  /* The athlete contract's sanity bounds (contracts/athlete.ts): a future
     date or one before 1900 makes every age rule meaningless. */
  birthDate: z.iso
    .date()
    .refine((d) => d >= "1900-01-01", "birthDate must be 1900 or later.")
    .refine((d) => d <= todayIso(), "birthDate can't be in the future.")
    .nullable()
    .optional(),
  ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).nullable().optional(),
  masthead: z.array(z.enum(MASTHEAD_ROLES)).min(1).max(7),
};

export const StudentInput = z
  .object({ propertyId: z.string().min(1), ...studentFields })
  .meta({ id: "StudentInput" });

export const StudentApplicationInput = z
  .object({
    schoolSlug: z.string().min(1).max(120),
    ...studentFields,
    /** P9-FE-06 — required for a student under 18 (the athlete's minor rule), ignored otherwise. */
    guardian: z
      .object({
        legalName: z.string().min(1).max(200),
        email: z.email(),
        relationship: z.enum(["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"]),
      })
      .nullable()
      .optional(),
  })
  /* The athlete intake's one-of rule (AthleteApplicationInput), reused as the
     task requires. Without it a request carrying neither date was read as an
     adult and skipped the guardian — an unknown age must never pass as one. */
  .refine((v) => (v.birthDate ?? undefined) !== undefined || (v.ageBand ?? undefined) !== undefined, {
    message:
      "Either birthDate or ageBand is required: the guardian workflow (§26) cannot be decided without knowing whether the applicant is a minor.",
    path: ["birthDate"],
  })
  .meta({ id: "StudentApplicationInput", description: "The public 'Become the Media' application. Lands SUBMITTED for the school's advisor. Needs a birthDate or an ageBand." });

export const StudentTransitionInput = z
  .object({ to: StudentState, reviewerNotes: z.string().max(2000).nullable().optional() })
  .meta({ id: "StudentTransitionInput" });

export const StudentGuardianInput = z
  .object({
    legalName: z.string().min(1).max(200),
    email: z.email(),
    phone: z.string().max(40).nullable().optional(),
    relationship: z.enum(["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"]),
  })
  .meta({ id: "StudentGuardianInput" });

export const PointsInput = z
  .object({
    reason: z.enum(POINT_REASONS.filter((r) => r !== "SALES_500") as [string, ...string[]]),
    editionId: z.string().min(1).nullable().optional(),
    /** VIEWS_BONUS only — every other reason has a fixed value. */
    points: z.number().int().positive().max(1000).optional(),
  })
  .meta({ id: "PointsInput", description: "Accrue points for published work. SALES_500 accrues only from an attributed sale." });

export const ProspectInput = z
  .object({ businessName: z.string().min(1).max(200), category: BrandCategory })
  .meta({ id: "ProspectInput" });

export const ProspectDecisionInput = z
  .object({ decision: z.enum(["ACCEPT", "REJECT"]), reasonCode: z.enum(PROSPECT_REJECTION_REASONS).optional() })
  .meta({ id: "ProspectDecisionInput", description: "A rejection needs a reason code, notifies the student, and costs them no sales credit." });

/* P9-BE-20 — the school's email domain, set by its advisor or BTG. An adult
   student is approved from the roster only with an application email on it.
   The part after the "@"; null clears it. A public mail provider is refused. */
export const SchoolEmailDomainInput = z
  .object({ emailDomain: z.string().min(1).max(253).nullable() })
  .strict()
  .meta({
    id: "SchoolEmailDomainInput",
    description: "The school's email domain (the part after the @), or null to clear it. A public mail provider (gmail.com and the like) is refused (422).",
  });

export const AssignStudentInput = z
  .object({ studentId: z.string().min(1).nullable() })
  .meta({ id: "AssignStudentInput", description: "Who works the account now. Changes nothing about who originated a sale." });
