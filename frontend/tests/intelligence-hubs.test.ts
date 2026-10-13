import { describe, expect, it } from "vitest";

import { ATTRIBUTION_ORDER, ENGINES } from "@/lib/intelligence";
import {
  PROPERTY_INTEL_PATH,
  SAMPLE_PROPERTY_INTEL,
  categoryWord,
  overallSellThrough,
  qualityBand,
  rankFit,
  rankRates,
  rateChange,
  type PropertyRate,
} from "@/lib/property-intelligence-live";
import {
  SAMPLE_SPONSOR_INTEL,
  classTiles,
  formatWord,
  rankFormats,
  rankPartners,
  renewalWord,
  renewalsDue,
  sourcedSegments,
  sponsorIntelPath,
  type SponsorIntelFormat,
} from "@/lib/sponsor-intelligence-live";

/* 3S7-FE-01 / 3S7-FE-02 — the intelligence hubs' pure halves. Fixture ids
   carry the "ihub-" prefix so they never collide with another file's. */

describe("3S7-FE-01 sponsor hub — contract and engine", () => {
  it("reads the engine the registry names, with the window", () => {
    expect(ENGINES.sponsorHub.endpoint).toBe("GET /intelligence/sponsor");
    expect(sponsorIntelPath("90d")).toBe("/intelligence/sponsor?range=90d");
  });

  it("keeps the four attribution classes as four tiles, in order, never blended", () => {
    const tiles = classTiles(SAMPLE_SPONSOR_INTEL.totals);
    expect(tiles.map((t) => t.cls)).toEqual(ATTRIBUTION_ORDER);
    const emv = tiles.find((t) => t.cls === "ESTIMATED_MEDIA_VALUE")!;
    expect(emv.format).toBe("usd0");
    expect(emv.value).toBe(4_150_000);
    expect(emv.caption).toMatch(/estimate/i);
    const redeemed = tiles.find((t) => t.cls === "VERIFIED_REDEMPTION")!;
    expect(redeemed).toMatchObject({ value: 1240, format: "int", caption: "Checked" });
    expect(tiles.find((t) => t.cls === "MODELLED")!.caption).toMatch(/^Likely · \$18,300/);
  });

  it("a class the engine leaves out is zero, not missing", () => {
    const { VERIFIED_TRANSACTION: _drop, ...rest } = SAMPLE_SPONSOR_INTEL.totals;
    void _drop;
    const tiles = classTiles(rest as typeof SAMPLE_SPONSOR_INTEL.totals);
    expect(tiles.find((t) => t.cls === "VERIFIED_TRANSACTION")!.value).toBe(0);
  });

  it("ranks formats by cost per redemption, no-redemption formats last by reach", () => {
    const f = (format: string, cost: number | null, reach: number): SponsorIntelFormat => ({
      format, campaigns: 1, deliveredImpressions: reach, redemptions: cost === null ? 0 : 10, costPerResultCents: cost, provenance: "VERIFIED_API",
    });
    const ranked = rankFormats([f("ihub-a", null, 10), f("ihub-b", 500, 0), f("ihub-c", 200, 0), f("ihub-d", null, 90)]);
    expect(ranked.map((r) => r.format)).toEqual(["ihub-c", "ihub-b", "ihub-d", "ihub-a"]);
  });

  it("ranks partners by score, then campaigns together", () => {
    const base = SAMPLE_SPONSOR_INTEL.partners[0];
    const ranked = rankPartners([
      { ...base, id: "ihub-p1", score: 0.5, campaigns: 1 },
      { ...base, id: "ihub-p2", score: 0.9, campaigns: 1 },
      { ...base, id: "ihub-p3", score: 0.5, campaigns: 4 },
    ]);
    expect(ranked.map((p) => p.id)).toEqual(["ihub-p2", "ihub-p3", "ihub-p1"]);
  });

  it("drops an audience segment with no named source", () => {
    const shown = sourcedSegments(SAMPLE_SPONSOR_INTEL.segments);
    expect(shown.map((s) => s.label)).toEqual(["Ages 18–24", "Ages 25–34"]);
    expect(sourcedSegments([{ label: "ihub-x", share: 0.9, source: "   ", provenance: "ESTIMATED" }])).toEqual([]);
  });

  it("orders renewals soonest-ending first, and every one carries a model stamp", () => {
    const due = renewalsDue(SAMPLE_SPONSOR_INTEL.renewals);
    expect(due.map((r) => r.campaignId)).toEqual(["sxi-sp-cmp-1", "sxi-sp-cmp-2"]);
    for (const r of due) {
      expect(r.stamp.modelVersion).toBeTruthy();
      expect(r.stamp.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  it("speaks plain words: no enum reaches the sponsor", () => {
    expect(renewalWord("RENEW").text).toBe("Worth renewing");
    expect(renewalWord("ihub-UNKNOWN").text).toBe("No advice yet");
    expect(formatWord("SOCIAL_POST")).toBe("Social post");
    for (const t of classTiles(SAMPLE_SPONSOR_INTEL.totals)) expect(t.label).not.toMatch(/[A-Z]{2,}_/);
  });
});

describe("3S7-FE-02 property hub — contract and engine", () => {
  it("reads the engine the registry names", () => {
    expect(ENGINES.propertyHub.endpoint).toBe(`GET ${PROPERTY_INTEL_PATH}`);
  });

  it("works out a rate change only against a real current rate", () => {
    expect(rateChange({ currentCpmCents: 1000, recommendedCpmCents: 1200 })).toBeCloseTo(0.2);
    expect(rateChange({ currentCpmCents: 1000, recommendedCpmCents: 900 })).toBeCloseTo(-0.1);
    expect(rateChange({ currentCpmCents: null, recommendedCpmCents: 900 })).toBeNull();
    expect(rateChange({ currentCpmCents: 0, recommendedCpmCents: 900 })).toBeNull();
  });

  it("ranks unpriced items first, then by size of the move either way", () => {
    const r = (id: string, current: number | null, rec: number): PropertyRate => ({
      ...SAMPLE_PROPERTY_INTEL.rates[0], inventoryId: id, name: id, currentCpmCents: current, recommendedCpmCents: rec,
    });
    const ranked = rankRates([r("ihub-small", 1000, 1050), r("ihub-down", 1000, 700), r("ihub-new", null, 800), r("ihub-up", 1000, 1200)]);
    expect(ranked.map((x) => x.inventoryId)).toEqual(["ihub-new", "ihub-down", "ihub-up", "ihub-small"]);
  });

  it("sums sell-through across every format and says nothing when nothing is listed", () => {
    expect(overallSellThrough(SAMPLE_PROPERTY_INTEL.sellThrough)).toEqual({ sold: 24, listed: 42, rate: 24 / 42 });
    expect(overallSellThrough([{ format: "ihub-T", sold: 0, listed: 0, rate: null }])).toEqual({ sold: 0, listed: 0, rate: null });
    expect(overallSellThrough([])).toEqual({ sold: 0, listed: 0, rate: null });
  });

  it("labels the open opportunity an estimate", () => {
    expect(SAMPLE_PROPERTY_INTEL.opportunity.provenance).toBe("ESTIMATED");
  });

  it("stamps every model output on the page", () => {
    for (const s of [SAMPLE_PROPERTY_INTEL.categoryFit.stamp, SAMPLE_PROPERTY_INTEL.quality.stamp, ...SAMPLE_PROPERTY_INTEL.rates.map((r) => r.stamp)]) {
      expect(s.modelVersion).toMatch(/@/);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("ranks category fit best first and prints category words", () => {
    const ranked = rankFit([
      { category: "APPAREL", fit: 0.4, reason: "ihub-a" },
      { category: "FITNESS", fit: 0.9, reason: "ihub-b" },
    ]);
    expect(ranked.map((c) => c.category)).toEqual(["FITNESS", "APPAREL"]);
    expect(categoryWord("LOCAL_RETAIL")).toBe("Local retail");
  });

  it("bands the quality score", () => {
    expect(qualityBand(75)).toBe("Strong");
    expect(qualityBand(74)).toBe("Fair");
    expect(qualityBand(50)).toBe("Fair");
    expect(qualityBand(49)).toBe("Needs work");
  });
});
