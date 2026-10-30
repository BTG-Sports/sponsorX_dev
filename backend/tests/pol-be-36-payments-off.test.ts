import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-36 — payment switched OFF, and what that stops.

   "Off means no checkout, no transfer and no cancellation for non-payment."

   The switch is one platform-wide row, and test files run in parallel on one
   database, so this file must never switch payment off for everyone. Its
   database client is the real one, except the PaymentSwitch row, which is
   an in-memory stand-in here (this file's module graph only). Everything the
   switch gates — the order, the payout, the sweep, the audit row, the queue —
   is real.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { store } = vi.hoisted(() => ({ store: { row: null as null | Record<string, unknown> } }));
vi.mock("../src/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/db/client")>();
  const fake = {
    findUnique: async () => store.row,
    upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
      (store.row = store.row ? { ...store.row, ...update } : { ...create }),
  };
  const wrap = <C extends object>(c: C): C => new Proxy(c, {
    get(target, key) {
      if (key === "paymentSwitch") return fake;
      if (key === "$transaction") {
        return (fn: unknown, o?: unknown) => typeof fn === "function"
          ? (target as unknown as { $transaction: (f: (tx: object) => unknown, o?: unknown) => unknown }).$transaction((tx) => (fn as (t: object) => unknown)(wrap(tx)), o)
          : (target as unknown as { $transaction: (f: unknown, o?: unknown) => unknown }).$transaction(fn, o);
      }
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { ...real, prisma: wrap(real.prisma) };
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-36 · payment switched off: no checkout, no transfer, no cancellation", async () => {
  const { prisma } = await import("../src/db/client");
  const { env } = await import("../src/config/env");
  const sw = await import("../src/domain/payment-switch");
  const { providerName } = await import("../src/lib/payment-provider");
  const { startCardPayment, sendPayout } = await import("../src/domain/payouts");
  const { sweepUnpaidOrders } = await import("../src/domain/order-payment");

  const T = "be36off_btg";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const admin = { userId: p("admin"), tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  const sponsor = { userId: p("sp"), tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: p("sponsor"), athleteId: null, guardianId: null, propertyId: null };
  const order = () => prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: p("order") }, select: { state: true, paymentDueAt: true } });

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
    store.row = null;
    await prisma.tenant.create({ data: { id: T, name: "BE36 off" } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "BE36 Sponsor" } });
    await prisma.user.createMany({ data: [
      { id: p("admin"), tenantId: T, clerkId: p("admin"), email: `${p("admin")}@x.invalid`, roles: ["BTG_ADMIN"] },
      { id: p("sp"), tenantId: T, clerkId: p("sp"), email: `${p("sp")}@x.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor") },
    ] });
    /* An approved order whose three days to pay ran out yesterday. */
    await prisma.reservation.create({ data: { id: p("res"), tenantId: T, sponsorId: p("sponsor"), cartId: p("cart"), expiresAt: new Date(Date.now() + 3650 * DAY) } });
    await prisma.marketplaceOrder.create({ data: {
      id: p("order"), tenantId: T, sponsorId: p("sponsor"), reservationId: p("res"), state: "AWAITING_PAYMENT",
      subtotalCents: 9000, feesCents: 0, totalCents: 9000, requiresApproval: false, approvalReasons: [],
      awaitingPaymentAt: new Date(Date.now() - 4 * DAY), paymentDueAt: new Date(Date.now() - DAY), paymentRemindersSent: 2,
    } });
    /* An approved payout, ready to send. */
    await prisma.payout.create({ data: {
      id: p("payout"), tenantId: T, payeeType: "ATHLETE", payeeId: p("athlete"), payeeTenantId: T, amountCents: 5000, state: "APPROVED", requestedAt: new Date(),
    } });
  });
  afterAll(async () => {
    store.row = null;
    await wipe();
  });

  it("BTG switches payment off with a reason: it reads off, and the change is audited", async () => {
    const v = await sw.setPaymentSwitch(admin, { open: false, reason: "Pausing while Stripe reviews the account" });
    expect(v).toMatchObject({ on: false, open: false, changed: { reason: "Pausing while Stripe reviews the account" } });
    expect(await sw.paymentsOpen()).toBe(false);
    expect(await sw.activeProvider()).toBe("none");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "paymentSwitch.change" }, select: { before: true, after: true } });
    expect(row).toMatchObject({ before: { open: true }, after: { open: false, reason: "Pausing while Stripe reviews the account" } });
  });

  it("off: no checkout — the card-payment link is refused, nothing charged", async () => {
    await expect(startCardPayment(sponsor, p("order"))).rejects.toMatchObject({ status: 409, message: expect.stringContaining("isn't open yet") });
    expect(await prisma.paymentAttempt.count({ where: { orderId: p("order") } })).toBe(0);
  });

  it("off: no transfer — the approved payout isn't handed over, and stays approved", async () => {
    expect(await sendPayout(p("payout"))).toEqual({ sent: false });
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: p("payout") }, select: { state: true } })).state).toBe("APPROVED");
  });

  it("off: no cancellation for non-payment — the overdue order is paused, not cancelled", async () => {
    await sweepUnpaidOrders(new Date(), { tenantIds: [T] });
    expect(await order()).toEqual({ state: "AWAITING_PAYMENT", paymentDueAt: null });
  });

  it("off: what is already moving still settles — webhooks follow the configured provider, not the switch", () => {
    expect(providerName()).not.toBe("none");
  });

  it("back on: the waiting payout is queued to send, and the order gets three fresh days", async () => {
    await sw.setPaymentSwitch(admin, { open: true, reason: "Stripe review cleared" }, new Date(), { tenantIds: [T] });
    expect(await sw.paymentsOpen()).toBe(true);
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "payouts.send" }, select: { payload: true } });
    expect(jobs.map((j) => (j.payload as { payoutId: string }).payoutId)).toEqual([p("payout")]);
    const now = new Date();
    await sweepUnpaidOrders(now, { tenantIds: [T] });
    const o = await order();
    expect(o.state).toBe("AWAITING_PAYMENT");
    expect(Math.round((o.paymentDueAt!.getTime() - now.getTime()) / DAY)).toBe(3);
  });

  it("in production, with nothing set, payment stays off even once Railway names a provider", async () => {
    const was = { name: env.RAILWAY_ENVIRONMENT_NAME, provider: env.PAYMENT_PROVIDER };
    store.row = null;
    env.RAILWAY_ENVIRONMENT_NAME = "production";
    env.PAYMENT_PROVIDER = "stripe";
    try {
      expect(await sw.paymentsOpen()).toBe(false);
      expect(await sw.readPaymentSwitch(admin)).toMatchObject({ on: false, open: false, provider: "stripe", canTurnOn: true, changed: null });
    } finally {
      env.RAILWAY_ENVIRONMENT_NAME = was.name;
      env.PAYMENT_PROVIDER = was.provider;
    }
  });
});
