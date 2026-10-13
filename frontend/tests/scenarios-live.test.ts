import { describe, expect, it } from "vitest";

import {
  SAMPLE_MODEL,
  SAMPLE_SCENARIO_DESK,
  addFormat,
  cleanInputs,
  compact,
  diffResults,
  inputsKey,
  mixTotal,
  normaliseMix,
  parseStateCodes,
  rebalanceMix,
  removeFormat,
  sampleResult,
  signedCompact,
  signedPoints,
  signedRatio,
  signedUsd,
  validateInputs,
  type ScenarioInputs,
  type ScenarioResult,
} from "@/lib/scenarios-live";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's pure helpers and its sample, pinned.
   Fixture format keys are prefixed SCT_ (this file).
   -------------------------------------------------------------------------- */

const inputs = (over: Partial<ScenarioInputs> = {}): ScenarioInputs => ({
  budgetCents: 10_000_00,
  cpmCents: 10_00,
  audience: {},
  mix: [
    { format: "SCT_POST", share: 0.5 },
    { format: "SCT_VIDEO", share: 0.5 },
  ],
  ...over,
});

const result = (mid: number, revenue: number, p: number): ScenarioResult => ({
  expectedImpressions: { low: mid * 0.8, mid, high: mid * 1.2 },
  expectedRevenueCents: revenue,
  deliveryProbability: p,
  stamp: { modelVersion: "sct@1", confidence: 0.7, computedAt: "2026-10-13T00:00:00.000Z" },
  notes: [],
});

describe("normaliseMix", () => {
  it("merges duplicates, drops empty lines and scales to exactly 100%", () => {
    const m = normaliseMix([
      { format: "SCT_A", share: 1 },
      { format: "SCT_B", share: 1 },
      { format: "SCT_A", share: 1 },
      { format: "SCT_C", share: 0 },
      { format: " ", share: 3 },
      { format: "SCT_D", share: Number.NaN },
    ]);
    expect(m.map((l) => l.format)).toEqual(["SCT_A", "SCT_B"]);
    expect(m[0].share).toBeCloseTo(2 / 3, 3);
    expect(mixTotal(m)).toBe(1);
  });

  it("absorbs rounding drift so thirds still sum to 1", () => {
    const m = normaliseMix([
      { format: "SCT_A", share: 1 },
      { format: "SCT_B", share: 1 },
      { format: "SCT_C", share: 1 },
    ]);
    expect(mixTotal(m)).toBeCloseTo(1, 10);
  });

  it("an all-zero mix is empty", () => {
    expect(normaliseMix([{ format: "SCT_A", share: 0 }])).toEqual([]);
  });
});

describe("moving the mix sliders keeps 100%", () => {
  it("the dragged format takes its share; the rest keep their proportions", () => {
    const m = rebalanceMix(
      [
        { format: "SCT_A", share: 0.5 },
        { format: "SCT_B", share: 0.3 },
        { format: "SCT_C", share: 0.2 },
      ],
      "SCT_A",
      0.8,
    );
    expect(m.map((l) => l.format)).toEqual(["SCT_A", "SCT_B", "SCT_C"]);
    expect(m[0].share).toBeCloseTo(0.8);
    expect(m[1].share).toBeCloseTo(0.12);
    expect(m[2].share).toBeCloseTo(0.08);
    expect(mixTotal(m)).toBeCloseTo(1);
  });

  it("splits evenly when the others were all at zero, and clamps", () => {
    const m = rebalanceMix(
      [
        { format: "SCT_A", share: 1 },
        { format: "SCT_B", share: 0 },
        { format: "SCT_C", share: 0 },
      ],
      "SCT_A",
      0.4,
    );
    expect(m[1].share).toBeCloseTo(0.3);
    expect(m[2].share).toBeCloseTo(0.3);
    expect(rebalanceMix([{ format: "SCT_A", share: 1 }], "SCT_A", 0.2)).toEqual([{ format: "SCT_A", share: 1 }]);
    expect(rebalanceMix(inputs().mix, "SCT_POST", 1.7)[0].share).toBe(1);
  });

  it("adding a format gives it an even share; removing one hands its share back", () => {
    const added = addFormat(inputs().mix, "SCT_SIGN");
    expect(added).toHaveLength(3);
    expect(added[2].share).toBeCloseTo(1 / 3);
    expect(mixTotal(added)).toBeCloseTo(1);
    expect(addFormat(added, "SCT_SIGN")).toHaveLength(3);

    const removed = removeFormat(added, "SCT_SIGN");
    expect(removed.map((l) => l.format)).toEqual(["SCT_POST", "SCT_VIDEO"]);
    expect(mixTotal(removed)).toBe(1);
    expect(removeFormat([{ format: "SCT_A", share: 1 }], "SCT_A")).toEqual([]);
    expect(removeFormat([{ format: "SCT_A", share: 1 }, { format: "SCT_B", share: 0 }], "SCT_A")).toEqual([{ format: "SCT_B", share: 1 }]);
  });
});

describe("validateInputs / cleanInputs", () => {
  it("accepts a sound scenario", () => {
    expect(validateInputs(inputs())).toEqual([]);
  });

  it("says what's wrong, in words", () => {
    expect(validateInputs(inputs({ budgetCents: 0 }))).toContain("Set a budget above zero.");
    expect(validateInputs(inputs({ cpmCents: -5 }))).toContain("Set a CPM above zero.");
    expect(validateInputs(inputs({ mix: [] }))).toContain("Add at least one inventory format.");
    expect(validateInputs(inputs({ mix: [{ format: "SCT_A", share: 0.6 }, { format: "SCT_A", share: 0.4 }] }))).toContain(
      "Each format appears once in the mix.",
    );
    expect(validateInputs(inputs({ mix: [{ format: "SCT_A", share: 0.6 }] }))).toContain("The mix must add up to 100%.");
    expect(validateInputs(inputs({ audience: { stateCodes: ["Texas"] } }))[0]).toMatch(/two-letter/);
  });

  it("cleans what the engine is sent: rounded cents, normalised mix, sorted unique states, no empty keys", () => {
    const c = cleanInputs(
      inputs({ budgetCents: 100.4, mix: [{ format: "SCT_A", share: 2 }, { format: "SCT_B", share: 2 }], audience: { sport: "", stateCodes: ["tx", "OK", "TX"] } }),
    );
    expect(c.budgetCents).toBe(100);
    expect(c.mix.map((l) => l.share)).toEqual([0.5, 0.5]);
    expect(c.audience).toEqual({ stateCodes: ["OK", "TX"] });
    expect(inputsKey(inputs())).toBe(inputsKey(inputs({ mix: [{ format: "SCT_POST", share: 1 }, { format: "SCT_VIDEO", share: 1 }] })));
  });

  it("parses typed state codes, keeping only offered ones", () => {
    expect(parseStateCodes("tx, ok  KS;tx")).toEqual(["KS", "OK", "TX"]);
    expect(parseStateCodes("tx, ok, zz", ["OK", "TX"])).toEqual(["OK", "TX"]);
    expect(parseStateCodes("Texas")).toEqual([]);
  });
});

describe("diffResults — B against A", () => {
  it("every difference is B − A, with the ratio against A", () => {
    const d = diffResults(result(1_000_000, 2_000_000, 0.8), result(1_250_000, 1_500_000, 0.72));
    expect(d.impressionsMid).toEqual({ delta: 250_000, ratio: 0.25 });
    expect(d.revenueCents).toEqual({ delta: -500_000, ratio: -0.25 });
    expect(d.deliveryProbability).toBeCloseTo(-0.08);
  });

  it("a ratio against zero is null, not infinity", () => {
    expect(diffResults(result(0, 0, 0.5), result(10, 10, 0.5)).impressionsMid.ratio).toBeNull();
  });
});

describe("formatting for a screen share", () => {
  it("compacts impressions", () => {
    expect(compact(1_240_000)).toBe("1.24M");
    expect(compact(12_400_000)).toBe("12.4M");
    expect(compact(2_000_000)).toBe("2M");
    expect(compact(860_400)).toBe("860K");
    expect(compact(9_400)).toBe("9,400");
  });

  it("signs deltas with a true minus and ± for no change", () => {
    expect(signedCompact(250_000)).toBe("+250K");
    expect(signedCompact(-1_500_000)).toBe("−1.5M");
    expect(signedUsd(-500_000)).toBe("−$5,000");
    expect(signedUsd(0)).toBe("±$0");
    expect(signedPoints(0.08)).toBe("+8 pp");
    expect(signedRatio(-0.25)).toBe("−25%");
    expect(signedRatio(null)).toBe("—");
  });
});

describe("SAMPLE (dev preview)", () => {
  it("is stamped as a sample and keeps low ≤ mid ≤ high", () => {
    const r = sampleResult(inputs());
    expect(r.stamp.modelVersion).toBe(SAMPLE_MODEL);
    expect(r.expectedImpressions.low).toBeLessThanOrEqual(r.expectedImpressions.mid);
    expect(r.expectedImpressions.mid).toBeLessThanOrEqual(r.expectedImpressions.high);
    expect(r.deliveryProbability).toBeGreaterThan(0);
    expect(r.deliveryProbability).toBeLessThanOrEqual(1);
  });

  it("reacts to the inputs (a bigger budget buys more impressions)", () => {
    expect(sampleResult(inputs({ budgetCents: 20_000_00 })).expectedImpressions.mid).toBeGreaterThan(sampleResult(inputs()).expectedImpressions.mid);
  });

  it("the sample desk's defaults and saved scenarios are valid inputs over offered formats", () => {
    const offered = SAMPLE_SCENARIO_DESK.options.formats.map((f) => f.key);
    for (const i of [SAMPLE_SCENARIO_DESK.defaults, ...SAMPLE_SCENARIO_DESK.scenarios.map((s) => s.inputs)]) {
      expect(validateInputs(i)).toEqual([]);
      expect(i.mix.every((l) => offered.includes(l.format))).toBe(true);
      for (const c of i.audience.stateCodes ?? []) expect(SAMPLE_SCENARIO_DESK.options.stateCodes).toContain(c);
    }
    expect(SAMPLE_SCENARIO_DESK.page.total).toBe(SAMPLE_SCENARIO_DESK.scenarios.length);
  });
});
