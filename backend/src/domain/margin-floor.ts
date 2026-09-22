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

/**
 * Refuse an order line the campaign's budget cannot carry at the floor.
 *
 * WHY THIS SHAPE AND NOT THE ACCEPTANCE'S LITERAL WORDS. P3-BE-12 says
 * "refuse a line whose SPONSOR PRICE is below athlete cost x 1.4", and
 * `CampaignOrder` has no per-line sponsor price — it carries `compensation`,
 * the athlete's side. There is nothing to compare a line against on its own.
 *
 * What the model does carry is the campaign's budget, so the enforceable form
 * of the same rule is: the sum of every line's minimum sell price must fit
 * inside it. That still refuses at the moment a line is added rather than in
 * a report afterwards, which is the property the rule exists for, and it
 * still catches the case P0-PMO-13 found — an expensive athlete on a job
 * whose price cannot carry them.
 *
 * It is weaker than per-line in one way worth stating: a campaign with room
 * can absorb one underwater line behind several cheap ones. Closing that gap
 * needs a sponsor price per line, which is a schema change and a pricing
 * decision, not something to invent here.
 */
export class CampaignBudgetFloorError extends Error {
  readonly status = 422;
  readonly jobId: string;
  /** The acceptance asks for the athlete's tier by name. Without it the
   *  message says a price is too low and not why this athlete makes it so. */
  readonly tier: string;
  readonly lineFloor: number;
  readonly committed: number;
  readonly budget: number;
  readonly shortfall: number;

  constructor(
    jobId: string,
    tier: string,
    lineFloor: number,
    committed: number,
    budget: number,
  ) {
    super(
      `Adding ${jobId} for a ${tier} athlete needs a sponsor price of at ` +
        `least ${lineFloor} cents (athlete cost x ${MARGIN_FLOOR}). The ` +
        `campaign already commits ${committed} of its ${budget} cent budget, ` +
        `so it is ${committed + lineFloor - budget} short.`,
    );
    this.name = "CampaignBudgetFloorError";
    this.jobId = jobId;
    this.tier = tier;
    this.lineFloor = lineFloor;
    this.committed = committed;
    this.budget = budget;
    this.shortfall = committed + lineFloor - budget;
  }
}

/** The minimum a sponsor must pay for a line costing `compensation`. */
export function lineFloor(compensation: number): number {
  return Math.ceil(compensation * MARGIN_FLOOR);
}

export function assertBudgetCarriesLine(
  jobId: string,
  tier: string | null,
  compensation: number,
  committedCompensation: number,
  budget: number,
): void {
  const needed = lineFloor(compensation);
  const committed = lineFloor(committedCompensation);
  if (committed + needed > budget) {
    throw new CampaignBudgetFloorError(
      jobId, tier ?? "untiered", needed, committed, budget);
  }
}
