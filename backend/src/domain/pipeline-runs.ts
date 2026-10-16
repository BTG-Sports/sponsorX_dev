/**
 * The nightly pipeline's record — 3S9-OPS-01 (documentation/SponsorX-Pipeline-Monitoring.md).
 *
 * "Job failures, model drift, pipeline lag and data freshness all need
 * alerts. A silently stale forecast is worse than none."
 *
 * Every step of the nightly chain (the fact check, then benchmarks, feature
 * snapshots, suggested prices, forecasts, make-goods, anomalies, the
 * attribution queue's retry, backtests,
 * the Zoho intelligence queue) records how it ended — one row per step per
 * night, the latest attempt kept. `/health/full` reads them
 * (system-health.ts evaluatePipeline) and turns degraded when a step failed,
 * when nothing has succeeded for STALE_AFTER_HOURS, when active campaigns
 * have no fresh forecast, or when a model's backtest drifts; the uptime
 * monitor (2S8-OPS-01) alerts on that, every 15 minutes.
 *
 * Platform-wide, like FactCheckRun: the worker writes it, nobody reads it per
 * tenant.
 */
import type { PrismaClient } from "../generated/prisma/client";

export const PIPELINE_STEPS = [
  "fact_check", "benchmarks", "snapshots", "prices", "forecasts", "makegoods", "anomalies", "attribution", "backtests", "zoho_intelligence",
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Record how one step ended on one night (the latest attempt wins). */
export async function recordStep(db: PrismaClient, day: string, step: PipelineStep, status: "ok" | "failed", summary: string, startedAt: Date, finishedAt = new Date()) {
  const d = new Date(`${day}T00:00:00Z`);
  await db.pipelineRun.upsert({
    /* tenant-scope: platform-wide — the nightly chain's own record, keyed by night and step. */
    where: { day_step: { day: d, step } },
    create: { day: d, step, status, summary: summary.slice(0, 1000), startedAt, finishedAt },
    update: { status, summary: summary.slice(0, 1000), startedAt, finishedAt },
    select: { step: true },
  });
}

type Logger = { log: (m: string) => void; logError: (m: string, e: unknown) => void };

/**
 * Run one step of the nightly chain: log it as before, record how it ended,
 * and never throw — a failed step is recorded and the chain goes on, as it
 * always has ("will retry tomorrow").
 */
export async function runStep<T>(db: PrismaClient, day: string, step: PipelineStep, work: () => Promise<T>, words: (r: T) => string, out: Logger): Promise<T | undefined> {
  const startedAt = new Date();
  try {
    const r = await work();
    const said = words(r);
    out.log(said);
    await recordStep(db, day, step, "ok", said, startedAt).catch((e: unknown) => out.logError(`[worker] could not record ${step}:`, e));
    return r;
  } catch (error) {
    out.logError(`[worker] ${step.replaceAll("_", " ")} ${day} failed, will retry tomorrow:`, error);
    const message = error instanceof Error ? error.message : String(error);
    await recordStep(db, day, step, "failed", message, startedAt).catch((e: unknown) => out.logError(`[worker] could not record ${step}:`, e));
    return undefined;
  }
}
