import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-QA-02 · Payment and reward failure testing — the deliberate-breakage
   suite, against the real API and database.

   "Deliberately break things: duplicate webhooks, out-of-order delivery,
   declined cards, expired reservations, failed payouts, wallet provider
   outages." Done when: "Every failure mode is handled without financial
   inconsistency."

   After every scenario `assertConsistent` (support/payment-world.ts) checks
   the books and the states agree: every journal balances and the books net
   to zero; no payment is refunded beyond what it captured; an order paid has
   its payables available and one cancelled or refunded is reversed; a payout
   PAID has exactly its amount paid out in the books, any other none; a
   second confirmed card payment is recorded for refund.

   Provider outages are the stand-in told it is down (STANDIN_OUTAGE), or
   timing out; a crash mid-way is Postgres refusing a write the step needs.
   WALLET: there is no wallet pass provider yet (2S6-INT-01 is Blocked) —
   not testable; the reward paths that exist (QR images, claims, redemption)
   are broken instead.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pqa-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "pqa_btg";
const OTHER_T = "pqa_other_btg";

describe.skipIf(!hasDatabase)("2S8-QA-02 · every payment and reward failure, without financial inconsistency", { timeout: 180_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "pqa", domain: "pqa-test.invalid" });
  const { prisma, events } = w;
  const { processPaymentEvent, retryDeferredPaymentEvents, MAX_ERRORS } = events;
  const { sendPayout, completeStandinPayout, sweepPayoutRetries } = await import("../src/domain/payouts");
  const { expireReservations } = await import("../src/domain/reservation");
  const { sweepUnpaidOrders } = await import("../src/domain/order-payment");
  const { QUEUE_POLICY } = await import("../worker/queue-policy.mts");
  const pg = (await import("pg")).default;

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  const H = 3_600_000;
  const DAY = 24 * H;
  async function provider(type: string, data: Record<string, unknown>, opts: { id?: string; now?: Date; deliveries?: number } = {}) {
    const raw = w.envelope(type, data, opts.id);
    let first: { status: number; json: { events: Array<{ id: string }> } } | undefined;
    for (let i = 0; i < (opts.deliveries ?? 1); i++) {
      const r = await w.deliver(raw);
      expect(r.status, r.text).toBe(202);
      first ??= r;
    }
    return first!.json.events[0]!.id;
  }
  const payout = (id: string) => prisma.payout.findUniqueOrThrow({ where: { id }, select: { state: true, sendAttempts: true, providerRef: true, waitingOn: true, retryCount: true } });
  async function approved(units = 1) {
    await w.paidDeliveredOrder(units);
    const r = await w.call("POST", "/payouts", w.id("riley"));
    expect(r.status, r.text).toBe(201);
    const p = r.json.payouts[0] as { id: string; state: string; amountCents: number };
    if (p.state === "REQUESTED") expect((await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" })).status).toBe(200);
    return p;
  }
  /** Postgres refuses any change to this order while `fn` runs: a crash in the middle of a step that needs it. */
  async function whileOrderRefused<R>(orderId: string, fn: () => Promise<R>): Promise<R> {
    const c = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
    await c.connect();
    try {
      await c.query(`CREATE OR REPLACE FUNCTION pqa_refuse_order() RETURNS trigger AS $$
        BEGIN IF NEW.id = '${orderId}' THEN RAISE EXCEPTION 'pqa: the database refused this write'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await c.query(`DROP TRIGGER IF EXISTS pqa_refuse_order ON "MarketplaceOrder"`);
      await c.query(`CREATE TRIGGER pqa_refuse_order BEFORE UPDATE ON "MarketplaceOrder" FOR EACH ROW EXECUTE FUNCTION pqa_refuse_order()`);
      return await fn();
    } finally {
      await c.query(`DROP TRIGGER IF EXISTS pqa_refuse_order ON "MarketplaceOrder"`);
      await c.query(`DROP FUNCTION IF EXISTS pqa_refuse_order()`);
      await c.end();
    }
  }

  describe("duplicate webhooks", () => {
    it("every event delivered three times, and every job run twice: one payment, one dispute, one payout", async () => {
      const o = await w.paidDeliveredOrder();
      /* The stand-in's own confirmation, its job delivered again. */
      expect(await events.standinConfirmPayment(o.attemptId)).toMatchObject({ confirmed: false });
      const succeeded = await provider("payment.succeeded", { attemptId: o.attemptId, amountCents: o.amountCents }, { deliveries: 3 });
      expect(await processPaymentEvent(succeeded)).toMatchObject({ status: "IGNORED" });
      const p = await approved();
      await Promise.all([sendPayout(p.id), sendPayout(p.id)]);
      const ref = (await payout(p.id)).providerRef!;
      const paid = await provider("payout.paid", { payoutId: p.id, payoutRef: ref }, { deliveries: 3 });
      await Promise.all([processPaymentEvent(paid), processPaymentEvent(paid), processPaymentEvent(paid)]);
      expect(await prisma.paymentEvent.count({ where: { id: paid } })).toBe(1);
      expect((await payout(p.id)).state).toBe("PAID");
      const opened = await provider("dispute.opened", { attemptId: o.attemptId, disputeRef: "dp_pqa_dup", amountCents: o.amountCents }, { deliveries: 3 });
      await Promise.all([processPaymentEvent(opened), processPaymentEvent(opened)]);
      expect(await prisma.paymentDispute.count({ where: { providerDisputeRef: "dp_pqa_dup" } })).toBe(1);
      await w.assertConsistent();
    });
  });

  describe("out-of-order delivery", () => {
    it("a payment's whole life delivered backwards — refunded, succeeded, processing — ends refunded once, the books reversed", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      const now = new Date();
      const refunded = await provider("payment.refunded", { attemptId: pay.attemptId, refundRef: "re_pqa_ooo", amountCents: pay.amountCents });
      const succeeded = await provider("payment.succeeded", { attemptId: pay.attemptId, amountCents: pay.amountCents });
      const processing = await provider("payment.processing", { attemptId: pay.attemptId });
      expect((await processPaymentEvent(refunded, now)).status).toBe("DEFERRED");
      expect((await processPaymentEvent(succeeded, now)).status).toBe("APPLIED");
      expect((await processPaymentEvent(processing, now)).status).toBe("IGNORED");
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] })).toMatchObject({ applied: 1 });
      expect(await w.orderState(orderId)).toBe("REFUNDED");
      expect(await w.attempt(pay.attemptId)).toMatchObject({ state: "REFUNDED", refundedCents: pay.amountCents });
      expect(await prisma.refundDue.count({ where: { orderId } })).toBe(1);
      await w.assertConsistent();
    });

    it("a payout's words in the wrong order — returned, paid — end where the right order would", async () => {
      const p = await approved();
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      const ref = (await payout(p.id)).providerRef!;
      const now = new Date();
      const returned = await provider("payout.returned", { payoutId: p.id, payoutRef: ref });
      const paid = await provider("payout.paid", { payoutId: p.id, payoutRef: ref });
      expect((await processPaymentEvent(returned, now)).status).toBe("DEFERRED");
      expect((await processPaymentEvent(paid, now)).status).toBe("APPLIED");
      await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] });
      expect(await payout(p.id)).toMatchObject({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" });
      await w.assertConsistent();
    });
  });

  describe("declined cards", () => {
    it("declined, declined again, then paid: the order is paid once; the declines left nothing in the books", async () => {
      const orderId = await w.freshOrder();
      for (let i = 0; i < 2; i++) {
        const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
        await w.call("POST", "/public/test-provider/checkout", undefined, { token: w.tokenOf(pay.json.url), outcome: "DECLINE" });
      }
      expect(await prisma.paymentAttempt.count({ where: { orderId, state: "FAILED" } })).toBe(2);
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect(await prisma.ledgerEntry.count({ where: { orderId, status: { not: "PENDING" } } })).toBe(0);
      await w.assertConsistent();
      const pay = await w.startPaying(orderId);
      await events.standinConfirmPayment(pay.attemptId);
      expect(await w.orderState(orderId)).toBe("PAID");
      /* A decline that arrives late, for the payment that went through: ignored. */
      const late = await provider("payment.failed", { attemptId: pay.attemptId, reason: "card_declined" });
      expect((await processPaymentEvent(late)).status).toBe("IGNORED");
      await w.assertConsistent();
    });

    it("only declines, then the payment window closes: cancelled unpaid, the books reversed; a late success for a declined card is BTG's", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
      await w.call("POST", "/public/test-provider/checkout", undefined, { token: w.tokenOf(pay.json.url), outcome: "DECLINE" });
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, select: { id: true, amountCents: true } });
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { createdAt: new Date(Date.now() - 4 * DAY) }, select: { id: true } });
      expect(await sweepUnpaidOrders(new Date(Date.now() + 4 * DAY), { tenantIds: [T] })).toMatchObject({ cancelled: 1 });
      expect(await w.orderState(orderId)).toBe("CANCELLED");
      const late = await provider("payment.succeeded", { attemptId: attempt.id, amountCents: attempt.amountCents });
      expect((await processPaymentEvent(late)).status).toBe("HELD");
      expect(await w.orderState(orderId)).toBe("CANCELLED");
      await w.assertConsistent();
    });
  });

  describe("expired reservations", () => {
    it("a hold that expires can't become an order; nothing is booked and the stock is free again", async () => {
      await w.call("POST", "/cart", w.id("buyer"));
      const at = (d: number) => new Date(Date.now() + d * DAY).toISOString();
      expect((await w.call("POST", "/cart/lines", w.id("buyer"), { listingId: w.E.clinic, quantity: 1, startsOn: at(200), endsOn: at(201) })).status).toBe(201);
      const hold = (await w.call("POST", "/cart/reserve", w.id("buyer"))).json;
      const before = await prisma.ledgerEntry.count({ where: { tenantId: T } });
      expect(await expireReservations(prisma, new Date(Date.now() + 16 * 60_000), { tenantIds: [T] })).toMatchObject({ expired: 1 });
      const { placeOrderBody } = await import("./support/order-terms");
      const placed = await w.call("POST", "/marketplace-orders", w.id("buyer"), placeOrderBody(hold.id, `${T}_order_terms`));
      expect(placed.status).toBeGreaterThanOrEqual(400);
      expect(await prisma.marketplaceOrder.count({ where: { reservationId: hold.id } })).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { tenantId: T } })).toBe(before);
      expect(await prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: hold.id }, releasedAt: null } })).toBe(0);
      await w.assertConsistent();
      /* The sponsor walks away: the cart the expired hold was for lapses, as the cart sweep would make it. */
      await prisma.cart.updateMany({ where: { tenantId: T, sponsorId: w.E.sponsor, state: "ACTIVE" }, data: { state: "EXPIRED", expiredAt: new Date() } });
    });
  });

  describe("failed payouts", () => {
    it("failing every time: three automatic retries on schedule, then BTG's — never paid, never requestable twice", async () => {
      const p = await approved();
      w.setEnv("STANDIN_PAYOUT_FAILURE", "TEMPORARY");
      try {
        let when = new Date();
        for (let i = 0; i < 4; i++) {
          expect(await sendPayout(p.id)).toEqual({ sent: true });
          expect(await completeStandinPayout(p.id, when)).toMatchObject({ failed: true });
          when = new Date(when.getTime() + 25 * H);
          await sweepPayoutRetries(when, { tenantIds: [T] });
        }
      } finally {
        w.setEnv("STANDIN_PAYOUT_FAILURE", undefined);
      }
      expect(await payout(p.id)).toMatchObject({ state: "FAILED", waitingOn: "BTG", retryCount: 3, sendAttempts: 4 });
      expect((await w.me()).totals.requestableCents).toBe(p.amountCents); // left for BTG: the money is the payee's to request again
      await w.assertConsistent();
    });
  });

  describe("provider outages", () => {
    it("the provider down when a payout is handed over: nothing recorded as sent; the queue's retry sends it once it is back", async () => {
      const p = await approved();
      for (const mode of ["payout", "payout:timeout"]) {
        w.setEnv("STANDIN_OUTAGE", mode);
        w.setEnv("PAYMENT_PROVIDER_TIMEOUT_MS", 50);
        try {
          await expect(sendPayout(p.id)).rejects.toMatchObject({ name: "ProviderUnavailableError", status: 503, timedOut: mode.endsWith("timeout") });
        } finally {
          w.setEnv("STANDIN_OUTAGE", undefined);
          w.setEnv("PAYMENT_PROVIDER_TIMEOUT_MS", 15_000);
        }
        expect(await payout(p.id)).toMatchObject({ state: "APPROVED", sendAttempts: 0, providerRef: null });
        expect(await prisma.auditLog.count({ where: { entityId: p.id, action: "payout.send" } })).toBe(0);
      }
      /* The job is retried, backing off (queue-policy.mts), and the provider is back. */
      expect(QUEUE_POLICY["payouts.send"]).toMatchObject({ retryBackoff: true });
      expect(QUEUE_POLICY["payouts.send"]!.retryLimit).toBeGreaterThan(0);
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      expect(await payout(p.id)).toMatchObject({ state: "SENDING", sendAttempts: 1 });
      expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
      await w.assertConsistent();
    });

    it("the provider down when the sponsor starts paying: 503, no payment recorded, the order untouched", async () => {
      const orderId = await w.freshOrder();
      w.setEnv("STANDIN_OUTAGE", "checkout");
      try {
        const r = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
        expect(r.status).toBe(503);
        /* "Try again" — the one 5xx code a client may act on — and never the detail. */
        expect(r.json.error.code).toBe("busy");
      } finally {
        w.setEnv("STANDIN_OUTAGE", undefined);
      }
      expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(0);
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect((await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"))).status).toBe(200);
    });

    it("the provider down when a card is refunded: the refund stands — books reversed — and the money waits on Finance's list", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      await events.standinConfirmPayment(pay.attemptId);
      w.setEnv("STANDIN_OUTAGE", "refund");
      try {
        const r = await w.call("POST", `/marketplace-orders/${orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
        expect(r.status, r.text).toBe(200);
      } finally {
        w.setEnv("STANDIN_OUTAGE", undefined);
      }
      expect(await prisma.refundDue.findFirstOrThrow({ where: { orderId }, select: { state: true, amountCents: true } })).toEqual({ state: "OPEN", amountCents: pay.amountCents });
      expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "refundDue.providerUnavailable" } })).toBe(1);
      await w.assertConsistent();
    });

    it("a crash in the middle of applying an event: nothing half-written, the error noted, the retry applies it — and one that never succeeds is BTG's", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.startPaying(orderId);
      const eventId = await provider("payment.succeeded", { attemptId: pay.attemptId, amountCents: pay.amountCents });
      await whileOrderRefused(orderId, async () => {
        await expect(processPaymentEvent(eventId)).rejects.toThrow(/the database refused this write/);
      });
      /* The attempt claim, the receipt, the books: none of it stayed. */
      expect((await w.attempt(pay.attemptId)).state).toBe("PROCESSING");
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "payment.confirm" } })).toBe(0);
      expect(await w.event(eventId)).toMatchObject({ status: "RECEIVED", attempts: 1, outcome: expect.stringMatching(/Try 1 failed/) });
      expect(QUEUE_POLICY["payments.event"]).toMatchObject({ retryBackoff: true });
      expect(await processPaymentEvent(eventId)).toMatchObject({ status: "APPLIED" });
      expect(await w.orderState(orderId)).toBe("PAID");
      await w.assertConsistent();

      const other = await w.freshOrder();
      const pay2 = await w.startPaying(other);
      const stuck = await provider("payment.succeeded", { attemptId: pay2.attemptId, amountCents: pay2.amountCents });
      await whileOrderRefused(other, async () => {
        for (let i = 0; i < MAX_ERRORS; i++) await expect(processPaymentEvent(stuck)).rejects.toThrow();
      });
      expect(await w.event(stuck)).toMatchObject({ status: "FAILED", outcome: expect.stringMatching(/Couldn't be applied after 6 tries/) });
      expect((await w.emails()).some((m) => m.template === "payment.heldForBtg" && m.idempotencyKey.includes(stuck))).toBe(true);
      expect(await w.orderState(other)).toBe("AWAITING_PAYMENT");
      await w.assertConsistent();
    });
  });

  describe("reward outages (the wallet pass provider does not exist yet — 2S6-INT-01)", () => {
    beforeAll(async () => {
      await prisma.campaign.create({ data: { id: "pqa_campaign", tenantId: T, sponsorId: w.E.sponsor, name: "PQA campaign", budget: 1_000_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" } as never, select: { id: true } });
    });
    const reward = async (id: string) => {
      await prisma.reward.create({ data: { id, tenantId: T, campaignId: "pqa_campaign", offerText: "Free clinic pass", terms: "t", expiresAt: new Date(Date.now() + 30 * DAY), state: "ACTIVE", redemptionCap: 5 } });
      await prisma.rewardToken.create({ data: { id: `${id}_tok`, tenantId: T, rewardId: id, token: `${id}-token-pqa-0001` }, select: { id: true } });
      return { tokenId: `${id}_tok`, token: `${id}-token-pqa-0001` };
    };

    it("image storage down while a QR is generated: the job fails with nothing recorded, the code still works, the retry stores it", async () => {
      const { handleGenerateQr } = await import("../worker/jobs/generate-qr.mts");
      const { redeemToken } = await import("../src/domain/reward");
      const t = await reward("pqa_rw_qr");
      const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
      try {
        const down = { appUrl: "https://sponsorx.test", putObject: async () => { throw new Error("R2 unavailable"); } };
        await expect(handleGenerateQr(pool, { tokenId: t.tokenId }, down)).rejects.toThrow(/R2 unavailable/);
        expect((await prisma.rewardToken.findUniqueOrThrow({ where: { id: t.tokenId }, select: { qrKey: true } })).qrKey).toBeNull();
        /* The fan's code is the token, not the picture: it redeems while the image is missing. */
        await expect(redeemToken(t.token)).resolves.toMatchObject({ type: "REDEEM" });
        const stored: string[] = [];
        const up = { appUrl: "https://sponsorx.test", putObject: async (key: string) => { stored.push(key); } };
        expect(await handleGenerateQr(pool, { tokenId: t.tokenId }, up)).toMatchObject({ generated: true });
        expect(await handleGenerateQr(pool, { tokenId: t.tokenId }, up)).toMatchObject({ generated: false, reason: "already generated" });
        expect(stored).toHaveLength(1);
      } finally {
        await pool.end();
      }
    });

    it("the database too busy when a fan claims: 503 at once, no claim written and no unit left reserved", async () => {
      const { recordClaim } = await import("../src/domain/reward");
      const t = await reward("pqa_rw_busy");
      const c = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
      await c.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SELECT 1 FROM "RewardToken" WHERE id = $1 FOR UPDATE`, [t.tokenId]);
        await expect(recordClaim(t.token)).rejects.toMatchObject({ status: 503 });
        await c.query("ROLLBACK");
      } finally {
        await c.end();
      }
      expect(await prisma.rewardEvent.count({ where: { tokenId: t.tokenId, type: "CLAIM" } })).toBe(0);
      expect((await prisma.rewardToken.findUniqueOrThrow({ where: { id: t.tokenId }, select: { reservedUntil: true } })).reservedUntil).toBeNull();
      /* The database back: the claim goes through. */
      await expect(recordClaim(t.token)).resolves.toBeTruthy();
    });
  });

  it("after every breakage, the books and the states still agree", async () => {
    await w.assertConsistent();
  });
});
