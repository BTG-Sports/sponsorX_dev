/**
 * Backtests — 3S9-QA-01 (documentation/SponsorX-Backtest.md). The arithmetic
 * is backtest-rules.ts; this file gathers real history, runs it per model
 * version, and keeps each run (`BacktestRun`) so the model registry
 * (3S8-BE-01) can show a version's accuracy beside its settings and compare
 * versions.
 *
 * Real history is judged per the version that made it (the stamp on every
 * forecast and suggestion). A run with no history stores nothing. The
 * simulated forecast history is run on request (`--simulate`) against the
 * tenant's active forecast settings, and stored marked simulated.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { scoreForecasts, scorePricing, simulateForecastHistory, type ForecastPoint, type PricingPoint } from "./backtest-rules";
import { activeModel } from "./model-registry";

type Db = PrismaClient | Prisma.TransactionClient;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Every forecast made for a campaign that has ended, with where the campaign ended. */
async function forecastHistory(db: Db, tenantId: string, now: Date) {
  return db.$queryRawUnsafe<Array<ForecastPoint & { modelVersion: string }>>(
    /* tenant-scope: explicit — this tenant's forecasts of its ended campaigns, and their last pacing. */
    `SELECT f."modelVersion", f.probability, f.mid, f.guarantee, f.elapsed, last.delivered AS final
       FROM "CampaignForecast" f
       JOIN "Campaign" c ON c.id = f."campaignId" AND c."tenantId" = f."tenantId"
       JOIN LATERAL (SELECT p.delivered FROM "CampaignPacing" p
                      WHERE p."tenantId" = f."tenantId" AND p."campaignId" = f."campaignId" ORDER BY p.day DESC LIMIT 1) last ON true
      WHERE f."tenantId" = $1 AND c."endDate" < $2::date AND c.state <> 'CANCELLED'`,
    tenantId, day(now),
  );
}

/** Every order with an achieved CPM, against the athlete's latest suggestion made on or before it was booked. */
async function pricingHistory(db: Db, tenantId: string) {
  return db.$queryRawUnsafe<Array<PricingPoint & { modelVersion: string }>>(
    /* tenant-scope: explicit — this tenant's orders (from its daily summaries) and its stored suggestions. */
    `WITH orders AS (
       SELECT s."athleteId", min(s.day) FILTER (WHERE s."bookedSellCents" > 0) AS booked_on,
              sum(s."bookedSellCents" - s."cancelledSellCents") AS net_cents,
              sum(s."viewsVerifiedApi" + s."viewsVerifiedManual") AS verified_views
         FROM "CampaignDaySummary" s
        WHERE s."tenantId" = $1 AND left(s."inventoryKey", 8) = 'NIL_JOB:'
        GROUP BY s."campaignId", s."athleteId", s."inventoryKey"
     )
     SELECT r."modelVersion", r."recommendedCpmCents", r.confidence, (o.net_cents * 1000.0 / o.verified_views)::float8 AS "actualCpmCents"
       FROM orders o
       JOIN LATERAL (SELECT x."modelVersion", x."recommendedCpmCents", x.confidence FROM "PricingRecommendation" x
                      WHERE x."tenantId" = $1 AND x."athleteId" = o."athleteId" AND x.day <= o.booked_on
                      ORDER BY x.day DESC LIMIT 1) r ON true
      WHERE o.net_cents > 0 AND o.verified_views > 0`,
    tenantId,
  );
}

const byVersion = <T extends { modelVersion: string }>(rows: readonly T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.modelVersion, [...(m.get(r.modelVersion) ?? []), r]);
  return m;
};

export type BacktestReport = { tenants: number; runs: number; simulated: number };

/** Backtest every model with history, per version — and, with `simulate`, the forecast on the simulated history. */
export async function runBacktests(db: PrismaClient, now: Date, opts: { tenantId?: string; simulate?: boolean } = {}): Promise<BacktestReport> {
  const tenants = opts.tenantId ? [opts.tenantId] : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const report: BacktestReport = { tenants: 0, runs: 0, simulated: 0 };
  for (const tenantId of tenants) {
    report.tenants += 1;
    const rows: Prisma.BacktestRunCreateManyInput[] = [];
    for (const [version, points] of byVersion(await forecastHistory(db, tenantId, now))) {
      const s = scoreForecasts(points.map((p) => ({ ...p, probability: Number(p.probability), elapsed: Number(p.elapsed) })));
      rows.push({ tenantId, model: "forecast", version, simulated: false, ranAt: now, sampleSize: s.sampleSize, metrics: s.metrics, calibration: s.calibration });
    }
    for (const [version, points] of byVersion(await pricingHistory(db, tenantId))) {
      const s = scorePricing(points.map((p) => ({ ...p, actualCpmCents: Number(p.actualCpmCents), confidence: Number(p.confidence) })));
      if (s.sampleSize) rows.push({ tenantId, model: "pricing", version, simulated: false, ranAt: now, sampleSize: s.sampleSize, metrics: s.metrics, calibration: s.calibration });
    }
    if (opts.simulate) {
      const active = await activeModel(db, tenantId, "forecast");
      const s = scoreForecasts(simulateForecastHistory(undefined, active.t.fullTrustElapsed));
      rows.push({ tenantId, model: "forecast", version: active.stamp, simulated: true, ranAt: now, sampleSize: s.sampleSize, metrics: s.metrics, calibration: s.calibration });
      report.simulated += 1;
    }
    if (rows.length) await db.backtestRun.createMany({ data: rows });
    report.runs += rows.length;
  }
  return report;
}

/** The latest run per model version stamp — real preferred over simulated. */
export async function latestBacktests(db: Db, tenantId: string) {
  const rows = await db.backtestRun.findMany({
    where: { tenantId }, orderBy: { ranAt: "desc" },
    select: { model: true, version: true, simulated: true, ranAt: true, sampleSize: true, metrics: true, calibration: true },
  });
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const had = out.get(r.version);
    if (!had || (had.simulated && !r.simulated)) out.set(r.version, r);
  }
  return out;
}
