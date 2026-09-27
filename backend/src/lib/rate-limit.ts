/**
 * Fixed-window rate limiting on Redis (P3-BE-13, Addendum A3/B4).
 *
 * Redis's first actual use in this codebase, and it is the use the stack
 * decision reserved it for: cache and rate limiting only, never the queue.
 *
 * WHY THE PUBLIC INTAKE NEEDS ONE. Every other write endpoint is behind
 * `requireActor`, so the cost of abusing it is an account. `POST
 * /applications/intake` has no such floor — anyone who can reach the internet
 * can create rows and send email, and both are things an attacker is happy to
 * do a thousand times.
 *
 * IT FAILS OPEN, DELIBERATELY. If Redis is unreachable the request is allowed.
 * Phase 1's own architecture rule is that a degraded dependency must not stop
 * an athlete applying — the same reasoning that keeps Zoho off the request
 * path. A rate limiter that takes the form down when the cache blinks has
 * caused a worse outage than the one it was protecting against.
 */
import { redis } from "./redis";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. Meaningful only when refused. */
  retryAfter: number;
};

/**
 * Count one hit against `key` and say whether it is still under `limit`.
 *
 * Fixed window rather than sliding: a sliding window needs a sorted set per
 * key and a periodic trim, and the precision buys nothing here. The failure
 * mode of a fixed window — twice the limit across a window boundary — is
 * irrelevant when the limit exists to stop automation, not to meter a quota.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const redisKey = `ratelimit:${key}`;
    const hits = await redis.incr(redisKey);

    /* Only the first hit sets the expiry, so the window starts when it starts
       rather than being pushed forward by every subsequent request — which
       would let a steady stream of traffic keep a key alive forever. */
    if (hits === 1) await redis.expire(redisKey, windowSeconds);

    if (hits <= limit) return { allowed: true, retryAfter: 0 };

    const ttl = await redis.ttl(redisKey);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
  } catch {
    /* See the note above: unreachable Redis must not close the front door. */
    return { allowed: true, retryAfter: 0 };
  }
}

/** Raised when a caller is over the limit. 429 so a client can back off
 *  rather than treating it as a validation failure and rewriting the form. */
export class RateLimitedError extends Error {
  readonly status = 429;
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Throw unless this caller is within the limit.
 *
 * The caller is identified by IP. `trust proxy` is not set, so `req.ip` is the
 * socket peer — correct locally, and correct on Railway where the edge
 * terminates before the container.
 *
 * Lives here rather than in a route file because two unauthenticated surfaces
 * now need it: the application intake (P3-BE-01) and the fan funnel
 * (P6-BE-03/04). A second private copy would be a second thing to forget.
 */
/**
 * Staging-only relief valve for load tests (P8-OPS-02). A load test runs from
 * one machine, which is — correctly — one visitor, so the per-visitor limits
 * would cap the test itself. RATE_LIMIT_MULTIPLIER (default 1) scales every
 * limit up for the duration of a test; it is set on staging for the test and
 * removed after, and never set in production. Values below 1 are ignored:
 * it can only loosen a limit for a test, never tighten one by accident.
 */
export function limitMultiplier(raw = process.env.RATE_LIMIT_MULTIPLIER): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function limit(
  key: string,
  ip: string | undefined,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const result = await rateLimit(`${key}:${ip ?? "unknown"}`, max * limitMultiplier(), windowSeconds);
  if (!result.allowed) throw new RateLimitedError(result.retryAfter);
}
