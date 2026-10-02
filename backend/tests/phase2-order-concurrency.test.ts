import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { transitionBody } from "./support/order-payment";

/* --------------------------------------------------------------------------
   2S4-BE-09 / 2S4-BE-10 — the order's state under concurrency (the review
   of 2026-10-02).

     1. Every move is conditional on the state it was read in. A cancel and a
        payment racing for the same order: one wins, the other is refused —
        never CANCELLED overwritten to PAID on released stock and reversed
        books (or PAID to CANCELLED).
     2. Two sellers accepting at the same moment: the last answer moves the
        order on. And a PENDING_SELLER order with no question left open is
        picked up by the sweep.
     3. A payment cannot start, or be taken, for an order that is no longer
        waiting for it; a card payment confirmed for a cancelled order is
        recorded for refund and BTG is emailed; a cancel through /transition
        is refused while a card payment is being confirmed.
     4. A Zoho invoice in another currency never pays the order.

   The races are forced, not hoped for: one transaction is held open (its
   write done, its commit waiting) while the other runs into it; the test
   waits until Postgres shows the second blocked behind the first, then lets
   the first commit.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@oc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-09 / 2S4-BE-10 · order state under concurrency", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { cancelOrderAsSystem, payOrderIn } = await import("../src/domain/marketplace-order");
  const { sweepSellerApprovals } = await import("../src/domain/order-approval");
  const { sweepUnpaidOrders } = await import("../src/domain/order-payment");
  const { confirmPayment } = await import("../src/domain/payouts");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

  const T = "oc_btg";
  const TERMS = `${T}_order_terms`;
  const L: Record<string, string> = {};
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let day = 10;
  const HOUR = 3_600_000;

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'oc\\_%@oc-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 7; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  const mails = async (template: string) => {
    const rows = await prisma.outboxJob.findMany({
      where: { name: "notify.email", tenantId: { in: await tenantsInPlay() }, payload: { path: ["template"], equals: template } },
      select: { payload: true }, orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.payload as { to: string; data: Record<string, string>; idempotencyKey: string });
  };
  const ref = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
  const live = (orderId: string) => prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: `${orderId}:` }, releasedAt: null } });
  const stateOf = async (id: string) => (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id }, select: { state: true } })).state;
  const audits = (id: string, action: string) => prisma.auditLog.findMany({ where: { entityId: id, action }, select: { after: true } });

  async function publish(key: string, item: Record<string, unknown>, owner = "oc_mgr") {
    const made = await call("POST", "/inventory", owner, item);
    expect(made.status, made.text).toBe(201);
    const listing = await call("POST", "/listings", owner, { inventoryItemId: made.json.id, title: `${item.title}`, description: "A description long enough for governance." });
    expect(listing.status, listing.text).toBe(201);
    L[key] = listing.json.id;
    expect((await call("POST", `/listings/${L[key]}/submit`, owner)).json.state).toBe("PUBLISHED");
  }
  async function order(sponsor: string, lines: Array<{ key: string; quantity: number }>) {
    const d = (day += 2);
    await call("POST", "/cart", sponsor);
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", sponsor, { listingId: L[l.key], quantity: l.quantity, startsOn: at(d), endsOn: at(d) });
      expect(r.status, r.text).toBe(201);
    }
    const hold = await call("POST", "/cart/reserve", sponsor);
    expect(hold.status, hold.text).toBe(201);
    const placed = await call("POST", "/marketplace-orders", sponsor, placeOrderBody(hold.json.id, TERMS));
    expect(placed.status, placed.text).toBe(201);
    return placed.json as { id: string; state: string; totalCents: number; sellerApprovals: Array<{ id: string; seller: { type: string } }> };
  }

  /**
   * Run `fn` in a transaction and hold it open — its writes done, its locks
   * held, its commit waiting — until `release()`. `pid` is its backend, so
   * the test can see who is queued behind it.
   */
  const gates: Array<() => void> = [];
  async function held<T>(fn: (tx: Tx) => Promise<T>) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    gates.push(release);
    let started!: (v: { pid: number; value: T }) => void;
    let failed!: (e: unknown) => void;
    const ready = new Promise<{ pid: number; value: T }>((res, rej) => { started = res; failed = rej; });
    const committed = prisma.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRawUnsafe<{ pid: number }[]>(`SELECT pg_backend_pid() AS pid`);
      const value = await fn(tx);
      started({ pid, value });
      await gate;
      return value;
    }, { timeout: 30_000, maxWait: 10_000 }).catch((e: unknown) => { failed(e); throw e; });
    const { pid, value } = await ready;
    return { pid, value, release, committed };
  }
  /**
   * Wait until `n` backends are queued behind `pid` — directly, or behind
   * another waiter that is (a second waiter on a row queues behind the
   * first) — true; or give up after `ms` (false: the other side never
   * touched the row).
   */
  async function blockedBehind(pid: number, n = 1, ms = 3_000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const rows = await prisma.$queryRawUnsafe<{ pid: number; by: number[] }[]>(
        `SELECT pid, pg_blocking_pids(pid) AS by FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0`,
      );
      const behind = new Set<number>([pid]);
      for (let grew = true; grew;) {
        grew = false;
        for (const r of rows) if (!behind.has(r.pid) && r.by.some((b) => behind.has(b))) { behind.add(r.pid); grew = true; }
      }
      if (behind.size - 1 >= n) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  }
  /** Settle a promise into its outcome without throwing. */
  const settle = <T>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

  /** Move an order's payment window back, as if it started waiting `hours` ago. */
  const waitingFor = (id: string, hours: number) =>
    prisma.marketplaceOrder.update({ where: { id }, data: { awaitingPaymentAt: new Date(Date.now() - hours * HOUR), paymentDueAt: new Date(Date.now() + (72 - hours) * HOUR) } });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Order concurrency BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "oc_s1", tenantId: T, name: "Larkspur Goods OC", categories: ["APPAREL"] },
      { id: "oc_s2", tenantId: T, name: "Tidewater Outfitters OC", categories: ["APPAREL"] },
    ] });
    await prisma.athlete.create({ data: {
      id: "oc_ath_jo", tenantId: T, slug: "oc-ath-jo", legalName: "Jo Brandt", displayName: "JO.BRANDT.OC", email: "oc_ath_jo@oc-test.invalid",
      sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "APPROVED", emailConfirmedAt: new Date(),
    } });
    await prisma.user.createMany({ data: [
      { id: "oc_admin", tenantId: T, clerkId: "oc_admin", email: "oc_admin@oc-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "oc_finance", tenantId: T, clerkId: "oc_finance", email: "oc_finance@oc-test.invalid", roles: ["FINANCE"] },
      { id: "oc_s1_admin", tenantId: T, clerkId: "oc_s1_admin", email: "oc_s1_admin@oc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "oc_s1" },
      { id: "oc_s2_admin", tenantId: T, clerkId: "oc_s2_admin", email: "oc_s2_admin@oc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "oc_s2" },
      { id: "oc_jo", tenantId: T, clerkId: "oc_jo", email: "oc_jo@oc-test.invalid", roles: ["ATHLETE"], athleteId: "oc_ath_jo" },
    ] });
    await prisma.propertyOnboarding.create({ data: {
      id: "oc_onb", tenantId: T, orgType: "TEAM", orgName: "OC Bay Herons", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Rae Lindqvist", email: "oc_mgr@oc-test.invalid", phone: "301-555-0144", role: "General manager", primary: true }],
      details: { legalEntityName: "OC Bay Herons LLC", league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    await decideOnboarding({ userId: "oc_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "oc_onb", "APPROVE");
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "oc_mgr");

    await publish("poster", { title: "Concourse poster OC", kind: "SIGNAGE", priceCents: 10_000, quantity: 200 });
    await publish("vip", { title: "VIP table OC", kind: "TICKETS", priceCents: 20_000, quantity: 50, packageRules: { requiresApproval: true } });
    await publish("clinic", { title: "Jo's shooting clinic OC", kind: "CAMP", priceCents: 15_000, quantity: 50, packageRules: { requiresApproval: true } }, "oc_jo");
  });

  /* A test that failed mid-race must not leave its transaction holding the row. */
  afterEach(() => { while (gates.length) gates.pop()!(); });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── 1 · every move is conditional on the state it was read in ───────── */
  describe("1 · a cancel and a payment racing for the same order — one wins, the other is refused", () => {
    it("BTG marking it paid while the unpaid cancel is committing: refused (409); it stays CANCELLED, stock released, books reversed", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      expect(o.state).toBe("AWAITING_PAYMENT");
      const cancel = await held((tx) => cancelOrderAsSystem(tx, o.id, "UNPAID"));
      const paying = settle(call("POST", `/marketplace-orders/${o.id}/transition`, "oc_finance", transitionBody("PAID")));
      expect(await blockedBehind(cancel.pid)).toBe(true);
      cancel.release();
      await cancel.committed;
      const r = await paying;
      expect(r.ok && r.value.status, r.ok ? r.value.text : String(r.error)).toBe(409);
      expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true, cancelReason: true, paidAt: true } }))
        .toEqual({ state: "CANCELLED", cancelReason: "UNPAID", paidAt: null });
      expect(await live(o.id)).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { orderId: o.id, entryType: "REVERSAL" } })).toBeGreaterThan(0);
      expect(await prisma.ledgerEntry.count({ where: { orderId: o.id, status: "AVAILABLE" } })).toBe(0);
      expect(await audits(o.id, "marketplaceOrder.paid")).toEqual([]);
      expect(await audits(o.id, "marketplaceOrder.paymentRecorded")).toEqual([]);
      expect((await mails("payment.received")).filter((m) => m.data.orderRef === ref(o.id))).toEqual([]);
    });

    it("a Zoho invoice paid while the unpaid cancel is committing: not paid — recorded as money for an order not waiting for it", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      await prisma.marketplaceOrder.update({ where: { id: o.id }, data: { zohoDealId: `oc_deal_${o.id}` } });
      const cancel = await held((tx) => cancelOrderAsSystem(tx, o.id, "UNPAID"));
      const ingest = settle(prisma.$transaction((tx) => ingestZohoInvoice(tx, {
        invoiceId: `oc_zinv_${o.id}`, dealId: `oc_deal_${o.id}`, number: "INV-OC-1", status: "paid", amount: o.totalCents, balance: 0, currency: "USD", paidAt: new Date().toISOString(),
      }), { timeout: 30_000 }));
      expect(await blockedBehind(cancel.pid)).toBe(true);
      cancel.release();
      await cancel.committed;
      const r = await ingest;
      expect(r.ok, r.ok ? "" : String(r.error)).toBe(true);
      expect(r.ok && r.value).toMatchObject({ applied: true, orderPaid: false });
      expect(await stateOf(o.id)).toBe("CANCELLED");
      expect(await live(o.id)).toBe(0);
      expect(await audits(o.id, "marketplaceOrder.paid")).toEqual([]);
      expect(await audits(o.id, "marketplaceOrder.invoicePaidUnmatched")).toEqual([
        { after: expect.objectContaining({ orderState: "CANCELLED", reason: expect.stringMatching(/not waiting for payment/) }) },
      ]);
    });

    it("the unpaid sweep running while a payment is committing: the sweep leaves it — it stays PAID, nothing reversed, nobody told it was cancelled", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      await waitingFor(o.id, 73);
      const pay = await held((tx) => payOrderIn(tx, { userId: "oc_finance", tenantId: T }, o.id, { via: "BANK_TRANSFER", reference: "OC-WIRE-1", receivedOn: new Date().toISOString().slice(0, 10), recordedBy: "oc_finance" }));
      const sweep = settle(sweepUnpaidOrders(new Date(), { tenantIds: [T] }));
      expect(await blockedBehind(pay.pid)).toBe(true);
      pay.release();
      await pay.committed;
      const r = await sweep;
      expect(r.ok && r.value.failed).toBe(0);
      expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true, cancelReason: true } })).toEqual({ state: "PAID", cancelReason: null });
      expect(await live(o.id)).toBeGreaterThan(0);
      expect(await prisma.ledgerEntry.count({ where: { orderId: o.id, entryType: "REVERSAL" } })).toBe(0);
      expect(await audits(o.id, "marketplaceOrder.cancelled")).toEqual([]);
      expect((await mails("order.cancelledUnpaid")).filter((m) => m.data.orderRef === ref(o.id))).toEqual([]);
    });
  });

  /* ── 2 · two sellers at the same moment ──────────────────────────────── */
  describe("2 · two sellers accepting at the same moment — the last answer moves the order on", () => {
    it("both answers in flight together (each blocked behind the other's order): the order is approved and waiting for payment, once", async () => {
      for (let round = 0; round < 3; round++) {
        const o = await order("oc_s2_admin", [{ key: "vip", quantity: 1 }, { key: "clinic", quantity: 1 }]);
        expect(o.state).toBe("PENDING_SELLER");
        const team = o.sellerApprovals.find((a) => a.seller.type === "PROPERTY")!.id;
        const jo = o.sellerApprovals.find((a) => a.seller.type === "ATHLETE")!.id;
        /* Hold the order row, so both answers are in flight at once when it lets go. */
        const gate = await held((tx) => tx.$queryRawUnsafe(`SELECT id FROM "MarketplaceOrder" WHERE id = $1 FOR UPDATE`, o.id));
        const both = Promise.all([
          call("POST", `/seller-approvals/${team}/decision`, "oc_mgr", { decision: "ACCEPT" }),
          call("POST", `/seller-approvals/${jo}/decision`, "oc_jo", { decision: "ACCEPT" }),
        ]);
        /* Both answers queued on the order's lock — in flight together when it lets go. */
        expect(await blockedBehind(gate.pid, 2)).toBe(true);
        gate.release();
        await gate.committed;
        const [a, b] = await both;
        expect([a.status, b.status], `${a.text} ${b.text}`).toEqual([200, 200]);
        expect(await stateOf(o.id), `round ${round}`).toBe("AWAITING_PAYMENT");
        expect(await audits(o.id, "marketplaceOrder.approve")).toHaveLength(1);
        expect((await mails("order.approved")).filter((m) => m.data.orderRef === ref(o.id))).toHaveLength(1);
      }
    });

    it("an order left in PENDING_SELLER with no question open (every seller accepted) is picked up by the sweep and moved on", async () => {
      const o = await order("oc_s2_admin", [{ key: "vip", quantity: 1 }, { key: "clinic", quantity: 1 }]);
      /* As the race left it before this fix: both answers in, the order never moved. */
      await prisma.orderSellerApproval.updateMany({ where: { orderId: o.id }, data: { state: "ACCEPTED", decidedAt: new Date(), decidedBy: "oc_mgr" } });
      expect(await stateOf(o.id)).toBe("PENDING_SELLER");
      const r = await sweepSellerApprovals(new Date(), { tenantIds: [T] });
      expect(r).toMatchObject({ failed: 0 });
      expect(r.movedOn).toBeGreaterThanOrEqual(1);
      expect(await stateOf(o.id)).toBe("AWAITING_PAYMENT");
      expect((await mails("order.approved")).filter((m) => m.data.orderRef === ref(o.id))).toHaveLength(1);
      /* A second pass does nothing. */
      await sweepSellerApprovals(new Date(), { tenantIds: [T] });
      expect(await audits(o.id, "marketplaceOrder.approve")).toHaveLength(1);
    });
  });

  /* ── 3 · payment only for an order waiting for it ────────────────────── */
  describe("3 · a card payment only for an order that is waiting for it", () => {
    it("starting to pay while the unpaid cancel is committing: refused (409), no payment started", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      const cancel = await held((tx) => cancelOrderAsSystem(tx, o.id, "UNPAID"));
      const paying = settle(call("POST", `/marketplace-orders/${o.id}/pay`, "oc_s1_admin"));
      expect(await blockedBehind(cancel.pid)).toBe(true);
      cancel.release();
      await cancel.committed;
      const r = await paying;
      expect(r.ok && r.value.status, r.ok ? r.value.text : String(r.error)).toBe(409);
      expect(await prisma.paymentAttempt.count({ where: { orderId: o.id } })).toBe(0);
      expect(await stateOf(o.id)).toBe("CANCELLED");
    });

    it("the provider's page submitted while the order is being cancelled: nothing is taken — the attempt fails, no confirmation queued", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "oc_s1_admin");
      expect(pay.status, pay.text).toBe(200);
      const token = new URL(pay.json.url).searchParams.get("t")!;
      const cancel = await held((tx) => cancelOrderAsSystem(tx, o.id, "UNPAID"));
      const submit = settle(call("POST", "/public/test-provider/checkout", undefined, { token, outcome: "SUCCEED" }));
      expect(await blockedBehind(cancel.pid)).toBe(true);
      cancel.release();
      await cancel.committed;
      const r = await submit;
      expect(r.ok && r.value.status, r.ok ? r.value.text : String(r.error)).toBe(200);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.id }, select: { id: true, state: true, failureReason: true } });
      expect(attempt.state).toBe("FAILED");
      expect(attempt.failureReason).toMatch(/no longer waiting for payment/);
      expect(await prisma.outboxJob.count({ where: { name: "payments.confirm", payload: { path: ["attemptId"], equals: attempt.id } } })).toBe(0);
      expect(await stateOf(o.id)).toBe("CANCELLED");
    });

    it("a card payment confirmed for an order already cancelled is recorded for refund, and BTG is emailed", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "oc_s1_admin");
      const token = new URL(pay.json.url).searchParams.get("t")!;
      expect((await call("POST", "/public/test-provider/checkout", undefined, { token, outcome: "SUCCEED" })).status).toBe(200);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.id, state: "PROCESSING" }, select: { id: true } });
      /* Cancelled underneath it (as a cancel before this fix could). */
      await prisma.$transaction((tx) => cancelOrderAsSystem(tx, o.id, "UNPAID"));
      expect(await confirmPayment(attempt.id)).toMatchObject({ confirmed: true, refundNeeded: true });
      expect(await stateOf(o.id)).toBe("CANCELLED");
      expect(await audits(o.id, "marketplaceOrder.paid")).toEqual([]);
      expect(await audits(o.id, "payment.paidAfterCancel")).toEqual([
        { after: expect.objectContaining({ attemptId: attempt.id, amountCents: o.totalCents, orderState: "CANCELLED" }) },
      ]);
      const mail = (await mails("payment.refundNeeded")).filter((m) => m.data.orderRef === ref(o.id));
      expect(mail.map((m) => m.to)).toEqual(["oc_admin@oc-test.invalid"]);
      expect(mail[0]!.data).toMatchObject({ amount: expect.stringMatching(/^\$/), orderState: "cancelled" });
      /* The confirmation redelivered records nothing twice. */
      expect(await confirmPayment(attempt.id)).toMatchObject({ confirmed: false });
      expect(await audits(o.id, "payment.paidAfterCancel")).toHaveLength(1);
    });

    it("cancelling through /transition — sponsor or BTG — is refused (409) while a card payment is being confirmed", async () => {
      const o = await order("oc_s1_admin", [{ key: "poster", quantity: 1 }]);
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "oc_s1_admin");
      const token = new URL(pay.json.url).searchParams.get("t")!;
      await call("POST", "/public/test-provider/checkout", undefined, { token, outcome: "SUCCEED" });
      for (const who of ["oc_s1_admin", "oc_admin"]) {
        const r = await call("POST", `/marketplace-orders/${o.id}/transition`, who, { to: "CANCELLED" });
        expect(r.status, `${who}: ${r.text}`).toBe(409);
        expect(r.text).toMatch(/being confirmed/);
      }
      expect(await stateOf(o.id)).toBe("AWAITING_PAYMENT");
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.id, state: "PROCESSING" }, select: { id: true } });
      expect(await confirmPayment(attempt.id)).toMatchObject({ confirmed: true });
      expect(await stateOf(o.id)).toBe("PAID");
    });
  });

  /* ── 4 · the invoice's currency ──────────────────────────────────────── */
  describe("4 · a Zoho invoice in another currency never pays the order", () => {
    it("a paid CAD invoice for a USD order: not paid, audited as unmatched with the reason; the USD one then pays it", async () => {
      const o = await order("oc_s2_admin", [{ key: "poster", quantity: 2 }]);
      const dealId = `oc_deal_${o.id}`;
      await prisma.marketplaceOrder.update({ where: { id: o.id }, data: { zohoDealId: dealId } });
      const invoice = { invoiceId: `oc_zinv_cad_${o.id}`, dealId, number: "INV-OC-CAD", status: "paid", amount: o.totalCents * 2, balance: 0, currency: "CAD", paidAt: new Date().toISOString() };
      const r = await prisma.$transaction((tx) => ingestZohoInvoice(tx, invoice));
      expect(r).toMatchObject({ applied: true, orderPaid: false, note: expect.stringMatching(/CAD/) });
      expect(await stateOf(o.id)).toBe("AWAITING_PAYMENT");
      expect(await audits(o.id, "marketplaceOrder.invoicePaidUnmatched")).toEqual([
        { after: expect.objectContaining({ zohoInvoiceId: invoice.invoiceId, currency: "CAD", orderCurrency: "USD", reason: expect.stringMatching(/CAD.*USD/) }) },
      ]);
      expect(await audits(o.id, "marketplaceOrder.paymentRecorded")).toEqual([]);
      /* The right currency pays it (Zoho's code, whatever its case). */
      const usd = await prisma.$transaction((tx) => ingestZohoInvoice(tx, { ...invoice, invoiceId: `oc_zinv_usd_${o.id}`, number: "INV-OC-USD", amount: o.totalCents, currency: "usd" }));
      expect(usd).toMatchObject({ applied: true, orderPaid: true });
      expect(await stateOf(o.id)).toBe("PAID");
    });
  });
});
