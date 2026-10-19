/* --------------------------------------------------------------------------
   3S8-FE-02 · Model and rule administration — the desk's contract and rules.

   Reads  GET   /intelligence/models → ModelRegistry (the whole registry; small, unpaged)
   Writes PATCH /intelligence/models/:key/thresholds { values: {key: number}, reason }
                                     → { version, status: active|draft, heldBecause[], model }
          POST  /intelligence/models/:key/versions/:version/validate { reason } → { model }
          POST  /intelligence/models/:key/versions/:version/activate { reason } → { model }
          POST  /intelligence/models/:key/rollback   { toVersion, reason }       → { model }
          PATCH /intelligence/flags                  { feature, tenantId, enabled, reason } → { flag }
   Engine "models" (lib/intelligence.ts). Built by 3S8-BE-01 / 3S8-OPS-01
   (backend/src/domain/model-admin.ts); the policy is 3S0-PMO-02
   (documentation/SponsorX-Model-Governance.md). BTG admins only
   (lib/admin-access.ts).

   Acceptance #11 — a version is activated, rolled back and compared
   without a deploy; #12 — every intelligence feature can be switched off
   per tenant. The rules the registry enforces are mirrored here so the
   screen never offers a move the API will refuse:
     - a settings change is a NEW VERSION (the next minor number). Every
       changed value inside its safe range: validated and active at once,
       automatically. Any value outside it: HELD as a draft, with the
       reason (`heldBecause`);
     - a held draft is validated by a SECOND PERSON — never the one who
       proposed it (the API answers 409 to the proposer);
     - only a VALIDATED version can be activated;
     - a rollback goes to a RETIRED version — one that was active before;
     - values that can never be right are refused outright: zero or less, a
       share above 1, a fraction where a whole number is needed;
     - every write carries a reason of 10 to 500 characters.

   Since 3S9-QA-01 each version also carries its latest BACKTEST (real
   before simulated; simulated metrics are labelled "(simulated)"), and
   since 3S9-QA-02 the registry carries `benchmarkValidation`: each
   benchmark's verdict with its reasons, and the reconciliation verdict.

   Versions are bare numbers ("2.1.0"); the stamp on an output is
   `<base>@<version>` ("forecast-rules@2.1.0"). `rollouts` is always empty —
   settings are per tenant, there is no staged rollout.

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

/** One band of a backtest's calibration: how many cases, what was predicted on average, what was observed. */
export type CalibrationBand = { band: string; n: number; predicted: number; observed: number };

/** A version's latest backtest (3S9-QA-01) — real history before simulated. Its metrics sit in the version's `metrics`. */
export type Backtest = { ranAt: string; simulated: boolean; sampleSize: number; calibration: CalibrationBand[] };

export type ModelVersion = {
  /** Bare version number, e.g. "2.1.0" (the output stamp is `<base>@<version>`). */
  version: string;
  status: VersionStatus;
  createdAt: string;
  /** The proposer's email, "SponsorX (built in)" or "a former user". */
  createdBy: string;
  /** The reason it was made — a held draft's notes also say why it was held. */
  notes: string;
  /** Every setting's value in this version — the compare view's first table. */
  settings: Record<string, number>;
  /** "Outputs made", then the latest backtest's metrics ("(simulated)" when it is). */
  metrics: ModelMetric[];
  backtest: Backtest | null;
};

/** `integer`: the API refuses a fraction for it ("… is a whole number."), so the editor must too. */
export type Threshold = { key: string; label: string; value: number; unit: string; min: number; max: number; integer?: boolean };
/** A match-scoring factor (3S3-BE-02): `weight` is the points it can add to the score. Read-only — a new weight is code. */
export type Factor = { key: string; label: string; weight: number };

export type RegistryModel = {
  key: ModelKey;
  name: string;
  activeVersion: string | null;
  versions: ModelVersion[];
  /** The ACTIVE version's settings, with their safe ranges. */
  thresholds: Threshold[];
  /** Only the match engine has them. */
  factors?: Factor[];
};

/** CPM benchmarks per segment, in cents (3S1-DATA-03). `segment` is the label the API built: "All" or "Sport: Soccer". */
export type Benchmark = { segment: string; p25: number; median: number; p75: number; sampleSize: number; refreshedAt: string };

export type BenchmarkStatus = "valid" | "inconsistent" | "stale" | "small_sample" | "too_spread";
/** One benchmark's verdict (3S9-QA-02): the first failing check is its status; every failing check is a reason. */
export type BenchmarkCheck = {
  dimension: string;
  segment: string;
  /** The same label the benchmark row carries as `segment` ("All" / "Sport: Soccer") — the join key, built by the API once. */
  label: string;
  sampleSize: number;
  p25: number;
  median: number;
  p75: number;
  status: BenchmarkStatus;
  reasons: string[];
};

export type Reconciliation = {
  lastRunAt: string | null;
  ok: boolean;
  fresh: boolean;
  differences: number;
  tolerance: "exact";
  reason: string;
};

export type BenchmarkValidation = {
  checkedAt: string;
  benchmarks: BenchmarkCheck[];
  summary: { total: number; valid: number; flagged: number };
  reconciliation: Reconciliation;
};

export type FeatureFlag = { feature: string; tenantId: string; tenantName: string; enabled: boolean };

export type RolloutStage = "internal" | "pilot" | "general";
export type Rollout = { model: ModelKey; version: string; stage: RolloutStage; tenants: { id: string; name: string }[] };

export type ModelRegistry = {
  asOf: string;
  models: RegistryModel[];
  benchmarks: Benchmark[];
  /** Below this sample size a benchmark is shown but flagged, and pricing ignores it. */
  benchmarkMinSample: number;
  benchmarkValidation: BenchmarkValidation;
  flags: FeatureFlag[];
  /** Always empty: settings are per tenant, with no staged rollout. Kept so the block can say so. */
  rollouts: Rollout[];
};

/* ---------------------------------------------------------------- views */

export type RegistryView = "models" | "benchmarks" | "flags";

export const REGISTRY_VIEWS: { key: RegistryView; label: string }[] = [
  { key: "models", label: "Models & settings" },
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
  draft: { label: "Held draft", tone: "neutral" },
  retired: { label: "Retired", tone: "faint" },
};

export const STAGE: Record<RolloutStage, string> = {
  internal: "BTG's own data",
  pilot: "Pilot tenants",
  general: "Every tenant",
};

/* ----------------------------------------------------- governance rules */

/** The API's reason rule (model-admin.ts REASON_MIN / REASON_MAX). */
export const REASON_MIN = 10;
export const REASON_MAX = 500;

export function modelReasonError(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "Give a reason — every change is recorded with one.";
  if (r.length < REASON_MIN) return `Say a little more (at least ${REASON_MIN} characters) so the audit trail explains it.`;
  if (r.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

export function canActivate(v: Pick<ModelVersion, "status">): boolean {
  return v.status === "validated";
}

/** A held draft waits for a second person's check. */
export function canValidate(v: Pick<ModelVersion, "status">): boolean {
  return v.status === "draft";
}

/** The rule stated beside the Validate button — the API refuses the proposer (409). */
export const SECOND_PERSON_RULE = "A second person validates it — never the one who proposed it; the registry refuses that.";

/** Versions a rollback may return to: retired ones, newest first. */
export function rollbackTargets(m: RegistryModel): ModelVersion[] {
  return m.versions.filter((v) => v.status === "retired").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Why a version has no action, in words (null when it has one: validate, activate or roll back). */
export function noActionReason(v: Pick<ModelVersion, "status">): string | null {
  if (v.status === "active") return "Live now";
  return null;
}

/** Why a draft was held, as the API wrote it into the version's notes ("… (held: …)"); null when the notes don't say. */
export function heldBecauseOf(v: Pick<ModelVersion, "status" | "notes">): string | null {
  if (v.status !== "draft") return null;
  const m = /\(held: (.+)\)\s*$/.exec(v.notes);
  return m ? m[1] : null;
}

/* ------------------------------------------------------- settings save */

/** What PATCH …/thresholds answers beside the refreshed model. */
export type SettingsOutcome = { version: string; status: "active" | "draft"; heldBecause: string[] };

/** The settings save's answer, or null when the body isn't one (the page then just refreshes). */
export function parseSettingsOutcome(data: unknown): SettingsOutcome | null {
  const d = data as { version?: unknown; status?: unknown; heldBecause?: unknown } | null;
  if (!d || typeof d.version !== "string") return null;
  if (d.status !== "active" && d.status !== "draft") return null;
  const held = Array.isArray(d.heldBecause) ? d.heldBecause.filter((x): x is string => typeof x === "string") : [];
  return { version: d.version, status: d.status, heldBecause: held };
}

/** The outcome in one sentence, plus the next step. */
export function outcomeMessage(o: SettingsOutcome): { title: string; next: string } {
  if (o.status === "active") {
    return { title: `Version ${o.version} is live.`, next: "Every value was inside its safe range, so it was validated and activated automatically. The engine uses it from its next run." };
  }
  return { title: `Version ${o.version} is held as a draft.`, next: `${SECOND_PERSON_RULE} Then anyone can activate it, from the Versions table.` };
}

/* -------------------------------------------------------------- compare */

export type CompareRow = { label: string; a: string; b: string; delta: string | null; verdict: "better" | "worse" | "same" | null };

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

function fmt(m: ModelMetric | undefined): string {
  if (!m) return "—";
  return typeof m.value === "number" ? `${num(m.value)}${m.unit ? ` ${m.unit}` : ""}` : m.value;
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

export type SettingRow = { key: string; label: string; a: string; b: string; changed: boolean };

/**
 * Two versions' settings side by side — every key either has, labelled and
 * united by the model's threshold list (an unknown key keeps its key).
 */
export function compareSettings(a: ModelVersion, b: ModelVersion, thresholds: Threshold[]): SettingRow[] {
  const keys = [...thresholds.map((t) => t.key), ...Object.keys(a.settings ?? {}), ...Object.keys(b.settings ?? {})].filter((k, i, all) => all.indexOf(k) === i);
  return keys.map((key) => {
    const t = thresholds.find((x) => x.key === key);
    const va = a.settings?.[key];
    const vb = b.settings?.[key];
    const show = (v: number | undefined) => (typeof v === "number" ? `${num(v)}${t?.unit && t.unit !== "share" ? ` ${t.unit}` : ""}` : "—");
    return { key, label: t?.label ?? key, a: show(va), b: show(vb), changed: va !== vb };
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

/* ------------------------------------------------------------ backtests */

/** "Backtest · 214 cases" / "Simulated backtest · 900 cases" — the ran-at date is the page's to print. */
export function backtestLabel(b: Backtest): string {
  return `${b.simulated ? "Simulated backtest" : "Backtest"} · ${b.sampleSize.toLocaleString("en-US")} case${b.sampleSize === 1 ? "" : "s"}`;
}

/* ----------------------------------------------------------- thresholds */

export const isShare = (t: Pick<Threshold, "unit">) => t.unit === "share";

/**
 * Per-key problems the API would REFUSE outright (""/non-numbers, zero or
 * less, a share above 1, a fraction where it wants a whole number — the
 * API's own words for that one). A value outside its safe range is not a
 * problem — it is saved and held; see thresholdWarnings.
 */
export function thresholdErrors(ts: Threshold[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ts) {
    const raw = (values[t.key] ?? String(t.value)).trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) out[t.key] = "Enter a number.";
    else if (n <= 0) out[t.key] = "Must be above zero.";
    else if (isShare(t) && n > 1) out[t.key] = "A share is at most 1.";
    else if (t.integer && !Number.isInteger(n)) out[t.key] = `${t.label} is a whole number.`;
  }
  return out;
}

/** Per-key notes for values outside their safe range: saved, but held for a second person. */
export function thresholdWarnings(ts: Threshold[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ts) {
    const raw = (values[t.key] ?? String(t.value)).trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n <= 0) continue;
    if (n < t.min || n > t.max) out[t.key] = `Outside the safe range ${t.min}–${t.max}: saved, but held as a draft for a second person to validate.`;
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

/** Features that are not engines of their own (lib/intelligence.ts has no entry). */
const FEATURE_LABELS: Record<string, string> = {
  zohoIntelligence: "Zoho intelligence sync",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? ENGINES[feature as EngineKey]?.name ?? feature;
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

/** The verdict for one benchmark row, if the validation has one — joined on the label the API put on both. */
export function checkFor(v: BenchmarkValidation, b: Pick<Benchmark, "segment">): BenchmarkCheck | undefined {
  return v.benchmarks.find((c) => c.label === b.segment);
}

export const BENCHMARK_STATUS: Record<BenchmarkStatus, { label: string; tone: "success" | "warn" | "danger" }> = {
  valid: { label: "Sound", tone: "success" },
  small_sample: { label: "Small sample", tone: "warn" },
  stale: { label: "Stale", tone: "warn" },
  too_spread: { label: "Too spread", tone: "warn" },
  inconsistent: { label: "Out of order", tone: "danger" },
};

/* --------------------------------------------------------------- tiles */

/** The desk's KPI row — every figure counted from the registry the API sent. */
export function registryKpis(r: ModelRegistry): { models: number; awaiting: number; held: number; flagsOff: number; flagsTotal: number; flaggedBenchmarks: number } {
  return {
    models: r.models.length,
    awaiting: r.models.reduce((n, m) => n + m.versions.filter((v) => v.status === "validated").length, 0),
    held: r.models.reduce((n, m) => n + m.versions.filter((v) => v.status === "draft").length, 0),
    flagsOff: r.flags.filter((f) => !f.enabled).length,
    flagsTotal: r.flags.length,
    flaggedBenchmarks: r.benchmarkValidation.summary.flagged,
  };
}

export function emptyValidation(): BenchmarkValidation {
  return {
    checkedAt: new Date(0).toISOString(),
    benchmarks: [],
    summary: { total: 0, valid: 0, flagged: 0 },
    reconciliation: { lastRunAt: null, ok: false, fresh: false, differences: 0, tolerance: "exact", reason: "The nightly fact check has not run yet." },
  };
}

export function emptyRegistry(): ModelRegistry {
  return { asOf: new Date(0).toISOString(), models: [], benchmarks: [], benchmarkMinSample: 10, benchmarkValidation: emptyValidation(), flags: [], rollouts: [] };
}

/* -------------------------------------------------------------- sample */

const T1 = { id: "mdl-s-t-btg", name: "BTG" };
const T2 = { id: "mdl-s-t-westfield", name: "Westfield Athletics" };
const T3 = { id: "mdl-s-t-harbor", name: "Harbor City FC" };
const BUILT_IN = "SponsorX (built in)";
const EPOCH = "1970-01-01T00:00:00.000Z";

const FORECAST = { watchBelow: 0.8, atRiskBelow: 0.5, alertMinElapsed: 0.2, fullTrustElapsed: 0.3, paceUncertainty: 0.6 };

/** Dev-only `?demo=sample` preview and the tests' fixture. Not data. Shaped like model-admin.ts answers. */
export const SAMPLE_REGISTRY: ModelRegistry = {
  asOf: "2026-10-18T06:00:00Z",
  models: [
    {
      key: "forecast",
      name: "Delivery forecast",
      activeVersion: "2.1.0",
      versions: [
        {
          version: "2.2.0", status: "draft", createdAt: "2026-10-17T15:10:00Z", createdBy: "dana@btg.invalid",
          notes: "Try a much stricter at-risk line (held: At risk below this chance is 0.75, outside the safe range 0.3–0.7)",
          settings: { ...FORECAST, atRiskBelow: 0.75 },
          metrics: [{ label: "Outputs made", value: 0 }],
          backtest: null,
        },
        {
          version: "2.1.0", status: "active", createdAt: "2026-10-16T09:00:00Z", createdBy: "dana@btg.invalid",
          notes: "Fewer at-risk alerts in a slow month (inside the safe ranges: validated and activated automatically)",
          settings: { ...FORECAST, atRiskBelow: 0.45 },
          metrics: [
            { label: "Outputs made", value: 42 },
            { label: "Mean error of the projected final", value: 7.4, unit: "%", better: "lower" },
            { label: "Within 10% of the final", value: 71, unit: "%", better: "higher" },
            { label: "Brier score of the probability", value: 0.182, better: "lower" },
          ],
          backtest: {
            ranAt: "2026-10-18T05:30:00Z", simulated: false, sampleSize: 14,
            calibration: [
              { band: "under 50%", n: 3, predicted: 0.31, observed: 0.33 },
              { band: "50–80%", n: 5, predicted: 0.66, observed: 0.6 },
              { band: "80%+", n: 6, predicted: 0.91, observed: 1 },
            ],
          },
        },
        {
          version: "2.0.0", status: "retired", createdAt: EPOCH, createdBy: BUILT_IN,
          notes: "The built-in settings the engine shipped with.",
          settings: FORECAST,
          metrics: [
            { label: "Outputs made", value: 318 },
            { label: "Mean error of the projected final (simulated)", value: 9.1, unit: "%", better: "lower" },
            { label: "Within 10% of the final (simulated)", value: 64, unit: "%", better: "higher" },
            { label: "Brier score of the probability (simulated)", value: 0.204, better: "lower" },
          ],
          backtest: {
            ranAt: "2026-10-18T05:30:00Z", simulated: true, sampleSize: 900,
            calibration: [
              { band: "under 50%", n: 212, predicted: 0.29, observed: 0.27 },
              { band: "50–80%", n: 301, predicted: 0.65, observed: 0.58 },
              { band: "80%+", n: 387, predicted: 0.92, observed: 0.95 },
            ],
          },
        },
      ],
      thresholds: [
        { key: "watchBelow", label: "On watch below this chance of the guarantee", value: 0.8, unit: "share", min: 0.6, max: 0.95 },
        { key: "atRiskBelow", label: "At risk below this chance", value: 0.45, unit: "share", min: 0.3, max: 0.7 },
        { key: "alertMinElapsed", label: "No alert before this share of the flight", value: 0.2, unit: "share", min: 0.05, max: 0.5 },
        { key: "fullTrustElapsed", label: "Observed rate fully trusted from this share of the flight", value: 0.3, unit: "share", min: 0.1, max: 0.6 },
        { key: "paceUncertainty", label: "Allowance for a change of pace", value: 0.6, unit: "share", min: 0.2, max: 1 },
      ],
    },
    {
      key: "pricing",
      name: "Dynamic CPM engine",
      activeVersion: "1.0.0",
      versions: [
        {
          version: "1.0.0", status: "active", createdAt: EPOCH, createdBy: BUILT_IN,
          notes: "The built-in settings the engine shipped with.",
          settings: { maxFactor: 0.2, maxTotal: 0.4 },
          metrics: [
            { label: "Outputs made", value: 126 },
            { label: "Mean error of the suggested CPM", value: 18, unit: "%", better: "lower" },
            { label: "Within 20% of the achieved CPM", value: 67, unit: "%", better: "higher" },
          ],
          backtest: {
            ranAt: "2026-10-18T05:30:00Z", simulated: false, sampleSize: 6,
            calibration: [
              { band: "low", n: 1, predicted: 0.4, observed: 0 },
              { band: "medium", n: 2, predicted: 0.62, observed: 0.5 },
              { band: "high", n: 3, predicted: 0.84, observed: 1 },
            ],
          },
        },
      ],
      thresholds: [
        { key: "maxFactor", label: "Largest move one factor can make", value: 0.2, unit: "share", min: 0.1, max: 0.3 },
        { key: "maxTotal", label: "Largest move all factors together can make", value: 0.4, unit: "share", min: 0.2, max: 0.6 },
      ],
    },
    {
      key: "matching",
      name: "Match engine",
      activeVersion: "2.0.0",
      versions: [
        {
          version: "2.0.0", status: "active", createdAt: EPOCH, createdBy: BUILT_IN,
          notes: "The built-in settings the engine shipped with.",
          settings: { excludedLookbackDays: 365 },
          metrics: [{ label: "Outputs made", value: 9 }],
          backtest: null,
        },
      ],
      thresholds: [{ key: "excludedLookbackDays", label: "Days a past tie to an excluded category counts", value: 365, unit: "days", min: 90, max: 730, integer: true }],
      factors: [
        { key: "audience", label: "Audience fit", weight: 15 },
        { key: "geography", label: "Geography", weight: 15 },
        { key: "format", label: "Format", weight: 10 },
        { key: "category", label: "Category affinity", weight: 15 },
        { key: "history", label: "Historical performance", weight: 15 },
        { key: "budget", label: "Budget fit", weight: 15 },
        { key: "sponsorHistory", label: "Sponsor history", weight: 10 },
        { key: "quality", label: "Inventory quality", weight: 5 },
      ],
    },
  ],
  benchmarks: [
    { segment: "All", p25: 820, median: 1_140, p75: 1_560, sampleSize: 212, refreshedAt: "2026-10-18T02:00:00Z" },
    { segment: "Sport: Basketball", p25: 450, median: 610, p75: 900, sampleSize: 64, refreshedAt: "2026-10-18T02:00:00Z" },
    { segment: "Sport: Soccer", p25: 300, median: 980, p75: 1_900, sampleSize: 4, refreshedAt: "2026-10-18T02:00:00Z" },
  ],
  benchmarkMinSample: 10,
  benchmarkValidation: {
    checkedAt: "2026-10-18T06:00:00Z",
    benchmarks: [
      { dimension: "ALL", segment: "ALL", label: "All", sampleSize: 212, p25: 820, median: 1_140, p75: 1_560, status: "valid", reasons: [] },
      { dimension: "SPORT", segment: "Basketball", label: "Sport: Basketball", sampleSize: 64, p25: 450, median: 610, p75: 900, status: "valid", reasons: [] },
      {
        dimension: "SPORT", segment: "Soccer", label: "Sport: Soccer", sampleSize: 4, p25: 300, median: 980, p75: 1_900, status: "small_sample",
        reasons: ["Only 4 order(s) behind it; 10 are needed.", "Its middle half spans 6.3× (over 4×): too wide to price from."],
      },
    ],
    summary: { total: 3, valid: 2, flagged: 1 },
    reconciliation: {
      lastRunAt: "2026-10-18T03:05:00Z", ok: true, fresh: true, differences: 0, tolerance: "exact",
      reason: "The daily summaries equal the facts, and the facts equal the app's records.",
    },
  },
  flags: [
    ...(["pricing", "matching", "forecast", "makegood", "anomalies", "scenarios", "sponsorHub", "propertyHub", "zohoIntelligence", "attribution"] as const).flatMap((feature) => [
      { feature, tenantId: T1.id, tenantName: T1.name, enabled: true },
      { feature, tenantId: T2.id, tenantName: T2.name, enabled: !(feature === "forecast" || feature === "zohoIntelligence") },
      { feature, tenantId: T3.id, tenantName: T3.name, enabled: !(feature === "pricing" || feature === "forecast" || feature === "attribution") },
    ]),
  ],
  rollouts: [],
};
