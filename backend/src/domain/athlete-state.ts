/**
 * The athlete application state machine — P3-BE-01, §21.
 *
 * Pure: no Prisma, no config, no environment. Split out of `athlete.ts` the
 * moment its test could not run — importing the domain module pulled in the
 * database client, which parses CLERK_PUBLISHABLE_KEY at load and threw.
 *
 * That is the same separation the authorisation layer uses (policy as data,
 * filters separately) and for the same reason: the part that encodes a rule
 * from the blueprint should be testable by anyone, anywhere, without
 * infrastructure. A rule you cannot test cheaply is a rule that stops being
 * tested.
 */

export type AthleteState =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "ACTIVE"
  | "SUSPENDED";

/**
 * §21, read literally:
 *
 *   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / CHANGES_REQUESTED /
 *   REJECTED → ACTIVE / SUSPENDED
 *
 * Two edges the arrow diagram implies without drawing:
 *
 *   - CHANGES_REQUESTED → SUBMITTED. Otherwise asking an applicant to fix
 *     something is a dead end, and §23's review checklist becomes one-way.
 *   - SUSPENDED → ACTIVE. A suspension nobody can lift is a deletion with
 *     extra steps.
 *
 * REJECTED is terminal on purpose. Re-applying creates a new application
 * rather than reviving a refused one, so the audit trail keeps the refusal.
 */
const TRANSITIONS: Readonly<Record<AthleteState, readonly AthleteState[]>> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  CHANGES_REQUESTED: ["SUBMITTED"],
  APPROVED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED"],
  SUSPENDED: ["ACTIVE"],
  REJECTED: [],
};

export class IllegalTransitionError extends Error {
  readonly status = 409;
  constructor(from: AthleteState, to: AthleteState) {
    super(
      `An athlete cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${TRANSITIONS[from].join(", ") || "none — this is a terminal state"} (§21).`,
    );
    this.name = "IllegalTransitionError";
  }
}

export class GuardianRequiredError extends Error {
  readonly status = 409;
  constructor(athleteId: string) {
    super(
      `Athlete ${athleteId} is a minor and cannot become ACTIVE until a ` +
        `guardian is linked and verified (§26, §37 pre-pilot gate).`,
    );
    this.name = "GuardianRequiredError";
  }
}

export function canTransition(from: AthleteState, to: AthleteState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Legal moves from a state — for rendering only the buttons that will work. */
export function legalTransitions(from: AthleteState): readonly AthleteState[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * The states, as data, in the Prisma enum's order.
 *
 * Exported so the alignment test can compare this file against
 * `schema.prisma` — the union above is a type and vanishes at runtime, so
 * nothing could otherwise check that the two lists still match.
 */
export const ATHLETE_STATES_FOR_TEST: readonly AthleteState[] = [
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED",
  "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "SUSPENDED",
] as const;
