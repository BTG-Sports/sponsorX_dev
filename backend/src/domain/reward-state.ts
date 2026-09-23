/**
 * The reward lifecycle — P6-BE-02, §21, §16.
 *
 * DRAFT → ACTIVE → PAUSED → EXPIRED / ARCHIVED.
 *
 * WHY PAUSED EXISTS AT ALL. A reward is an offer a real business is honouring
 * at a real till. When the merchant runs out of stock mid-event, someone needs
 * to stop new claims *without* destroying the record or invalidating the
 * tokens fans already hold. PAUSED is that: reversible, and it goes back to
 * ACTIVE when the merchant is ready.
 *
 * WHY EXPIRED IS REACHABLE FROM BOTH ACTIVE AND PAUSED, AND IS TERMINAL.
 * `Reward.expiresAt` is a promise printed on a thing a fan is carrying. When
 * that moment passes the offer is over regardless of which of the two live
 * states it was in. Reviving an expired reward would mean honouring an offer
 * after the date the fan was told it ended, so the way back is a new reward.
 *
 * WHY ARCHIVED IS NOT "DELETED". §16's funnel is reported on long after the
 * campaign closes, and the RewardEvents hang off the tokens. Archiving hides
 * the reward from the working list; deleting it would take the funnel with it.
 *
 * WHY DRAFT CANNOT GO STRAIGHT TO EXPIRED. Nothing was ever offered, so there
 * is nothing to expire — a draft that is abandoned is ARCHIVED.
 */

export type RewardState = "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";

export const REWARD_STATES: readonly RewardState[] = [
  "DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED",
] as const;

const TRANSITIONS: Readonly<Record<RewardState, readonly RewardState[]>> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "EXPIRED", "ARCHIVED"],
  /* Reversible on purpose — the merchant restocks and trading resumes. */
  PAUSED: ["ACTIVE", "EXPIRED", "ARCHIVED"],
  EXPIRED: ["ARCHIVED"],
  ARCHIVED: [],
};

/** The states in which a token may still be scanned, claimed or redeemed. */
export const LIVE_REWARD_STATES: readonly RewardState[] = ["ACTIVE"] as const;

export class IllegalRewardTransitionError extends Error {
  readonly status = 409;
  constructor(from: RewardState, to: RewardState) {
    super(
      `A reward cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalRewardTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalRewardTransitionError";
  }
}

export function canTransitionReward(from: RewardState, to: RewardState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalRewardTransitions(from: RewardState): readonly RewardState[] {
  return TRANSITIONS[from];
}

/** True where fans may still interact with the reward's tokens. */
export function isRewardLive(state: RewardState): boolean {
  return LIVE_REWARD_STATES.includes(state);
}

/**
 * The four moments of §16's fan funnel — P6-BE-03.
 *
 * Lives beside the state machine rather than in `reward.ts` so that the
 * contracts layer and the state tests can name the vocabulary without pulling
 * in the Prisma client. It is vocabulary, not behaviour.
 */
export type RewardEventType = "SCAN" | "LANDING" | "CLAIM" | "REDEEM";

export const REWARD_EVENT_TYPES: readonly RewardEventType[] = [
  "SCAN", "LANDING", "CLAIM", "REDEEM",
] as const;
