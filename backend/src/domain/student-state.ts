/**
 * The student lifecycle — P9-BE-04, spec §5.1.
 *
 * Pure. MIRRORS the athlete machine (athlete-state.ts) on purpose: a student
 * application is reviewed by the school's ADVISOR exactly as an athlete's is
 * by a network manager — same states, same edges — plus INACTIVE, V3 §1's
 * "left the programme" (graduated, transferred, withdrew). INACTIVE ends
 * access; it does not touch attribution (P9-BE-13).
 *
 * A minor cannot become ACTIVE without a linked, VERIFIED guardian — the same
 * `guardianReadiness` rule an athlete meets (guardian-rules.ts), not a copy.
 */

export type StudentState =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE";

export const STUDENT_STATES: readonly StudentState[] = [
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED",
  "REJECTED", "ACTIVE", "SUSPENDED", "INACTIVE",
] as const;

const TRANSITIONS: Readonly<Record<StudentState, readonly StudentState[]>> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  CHANGES_REQUESTED: ["SUBMITTED"],
  APPROVED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "INACTIVE"],
  SUSPENDED: ["ACTIVE", "INACTIVE"],
  REJECTED: [],
  INACTIVE: [],
};

/** The moves that are the applicant's own; every other move is a review —
 *  the advisor's (or BTG's) `approve`. */
export const SELF_MOVES: ReadonlySet<StudentState> = new Set(["SUBMITTED"]);

export class IllegalStudentTransitionError extends Error {
  readonly status = 409;
  constructor(from: StudentState, to: StudentState) {
    super(
      `A student cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${TRANSITIONS[from].join(", ") || "none — this is a terminal state"}.`,
    );
    this.name = "IllegalStudentTransitionError";
  }
}

export class StudentGuardianRequiredError extends Error {
  readonly status = 409;
  constructor(reason: string) {
    super(`This student is a minor and cannot become ACTIVE until a guardian is linked and verified (${reason}).`);
    this.name = "StudentGuardianRequiredError";
  }
}

export function canTransitionStudent(from: StudentState, to: StudentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalStudentTransitions(from: StudentState): readonly StudentState[] {
  return TRANSITIONS[from];
}
