import { describe, expect, it } from "vitest";

import {
  BENCHMARK_STATUS,
  SAMPLE_REGISTRY,
  SECOND_PERSON_RULE,
  backtestLabel,
  canActivate,
  canValidate,
  cellKey,
  checkFor,
  compareSettings,
  compareVersions,
  defaultPair,
  emptyRegistry,
  featureLabel,
  flagMatrix,
  heldBecauseOf,
  isSmallSample,
  modelReasonError,
  noActionReason,
  outcomeMessage,
  parseSettingsOutcome,
  pickModel,
  registryKpis,
  registryView,
  rollbackTargets,
  thresholdChanges,
  thresholdErrors,
  thresholdWarnings,
  type ModelVersion,
} from "../src/lib/models-live";

/* 3S8-FE-02 — the model registry's rules (acceptance #11, #12; 3S0-PMO-02),
   against the shape model-admin.ts answers (3S8-BE-01, 3S9-QA-01/02). */

const forecast = SAMPLE_REGISTRY.models.find((m) => m.key === "forecast")!;
const v = (version: string, status: ModelVersion["status"], metrics: ModelVersion["metrics"] = [], createdAt = "2026-10-01T00:00:00Z", settings: Record<string, number> = {}): ModelVersion => ({
  version, status, createdAt, createdBy: "mdl-t-user@x.invalid", notes: "", settings, metrics, backtest: null,
});

describe("the sample is shaped like the API's answer", () => {
  it("has bare version numbers, settings, a backtest and a held draft", () => {
    for (const m of SAMPLE_REGISTRY.models) {
      expect(m.activeVersion).toMatch(/^\d+\.\d+\.\d+$/);
      for (const x of m.versions) {
        expect(x.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(Object.keys(x.settings).sort()).toEqual(m.thresholds.map((t) => t.key).sort());
        expect(x.metrics[0]).toMatchObject({ label: "Outputs made" });
      }
    }
    const held = forecast.versions.find((x) => x.status === "draft")!;
    expect(heldBecauseOf(held)).toBe("At risk below this chance is 0.75, outside the safe range 0.3–0.7");
    expect(heldBecauseOf(forecast.versions.find((x) => x.status === "active")!)).toBeNull();
    const simulated = forecast.versions.find((x) => x.backtest?.simulated)!;
    expect(simulated.metrics.slice(1).every((m) => m.label.endsWith("(simulated)"))).toBe(true);
    expect(SAMPLE_REGISTRY.rollouts).toEqual([]);
    expect(SAMPLE_REGISTRY.benchmarkValidation.summary).toEqual({ total: 3, valid: 2, flagged: 1 });
  });
});

describe("validate, activate and roll back — only the moves the registry allows", () => {
  it("validates only a held draft, activates only a validated version", () => {
    expect(canValidate({ status: "draft" })).toBe(true);
    expect(canActivate({ status: "validated" })).toBe(true);
    for (const s of ["validated", "active", "retired"] as const) expect(canValidate({ status: s }), s).toBe(false);
    for (const s of ["draft", "active", "retired"] as const) expect(canActivate({ status: s }), s).toBe(false);
    expect(SECOND_PERSON_RULE).toMatch(/never the one who proposed it/);
  });

  it("rolls back only to a retired version, newest first", () => {
    const m = { ...forecast, versions: [v("1.0.0", "retired", [], "2026-01-01T00:00:00Z"), v("1.2.0", "active"), v("1.1.0", "retired", [], "2026-03-01T00:00:00Z"), v("1.3.0", "draft")] };
    expect(rollbackTargets(m).map((x) => x.version)).toEqual(["1.1.0", "1.0.0"]);
  });

  it("only the live version has no button — a draft gets Validate", () => {
    expect(noActionReason({ status: "active" })).toMatch(/Live/);
    expect(noActionReason({ status: "draft" })).toBeNull();
    expect(noActionReason({ status: "validated" })).toBeNull();
    expect(noActionReason({ status: "retired" })).toBeNull();
  });

  it("every change needs a reason of 10 to 500 characters — the API's rule", () => {
    expect(modelReasonError("")).toMatch(/reason/);
    expect(modelReasonError("short one")).toMatch(/at least 10/);
    expect(modelReasonError("x".repeat(501))).toMatch(/under 500/);
    expect(modelReasonError("Backtest beat the live version on every metric.")).toBeNull();
  });
});

describe("a settings save's answer", () => {
  it("reads { version, status, heldBecause } and ignores anything else", () => {
    expect(parseSettingsOutcome({ version: "2.1.0", status: "active", heldBecause: [], model: {} })).toEqual({ version: "2.1.0", status: "active", heldBecause: [] });
    expect(parseSettingsOutcome({ version: "2.2.0", status: "draft", heldBecause: ["At risk below this chance is 0.75, outside the safe range 0.3–0.7; a second person must validate it before it can go live."] })!.heldBecause).toHaveLength(1);
    expect(parseSettingsOutcome({ model: {} })).toBeNull();
    expect(parseSettingsOutcome({ version: "1.0.0", status: "retired" })).toBeNull();
    expect(parseSettingsOutcome(null)).toBeNull();
  });

  it("says whether it went live or was held, and what happens next", () => {
    expect(outcomeMessage({ version: "2.1.0", status: "active", heldBecause: [] })).toMatchObject({ title: "Version 2.1.0 is live." });
    const held = outcomeMessage({ version: "2.2.0", status: "draft", heldBecause: ["x"] });
    expect(held.title).toMatch(/held as a draft/);
    expect(held.next).toContain(SECOND_PERSON_RULE);
  });
});

describe("compare", () => {
  it("lines two versions' metrics up by label with the change and a verdict", () => {
    const [a, b] = ["2.1.0", "2.0.0"].map((x) => forecast.versions.find((y) => y.version === x)!);
    const rows = compareVersions(a, b);
    expect(rows.find((r) => r.label === "Outputs made")).toMatchObject({ a: "42", b: "318", delta: "+276", verdict: null });
    /* The simulated backtest's labels differ, so each side keeps its own row. */
    expect(rows.find((r) => r.label === "Mean error of the projected final")).toMatchObject({ a: "7.4 %", b: "—", delta: null });
    expect(rows.find((r) => r.label === "Mean error of the projected final (simulated)")).toMatchObject({ a: "—", b: "9.1 %" });
    const same = compareVersions(v("a", "active", [{ label: "Brier", value: 0.2, better: "lower" }]), v("b", "retired", [{ label: "Brier", value: 0.15, better: "lower" }]));
    expect(same[0]).toMatchObject({ delta: "−0.05", verdict: "better" });
  });

  it("keeps a metric only one version has, with a dash for the other", () => {
    const rows = compareVersions(v("x", "retired", [{ label: "A", value: 1 }]), v("y", "validated", [{ label: "B", value: 2 }]));
    expect(rows).toEqual([
      { label: "A", a: "1", b: "—", delta: null, verdict: null },
      { label: "B", a: "—", b: "2", delta: null, verdict: null },
    ]);
  });

  it("puts two versions' settings side by side, labelled by the model's thresholds, marking what differs", () => {
    const [live, held] = ["2.1.0", "2.2.0"].map((x) => forecast.versions.find((y) => y.version === x)!);
    const rows = compareSettings(live, held, forecast.thresholds);
    expect(rows.map((r) => r.key)).toEqual(forecast.thresholds.map((t) => t.key));
    expect(rows.find((r) => r.key === "atRiskBelow")).toEqual({ key: "atRiskBelow", label: "At risk below this chance", a: "0.45", b: "0.75", changed: true });
    expect(rows.find((r) => r.key === "watchBelow")).toMatchObject({ a: "0.8", b: "0.8", changed: false });
    const days = compareSettings(v("a", "active", [], "", { excludedLookbackDays: 365 }), v("b", "draft", [], "", { excludedLookbackDays: 400, extra: 1 }), [
      { key: "excludedLookbackDays", label: "Days", value: 365, unit: "days", min: 90, max: 730 },
    ]);
    expect(days).toEqual([
      { key: "excludedLookbackDays", label: "Days", a: "365 days", b: "400 days", changed: true },
      { key: "extra", label: "extra", a: "—", b: "1", changed: true },
    ]);
  });

  it("opens on the live version against the newest other one with metrics", () => {
    expect(defaultPair(forecast)).toEqual(["2.1.0", "2.2.0"]);
    expect(defaultPair({ ...forecast, versions: [v("1.0.0", "active"), v("1.1.0", "draft", [], "2026-11-01T00:00:00Z")], activeVersion: "1.0.0" })).toEqual(["1.0.0", "1.1.0"]);
    expect(defaultPair({ ...forecast, versions: [v("1.0.0", "active")] })).toBeNull();
  });

  it("names a backtest with its kind and sample", () => {
    expect(backtestLabel({ ranAt: "", simulated: false, sampleSize: 14, calibration: [] })).toBe("Backtest · 14 cases");
    expect(backtestLabel({ ranAt: "", simulated: true, sampleSize: 900, calibration: [] })).toBe("Simulated backtest · 900 cases");
    expect(backtestLabel({ ranAt: "", simulated: false, sampleSize: 1, calibration: [] })).toBe("Backtest · 1 case");
  });
});

describe("settings", () => {
  const ts = forecast.thresholds;

  it("refuses only what the API refuses: not a number, zero or less, a share above 1", () => {
    expect(thresholdErrors(ts, {})).toEqual({});
    expect(thresholdErrors(ts, { atRiskBelow: "abc" }).atRiskBelow).toMatch(/number/);
    expect(thresholdErrors(ts, { atRiskBelow: "" }).atRiskBelow).toMatch(/number/);
    expect(thresholdErrors(ts, { atRiskBelow: "0" }).atRiskBelow).toMatch(/above zero/);
    expect(thresholdErrors(ts, { atRiskBelow: "1.5" }).atRiskBelow).toMatch(/at most 1/);
    const days = [{ key: "windowDays", label: "Days", value: 14, unit: "days", min: 7, max: 30 }];
    expect(thresholdErrors(days, { windowDays: "45" })).toEqual({});
  });

  it("refuses a fraction where the API wants a whole number, in the API's words", () => {
    const days = [{ key: "windowDays", label: "Days a make-good runs", value: 14, unit: "days", min: 7, max: 30, integer: true }];
    expect(thresholdErrors(days, { windowDays: "14.5" }).windowDays).toBe("Days a make-good runs is a whole number.");
    expect(thresholdErrors(days, { windowDays: "15" })).toEqual({});
    /* no flag: a fraction is the API's to judge, as before */
    expect(thresholdErrors([{ ...days[0], integer: undefined }], { windowDays: "14.5" })).toEqual({});
  });

  it("warns, not refuses, outside the safe range — the version is held", () => {
    expect(thresholdWarnings(ts, {})).toEqual({});
    expect(thresholdWarnings(ts, { atRiskBelow: "0.75" }).atRiskBelow).toMatch(/Outside the safe range 0.3–0.7.*held/);
    expect(thresholdWarnings(ts, { atRiskBelow: "0.7" })).toEqual({});
    expect(thresholdWarnings(ts, { atRiskBelow: "abc" })).toEqual({});
    expect(thresholdErrors(ts, { atRiskBelow: "0.75" })).toEqual({});
  });

  it("sends only what changed, as numbers", () => {
    expect(thresholdChanges(ts, { watchBelow: "0.8", atRiskBelow: "0.4" })).toEqual({ atRiskBelow: 0.4 });
    expect(thresholdChanges(ts, {})).toEqual({});
  });
});

describe("feature flags — per tenant (acceptance #12)", () => {
  it("builds a tenant × feature matrix with every cell from a flag row, in the API's feature order", () => {
    const mx = flagMatrix(SAMPLE_REGISTRY.flags);
    expect(mx.features).toEqual(["pricing", "matching", "forecast", "makegood", "anomalies", "scenarios", "sponsorHub", "propertyHub", "zohoIntelligence", "attribution"]);
    expect(mx.tenants.map((t) => t.name)).toEqual(["BTG", "Harbor City FC", "Westfield Athletics"]);
    expect(mx.cells[cellKey("pricing", "mdl-s-t-harbor")]).toBe(false);
    expect(mx.cells[cellKey("zohoIntelligence", "mdl-s-t-westfield")]).toBe(false);
    expect(mx.cells[cellKey("forecast", "mdl-s-t-btg")]).toBe(true);
    expect(mx.cells[cellKey("weather", "mdl-s-t-btg")]).toBeUndefined();
  });

  it("names every feature, the two that are not engines included", () => {
    expect(featureLabel("pricing")).toBe("Dynamic CPM engine");
    expect(featureLabel("scenarios")).toBe("Scenario planning service");
    expect(featureLabel("zohoIntelligence")).toBe("Zoho intelligence sync");
    expect(featureLabel("sponsorHub")).toBe("Sponsor intelligence");
    expect(featureLabel("mdl-t-unknown")).toBe("mdl-t-unknown");
  });
});

describe("benchmarks, their verdicts, views and KPIs", () => {
  it("flags a sample under the registry's minimum", () => {
    expect(isSmallSample({ sampleSize: 4 }, 10)).toBe(true);
    expect(isSmallSample({ sampleSize: 10 }, 10)).toBe(false);
  });

  it("joins each benchmark row to its verdict by the label the API put on both — never by rebuilding it", () => {
    const soccer = checkFor(SAMPLE_REGISTRY.benchmarkValidation, { segment: "Sport: Soccer" })!;
    expect(soccer.status).toBe("small_sample");
    expect(soccer.reasons).toHaveLength(2);
    expect(checkFor(SAMPLE_REGISTRY.benchmarkValidation, { segment: "All" })!.status).toBe("valid");
    expect(checkFor(SAMPLE_REGISTRY.benchmarkValidation, { segment: "Sport: Curling" })).toBeUndefined();
    for (const s of ["valid", "inconsistent", "stale", "small_sample", "too_spread"] as const) expect(BENCHMARK_STATUS[s].label).toBeTruthy();
  });

  it("counts the KPI row from the registry itself", () => {
    expect(registryKpis(SAMPLE_REGISTRY)).toEqual({ models: 3, awaiting: 0, held: 1, flagsOff: 5, flagsTotal: 30, flaggedBenchmarks: 1 });
    expect(registryKpis(emptyRegistry())).toEqual({ models: 0, awaiting: 0, held: 0, flagsOff: 0, flagsTotal: 0, flaggedBenchmarks: 0 });
  });

  it("reads ?view and ?model, falling back safely", () => {
    expect(registryView("flags")).toBe("flags");
    expect(registryView("x")).toBe("models");
    expect(pickModel(SAMPLE_REGISTRY.models, "matching")!.key).toBe("matching");
    expect(pickModel(SAMPLE_REGISTRY.models, "nope")!.key).toBe("forecast");
    expect(pickModel([], "pricing")).toBeNull();
  });
});
