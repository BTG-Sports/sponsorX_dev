import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S5-INT-02 · Payment webhook handling with idempotency, against the real
   API and database.

   Done when: "Payment webhooks are idempotent and correctly update order and
   payment state under duplicate and out-of-order delivery."

   The provider is the stand-in; its deliveries are signed HTTP posts to
   POST /webhooks/payments/standin, exactly as a provider's would arrive. The
   worker's step (`processPaymentEvent`) and its deferred sweep are called
   directly.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pwh-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "pwh_btg";
const OTHER_T = "pwh_other_btg";

describe.skipIf(!hasDatabase)("2S5-INT-02 · payment webhooks", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "pwh", domain: "pwh-test.invalid" });
  const { prisma, events } = w;
  const { processPaymentEvent, retryDeferredPaymentEvents, DEFER_AFTER_SECONDS } = events;

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  const succeeded = (a: { attemptId: string; paymentRef?: string; amountCents: number }, id?: string) =>
    w.envelope("payment.succeeded", { attemptId: a.attemptId, paymentRef: a.paymentRef, amountCents: a.amountCents }, id);
  const rows = (providerEventId: string) => prisma.paymentEvent.count({ where: { provider: "standin", providerEventId } });
  const eventJobs = async (eventId: string) => (await w.jobs("payments.event")).filter((j) => j.eventId === eventId).length;
  const auditCount = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

  describe("a signed delivery is recorded once, and applied by the worker — never on the request path", () => {
    it("recorded RECEIVED and queued; the order is paid only when the worker applies it", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const raw = succeeded(a, "evt_pwh_first");
      const r = await w.deliver(raw);
      expect(r.status, r.text).toBe(202);
      expect(r.json).toMatchObject({ received: true, events: [{ type: "payment.succeeded", duplicate: false }] });
      const eventId = r.json.events[0].id as string;
      expect(await w.event(eventId)).toMatchObject({ status: "RECEIVED", tenantId: T });
      expect(await eventJobs(eventId)).toBe(1);
      /* Nothing moved on the request path. */
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect((await w.attempt(a.attemptId)).state).toBe("PROCESSING");

      expect(await processPaymentEvent(eventId)).toMatchObject({ status: "APPLIED", changed: true });
      expect(await w.orderState(orderId)).toBe("PAID");
      expect((await w.attempt(a.attemptId)).state).toBe("SUCCEEDED");
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { entityId: eventId, action: "paymentEvent.applied" }, select: { actorId: true, tenantId: true } });
      expect(trail).toEqual({ actorId: null, tenantId: T });
    });

    it("a duplicate delivery is a no-op: one row, one job, one payment, one receipt", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const raw = succeeded(a, "evt_pwh_dup");
      const first = await w.deliver(raw);
      const again = await w.deliver(raw);
      const third = await w.deliver(raw);
      expect([first.status, again.status, third.status]).toEqual([202, 202, 202]);
      expect(again.json.events[0]).toMatchObject({ id: first.json.events[0].id, duplicate: true });
      expect(await rows("evt_pwh_dup")).toBe(1);
      const eventId = first.json.events[0].id as string;
      expect(await eventJobs(eventId)).toBe(1);
      /* The job delivered twice (at-least-once), and two workers at once: applied once. */
      const both = await Promise.all([processPaymentEvent(eventId), processPaymentEvent(eventId)]);
      expect(both.filter((x) => x.changed)).toHaveLength(1);
      expect(await processPaymentEvent(eventId)).toMatchObject({ status: "APPLIED", changed: false });
      expect(await w.orderState(orderId)).toBe("PAID");
      expect(await auditCount("marketplaceOrder.paid", orderId)).toBe(1);
      expect(await auditCount("payment.confirm", orderId)).toBe(1);
      /* One receipt to the billing contact and one copy to the buyer (2S5-FE-05) — each once, however often delivered. */
      const receipts = (await w.emails()).filter((m) => m.template === "payment.received" && m.data.orderRef === `SX-${orderId.slice(-8).toUpperCase()}`);
      expect(receipts).toHaveLength(2);
      expect(receipts.filter((m) => m.to === "billing@sponsor-test.invalid")).toHaveLength(1);
      await w.assertConsistent();
    });

    it("a second event with a new id for a payment already confirmed is ignored — the order is paid once", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const one = await w.deliver(succeeded(a));
      const two = await w.deliver(succeeded(a));
      expect(await processPaymentEvent(one.json.events[0].id)).toMatchObject({ status: "APPLIED" });
      expect(await processPaymentEvent(two.json.events[0].id)).toMatchObject({ status: "IGNORED", outcome: expect.stringMatching(/already confirmed/) });
      expect(await auditCount("marketplaceOrder.paid", orderId)).toBe(1);
    });
  });

  describe("state moves only forward under out-of-order delivery", () => {
    it("succeeded before processing: paid; the late \"processing\" never undoes it", async () => {
      const orderId = await w.freshOrder();
      expect((await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"))).status).toBe(200);
      const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId, state: "PENDING" }, select: { id: true, amountCents: true } });
      const ok = await w.deliver(w.envelope("payment.succeeded", { attemptId: a.id, paymentRef: "pref_pwh_ooo", amountCents: a.amountCents }));
      expect(await processPaymentEvent(ok.json.events[0].id)).toMatchObject({ status: "APPLIED" });
      const late = await w.deliver(w.envelope("payment.processing", { attemptId: a.id }));
      expect(await processPaymentEvent(late.json.events[0].id)).toMatchObject({ status: "IGNORED", outcome: expect.stringMatching(/already succeeded/) });
      expect(await w.attempt(a.id)).toMatchObject({ state: "SUCCEEDED" });
      expect(await w.orderState(orderId)).toBe("PAID");
      /* The provider's reference arrived with the confirmation and is kept. */
      expect((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: a.id }, select: { providerRef: true } })).providerRef).toBe("pref_pwh_ooo");
    });

    it("a late failure after success is ignored — the order stays paid", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const ok = await w.deliver(succeeded(a));
      const fail = await w.deliver(w.envelope("payment.failed", { attemptId: a.attemptId, reason: "card_declined" }));
      /* Applied in reverse: the failure first still can't undo what follows, and the success after it is the truth only if nothing failed it. */
      expect(await processPaymentEvent(ok.json.events[0].id)).toMatchObject({ status: "APPLIED" });
      expect(await processPaymentEvent(fail.json.events[0].id)).toMatchObject({ status: "IGNORED" });
      expect(await w.attempt(a.attemptId)).toMatchObject({ state: "SUCCEEDED", failureReason: null });
      expect(await w.orderState(orderId)).toBe("PAID");
    });

    it("success after a recorded failure is HELD for BTG — the sponsor may have been charged; nothing is paid by itself", async () => {
      const orderId = await w.freshOrder();
      const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
      /* Declined on the stand-in's page — itself a signed payment.failed event, applied at once. */
      await w.call("POST", "/public/test-provider/checkout", undefined, { token: w.tokenOf(pay.json.url), outcome: "DECLINE" });
      const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, select: { id: true, amountCents: true, state: true, failureReason: true } });
      expect(a).toMatchObject({ state: "FAILED", failureReason: expect.stringMatching(/declined/) });
      expect(await prisma.paymentEvent.findFirst({ where: { providerEventId: `evt_standin_declined_${a.id}` }, select: { type: true, status: true } })).toEqual({ type: "payment.failed", status: "APPLIED" });

      const late = await w.deliver(w.envelope("payment.succeeded", { attemptId: a.id, amountCents: a.amountCents }));
      const eventId = late.json.events[0].id as string;
      expect(await processPaymentEvent(eventId)).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/recorded it as failed/) });
      expect(await w.attempt(a.id)).toMatchObject({ state: "FAILED" });
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect((await w.emails()).filter((m) => m.template === "payment.heldForBtg")).toContainEqual(expect.objectContaining({ to: `${w.id("admin")}@pwh-test.invalid`, data: expect.objectContaining({ type: "payment.succeeded" }) }));

      /* On BTG's list (admin and Finance, in their own books only) until a person closes it. */
      const list = (await w.call("GET", "/payment-events", w.id("admin"))).json;
      expect(list.events.map((e: { id: string }) => e.id)).toContain(eventId);
      expect(list.waitingOnBtg).toBeGreaterThanOrEqual(1);
      expect((await w.call("GET", "/payment-events", w.id("finance"))).json.events.map((e: { id: string }) => e.id)).toContain(eventId);
      expect((await w.call("GET", "/payment-events", w.id("other_admin"))).json.events.map((e: { id: string }) => e.id)).not.toContain(eventId);
      for (const who of [w.id("buyer"), w.id("riley")]) expect((await w.call("GET", "/payment-events", who)).status, who).toBe(403);
      expect((await w.call("POST", `/payment-events/${eventId}/resolve`, w.id("finance"), { note: "x" })).status).toBe(403);
      expect((await w.call("POST", `/payment-events/${eventId}/resolve`, w.id("other_admin"), { note: "x" })).status).toBe(404);
      const closed = await w.call("POST", `/payment-events/${eventId}/resolve`, w.id("admin"), { note: "Provider confirms the charge was reversed; nothing taken." });
      expect(closed.status, closed.text).toBe(200);
      expect(closed.json).toMatchObject({ status: "HELD", resolvedBy: w.id("admin") });
      expect((await w.call("POST", `/payment-events/${eventId}/resolve`, w.id("admin"), { note: "again" })).status).toBe(409);
      expect((await w.call("GET", "/payment-events", w.id("admin"))).json.events.map((e: { id: string }) => e.id)).not.toContain(eventId);
    });

    it("an event that arrives before SponsorX has recorded the payment waits, and is applied when the payment appears", async () => {
      const orderId = await w.freshOrder();
      const r = await w.deliver(w.envelope("payment.succeeded", { paymentRef: "pref_pwh_early", amountCents: 50_000 }));
      const eventId = r.json.events[0].id as string;
      const now = new Date();
      expect(await processPaymentEvent(eventId, now)).toMatchObject({ status: "DEFERRED" });
      const ev = await w.event(eventId);
      expect(ev.nextAttemptAt?.getTime()).toBe(now.getTime() + DEFER_AFTER_SECONDS[0] * 1000);
      /* The sweep leaves it until it is due. */
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 1000), { tenantIds: [T] })).toMatchObject({ retried: 0 });
      /* Our own record lands: the sponsor's attempt, with the provider's reference. */
      expect((await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"))).status).toBe(200);
      await prisma.paymentAttempt.updateMany({ where: { orderId, state: "PENDING" }, data: { providerRef: "pref_pwh_early" } });
      const total = (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { totalCents: true } })).totalCents;
      expect(total).toBe(50_000);
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 31_000), { tenantIds: [T] })).toMatchObject({ retried: 1, applied: 1 });
      expect(await w.orderState(orderId)).toBe("PAID");
      expect(await w.event(eventId)).toMatchObject({ status: "APPLIED", nextAttemptAt: null });
    });

    it("one that never matches is BTG's after the last back-off", async () => {
      const r = await w.deliver(w.envelope("payment.succeeded", { paymentRef: "pref_pwh_nowhere", amountCents: 1234 }));
      const eventId = r.json.events[0].id as string;
      let when = new Date();
      for (let i = 0; i < DEFER_AFTER_SECONDS.length; i++) {
        expect((await processPaymentEvent(eventId, when)).status).toBe("DEFERRED");
        when = new Date(when.getTime() + DEFER_AFTER_SECONDS[i]! * 1000);
      }
      expect(await processPaymentEvent(eventId, when)).toMatchObject({ status: "FAILED", outcome: expect.stringMatching(/gave up after 7 tries/) });
      expect((await w.emails()).some((m) => m.template === "payment.heldForBtg" && m.idempotencyKey.includes(eventId))).toBe(true);
    });

    it("a confirmed amount that isn't the payment's is HELD; the order is not paid", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const r = await w.deliver(succeeded({ ...a, amountCents: a.amountCents - 1 }));
      expect(await processPaymentEvent(r.json.events[0].id)).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/\$499\.99.*\$500\.00/) });
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect((await w.attempt(a.attemptId)).state).toBe("PROCESSING");
      await w.assertConsistent();
    });
  });

  describe("only the provider's signed, fresh word is recorded", () => {
    it("a bad signature, a missing one, or a body altered after signing: 401, recorded as REJECTED, nothing queued", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const raw = succeeded(a, "evt_pwh_forged");
      const forged = await w.deliver(raw, { secret: "not-the-secret" });
      const unsigned = await w.deliver(raw, { signature: null });
      const garbage = await w.deliver(raw, { signature: "t=abc,v1=" });
      const t = Math.floor(Date.now() / 1000);
      const { createHmac } = await import("node:crypto");
      const signedOther = `t=${t},v1=${createHmac("sha256", w.env.STANDIN_PROVIDER_SECRET).update(`${t}.${raw.replace("50000", "1")}`).digest("hex")}`;
      const altered = await w.deliver(raw, { signature: signedOther });
      expect([forged.status, unsigned.status, garbage.status, altered.status]).toEqual([401, 401, 401, 401]);
      expect(await rows("evt_pwh_forged")).toBe(0);
      const rejected = await prisma.webhookDelivery.findMany({ where: { source: "payments:standin", status: "REJECTED", receivedAt: { gte: new Date(Date.now() - 60_000) } }, select: { error: true, signatureOk: true } });
      expect(rejected.map((x) => x.error)).toEqual(expect.arrayContaining(["signature did not verify", "no signature", "malformed signature"]));
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
    });

    it("mid-rotation, the previous secret is still accepted (2S8-SEC-02)", async () => {
      const current = w.env.STANDIN_PROVIDER_SECRET;
      w.setEnv("STANDIN_PROVIDER_SECRET", "pwh-new-secret");
      w.setEnv("STANDIN_PROVIDER_SECRET_PREVIOUS", current);
      try {
        const orderId = await w.freshOrder();
        const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
        const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, select: { id: true, amountCents: true } });
        expect(pay.status).toBe(200);
        expect((await w.deliver(w.envelope("payment.processing", { attemptId: a.id }), { secret: current })).status).toBe(202);
        expect((await w.deliver(w.envelope("payment.processing", { attemptId: a.id }), { secret: "pwh-new-secret" })).status).toBe(202);
        expect((await w.deliver(w.envelope("payment.processing", { attemptId: a.id }), { secret: "pwh-retired" })).status).toBe(401);
      } finally {
        w.setEnv("STANDIN_PROVIDER_SECRET", current);
        w.setEnv("STANDIN_PROVIDER_SECRET_PREVIOUS", undefined);
      }
    });

    it("a replay: correctly signed but stale is refused; resent inside the window it is a duplicate — a no-op either way", async () => {
      const orderId = await w.freshOrder();
      const a = await w.startPaying(orderId);
      const raw = succeeded(a, "evt_pwh_replay");
      const first = await w.deliver(raw);
      expect(first.status).toBe(202);
      expect(await processPaymentEvent(first.json.events[0].id)).toMatchObject({ status: "APPLIED" });
      /* The same bytes, captured and replayed ten minutes later with their original signature. */
      const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
      const stale = await w.deliver(raw, { at: tenMinutesAgo });
      expect(stale.status).toBe(401);
      expect((await prisma.webhookDelivery.findFirst({ where: { source: "payments:standin", error: { contains: "replay" } }, select: { id: true } }))).not.toBeNull();
      /* …and a signature dated in the future is no better. */
      expect((await w.deliver(raw, { at: new Date(Date.now() + 10 * 60_000) })).status).toBe(401);
      /* Resent fresh: recorded already, so nothing happens again. */
      const resent = await w.deliver(raw);
      expect(resent.json.events[0]).toMatchObject({ duplicate: true });
      expect(await rows("evt_pwh_replay")).toBe(1);
      expect(await auditCount("marketplaceOrder.paid", orderId)).toBe(1);
    });

    it("a provider not connected here is 404; a signed body that isn't one of its events is 400", async () => {
      expect((await w.deliver(w.envelope("payment.processing", { attemptId: "x" }), { provider: "stripe" })).status).toBe(404);
      w.setEnv("PAYMENT_PROVIDER", "none");
      try {
        expect((await w.deliver(w.envelope("payment.processing", { attemptId: "x" }))).status).toBe(404);
      } finally {
        w.setEnv("PAYMENT_PROVIDER", "standin");
      }
      expect((await w.deliver(JSON.stringify({ id: "evt_pwh_bad", type: "charge.captured", created: new Date().toISOString(), data: {} }))).status).toBe(400);
      expect((await w.deliver(w.envelope("payment.succeeded", { attemptId: "x" }))).status).toBe(400); // no amount
      expect((await w.deliver("not json")).status).toBe(400);
      expect(await rows("evt_pwh_bad")).toBe(0);
    });
  });

  it("the books and the states agree after all of it", async () => {
    await w.assertConsistent();
  });
});
