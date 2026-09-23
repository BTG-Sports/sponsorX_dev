/**
 * Geo resolution — P6-BE-05, Guide §06, §26.
 *
 * The handler for `tracking.resolveGeo`. Turns a click's IP address into a
 * city and a region, then throws the address away.
 *
 * WHY A LOCAL FILE AND NOT AN API. A lookup service on this path would mean
 * an outbound request per click, a vendor who learns every fan's address, and
 * a queue that backs up when they have an incident. GeoLite2 is a file: the
 * reader memory-maps it and answers in microseconds, offline.
 *
 * WHY THE JOB AT ALL, THEN. Because the API process should not hold a
 * hundred-megabyte database open, and because §06 puts the click write after
 * the response — the resolution rides along with it rather than adding a
 * second thing the fan waits for.
 *
 * THE ADDRESS IS NEVER WRITTEN TO A COLUMN. `LinkEvent` has `city` and
 * `region` and no IP field, and the schema is the enforcement — there is
 * nowhere to put one. What the address does pass through is the job payload,
 * and the acceptance permits that only because a payload is supposed to be
 * transient. In this codebase it is not: the outbox marks rows dispatched and
 * never deletes them. So the drain SCRUBS the address out of the stored
 * payload as it dispatches (see `worker/index.mts`), which is what makes
 * "lives only in the job payload" actually true rather than merely intended.
 *
 * A NOTE ON `x-forwarded-for`. The task says the job reads that header.
 * It cannot: by the time this runs the request is long over. The address is
 * captured at the edge of the redirect route, forwarded to the API on
 * `x-sponsorx-client-ip` (see routes/v1/rewards.ts for why that header and
 * not `x-forwarded-for`), and arrives here in the payload. Same address, same
 * privacy rule, different plumbing from the sentence.
 */
import type pg from "pg";

export type GeoJob = { linkEventId: string; clientIp?: string | null };

export type GeoLookup = (ip: string) => { city?: string | null; region?: string | null } | null;

export type GeoOutcome =
  | { resolved: true; city: string | null; region: string | null }
  | { resolved: false; reason: string };

/**
 * Private and reserved ranges, which GeoLite2 has no answer for and which
 * would otherwise be looked up on every request in local development.
 *
 * Checked before the reader so a dev machine does not log a miss per click.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim();
  if (v === "" || v === "::1" || v === "127.0.0.1") return true;
  if (v.startsWith("10.") || v.startsWith("192.168.")) return true;
  if (v.startsWith("169.254.") || v.startsWith("fc") || v.startsWith("fd")) return true;
  /* 172.16.0.0 – 172.31.255.255 */
  const m = /^172\.(\d{1,3})\./.exec(v);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Resolve one click.
 *
 * `lookup` is injected rather than imported so this is testable without the
 * licensed database file, and so the worker owns opening it once rather than
 * this function opening it per job.
 */
export async function handleResolveGeo(
  db: pg.Pool,
  job: GeoJob,
  deps: { lookup: GeoLookup | null },
): Promise<GeoOutcome> {
  const ip = job.clientIp?.trim();
  if (!ip) return { resolved: false, reason: "no address in payload" };

  /* No database configured is a deployment state, not an error: the file is a
     licensed download that cannot live in the repository. The click is
     already recorded; it simply has no location. */
  if (!deps.lookup) return { resolved: false, reason: "no GeoLite2 database configured" };

  if (isPrivateAddress(ip)) return { resolved: false, reason: "private address" };

  const found = deps.lookup(ip);
  if (!found) return { resolved: false, reason: "address not in database" };

  const city = found.city ?? null;
  const region = found.region ?? null;
  if (city === null && region === null) {
    return { resolved: false, reason: "no city or region for that address" };
  }

  /* Only city and region are written. The address itself reaches no column —
     `LinkEvent` has nowhere to put one, and that is deliberate (§26). */
  const { rowCount } = await db.query(
    `UPDATE "LinkEvent" SET city = $2, region = $3 WHERE id = $1`,
    [job.linkEventId, city, region],
  );
  if (!rowCount) return { resolved: false, reason: "click no longer exists" };

  return { resolved: true, city, region };
}

/**
 * Adapt a MaxMind city reader to the narrow shape this job needs.
 *
 * Kept here, beside the job, so the vendor's response shape is translated in
 * exactly one place. `subdivisions[0]` is the state or province — GeoLite2
 * nests several levels for some countries and the first is the broadest.
 */
export function cityReaderToLookup(reader: {
  get: (ip: string) => unknown;
}): GeoLookup {
  return (ip: string) => {
    const raw = reader.get(ip) as
      | {
          city?: { names?: Record<string, string> };
          subdivisions?: { names?: Record<string, string> }[];
        }
      | null
      | undefined;
    if (!raw) return null;
    return {
      city: raw.city?.names?.en ?? null,
      region: raw.subdivisions?.[0]?.names?.en ?? null,
    };
  };
}
