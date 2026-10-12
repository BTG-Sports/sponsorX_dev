import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DELIVERABLE_PLATFORMS, platformOf } from "../src/domain/deliverable-platform";

/* --------------------------------------------------------------------------
   3S0-BE-06 — a published deliverable records its platform (warehouse open
   item O1). No table had one, so channel could only be inferred at analysis
   time. The platform is read from the published URL's host when the athlete
   marks it published; the athlete enters nothing new. Rows published before
   this take it from the same rule in the migration.
   -------------------------------------------------------------------------- */

const URLS: [string, string][] = [
    ["https://www.instagram.com/p/abc/", "INSTAGRAM"],
    ["https://instagram.com/reel/xyz", "INSTAGRAM"],
    ["https://www.tiktok.com/@sam/video/1", "TIKTOK"],
    ["https://vm.tiktok.com/ZM123/", "TIKTOK"],
    ["https://youtube.com/shorts/abc", "YOUTUBE"],
    ["https://m.youtube.com/watch?v=1", "YOUTUBE"],
    ["https://youtu.be/abc", "YOUTUBE"],
    ["https://x.com/sam/status/1", "X"],
    ["https://twitter.com/sam/status/1", "X"],
    ["https://www.facebook.com/sam/posts/1", "FACEBOOK"],
    ["https://fb.watch/abc/", "FACEBOOK"],
    ["https://rosastacos.com/blog/sam", "OTHER"],
    ["https://notinstagram.com/p/1", "OTHER"],
    ["https://instagram.com.evil.example/p/1", "OTHER"],
    ["not a url", "OTHER"],
];

describe("3S0-BE-06 · the platform is the published URL's host", () => {
  it.each(URLS)("%s → %s", (url, platform) => {
    expect(platformOf(url)).toBe(platform);
  });

  it("names every platform the warehouse's channel dimension maps", () => {
    expect([...DELIVERABLE_PLATFORMS]).toEqual(["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "FACEBOOK", "OTHER"]);
  });

  it("the migration applies the same rule to rows published before, and the database refuses anything else", () => {
    const dir = join(__dirname, "../prisma/migrations");
    const [migration] = readdirSync(dir).filter((d) => d.endsWith("_deliverable_platform"));
    expect(migration, "the 3S0-BE-06 migration exists").toBeTruthy();
    const sql = readFileSync(join(dir, migration!, "migration.sql"), "utf8");
    expect(sql).toMatch(/ADD COLUMN\s+"platform"/);
    expect(sql).toMatch(/UPDATE "Deliverable"/);
    for (const p of DELIVERABLE_PLATFORMS) expect(sql, p).toContain(`'${p}'`);
    expect(sql).toMatch(/CHECK/);
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S0-BE-06 · the migration's SQL agrees with platformOf", async () => {
  const { prisma } = await import("../src/db/client");

  it("every URL gets the same platform from the backfill as from the code", async () => {
    const dir = join(__dirname, "../prisma/migrations");
    const [migration] = readdirSync(dir).filter((d) => d.endsWith("_deliverable_platform"));
    const sql = readFileSync(join(dir, migration!, "migration.sql"), "utf8");
    const update = sql.slice(sql.indexOf('UPDATE "Deliverable"'), sql.indexOf("ALTER TABLE \"Deliverable\" ADD CONSTRAINT"));
    /* A temporary "Deliverable" shadows the real one for this connection only
       (pg_temp is searched first), so the statement runs exactly as written. */
    const got = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Deliverable" (id text PRIMARY KEY, "publishedUrl" text, platform text) ON COMMIT DROP`);
      for (const [i, [url]] of URLS.entries()) {
        await tx.$executeRawUnsafe(`INSERT INTO "Deliverable" (id, "publishedUrl") VALUES ($1, $2)`, String(i), url);
      }
      await tx.$executeRawUnsafe(update);
      return tx.$queryRawUnsafe<{ id: string; platform: string }[]>(`SELECT id, platform FROM "Deliverable" ORDER BY id::int`);
    });
    expect(got.map((r) => r.platform)).toEqual(URLS.map(([url]) => platformOf(url)));
  });
});
