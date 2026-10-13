import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICING_DESK,
  SAMPLE_PRICING_DETAIL,
  SMALL_SAMPLE,
  checkOverride,
  deltaOf,
  factorWidth,
  kindLabel,
  parseCpmInput,
  pricingView,
  rangeScale,
  rangeWords,
  rankFactors,
  reconciles,
  sampleDetail,
  smallSample,
  waterfall,
  type PricingFactor,
} from "../src/lib/pricing-live";
import { confidenceBand } from "../src/lib/intelligence";

/* --------------------------------------------------------------------------
   3S2-FE-01 — the pricing panel's rules: delta wording, factors ranked by
   size, a waterfall that sums, the small-sample flag, the override's rules
   (a reason, never under the floor, never the recommendation itself), and
   samples that obey the same contract the engine is asked to.
   -------------------------------------------------------------------------- */

const f = (key: string, effect: number, impactCents: number): PricingFactor => ({ key, label: key, effect, impactCents, explanation: `pr-${key}` });

describe("deltaOf", () => {
  it("words the gap against the current rate", () => {
    expect(deltaOf(1000, 1120)).toMatchObject({ direction: "up", words: "12% above the current rate" });
    expect(deltaOf(1000, 920)).toMatchObject({ direction: "down", words: "8% below the current rate" });
    expect(deltaOf(1800, 1805)).toMatchObject({ direction: "flat", words: "At the current rate" });
  });

  it("says so when there's no current rate", () => {
    expect(deltaOf(null, 1200)).toEqual({ fraction: null, direction: "none", words: "No current rate to compare" });
    expect(deltaOf(0, 1200).direction).toBe("none");
  });
});

describe("factors", () => {
  const factors = [f("pr-a", 0.05, 50), f("pr-b", -0.2, -200), f("pr-c", 0.1, 100), f("pr-d", -0.05, -50)];

  it("ranks by the size of the push, either way, ties in engine order", () => {
    expect(rankFactors(factors).map((x) => x.key)).toEqual(["pr-b", "pr-c", "pr-a", "pr-d"]);
  });

  it("sizes bars against the largest push", () => {
    expect(factorWidth(-0.2, factors)).toBe(100);
    expect(factorWidth(0.1, factors)).toBe(50);
    expect(factorWidth(0, [])).toBe(0);
  });

  it("builds a waterfall of running totals from the base", () => {
    const steps = waterfall(1000, factors);
    expect(steps[0]).toEqual({ key: "pr-b", label: "pr-b", fromCents: 1000, toCents: 800, impactCents: -200 });
    expect(steps.at(-1)?.toCents).toBe(900);
  });

  it("checks the factors add up to the recommendation", () => {
    const rec = { ...SAMPLE_PRICING_DETAIL.recommendation, baseCpmCents: 1000, recommendedCpmCents: 900, factors };
    expect(reconciles(rec)).toEqual({ ok: true, gapCents: 0 });
    expect(reconciles({ ...rec, recommendedCpmCents: 1000 })).toEqual({ ok: false, gapCents: 100 });
  });
});

describe("historical range", () => {
  const range = { p25Cents: 1000, medianCents: 1200, p75Cents: 1400, sampleSize: 30, basis: "pr-basis" };

  it("flags a small sample", () => {
    expect(smallSample(range)).toBe(false);
    expect(smallSample({ ...range, sampleSize: SMALL_SAMPLE - 1 })).toBe(true);
    expect(smallSample(null)).toBe(false);
  });

  it("scales so every marker lands inside the bar", () => {
    const s = rangeScale(range, [800, 1600, null]);
    expect(s.lo).toBeLessThan(800);
    expect(s.hi).toBeGreaterThan(1600);
    expect(s.at(800)).toBeGreaterThan(0);
    expect(s.at(1600)).toBeLessThan(100);
  });

  it("words where a price sits", () => {
    expect(rangeWords(range, 900)).toBe("below the usual range");
    expect(rangeWords(range, 1200)).toBe("inside the usual range");
    expect(rangeWords(range, 1500)).toBe("above the usual range");
  });
});

describe("override rules", () => {
  const rec = { recommendedCpmCents: 1300, floorCpmCents: 900 };
  const reason = "Bundled with playoff games at the sponsor's request.";

  it("parses a CPM in dollars", () => {
    expect(parseCpmInput("12.40")).toBe(1240);
    expect(parseCpmInput("$1,250")).toBe(125_000);
    expect(parseCpmInput("12.345")).toBe("invalid");
    expect(parseCpmInput("0")).toBe("invalid");
    expect(parseCpmInput("abc")).toBe("invalid");
  });

  it("needs a reason", () => {
    expect(checkOverride("12.50", "", rec).ok).toBe(false);
    expect(checkOverride("12.50", "  short  ", rec).ok).toBe(false);
    expect(checkOverride("12.50", reason, rec)).toEqual({ ok: true, cpmCents: 1250, reason });
  });

  it("never goes under the floor", () => {
    const r = checkOverride("8.99", reason, rec);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/sell floor/);
    expect(checkOverride("8.99", reason, { ...rec, floorCpmCents: null }).ok).toBe(true);
  });

  it("isn't an override when it matches the recommendation", () => {
    expect(checkOverride("13.00", reason, rec).ok).toBe(false);
  });
});

describe("views and words", () => {
  it("reads ?view from the allowed set only", () => {
    expect(pricingView({ view: "low" })).toBe("low");
    expect(pricingView({ view: ["above"] })).toBe("above");
    expect(pricingView({ view: "everything" })).toBe("");
    expect(pricingView({})).toBe("");
  });

  it("names inventory kinds", () => {
    expect(kindLabel("SOCIAL_POST")).toBe("Social post");
    expect(kindLabel("NEW_THING")).toBe("New thing");
  });
});

describe("samples obey the contract", () => {
  it("the desk summary agrees with its rows", () => {
    const rows = SAMPLE_PRICING_DESK.items;
    const dir = rows.map((r) => deltaOf(r.currentCpmCents, r.recommendedCpmCents).direction);
    expect(SAMPLE_PRICING_DESK.summary).toEqual({
      priced: rows.length,
      above: dir.filter((d) => d === "up").length,
      below: dir.filter((d) => d === "down").length,
      atRate: dir.filter((d) => d === "flat").length,
      lowConfidence: rows.filter((r) => confidenceBand(r.stamp.confidence) === "low").length,
    });
    expect(new Set(rows.map((r) => r.inventoryId)).size).toBe(rows.length);
  });

  it.each(SAMPLE_PRICING_DESK.items.map((r) => [r.inventoryId]))("%s: factors add up, never under the floor, matches its row", (id) => {
    const d = sampleDetail(id);
    const row = SAMPLE_PRICING_DESK.items.find((r) => r.inventoryId === id)!;
    expect(reconciles(d.recommendation).ok).toBe(true);
    expect(d.recommendation.recommendedCpmCents).toBe(row.recommendedCpmCents);
    expect(d.recommendation.recommendedCpmCents).toBeGreaterThanOrEqual(d.recommendation.floorCpmCents ?? 0);
    expect(d.inventory.title).toBe(row.title);
    expect(d.recommendation.stamp.modelVersion).toBeTruthy();
  });

  it("the low-confidence sample shows a small sample", () => {
    const low = SAMPLE_PRICING_DESK.items.find((r) => r.stamp.confidence < 0.5)!;
    expect(smallSample(sampleDetail(low.inventoryId).recommendation.range)).toBe(true);
  });
});
