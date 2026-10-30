import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-29 — the guardian-handoff queue lists oldest first.

   "The oldest requests involving minors slip down the list. Fix: oldest
   first."

   What still waits (Waiting for BTG, In progress, the arena's "waiting")
   reads oldest first; what is finished, newest first; unfiltered, the open
   requests (oldest on top) come before the finished ones — page by page.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be29-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-29 · the handoff queue, oldest first", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "be29_tenant";
  const p = (s: string) => `${T}_${s}`;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const ids = async (query: string) => {
    const res = await fetch(`${base}/api/v1/guardian-handoffs${query}`, { headers: { "x-test-clerk": p("admin") } });
    expect(res.status, query).toBe(200);
    return ((await res.json()).handoffs as Array<{ id: string }>).map((h) => h.id.replace(`${T}_`, ""));
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 4; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE29" } });
    await prisma.athlete.create({ data: {
      id: p("minor"), tenantId: T, slug: p("minor"), legalName: "Be29 Minor", displayName: "BE29", email: `${p("minor")}@x.invalid`,
      sport: "Soccer", ageBand: "UNDER_13", state: "ACTIVE",
    } });
    await prisma.user.create({ data: { id: p("admin"), tenantId: T, clerkId: p("admin"), email: `${p("admin")}@x.invalid`, roles: ["BTG_ADMIN"] } });
    const handoff = (id: string, createdAt: Date, extra: Record<string, unknown>) => prisma.guardianHandoff.create({ data: {
      id: p(id), tenantId: T, athleteId: p("minor"), fromGuardianId: p("guardian"), requesterName: "New Guardian",
      requesterEmail: `${p(id)}@x.invalid`, relationship: "PARENT", createdAt, ...extra,
    } });
    /* Created in a shuffled order, so insertion order proves nothing. */
    await handoff("btg_new", daysAgo(1), { state: "HANDED_OFF", decidedAt: daysAgo(1) });
    await handoff("btg_old", daysAgo(5), { state: "HANDED_OFF", decidedAt: daysAgo(5) });
    await handoff("esc_mid", daysAgo(4), { state: "WAITING", escalatedAt: daysAgo(1) });
    await handoff("btg_mid", daysAgo(3), { state: "HANDED_OFF", decidedAt: daysAgo(3) });
    await handoff("wait_new", daysAgo(2), { state: "WAITING" });
    await handoff("wait_old", daysAgo(6), { state: "WAITING" });
    await handoff("done_old", daysAgo(10), { state: "SWITCHED", decidedAt: daysAgo(9) });
    await handoff("done_new", daysAgo(8), { state: "DECLINED", decidedAt: daysAgo(7) });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("Waiting for BTG: oldest first, the escalated one in its place", async () => {
    expect(await ids("?group=WAITING_FOR_BTG")).toEqual(["btg_old", "esc_mid", "btg_mid", "btg_new"]);
  });

  it("In progress: oldest first", async () => {
    expect(await ids("?group=IN_PROGRESS")).toEqual(["wait_old", "wait_new"]);
  });

  it("finished tabs stay newest first", async () => {
    expect(await ids("?group=SWITCHED")).toEqual(["done_old"]);
    expect(await ids("?group=DECLINED")).toEqual(["done_new"]);
  });

  it("unfiltered: every open request, oldest first, then the finished ones, newest first", async () => {
    expect(await ids("")).toEqual(["wait_old", "btg_old", "esc_mid", "btg_mid", "wait_new", "btg_new", "done_new", "done_old"]);
  });

  it("paged, the oldest is always on page 1, and pages run on in the same order", async () => {
    expect(await ids("?group=WAITING_FOR_BTG&page=1&size=2")).toEqual(["btg_old", "esc_mid"]);
    expect(await ids("?group=WAITING_FOR_BTG&page=2&size=2")).toEqual(["btg_mid", "btg_new"]);
    const pages = [];
    for (const page of [1, 2, 3]) pages.push(...(await ids(`?page=${page}&size=3`)));
    expect(pages).toEqual(["wait_old", "btg_old", "esc_mid", "btg_mid", "wait_new", "btg_new", "done_new", "done_old"]);
  });
});
