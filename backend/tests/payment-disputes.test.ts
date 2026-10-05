import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S5-BE-03 · Refunds and disputes, against the real API and database.

   Done when: "A refund or dispute correctly reverses ledger entries and
   blocks the related payout."

   The provider is the stand-in; its refund and dispute events are signed
   HTTP deliveries to the webhook, applied by the worker's step. A dispute is
   never resolved by the system: the provider's outcome is recorded, and a BTG
   admin resolves it.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pdx-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "pdx_btg";
const OTHER_T = "pdx_other_btg";

describe.skipIf(!hasDatabase)("2S5-BE-03 · refunds and disputes", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "pdx", domain: "pdx-test.invalid" });
  const { prisma, events } = w;
  const { processPaymentEvent, retryDeferredPaymentEvents } = events;
  const { sendPayout, completeStandinPayout } = await import("../src/domain/payouts");

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  /** The provider says something about a payment: delivered over HTTP, then applied by the worker. */
  async function provider(type: string, data: Record<string, unknown>, eventId?: string) {
    const r = await w.deliver(w.envelope(type, data, eventId));
    expect(r.status, r.text).toBe(202);
    return { eventId: r.json.events[0].id as string, ...(await processPaymentEvent(r.json.events[0].id)) };
  }
  const payoutRow = (id: string) => prisma.payout.findUniqueOrThrow({ where: { id }, select: { state: true, decidedBy: true, decisionNote: true, amountCents: true } });
  const request = async () => {
    const r = await w.call("POST", "/payouts", w.id("riley"));
    expect(r.status, r.text).toBe(201);
    return r.json.payouts[0] as { id: string; state: string; amountCents: number };
  };
  /** Order entries outside payouts, per account — what a reversal must net to zero. */
  const orderNet = async (orderId: string) => {
    const rows = await prisma.ledgerEntry.findMany({ where: { orderId, entryType: { not: "PAYOUT" } }, select: { account: true, debitCents: true, creditCents: true } });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.account] = (out[r.account] ?? 0) + r.creditCents - r.debitCents;
    return out;
  };
  const refundsOf = (orderId: string) => prisma.refundDue.findMany({ where: { orderId }, select: { cause: true, state: true, reference: true, method: true, sentBy: true, amountCents: true } });

  describe("refunds the provider reports", () => {
    it("the whole payment refunded at the provider: the order is refunded here, its books reversed, the refund recorded once and never sent again; an approved payout not yet sent is sent back", async () => {
      const o = await w.paidDeliveredOrder();
      const p = await request();
      expect(p.state).toBe("APPROVED");
      const r = await provider("payment.refunded", { attemptId: o.attemptId, paymentRef: o.paymentRef, refundRef: "re_pdx_whole", amountCents: o.amountCents });
      expect(r).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/order is refunded.*1 payout not yet sent was sent back/) });
      expect(await w.orderState(o.orderId)).toBe("REFUNDED");
      expect(await w.attempt(o.attemptId)).toMatchObject({ state: "REFUNDED", refundedCents: o.amountCents });
      /* One refund row, already SENT with the provider's own reference — never refunded a second time. */
      expect(await refundsOf(o.orderId)).toEqual([{ cause: "PROVIDER_REFUNDED", state: "SENT", reference: "re_pdx_whole", method: "CARD", sentBy: "system", amountCents: o.amountCents }]);
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.orderId }, select: { refundCause: true } })).refundCause).toBe("BTG");
      /* The books: the mirror of every entry the order posted. */
      const net = await orderNet(o.orderId);
      for (const [account, cents] of Object.entries(net)) expect(cents, account).toBe(0);
      /* The related payout: sent back as the system, the payee told; nothing left to request. */
      expect(await payoutRow(p.id)).toMatchObject({ state: "REJECTED", decidedBy: "system", decisionNote: expect.stringMatching(/refunded at the payment provider/) });
      expect((await w.emails()).some((m) => m.template === "payout.sentBack" && m.to === `${w.id("riley")}@pdx-test.invalid`)).toBe(true);
      expect(await sendPayout(p.id)).toEqual({ sent: false });
      expect((await w.me()).totals).toMatchObject({ requestableCents: 0, owedBackCents: 0 });
      /* The same refund again under a new event id: recorded already. */
      expect(await provider("payment.refunded", { attemptId: o.attemptId, refundRef: "re_pdx_whole", amountCents: o.amountCents })).toMatchObject({ status: "IGNORED" });
      expect(await refundsOf(o.orderId)).toHaveLength(1);
      await w.assertConsistent();
    });

    it("a refund SponsorX sent is confirmed by the provider's event — nothing reversed twice", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      await events.standinConfirmPayment(pay.attemptId);
      const refunded = await w.call("POST", `/marketplace-orders/${orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(refunded.status, refunded.text).toBe(200);
      const [due] = await refundsOf(orderId);
      expect(due).toMatchObject({ cause: "BTG_REFUNDED_ORDER", state: "SENT" });
      const before = await prisma.ledgerEntry.count({ where: { orderId } });
      const r = await provider("payment.refunded", { attemptId: pay.attemptId, refundRef: due!.reference, amountCents: pay.amountCents });
      expect(r).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/confirmed SponsorX's refund/) });
      expect(await prisma.paymentRefund.findFirst({ where: { orderId }, select: { outcome: true } })).toEqual({ outcome: "CONFIRMED" });
      expect(await w.attempt(pay.attemptId)).toMatchObject({ state: "REFUNDED" });
      expect(await prisma.ledgerEntry.count({ where: { orderId } })).toBe(before);
      expect(await refundsOf(orderId)).toHaveLength(1);
    });

    it("a part refund at the provider is HELD for BTG, and the order's payouts wait until BTG closes it", async () => {
      const o = await w.paidDeliveredOrder();
      const p = await request();
      const r = await provider("payment.refunded", { attemptId: o.attemptId, refundRef: "re_pdx_part", amountCents: 10_000 });
      expect(r).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/part refund.*payouts wait/) });
      expect(await w.attempt(o.attemptId)).toMatchObject({ state: "PARTIALLY_REFUNDED", refundedCents: 10_000 });
      expect(await w.orderState(o.orderId)).toBe("FULFILLED");
      /* The related payout is blocked: not sent while BTG checks it. */
      expect(await sendPayout(p.id)).toEqual({ sent: false });
      expect((await payoutRow(p.id)).state).toBe("APPROVED");
      /* BTG closes it (the provider's refund was a goodwill credit, not this order's money): the payout goes. */
      const closed = await w.call("POST", `/payment-events/${r.eventId}/resolve`, w.id("admin"), { note: "Goodwill credit from BTG's own account; the order stands." });
      expect(closed.status, closed.text).toBe(200);
      expect(await prisma.paymentRefund.findFirst({ where: { providerRefundRef: "re_pdx_part" }, select: { outcome: true } })).toEqual({ outcome: "DISMISSED" });
      expect((await w.jobs("payouts.send")).filter((j) => j.payoutId === p.id).length).toBeGreaterThanOrEqual(2);
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
      await w.assertConsistent();
    });

    it("the whole payment refunded while a payout was being sent is HELD; BTG's refund here then takes it — SENT with the provider's reference, never refunded twice, the payout owed back", async () => {
      const o = await w.paidDeliveredOrder();
      const p = await request();
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      const r = await provider("payment.refunded", { attemptId: o.attemptId, refundRef: "re_pdx_held", amountCents: o.amountCents });
      expect(r).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/being sent right now/) });
      expect(await w.orderState(o.orderId)).toBe("FULFILLED");
      expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
      const refunded = await w.call("POST", `/marketplace-orders/${o.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(refunded.status, refunded.text).toBe(200);
      expect(await refundsOf(o.orderId)).toEqual([expect.objectContaining({ cause: "BTG_REFUNDED_ORDER", state: "SENT", reference: "re_pdx_held", sentBy: "system" })]);
      expect(await prisma.paymentRefund.findFirst({ where: { providerRefundRef: "re_pdx_held" }, select: { outcome: true } })).toEqual({ outcome: "APPLIED" });
      /* The books reversed after the payout went: Riley owes it back. */
      expect((await w.me()).totals.owedBackCents).toBeGreaterThanOrEqual(p.amountCents);
      await w.assertConsistent();
    });

    it("a part refund at the provider, then BTG refunds the whole order here: the card is not refunded again by itself — Finance sends what is left", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      await events.standinConfirmPayment(pay.attemptId);
      const part = await provider("payment.refunded", { attemptId: pay.attemptId, refundRef: "re_pdx_part2", amountCents: 20_000 });
      expect(part.status).toBe("HELD");
      expect(await w.attempt(pay.attemptId)).toMatchObject({ state: "PARTIALLY_REFUNDED", refundedCents: 20_000 });
      const r = await w.call("POST", `/marketplace-orders/${orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(r.status, r.text).toBe(200);
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "BTG_REFUNDED_ORDER", state: "OPEN", reference: null })]);
      expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "refundDue.heldForProviderRefund" } })).toBe(1);
      await w.assertConsistent();
    });

    it("out of order: a refund before the payment's confirmation waits, then applies once the payment is confirmed", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      const now = new Date();
      const early = await w.deliver(w.envelope("payment.refunded", { attemptId: pay.attemptId, refundRef: "re_pdx_early", amountCents: pay.amountCents }));
      const eventId = early.json.events[0].id as string;
      expect(await processPaymentEvent(eventId, now)).toMatchObject({ status: "DEFERRED" });
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect(await events.standinConfirmPayment(pay.attemptId)).toMatchObject({ confirmed: true });
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] })).toMatchObject({ applied: 1 });
      expect(await w.orderState(orderId)).toBe("REFUNDED");
      expect(await w.attempt(pay.attemptId)).toMatchObject({ state: "REFUNDED" });
      await w.assertConsistent();
    });

    it("refunding more than was captured is HELD; nothing changes", async () => {
      const o = await w.paidDeliveredOrder();
      const r = await provider("payment.refunded", { attemptId: o.attemptId, refundRef: "re_pdx_over", amountCents: o.amountCents + 1 });
      expect(r).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/more than/) });
      expect(await w.attempt(o.attemptId)).toMatchObject({ state: "SUCCEEDED", refundedCents: 0 });
      expect(await w.orderState(o.orderId)).toBe("FULFILLED");
    });
  });

  describe("disputes: frozen, worked by BTG support, never resolved by themselves", () => {
    it("opened: the order's money is frozen and BTG support has the item; the provider's decision changes nothing until a BTG admin resolves it; WON sends the waiting payout", async () => {
      const o = await w.paidDeliveredOrder();
      const p = await request();
      expect(p.state).toBe("APPROVED");
      const opened = await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pdx_won", amountCents: o.amountCents, reason: "fraudulent" });
      expect(opened).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/frozen/) });
      const d = await prisma.paymentDispute.findFirstOrThrow({ where: { providerDisputeRef: "dp_pdx_won" }, select: { id: true, state: true, tenantId: true } });
      expect(d).toMatchObject({ state: "OPEN", tenantId: T });
      /* The review item: the support mailbox and BTG's admins. */
      const mail = (await w.emails()).filter((m) => m.template === "dispute.opened");
      expect(mail.map((m) => m.to)).toEqual(expect.arrayContaining([w.env.SUPPORT_EMAIL, `${w.id("admin")}@pdx-test.invalid`]));
      /* Frozen: the approved payout isn't sent; the order can't be refunded. */
      expect(await sendPayout(p.id)).toEqual({ sent: false });
      const refund = await w.call("POST", `/marketplace-orders/${o.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(refund.status).toBe(409);
      expect(refund.json.error.message).toMatch(/disputed/);
      /* A repeat of the opening, under a new event id: one dispute. */
      expect(await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pdx_won", amountCents: o.amountCents })).toMatchObject({ status: "IGNORED" });

      /* On BTG's list — admin and Finance, in their own books only. */
      const list = (await w.call("GET", "/disputes", w.id("finance"))).json;
      expect(list.disputes.find((x: { id: string }) => x.id === d.id)).toMatchObject({ state: "OPEN", frozen: true, canResolve: false, payouts: [expect.objectContaining({ id: p.id, state: "APPROVED" })] });
      expect((await w.call("GET", "/disputes", w.id("other_admin"))).json.disputes.map((x: { id: string }) => x.id)).not.toContain(d.id);
      expect((await w.call("GET", `/disputes/${d.id}`, w.id("other_admin"))).status).toBe(404);
      for (const who of [w.id("buyer"), w.id("riley")]) expect((await w.call("GET", "/disputes", who)).status, who).toBe(403);

      /* The provider decides: recorded, BTG told — still open, still frozen. */
      expect(await provider("dispute.closed", { attemptId: o.attemptId, disputeRef: "dp_pdx_won", outcome: "WON" })).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/nothing was decided automatically/) });
      expect(await prisma.paymentDispute.findUniqueOrThrow({ where: { id: d.id }, select: { state: true, providerOutcome: true } })).toEqual({ state: "OPEN", providerOutcome: "WON" });
      expect((await w.emails()).some((m) => m.template === "dispute.providerClosed")).toBe(true);
      expect(await sendPayout(p.id)).toEqual({ sent: false });
      /* Not straight from open; review first. Finance reviews; only a BTG admin resolves. */
      expect((await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Won." })).status).toBe(409);
      const reviewed = await w.call("POST", `/disputes/${d.id}/review`, w.id("finance"), { note: "Sent the signed delivery confirmation." });
      expect(reviewed.status, reviewed.text).toBe(200);
      expect(reviewed.json).toMatchObject({ state: "UNDER_REVIEW", canResolve: true });
      expect((await w.call("POST", `/disputes/${d.id}/resolve`, w.id("finance"), { note: "Won." })).status).toBe(403);
      const won = await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "The bank found for BTG." });
      expect(won.status, won.text).toBe(200);
      expect(won.json).toMatchObject({ state: "WON", frozen: false, ledgerReversed: false });
      /* Unfrozen: the payout waiting on it goes to the provider. */
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
      expect(await w.orderState(o.orderId)).toBe("FULFILLED");
      expect((await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "again" })).status).toBe(409);
      await w.assertConsistent();
    });

    it("LOST after the money was paid out: the books are reversed, a payout not yet sent is sent back, and what was paid out is owed back", async () => {
      const o = await w.paidDeliveredOrder();
      const paidOut = await request();
      expect(await sendPayout(paidOut.id)).toEqual({ sent: true });
      expect(await completeStandinPayout(paidOut.id)).toMatchObject({ paid: true });
      const owedBefore = (await w.me()).totals.owedBackCents as number;
      /* Out of order: the provider's close arrives before its opening. */
      const closed = await provider("dispute.closed", { attemptId: o.attemptId, disputeRef: "dp_pdx_lost", outcome: "LOST", amountCents: o.amountCents });
      expect(closed).toMatchObject({ status: "APPLIED" });
      expect(await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pdx_lost", amountCents: o.amountCents })).toMatchObject({ status: "IGNORED" });
      const d = await prisma.paymentDispute.findFirstOrThrow({ where: { providerDisputeRef: "dp_pdx_lost" }, select: { id: true, state: true, providerOutcome: true } });
      expect(d).toMatchObject({ state: "OPEN", providerOutcome: "LOST" });
      /* Riley's other money: a new order, requested while this one is frozen — its payout covers only the other order. */
      await w.call("POST", `/disputes/${d.id}/review`, w.id("admin"), { note: "Gathered evidence; the provider has already decided." });
      const lost = await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Lost at the bank." });
      expect(lost.status, lost.text).toBe(200);
      expect(lost.json).toMatchObject({ state: "LOST", ledgerReversed: true, owedBackCents: paidOut.amountCents });
      /* The books: the mirror of the order's postings; only the payout stays paid out. */
      const net = await orderNet(o.orderId);
      for (const [account, cents] of Object.entries(net)) expect(cents, account).toBe(0);
      /* Owed back, exactly as the payee's money page counts it. */
      const me = await w.me();
      expect(me.totals.owedBackCents - owedBefore).toBe(paidOut.amountCents);
      expect(me.owedBackNote).toMatch(/You owe/);
      /* And the order can never be refunded again — the bank already returned it. */
      const refund = await w.call("POST", `/marketplace-orders/${o.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(refund.status).toBe(409);
      expect(refund.json.error.message).toMatch(/already returned/);
      expect(await prisma.refundDue.count({ where: { orderId: o.orderId } })).toBe(0);
      await w.assertConsistent();
    });

    it("LOST before payout: the approved payout is sent back as the system, nothing is owed", async () => {
      const o = await w.paidDeliveredOrder();
      const p = await request();
      await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pdx_lost2", amountCents: o.amountCents });
      await provider("dispute.closed", { attemptId: o.attemptId, disputeRef: "dp_pdx_lost2", outcome: "LOST" });
      const d = await prisma.paymentDispute.findFirstOrThrow({ where: { providerDisputeRef: "dp_pdx_lost2" }, select: { id: true } });
      await w.call("POST", `/disputes/${d.id}/review`, w.id("admin"), { note: "Evidence sent." });
      const lost = await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Lost." });
      expect(lost.json).toMatchObject({ state: "LOST", owedBackCents: 0 });
      expect(await payoutRow(p.id)).toMatchObject({ state: "REJECTED", decidedBy: "system", decisionNote: expect.stringMatching(/disputed and the dispute was lost/) });
      expect(await sendPayout(p.id)).toEqual({ sent: false });
      await w.assertConsistent();
    });

    it("a dispute on part of the payment: LOST names the lines it was for, and only their books are reversed", async () => {
      const o = await w.paidDeliveredOrder(2);
      await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pdx_part", amountCents: 30_000 });
      await provider("dispute.closed", { attemptId: o.attemptId, disputeRef: "dp_pdx_part", outcome: "LOST" });
      const d = await prisma.paymentDispute.findFirstOrThrow({ where: { providerDisputeRef: "dp_pdx_part" }, select: { id: true } });
      await w.call("POST", `/disputes/${d.id}/review`, w.id("admin"), { note: "Part of the clinic disputed." });
      const noLines = await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Lost." });
      expect(noLines.status).toBe(422);
      expect((await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Lost.", lineIds: ["not_this_order"] })).status).toBe(422);
      const [line] = await prisma.marketplaceOrderLine.findMany({ where: { orderId: o.orderId }, select: { id: true } });
      const lost = await w.call("POST", `/disputes/${d.id}/resolve`, w.id("admin"), { note: "Lost.", lineIds: [line!.id] });
      expect(lost.status, lost.text).toBe(200);
      expect(lost.json).toMatchObject({ state: "LOST", lineIds: [line!.id] });
      const net = await orderNet(o.orderId);
      for (const [account, cents] of Object.entries(net)) expect(cents, account).toBe(0);
      await w.assertConsistent();
    });

    it("a dispute on a payment SponsorX hasn't confirmed yet waits for it (out of order)", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      const now = new Date();
      const r = await w.deliver(w.envelope("dispute.opened", { attemptId: pay.attemptId, disputeRef: "dp_pdx_early", amountCents: pay.amountCents }));
      expect(await processPaymentEvent(r.json.events[0].id, now)).toMatchObject({ status: "DEFERRED" });
      await events.standinConfirmPayment(pay.attemptId);
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] })).toMatchObject({ applied: 1 });
      expect(await prisma.paymentDispute.count({ where: { providerDisputeRef: "dp_pdx_early", state: "OPEN" } })).toBe(1);
    });
  });
});
