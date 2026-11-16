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

/* POL-BE-101 — a signed-in student's own profile. The display name is the one
   field they change themselves; everything else is read-only and corrected by
   their school's faculty advisor. The record is the caller's own (resolved
   from the login, never named in the body), so the body is strict: a
   `studentId`, `legalName`, `gradYear` or any other key is refused (400). */

/* Control characters, zero-width spaces and bidi overrides — invisible or
   spoofing characters that have no place in a published name. A ZWJ (U+200D)
   is allowed: emoji sequences use it. */
const HIDDEN_CHARS = /[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

export const StudentDisplayNameInput = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Your display name needs at least 2 characters.")
      .max(60, "Keep your display name to 60 characters or fewer.")
      .refine((s) => !HIDDEN_CHARS.test(s), "Your display name has a hidden or control character in it.")
      .refine((s) => /[\p{L}\p{N}]/u.test(s), "Your display name needs at least one letter or number."),
  })
  .strict()
  .meta({
    id: "StudentDisplayNameInput",
    description: "The student's new display name: trimmed (inner runs of spaces become one), 2–60 characters, at least one letter or number, no hidden characters. No other field is accepted.",
  });

export const StudentProfile = z
  .object({
    id: z.string(),
    legalName: z.string(),
    displayName: z.string(),
    gradYear: z.number().int().nullable(),
    school: z.object({ name: z.string() }),
    masthead: z.array(z.enum(MASTHEAD_ROLES)),
    state: StudentState,
    leftAt: z.string().nullable(),
    code: z.string().nullable(),
    minor: z.boolean(),
    guardian: z
      .object({ linked: z.boolean(), verified: z.boolean() })
      .nullable()
      .meta({ description: "A minor's guardian STATUS only — never the guardian's name or contact. Null for an adult." }),
    advisors: z
      .array(z.object({ email: z.string() }))
      .meta({ description: "The school's active faculty advisor logins, to ask for a correction. The data model keeps an advisor's email, not their name." }),
    editable: z.array(z.literal("displayName")),
  })
  .meta({ id: "StudentProfile", description: "A student's own profile (POL-BE-101). No date of birth, no email, no guardian details." });

export const AssignStudentInput = z
  .object({ studentId: z.string().min(1).nullable() })
  .meta({ id: "AssignStudentInput", description: "Who works the account now. Changes nothing about who originated a sale." });
