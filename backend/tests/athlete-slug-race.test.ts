import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-QA-05 — two applicants with the same name at the same moment.

   The athlete slug is derived from the display name and is globally unique.
   It used to be chosen by reading which slugs were taken and then inserting:
   two same-name applications arriving together both read "free", both
   inserted the same slug, and the second got a unique violation — a 500 the
   applicant could do nothing about. Now a collision moves on to the next
   suffix. Over the real API, all at once.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "slug_race_t";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "slug_race_t";
/** Unique to this file: the slug is global across tenants. */
const NAME = "Quinn Slugrace Samename";
const BASE = "quinn-slugrace-samename";
const AT_ONCE = 6;

describe.skipIf(!hasDatabase)("2S8-QA-05 · same-name applicants never collide on the athlete slug", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Slug race BTG" } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  const apply = (n: number) =>
    fetch(`${base}/api/v1/applications/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legalName: NAME, displayName: NAME, email: `quinn${n}@slug-race-test.invalid`, ageBand: "18_PLUS",
        stateCode: "MD", sport: "Basketball", socials: [{ platform: "INSTAGRAM", handle: `quinn${n}` }],
      }),
    }).then(async (r) => ({ status: r.status, text: await r.text() }));

  it(`${AT_ONCE} applications with the same name at once all succeed, each with its own slug`, async () => {
    const results = await Promise.all(Array.from({ length: AT_ONCE }, (_, n) => apply(n)));
    for (const r of results) expect(r.status, r.text).toBe(201);
    const slugs = (await prisma.athlete.findMany({ where: { tenantId: T }, select: { slug: true } })).map((a) => a.slug).sort();
    expect(slugs).toHaveLength(AT_ONCE);
    expect(new Set(slugs).size).toBe(AT_ONCE);
    expect(slugs).toEqual([BASE, ...Array.from({ length: AT_ONCE - 1 }, (_, n) => `${BASE}-${n + 2}`)].sort());
  });

  it("one more, later, takes the next free suffix", async () => {
    const r = await apply(AT_ONCE);
    expect(r.status, r.text).toBe(201);
    const id = JSON.parse(r.text).id as string;
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id }, select: { slug: true } })).slug).toBe(`${BASE}-${AT_ONCE + 1}`);
  });
});
