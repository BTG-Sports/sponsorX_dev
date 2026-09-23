/**
 * The earning lifecycle — P7-BE-01, §21, Addendum A6.
 *
 * PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID, with HELD and DISPUTED
 * off to the side.
 *
 * PHASE 1 TRACKS STATUS ONLY. Money moves outside this system — by bank
 * transfer, arranged in Zoho Books — and nothing here initiates a payment.
 * `PAID` is BTG recording that a transfer happened, not this system making
 * one. That is why there is no tax ID and no bank detail anywhere near this
 * model: §26 forbids bank details outright and Addendum A6 defers tax IDs to
 * the phase that actually needs them. A state machine that cannot pay anyone
 * is the correct shape for Phase 1, not a limitation to work around.
 *
 * WHY ELIGIBLE IS NOT THE SAME AS APPROVED_FOR_PAYOUT. ELIGIBLE is a fact
 * about the work — the deliverable was verified, so the athlete has earned it
 * (P7-BE-02 sets this automatically). APPROVED_FOR_PAYOUT is a decision by a
 * person in Finance that it should go out in the next run. Collapsing them
 * would mean completing a deliverable directly authorises money, with nobody
 * having looked.
 *
 * WHY HELD AND DISPUTED ARE DIFFERENT THINGS. HELD is BTG's own pause —
 * a missing detail, a campaign under review — and it goes back to where it
 * came from. DISPUTED is somebody contesting the amount, which is not
 * resolved by resuming: it ends in a corrected ELIGIBLE or in HELD while the
 * disagreement is worked out. Both are reachable from any live state, because
 * a problem can surface at any point before the transfer.
 *
 * WHY PAID IS TERMINAL. The transfer left the bank. Any correction after that
 * is a new earning or an adjustment on this one — never a state change that
 * quietly un-pays somebody.
 */

export type EarningState =
  | "PENDING"
  | "ELIGIBLE"
  | "APPROVED_FOR_PAYOUT"
  | "PAID"
  | "HELD"
  | "DISPUTED";

export const EARNING_STATES: readonly EarningState[] = [
  "PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED",
] as const;

const TRANSITIONS: Readonly<Record<EarningState, readonly EarningState[]>> = {
  PENDING: ["ELIGIBLE", "HELD", "DISPUTED"],
  ELIGIBLE: ["APPROVED_FOR_PAYOUT", "HELD", "DISPUTED"],
  APPROVED_FOR_PAYOUT: ["PAID", "HELD", "DISPUTED"],
  /* A hold is resolved by returning to the queue, not by skipping ahead. */
  HELD: ["PENDING", "ELIGIBLE", "DISPUTED"],
  /* A dispute ends in a corrected amount or a hold while it is worked out.
     It never goes straight to PAID — that is the whole point of raising it. */
  DISPUTED: ["ELIGIBLE", "HELD"],
  PAID: [],
};

/** States where the money has not moved and the amount may still change. */
export const MUTABLE_EARNING_STATES: readonly EarningState[] = [
  "PENDING", "ELIGIBLE", "HELD", "DISPUTED",
] as const;

export class IllegalEarningTransitionError extends Error {
  readonly status = 409;
  constructor(from: EarningState, to: EarningState) {
    super(
      `An earning cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalEarningTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalEarningTransitionError";
  }
}

export function canTransitionEarning(from: EarningState, to: EarningState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalEarningTransitions(from: EarningState): readonly EarningState[] {
  return TRANSITIONS[from];
}

/** True while the amount may still be recalculated (P7-BE-03). */
export function isEarningMutable(state: EarningState): boolean {
  return MUTABLE_EARNING_STATES.includes(state);
}
