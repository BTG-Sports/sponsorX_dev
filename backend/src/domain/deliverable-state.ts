/**
 * The deliverable lifecycle — P5-BE-05, §21.
 *
 * NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED →
 * PUBLISHED → VERIFIED, with a revision request from either review step
 * sending the work back to DRAFT_SUBMITTED.
 *
 * WHY SPONSOR_REVIEW IS SKIPPABLE. §13 step 8 makes the sponsor's look
 * optional — most campaigns do not want the sponsor in the loop on every
 * story, and a mandatory step nobody performs becomes a queue that silently
 * stops the athlete being paid. So BTG_REVIEW reaches APPROVED directly as
 * well as through SPONSOR_REVIEW. That is a deliberate branch, not a missing
 * guard: `P5-BE-08` decides which one a campaign takes.
 *
 * WHY A REVISION RETURNS TO DRAFT_SUBMITTED AND NOT TO NOT_STARTED.
 * NOT_STARTED means the athlete has never submitted anything. Sending a
 * revision there would erase the fact that a draft exists, and the assets
 * already uploaded against the deliverable would be hanging off a record that
 * claims no work has been done. DRAFT_SUBMITTED is the honest place: work
 * exists, it is back with the athlete, and the version history on
 * `CreativeAsset` still lines up.
 *
 * WHY PUBLISHED AND VERIFIED ARE TWO STATES. PUBLISHED is the athlete's
 * claim — they say the post is live and give the URL. VERIFIED is BTG
 * confirming it. Earnings hang off the second, not the first (`P7-BE-02`),
 * so collapsing them would let an unchecked claim trigger money.
 */

export type DeliverableState =
  | "NOT_STARTED"
  | "DRAFT_SUBMITTED"
  | "BTG_REVIEW"
  | "SPONSOR_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "VERIFIED";

export const DELIVERABLE_STATES: readonly DeliverableState[] = [
  "NOT_STARTED",
  "DRAFT_SUBMITTED",
  "BTG_REVIEW",
  "SPONSOR_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "VERIFIED",
] as const;

const TRANSITIONS: Readonly<Record<DeliverableState, readonly DeliverableState[]>> = {
  NOT_STARTED: ["DRAFT_SUBMITTED"],
  /* Submitting puts it in BTG's queue. The athlete cannot move it further. */
  DRAFT_SUBMITTED: ["BTG_REVIEW"],
  /* BTG either sends it on to the sponsor, approves it outright, or bounces
     it back for revision. */
  BTG_REVIEW: ["SPONSOR_REVIEW", "APPROVED", "DRAFT_SUBMITTED"],
  /* The sponsor approves or asks for a revision. They cannot reject outright:
     a deliverable is already paid-for contracted work, and "no" without a
     revision request is a commercial dispute, not a state change. */
  SPONSOR_REVIEW: ["APPROVED", "DRAFT_SUBMITTED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: ["VERIFIED"],
  VERIFIED: [],
};

/** The two states a revision request may be made from. */
export const REVIEW_STATES: readonly DeliverableState[] = [
  "BTG_REVIEW",
  "SPONSOR_REVIEW",
] as const;

export class IllegalDeliverableTransitionError extends Error {
  readonly status = 409;
  constructor(from: DeliverableState, to: DeliverableState) {
    super(
      `A deliverable cannot go from ${from} to ${to}. Legal moves from ` +
        `${from}: ${legalDeliverableTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalDeliverableTransitionError";
  }
}

export function canTransitionDeliverable(
  from: DeliverableState,
  to: DeliverableState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalDeliverableTransitions(
  from: DeliverableState,
): readonly DeliverableState[] {
  return TRANSITIONS[from];
}

/** True where a revision request is a legal move — i.e. from either review. */
export function canRequestRevision(from: DeliverableState): boolean {
  return REVIEW_STATES.includes(from) && canTransitionDeliverable(from, "DRAFT_SUBMITTED");
}
