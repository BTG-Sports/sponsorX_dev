/**
 * Benchmarks — 3S1-DATA-03 (documentation/SponsorX-Fact-Ledger.md §11).
 *
 * What sponsors usually pay per 1,000 verified views, for a sport, a market,
 * a format (the NIL job) and an audience (the athlete's tier): the low end
 * (p25), the middle (median) and the high end (p75), with the number of
 * orders behind them. A figure from a handful of orders is still shown, but
 * marked a small sample, so nobody prices from it as though it were settled.
 *
 * ONE SAMPLE PER ORDER. A campaign order is one campaign, athlete and NIL job
 * (unique in the app), and the ledger files its money and its deliverables'
 * views under exactly those keys. So, from the daily summaries:
 *
 *   effective CPM = (booked sell − cancelled sell) × 1,000 ÷ verified views
 *
 * where verified views are the API-verified and manually verified labels only.
 * Self-reported, estimated and attributed views never count (Warehouse Schema
 * §6, carried over by Fact Ledger §5). An order with nothing left to pay for,
 * or no verified views yet, has no CPM and is left out. Ratios are taken per
 * order, and the percentiles are over orders, so one big campaign does not
 * stand for the market.
 *
 * Window: orders booked in the BENCHMARK_WINDOW_DAYS before the refresh.
 * Per tenant, always — there is no cross-tenant benchmark.
 *
 * The segment is the athlete's sport and tier as they are now (the ledger
 * records the market, not the sport), and the market the booking was filed
 * under.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Below this many orders, a benchmark is shown as a small sample (user, 2026-10-14). */
export const BENCHMARK_MIN_SAMPLE = 10;
/** Orders booked in the last 12 months (user, 2026-10-14). */
export const BENCHMARK_WINDOW_DAYS = 365;
export const BENCHMARK_METRIC = "EFFECTIVE_CPM_CENTS";
export const BENCHMARK_DIMENSIONS = ["ALL", "SPORT", "MARKET", "FORMAT", "AUDIENCE"] as const;
export type BenchmarkDimension = (typeof BENCHMARK_DIMENSIONS)[number];

type Computed = { tenantId: string; dimension: BenchmarkDimension; segment: string; n: number; p25: number; median: number; p75: number };

/** The benchmarks as they stand in the summaries now — for one tenant, or every tenant. */
async function compute(db: Db, now: Date, tenantId: string | null): Promise<Computed[]> {
  return db.$queryRawUnsafe<Computed[]>(
    /* tenant-scope: grouped by tenant, and filtered to one when given; a sample never leaves its tenant. */
    `WITH orders AS (
       SELECT s."tenantId", s."campaignId", s."athleteId", s."inventoryKey",
              min(s.day) FILTER (WHERE s."bookedSellCents" > 0) AS booked_on,
              min(s."marketKey") FILTER (WHERE s."bookedSellCents" > 0) AS market,
              sum(s."bookedSellCents" - s."cancelledSellCents") AS net_cents,
              sum(s."viewsVerifiedApi" + s."viewsVerifiedManual") AS verified_views
         FROM "CampaignDaySummary" s
        WHERE left(s."inventoryKey", 8) = 'NIL_JOB:' AND ($1::text IS NULL OR s."tenantId" = $1)
        GROUP BY 1, 2, 3, 4
     ), samples AS (
       SELECT o."tenantId", o.net_cents * 1000.0 / o.verified_views AS cpm,
              a.sport, a.tier::text AS tier, split_part(o.market, ':', 1) AS state, substr(o."inventoryKey", 9) AS job
         FROM orders o
         JOIN "Athlete" a ON a.id = o."athleteId" AND a."tenantId" = o."tenantId"
        WHERE o.net_cents > 0 AND o.verified_views > 0
          AND o.booked_on > ($2::date - $3::int)
     )
     SELECT s."tenantId", d.dimension, d.segment, count(*)::int AS n,
            round(percentile_cont(0.25) WITHIN GROUP (ORDER BY s.cpm))::int AS p25,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s.cpm))::int AS median,
            round(percentile_cont(0.75) WITHIN GROUP (ORDER BY s.cpm))::int AS p75
       FROM samples s
       CROSS JOIN LATERAL (VALUES ('ALL', ''), ('SPORT', s.sport), ('MARKET', s.state), ('FORMAT', s.job), ('AUDIENCE', s.tier)) AS d(dimension, segment)
      WHERE d.dimension = 'ALL' OR coalesce(d.segment, '') <> ''
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    tenantId, now.toISOString().slice(0, 10), BENCHMARK_WINDOW_DAYS,
  );
}

export type RefreshReport = { tenants: number; benchmarks: number; skipped: string[] };

/**
 * Rebuild the benchmarks: each tenant's rows are replaced in one transaction.
 * `skipTenants` keep yesterday's figures — the worker passes the tenants whose
 * fact check failed, so a benchmark is never built from figures known to be wrong.
 */
export async function refreshBenchmarks(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<RefreshReport> {
  const skip = new Set(opts.skipTenants ?? []);
  const tenants = opts.tenantId
    ? [opts.tenantId]
    : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const scope = tenants.filter((t) => !skip.has(t));
  const rows = (await compute(db, now, opts.tenantId ?? null)).filter((r) => scope.includes(r.tenantId));
  await db.$transaction(async (tx) => {
    /* tenant-scope: replaces exactly the tenants in scope. */
    await tx.benchmark.deleteMany({ where: { tenantId: { in: scope } } });
    if (rows.length) {
      await tx.benchmark.createMany({
        data: rows.map((r) => ({
          tenantId: r.tenantId, dimension: r.dimension, segment: r.segment, metric: BENCHMARK_METRIC,
          p25: r.p25, median: r.median, p75: r.p75, sampleSize: r.n, windowDays: BENCHMARK_WINDOW_DAYS, refreshedAt: now,
        })),
      });
    }
  });
  return { tenants: scope.length, benchmarks: rows.length, skipped: tenants.filter((t) => skip.has(t)) };
}

export type BenchmarkView = {
  dimension: BenchmarkDimension;
  segment: string;
  metric: string;
  p25: number;
  median: number;
  p75: number;
  sampleSize: number;
  /** Fewer than BENCHMARK_MIN_SAMPLE orders: show it, but as a small sample. */
  smallSample: boolean;
  windowDays: number;
  refreshedAt: string;
};

/** A tenant's benchmarks, as the screens and the pricing engine read them. */
export async function listBenchmarks(db: Db, tenantId: string, dimension?: BenchmarkDimension): Promise<BenchmarkView[]> {
  const rows = await db.benchmark.findMany({
    where: { tenantId, ...(dimension ? { dimension } : {}) },
    orderBy: [{ dimension: "asc" }, { segment: "asc" }],
    select: { dimension: true, segment: true, metric: true, p25: true, median: true, p75: true, sampleSize: true, windowDays: true, refreshedAt: true },
  });
  return rows.map((r) => ({
    ...r, dimension: r.dimension as BenchmarkDimension, smallSample: r.sampleSize < BENCHMARK_MIN_SAMPLE, refreshedAt: r.refreshedAt.toISOString(),
  }));
}
