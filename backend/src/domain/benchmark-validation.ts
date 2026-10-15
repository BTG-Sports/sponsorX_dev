/**
 * Benchmark and reconciliation validation — 3S9-QA-02
 * (documentation/SponsorX-Backtest.md §1).
 *
 * "Benchmarks validated for sample size; reconciliation within tolerance."
 *
 * A BENCHMARK (3S1-DATA-03) is fit to price from only when all of these hold;
 * otherwise it is flagged with every reason:
 *   - its quartiles are in order and above zero        (else: inconsistent)
 *   - it was refreshed within STALE_AFTER_DAYS          (else: stale)
 *   - at least BENCHMARK_MIN_SAMPLE orders are behind it (else: small sample)
 *   - its middle half spans at most SPREAD_MAX ×         (else: too spread)
 * The pricing engine already prefers the most specific benchmark with enough
 * orders (pricing-engine.ts chooseBase); this says which ones are sound.
 *
 * RECONCILIATION is the nightly fact check (3S1-QA-01): the daily summaries
 * equal the sum of the facts, and the facts equal the app's own records. Its
 * tolerance is exact — any difference is a failure — and the check must have
 * run within STALE_AFTER_DAYS. The warehouse is being retired (3S1-OPS-02, on
 * hold); the ledger in the app database is what everything now reads.
 */
import type { PrismaClient } from "../generated/prisma/client";
import { BENCHMARK_MIN_SAMPLE, listBenchmarks, type BenchmarkView } from "./benchmarks";
import { factCheckStatus } from "./fact-nightly";

type Db = PrismaClient;

export const STALE_AFTER_DAYS = 2;
export const SPREAD_MAX = 4;

export type BenchmarkStatus = "valid" | "inconsistent" | "stale" | "small_sample" | "too_spread";
export type BenchmarkCheck = {
  dimension: string; segment: string; sampleSize: number; p25: number; median: number; p75: number;
  status: BenchmarkStatus; reasons: string[];
};

/** One benchmark's verdict: the first failing check is its status; every failing check is a reason. */
export function checkBenchmark(b: Pick<BenchmarkView, "dimension" | "segment" | "sampleSize" | "p25" | "median" | "p75" | "refreshedAt">, now: Date): BenchmarkCheck {
  const reasons: Array<[BenchmarkStatus, string]> = [];
  if (!(b.p25 > 0 && b.p25 <= b.median && b.median <= b.p75)) reasons.push(["inconsistent", `Its quartiles are out of order (${b.p25} / ${b.median} / ${b.p75}).`]);
  const ageDays = (now.getTime() - new Date(b.refreshedAt).getTime()) / 86_400_000;
  if (ageDays > STALE_AFTER_DAYS) reasons.push(["stale", `Last refreshed ${Math.floor(ageDays)} days ago; it refreshes nightly.`]);
  if (b.sampleSize < BENCHMARK_MIN_SAMPLE) reasons.push(["small_sample", `Only ${b.sampleSize} order(s) behind it; ${BENCHMARK_MIN_SAMPLE} are needed.`]);
  if (b.p25 > 0 && b.p75 / b.p25 > SPREAD_MAX) reasons.push(["too_spread", `Its middle half spans ${(b.p75 / b.p25).toFixed(1)}× (over ${SPREAD_MAX}×): too wide to price from.`]);
  return {
    dimension: b.dimension, segment: b.segment, sampleSize: b.sampleSize, p25: b.p25, median: b.median, p75: b.p75,
    status: reasons[0]?.[0] ?? "valid", reasons: reasons.map((r) => r[1]),
  };
}

export type ValidationReport = {
  checkedAt: string;
  benchmarks: BenchmarkCheck[];
  summary: { total: number; valid: number; flagged: number };
  reconciliation: { lastRunAt: string | null; ok: boolean; fresh: boolean; differences: number; tolerance: "exact"; reason: string };
};

/** The reconciliation verdict from the last fact check: within tolerance (exact) only when fresh, run, and matching. */
export function reconciliationVerdict(
  facts: { lastRunAt: string | null; matches: boolean | null; differenceCount: number; lastError: string | null }, now: Date,
): ValidationReport["reconciliation"] {
  const fresh = !!facts.lastRunAt && (now.getTime() - new Date(facts.lastRunAt).getTime()) / 86_400_000 <= STALE_AFTER_DAYS;
  const ok = fresh && facts.matches === true && facts.differenceCount === 0;
  const reason = !facts.lastRunAt ? "The nightly fact check has not run yet."
    : facts.matches === null ? `The last fact check could not run: ${facts.lastError ?? "unknown error"}.`
      : !fresh ? `The last fact check ran on ${facts.lastRunAt.slice(0, 10)}, over ${STALE_AFTER_DAYS} days ago.`
        : facts.differenceCount > 0 ? `${facts.differenceCount} difference(s) between the ledger and the app; the tolerance is exact.`
          : "The daily summaries equal the facts, and the facts equal the app's records.";
  return { lastRunAt: facts.lastRunAt, ok, fresh, differences: facts.differenceCount, tolerance: "exact", reason };
}

/** The tenant's benchmarks and its reconciliation, validated. */
export async function validateBenchmarks(db: Db, tenantId: string, now: Date): Promise<ValidationReport> {
  const [benchmarks, facts] = await Promise.all([listBenchmarks(db, tenantId), factCheckStatus(db, tenantId, false)]);
  const checks = benchmarks.map((b) => checkBenchmark(b, now));
  const valid = checks.filter((c) => c.status === "valid").length;
  const reconciliation = reconciliationVerdict(facts, now);
  return {
    checkedAt: now.toISOString(),
    benchmarks: checks,
    summary: { total: checks.length, valid, flagged: checks.length - valid },
    reconciliation,
  };
}
