import { afterAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S9-OPS-01 — every step of the nightly chain records how it ended
   (documentation/SponsorX-Pipeline-Monitoring.md). The health check that
   reads the record is pinned in tests/health-full.test.ts.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const H = await import("../src/domain/system-health");

const NOW = new Date("2026-11-10T20:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("3S9-OPS-01 · the pipeline check (pure)", () => {
  const night = (status: string, step = "forecasts", day = "2026-11-10") => ({ step, status, day, finishedAt: ago(1) });

  it("the latest record of each step decides: a failure yesterday that succeeded today is not a failure", () => {
    const r = H.evaluatePipeline({ runs: [night("ok", "forecasts", "2026-11-10"), night("failed", "forecasts", "2026-11-09")], lastOkAt: ago(1), lastForecastDay: "2026-11-10", activeCampaigns: 1, backtests: [] }, true, NOW);
    expect(r).toMatchObject({ ok: true, failedSteps: [], hoursSinceSuccess: 1 });
    expect(H.evaluatePipeline({ runs: [night("failed"), night("ok", "anomalies")], lastOkAt: ago(1), lastForecastDay: "2026-11-10", activeCampaigns: 0, backtests: [] }, true, NOW).failedSteps).toEqual(["forecasts"]);
  });

  it("forecast freshness is by day: one made early yesterday is fresh this morning; none since the day before is stale", () => {
    /* Staging, 2026-10-20: a seed made the day's forecast at 03:55; that night's run had nothing to add (one per
       campaign per day), and at 05:55 the next morning the old 26-hour rule called it stale. */
    const at = (iso: string) => new Date(iso);
    const r = (lastForecastDay: string | null) => ({ runs: [night("ok", "forecasts", "2026-10-19")], lastOkAt: "2026-10-19T19:59:36Z", lastForecastDay, activeCampaigns: 1, backtests: [] });
    expect(H.evaluatePipeline(r("2026-10-19"), true, at("2026-10-20T06:05:00Z"))).toMatchObject({ ok: true, forecastsFresh: true });
    expect(H.evaluatePipeline(r("2026-10-19"), true, at("2026-10-20T23:59:00Z")).forecastsFresh).toBe(true);
    expect(H.evaluatePipeline(r("2026-10-19"), true, at("2026-10-21T00:01:00Z")).forecastsFresh).toBe(false);
    expect(H.evaluatePipeline(r(null), true, at("2026-10-20T06:05:00Z")).forecastsFresh).toBe(false);
    expect(H.evaluatePipeline({ ...r(null), activeCampaigns: 0 }, true, at("2026-10-20T06:05:00Z")).forecastsFresh).toBe(true);
  });

  it("drift needs half again and 5 points: 9% → 13% is not drift; 9% → 14% is", () => {
    const bt = (v: number, h: number) => ({ model: "pricing", version: "cpm-rules@1.0.0", ranAt: ago(h), metrics: [{ label: "Mean error of the suggested CPM", value: v }] });
    const base = { runs: [night("ok")], lastOkAt: ago(1), lastForecastDay: "2026-11-10", activeCampaigns: 1 };
    expect(H.evaluatePipeline({ ...base, backtests: [bt(13, 1), bt(9, 25)] }, true, NOW).drift).toEqual([]);
    expect(H.evaluatePipeline({ ...base, backtests: [bt(14, 1), bt(9, 25)] }, true, NOW).drift).toEqual(["pricing cpm-rules@1.0.0: error 9% → 14%"]);
  });
});

describe.skipIf(!hasDatabase)("3S9-OPS-01 · runStep records each step, never throws", async () => {
  const { prisma } = await import("../src/db/client");
  const { runStep } = await import("../src/domain/pipeline-runs");
  /* A night far from any real one, so the platform-wide record is never confused with a real run. */
  const DAY = "2099-01-02";
  const said: string[] = [];
  const io = { log: (m: string) => said.push(m), logError: (m: string) => said.push(`ERR ${m}`) };

  afterAll(async () => { await prisma.pipelineRun.deleteMany({ where: { day: new Date(`${DAY}T00:00:00Z`) } }); });

  it("a step that succeeds is logged and recorded ok; one that throws is logged, recorded failed, and the chain goes on", async () => {
    expect(await runStep(prisma, DAY, "forecasts", async () => ({ made: 3 }), (r) => `forecasts: ${r.made} made`, io)).toEqual({ made: 3 });
    expect(await runStep(prisma, DAY, "anomalies", async () => { throw new Error("rules exploded"); }, () => "never", io)).toBeUndefined();
    const rows = await prisma.pipelineRun.findMany({ where: { day: new Date(`${DAY}T00:00:00Z`) }, select: { step: true, status: true, summary: true }, orderBy: { step: "asc" } });
    expect(rows).toEqual([{ step: "anomalies", status: "failed", summary: "rules exploded" }, { step: "forecasts", status: "ok", summary: "forecasts: 3 made" }]);
    expect(said).toEqual(["forecasts: 3 made", "ERR [worker] anomalies 2099-01-02 failed, will retry tomorrow:"]);
    /* A retry the same night replaces that step's record. */
    await runStep(prisma, DAY, "anomalies", async () => 1, () => "anomalies: retried", io);
    expect((await prisma.pipelineRun.findFirstOrThrow({ where: { day: new Date(`${DAY}T00:00:00Z`), step: "anomalies" }, select: { status: true } })).status).toBe("ok");
  });
});
