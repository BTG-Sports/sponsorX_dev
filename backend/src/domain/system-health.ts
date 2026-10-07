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
 * WHAT "THE WORKER IS DRAINING" MEANS (P2-OPS-11). A worker can be up —
 * CPU, memory and the process all healthy — and still do nothing, and that
 * is the failure that matters most because nothing else notices it. So the
 * check is on the work itself, from both places it can stall:
 *   - pg-boss: the oldest job that is due (created or retry, start_after
 *     passed, not blocked by a queue policy) and has not been picked up;
 *   - the outbox: the oldest row the drain would dispatch and has not. A
 *     row with no handler (no pg-boss queue) and a Zoho CRM job on a worker
 *     without CRM credentials wait there ON PURPOSE (worker/index.mts), so
 *     they are left out — otherwise production would alert forever.
 * Either one waiting more than 15 minutes fails the check, and the 15-minute
 * health monitor posts it to Slack. An empty queue is not a stall: the
 * signal appears as soon as anything is enqueued, which every sign-up,
 * order and email does. Queue depth and the jobs that failed in the last 24
 * hours are reported beside it — visible, not alerting (Monitoring Plan:
 * only "not draining" pages).
 *
 * Nothing in the report names a host, a job or carries an error message: it
 * is public, and its whole vocabulary is booleans, counts and minutes.
 */
import { env } from "../config/env";
import { prisma } from "../db/client";
import { redisReachable } from "../lib/redis";
import { errorRate, type ErrorRate } from "../lib/request-stats";
import { storageReachable } from "../lib/storage";
import { NEEDS_ZOHO_CRM, zohoCrmConfigured } from "../lib/zoho-jobs";

/** The owner's RPO (Backup Runbook, "Recovery targets"): ≤ 1 hour. */
export const BACKUP_RPO_MINUTES = 60;

/** A due job or outbox row waiting longer than this means the worker has stopped draining. */
export const DRAIN_STALL_MINUTES = 15;

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

export type QueueReading = {
  /** False when pg-boss's tables do not exist — the worker has never started on this database. */
  installed: boolean;
  /** Jobs due now and not yet picked up. */
  dueJobs: number;
  /** Seconds the oldest due job has waited past its start time; null when none is due. */
  oldestDueSeconds: number | null;
  /** Outbox rows the drain would dispatch and has not. */
  outboxPending: number;
  /** Seconds since the oldest of those was written; null when there are none. */
  oldestOutboxSeconds: number | null;
  /** Jobs that ran out of retries in the last 24 hours. */
  failedLast24h: number;
};

export type QueueCheck = {
  ok: boolean;
  /** False when pg-boss is not installed; null when the queue could not be read at all. */
  configured: boolean | null;
  /** Jobs due and not yet picked up, plus outbox rows waiting to be dispatched. */
  depth: number | null;
  /** The longer of the two waits, in whole minutes; 0 when nothing is waiting. */
  oldestWaitMinutes: number | null;
  failedLast24h: number | null;
};

export type FullHealth = {
  status: "ok" | "degraded";
  checks: { db: boolean; redis: boolean; storage: boolean; backups: BackupCheck; queue: QueueCheck };
  /** API responses in the last 15 minutes and how many were 5xx — the error rate, reported, never a failure. */
  traffic: ErrorRate;
  /** Present only when degraded: the names of the checks that failed. */
  failed?: Array<"db" | "redis" | "storage" | "backups" | "queue">;
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

/**
 * Pure: one queue reading → the queue check.
 *
 * pg-boss missing is acceptable only off Railway, as with the archiver: on
 * Railway the worker creates its tables on its first start, so their absence
 * means it never started.
 */
export function evaluateQueue(reading: QueueReading | null, onRailway: boolean): QueueCheck {
  if (!reading) return { ok: false, configured: null, depth: null, oldestWaitMinutes: null, failedLast24h: null };
  if (!reading.installed) return { ok: !onRailway, configured: false, depth: null, oldestWaitMinutes: null, failedLast24h: null };

  const waited = Math.max(reading.oldestDueSeconds ?? 0, reading.oldestOutboxSeconds ?? 0, 0);
  const oldestWaitMinutes = Math.floor(waited / 60);
  return {
    ok: oldestWaitMinutes <= DRAIN_STALL_MINUTES,
    configured: true,
    depth: reading.dueJobs + reading.outboxPending,
    oldestWaitMinutes,
    failedLast24h: reading.failedLast24h,
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

/**
 * The queue's numbers, under a short statement timeout; null if unreadable.
 * The outbox side counts only rows the drain would actually dispatch: a name
 * with a pg-boss queue (every handled job creates one at worker start) and,
 * without CRM credentials, not a Zoho CRM job.
 */
async function readQueue(zohoConfigured = zohoCrmConfigured()): Promise<QueueReading> {
  const parked = zohoConfigured ? [] : [...NEEDS_ZOHO_CRM];
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
      /* tenant-scope: an operational total across tenants; only counts and ages leave. */
      const [probe] = await tx.$queryRaw<Array<{ installed: boolean }>>`
        SELECT to_regclass('pgboss.job') IS NOT NULL AND to_regclass('pgboss.queue') IS NOT NULL AS "installed"`;
      if (!probe?.installed) {
        return { installed: false, dueJobs: 0, oldestDueSeconds: null, outboxPending: 0, oldestOutboxSeconds: null, failedLast24h: 0 };
      }
      /* tenant-scope: as above. */
      const [jobs] = await tx.$queryRaw<Array<{ due: number; oldestDueSeconds: number | null; failed: number }>>`
        SELECT count(*) FILTER (WHERE state IN ('created', 'retry') AND start_after <= now() AND NOT blocked)::int AS "due",
               EXTRACT(EPOCH FROM (now() - min(start_after) FILTER (WHERE state IN ('created', 'retry') AND start_after <= now() AND NOT blocked)))::float8 AS "oldestDueSeconds",
               count(*) FILTER (WHERE state = 'failed' AND completed_on >= now() - interval '24 hours')::int AS "failed"
          FROM pgboss.job`;
      /* tenant-scope: as above. "createdAt" is a UTC timestamp without a zone. */
      const [outbox] = await tx.$queryRaw<Array<{ pending: number; oldestSeconds: number | null }>>`
        SELECT count(*)::int AS "pending",
               EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - min(o."createdAt")))::float8 AS "oldestSeconds"
          FROM "OutboxJob" o
         WHERE o."dispatchedAt" IS NULL
           AND o.name IN (SELECT q.name FROM pgboss.queue q)
           AND NOT (o.name = ANY(${parked}::text[]))`;
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        installed: true,
        dueJobs: Number(jobs?.due ?? 0),
        oldestDueSeconds: num(jobs?.oldestDueSeconds),
        outboxPending: Number(outbox?.pending ?? 0),
        oldestOutboxSeconds: num(outbox?.oldestSeconds),
        failedLast24h: Number(jobs?.failed ?? 0),
      };
    },
    { maxWait: 1_500, timeout: PROBE_TIMEOUT_MS },
  );
}

/** True when this process runs on Railway (staging or production). */
export function onRailway(environmentName = env.RAILWAY_ENVIRONMENT_NAME): boolean {
  return Boolean(environmentName?.trim());
}

/** Every dependency `/health/ready` checks, plus the backups and the queue. Never throws. */
export async function fullHealth(railway = onRailway()): Promise<FullHealth> {
  const [db, redis, storage, archiver, queueReading] = await Promise.all([
    within(prisma.$queryRaw`SELECT 1`.then(() => true), PROBE_TIMEOUT_MS, false),
    within(redisReachable(), PROBE_TIMEOUT_MS, false),
    within(storageReachable(), PROBE_TIMEOUT_MS, false),
    within(readArchiver(), PROBE_TIMEOUT_MS, null),
    within<QueueReading | null>(readQueue(), PROBE_TIMEOUT_MS, null),
  ]);
  const backups = evaluateBackups(archiver, railway);
  const queue = evaluateQueue(queueReading, railway);

  const checks = { db, redis, storage, backups, queue };
  const failed = (["db", "redis", "storage"] as const).filter((k) => !checks[k]) as NonNullable<FullHealth["failed"]>;
  if (!backups.ok) failed.push("backups");
  if (!queue.ok) failed.push("queue");

  const traffic = errorRate();
  return failed.length ? { status: "degraded", checks, traffic, failed } : { status: "ok", checks, traffic };
}
