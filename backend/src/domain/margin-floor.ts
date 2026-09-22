/**
 * The margin floor, enforced — P3-BE-12, P0-PMO-13, §5, §6.
 *
 * `pricing.ts` computes the floor; this refuses to cross it. The split
 * matters because the computation is needed in three places that do not all
 * enforce — seeding the catalogue derives floors, a rate card *displays* the
 * floor it implies, and only the order actually refuses.
 *
 * AT THE MOMENT THE PRICE IS SET, NOT IN A REPORT AFTERWARDS. A margin
 * report tells you which campaigns lost money; a floor tells you they cannot
 * be saved. The whole finding behind P0-PMO-13 was that the tier multiplier
 * scaled athlete pay while nothing scaled the sell floor — at the top of a
 * base band a Premium athlete cost more than the sponsor paid, on all seven
 * jobs. A rule that only reports is the state we were already in.
 *
 * LINE BY LINE, NEVER AGAINST A PACKAGE TOTAL. A package's ad revenue or its
 * cheaper lines would inflate the apparent margin and hide a losing line
 * behind a profitable one. This is also why SponsorX NEXT needs no change
 * here (`P9-BE-08`, void): a NEXT package has no NIL line items, so there is
 * no athlete cost and nothing to evaluate.
 */

import { MARGIN_FLOOR, minimumSellPrice, type PricedTier } from "./pricing";

export class MarginFloorError extends Error {
  readonly status = 422;
  readonly jobId: string;
  readonly tier: PricedTier;
  readonly floor: number;
  readonly shortfall: number;

  constructor(jobId: string, tier: PricedTier, sellPrice: number, floor: number) {
    /* The message names all four numbers on purpose. "Below the margin
       floor" sends someone to a spreadsheet; naming the job, the tier, the
       floor and the gap lets them fix it in one step — and the acceptance
       asks for exactly that. */
    super(
      `${jobId} at ${tier} has a minimum sell price of ${floor} cents ` +
        `(athlete cost x ${MARGIN_FLOOR}); ${sellPrice} is ${floor - sellPrice} short.`,
    );
    this.name = "MarginFloorError";
    this.jobId = jobId;
    this.tier = tier;
    this.floor = floor;
    this.shortfall = floor - sellPrice;
  }
}

/**
 * Refuse a line whose sponsor price does not clear the floor for the tier it
 * will be staffed at.
 *
 * `baseHigh` rather than the agreed rate: the floor has to hold for the most
 * expensive athlete who could take this line, because staffing happens after
 * pricing. Using the actual rate would make the floor move every time the
 * roster changed.
 */
export function assertClearsFloor(
  jobId: string,
  baseHigh: number,
  tier: PricedTier,
  sellPrice: number,
): void {
  const floor = minimumSellPrice(baseHigh, tier);
  if (sellPrice < floor) throw new MarginFloorError(jobId, tier, sellPrice, floor);
}

/** Non-throwing form, for a quote screen that wants to show the gap rather
 *  than refuse a keystroke. */
export function floorFor(baseHigh: number, tier: PricedTier): number {
  return minimumSellPrice(baseHigh, tier);
}
