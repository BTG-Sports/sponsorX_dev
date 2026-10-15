/**
 * The model registry — 3S8-BE-01 and 3S8-OPS-01, under the governance policy
 * 3S0-PMO-02 (documentation/SponsorX-Model-Governance.md).
 *
 * Every engine's tunable settings live here as numbered VERSIONS per tenant,
 * so a setting changes, rolls back and is compared without a code
 * deployment. A version is draft → validated → active → retired:
 *
 *   - Changing settings saves a new version (the next minor number) with a
 *     reason. Every value inside its SAFE RANGE: validated and made active at
 *     once, automatically (user, 2026-10-15: automation first). Any value
 *     outside it: held as a draft until a second person — not the one who
 *     proposed it — validates it; then it can be activated.
 *   - Only a validated version is activated; the active one is retired.
 *   - A rollback makes a retired version active again.
 *   - Every act carries a reason (10–500 characters) and is audited.
 *
 * Until a tenant changes anything, each engine runs its BUILT-IN version —
 * the code's own settings and version number — which is stored the first
 * time a change is made, so it can always be rolled back to.
 *
 * The engines read their tenant's active settings at the start of each run
 * (activeModel); the version is the stamp on everything they make, so every
 * forecast, price, shortfall and flag names the settings behind it.
 *
 * FEATURE FLAGS (3S8-OPS-01). Each intelligence feature can be switched off
 * for one tenant. Off: its nightly run skips that tenant and its reads and
 * writes answer 403 `feature_off`. No row means on.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const MODEL_KEYS = ["pricing", "matching", "forecast", "makegood", "anomalies"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export type ThresholdDef = { key: string; label: string; unit: string; value: number; min: number; max: number; integer?: boolean };

/** Each model: its name, the stamp's base, the built-in version, and its tunable settings with their safe ranges. */
export const MODEL_DEFS: Record<ModelKey, { name: string; base: string; builtIn: string; thresholds: ThresholdDef[] }> = {
  pricing: {
    name: "Dynamic CPM engine", base: "cpm-rules", builtIn: "1.0.0",
    thresholds: [
      { key: "maxFactor", label: "Largest move one factor can make", unit: "share", value: 0.2, min: 0.1, max: 0.3 },
      { key: "maxTotal", label: "Largest move all factors together can make", unit: "share", value: 0.4, min: 0.2, max: 0.6 },
    ],
  },
  matching: {
    name: "Match engine", base: "match-rules", builtIn: "2.0.0",
    thresholds: [
      { key: "excludedLookbackDays", label: "Days a past tie to an excluded category counts", unit: "days", value: 365, min: 90, max: 730, integer: true },
    ],
  },
  forecast: {
    name: "Delivery forecast", base: "forecast-rules", builtIn: "2.0.0",
    thresholds: [
      { key: "watchBelow", label: "On watch below this chance of the guarantee", unit: "share", value: 0.8, min: 0.6, max: 0.95 },
      { key: "atRiskBelow", label: "At risk below this chance", unit: "share", value: 0.5, min: 0.3, max: 0.7 },
      { key: "alertMinElapsed", label: "No alert before this share of the flight", unit: "share", value: 0.2, min: 0.05, max: 0.5 },
      { key: "fullTrustElapsed", label: "Observed rate fully trusted from this share of the flight", unit: "share", value: 0.3, min: 0.1, max: 0.6 },
      /* 2.0.0 — chosen on two separate simulated histories: the best calibration of the probability (documentation/SponsorX-Backtest.md §5). */
      { key: "paceUncertainty", label: "Allowance for a change of pace", unit: "share", value: 0.6, min: 0.2, max: 1 },
    ],
  },
  makegood: {
    name: "Make-good recommendation engine", base: "makegood-rules", builtIn: "1.0.0",
    thresholds: [
      { key: "autoMinCoverage", label: "Automatic approval: least share of the shortfall covered", unit: "share", value: 0.9, min: 0.8, max: 1 },
      { key: "autoMinElapsed", label: "Automatic approval: least share of the flight gone", unit: "share", value: 0.8, min: 0.6, max: 0.95 },
      { key: "windowDays", label: "Days a make-good runs", unit: "days", value: 14, min: 7, max: 30, integer: true },
    ],
  },
  anomalies: {
    name: "Anomaly detection", base: "anomaly-rules", builtIn: "1.0.0",
    thresholds: [
      { key: "spikeFactor", label: "Spike: times the usual day", unit: "×", value: 5, min: 3, max: 10 },
      { key: "botClicks", label: "Bot: clicks inside one minute", unit: "clicks", value: 30, min: 15, max: 100, integer: true },
      { key: "burstRedeems", label: "Redemption burst: redemptions inside 5 minutes", unit: "redemptions", value: 10, min: 5, max: 50, integer: true },
      { key: "repeatFanRedeems", label: "One fan redeeming the same reward", unit: "times", value: 3, min: 2, max: 10, integer: true },
      { key: "manualFactor", label: "Manual entry: times what the API measured", unit: "×", value: 3, min: 2, max: 10 },
    ],
  },
};

export const builtInSettings = (key: ModelKey): Record<string, number> =>
  Object.fromEntries(MODEL_DEFS[key].thresholds.map((t) => [t.key, t.value]));

export type ActiveModel = { key: ModelKey; version: string; stamp: string; t: Record<string, number> };

/** The tenant's active version of a model, or its built-in one. */
export async function activeModel(db: Db, tenantId: string, key: ModelKey): Promise<ActiveModel> {
  const def = MODEL_DEFS[key];
  const row = await db.modelVersion.findFirst({
    where: { tenantId, key, status: "active" },
    select: { version: true, thresholds: true },
  });
  const t = { ...builtInSettings(key), ...((row?.thresholds ?? {}) as Record<string, number>) };
  const version = row?.version ?? def.builtIn;
  return { key, version, stamp: `${def.base}@${version}`, t };
}

/* ───────────────────────────── feature flags (3S8-OPS-01) ───────────────────────────── */

export const FEATURES = ["pricing", "matching", "forecast", "makegood", "anomalies", "scenarios", "sponsorHub", "propertyHub", "zohoIntelligence", "attribution"] as const;
export type Feature = (typeof FEATURES)[number];

export class FeatureOffError extends Error {
  readonly status = 403;
  readonly code = "feature_off";
  constructor(readonly feature: Feature) {
    super(`This feature (${feature}) is switched off for your organisation.`);
    this.name = "FeatureOffError";
  }
}

export async function featureEnabled(db: Db, tenantId: string, feature: Feature): Promise<boolean> {
  const row = await db.featureFlag.findFirst({ where: { tenantId, feature }, select: { enabled: true } });
  return row?.enabled ?? true;
}

/** Refuse a read or write of a feature switched off for the caller's tenant. */
export async function assertFeature(db: Db, tenantId: string, feature: Feature): Promise<void> {
  if (!(await featureEnabled(db, tenantId, feature))) throw new FeatureOffError(feature);
}

/** The tenants with a feature switched off — a nightly run skips them. */
export async function tenantsWithout(db: Db, feature: Feature): Promise<string[]> {
  const rows = await db.featureFlag.findMany({
    /* tenant-scope: every tenant's flag for one feature — read by the worker's nightly runs, never on a request. */
    where: { feature, enabled: false }, select: { tenantId: true },
  });
  return rows.map((r) => r.tenantId);
}
