/**
 * The pricing rule — P0-PMO-13, §5, §6.
 *
 * Two numbers and one formula, in one place because three tasks need them and
 * a second copy is how a floor quietly stops being a floor: P3-BE-08 derives
 * each job's minimum sell price, P3-BE-09 shows a network manager the floor a
 * rate implies, and P3-BE-12 enforces it at quote and order.
 *
 * WHY THE FLOOR EXISTS. The tier multiplier scales athlete pay and nothing
 * scaled the published sell floor, so at the top of a base band a Premium
 * athlete cost more than the sponsor paid — on all seven jobs. SX-07 was
 * negative before any multiplier at all, because its base-band top ($750)
 * equalled its old sell floor.
 */

/** §6. Anchor is deliberately absent: its multiplier is negotiated, so it has
 *  no derived floor and the 1.4× rule is checked against the agreed rate
 *  instead. A number here would invent a policy nobody set. */
export const TIER_MULTIPLIERS = {
  EMERGING: 1.0,
  CREATOR: 1.25,
  PREMIUM: 1.5,
} as const;

export type PricedTier = keyof typeof TIER_MULTIPLIERS;
export const PRICED_TIERS = ["EMERGING", "CREATOR", "PREMIUM"] as const;

/** P0-PMO-13 decision one: sponsor price may never be below athlete cost × 1.4. */
export const MARGIN_FLOOR = 1.4;

/**
 * The lowest a job may be sold for at a tier.
 *
 *   base-band top × tier multiplier × 1.4
 *
 * Base-band **top**, not the midpoint: the floor has to hold for the most
 * expensive athlete who could be staffed on it, or it is not a floor.
 *
 * Rounded up. Rounding down would publish a price a cent under the rule it
 * was derived from, which is the kind of defect nobody finds until an auditor
 * does.
 */
export function minimumSellPrice(baseHigh: number, tier: PricedTier): number {
  return Math.ceil(baseHigh * TIER_MULTIPLIERS[tier] * MARGIN_FLOOR);
}

/** Does this price clear the floor for an athlete costing `athleteCost`? */
export function clearsMarginFloor(sellPrice: number, athleteCost: number): boolean {
  return sellPrice >= athleteCost * MARGIN_FLOOR;
}
