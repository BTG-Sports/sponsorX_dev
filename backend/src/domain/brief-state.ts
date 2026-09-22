/**
 * The campaign brief lifecycle — P4-BE-02, §21.
 *
 * Pure, like `athlete-state.ts`: it imports nothing, so the rule is testable
 * without a database and will not quietly stop being tested.
 *
 * DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED → CLOSED, with CLOSED
 * reachable from anywhere before a campaign exists. A sponsor who changes
 * their mind at any stage of the sales conversation is not an error, and
 * forcing a brief forward to close it would put a qualification on the record
 * that nobody performed.
 *
 * CAMPAIGN_CREATED IS TERMINAL FOR THE BRIEF. Once a `Campaign` exists the
 * brief stops being the live object — it becomes the record of what was
 * asked for, and the campaign is what gets delivered. Reopening it would give
 * two rows an opinion about the same work.
 */

export type BriefState =
  | "DRAFT"
  | "QUALIFIED"
  | "APPROVED"
  | "CAMPAIGN_CREATED"
  | "CLOSED";

export const BRIEF_STATES: readonly BriefState[] = [
  "DRAFT", "QUALIFIED", "APPROVED", "CAMPAIGN_CREATED", "CLOSED",
] as const;

const TRANSITIONS: Readonly<Record<BriefState, readonly BriefState[]>> = {
  /* CLOSED from every pre-campaign state: "they went quiet" and "they said
     no" both end here, and neither is a qualification. */
  DRAFT: ["QUALIFIED", "CLOSED"],
  QUALIFIED: ["APPROVED", "CLOSED"],
  APPROVED: ["CAMPAIGN_CREATED", "CLOSED"],
  CAMPAIGN_CREATED: [],
  CLOSED: [],
};

export class IllegalBriefTransitionError extends Error {
  readonly status = 409;
  constructor(from: BriefState, to: BriefState) {
    super(
      `A brief cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalBriefTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalBriefTransitionError";
  }
}

export function canTransitionBrief(from: BriefState, to: BriefState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalBriefTransitions(from: BriefState): readonly BriefState[] {
  return TRANSITIONS[from];
}
