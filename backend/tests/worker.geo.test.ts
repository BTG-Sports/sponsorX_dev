/**
 * P6-BE-05 — geo resolution.
 *
 * Acceptance: "resolve-geo.ts reads x-forwarded-for, resolves against local
 * GeoLite2, writes city/region — the raw IP is never persisted, it lives only
 * in the job payload."
 *
 * The privacy half is the half worth testing hardest, and it is testable
 * three ways: the schema has nowhere to put an address, the UPDATE writes
 * only city and region, and the drain strips the address out of the stored
 * payload. The third is what makes "lives only in the job payload" true in
 * this codebase, where dispatched outbox rows are never deleted.
 *
 * The GeoLite2 reader is injected, so these run without the licensed database
 * file. What the file changes is whether a real address resolves — not any
 * rule in here.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import {
  cityReaderToLookup, handleResolveGeo, isPrivateAddress, type GeoLookup,
} from "../worker/jobs/resolve-geo.mts";

let queries: { sql: string; params: unknown[] }[] = [];
let rowCount = 1;

const db = () =>
  ({
    query: (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount });
    },
  }) as never;

const lookup: GeoLookup = (ip) =>
  ip === "203.0.113.4" ? { city: "Richmond", region: "Virginia" } : null;

beforeEach(() => {
  queries = [];
  rowCount = 1;
});

describe("writes city and region, and nothing else", () => {
  it("resolves an address to a place", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "203.0.113.4",
    }, { lookup });

    expect(out).toEqual({ resolved: true, city: "Richmond", region: "Virginia" });
  });

  /* THE CLAUSE. The UPDATE touches two columns and the address is not among
     its parameters — there is nowhere for it to go. */
  it("never puts the address in the statement", async () => {
    await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "203.0.113.4",
    }, { lookup });

    const update = queries.find((q) => q.sql.includes("UPDATE"))!;
    expect(update.sql).toContain("city");
    expect(update.sql).toContain("region");
    expect(update.sql).not.toMatch(/ip/i);
    expect(update.params).toEqual(["lev_1", "Richmond", "Virginia"]);
    expect(JSON.stringify(update.params)).not.toContain("203.0.113.4");
  });

  it("the LinkEvent model has no address column to write to", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const model = schema.slice(
      schema.indexOf("model LinkEvent {"),
      schema.indexOf("}", schema.indexOf("model LinkEvent {")),
    );
    expect(model).toContain("city");
    expect(model).toContain("region");
    for (const field of ["ip", "ipAddress", "clientIp", "remoteAddr"]) {
      expect(model.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  /* What makes "lives only in the job payload" true here: dispatched outbox
     rows are never deleted, so the drain strips the address as it marks them
     — after boss.send has already carried the full payload to the queue. */
  it("the drain scrubs the address out of the stored payload", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain("payload::jsonb - 'clientIp'");
    expect(worker).toContain("name = 'tracking.resolveGeo'");

    /* Order matters: the scrub must come after the send, or the worker would
       resolve nothing. */
    expect(worker.indexOf("boss.send(row.name")).toBeLessThan(
      worker.indexOf("payload::jsonb - 'clientIp'"),
    );
  });
});

describe("the cases where there is simply no answer", () => {
  it.each([
    ["", "no address in payload"],
    [undefined, "no address in payload"],
  ])("handles a missing address (%s)", async (ip, reason) => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: ip as string | undefined,
    }, { lookup });
    expect(out).toEqual({ resolved: false, reason });
    expect(queries).toEqual([]);
  });

  /* A checkout without the licensed file must still run. */
  it("reports plainly when no database is configured", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "203.0.113.4",
    }, { lookup: null });
    expect(out).toEqual({ resolved: false, reason: "no GeoLite2 database configured" });
    expect(queries).toEqual([]);
  });

  it("does not look up an address GeoLite2 cannot know", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "192.168.1.9",
    }, { lookup });
    expect(out).toEqual({ resolved: false, reason: "private address" });
    expect(queries).toEqual([]);
  });

  it("handles an address the database has never heard of", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "198.51.100.7",
    }, { lookup });
    expect(out).toEqual({ resolved: false, reason: "address not in database" });
  });

  it("writes nothing when the database knows neither city nor region", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "1.1.1.1",
    }, { lookup: () => ({ city: null, region: null }) });
    expect(out).toEqual({ resolved: false, reason: "no city or region for that address" });
    expect(queries).toEqual([]);
  });

  it("notices a click that has since gone", async () => {
    rowCount = 0;
    const out = await handleResolveGeo(db(), {
      linkEventId: "gone", clientIp: "203.0.113.4",
    }, { lookup });
    expect(out).toEqual({ resolved: false, reason: "click no longer exists" });
  });

  it("writes a region even when the city is unknown", async () => {
    const out = await handleResolveGeo(db(), {
      linkEventId: "lev_1", clientIp: "1.1.1.1",
    }, { lookup: () => ({ city: null, region: "Virginia" }) });
    expect(out).toEqual({ resolved: true, city: null, region: "Virginia" });
  });
});

describe("private and reserved ranges are skipped", () => {
  it.each([
    "127.0.0.1", "::1", "10.0.0.5", "192.168.1.1",
    "172.16.0.1", "172.31.255.255", "169.254.1.1", "fd00::1", "",
  ])("%s is private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  /* 172.15 and 172.32 are OUTSIDE the private block — an off-by-one here
     would silently drop real traffic from those ranges. */
  it.each(["203.0.113.4", "8.8.8.8", "172.15.0.1", "172.32.0.1"])(
    "%s is public",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("the MaxMind response is translated in one place", () => {
  it("takes the English city and the broadest subdivision", () => {
    const l = cityReaderToLookup({
      get: () => ({
        city: { names: { en: "Richmond", fr: "Richmond" } },
        subdivisions: [{ names: { en: "Virginia" } }, { names: { en: "Henrico" } }],
      }),
    });
    expect(l("1.1.1.1")).toEqual({ city: "Richmond", region: "Virginia" });
  });

  it("copes with a record carrying neither", () => {
    const l = cityReaderToLookup({ get: () => ({}) });
    expect(l("1.1.1.1")).toEqual({ city: null, region: null });
  });

  it("returns null for an address with no record at all", () => {
    const l = cityReaderToLookup({ get: () => null });
    expect(l("1.1.1.1")).toBeNull();
  });
});
