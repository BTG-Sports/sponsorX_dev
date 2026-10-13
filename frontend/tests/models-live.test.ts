import { describe, expect, it } from "vitest";

import { reasonError } from "../src/lib/intel-admin";
import {
  SAMPLE_REGISTRY,
  canActivate,
  cellKey,
  compareVersions,
  defaultPair,
  featureLabel,
  flagMatrix,
  isSmallSample,
  noActionReason,
  pickModel,
  registryKpis,
  registryView,
  rollbackTargets,
  thresholdChanges,
  thresholdErrors,
  type ModelVersion,
} from "../src/lib/models-live";

/* 3S8-FE-02 — the model registry's rules (acceptance #11, #12; 3S0-PMO-02). */

const pricing = SAMPLE_REGISTRY.models.find((m) => m.key === "pricing")!;
const v = (version: string, status: ModelVersion["status"], metrics: ModelVersion["metrics"] = [], createdAt = "2026-10-01T00:00:00Z"): ModelVersion => ({
  version, status, createdAt, createdBy: "mdl-t-user", notes: "", metrics,
});

describe("activate and roll back — only the moves the registry allows", () => {
  it("activates only a validated version", () => {
    expect(canActivate({ status: "validated" })).toBe(true);
    for (const s of ["draft", "active", "retired"] as const) expect(canActivate({ status: s }), s).toBe(false);
  });

  it("rolls back only to a retired version, newest first", () => {
    const m = { ...pricing, versions: [v("mdl-t-a", "retired", [], "2026-01-01T00:00:00Z"), v("mdl-t-b", "active"), v("mdl-t-c", "retired", [], "2026-03-01T00:00:00Z"), v("mdl-t-d", "draft")] };
    expect(rollbackTargets(m).map((x) => x.version)).toEqual(["mdl-t-c", "mdl-t-a"]);
  });

  it("says why the active and draft versions have no button", () => {
    expect(noActionReason({ status: "active" })).toMatch(/Live/);
    expect(noActionReason({ status: "draft" })).toMatch(/Validate/);
    expect(noActionReason({ status: "validated" })).toBeNull();
    expect(noActionReason({ status: "retired" })).toBeNull();
  });

  it("every change needs a reason", () => {
    expect(reasonError("")).toMatch(/reason/);
    expect(reasonError("fix")).toMatch(/more/);
    expect(reasonError("Backtest beat the live version on every metric.")).toBeNull();
  });
});

describe("compare", () => {
  it("lines two versions' metrics up by label with the change and a verdict", () => {
    const [a, b] = ["cpm-rules@1.2.0", "cpm-rules@1.3.0"].map((x) => pricing.versions.find((y) => y.version === x)!);
    const rows = compareVersions(a, b);
    const mape = rows.find((r) => r.label === "Backtest MAPE")!;
    expect(mape).toMatchObject({ a: "13.9 %", b: "11.2 %", delta: "−2.7", verdict: "better" });
    const within = rows.find((r) => r.label === "Within ±15%")!;
    expect(within).toMatchObject({ delta: "+7", verdict: "better" });
    expect(rows.find((r) => r.label === "Campaigns tested")!.verdict).toBeNull();
  });

  it("keeps a metric only one version has, with a dash for the other", () => {
    const rows = compareVersions(v("mdl-t-x", "retired", [{ label: "A", value: 1 }]), v("mdl-t-y", "validated", [{ label: "B", value: 2 }]));
    expect(rows).toEqual([
      { label: "A", a: "1", b: "—", delta: null, verdict: null },
      { label: "B", a: "—", b: "2", delta: null, verdict: null },
    ]);
  });

  it("opens on the live version against the newest other one with metrics", () => {
    expect(defaultPair(pricing)).toEqual(["cpm-rules@1.2.0", "cpm-rules@1.3.0"]);
    expect(defaultPair({ ...pricing, versions: [v("mdl-t-live", "active"), v("mdl-t-new", "draft", [], "2026-11-01T00:00:00Z")], activeVersion: "mdl-t-live" })).toEqual(["mdl-t-live", "mdl-t-new"]);
    expect(defaultPair({ ...pricing, versions: [v("mdl-t-only", "active")] })).toBeNull();
  });
});

describe("thresholds", () => {
  const ts = pricing.thresholds;

  it("checks each value against its declared range", () => {
    expect(thresholdErrors(ts, {})).toEqual({});
    expect(thresholdErrors(ts, { min_confidence: "1.5" }).min_confidence).toMatch(/Between 0 and 1/);
    expect(thresholdErrors(ts, { max_override_pct: "abc" }).max_override_pct).toMatch(/number/);
    expect(thresholdErrors(ts, { max_override_pct: "" }).max_override_pct).toMatch(/number/);
  });

  it("sends only what changed, as numbers", () => {
    expect(thresholdChanges(ts, { min_confidence: "0.5", max_override_pct: "15" })).toEqual({ max_override_pct: 15 });
    expect(thresholdChanges(ts, {})).toEqual({});
  });
});

describe("feature flags — per tenant (acceptance #12)", () => {
  it("builds a tenant × feature matrix with every cell from a flag row", () => {
    const mx = flagMatrix(SAMPLE_REGISTRY.flags);
    expect(mx.features).toEqual(["pricing", "forecast", "attribution"]);
    expect(mx.tenants.map((t) => t.name)).toEqual(["BTG", "Harbor City FC", "Westfield Athletics"]);
    expect(mx.cells[cellKey("pricing", "mdl-s-t-harbor")]).toBe(false);
    expect(mx.cells[cellKey("forecast", "mdl-s-t-btg")]).toBe(true);
    expect(mx.cells[cellKey("matching", "mdl-s-t-btg")]).toBeUndefined();
  });

  it("names features by their engine", () => {
    expect(featureLabel("pricing")).toBe("Dynamic CPM engine");
    expect(featureLabel("mdl-t-unknown")).toBe("mdl-t-unknown");
  });
});

describe("benchmarks, views and KPIs", () => {
  it("flags a sample under the registry's minimum", () => {
    expect(isSmallSample({ sampleSize: 11 }, 30)).toBe(true);
    expect(isSmallSample({ sampleSize: 30 }, 30)).toBe(false);
  });

  it("counts the KPI row from the registry itself", () => {
    expect(registryKpis(SAMPLE_REGISTRY)).toEqual({ models: 2, awaiting: 1, flagsOff: 5, flagsTotal: 9, smallSamples: 1 });
  });

  it("reads ?view and ?model, falling back safely", () => {
    expect(registryView("flags")).toBe("flags");
    expect(registryView("x")).toBe("models");
    expect(pickModel(SAMPLE_REGISTRY.models, "anomalies")!.key).toBe("anomalies");
    expect(pickModel(SAMPLE_REGISTRY.models, "nope")!.key).toBe("pricing");
    expect(pickModel([], "pricing")).toBeNull();
  });
});
