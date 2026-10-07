/**
 * The API's error rate over the last 15 minutes (P2-OPS-11, §38), for
 * `GET /health/full`.
 *
 * Counted in this process, in one-minute buckets: every response the API
 * sends, and how many of them were 5xx. A 4xx is the caller's mistake and is
 * not an error here. The health routes themselves are not counted (they are
 * mounted before the counter in app.ts), so the monitor's own probes cannot
 * dilute the rate.
 *
 * Per process, and reset by a restart. Production runs one API process, so
 * that is the whole API; with more replicas each would report its own share.
 * Visible, not alerting: no threshold is set until there is a baseline to set
 * it from (Monitoring Plan) — a guessed threshold produces noise.
 */

export const ERROR_WINDOW_MINUTES = 15;

type Bucket = { minute: number; requests: number; status5xx: number };

export type ErrorRate = {
  windowMinutes: number;
  requests: number;
  status5xx: number;
  /** status5xx / requests, to four places; null when there were no requests. */
  rate: number | null;
};

const buckets: Bucket[] = [];

function minuteOf(ms: number): number {
  return Math.floor(ms / 60_000);
}

/** Drop buckets older than the window. */
function prune(nowMinute: number): void {
  while (buckets.length > 0 && buckets[0]!.minute <= nowMinute - ERROR_WINDOW_MINUTES) buckets.shift();
}

/** Count one response. */
export function recordResponse(status: number, now = Date.now()): void {
  const minute = minuteOf(now);
  prune(minute);
  let last = buckets[buckets.length - 1];
  if (!last || last.minute !== minute) {
    last = { minute, requests: 0, status5xx: 0 };
    buckets.push(last);
  }
  last.requests += 1;
  if (status >= 500) last.status5xx += 1;
}

/** Requests and 5xx responses in the last 15 minutes. */
export function errorRate(now = Date.now()): ErrorRate {
  prune(minuteOf(now));
  let requests = 0;
  let status5xx = 0;
  for (const b of buckets) {
    requests += b.requests;
    status5xx += b.status5xx;
  }
  return {
    windowMinutes: ERROR_WINDOW_MINUTES,
    requests,
    status5xx,
    rate: requests === 0 ? null : Math.round((status5xx / requests) * 10_000) / 10_000,
  };
}

/** Tests only: forget everything counted so far. */
export function resetRequestStats(): void {
  buckets.length = 0;
}
