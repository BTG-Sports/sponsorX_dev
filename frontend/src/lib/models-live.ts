/* --------------------------------------------------------------------------
   3S8-FE-02 · Model and rule administration — the desk's contract and rules.

   Reads  GET   /intelligence/models → ModelRegistry (the whole registry; small, unpaged)
   Writes POST  /intelligence/models/:key/versions/:version/activate { reason }
          POST  /intelligence/models/:key/rollback   { toVersion, reason }
          PATCH /intelligence/models/:key/thresholds { values: {key: number}, reason }
          PATCH /intelligence/flags                  { feature, tenantId, enabled, reason }
   Engine "models" (lib/intelligence.ts); waits on 3S0-PMO-02 (governance)
   and 3S8-BE-01 (registry). BTG admins only (lib/admin-access.ts).

   Acceptance #11 — a version is activated, rolled back and compared
   without a deploy; #12 — every intelligence feature can be switched off
   per tenant. Governance (3S0-PMO-02): every change carries a reason, and
   the rules the registry enforces are mirrored here so the screen never
   offers a move the API will refuse:
     - only a VALIDATED version can be activated (a draft is validated first);
     - a rollback goes to a RETIRED version — one that was active before;
     - a threshold stays inside the [min, max] the model declares.

   Pure: no fetch (server/engine.ts reads, the page's actions.ts writes).
   -------------------------------------------------------------------------- */

import { ENGINES, type EngineKey } from "@/lib/intelligence";

export type ModelKey = "pricing" | "matching" | "forecast" | "makegood" | "attribution" | "anomalies";
export type VersionStatus = "draft" | "validated" | "active" | "retired";

export type ModelMetric = {
  label: string;
  value: number | string;
  /** "%", "pp", "ms" … printed after a number. */
  unit?: string;
  /** Which way is better — lets the compare view say "better" / "worse"; omitted when it has no direction. */
  better?: "higher" | "lower";
};

export type ModelVersion = {
  version: string;
  status: VersionStatus;
  createdAt: string;
  createdBy: string;
  notes: string;
  /** Validation / backtest results (3S9-QA-01), as the registry recorded them. */
  metrics: ModelMetric[];
};

export type Threshold = { key: string; label: string; value: number; unit: string; min: number; max: number };
export type Factor = { key: string; label: string; weight: number };

export type RegistryModel = {
  key: ModelKey;
  name: string;
  activeVersion: string | null;
  versions: ModelVersion[];
  thresholds: Threshold[];
  /** Pricing factors (3S2-BE-02) — read-only here; a new weight is a new version. */
  factors?: Factor[];
};

/** CPM benchmarks per segment, in cents (3S2, validated by 3S9-QA-02). */
export type Benchmark = { segment: string; p25: number; median: number; p75: number; sampleSize: number; refreshedAt: string };

export type FeatureFlag = { feature: string; tenantId: string; tenantName: string; enabled: boolean };

export type RolloutStage = "internal" | "pilot" | "general";
export type Rollout = { model: ModelKey; version: string; stage: RolloutStage; tenants: { id: string; name: string }[] };

export type ModelRegistry = {
  asOf: string;
  models: RegistryModel[];
  benchmarks: Benchmark[];
  /** Below this sample size a benchmark is shown but flagged, and pricing ignores it. */
  benchmarkMinSample: number;
  flags: FeatureFlag[];
  rollouts: Rollout[];
};

/* ---------------------------------------------------------------- views */

export type RegistryView = "models" | "benchmarks" | "flags";

export const REGISTRY_VIEWS: { key: RegistryView; label: string }[] = [
  { key: "models", label: "Models & thresholds" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "flags", label: "Feature flags" },
];

export function registryView(v: string | string[] | undefined): RegistryView {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "benchmarks" || s === "flags" ? s : "models";
}

/** ?model — the requested model if the registry has it, else the first. */
export function pickModel(models: RegistryModel[], v: string | string[] | undefined): RegistryModel | null {
  const s = Array.isArray(v) ? v[0] : v;
  return models.find((m) => m.key === s) ?? models[0] ?? null;
}

export const STATUS: Record<VersionStatus, { label: string; tone: "success" | "primary" | "neutral" | "faint" }> = {
  active: { label: "Active", tone: "success" },
  validated: { label: "Validated", tone: "primary" },
  draft: { label: "Draft", tone: "neutral" },
  retired: { label: "Retired", tone: "faint" },
};

export const STAGE: Record<RolloutStage, string> = {
  internal: "BTG's own data",
  pilot: "Pilot tenants",
  general: "Every tenant",
};

/* ----------------------------------------------------- governance rules */

export function canActivate(v: Pick<ModelVersion, "status">): boolean {
  return v.status === "validated";
}

/** Versions a rollback may return to: retired ones, newest first. */
export function rollbackTargets(m: RegistryModel): ModelVersion[] {
  return m.versions.filter((v) => v.status === "retired").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Why a version has no action, in words (null when it has one). */
export function noActionReason(v: Pick<ModelVersion, "status">): string | null {
  if (v.status === "active") return "Live now";
  if (v.status === "draft") return "Validate before it can go live";
  return null;
}

/* -------------------------------------------------------------- compare */

export type CompareRow = { label: string; a: string; b: string; delta: string | null; verdict: "better" | "worse" | "same" | null };

function fmt(m: ModelMetric | undefined): string {
  if (!m) return "—";
  return typeof m.value === "number" ? `${m.value.toLocaleString("en-US", { maximumFractionDigits: 3 })}${m.unit ? ` ${m.unit}` : ""}` : m.value;
}

/**
 * Two versions' metrics side by side, by label — A's labels first, then any
 * only B has. A numeric pair gets B − A, and a verdict when the metric says
 * which way is better.
 */
export function compareVersions(a: ModelVersion, b: ModelVersion): CompareRow[] {
  const labels = [...a.metrics.map((m) => m.label), ...b.metrics.map((m) => m.label).filter((l) => !a.metrics.some((m) => m.label === l))];
  return labels.map((label) => {
    const ma = a.metrics.find((m) => m.label === label);
    const mb = b.metrics.find((m) => m.label === label);
    let delta: string | null = null;
    let verdict: CompareRow["verdict"] = null;
    if (typeof ma?.value === "number" && typeof mb?.value === "number") {
      const d = Math.round((mb.value - ma.value) * 1000) / 1000;
      delta = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0";
      const better = mb.better ?? ma.better;
      if (better) verdict = d === 0 ? "same" : (d > 0) === (better === "higher") ? "better" : "worse";
    }
    return { label, a: fmt(ma), b: fmt(mb), delta, verdict };
  });
}

/** The compare view's opening pair: the active version against the newest
 *  other one that has recorded metrics (else simply the newest other). */
export function defaultPair(m: RegistryModel): [string, string] | null {
  if (m.versions.length < 2) return null;
  const byNew = [...m.versions].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const a = m.activeVersion ?? byNew[1].version;
  const others = byNew.filter((v) => v.version !== a);
  const b = (others.find((v) => v.metrics.length > 0) ?? others[0])?.version;
  return b ? [a, b] : null;
}

/* ----------------------------------------------------------- thresholds */

/** Per-key problems with the edited values ("" / non-numbers / out of range). */
export function thresholdErrors(ts: Threshold[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ts) {
    const raw = (values[t.key] ?? String(t.value)).trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) out[t.key] = "Enter a number.";
    else if (n < t.min || n > t.max) out[t.key] = `Between ${t.min} and ${t.max}${t.unit ? ` ${t.unit}` : ""}.`;
  }
  return out;
}

/** Only the thresholds that changed, as numbers — what the PATCH sends. */
export function thresholdChanges(ts: Threshold[], values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ts) {
    const raw = values[t.key];
    if (raw === undefined) continue;
    const n = Number(raw.trim());
    if (raw.trim() !== "" && Number.isFinite(n) && n !== t.value) out[t.key] = n;
  }
  return out;
}

/* ---------------------------------------------------------------- flags */

export function featureLabel(feature: string): string {
  return ENGINES[feature as EngineKey]?.name ?? feature;
}

export type FlagMatrix = {
  features: string[];
  tenants: { id: string; name: string }[];
  /** `${feature}::${tenantId}` → enabled; a missing cell has no flag row. */
  cells: Record<string, boolean>;
};

export const cellKey = (feature: string, tenantId: string) => `${feature}::${tenantId}`;

export function flagMatrix(flags: FeatureFlag[]): FlagMatrix {
  const features: string[] = [];
  const tenants: { id: string; name: string }[] = [];
  const cells: Record<string, boolean> = {};
  for (const f of flags) {
    if (!features.includes(f.feature)) features.push(f.feature);
    if (!tenants.some((t) => t.id === f.tenantId)) tenants.push({ id: f.tenantId, name: f.tenantName });
    cells[cellKey(f.feature, f.tenantId)] = f.enabled;
  }
  tenants.sort((a, b) => a.name.localeCompare(b.name));
  return { features, tenants, cells };
}

/* ----------------------------------------------------------- benchmarks */

export function isSmallSample(b: Pick<Benchmark, "sampleSize">, min: number): boolean {
  return b.sampleSize < min;
}

/* --------------------------------------------------------------- tiles */

/** The desk's KPI row — every figure counted from the registry the API sent. */
export function registryKpis(r: ModelRegistry): { models: number; awaiting: number; flagsOff: number; flagsTotal: number; smallSamples: number } {
  return {
    models: r.models.length,
    awaiting: r.models.reduce((n, m) => n + m.versions.filter((v) => v.status === "validated").length, 0),
    flagsOff: r.flags.filter((f) => !f.enabled).length,
    flagsTotal: r.flags.length,
    smallSamples: r.benchmarks.filter((b) => isSmallSample(b, r.benchmarkMinSample)).length,
  };
}

export function emptyRegistry(): ModelRegistry {
  return { asOf: new Date(0).toISOString(), models: [], benchmarks: [], benchmarkMinSample: 30, flags: [], rollouts: [] };
}

/* -------------------------------------------------------------- sample */

const T1 = { id: "mdl-s-t-btg", name: "BTG" };
const T2 = { id: "mdl-s-t-westfield", name: "Westfield Athletics" };
const T3 = { id: "mdl-s-t-harbor", name: "Harbor City FC" };

/** Dev-only `?demo=sample` preview and the tests' fixture. Not data. */
export const SAMPLE_REGISTRY: ModelRegistry = {
  asOf: "2026-10-13T06:00:00Z",
  models: [
    {
      key: "pricing",
      name: "Dynamic CPM engine",
      activeVersion: "cpm-rules@1.2.0",
      versions: [
        {
          version: "cpm-rules@1.3.0", status: "validated", createdAt: "2026-10-10T12:00:00Z", createdBy: "Dana Brooks",
          notes: "Adds a playoff-week demand factor.",
          metrics: [{ label: "Backtest MAPE", value: 11.2, unit: "%", better: "lower" }, { label: "Within ±15%", value: 78, unit: "%", better: "higher" }, { label: "Campaigns tested", value: 214 }],
        },
        {
          version: "cpm-rules@1.2.0", status: "active", createdAt: "2026-09-02T12:00:00Z", createdBy: "Dana Brooks",
          notes: "Audience-quality factor reweighted.",
          metrics: [{ label: "Backtest MAPE", value: 13.9, unit: "%", better: "lower" }, { label: "Within ±15%", value: 71, unit: "%", better: "higher" }, { label: "Campaigns tested", value: 198 }],
        },
        {
          version: "cpm-rules@1.1.0", status: "retired", createdAt: "2026-07-15T12:00:00Z", createdBy: "Sam Ortiz",
          notes: "First rules release.",
          metrics: [{ label: "Backtest MAPE", value: 17.5, unit: "%", better: "lower" }, { label: "Within ±15%", value: 62, unit: "%", better: "higher" }],
        },
        {
          version: "cpm-rules@1.4.0-draft", status: "draft", createdAt: "2026-10-12T12:00:00Z", createdBy: "Sam Ortiz",
          notes: "Experimental venue-capacity factor.", metrics: [],
        },
      ],
      thresholds: [
        { key: "min_confidence", label: "Lowest confidence to recommend", value: 0.5, unit: "", min: 0, max: 1 },
        { key: "max_override_pct", label: "Largest override without a manager", value: 20, unit: "%", min: 0, max: 100 },
      ],
      factors: [
        { key: "audience_quality", label: "Audience quality", weight: 0.35 },
        { key: "sell_through", label: "Sell-through", weight: 0.25 },
        { key: "seasonality", label: "Seasonality", weight: 0.2 },
        { key: "engagement", label: "Engagement rate", weight: 0.2 },
      ],
    },
    {
      key: "anomalies",
      name: "Anomaly detection",
      activeVersion: "anomaly-rules@2.0.1",
      versions: [
        {
          version: "anomaly-rules@2.0.1", status: "active", createdAt: "2026-09-20T12:00:00Z", createdBy: "Dana Brooks",
          notes: "Bot-cadence rule tightened.",
          metrics: [{ label: "Seeded patterns caught", value: 12, better: "higher" }, { label: "False-positive rate", value: 4.1, unit: "%", better: "lower" }],
        },
        {
          version: "anomaly-rules@1.9.0", status: "retired", createdAt: "2026-08-01T12:00:00Z", createdBy: "Sam Ortiz",
          notes: "Baseline rule set.",
          metrics: [{ label: "Seeded patterns caught", value: 9, better: "higher" }, { label: "False-positive rate", value: 6.3, unit: "%", better: "lower" }],
        },
      ],
      thresholds: [{ key: "spike_z", label: "Spike z-score", value: 6, unit: "σ", min: 3, max: 20 }],
    },
  ],
  benchmarks: [
    { segment: "College basketball · Instagram", p25: 820, median: 1_140, p75: 1_560, sampleSize: 212, refreshedAt: "2026-10-12T02:00:00Z" },
    { segment: "High-school football · in-venue", p25: 450, median: 610, p75: 900, sampleSize: 64, refreshedAt: "2026-10-12T02:00:00Z" },
    { segment: "Club soccer · TikTok", p25: 600, median: 980, p75: 1_900, sampleSize: 11, refreshedAt: "2026-10-12T02:00:00Z" },
  ],
  benchmarkMinSample: 30,
  flags: [
    { feature: "pricing", tenantId: T1.id, tenantName: T1.name, enabled: true },
    { feature: "pricing", tenantId: T2.id, tenantName: T2.name, enabled: true },
    { feature: "pricing", tenantId: T3.id, tenantName: T3.name, enabled: false },
    { feature: "forecast", tenantId: T1.id, tenantName: T1.name, enabled: true },
    { feature: "forecast", tenantId: T2.id, tenantName: T2.name, enabled: false },
    { feature: "forecast", tenantId: T3.id, tenantName: T3.name, enabled: false },
    { feature: "attribution", tenantId: T1.id, tenantName: T1.name, enabled: true },
    { feature: "attribution", tenantId: T2.id, tenantName: T2.name, enabled: false },
    { feature: "attribution", tenantId: T3.id, tenantName: T3.name, enabled: false },
  ],
  rollouts: [
    { model: "pricing", version: "cpm-rules@1.2.0", stage: "pilot", tenants: [T1, T2] },
    { model: "anomalies", version: "anomaly-rules@2.0.1", stage: "general", tenants: [T1, T2, T3] },
  ],
};
