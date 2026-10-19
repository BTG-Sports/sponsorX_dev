import { describe, expect, it } from "vitest";

import {
  BUDGET_MAX_CENTS,
  CPM_MAX_CENTS,
  MIX_MAX,
  NAME_MAX,
  SAMPLE_MODEL,
  SAMPLE_SCENARIO_DESK,
  addFormat,
  ageBandLabel,
  cleanInputs,
  compact,
  diffResults,
  inputsKey,
  mixTotal,
  normaliseMix,
  parseStateCodes,
  problemsText,
  rebalanceMix,
  removeFormat,
  sampleResult,
  signedCompact,
  signedPoints,
  signedRatio,
  signedUsd,
  validateInputs,
  type ApiSavedScenario,
  type ApiScenarioDesk,
  type ScenarioInputs,
  type ScenarioResult,
} from "@/lib/scenarios-live";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's pure helpers and its sample, pinned,
   and the lib's contract held against the engine's (3S7-BE-01, mounted
   2026-10-15: backend/src/domain/scenario-rules.ts, scenario-engine.ts,
   contracts/intelligence.ts, backend/tests/scenarios.test.ts).
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

/* ------------------------------------------------ the engine's shapes, as it sends them */

/** The engine's formats — what SCENARIO_FORMATS maps to in the desk's options. */
const ENGINE_FORMATS = ["SOCIAL_POST", "VIDEO"];

/** GET /intelligence/scenarios as scenario-engine.ts's scenarioDesk returns it (its test's expectations, verbatim). */
const ENGINE_DESK: ApiScenarioDesk = {
  scenarios: [
    {
      id: "scn_1",
      name: "All posts",
      inputs: { budgetCents: 10_000_00, cpmCents: 20_00, audience: { sport: "Soccer", stateCodes: ["MD"] }, mix: [{ format: "SOCIAL_POST", share: 1 }] },
      result: {
        expectedImpressions: { low: 450000, mid: 600000, high: 775000 },
        expectedRevenueCents: 10_000_00,
        deliveryProbability: 0.661,
        stamp: { modelVersion: "scenario-rules@1.0.0", confidence: 0.8, computedAt: "2026-11-10T20:00:00.000Z" },
        notes: ["The budget buys about 100 post(s); at this CPM the sponsor is sold 500,000 views.", "Based on 4 matching athletes' verified views per post."],
      },
      savedAt: "2026-11-10T20:00:00.000Z",
      savedBy: "sal@scn.invalid",
    },
  ],
  page: { page: 1, size: 25, total: 1, pages: 1 },
  defaults: { budgetCents: 10_000_00, cpmCents: 20_00, audience: {}, mix: [{ format: "SOCIAL_POST", share: 0.6 }, { format: "VIDEO", share: 0.4 }] },
  options: {
    formats: [{ key: "SOCIAL_POST", label: "Social post" }, { key: "VIDEO", label: "Video" }],
    sports: ["Soccer", "Tennis"],
    stateCodes: ["MD", "VA"],
    ageBands: ["18_PLUS"],
  },
};

describe("the engine's payloads fit the lib's types", () => {
  it("the desk's defaults are inputs the planner can send back unchanged, over the formats it offers", () => {
    const offered = ENGINE_DESK.options.formats.map((f) => f.key);
    expect(validateInputs(ENGINE_DESK.defaults, offered)).toEqual([]);
    expect(cleanInputs(ENGINE_DESK.defaults)).toEqual(ENGINE_DESK.defaults);
    expect(offered).toEqual(ENGINE_FORMATS);
  });

  it("a saved scenario carries savedBy (an email, never optional) and a stamped result the planner can diff", () => {
    const saved: ApiSavedScenario = ENGINE_DESK.scenarios[0];
    expect(saved.savedBy).toBe("sal@scn.invalid");
    expect(saved.result.stamp.modelVersion).toBe("scenario-rules@1.0.0");
    expect(diffResults(saved.result, saved.result).impressionsMid).toEqual({ delta: 0, ratio: 0 });
    /* A saved scenario's inputs load straight back into a column. */
    expect(validateInputs(cleanInputs(saved.inputs), ENGINE_FORMATS)).toEqual([]);
  });

  it("the body POSTed is exactly ScenarioCalculateInput's inputs: integer cents, strict audience keys, shares summing to 1", () => {
    const c = cleanInputs({ budgetCents: 10_000_00.4, cpmCents: 20_00.2, audience: { sport: "", ageBand: "", stateCodes: [] }, mix: [{ format: "SOCIAL_POST", share: 3 }, { format: "VIDEO", share: 2 }] });
    expect(c).toEqual({ budgetCents: 10_000_00, cpmCents: 20_00, audience: {}, mix: [{ format: "SOCIAL_POST", share: 0.6 }, { format: "VIDEO", share: 0.4 }] });
    expect(Object.keys(c)).toEqual(["budgetCents", "cpmCents", "audience", "mix"]);
    expect(Number.isInteger(c.budgetCents) && Number.isInteger(c.cpmCents)).toBe(true);
    expect(mixTotal(c.mix)).toBe(1);
  });
});

describe("validateInputs says the engine's words (scenario-rules.ts inputProblems), in its order", () => {
  it("accepts a sound scenario", () => {
    expect(validateInputs(inputs())).toEqual([]);
    expect(validateInputs(inputs(), ["SCT_POST", "SCT_VIDEO"])).toEqual([]);
  });

  it("matches the engine's own test case word for word", () => {
    /* backend/tests/scenarios.test.ts: budget 0, an unpriceable format at 90%, a lower-case state. */
    expect(validateInputs({ ...inputs(), budgetCents: 0, mix: [{ format: "SIGNAGE", share: 0.9 }], audience: { stateCodes: ["md"] } }, ENGINE_FORMATS)).toEqual([
      "Set a budget above zero.",
      "The planner can't price SIGNAGE.",
      "The mix must add up to 100%.",
      "State codes are two capital letters.",
    ]);
  });

  it("names each problem", () => {
    expect(validateInputs(inputs({ cpmCents: -5 }))).toEqual(["Set a CPM above zero."]);
    expect(validateInputs(inputs({ mix: [] }))).toEqual(["Add at least one inventory format."]);
    expect(validateInputs(inputs({ mix: [{ format: "SCT_A", share: 0.6 }, { format: "SCT_A", share: 0.4 }] }))).toEqual(["Each format appears once in the mix."]);
    expect(validateInputs(inputs({ mix: [{ format: "SCT_A", share: 1.4 }, { format: "SCT_B", share: -0.4 }] }))).toEqual(["Each format's share is between 0% and 100%."]);
    expect(validateInputs(inputs({ mix: [{ format: "SCT_A", share: 0.6 }] }))).toEqual(["The mix must add up to 100%."]);
    expect(validateInputs(inputs({ audience: { stateCodes: ["Texas"] } }))).toEqual(["State codes are two capital letters."]);
    expect(validateInputs(inputs({ mix: [{ format: "SCT_X", share: 0.5 }, { format: "SCT_Y", share: 0.5 }] }), ["SCT_POST"])).toEqual(["The planner can't price SCT_X, SCT_Y."]);
  });

  it("pre-empts the contract's integer bounds, which the API would refuse without words", () => {
    expect(validateInputs(inputs({ budgetCents: BUDGET_MAX_CENTS }))).toEqual([]);
    expect(validateInputs(inputs({ budgetCents: BUDGET_MAX_CENTS + 1 }))).toEqual(["The budget is at most $20,000,000."]);
    expect(validateInputs(inputs({ cpmCents: CPM_MAX_CENTS + 1 }))).toEqual(["The CPM is at most $100,000 per 1,000 views."]);
    const crowded = Array.from({ length: MIX_MAX + 1 }, (_, i) => ({ format: `SCT_${i}`, share: 1 / (MIX_MAX + 1) }));
    expect(validateInputs(inputs({ mix: crowded }))).toEqual([`The mix holds at most ${MIX_MAX} formats.`]);
    expect(NAME_MAX).toBe(120);
  });

  it("joins the problems into one line, the shape of the API's 422 message", () => {
    expect(problemsText(["Set a budget above zero.", "The mix must add up to 100%."])).toBe("Set a budget above zero. The mix must add up to 100%.");
    expect(problemsText([])).toBe("");
  });
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

describe("cleanInputs / parseStateCodes / ageBandLabel", () => {
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

  it("says the athlete records' age bands for a sponsor; the key is what is posted", () => {
    expect(["UNDER_16", "16_17", "18_PLUS"].map(ageBandLabel)).toEqual(["Under 16", "16–17", "18+"]);
    expect(ageBandLabel("SCT_OTHER")).toBe("SCT_OTHER");
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

  it("is shaped like the live desk: the engine's two formats, its age-band keys, an email in savedBy", () => {
    expect(SAMPLE_SCENARIO_DESK.options.formats.map((f) => f.key)).toEqual(ENGINE_FORMATS);
    expect(SAMPLE_SCENARIO_DESK.defaults.mix).toEqual(ENGINE_DESK.defaults.mix);
    for (const b of SAMPLE_SCENARIO_DESK.options.ageBands) expect(ageBandLabel(b)).not.toBe(b);
    for (const s of SAMPLE_SCENARIO_DESK.scenarios) expect(s.savedBy).toMatch(/@/);
  });

  it("the sample desk's defaults and saved scenarios are valid inputs over offered formats", () => {
    const offered = SAMPLE_SCENARIO_DESK.options.formats.map((f) => f.key);
    for (const i of [SAMPLE_SCENARIO_DESK.defaults, ...SAMPLE_SCENARIO_DESK.scenarios.map((s) => s.inputs)]) {
      expect(validateInputs(i, offered)).toEqual([]);
      for (const c of i.audience.stateCodes ?? []) expect(SAMPLE_SCENARIO_DESK.options.stateCodes).toContain(c);
      if (i.audience.ageBand) expect(SAMPLE_SCENARIO_DESK.options.ageBands).toContain(i.audience.ageBand);
    }
    expect(SAMPLE_SCENARIO_DESK.page.total).toBe(SAMPLE_SCENARIO_DESK.scenarios.length);
  });
});
