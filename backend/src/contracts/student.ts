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

const studentFields = {
  legalName: z.string().min(1).max(200),
  displayName: z.string().min(1).max(100),
  /** Optional on purpose — school email must not be a hard requirement. */
  email: z.email().nullable().optional(),
  gradYear: z.number().int().min(2020).max(2040).nullable().optional(),
  birthDate: z.iso.date().nullable().optional(),
  ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).nullable().optional(),
  masthead: z.array(z.enum(MASTHEAD_ROLES)).min(1).max(7),
};

export const StudentInput = z
  .object({ propertyId: z.string().min(1), ...studentFields })
  .meta({ id: "StudentInput" });

export const StudentApplicationInput = z
  .object({ schoolSlug: z.string().min(1).max(120), ...studentFields })
  .meta({ id: "StudentApplicationInput", description: "The public 'Become the Media' application. Lands SUBMITTED for the school's advisor." });

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

export const AssignStudentInput = z
  .object({ studentId: z.string().min(1).nullable() })
  .meta({ id: "AssignStudentInput", description: "Who works the account now. Changes nothing about who originated a sale." });
