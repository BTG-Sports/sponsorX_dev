import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeStripe, stripeEvent, stripeSignature, thinEvent } from "./support/fake-stripe";

/* --------------------------------------------------------------------------
   2S5-INT-01 · Payment provider checkout integration, and
   2S5-INT-03 · Connected payout account onboarding — with Stripe, against
   the real API and database. Stripe itself is never called: the real SDK
   talks to a fake HTTP client (support/fake-stripe.ts), and Stripe's
   webhooks are signed by the SDK's own test-header helper and POSTed to
   /webhooks/payments/stripe, exactly as Stripe would.

   Done when (INT-01): "Sponsor can pay through the provider and the order
   reflects the result."
   Done when (INT-03): "A property can complete payout onboarding and
   SponsorX reflects its readiness status."

   Also: duplicates and reordering through the existing machinery (one event
   per Stripe event id, forward-only states, deferral), a payout as a
   transfer, a refund sent by the worker, a dispute.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sxs-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "sxs_btg";
const OTHER_T = "sxs_other_btg";
const SECRET = "whsec_sxs_platform";
const OLD_SECRET = "whsec_sxs_old";
const CONNECT_SECRET = "whsec_sxs_connect";
const THIN_SECRET = "whsec_sxs_thin";

describe.skipIf(!hasDatabase)("2S5-INT-01 / 2S5-INT-03 · Stripe: checkout, payout accounts, payouts, refunds", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "sxs", domain: "sxs-test.invalid" });
  const { prisma, events } = w;
  const { processPaymentEvent, retryDeferredPaymentEvents } = events;
  const { sendPayout, sweepPayoutRetries } = await import("../src/domain/payouts");
  const { sendRefund } = await import("../src/domain/refunds");
  const { useStripeHttpClient } = await import("../src/lib/stripe");
  const fake = fakeStripe("sxs");

  beforeAll(async () => {
    await w.setup(); // Riley's payout account READY at the stand-in, as on staging before Stripe
    w.setEnv("PAYMENT_PROVIDER", "stripe");
    w.setEnv("STRIPE_SECRET_KEY", "sk_test_x");
    w.setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    w.setEnv("STRIPE_WEBHOOK_SECRET_PREVIOUS", OLD_SECRET);
    w.setEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT_SECRET);
    w.setEnv("STRIPE_THIN_WEBHOOK_SECRET", THIN_SECRET);
    w.setEnv("APP_URL", "https://app.sxs.test");
    useStripeHttpClient(fake.http);
  });
  afterAll(async () => {
    useStripeHttpClient(null);
    await w.teardown();
  });

  let n = 0;
  const uniq = (p: string) => `${p}_sxs${++n}${Date.now().toString(36)}`;
  /** Stripe POSTs this event to the webhook, signed with `secret`. */
  const post = (type: string, object: Record<string, unknown>, o: { id?: string; account?: string; secret?: string; at?: Date; thin?: { type: string; acct: string } } = {}) => {
    const raw = o.thin ? thinEvent(o.thin.type, o.thin.acct, { id: o.id ?? uniq("evt_test") }) : stripeEvent(type, object, { id: o.id ?? uniq("evt"), account: o.account });
    return w.deliver(raw, { provider: "stripe", signature: stripeSignature(raw, o.secret ?? (o.thin ? THIN_SECRET : SECRET), o.at) });
  };
  /** Delivered and applied by the worker. */
  const apply = async (type: string, object: Record<string, unknown>, o: { id?: string; account?: string; secret?: string; thin?: { type: string; acct: string } } = {}) => {
    const r = await post(type, object, o);
    expect(r.status, r.text).toBe(202);
    expect(r.json.events.length, `${type} maps to an event`).toBeGreaterThan(0);
    const results = [];
    for (const e of r.json.events as Array<{ id: string }>) results.push({ eventId: e.id, ...(await processPaymentEvent(e.id)) });
    return results[0]!;
  };

  /** A thin (v2) event about a payee's account, from the event destination, applied by the worker. */
  const applyThin = (type: string, acct: string) => apply("", {}, { thin: { type, acct } });

  /** The sponsor presses "Pay by card": the API answers with Stripe's hosted page. */
  async function startPaying(orderId: string) {
    const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
    expect(pay.status, pay.text).toBe(200);
    const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true, state: true, provider: true, amountCents: true } });
    return { url: pay.json.url as string, attemptId: a.id, amountCents: a.amountCents, state: a.state, provider: a.provider };
  }
  const session = (a: { attemptId: string; amountCents: number }, orderId: string, pi: string, extra: Record<string, unknown> = {}) => ({
    id: uniq("cs_test"), object: "checkout.session", mode: "payment", payment_status: "paid", status: "complete",
    payment_intent: pi, amount_total: a.amountCents, currency: "usd", client_reference_id: a.attemptId, metadata: { attemptId: a.attemptId, orderId }, ...extra,
  });
  /** An order paid on Stripe's page: Checkout completed, the webhook applied. */
  async function paidOrder() {
    const orderId = await w.freshOrder();
    const a = await startPaying(orderId);
    const pi = uniq("pi");
    expect(await apply("checkout.session.completed", session(a, orderId, pi))).toMatchObject({ status: "APPLIED" });
    return { orderId, ...a, pi };
  }
  const account = (id: string, ready: boolean, extra: Record<string, unknown> = {}) => ({
    id, object: "account", charges_enabled: false, payouts_enabled: ready, details_submitted: ready,
    capabilities: { transfers: ready ? "active" : "inactive" },
    requirements: { currently_due: ready ? [] : ["external_account"], past_due: [], disabled_reason: ready ? null : "requirements.past_due" }, ...extra,
  });
  const payoutRow = (id: string) => prisma.payout.findUniqueOrThrow({ where: { id }, select: { state: true, providerRef: true, provider: true, sendAttempts: true, waitingOn: true, failureKind: true, failureReason: true } });

  describe("2S5-INT-01 · the sponsor pays on Stripe's hosted Checkout, and the order reflects it", () => {
    it("Pay by card answers with Stripe's page; the Checkout Session carries the attempt; card data never touches SponsorX", async () => {
      const orderId = await w.freshOrder();
      fake.reset();
      const a = await startPaying(orderId);
      expect(a.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(a).toMatchObject({ state: "PENDING", provider: "stripe" });
      const [req] = fake.to("/v1/checkout/sessions");
      expect(req!.idempotencyKey).toBe(`checkout:${a.attemptId}`);
      expect(Object.fromEntries(req!.params)).toMatchObject({
        "metadata[attemptId]": a.attemptId, "metadata[orderId]": orderId, "payment_intent_data[metadata][attemptId]": a.attemptId,
        "line_items[0][price_data][unit_amount]": String(a.amountCents), success_url: `https://app.sxs.test/sponsor/orders/${orderId}?payment=returned`,
      });
      /* Nothing card-shaped was ever sent or stored: only amounts, ids and URLs. */
      expect([...req!.params.keys()].some((k) => /card|number|cvc|exp_/.test(k))).toBe(false);
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect((await w.call("GET", `/marketplace-orders/${orderId}/payment`, w.id("buyer"))).json).toMatchObject({ provider: "stripe", canPay: true, testProvider: false });
    });

    it("checkout.session.completed (paid) marks the order PAID — recorded once, applied by the worker, never on the request path", async () => {
      const orderId = await w.freshOrder();
      const a = await startPaying(orderId);
      const pi = uniq("pi");
      const r = await post("checkout.session.completed", session(a, orderId, pi), { id: uniq("evt") });
      expect(r.status, r.text).toBe(202);
      expect(r.json).toMatchObject({ received: true, events: [{ type: "payment.succeeded", duplicate: false }] });
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT"); // nothing moved yet
      expect(await processPaymentEvent(r.json.events[0].id)).toMatchObject({ status: "APPLIED", changed: true });
      expect(await w.orderState(orderId)).toBe("PAID");
      expect(await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: a.attemptId }, select: { state: true, providerRef: true } })).toEqual({ state: "SUCCEEDED", providerRef: pi });
      expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { paidVia: true, paymentReference: true } })).toEqual({ paidVia: "CARD", paymentReference: pi });
      expect((await w.call("GET", `/marketplace-orders/${orderId}/payment`, w.id("buyer"))).json.latest).toMatchObject({ state: "SUCCEEDED" });
      await w.assertConsistent();
    });

    it("duplicates and reordering: the same Stripe event twice is one; a late expiry or failure never undoes paid", async () => {
      const orderId = await w.freshOrder();
      const a = await startPaying(orderId);
      const pi = uniq("pi");
      const evt = uniq("evt");
      const first = await post("checkout.session.completed", session(a, orderId, pi), { id: evt });
      const again = await post("checkout.session.completed", session(a, orderId, pi), { id: evt });
      expect(again.json.events[0]).toMatchObject({ id: first.json.events[0].id, duplicate: true });
      expect(await prisma.paymentEvent.count({ where: { provider: "stripe", providerEventId: evt } })).toBe(1);
      await processPaymentEvent(first.json.events[0].id);
      expect(await w.orderState(orderId)).toBe("PAID");
      /* Stripe resends the same news under a new event id: confirmed already. */
      expect(await apply("checkout.session.async_payment_succeeded", session(a, orderId, pi))).toMatchObject({ status: "IGNORED" });
      /* Out of order: the session's expiry arrives after it was paid. */
      expect(await apply("checkout.session.expired", session(a, orderId, pi, { payment_status: "unpaid", status: "expired" }))).toMatchObject({ status: "IGNORED" });
      expect(await w.orderState(orderId)).toBe("PAID");
      await w.assertConsistent();
    });

    it("an abandoned page expires: the attempt fails, nothing is charged, and the sponsor can pay again", async () => {
      const orderId = await w.freshOrder();
      const a = await startPaying(orderId);
      expect(await apply("checkout.session.expired", session(a, orderId, "", { payment_intent: null, payment_status: "unpaid", status: "expired" }))).toMatchObject({ status: "APPLIED" });
      expect(await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: a.attemptId }, select: { state: true, failureReason: true } })).toMatchObject({ state: "FAILED", failureReason: expect.stringMatching(/expired/) });
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      const b = await startPaying(orderId);
      expect(b.attemptId).not.toBe(a.attemptId);
      expect(await apply("checkout.session.completed", session(b, orderId, uniq("pi")))).toMatchObject({ status: "APPLIED" });
      expect(await w.orderState(orderId)).toBe("PAID");
    });

    it("an asynchronous method: completed-but-unpaid is processing (a second pay is refused); then succeeded", async () => {
      const orderId = await w.freshOrder();
      const a = await startPaying(orderId);
      const pi = uniq("pi");
      expect(await apply("checkout.session.completed", session(a, orderId, pi, { payment_status: "unpaid" }))).toMatchObject({ status: "APPLIED" });
      expect((await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: a.attemptId }, select: { state: true } })).state).toBe("PROCESSING");
      expect((await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"))).status).toBe(409);
      expect(await apply("checkout.session.async_payment_succeeded", session(a, orderId, pi))).toMatchObject({ status: "APPLIED" });
      expect(await w.orderState(orderId)).toBe("PAID");
    });

    it("signatures: a wrong secret and a stale delivery are refused (401) and recorded; the previous secret is accepted mid-rotation", async () => {
      const orderId = await w.freshOrder();
      const a = await startPaying(orderId);
      const bad = await post("checkout.session.completed", session(a, orderId, uniq("pi")), { secret: "whsec_sxs_guess" });
      expect(bad.status).toBe(401);
      const stale = await post("checkout.session.completed", session(a, orderId, uniq("pi")), { at: new Date(Date.now() - 3_600_000) });
      expect(stale.status).toBe(401);
      expect(await prisma.webhookDelivery.count({ where: { source: "payments:stripe", status: "REJECTED", error: { contains: "replay" } } })).toBeGreaterThanOrEqual(1);
      expect(await w.orderState(orderId)).toBe("AWAITING_PAYMENT");
      expect(await apply("checkout.session.completed", session(a, orderId, uniq("pi")), { secret: OLD_SECRET })).toMatchObject({ status: "APPLIED" });
      expect(await w.orderState(orderId)).toBe("PAID");
    });

    it("Stripe's webhook is refused while Stripe isn't the provider here", async () => {
      w.setEnv("PAYMENT_PROVIDER", "standin");
      try {
        expect((await post("checkout.session.expired", { id: "cs_x", metadata: { attemptId: "pa_x" } })).status).toBe(404);
      } finally {
        w.setEnv("PAYMENT_PROVIDER", "stripe");
      }
    });

    it("Stripe down when the sponsor presses pay: 503, no attempt recorded, the order untouched", async () => {
      const orderId = await w.freshOrder();
      fake.fail("/v1/checkout/sessions", 500, { type: "api_error", message: "Stripe is having a moment." });
      const pay = await w.call("POST", `/marketplace-orders/${orderId}/pay`, w.id("buyer"));
      expect(pay.status, pay.text).toBe(503);
      expect(pay.json).toMatchObject({ error: { code: "busy" } });
      expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(0);
    });
  });

  describe("2S5-INT-03 · a property completes payout onboarding on Stripe, and SponsorX reflects its readiness", () => {
    it("the property manager is sent to Stripe's hosted onboarding; Stripe's thin events move NOT_SET_UP → NEEDS_INFO → READY", async () => {
      const mgr = w.id("mgr");
      expect((await w.call("GET", "/payouts/account", mgr)).json).toMatchObject({ status: "NOT_SET_UP", provider: "stripe", canSetUp: true, testProvider: false });
      fake.reset();
      const link = await w.call("POST", "/payouts/account/link", mgr, { returnPath: "/property/earnings" });
      expect(link.status, link.text).toBe(200);
      expect(link.json.url).toMatch(/^https:\/\/connect\.stripe\.com\/setup\//);
      const [created] = fake.to("/v2/core/accounts");
      expect(created!.idempotencyKey).toBe(`account:PROPERTY:${w.E.property}`);
      expect(created!.json).toMatchObject({
        dashboard: "express", contact_email: `${mgr}@sxs-test.invalid`,
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        metadata: { payeeType: "PROPERTY", payeeId: w.E.property },
      });
      expect(fake.to("/v2/core/account_links")[0]!.json).toMatchObject({ use_case: { type: "account_onboarding", account_onboarding: { return_url: "https://app.sxs.test/property/earnings", refresh_url: "https://app.sxs.test/property/earnings" } } });
      /* SponsorX stores the account id and its status — nothing else. */
      const row = await prisma.payoutAccount.findUniqueOrThrow({ where: { payeeType_payeeId: { payeeType: "PROPERTY", payeeId: w.E.property } }, select: { provider: true, status: true, providerAccountId: true } });
      expect(row).toMatchObject({ provider: "stripe", status: "NOT_SET_UP", providerAccountId: expect.stringMatching(/^acct_/) });
      const { Prisma } = await import("../src/generated/prisma/client");
      expect(Object.keys(Prisma.PayoutAccountScalarFieldEnum).sort()).toEqual(["changedAt", "createdAt", "id", "payeeId", "payeeType", "provider", "providerAccountId", "status", "tenantId", "updatedAt"]);
      const acct = row.providerAccountId!;

      /* Starting again before finishing reuses the same account. */
      const again = await w.call("POST", "/payouts/account/link", mgr, { returnPath: "/property/earnings" });
      expect(again.status).toBe(200);
      expect(fake.to("/v2/core/accounts")).toHaveLength(1);

      /* The manager gives details on Stripe; Stripe says (thin events) the account changed — the worker reads it. */
      fake.setAccount(acct, "needs_info");
      expect(await applyThin("v2.core.account[requirements].updated", acct)).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/external_account/) });
      expect((await w.call("GET", "/payouts/account", mgr)).json.status).toBe("NEEDS_INFO");
      fake.setAccount(acct, "ready");
      expect(await applyThin("v2.core.account[configuration.recipient].capability_status_updated", acct)).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/ready to be paid/) });
      expect((await w.call("GET", "/payouts/account", mgr)).json).toMatchObject({ status: "READY", provider: "stripe" });
      /* More thin events, any order, the same truth: nothing changes. */
      expect(await applyThin("v2.core.account[identity].updated", acct)).toMatchObject({ status: "IGNORED" });
      expect(await applyThin("v2.core.account[requirements].updated", acct)).toMatchObject({ status: "IGNORED" });
      /* Once ready, "manage" goes to the Express dashboard. */
      fake.reset();
      expect((await w.call("POST", "/payouts/account/link", mgr, { returnPath: "/property/earnings" })).json.url).toMatch(/^https:\/\/connect\.stripe\.com\/express\//);
    });

    it("an account Stripe hasn't told SponsorX about yet waits; one Stripe rejected is recorded and held for BTG; Stripe down while reading is retried", async () => {
      /* SponsorX's own account (tagged), its row not committed yet: wait for it. */
      const early = uniq("acct");
      fake.setAccount(early, "new", { sponsorx: "payout-account" });
      expect(await applyThin("v2.core.account.updated", early)).toMatchObject({ status: "DEFERRED" });
      /* Another account on BTG's Stripe (no SponsorX tag), or one Stripe doesn't have: not ours — acknowledged, never chased. */
      const foreign = uniq("acct");
      fake.setAccount(foreign, "new", {});
      expect(await applyThin("v2.core.account.updated", foreign)).toMatchObject({ status: "IGNORED", outcome: expect.stringMatching(/Not a SponsorX payout account/) });
      expect(await applyThin("v2.core.account.updated", uniq("acct"))).toMatchObject({ status: "IGNORED" });
      const row = await prisma.payoutAccount.findUniqueOrThrow({ where: { payeeType_payeeId: { payeeType: "PROPERTY", payeeId: w.E.property } }, select: { providerAccountId: true } });
      const acct = row.providerAccountId!;
      fake.setAccount(acct, "rejected");
      const rejected = await applyThin("v2.core.account[configuration.recipient].capability_status_updated", acct);
      expect(rejected).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/rejected/) });
      expect((await w.call("GET", "/payouts/account", w.id("mgr"))).json.status).toBe("NEEDS_INFO");
      /* A v1 snapshot account.updated (a v1 account) still maps, status and all. */
      expect(await apply("account.updated", account(acct, true), { account: acct, secret: CONNECT_SECRET })).toMatchObject({ status: "APPLIED" });
      expect((await w.call("GET", "/payouts/account", w.id("mgr"))).json.status).toBe("READY");
      /* Stripe down when the worker reads the account: nothing written, the queue retries it. */
      fake.fail(`/v2/core/accounts/${acct}`, 500, { type: "api_error", message: "down" });
      const r = await post("", {}, { thin: { type: "v2.core.account.updated", acct } });
      expect(r.status, r.text).toBe(202);
      await expect(processPaymentEvent(r.json.events[0].id)).rejects.toMatchObject({ code: "busy" });
      expect((await w.event(r.json.events[0].id)).status).toBe("RECEIVED");
      expect((await w.call("GET", "/payouts/account", w.id("mgr"))).json.status).toBe("READY");
    });
  });

  describe("a payout is a transfer to the payee's connected account", () => {
    it("Riley moves from the stand-in to Stripe, is paid by transfer (key and metadata), and transfer.created marks it PAID", async () => {
      fake.reset();
      const link = await w.call("POST", "/payouts/account/link", w.id("riley"), { returnPath: "/athlete" });
      expect(link.status, link.text).toBe(200);
      const row = await prisma.payoutAccount.findUniqueOrThrow({ where: { payeeType_payeeId: { payeeType: "ATHLETE", payeeId: w.E.riley } }, select: { provider: true, providerAccountId: true, status: true, changedAt: true } });
      /* Its stand-in account doesn't carry over: a new Stripe account, not yet set up — and a change (the review window). */
      expect(row).toMatchObject({ provider: "stripe", status: "NOT_SET_UP", providerAccountId: expect.stringMatching(/^acct_/), changedAt: expect.any(Date) });
      const acct = row.providerAccountId!;
      fake.setAccount(acct, "ready");
      expect(await applyThin("v2.core.account[configuration.recipient].capability_status_updated", acct)).toMatchObject({ status: "APPLIED" });

      const o = await paidOrder();
      await w.deliverOrder(o.orderId);
      const requested = await w.call("POST", "/payouts", w.id("riley"));
      expect(requested.status, requested.text).toBe(201);
      let p = requested.json.payouts[0] as { id: string; state: string; amountCents: number };
      if (p.state === "REQUESTED") {
        /* The account changed this week: BTG approves it by hand (2S5-BE-06). */
        const d = await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" });
        expect(d.status, d.text).toBe(200);
        p = d.json;
      }
      expect(p.state).toBe("APPROVED");

      /* Stripe refuses the first hand-over (BTG's balance still settling): a temporary failure, retried by the sweep. */
      fake.reset();
      fake.fail("/v1/transfers", 400, { type: "invalid_request_error", code: "balance_insufficient", message: "You have insufficient available funds in your Stripe account." });
      expect(await sendPayout(p.id)).toEqual({ sent: false, refused: true });
      expect(await payoutRow(p.id)).toMatchObject({ state: "FAILED", failureKind: "TEMPORARY", waitingOn: "SYSTEM_RETRY", sendAttempts: 1, failureReason: expect.stringMatching(/insufficient available funds/) });
      expect(await sweepPayoutRetries(new Date(Date.now() + 2 * 3_600_000), { tenantIds: [T] })).toMatchObject({ retried: 1 });

      fake.reset();
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      const [transfer] = fake.to("/v1/transfers");
      expect(transfer!.idempotencyKey).toBe(`transfer:${p.id}:2`);
      expect(Object.fromEntries(transfer!.params)).toMatchObject({ amount: String(p.amountCents), currency: "usd", destination: acct, transfer_group: `payout_${p.id}`, "metadata[payoutId]": p.id, "metadata[handOver]": `${p.id}:2` });
      const sent = await payoutRow(p.id);
      expect(sent).toMatchObject({ state: "SENDING", provider: "stripe", providerRef: expect.stringMatching(/^tr_/), sendAttempts: 2 });

      const transferObj = { id: sent.providerRef, object: "transfer", amount: p.amountCents, amount_reversed: 0, destination: acct, metadata: { payoutId: p.id, handOver: `${p.id}:2` } };
      expect(await apply("transfer.created", transferObj)).toMatchObject({ status: "APPLIED" });
      expect((await payoutRow(p.id)).state).toBe("PAID");
      /* Said again: nothing more. */
      expect(await apply("transfer.created", transferObj)).toMatchObject({ status: "IGNORED" });
      await w.assertConsistent();
    });

    it("a transfer.created that beats SponsorX's own commit waits, then applies", async () => {
      const o = await paidOrder();
      await w.deliverOrder(o.orderId);
      const r = await w.call("POST", "/payouts", w.id("riley"));
      let p = r.json.payouts[0] as { id: string; state: string; amountCents: number };
      if (p.state === "REQUESTED") p = (await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" })).json;
      const early = await apply("transfer.created", { id: uniq("tr"), object: "transfer", amount: p.amountCents, amount_reversed: 0, metadata: { payoutId: p.id } });
      expect(early).toMatchObject({ status: "DEFERRED" });
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      const ref = (await payoutRow(p.id)).providerRef!;
      /* The early event named another transfer id (it is a made-up one here), so it is now stale — the real one applies. */
      expect(await apply("transfer.created", { id: ref, object: "transfer", amount: p.amountCents, amount_reversed: 0, metadata: { payoutId: p.id } })).toMatchObject({ status: "APPLIED" });
      expect(await retryDeferredPaymentEvents(new Date(Date.now() + 3_600_000), { tenantIds: [T] })).toMatchObject({ retried: expect.any(Number) });
      expect((await payoutRow(p.id)).state).toBe("PAID");
    });
  });

  describe("a refund is sent to the card by the worker, and Stripe's webhook confirms it", () => {
    it("BTG refunds a card-paid order: queued (no Stripe call on the request path), sent by the worker with its key, confirmed — even if the webhook beats the worker", async () => {
      const o = await paidOrder();
      fake.reset();
      const r = await w.call("POST", `/marketplace-orders/${o.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      expect(r.status, r.text).toBe(200);
      expect(fake.seen).toHaveLength(0);
      const due = await prisma.refundDue.findFirstOrThrow({ where: { orderId: o.orderId }, select: { id: true, state: true, provider: true, amountCents: true } });
      expect(due).toMatchObject({ state: "OPEN", provider: "stripe" });
      expect((await w.jobs("refunds.send")).filter((j) => j.refundDueId === due.id)).toHaveLength(1);

      /* Stripe made the refund and its webhook arrives before the worker has written the reference. */
      const reId = uniq("re");
      fake.refunds.push({ id: reId, object: "refund", amount: due.amountCents, payment_intent: o.pi, status: "succeeded", metadata: { refundDueId: due.id, orderId: o.orderId, attemptId: o.attemptId } });
      const refundObj = { id: reId, object: "refund", amount: due.amountCents, payment_intent: o.pi, status: "succeeded", metadata: { refundDueId: due.id, orderId: o.orderId, attemptId: o.attemptId } };
      expect(await apply("refund.created", refundObj)).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/confirmed SponsorX's refund/) });

      /* The worker: Stripe already has it for this refund — reused, never made twice. */
      expect(await sendRefund(due.id)).toEqual({ sent: true });
      expect(fake.to("/v1/refunds")).toHaveLength(0);
      expect(await prisma.refundDue.findUniqueOrThrow({ where: { id: due.id }, select: { state: true, reference: true, method: true, provider: true } })).toEqual({ state: "SENT", reference: reId, method: "CARD", provider: "stripe" });
      expect(await sendRefund(due.id)).toEqual({ sent: false }); // a second job finds it sent
      /* charge.refunded with the same refund: recorded already. */
      expect(await apply("charge.refunded", { id: uniq("ch"), payment_intent: o.pi, amount_refunded: due.amountCents, refunds: { data: [refundObj] } })).toMatchObject({ status: "IGNORED" });
      expect(await w.attempt(o.attemptId)).toMatchObject({ state: "REFUNDED", refundedCents: due.amountCents });
      await w.assertConsistent();
    });

    it("the worker's own refund: key refund:<id>, SponsorX's ids in metadata; Stripe refusing hands it back to Finance", async () => {
      const o = await paidOrder();
      await w.call("POST", `/marketplace-orders/${o.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      const due = await prisma.refundDue.findFirstOrThrow({ where: { orderId: o.orderId }, select: { id: true, amountCents: true } });
      fake.reset();
      expect(await sendRefund(due.id)).toEqual({ sent: true });
      const [req] = fake.to("/v1/refunds");
      expect(req!.idempotencyKey).toBe(`refund:${due.id}`);
      expect(Object.fromEntries(req!.params)).toMatchObject({ payment_intent: o.pi, amount: String(due.amountCents), "metadata[refundDueId]": due.id, "metadata[orderId]": o.orderId, "metadata[attemptId]": o.attemptId });

      const o2 = await paidOrder();
      await w.call("POST", `/marketplace-orders/${o2.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      const due2 = await prisma.refundDue.findFirstOrThrow({ where: { orderId: o2.orderId }, select: { id: true } });
      fake.fail("/v1/refunds", 400, { type: "invalid_request_error", code: "charge_already_refunded", message: "Charge has already been refunded." });
      expect(await sendRefund(due2.id)).toEqual({ sent: false, refused: true });
      expect(await prisma.refundDue.findUniqueOrThrow({ where: { id: due2.id }, select: { state: true, provider: true } })).toEqual({ state: "OPEN", provider: null });
      expect((await w.emails()).some((m) => m.template === "refund.providerRefused" && m.data.why.includes("already been refunded"))).toBe(true);
      /* Stripe down instead: thrown for the queue to retry; nothing written. */
      const o3 = await paidOrder();
      await w.call("POST", `/marketplace-orders/${o3.orderId}/transition`, w.id("admin"), { to: "REFUNDED" });
      const due3 = await prisma.refundDue.findFirstOrThrow({ where: { orderId: o3.orderId }, select: { id: true } });
      fake.fail("/v1/refunds", 500, { type: "api_error", message: "down" });
      await expect(sendRefund(due3.id)).rejects.toMatchObject({ code: "busy" });
      expect(await prisma.refundDue.findUniqueOrThrow({ where: { id: due3.id }, select: { state: true, provider: true } })).toEqual({ state: "OPEN", provider: "stripe" });
    });
  });

  describe("disputes and notices", () => {
    it("charge.dispute.created freezes the order's money; charge.dispute.closed records Stripe's outcome for BTG", async () => {
      const o = await paidOrder();
      const dispute = { id: uniq("dp"), object: "dispute", amount: o.amountCents, payment_intent: o.pi, reason: "fraudulent" };
      expect(await apply("charge.dispute.created", { ...dispute, status: "needs_response" })).toMatchObject({ status: "APPLIED" });
      expect(await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: o.orderId }, select: { state: true, providerDisputeRef: true, provider: true } })).toEqual({ state: "OPEN", providerDisputeRef: dispute.id, provider: "stripe" });
      const closed = await apply("charge.dispute.closed", { ...dispute, status: "won" });
      expect(closed.status).toMatch(/APPLIED|IGNORED/);
      expect(await prisma.paymentEvent.findUniqueOrThrow({ where: { id: closed.eventId }, select: { type: true } })).toEqual({ type: "dispute.closed" });
    });

    it("a refund Stripe couldn't complete is a notice HELD for BTG, never applied by itself", async () => {
      const notice = await apply("refund.failed", { id: uniq("re"), object: "refund", amount: 1000, status: "failed", failure_reason: "lost_or_stolen_card" });
      expect(notice).toMatchObject({ status: "HELD", outcome: expect.stringMatching(/did NOT go back/) });
      expect((await w.call("GET", "/payment-events", w.id("admin"))).json.events.some((e: { id: string }) => e.id === notice.eventId)).toBe(true);
    });
  });
});
