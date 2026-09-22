/**
 * The six sponsor packages — P3-BE-11, §7, P0-PMO-10.
 *
 * Reference data like the NIL catalogue, and seeded the same way.
 *
 * TWO CORRECTIONS FROM THE CONFIRMED DOCUMENT, both worth keeping visible:
 *
 *   - **Local Blitz is $1,500–$2,400 across 5–9 athletes**, not §7's
 *     $1,500–$3,000 across 5–10. It overlapped 10-Athlete Blitz, so one
 *     product was a point inside another's range. Stopping it below $2,500
 *     leaves the two distinct.
 *   - **The iMC/BTG feature is sold inventory**, carried in `includes` as a
 *     record with a line rather than a phrase in a description — so §26's
 *     conflict checks and delivery tracking can see it at all.
 *
 * The line items pitch job codes deliberately **lower** than the package
 * descriptions imply, because the richer readings are exactly what produced
 * negative margins. If Takeover is to mean ambassador-grade work, the price
 * rises; the margin does not absorb it.
 */

export type SponsorPackageSeed = {
  code: string;
  name: string;
  priceLow: number;
  priceHigh: number;
  athleteCountMin: number;
  athleteCountMax: number;
  lineItems: Array<{ jobCode: string; quantityPerAthlete: number }>;
  includes: Array<{ kind: string; code: string; quantity?: number }> | null;
  exclusivity: boolean;
  durationWeeks: number | null;
};

export const SPONSOR_PACKAGES: readonly SponsorPackageSeed[] = [
  {
    code: "TEST_DRIVE", name: "SponsorX Test Drive",
    priceLow: 750, priceHigh: 750, athleteCountMin: 3, athleteCountMax: 3,
    lineItems: [{ jobCode: "SX-01", quantityPerAthlete: 1 }],
    includes: [{ kind: "REPORT", code: "BASIC_REPORT" }],
    exclusivity: false, durationWeeks: 1,
  },
  {
    code: "LOCAL_BLITZ", name: "Local Blitz",
    /* Narrowed from §7 — see the note above. */
    priceLow: 1500, priceHigh: 2400, athleteCountMin: 5, athleteCountMax: 9,
    lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }],
    includes: [{ kind: "REPORT", code: "BASIC_REPORT" }],
    exclusivity: false, durationWeeks: 2,
  },
  {
    code: "BLITZ_10", name: "10-Athlete Blitz",
    priceLow: 2500, priceHigh: 2500, athleteCountMin: 10, athleteCountMax: 10,
    lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }],
    includes: [{ kind: "REPORT", code: "BASIC_REPORT" }, { kind: "REWARD", code: "QR_REWARD" }],
    exclusivity: false, durationWeeks: 3,
  },
  {
    code: "COMMUNITY_CAMPAIGN", name: "Community Campaign",
    priceLow: 5000, priceHigh: 5000, athleteCountMin: 10, athleteCountMax: 15,
    lineItems: [{ jobCode: "SX-03", quantityPerAthlete: 1 }],
    includes: [
      { kind: "REPORT", code: "BASIC_REPORT" },
      { kind: "REWARD", code: "QR_REWARD" },
      { kind: "FEATURE", code: "IMC_BTG_FEATURE", quantity: 1 },
    ],
    exclusivity: false, durationWeeks: 4,
  },
  {
    code: "ATHLETE_TAKEOVER", name: "Athlete Takeover",
    priceLow: 10000, priceHigh: 10000, athleteCountMin: 15, athleteCountMax: 25,
    lineItems: [{ jobCode: "SX-04", quantityPerAthlete: 1 }],
    includes: [
      { kind: "REPORT", code: "FULL_REPORT" },
      { kind: "REWARD", code: "QR_REWARD" },
      { kind: "FEATURE", code: "IMC_BTG_FEATURE", quantity: 1 },
    ],
    exclusivity: false, durationWeeks: 6,
  },
  {
    code: "SEASON_PARTNER", name: "Season Partner",
    /* The only package with a genuinely open top. Its line items are monthly
       and its athlete cost is negotiated, which is why §7 gives it a range
       rather than a price. */
    priceLow: 15000, priceHigh: 30000, athleteCountMin: 10, athleteCountMax: 15,
    lineItems: [{ jobCode: "SX-07", quantityPerAthlete: 1 }],
    includes: [
      { kind: "REPORT", code: "FULL_REPORT" },
      { kind: "REWARD", code: "QR_REWARD" },
      { kind: "FEATURE", code: "IMC_BTG_FEATURE", quantity: 1 },
      { kind: "EVENT", code: "SEASON_EVENTS" },
    ],
    exclusivity: true, durationWeeks: 26,
  },
];
