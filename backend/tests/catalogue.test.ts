import { describe, expect, it } from "vitest";

import { NIL_JOBS } from "../src/domain/nil-jobs";
import { ATHLETE_PACKAGES, SPONSOR_PACKAGES } from "../src/domain/sponsor-packages";
import {
  MARGIN_FLOOR, PRICED_TIERS, TIER_MULTIPLIERS, clearsMarginFloor, minimumSellPrice,
} from "../src/domain/pricing";

/* --------------------------------------------------------------------------
   The commercial catalogue — P3-BE-08, P3-BE-11, §5, §7, P0-PMO-13.

   The floors are derived rather than transcribed, so the test that matters is
   that they equal the table the decision document publishes. Two hand-copied
   lists staying equal is not something to hope for; asserting it is the whole
   safeguard, because the derivation and the document were written by
   different people at different times and either could be wrong.

   The second thing worth asserting is the one the catalogue exists to
   prevent: that every package clears the 1.4x floor across its whole range,
   including at its most expensive athlete count. That is the check §2 of the
   packages document says was missing when the negative margins appeared.
   -------------------------------------------------------------------------- */

/** P0-PMO-13 §3, transcribed independently of the code that derives it. */
const PUBLISHED_FLOORS: Record<string, [number, number, number]> = {
  "SX-01": [70, 88, 105],
  "SX-02": [140, 175, 210],
  "SX-03": [210, 263, 315],
  "SX-04": [350, 438, 525],
  "SX-05": [420, 525, 630],
  "SX-06": [490, 613, 735],
  "SX-07": [1050, 1313, 1575],
};

describe("the NIL catalogue", () => {
  it("has all seven jobs", () => {
    expect(NIL_JOBS.map((j) => j.id)).toEqual(
      ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06", "SX-07"]);
  });

  it.each(Object.entries(PUBLISHED_FLOORS))(
    "%s derives the floors the decision document publishes", (id, [e, c, p]) => {
      const job = NIL_JOBS.find((j) => j.id === id)!;
      expect([job.sellFloorEmerging, job.sellFloorCreator, job.sellFloorPremium])
        .toEqual([e, c, p]);
    });

  it("carries SX-07's corrected sell band, not §5's original", () => {
    const sx07 = NIL_JOBS.find((j) => j.id === "SX-07")!;
    expect([sx07.sellLow, sx07.sellHigh]).toEqual([1050, 2000]);
    /* The pay band is explicitly unchanged by that correction. */
    expect([sx07.baseLow, sx07.baseHigh]).toEqual([300, 750]);
  });

  it("gives every other job its published band unchanged", () => {
    const bands = NIL_JOBS.filter((j) => j.id !== "SX-07").map((j) => [j.sellLow, j.sellHigh]);
    expect(bands).toEqual([[75,125],[125,250],[200,400],[350,650],[400,750],[500,1000]]);
  });

  it("puts every floor at or above the published sell-band floor, except where the rule said it would not", () => {
    /* SX-01 and SX-06 derive *below* their old published floor at Emerging —
       that is expected and is the rule working: the old floor was set by hand
       and the derivation is what makes it consistent. Flagged here so the
       difference is deliberate rather than discovered. */
    const below = NIL_JOBS.filter((j) => j.sellFloorEmerging < j.sellLow).map((j) => j.id);
    expect(below).toEqual(["SX-01", "SX-06"]);
  });

  it("keeps a Premium athlete profitable at every derived floor", () => {
    for (const job of NIL_JOBS) {
      const premiumCost = job.baseHigh * TIER_MULTIPLIERS.PREMIUM;
      expect(clearsMarginFloor(job.sellFloorPremium, premiumCost)).toBe(true);
    }
  });
});

describe("the pricing rule", () => {
  it("is 1.4x on the base-band top, not the midpoint", () => {
    expect(MARGIN_FLOOR).toBe(1.4);
    expect(minimumSellPrice(100, "EMERGING")).toBe(140);
  });

  it("rounds up, never down", () => {
    /* 150 x 1.25 x 1.4 = 262.5. Rounding down would publish a price under the
       rule it came from. */
    expect(minimumSellPrice(150, "CREATOR")).toBe(263);
  });

  it("prices the three tiers and leaves Anchor out", () => {
    expect(PRICED_TIERS).toEqual(["EMERGING", "CREATOR", "PREMIUM"]);
    expect(Object.keys(TIER_MULTIPLIERS)).not.toContain("ANCHOR");
  });
});

describe("the sponsor packages", () => {
  it("has all six athlete packages, plus the NEXT products (P9-BE-01)", () => {
    expect(ATHLETE_PACKAGES).toHaveLength(6);
    expect(SPONSOR_PACKAGES.length).toBeGreaterThan(6);
  });

  it("stops Local Blitz below 10-Athlete Blitz, so neither sits inside the other", () => {
    const local = SPONSOR_PACKAGES.find((p) => p.code === "LOCAL_BLITZ")!;
    const blitz10 = SPONSOR_PACKAGES.find((p) => p.code === "BLITZ_10")!;
    expect(local.priceHigh).toBeLessThan(blitz10.priceLow);
    expect(local.athleteCountMax).toBeLessThan(blitz10.athleteCountMin);
  });

  it("clears the margin floor at every package's most expensive athlete count", () => {
    const jobs = new Map(NIL_JOBS.map((j) => [j.id, j]));
    /* ATHLETE_PACKAGES, not all of them: a NEXT package has no job line and
       so no athlete cost to clear (P9-BE-01; tests/next-packages.test.ts). */
    for (const pkg of ATHLETE_PACKAGES) {
      if (pkg.code === "SEASON_PARTNER") continue; // negotiated, by §7
      const cost = pkg.lineItems.reduce((sum, li) => {
        const job = jobs.get(li.jobCode)!;
        /* Mid-band pay, the basis §3 of the packages document costs against. */
        const mid = (job.baseLow + job.baseHigh) / 2;
        return sum + mid * li.quantityPerAthlete * pkg.athleteCountMax;
      }, 0);
      expect(clearsMarginFloor(pkg.priceLow, cost), `${pkg.code} is underwater`).toBe(true);
    }
  });

  it("carries the iMC/BTG feature as a line with a record, not a phrase", () => {
    const community = SPONSOR_PACKAGES.find((p) => p.code === "COMMUNITY_CAMPAIGN")!;
    expect(community.includes).toContainEqual(
      { kind: "FEATURE", code: "IMC_BTG_FEATURE", quantity: 1 });
  });

  it("references only job codes that exist", () => {
    const codes = new Set(NIL_JOBS.map((j) => j.id));
    for (const pkg of SPONSOR_PACKAGES) {
      for (const li of pkg.lineItems) expect(codes).toContain(li.jobCode);
    }
  });

  it("gives every package a unique code", () => {
    const codes = SPONSOR_PACKAGES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
