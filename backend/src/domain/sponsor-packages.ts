/**
 * The sponsor packages — the six §7 athlete packages (P3-BE-11, P0-PMO-10)
 * and the SponsorX NEXT products (P9-BE-01).
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

/** The six §7 packages — every one staffed by athletes on NIL job lines. */
export const ATHLETE_PACKAGES: readonly SponsorPackageSeed[] = [
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

/**
 * SponsorX NEXT — P9-BE-01, spec §4 and §5.2. Prices from
 * documentation/SponsorX-NEXT-Rate-Card-Decision.md (P9-PMO-01, SIMULATED
 * until BTG prices edition one — change both together).
 *
 * Ordinary `SponsorPackage` rows, no schema change. **No athlete anywhere:**
 * the social posts are STUDENT-created (spec §0), so `lineItems` is EMPTY,
 * the athlete count is zero, and everything sold sits in `includes` — the
 * field P0-PMO-13 §5 defines as non-NIL inventory. With no athlete cost there
 * is nothing for the margin floor to evaluate, and nothing asks it to: the
 * floor runs on CampaignOrder lines, and a NEXT sale has none (§5.2).
 *
 * `AD_SLOT` codes name the positions `AdSlot` (P9-BE-03) will make real. The
 * back cover and presenting sponsor are quantity ONE per edition — recorded
 * here, enforced by that ledger once it exists.
 */
const next = (
  code: string, name: string, price: number,
  includes: NonNullable<SponsorPackageSeed["includes"]>, exclusivity = false,
): SponsorPackageSeed => ({
  code, name, priceLow: price, priceHigh: price,
  athleteCountMin: 0, athleteCountMax: 0, lineItems: [], includes,
  exclusivity, durationWeeks: null,
});

export const NEXT_PACKAGES: readonly SponsorPackageSeed[] = [
  next("NEXT-AD-QUARTER", "NEXT Quarter-Page Ad", 250, [{ kind: "AD_SLOT", code: "QUARTER" }]),
  next("NEXT-AD-HALF", "NEXT Half-Page Ad", 500, [{ kind: "AD_SLOT", code: "HALF" }]),
  next("NEXT-AD-FULL", "NEXT Full-Page Ad", 800, [{ kind: "AD_SLOT", code: "FULL" }]),
  next("NEXT-AD-BACK-COVER", "NEXT Back Cover", 1000, [{ kind: "AD_SLOT", code: "BACK_COVER", quantity: 1 }]),
  next("NEXT-LOCAL-1500", "NEXT Local Business Package", 1500, [
    { kind: "AD_SLOT", code: "FULL", quantity: 1 },
    { kind: "FEATURE", code: "NEXT_SPONSORED_FEATURE", quantity: 1 },
    { kind: "STUDENT_CONTENT", code: "STUDENT_SOCIAL_POST", quantity: 4 },
    { kind: "REPORT", code: "BASIC_REPORT" },
  ]),
  /* One per edition, and it owns the masthead's "presented by" — the only
     NEXT product with category exclusivity. */
  next("NEXT-PRESENTING", "NEXT Presenting Sponsor", 3000, [
    { kind: "PRESENTING", code: "NEXT_PRESENTING_SPONSOR", quantity: 1 },
  ], true),
];

export const SPONSOR_PACKAGES: readonly SponsorPackageSeed[] = [...ATHLETE_PACKAGES, ...NEXT_PACKAGES];

