import { describe, expect, it } from "vitest";

import { ATTRIBUTION_ORDER, ENGINES } from "@/lib/intelligence";
import {
  PROPERTY_INTEL_PATH,
  SAMPLE_PROPERTY_INTEL,
  categoryWord,
  confidenceShort,
  fitWord,
  overallSellThrough,
  qualityBand,
  rankFit,
  rankRates,
  rateChange,
  splitSellThrough,
  type PropertyRate,
} from "@/lib/property-intelligence-live";
import {
  SAMPLE_SPONSOR_INTEL,
  classTiles,
  formatWord,
  knownCost,
  rankFormats,
  rankPartners,
  renewalEnded,
  renewalWord,
  renewalsDue,
  sourcedSegments,
  sponsorIntelPath,
  type SponsorIntelFormat,
  type SponsorIntelSegment,
} from "@/lib/sponsor-intelligence-live";

/* 3S7-FE-01 / 3S7-FE-02 — the intelligence hubs' pure halves, against what
   the mounted engine (3S7-BE-02) actually sends. Fixture ids carry the
   "ihub-" prefix so they never collide with another file's. */

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
    expect(emv.value).toBe(414_700);
    expect(emv.caption).toBe("An estimate from 715,000 checked views · not revenue");
    const redeemed = tiles.find((t) => t.cls === "VERIFIED_REDEMPTION")!;
    expect(redeemed).toMatchObject({ value: 1240, format: "int", caption: "Checked" });
  });

  it("a partner-sales class with money prints it as a likely or checked figure, never blended", () => {
    const tiles = classTiles({ ...SAMPLE_SPONSOR_INTEL.totals, MODELLED: { count: 402, amountCents: 1_830_000 }, VERIFIED_TRANSACTION: { count: 186, amountCents: 912_000 } });
    expect(tiles.find((t) => t.cls === "MODELLED")).toMatchObject({ value: 402, caption: "Likely · $18,300 in sales" });
    expect(tiles.find((t) => t.cls === "VERIFIED_TRANSACTION")).toMatchObject({ value: 186, caption: "Checked · $9,120 in sales" });
  });

  it("the engine's zeros (no partner store yet) are zero with their class claim — what the API sends today", () => {
    /* backend/tests/hub-intelligence.test.ts: { count: 0, amountCents: 0 } for both partner-sale classes. */
    const tiles = classTiles({ ...SAMPLE_SPONSOR_INTEL.totals, VERIFIED_REDEMPTION: { count: 0, amountCents: null } });
    expect(tiles.find((t) => t.cls === "VERIFIED_TRANSACTION")).toMatchObject({ value: 0, format: "int", caption: "Checked · none from a partner store yet" });
    expect(tiles.find((t) => t.cls === "MODELLED")).toMatchObject({ value: 0, format: "int", caption: "Likely · none from a partner store yet" });
    expect(tiles.find((t) => t.cls === "VERIFIED_REDEMPTION")).toMatchObject({ value: 0, caption: "Checked · none yet" });
  });

  it("media value with no benchmark is no figure — never $0 — and says why", () => {
    const tiles = classTiles({ ...SAMPLE_SPONSOR_INTEL.totals, ESTIMATED_MEDIA_VALUE: { count: 15_000, amountCents: null } });
    const emv = tiles.find((t) => t.cls === "ESTIMATED_MEDIA_VALUE")!;
    expect(emv.value).toBeNull();
    expect(emv.caption).toBe("15,000 checked views, but no market rate on file yet to price them · no estimate");
    const none = classTiles({ ...SAMPLE_SPONSOR_INTEL.totals, ESTIMATED_MEDIA_VALUE: { count: 0, amountCents: null } }).find((t) => t.cls === "ESTIMATED_MEDIA_VALUE")!;
    expect(none).toMatchObject({ value: null, caption: "No checked views yet · no estimate" });
    /* A benchmark but no views is an honest $0 estimate. */
    expect(classTiles({ ...SAMPLE_SPONSOR_INTEL.totals, ESTIMATED_MEDIA_VALUE: { count: 0, amountCents: 0 } }).find((t) => t.cls === "ESTIMATED_MEDIA_VALUE"))
      .toMatchObject({ value: 0, caption: "An estimate · not revenue" });
  });

  it("a class the engine leaves out is zero, not missing", () => {
    const { VERIFIED_TRANSACTION: _drop, ...rest } = SAMPLE_SPONSOR_INTEL.totals;
    void _drop;
    const tiles = classTiles(rest);
    expect(tiles.find((t) => t.cls === "VERIFIED_TRANSACTION")!.value).toBe(0);
  });

  it("ranks formats by cost per redemption, no-redemption formats last by reach", () => {
    const f = (format: string, cost: number | null, reach: number): SponsorIntelFormat => ({
      format, campaigns: 1, deliveredImpressions: reach, redemptions: cost === null ? 0 : 10, costPerResultCents: cost, provenance: "VERIFIED_API",
    });
    const ranked = rankFormats([f("ihub-a", null, 10), f("ihub-b", 500, 0), f("ihub-c", 200, 0), f("ihub-d", null, 90)]);
    expect(ranked.map((r) => r.format)).toEqual(["ihub-c", "ihub-b", "ihub-d", "ihub-a"]);
  });

  it("the engine's $0 a fan (redemptions, but the spend was booked outside the window) is no price, not the best one", () => {
    /* backend/tests/hub-intelligence.test.ts: a 7-day window gives costPerResultCents 0 with 4 redemptions. */
    const zero: SponsorIntelFormat = { format: "SOCIAL_POST", campaigns: 1, deliveredImpressions: 10_000, redemptions: 4, costPerResultCents: 0, provenance: "VERIFIED_API" };
    const priced: SponsorIntelFormat = { ...zero, format: "VIDEO", redemptions: 2, costPerResultCents: 5_000 };
    const nobody: SponsorIntelFormat = { ...zero, format: "APPEARANCE", redemptions: 0, costPerResultCents: null };
    expect(knownCost(zero)).toBeNull();
    expect(knownCost(priced)).toBe(5_000);
    expect(rankFormats([nobody, zero, priced]).map((r) => r.format)).toEqual(["VIDEO", "SOCIAL_POST", "APPEARANCE"]);
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

  it("drops an audience segment with no named source, and the sample invents none", () => {
    const rows: SponsorIntelSegment[] = [
      { label: "ihub-young", share: 0.3, source: "Instagram audience insights", provenance: "VERIFIED_API" },
      { label: "ihub-older", share: 0.5, source: "Instagram audience insights", provenance: "VERIFIED_API" },
      { label: "ihub-local", share: 0.9, source: "", provenance: "SELF_REPORTED" },
    ];
    expect(sourcedSegments(rows).map((s) => s.label)).toEqual(["ihub-older", "ihub-young"]);
    expect(sourcedSegments([{ label: "ihub-x", share: 0.9, source: "   ", provenance: "ESTIMATED" }])).toEqual([]);
    /* The engine sends segments: [] — nothing on file names a source — so the sample does too. */
    expect(SAMPLE_SPONSOR_INTEL.segments).toEqual([]);
    expect(sourcedSegments([])).toEqual([]);
  });

  it("orders renewals soonest-ending first, and every one carries the engine's model stamp", () => {
    const due = renewalsDue(SAMPLE_SPONSOR_INTEL.renewals);
    expect(due.map((r) => r.campaignId)).toEqual(["sxi-sp-cmp-1", "sxi-sp-cmp-2"]);
    for (const r of due) {
      expect(r.stamp.modelVersion).toBe("renewal-rules@1.0.0");
      expect(r.stamp.confidence).toBeGreaterThanOrEqual(0);
      expect(r.stamp.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("says Ended for a campaign already past its end date: the engine's flag first, the date against asOf without it", () => {
    const asOf = "2026-10-12T06:00:00.000Z";
    expect(renewalEnded({ endsAt: "2026-10-05T00:00:00.000Z", ended: true }, asOf)).toBe(true);
    expect(renewalEnded({ endsAt: "2026-10-31T00:00:00.000Z", ended: false }, asOf)).toBe(false);
    /* The proposed shape had no `ended`; an answer without it still reads right. */
    expect(renewalEnded({ endsAt: "2026-10-05T00:00:00.000Z" }, asOf)).toBe(true);
    expect(renewalEnded({ endsAt: "2026-10-31T00:00:00.000Z" }, asOf)).toBe(false);
    /* The engine's flag wins over the clock. */
    expect(renewalEnded({ endsAt: "2026-10-31T00:00:00.000Z", ended: true }, asOf)).toBe(true);
  });

  it("speaks plain words: no enum reaches the sponsor, and every format the ledger names has a label", () => {
    expect(renewalWord("RENEW").text).toBe("Worth renewing");
    expect(renewalWord("ADJUST").text).toBe("Renew with changes");
    expect(renewalWord("LET_END").text).toBe("Let it end");
    expect(renewalWord("ihub-UNKNOWN").text).toBe("No advice yet");
    /* backend/src/domain/sponsor-intelligence.ts formatOf: NIL jobs → SOCIAL_POST / VIDEO / APPEARANCE / PACKAGE, listed items → their kind, ad slots → AD_SLOT, else OTHER. */
    expect(["SOCIAL_POST", "VIDEO", "APPEARANCE", "PACKAGE", "AD_SLOT", "OTHER", "SIGNAGE"].map(formatWord))
      .toEqual(["Social post", "Video", "Appearance", "Package", "Edition ad", "Other", "Signage"]);
    for (const t of classTiles(SAMPLE_SPONSOR_INTEL.totals)) expect(t.label).not.toMatch(/[A-Z]{2,}_/);
  });

  it("the sample is shaped as the engine answers: its versions, zero partner sales, a sourced-only audience", () => {
    expect(SAMPLE_SPONSOR_INTEL.totals.VERIFIED_TRANSACTION).toEqual({ count: 0, amountCents: 0 });
    expect(SAMPLE_SPONSOR_INTEL.totals.MODELLED).toEqual({ count: 0, amountCents: 0 });
    expect(SAMPLE_SPONSOR_INTEL.totals.VERIFIED_REDEMPTION.amountCents).toBeNull();
    for (const p of SAMPLE_SPONSOR_INTEL.partners) {
      expect(p.stamp.modelVersion).toBe("sponsor-intel@1.0.0");
      expect(["VERIFIED_API", "VERIFIED_MANUAL"]).toContain(p.provenance);
      expect(["athlete", "property"]).toContain(p.kind);
    }
    for (const f of SAMPLE_SPONSOR_INTEL.formats) expect(["VERIFIED_API", "VERIFIED_MANUAL"]).toContain(f.provenance);
    for (const r of SAMPLE_SPONSOR_INTEL.renewals) {
      expect(["RENEW", "ADJUST", "LET_END"]).toContain(r.recommendation);
      expect(typeof r.ended).toBe("boolean");
      expect(r.reasons.length).toBeGreaterThan(0);
    }
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

  it("never gives a format with nothing listed a bar — it prints as text", () => {
    const { rated, unlisted } = splitSellThrough(SAMPLE_PROPERTY_INTEL.sellThrough);
    expect(rated.every((r) => typeof r.rate === "number")).toBe(true);
    expect(unlisted.map((r) => r.format)).toEqual(SAMPLE_PROPERTY_INTEL.sellThrough.filter((r) => r.rate === null).map((r) => r.format));
    expect(rated.length + unlisted.length).toBe(SAMPLE_PROPERTY_INTEL.sellThrough.length);
    expect(splitSellThrough([{ format: "ihub-none", sold: 0, listed: 0, rate: null }])).toEqual({ rated: [], unlisted: [{ format: "ihub-none", sold: 0, listed: 0, rate: null }] });
  });

  it("shortens a confidence pill to percent and band, on one line", () => {
    expect(confidenceShort(0.68)).toBe("68% · medium");
    expect(confidenceShort(0.42)).toBe("42% · low");
    expect(confidenceShort(0.81)).toBe("81% · high");
    expect(confidenceShort(1.4)).toBe("100% · high");
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
      { category: "ALCOHOL", fit: 0, reason: "Age-gated: never offered for a school." },
    ]);
    expect(ranked.map((c) => c.category)).toEqual(["FITNESS", "APPAREL", "ALCOHOL"]);
    expect(categoryWord("LOCAL_RETAIL")).toBe("Local retail");
    expect(categoryWord("TOBACCO_VAPE")).toBe("Tobacco vape");
  });

  it("a category that fits 0 reads 'Not a fit' and keeps the engine's reason", () => {
    expect(fitWord(0)).toBe("Not a fit");
    expect(fitWord(0.8)).toBe("80% fit");
    expect(fitWord(0.4)).toBe("40% fit");
    /* backend/src/domain/property-intelligence.ts categoryFit: restricted, and age-gated for a school, fit 0 with these reasons. */
    const zeros = SAMPLE_PROPERTY_INTEL.categoryFit.categories.filter((c) => c.fit === 0);
    expect(zeros.map((c) => c.reason)).toEqual(["Age-gated: never offered for a school.", "Restricted for this property."]);
    for (const c of SAMPLE_PROPERTY_INTEL.categoryFit.categories) expect(c.reason.trim()).not.toBe("");
  });

  it("the sample is shaped as the engine answers: its versions, its quality parts, and a score that is their average", () => {
    expect(SAMPLE_PROPERTY_INTEL.categoryFit.stamp.modelVersion).toBe("property-intel@1.0.0");
    expect(SAMPLE_PROPERTY_INTEL.quality.stamp.modelVersion).toBe("property-intel@1.0.0");
    for (const r of SAMPLE_PROPERTY_INTEL.rates) {
      expect(r.stamp.modelVersion).toMatch(/^cpm-rules@/);
      expect(r.topFactors.length).toBeLessThanOrEqual(3);
    }
    const parts = SAMPLE_PROPERTY_INTEL.quality.components;
    expect(parts.map((c) => c.label)).toEqual(["Listings complete", "On sale", "Orders fulfilled"]);
    expect(Math.round(parts.reduce((t, c) => t + c.score, 0) / parts.length)).toBe(SAMPLE_PROPERTY_INTEL.quality.score);
  });

  it("bands the quality score", () => {
    expect(qualityBand(75)).toBe("Strong");
    expect(qualityBand(74)).toBe("Fair");
    expect(qualityBand(50)).toBe("Fair");
    expect(qualityBand(49)).toBe("Needs work");
  });
});
