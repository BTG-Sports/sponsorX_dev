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
  /* Same code as the athlete lifecycle's refusal (QA pass 6, P6-BE-05). */
  readonly code = "illegal_transition";
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

/**
 * Who a reward is for — P6-BE-08, §9 screen 10.
 *
 * STATED, NOT CHECKED. The fan page has no login (§16), so the API knows
 * nothing about the person holding the phone and cannot verify an age or a
 * ticket. Each value is what the page tells the fan and what the redeem step
 * tells booth staff to check before they tap. A closed list rather than free
 * text so a sponsor and a merchant read the same rule the same way; the
 * reward's `eligibilityNote` carries any detail beside it.
 */
export type RewardEligibility = "ANYONE" | "AGE_18_PLUS" | "AGE_21_PLUS" | "TICKET_HOLDERS";

export const REWARD_ELIGIBILITIES: readonly RewardEligibility[] = [
  "ANYONE", "AGE_18_PLUS", "AGE_21_PLUS", "TICKET_HOLDERS",
] as const;

/**
 * Redemptions left under a reward's cap — P6-BE-08. `null` cap = unlimited,
 * answered as `null`. Never negative: a count above the cap (a cap lowered
 * after redemptions, say) reads as none left, not as a debt.
 *
 * Informational only. The cap is ENFORCED by the `reward_redeem` /
 * `reward_reserve` database functions under a row lock; this is what the
 * page and the desk display.
 */
export function redemptionsLeft(cap: number | null, redeemed: number): number | null {
  return cap === null ? null : Math.max(0, cap - redeemed);
}

/**
 * How long a claim holds a unit of a capped reward — QA-09 (2026-09-28).
 * Minutes; the CHECK constraint `Reward_reserveMinutes_range` says the same.
 */
export const RESERVE_MINUTES = { min: 5, max: 10_080, default: 60 } as const;

/* ------------------------------------------------------------ QA-07 copy */

/* Whitespace plus the invisible format characters (Unicode Cf: zero-width
   space/joiners U+200B–U+200D, word joiner U+2060, BOM U+FEFF, bidi marks…).
   `.trim()` strips none of the Cf ones, so a headline of two U+200B passed and
   rendered blank. */
const INVISIBLE = /[\s\p{Cf}]/gu;
const INVISIBLE_EDGES = /^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu;

/** True when the text has at least one character a reader can see. */
export function hasVisibleText(s: string | null | undefined): boolean {
  return !!s && s.replace(INVISIBLE, "").length > 0;
}

/**
 * Copy as stored: invisible characters trimmed from the EDGES only, and
 * null when nothing visible remains. Interior format characters stay — a
 * zero-width joiner inside an emoji sequence (👨‍👩‍👧) is real text.
 */
export function cleanCopy(s: string | null | undefined): string | null {
  if (!hasVisibleText(s)) return null;
  return s!.replace(INVISIBLE_EDGES, "");
}

/* ------------------------------------------------- P6-BE-09 rewards follow */

/**
 * Why a reward cannot go live yet, or null when it can — the checks the
 * ACTIVE transition makes (a legal move, an expiry still ahead), plus the
 * copy createReward requires, re-asked because a draft is a stored row, not
 * a promise. Launching a campaign puts every draft that passes live
 * (P6-BE-09) and leaves the rest, saying why.
 */
export function notReadyToGoLive(
  r: { state: RewardState; expiresAt: Date; offerText: string | null; terms: string | null },
  now: Date,
): string | null {
  if (!canTransitionReward(r.state, "ACTIVE")) return `It is ${r.state.toLowerCase()}, not a draft.`;
  if (r.expiresAt.getTime() <= now.getTime()) return "Its expiry has passed.";
  if (!hasVisibleText(r.offerText)) return "The offer is blank.";
  if (!hasVisibleText(r.terms)) return "The terms are blank.";
  return null;
}

/**
 * How a reward follows its campaign, in BTG's words (P6-BE-09): a draft goes
 * live when the campaign launches, a live reward pauses if the campaign is
 * cancelled, and a completed campaign leaves it alone — a fan keeps a valid
 * offer until the reward's own expiry. Null where there is nothing to say.
 */
export function followsCampaign(rewardState: RewardState, campaignState: string, expired: boolean): string | null {
  const preLaunch = campaignState === "DRAFT" || campaignState === "STAFFING" || campaignState === "APPROVAL";
  switch (rewardState) {
    case "DRAFT":
      if (campaignState === "CANCELLED") return "The campaign was cancelled, so this won't go live";
      if (expired) return "Its expiry has passed, so it won't go live";
      if (preLaunch) return "Goes live when the campaign launches";
      return "The campaign is already live — put this live yourself";
    case "ACTIVE":
      if (campaignState === "REPORTING" || campaignState === "COMPLETED") return "Stays open to fans until its own expiry";
      return "Pauses if the campaign is cancelled";
    case "PAUSED":
      return campaignState === "CANCELLED" ? "Paused because the campaign was cancelled" : null;
    default:
      return null;
  }
}
