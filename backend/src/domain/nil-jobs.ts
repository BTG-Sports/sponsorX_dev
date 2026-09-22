/**
 * The SX-01…SX-07 catalogue — P3-BE-08, §5, P0-PMO-13.
 *
 * Reference data, not demo data. It is the same seven jobs in every
 * environment including production, which is why it does not live in
 * `seed-environment.mts` — that one refuses to run in production, correctly,
 * because what it seeds is fake people.
 *
 * THE FLOORS ARE DERIVED, NOT TYPED. Each job's minimum sell price per tier
 * comes from `minimumSellPrice()` rather than a transcribed number, so the
 * catalogue cannot drift from the rule that produced it. The decision document
 * publishes the same table, and the test asserts they agree — that is the
 * check, rather than trusting two hand-copied lists to stay equal.
 *
 * SX-07's BAND IS THE CORRECTED ONE. P0-PMO-13 decision three: $1,050–$2,000,
 * not §5's original $750–$2,000. It is the one job the floor rule could not
 * rescue on its own, because its base-band top equalled its old sell floor.
 * Every other job keeps its published band and only its floor becomes
 * tier-aware.
 *
 * All figures are whole US dollars, matching the Int columns on `NilJob`.
 */
import { minimumSellPrice, PRICED_TIERS } from "./pricing";

export type NilJobSeed = {
  id: string;
  name: string;
  baseLow: number;
  baseHigh: number;
  sellLow: number;
  sellHigh: number;
  sellFloorEmerging: number;
  sellFloorCreator: number;
  sellFloorPremium: number;
};

/** §5's bands. Sell bands are real floors, not opening indications —
 *  P0-PMO-13 records that as the assumption the whole rule rests on. */
const BANDS = [
  { id: "SX-01", name: "Story Drop", baseLow: 25, baseHigh: 50, sellLow: 75, sellHigh: 125 },
  { id: "SX-02", name: "Sponsored Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250 },
  { id: "SX-03", name: "Athlete Reel", baseLow: 75, baseHigh: 150, sellLow: 200, sellHigh: 400 },
  { id: "SX-04", name: "Product Experience", baseLow: 125, baseHigh: 250, sellLow: 350, sellHigh: 650 },
  { id: "SX-05", name: "Local Appearance", baseLow: 150, baseHigh: 300, sellLow: 400, sellHigh: 750 },
  { id: "SX-06", name: "Content Day", baseLow: 150, baseHigh: 350, sellLow: 500, sellHigh: 1000 },
  /* Corrected band — P0-PMO-13 decision three. Pay band unchanged. */
  { id: "SX-07", name: "Monthly Ambassador", baseLow: 300, baseHigh: 750, sellLow: 1050, sellHigh: 2000 },
] as const;

export const NIL_JOBS: readonly NilJobSeed[] = BANDS.map((job) => {
  const [emerging, creator, premium] = PRICED_TIERS.map((tier) =>
    minimumSellPrice(job.baseHigh, tier),
  );
  return {
    ...job,
    sellFloorEmerging: emerging!,
    sellFloorCreator: creator!,
    sellFloorPremium: premium!,
  };
});
