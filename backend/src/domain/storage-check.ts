/**
 * POL-BE-113 — the live storage check (documentation/polish.md item 113).
 *
 * Run by the worker when it starts — so after every deploy — and every 24
 * hours, on staging and production alike: each storage area must accept an
 * upload from the website's own address (APP_URL's origin), as a person's
 * browser makes it (lib/storage.ts `probeBucket`). The result is recorded;
 * `/health/full` reads the latest (system-health.ts `evaluateStorageUploads`),
 * so the 15-minute uptime monitor alerts BTG on Slack when it fails or goes
 * stale, and the daily deploy waits for a fresh pass after it deploys.
 */
import type { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";
import { probeBucket, type ProbeResult } from "../lib/storage";

/** A check older than this is stale: the worker should have run one in the last day. */
export const STORAGE_CHECK_STALE_HOURS = 26;
export const STORAGE_CHECK_KEEP_DAYS = 30;

export type StorageCheckOutcome = { ok: boolean; origin: string; results: ProbeResult[]; problem: string | null };

/** The words for a failed probe — what the alert says. */
export function probeProblem(r: ProbeResult): string {
  const where = r.bucket === "public" ? "public storage (photos, logos)" : "private storage (documents, drafts)";
  const what = r.step === "preflight" ? "a browser on the website can't upload" : r.step === "upload" ? "an upload failed" : r.step === "readBack" ? "an upload didn't read back" : "the test file couldn't be deleted";
  return `${where}: ${what} — ${r.detail ?? "no detail"}`;
}

export async function runStorageCheck(
  db: PrismaClient,
  deps: { probe: typeof probeBucket; origin: string } = { probe: probeBucket, origin: new URL(env.APP_URL).origin },
  now: () => Date = () => new Date(),
): Promise<StorageCheckOutcome> {
  const startedAt = now();
  const results = [await deps.probe("public", deps.origin), await deps.probe("private", deps.origin)];
  const failed = results.find((r) => !r.ok);
  const outcome = { ok: !failed, origin: deps.origin, results, problem: failed ? probeProblem(failed) : null };
  await db.storageCheck.create({
    /* tenant-scope: platform-wide — the environment's own storage check, not any tenant's. */
    data: { ...outcome, results: results as object[], startedAt, finishedAt: now() },
  });
  await db.storageCheck.deleteMany({
    /* tenant-scope: platform-wide — trims the environment's own check history to 30 days. */
    where: { finishedAt: { lt: new Date(startedAt.getTime() - STORAGE_CHECK_KEEP_DAYS * 864e5) } },
  });
  return outcome;
}

export type StorageCheckReading = { ok: boolean; problem: string | null; finishedAt: Date } | null;

export async function readStorageCheck(db: PrismaClient): Promise<StorageCheckReading> {
  return db.storageCheck.findFirst({
    /* tenant-scope: platform-wide — the environment's latest storage check. */
    orderBy: { finishedAt: "desc" }, select: { ok: true, problem: true, finishedAt: true },
  });
}

/** What `/health/full` reports. Off Railway (a laptop, CI) nothing is required. */
export function evaluateStorageUploads(reading: StorageCheckReading, railway: boolean, now: Date): {
  ok: boolean; checkedAt: string | null; problem: string | null;
} {
  if (!reading) return { ok: !railway, checkedAt: null, problem: railway ? "The storage check hasn't run yet (the worker runs it when it starts)." : null };
  const stale = now.getTime() - reading.finishedAt.getTime() > STORAGE_CHECK_STALE_HOURS * 3600_000;
  if (railway && stale) return { ok: false, checkedAt: reading.finishedAt.toISOString(), problem: `The storage check hasn't run for over ${STORAGE_CHECK_STALE_HOURS} hours.` };
  return { ok: reading.ok || !railway, checkedAt: reading.finishedAt.toISOString(), problem: reading.problem };
}
