import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S5-BE-04 · Payout eligibility, against the real API and database.

   Done when: "Payout cannot be released if payment is unsettled,
   deliverables are incomplete, onboarding is incomplete, or a dispute is
   open." Each clause is checked where money could move: what the payee can
   request (GET /payouts/me, POST /payouts), what BTG reads and approves
   (GET /payouts/{id}, decision), and what the worker hands the provider
   (sendPayout).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pel-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "pel_btg";
const OTHER_T = "pel_other_btg";

describe.skipIf(!hasDatabase)("2S5-BE-04 · a payout is released only when all five hold", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "pel", domain: "pel-test.invalid" });
  const { prisma, events } = w;
  const { sendPayout, completeStandinPayout } = await import("../src/domain/payouts");

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  const check = (me: { checks: Array<{ key: string; ok: boolean }> }, key: string) => me.checks.find((c) => c.key === key)?.ok;
  type Money = { orderId: string; requestableCents: number; availableCents: number; awaitingPaymentCents: number; confirmedLines: number; frozen: boolean };
  const mineOn = (me: { orders: Money[] }, orderId: string) => me.orders.find((o) => o.orderId === orderId);
  /** Approve if it waits for BTG, then send and confirm it. */
  async function settle(p: { id: string; state: string }) {
    if (p.state === "REQUESTED") expect((await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" })).status).toBe(200);
    expect(await sendPayout(p.id)).toEqual({ sent: true });
    expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
  }
  async function provider(type: string, data: Record<string, unknown>) {
    const r = await w.deliver(w.envelope(type, data));
    expect(r.status, r.text).toBe(202);
    return events.processPaymentEvent(r.json.events[0].id);
  }
  /** Riley's payout account at the provider, set by the stand-in's own page. */
  async function account(outcome: "READY" | "NEEDS_INFO") {
    const link = (await w.call("POST", "/payouts/account/link", w.id("riley"), {})).json;
    expect((await w.call("POST", "/public/test-provider/account", undefined, { token: w.tokenOf(link.url), outcome })).status).toBe(200);
  }
  /** Settle everything requestable now, so each clause starts from a clean balance. */
  async function drain() {
    const me = await w.me();
    if (me.totals.requestableCents > 0) {
      for (const p of (await w.call("POST", "/payouts", w.id("riley"))).json.payouts as Array<{ id: string; state: string }>) await settle(p);
    }
    expect((await w.me()).totals.requestableCents).toBe(0);
  }

  it("payment unsettled: an order not yet paid has nothing to release — awaiting payment, not requestable", async () => {
    await drain();
    const orderId = await w.freshOrder();
    await w.startPaying(orderId); // the provider has it; not confirmed
    const me = await w.me();
    expect(mineOn(me, orderId)).toMatchObject({ requestableCents: 0, awaitingPaymentCents: expect.any(Number) });
    expect(mineOn(me, orderId)!.awaitingPaymentCents).toBeGreaterThan(0);
    expect(me.canRequest).toBe(false);
    const r = await w.call("POST", "/payouts", w.id("riley"));
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/Nothing is ready/);
  });

  it("deliverables incomplete: paid but not delivered and confirmed — not requestable; delivered, it is", async () => {
    await drain();
    const orderId = await w.freshOrder();
    const pay = await w.startPaying(orderId);
    await events.standinConfirmPayment(pay.attemptId);
    await w.call("POST", `/marketplace-orders/${orderId}/transition`, w.id("finance"), { to: "IN_DELIVERY" });
    let me = await w.me();
    expect(mineOn(me, orderId)).toMatchObject({ requestableCents: 0, confirmedLines: 0 });
    expect((await w.call("POST", "/payouts", w.id("riley"))).status).toBe(409);
    await w.deliverOrder(orderId);
    me = await w.me();
    expect(mineOn(me, orderId)!.requestableCents).toBeGreaterThan(0);
  });

  it("onboarding incomplete: no payout is requested to an account that isn't READY, and an approved one isn't released until it is", async () => {
    await drain();
    await w.paidDeliveredOrder();
    await account("NEEDS_INFO");
    const refused = await w.call("POST", "/payouts", w.id("riley"));
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/payout account/);
    expect(check(await w.me(), "account")).toBe(false);
    await account("READY");
    const [p] = (await w.call("POST", "/payouts", w.id("riley"))).json.payouts;
    expect(p.state).toBe("REQUESTED"); // the account changed in the last 7 days: BTG's (2S5-BE-06)
    /* BTG approves; the account then leaves READY before the worker sends it: it is not released. */
    expect((await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" })).status).toBe(200);
    await account("NEEDS_INFO");
    expect(await sendPayout(p.id)).toEqual({ sent: false });
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: p.id }, select: { state: true } })).state).toBe("APPROVED");
    /* READY again: it is sent, by the account's own report. */
    const before = (await w.jobs("payouts.send")).filter((j) => j.payoutId === p.id).length;
    await account("READY");
    expect((await w.jobs("payouts.send")).filter((j) => j.payoutId === p.id).length).toBe(before + 1);
    expect(await sendPayout(p.id)).toEqual({ sent: true });
    expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
  });

  it("dispute open: the disputed order's money can't be requested, approved or sent; the rest can; resolved, it is free again", async () => {
    await drain();
    const disputed = await w.paidDeliveredOrder();
    const clean = await w.paidDeliveredOrder();
    expect(await provider("dispute.opened", { attemptId: disputed.attemptId, disputeRef: "dp_pel", amountCents: disputed.amountCents })).toMatchObject({ status: "APPLIED" });
    const me = await w.me();
    expect(mineOn(me, disputed.orderId)).toMatchObject({ requestableCents: 0, frozen: true });
    expect(mineOn(me, clean.orderId)!.requestableCents).toBeGreaterThan(0);
    /* The payee is told BTG is on it — never the detail. */
    expect(me.checks.find((c: { key: string }) => c.key === "dispute")).toMatchObject({ ok: false, label: expect.stringMatching(/BTG is reviewing a problem with the sponsor's payment/) });
    expect(JSON.stringify(me)).not.toMatch(/disputed/i);
    /* A request takes only the clean order's money. */
    const [p] = (await w.call("POST", "/payouts", w.id("riley"))).json.payouts;
    const lines = await prisma.payoutLine.findMany({ where: { payoutId: p.id }, select: { orderId: true } });
    expect(lines.map((l) => l.orderId)).toEqual([clean.orderId]);
    await settle(p);
    /* Nothing else: the only money left is frozen, and the refusal says why. */
    const refused = await w.call("POST", "/payouts", w.id("riley"));
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/BTG is reviewing a problem with a sponsor's payment/);

    /* A payout covering a disputed order (requested before the dispute) — BTG reads the clause, can't approve it, the worker won't send it. */
    const later = await w.paidDeliveredOrder(8); // over $2,000: waits for BTG
    const [big] = (await w.call("POST", "/payouts", w.id("riley"))).json.payouts;
    expect(big.state).toBe("REQUESTED");
    expect(await provider("dispute.opened", { attemptId: later.attemptId, disputeRef: "dp_pel_big", amountCents: later.amountCents })).toMatchObject({ status: "APPLIED" });
    const detail = (await w.call("GET", `/payouts/${big.id}`, w.id("admin"))).json;
    expect(detail.checks.map((c: { key: string; ok: boolean }) => [c.key, c.ok])).toEqual([["payment", true], ["delivered", true], ["account", true], ["hold", true], ["dispute", false]]);
    const approve = await w.call("POST", `/payouts/${big.id}/decision`, w.id("admin"), { decision: "APPROVE" });
    expect(approve.status).toBe(409);
    expect(approve.json.error.message).toMatch(/disputed/);
    await prisma.payout.update({ where: { id: big.id }, data: { state: "APPROVED", decidedBy: w.id("admin"), decidedAt: new Date() }, select: { id: true } });
    expect(await sendPayout(big.id)).toEqual({ sent: false });

    /* Resolved (won): free again — the waiting payout is sent, and the first order's money can be requested. */
    for (const ref of ["dp_pel", "dp_pel_big"]) {
      await provider("dispute.closed", { disputeRef: ref, outcome: "WON" });
      const d = await prisma.paymentDispute.findFirstOrThrow({ where: { providerDisputeRef: ref }, select: { id: true } });
      await w.call("POST", `/disputes/${d.id}/review`, w.id("admin"), { note: "Evidence sent." });
      expect((await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Won." })).status).toBe(200);
    }
    expect(await sendPayout(big.id)).toEqual({ sent: true });
    expect(mineOn(await w.me(), disputed.orderId)).toMatchObject({ frozen: false });
    expect(mineOn(await w.me(), disputed.orderId)!.requestableCents).toBeGreaterThan(0);
    expect(check(await w.me(), "dispute")).toBeUndefined();
  });

  it("all five met: the whole balance is requestable and every rule reads ok", async () => {
    await drain();
    const o = await w.paidDeliveredOrder();
    const me = await w.me();
    expect(mineOn(me, o.orderId)!.requestableCents).toBe(mineOn(me, o.orderId)!.availableCents);
    expect(me.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    const [p] = (await w.call("POST", "/payouts", w.id("riley"))).json.payouts;
    expect((await w.call("GET", `/payouts/${p.id}`, w.id("admin"))).json.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    await w.assertConsistent();
  });
});
