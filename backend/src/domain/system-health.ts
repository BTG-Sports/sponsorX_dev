/**
 * The whole-system health report behind `GET /health/full` (2S8-OPS-01).
 *
 * `/health/ready` answers "can this process serve?" and is what a deploy may
 * gate on, so it must never fail for a reason a redeploy cannot fix. This
 * answers the operator's question instead — "is anything wrong?" — and adds
 * the one thing a deploy gate must not include: whether the database's
 * continuous backups are current. The health monitor
 * (.github/workflows/health-monitor.yml) reads it through the web server's
 * `/api/v1/public/health` rewrite, because production's API has no public
 * address.
 *
 * WHAT "BACKUPS ARE CURRENT" MEANS. Point-in-time recovery depends on the WAL
 * archiver shipping each segment. `pg_stat_archiver` records when it last
 * succeeded and last failed. The owner's RPO is one hour, so an archive older
 * than 60 minutes means the RPO is already broken, and a failure newer than
 * the last success means the archiver is stuck. Ages are computed by the
 * database's own clock, so an API host with a drifting clock cannot hide or
 * invent staleness.
 *
 * Nothing in the report names a host or carries an error message: it is
 * public, and its whole vocabulary is booleans and a number of minutes.
 */
import { env } from "../config/env";
import { prisma } from "../db/client";
import { redisReachable } from "../lib/redis";
import { storageReachable } from "../lib/storage";

/** The owner's RPO (Backup Runbook, "Recovery targets"): ≤ 1 hour. */
export const BACKUP_RPO_MINUTES = 60;

/** Each probe gets this long; a hung dependency reads as down, not as a hung monitor. */
const PROBE_TIMEOUT_MS = 3_000;

export type ArchiverRow = {
  /** Seconds since `last_archived_time`, by the database clock; null if it has never archived. */
  archivedAgoSeconds: number | null;
  /** The last failure is newer than the last success (or there has been no success). */
  failing: boolean;
};

export type BackupCheck = {
  ok: boolean;
  /** False when the archiver has never run; null when it could not be read at all. */
  configured: boolean | null;
  minutesSinceArchive: number | null;
  failing: boolean | null;
};

export type FullHealth = {
  status: "ok" | "degraded";
  checks: { db: boolean; redis: boolean; storage: boolean; backups: BackupCheck };
  /** Present only when degraded: the names of the checks that failed. */
  failed?: Array<"db" | "redis" | "storage" | "backups">;
};

/**
 * Pure: one `pg_stat_archiver` reading → the backups check.
 *
 * An archiver that has never run is only acceptable off Railway — locally and
 * in CI there is nothing to archive to. On Railway it means point-in-time
 * recovery is not actually protecting anything, which is a failure.
 */
export function evaluateBackups(row: ArchiverRow | null, onRailway: boolean): BackupCheck {
  if (!row) return { ok: false, configured: null, minutesSinceArchive: null, failing: null };

  if (row.archivedAgoSeconds === null) {
    /* A failure with no success ever is a configured archiver that has never
       worked — failing, wherever it runs. */
    if (row.failing) return { ok: false, configured: true, minutesSinceArchive: null, failing: true };
    return { ok: !onRailway, configured: false, minutesSinceArchive: null, failing: false };
  }

  const minutesSinceArchive = Math.max(0, Math.floor(row.archivedAgoSeconds / 60));
  return {
    ok: minutesSinceArchive <= BACKUP_RPO_MINUTES && !row.failing,
    configured: true,
    minutesSinceArchive,
    failing: row.failing,
  };
}

/** Resolve to `fallback` if `work` has not settled in `ms`; never rejects. */
async function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** One row from `pg_stat_archiver`, under a short statement timeout; null if unreadable. */
async function readArchiver(): Promise<ArchiverRow | null> {
  const rows = await prisma.$transaction(
    async (tx) => {
      /* The query is one row from a statistics view and never needs more
         than 2 s. SET LOCAL lasts only for this transaction, so the pooled
         connection goes back with the server default. */
      await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
      /* tenant-scope: a cluster-wide statistics view, no tenant rows. */
      return tx.$queryRaw<Array<{ archivedAgoSeconds: number | null; failing: boolean | null }>>`
        SELECT EXTRACT(EPOCH FROM (now() - last_archived_time))::float8 AS "archivedAgoSeconds",
               (last_failed_time IS NOT NULL
                 AND (last_archived_time IS NULL OR last_failed_time > last_archived_time)) AS "failing"
          FROM pg_stat_archiver`;
    },
    { maxWait: 1_500, timeout: PROBE_TIMEOUT_MS },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    archivedAgoSeconds: row.archivedAgoSeconds === null ? null : Number(row.archivedAgoSeconds),
    failing: Boolean(row.failing),
  };
}

/** True when this process runs on Railway (staging or production). */
export function onRailway(environmentName = env.RAILWAY_ENVIRONMENT_NAME): boolean {
  return Boolean(environmentName?.trim());
}

/** Every dependency `/health/ready` checks, plus the backups. Never throws. */
export async function fullHealth(railway = onRailway()): Promise<FullHealth> {
  const [db, redis, storage, archiver] = await Promise.all([
    within(prisma.$queryRaw`SELECT 1`.then(() => true), PROBE_TIMEOUT_MS, false),
    within(redisReachable(), PROBE_TIMEOUT_MS, false),
    within(storageReachable(), PROBE_TIMEOUT_MS, false),
    within(readArchiver(), PROBE_TIMEOUT_MS, null),
  ]);
  const backups = evaluateBackups(archiver, railway);

  const checks = { db, redis, storage, backups };
  const failed = (["db", "redis", "storage"] as const).filter((k) => !checks[k]) as NonNullable<FullHealth["failed"]>;
  if (!backups.ok) failed.push("backups");

  return failed.length ? { status: "degraded", checks, failed } : { status: "ok", checks };
}
