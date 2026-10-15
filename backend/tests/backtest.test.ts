import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S9-QA-01 — backtest results documented with accuracy and confidence
               calibration per model.
   3S9-QA-02 — benchmarks validated for sample size; reconciliation within
               tolerance.
   (documentation/SponsorX-Backtest.md). Every number worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const B = await import("../src/domain/backtest-rules");
const V = await import("../src/domain/benchmark-validation");

const NOW = new Date("2026-11-10T20:00:00Z");

describe("3S9-QA-01 · the backtest arithmetic", () => {
  it("the forecast: error of the projected final, within 10%, second half, Brier score, calibration by band", () => {
    /* Guarantee 30,000, ended at 27,000 (missed). 30,000 is 11.1% off; 26,000 is 3.7% off. */
    const s = B.scoreForecasts([
      { probability: 0.9, mid: 30000, final: 27000, guarantee: 30000, elapsed: 0.3 },
      { probability: 0.2, mid: 26000, final: 27000, guarantee: 30000, elapsed: 0.6 },
    ]);
    expect(s.metrics.map((m) => m.value)).toEqual([2, 7.4, 50, 3.7, 0.425]);
    expect(s.calibration).toEqual([
      { band: "under 50%", n: 1, predicted: 0.2, observed: 0 },
      { band: "50% to 80%", n: 0, predicted: 0, observed: 0 },
      { band: "80% or more", n: 1, predicted: 0.9, observed: 0 },
    ]);
  });

  it("pricing: error of the suggestion against the achieved CPM, within 20%, by confidence band", () => {
    const s = B.scorePricing([
      { recommendedCpmCents: 2400, actualCpmCents: 2000, confidence: 0.8 },
      { recommendedCpmCents: 1000, actualCpmCents: 2000, confidence: 0.3 },
    ]);
    /* 20% and 50% off: mean 35%; one of two within 20%. */
    expect(s.metrics.map((m) => m.value)).toEqual([2, 35, 50]);
    expect(s.calibration.map((c) => [c.n, c.observed])).toEqual([[1, 0], [0, 0], [1, 1]]);
  });

  it("the simulated history is seeded: the same run, the same numbers — 300 campaigns at three checkpoints", () => {
    const a = B.simulateForecastHistory();
    expect(a).toHaveLength(900);
    expect(B.simulateForecastHistory()).toEqual(a);
    expect(B.simulateForecastHistory(7)).not.toEqual(a);
  });
});

describe("3S9-QA-02 · the benchmark and reconciliation checks", () => {
  const b = (over: Partial<Parameters<typeof V.checkBenchmark>[0]> = {}) =>
    ({ dimension: "ALL", segment: "", sampleSize: 12, p25: 1500, median: 2000, p75: 2600, refreshedAt: "2026-11-10T19:00:00.000Z", ...over });

  it("a benchmark is valid only with ordered quartiles, a fresh refresh, enough orders and a sane spread", () => {
    expect(V.checkBenchmark(b(), NOW)).toMatchObject({ status: "valid", reasons: [] });
    expect(V.checkBenchmark(b({ sampleSize: 4 }), NOW)).toMatchObject({ status: "small_sample", reasons: ["Only 4 order(s) behind it; 10 are needed."] });
    expect(V.checkBenchmark(b({ refreshedAt: "2026-11-05T19:00:00.000Z" }), NOW).status).toBe("stale");
    expect(V.checkBenchmark(b({ p25: 500, p75: 2600 }), NOW)).toMatchObject({ status: "too_spread", reasons: ["Its middle half spans 5.2× (over 4×): too wide to price from."] });
    /* Every failing check is a reason; the most serious is the status. */
    const bad = V.checkBenchmark(b({ p25: 2500, sampleSize: 3, refreshedAt: "2026-11-01T00:00:00.000Z" }), NOW);
    expect(bad.status).toBe("inconsistent");
    expect(bad.reasons).toHaveLength(3);
  });

  it("reconciliation is within tolerance only when the fact check ran recently and matched exactly", () => {
    const run = { lastRunAt: "2026-11-09T19:05:00.000Z", matches: true, differenceCount: 0, lastError: null };
    expect(V.reconciliationVerdict(run, NOW)).toMatchObject({ ok: true, fresh: true, tolerance: "exact" });
    expect(V.reconciliationVerdict({ ...run, matches: false, differenceCount: 2 }, NOW)).toMatchObject({ ok: false, reason: "2 difference(s) between the ledger and the app; the tolerance is exact." });
    expect(V.reconciliationVerdict({ ...run, lastRunAt: "2026-11-01T19:05:00.000Z" }, NOW)).toMatchObject({ ok: false, fresh: false });
    expect(V.reconciliationVerdict({ lastRunAt: null, matches: null, differenceCount: 0, lastError: null }, NOW)).toMatchObject({ ok: false, reason: "The nightly fact check has not run yet." });
  });
});

describe.skipIf(!hasDatabase)("3S9-QA-01/02 · against the database, and on the models screen", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact } = await import("../src/domain/facts");
  const { runBacktests } = await import("../src/domain/backtest-engine");
  const { modelRegistry } = await import("../src/domain/model-admin");

  const T = "bkt_t";
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const admin = { userId: "bkt_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null } as unknown as Actor;
  let k = 0;
  const fact = (kind: string, on: string, measures: Record<string, number>) => prisma.$transaction((tx) => recordFact(tx, {
    tenantId: T, kind: kind as never, key: `bkt:${++k}`, occurredOn: D(on), campaignId: "bkt_c", athleteId: "bkt_a",
    inventory: { kind: "NIL_JOB", id: "SX-02" }, channel: "SOCIAL_INSTAGRAM", market: { state: "MD" }, source: { type: "Test", id: `bkt_${k}` }, measures,
  }));

  async function clean() {
    for (const t of ["BacktestRun", "Benchmark", "PricingRecommendation", "CampaignForecast", "CampaignPacing", "CampaignDaySummary", "Fact", "Campaign", "Athlete", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Backtests" } });
    await prisma.sponsor.create({ data: { id: "bkt_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.athlete.create({ data: {
      id: "bkt_a", tenantId: T, slug: "bkt-a", legalName: "Ava", displayName: "Ava", email: "ava@bkt.invalid", sport: "Soccer", city: "X", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    }, select: { id: true } });
    /* An ended campaign: guarantee 30,000, finished at 27,000; two forecasts made while it ran. */
    await prisma.campaign.create({ data: { id: "bkt_c", tenantId: T, sponsorId: "bkt_sp", name: "October", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-10-31"), state: "COMPLETED" }, select: { id: true } });
    await prisma.campaignPacing.create({ data: { tenantId: T, campaignId: "bkt_c", day: D("2026-10-31"), metric: "impressions", guarantee: 30000, delivered: 27000, expected: 30000, elapsed: 1 } });
    const forecast = (day: string, probability: number, mid: number, elapsed: number) => prisma.campaignForecast.create({ data: {
      tenantId: T, campaignId: "bkt_c", day: D(day), modelVersion: "forecast-rules@1.0.0", metric: "impressions", guarantee: 30000, delivered: 0, deliveredSource: "VERIFIED_API",
      elapsed, low: mid, mid, high: mid, probability, risk: "on_track", riskFactors: [], actions: [], projection: [],
    }, select: { id: true } });
    await forecast("2026-10-10", 0.9, 30000, 0.3);
    await forecast("2026-10-19", 0.2, 26000, 0.6);
    /* An order booked Nov 2 for $200 that reached 10,000 verified views: $20 per 1,000 achieved. Suggested the day before: $24, confidence 0.8. */
    await prisma.pricingRecommendation.create({ data: {
      tenantId: T, inventoryId: "bkt_item", athleteId: "bkt_a", day: D("2026-11-01"), snapshotDay: D("2026-11-01"), modelVersion: "cpm-rules@1.0.0", confidence: 0.8,
      currentCpmCents: 2000, recommendedCpmCents: 2400, baseCpmCents: 2000, factors: [], computedAt: D("2026-11-01"),
    } });
    await fact("ORDER_BOOKED", "2026-11-02", { booked_sell_cents: 20000 });
    await fact("METRIC_RECORDED", "2026-11-05", { views_verified_api: 10000 });
    await prisma.benchmark.createMany({ data: [
      { tenantId: T, dimension: "ALL", segment: "", metric: "EFFECTIVE_CPM_CENTS", p25: 1500, median: 2000, p75: 2600, sampleSize: 12, windowDays: 365, refreshedAt: NOW },
      { tenantId: T, dimension: "SPORT", segment: "Soccer", metric: "EFFECTIVE_CPM_CENTS", p25: 1500, median: 2000, p75: 2600, sampleSize: 3, windowDays: 365, refreshedAt: NOW },
    ] });
  });

  afterAll(clean);

  it("real history, per version — and the simulated forecast history, marked simulated", async () => {
    expect(await runBacktests(prisma, NOW, { tenantId: T, simulate: true })).toEqual({ tenants: 1, runs: 3, simulated: 1 });
    const runs = await prisma.backtestRun.findMany({ where: { tenantId: T }, select: { model: true, version: true, simulated: true, sampleSize: true, metrics: true }, orderBy: [{ model: "asc" }, { simulated: "asc" }] });
    expect(runs.map((r) => [r.model, r.version, r.simulated, r.sampleSize])).toEqual([
      ["forecast", "forecast-rules@1.0.0", false, 2], ["forecast", "forecast-rules@1.0.0", true, 900], ["pricing", "cpm-rules@1.0.0", false, 1],
    ]);
    expect((runs[0]!.metrics as Array<{ value: number }>).map((m) => m.value)).toEqual([2, 7.4, 50, 3.7, 0.425]);
    expect((runs[2]!.metrics as Array<{ value: number }>).map((m) => m.value)).toEqual([1, 20, 100]);
  });

  it("the models screen: each version's backtest beside its outputs (real before simulated), and every benchmark's verdict", async () => {
    const r = await modelRegistry(admin, NOW);
    const forecast = r.models.find((m) => m.key === "forecast")!.versions[0]!;
    expect(forecast.backtest).toMatchObject({ simulated: false, sampleSize: 2 });
    expect(forecast.metrics.map((m) => m.label)).toContain("Mean error of the projected final");
    expect(r.models.find((m) => m.key === "pricing")!.versions[0]!.metrics.find((m) => m.label === "Within 20% of the achieved CPM")!.value).toBe(100);
    expect(r.benchmarkValidation.summary).toEqual({ total: 2, valid: 1, flagged: 1 });
    expect(r.benchmarkValidation.benchmarks.find((x) => x.segment === "Soccer")).toMatchObject({ status: "small_sample" });
    expect(r.benchmarkValidation.reconciliation.tolerance).toBe("exact");
  });
});
