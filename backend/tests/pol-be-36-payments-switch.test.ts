import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-36 — BTG's payments switch, on the real database: who may read and
   change it, the reason, the audit row, and that it can't be turned on
   without a provider.

   The switch is one platform-wide row and test files run in parallel on one
   database (suite-isolation.static.test.ts), so this file only ever writes
   it ON — the default outside production, so no other file sees a change —
   and removes it after. Payment switched OFF, and what that stops, is
   pol-be-36-payments-off.test.ts, against a stand-in for the row.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be36-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-36 · the payments switch: who, why, and never on without a provider", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");

  const T = "be36_btg";
  const SCHOOL = "be36_school";
  const p = (s: string) => `${T}_${s}`;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1/payments/switch`, {
      method, headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 4; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, SCHOOL).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [SCHOOL, T] } } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE36 BTG" } });
    /* An organisation BTG runs: its staff never reach the platform's switch, whatever their role. */
    await prisma.tenant.create({ data: { id: SCHOOL, name: "BE36 School", operatorTenantId: T } });
    const users: Array<[string, string, string]> = [
      [p("admin"), "BTG_ADMIN", T], [p("finance"), "FINANCE", T], [p("campaigns"), "CAMPAIGN_MGR", T], [p("sales"), "SALES", T],
      [`${SCHOOL}_admin`, "BTG_ADMIN", SCHOOL],
    ];
    for (const [id, role, tenantId] of users) {
      await prisma.user.create({ data: { id, tenantId, clerkId: id, email: `${id}@x.invalid`, roles: [role as never] } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    /* Back to "no row": the default, on outside production. */
    await prisma.paymentSwitch.deleteMany({ where: { id: "payments" } });
    await wipe();
  });

  it("BTG Admin and Finance read it; outside production, with nothing set, payment is on", async () => {
    for (const who of [p("admin"), p("finance")]) {
      const r = await call("GET", who);
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ on: true, open: true, canTurnOn: true });
    }
  });

  it("no other role, and no organisation BTG runs, reads or changes it", async () => {
    for (const who of [p("campaigns"), p("sales"), `${SCHOOL}_admin`]) {
      expect((await call("GET", who)).status, who).toBe(403);
      expect((await call("PUT", who, { open: true, reason: "Opening payments" })).status, who).toBe(403);
    }
  });

  it("a change needs a reason", async () => {
    expect((await call("PUT", p("admin"), { open: true })).status).toBe(400);
    expect((await call("PUT", p("admin"), { open: true, reason: "  ok " })).status).toBe(400);
  });

  it("a change is kept with who made it, when and why, and audited", async () => {
    const r = await call("PUT", p("finance"), { open: true, reason: "Stripe live account verified" });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({
      on: true, open: true,
      changed: { by: `${p("finance")}@x.invalid`, reason: "Stripe live account verified", at: expect.any(String) },
      history: [{ on: true, reason: "Stripe live account verified", by: `${p("finance")}@x.invalid` }],
    });
    const rows = await prisma.auditLog.findMany({ where: { tenantId: T, action: "paymentSwitch.change" }, select: { actorId: true, after: true } });
    expect(rows).toEqual([{ actorId: p("finance"), after: expect.objectContaining({ open: true, reason: "Stripe live account verified" }) }]);
    /* Already on (the default here): nothing was released — no payout send queued anywhere from this. */
    expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "payouts.send" } })).toBe(0);
  });

  it("with no provider configured (the Railway master off), it can't be turned on — and reads closed", async () => {
    const was = env.PAYMENT_PROVIDER;
    env.PAYMENT_PROVIDER = "none";
    try {
      const r = await call("PUT", p("admin"), { open: true, reason: "Trying to open early" });
      expect(r.status).toBe(409);
      expect(r.text).toContain("PAYMENT_PROVIDER");
      expect((await call("GET", p("admin"))).json).toMatchObject({ on: true, open: false, provider: "none", canTurnOn: false });
    } finally {
      env.PAYMENT_PROVIDER = was;
    }
  });
});
