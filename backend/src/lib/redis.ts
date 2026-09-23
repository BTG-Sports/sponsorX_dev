/**
 * Redis client — cache and rate-limit duty ONLY.
 *
 * Deliberately NOT the job queue. Addendum A3 of .claude/stack-decision.md
 * chose Postgres (pg-boss) for jobs because a job must be saved in the same
 * transaction as the thing that caused it; that decision stands and the
 * worker in ../worker/index.mts still drains the Postgres outbox. Redis is
 * provisioned in docker-compose.yml for the things it is actually good at:
 * hot-path caching and rate limiting. If nothing ends up needing it, it can
 * be dropped from the compose file without touching any other service.
 *
 * `lazyConnect` so the API boots even when Redis itself is not running — the
 * connection is opened on first use. The offline queue is left ENABLED
 * (ioredis default): with it off, the first command after a lazy start
 * rejects before the socket is up, which made the readiness probe report a
 * healthy Redis as down. `maxRetriesPerRequest` keeps a genuine outage from
 * hanging a request forever.
 */
import { Redis } from "ioredis";
import { env } from "../config/env";

/**
 * Railway's private network resolves `*.railway.internal` over AAAA records
 * ONLY. ioredis defaults its socket lookup to IPv4, so an internal Redis URL
 * that is perfectly correct still fails to connect, and `/health/ready`
 * reports `redis: false` while Postgres on the same network is fine (node-postgres
 * resolves both families). Select IPv6 for internal hosts and leave everything
 * else — docker-compose, localhost, an external provider — on the default.
 */
const isRailwayInternal = (() => {
  try {
    return new URL(env.REDIS_URL).hostname.endsWith(".railway.internal");
  } catch {
    return false;
  }
})();

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  ...(isRailwayInternal ? { family: 6 as const } : {}),
});

redis.on("error", () => {
  // Swallow connection errors: ioredis emits them as 'error' events which
  // crash the process if unhandled. Health checks surface the state instead.
});

/**
 * Used by the readiness probe. Opens the lazy connection if needed, then
 * pings. Returns false on any failure rather than throwing.
 */
export async function redisReachable(): Promise<boolean> {
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
