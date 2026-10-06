import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { fakeStripe, stripeEvent, stripeSignature, thinEvent } from "./support/fake-stripe";

/* --------------------------------------------------------------------------
   2S5-INT-01 / 2S5-INT-03 — the Stripe adapter, without a database and
   without Stripe: the boot guard on keys, the webhook signature (good, bad,
   stale, rotated), every Stripe event SponsorX maps, account readiness, and
   what each write sends Stripe — its idempotency key and SponsorX's ids in
   metadata — through the real SDK and a fake HTTP client.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { env } = await import("../src/config/env");
const { stripeConfigProblem, stripeKeyMode } = await import("../src/config/stripe-guard");
const stripe = await import("../src/lib/stripe");
const adapter = await import("../src/lib/payment-provider");

type Env = Record<string, unknown>;
const was: Env = {};
const setEnv = (vars: Env) => {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in was)) was[k] = (env as unknown as Env)[k];
    (env as unknown as Env)[k] = v;
  }
};
afterAll(() => {
  for (const [k, v] of Object.entries(was)) (env as unknown as Env)[k] = v;
  stripe.useStripeHttpClient(null);
});

/* ── the boot guard ──────────────────────────────────────────────────── */

describe("the key guard: Stripe boots only with its keys, and only the right mode for the environment", () => {
  const ok = { PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };

  it("PAYMENT_PROVIDER=stripe refuses to boot without the secret key or the webhook secret", () => {
    expect(stripeConfigProblem({ ...ok, STRIPE_SECRET_KEY: undefined })).toMatch(/STRIPE_SECRET_KEY is not set/);
    expect(stripeConfigProblem({ ...ok, STRIPE_SECRET_KEY: "  " })).toMatch(/STRIPE_SECRET_KEY is not set/);
    expect(stripeConfigProblem({ ...ok, STRIPE_WEBHOOK_SECRET: undefined })).toMatch(/STRIPE_WEBHOOK_SECRET is not set/);
    expect(stripeConfigProblem({ ...ok, RAILWAY_ENVIRONMENT_NAME: "staging" })).toBeNull();
    expect(stripeConfigProblem({ ...ok })).toBeNull(); // a laptop, test key
  });

  it("a live key is refused unless RAILWAY_ENVIRONMENT_NAME is exactly \"production\" — whatever the provider", () => {
    const live = { ...ok, STRIPE_SECRET_KEY: "sk_live_x" };
    expect(stripeConfigProblem({ ...live, RAILWAY_ENVIRONMENT_NAME: "production" })).toBeNull();
    for (const name of [undefined, "staging", "Production", "production-copy", "dev"]) {
      expect(stripeConfigProblem({ ...live, RAILWAY_ENVIRONMENT_NAME: name }), String(name)).toMatch(/LIVE key/);
    }
    /* Not the provider yet, but a live key on staging is still refused. */
    expect(stripeConfigProblem({ PAYMENT_PROVIDER: "standin", STRIPE_SECRET_KEY: "rk_live_x", RAILWAY_ENVIRONMENT_NAME: "staging" })).toMatch(/LIVE key/);
  });

  it("a test key is refused in production when Stripe is the provider", () => {
    expect(stripeConfigProblem({ ...ok, RAILWAY_ENVIRONMENT_NAME: "production" })).toMatch(/TEST key in production/);
    expect(stripeConfigProblem({ ...ok, STRIPE_SECRET_KEY: "rk_test_x", RAILWAY_ENVIRONMENT_NAME: "PRODUCTION" })).toMatch(/TEST key in production/);
  });

  it("anything that isn't a Stripe secret key is refused, and no message ever contains the key", () => {
    const secret = ["sk", "live", "a".repeat(30)].join("_");
    for (const key of ["pk_test_x", "whsec_x", "nonsense", secret]) {
      const problem = stripeConfigProblem({ ...ok, STRIPE_SECRET_KEY: key, RAILWAY_ENVIRONMENT_NAME: "staging" });
      expect(problem, key).not.toBeNull();
      expect(problem).not.toContain(key);
    }
    expect([stripeKeyMode("sk_live_x"), stripeKeyMode("sk_test_x"), stripeKeyMode("rk_test_x"), stripeKeyMode("pk_live_x")]).toEqual(["live", "test", "test", "unknown"]);
  });

  it("Stripe errors are scrubbed of anything key-shaped before they are logged", () => {
    const key = ["sk", "test", "b".repeat(28)].join("_");
    expect(stripe.scrub(`Invalid API Key provided: ${key}`)).toBe("Invalid API Key provided: sk_test_[redacted]");
    expect(stripe.classifyStripeError({ type: "StripeAuthenticationError", message: `bad ${key}` }).message).not.toContain("b".repeat(28));
  });
});

/* ── the webhook signature ───────────────────────────────────────────── */

describe("Stripe-Signature, verified by the SDK over the raw body", () => {
  beforeAll(() => setEnv({
    STRIPE_WEBHOOK_SECRET: "whsec_platform_new", STRIPE_WEBHOOK_SECRET_PREVIOUS: "whsec_platform_old",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_new", STRIPE_THIN_WEBHOOK_SECRET: "whsec_thin_new", STRIPE_THIN_WEBHOOK_SECRET_PREVIOUS: undefined, STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS: undefined, PAYMENT_WEBHOOK_TOLERANCE_SECONDS: 300,
  }));
  const body = stripeEvent("checkout.session.expired", { id: "cs_x", metadata: { attemptId: "pa_1" } });

  it("accepts the platform secret, its previous one mid-rotation, and the Connect endpoint's secret", () => {
    for (const secret of ["whsec_platform_new", "whsec_platform_old", "whsec_connect_new"]) {
      expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, secret)), secret).toEqual({ ok: true });
    }
  });

  it("refuses a wrong secret, an altered body, no header and a malformed one", () => {
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_guess"))).toEqual({ ok: false, reason: "signature did not verify" });
    expect(adapter.verifyProviderWebhook("stripe", body.replace("pa_1", "pa_2"), stripeSignature(body, "whsec_platform_new"))).toEqual({ ok: false, reason: "signature did not verify" });
    expect(adapter.verifyProviderWebhook("stripe", body, undefined)).toEqual({ ok: false, reason: "no signature" });
    expect(adapter.verifyProviderWebhook("stripe", body, "v1=abc")).toEqual({ ok: false, reason: "malformed signature" });
  });

  it("refuses a stale delivery (a replay) and one dated in the future, even correctly signed", () => {
    const old = new Date(Date.now() - 301_000);
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_platform_new", old))).toEqual({ ok: false, reason: "signature timestamp outside the tolerance (a replay)" });
    const ahead = new Date(Date.now() + 600_000);
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_platform_new", ahead))).toEqual({ ok: false, reason: "signature timestamp outside the tolerance (a replay)" });
    /* Inside the window: fine. */
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_platform_new", new Date(Date.now() - 200_000)))).toEqual({ ok: true });
  });

  it("a thin (v2) event notification verifies on the event destination's secret, and only a correct one", () => {
    const thin = thinEvent("v2.core.account.updated", "acct_1");
    expect(adapter.verifyProviderWebhook("stripe", thin, stripeSignature(thin, "whsec_thin_new"))).toEqual({ ok: true });
    expect(adapter.verifyProviderWebhook("stripe", thin, stripeSignature(thin, "whsec_guess"))).toEqual({ ok: false, reason: "signature did not verify" });
    expect(adapter.verifyProviderWebhook("stripe", thin, stripeSignature(thin, "whsec_thin_new", new Date(Date.now() - 400_000)))).toEqual({ ok: false, reason: "signature timestamp outside the tolerance (a replay)" });
  });

  it("once _PREVIOUS is removed, the old secret is refused", () => {
    setEnv({ STRIPE_WEBHOOK_SECRET_PREVIOUS: undefined });
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_platform_old"))).toEqual({ ok: false, reason: "signature did not verify" });
    expect(adapter.verifyProviderWebhook("stripe", body, stripeSignature(body, "whsec_platform_new"))).toEqual({ ok: true });
    setEnv({ STRIPE_WEBHOOK_SECRET_PREVIOUS: "whsec_platform_old" });
  });
});

/* ── the mapping ─────────────────────────────────────────────────────── */

describe("every Stripe event SponsorX acts on maps onto the provider-neutral events", () => {
  const map = (type: string, object: Record<string, unknown>, opts: { account?: string } = {}) =>
    adapter.parseProviderWebhook("stripe", JSON.parse(stripeEvent(type, object, { id: "evt_map", ...opts })));
  const session = (extra: Record<string, unknown>) => ({ id: "cs_1", object: "checkout.session", metadata: { attemptId: "pa_1", orderId: "o_1" }, payment_intent: "pi_1", amount_total: 50_000, ...extra });

  it("checkout: completed and paid → succeeded; completed unpaid → processing; async → succeeded / failed; expired → failed", () => {
    expect(map("checkout.session.completed", session({ payment_status: "paid" }))).toMatchObject([{ id: "evt_map", type: "payment.succeeded", data: { attemptId: "pa_1", paymentRef: "pi_1", amountCents: 50_000 } }]);
    expect(map("checkout.session.completed", session({ payment_status: "unpaid" }))).toMatchObject([{ type: "payment.processing", data: { attemptId: "pa_1", paymentRef: "pi_1" } }]);
    expect(map("checkout.session.async_payment_succeeded", session({ payment_status: "paid" }))).toMatchObject([{ type: "payment.succeeded", data: { amountCents: 50_000 } }]);
    expect(map("checkout.session.async_payment_failed", session({}))).toMatchObject([{ type: "payment.failed", data: { attemptId: "pa_1", reason: expect.any(String) } }]);
    expect(map("checkout.session.expired", session({ payment_intent: null }))).toEqual([expect.objectContaining({ type: "payment.failed", data: { attemptId: "pa_1", reason: expect.stringMatching(/expired/) } })]);
  });

  it("a Checkout session or transfer SponsorX didn't open is acknowledged and ignored", () => {
    expect(map("checkout.session.completed", { ...session({ payment_status: "paid" }), metadata: {} })).toEqual([]);
    expect(map("transfer.created", { id: "tr_1", amount: 100, metadata: {} })).toEqual([]);
    expect(map("customer.created", { id: "cus_1" })).toEqual([]);
  });

  it("payment_intent.payment_failed is NOT applied: on hosted Checkout the sponsor retries on the same page", () => {
    expect(map("payment_intent.payment_failed", { id: "pi_1", metadata: { attemptId: "pa_1" }, last_payment_error: { message: "declined" } })).toEqual([]);
  });

  it("refunds: refund.created / refund.updated / charge.refund.updated when succeeded, and charge.refunded's own list → payment.refunded", () => {
    const refund = { id: "re_1", object: "refund", amount: 2500, payment_intent: "pi_1", status: "succeeded", metadata: { refundDueId: "rd_1", attemptId: "pa_1" } };
    for (const type of ["refund.created", "refund.updated", "charge.refund.updated"]) {
      expect(map(type, refund), type).toMatchObject([{ type: "payment.refunded", data: { paymentRef: "pi_1", refundRef: "re_1", amountCents: 2500, refundDueId: "rd_1", attemptId: "pa_1" } }]);
    }
    expect(map("refund.created", { ...refund, status: "pending" })).toEqual([]);
    expect(map("charge.refunded", { id: "ch_1", payment_intent: "pi_1", refunds: { data: [{ ...refund, payment_intent: null, metadata: {} }, { ...refund, id: "re_2", status: "pending" }] } }))
      .toMatchObject([{ id: "evt_map:re_1", type: "payment.refunded", data: { paymentRef: "pi_1", refundRef: "re_1" } }]);
    expect(map("charge.refunded", { id: "ch_1", payment_intent: "pi_1", amount_refunded: 2500 })).toEqual([]); // the refund.* events carry it
  });

  it("a refund that failed (or was cancelled) is a notice for BTG — the money didn't go back", () => {
    expect(map("refund.failed", { id: "re_9", amount: 2500, status: "failed", failure_reason: "expired_or_canceled_card" })).toMatchObject([{ type: "provider.notice", data: { subject: "re_9", summary: expect.stringMatching(/did NOT go back.*|expired or canceled card/) } }]);
    expect(map("refund.updated", { id: "re_9", amount: 2500, status: "canceled" })).toMatchObject([{ type: "provider.notice" }]);
    expect(map("refund.updated", { id: "re_9", amount: 2500, status: "failed" })).toEqual([]); // refund.failed reports it, once
  });

  it("disputes: created → opened; closed won / lost / warning_closed → closed with the outcome", () => {
    const dispute = { id: "dp_1", object: "dispute", amount: 50_000, payment_intent: "pi_1", reason: "product_not_received" };
    expect(map("charge.dispute.created", { ...dispute, status: "needs_response" })).toMatchObject([{ type: "dispute.opened", data: { paymentRef: "pi_1", disputeRef: "dp_1", amountCents: 50_000, reason: "product not received" } }]);
    expect(map("charge.dispute.closed", { ...dispute, status: "won" })).toMatchObject([{ type: "dispute.closed", data: { outcome: "WON", disputeRef: "dp_1" } }]);
    expect(map("charge.dispute.closed", { ...dispute, status: "lost" })).toMatchObject([{ type: "dispute.closed", data: { outcome: "LOST" } }]);
    expect(map("charge.dispute.closed", { ...dispute, status: "warning_closed" })).toMatchObject([{ type: "dispute.closed", data: { outcome: "WON" } }]);
    expect(map("charge.dispute.closed", { ...dispute, status: "something_new" })).toMatchObject([{ type: "provider.notice" }]);
  });

  it("transfers: created → payout.paid; reversed in full → payout.returned; reversed in part → a notice", () => {
    const transfer = { id: "tr_1", object: "transfer", amount: 40_000, amount_reversed: 0, metadata: { payoutId: "po_1", handOver: "po_1:1" } };
    expect(map("transfer.created", transfer)).toMatchObject([{ type: "payout.paid", data: { payoutId: "po_1", payoutRef: "tr_1" } }]);
    expect(map("transfer.reversed", { ...transfer, amount_reversed: 40_000 })).toMatchObject([{ type: "payout.returned", data: { payoutId: "po_1", payoutRef: "tr_1" } }]);
    expect(map("transfer.reversed", { ...transfer, amount_reversed: 1_000 })).toMatchObject([{ type: "provider.notice", data: { summary: expect.stringMatching(/\$10\.00 of \$400\.00/) } }]);
  });

  it("account.updated (Connect) → account.updated, ready or needing information; a payee's failed bank payout → a notice", () => {
    const ready = { id: "acct_1", object: "account", payouts_enabled: true, charges_enabled: false, details_submitted: true, capabilities: { transfers: "active" }, requirements: { currently_due: [], past_due: [], disabled_reason: null } };
    expect(map("account.updated", ready, { account: "acct_1" })).toMatchObject([{ type: "account.updated", data: { accountRef: "acct_1", status: "READY" } }]);
    expect(map("account.updated", { ...ready, requirements: { currently_due: ["individual.ssn_last_4"], past_due: [], disabled_reason: null } }))
      .toMatchObject([{ type: "account.updated", data: { status: "NEEDS_INFO", reason: expect.stringMatching(/ssn_last_4/) } }]);
    expect(map("account.updated", { ...ready, payouts_enabled: false, requirements: { currently_due: [], past_due: [], disabled_reason: "rejected.fraud" } }))
      .toMatchObject([{ type: "account.updated", data: { status: "NEEDS_INFO", rejected: true } }]);
    expect(map("payout.failed", { id: "po_x", amount: 40_000, failure_code: "account_closed" }, { account: "acct_1" })).toMatchObject([{ type: "provider.notice", data: { subject: "acct_1", summary: expect.stringMatching(/account closed/) } }]);
    expect(map("payout.failed", { id: "po_x", amount: 40_000, failure_code: "account_closed" })).toEqual([]); // BTG's own bank payout
  });

  it("thin (v2) events about a payee's account, and capability.updated, → account.updated naming the account only (the worker reads it afresh)", () => {
    for (const type of ["v2.core.account.updated", "v2.core.account[configuration.recipient].capability_status_updated", "v2.core.account[requirements].updated", "v2.core.account.closed"]) {
      expect(adapter.parseProviderWebhook("stripe", JSON.parse(thinEvent(type, "acct_9", { id: "evt_thin" }))), type).toEqual([
        { id: "evt_thin", type: "account.updated", occurredAt: expect.any(Date), data: { accountRef: "acct_9" } },
      ]);
    }
    expect(adapter.parseProviderWebhook("stripe", JSON.parse(thinEvent("v2.core.account_person.updated", "acct_9")))).toEqual([]);
    expect(map("capability.updated", { id: "transfers", object: "capability", account: "acct_9", status: "active" }, { account: "acct_9" })).toMatchObject([{ type: "account.updated", data: { accountRef: "acct_9" } }]);
  });

  it("a body that isn't a Stripe event, or a mapped event missing what it must name, is refused", () => {
    expect(() => adapter.parseProviderWebhook("stripe", { hello: "world" })).toThrow(adapter.WebhookPayloadError);
    expect(() => map("charge.dispute.created", { id: "dp_1", amount: 100 })).toThrow(/missing what SponsorX's dispute.opened must name/);
  });
});

describe("readiness and failure kinds", () => {
  const base = { payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active" as const }, requirements: { currently_due: [], past_due: [], disabled_reason: null } };
  it("READY needs transfers active, payouts enabled and nothing due — never charges_enabled (payees only receive transfers)", () => {
    expect(stripe.accountReadiness(base as never)).toEqual({ status: "READY", reason: null, rejected: false });
    expect(stripe.accountReadiness({ ...base, details_submitted: false, payouts_enabled: false } as never)).toMatchObject({ status: "NEEDS_INFO", reason: expect.stringMatching(/isn't finished/) });
    expect(stripe.accountReadiness({ ...base, capabilities: { transfers: "pending" } } as never)).toMatchObject({ status: "NEEDS_INFO", reason: expect.stringMatching(/verifying/) });
    expect(stripe.accountReadiness({ ...base, payouts_enabled: false } as never)).toMatchObject({ status: "NEEDS_INFO" });
  });
  it("an Accounts v2 recipient: READY needs stripe_transfers and payouts active and nothing due from the payee", () => {
    const cap = (status: string, code?: string) => ({ status, status_details: code ? [{ code, resolution: "provide_info" }] : [] });
    const v2 = (transfers: object, payouts: object, entries: object[] = [], closed = false) => ({ closed, configuration: { recipient: { applied: true, capabilities: { stripe_balance: { stripe_transfers: transfers, payouts } } } }, requirements: { entries } });
    expect(stripe.accountReadinessV2(v2(cap("active"), cap("active")) as never)).toEqual({ status: "READY", reason: null, rejected: false });
    /* Transfers alone (no bank yet): money could reach Stripe but not the payee — not ready. */
    expect(stripe.accountReadinessV2(v2(cap("active"), cap("restricted", "requirements_past_due"), [{ awaiting_action_from: "user", description: "external_account", minimum_deadline: { status: "past_due" } }]) as never))
      .toEqual({ status: "NEEDS_INFO", reason: "Stripe needs more information (external_account).", rejected: false });
    expect(stripe.accountReadinessV2(v2(cap("pending"), cap("pending"), [{ awaiting_action_from: "stripe", description: "verification", minimum_deadline: { status: "currently_due" } }]) as never)).toMatchObject({ reason: expect.stringMatching(/verifying/) });
    expect(stripe.accountReadinessV2(v2(cap("rejected", "rejected_fraud"), cap("rejected", "rejected_fraud")) as never)).toMatchObject({ status: "NEEDS_INFO", rejected: true, reason: expect.stringMatching(/rejected fraud/) });
    expect(stripe.accountReadinessV2(v2(cap("active"), cap("active"), [], true) as never)).toMatchObject({ status: "NEEDS_INFO", rejected: true });
    /* Something only eventually due doesn't stop payouts today. */
    expect(stripe.accountReadinessV2(v2(cap("active"), cap("active"), [{ awaiting_action_from: "user", description: "later", minimum_deadline: { status: "eventually_due" } }]) as never).status).toBe("READY");
  });
  it("Stripe's failure codes map onto SponsorX's payout failure kinds", () => {
    expect(["balance_insufficient", "could_not_process", "account_closed", "invalid_account_number", "transfers_not_allowed", "declined", undefined].map(stripe.failureKindFor))
      .toEqual(["TEMPORARY", "TEMPORARY", "ACCOUNT", "ACCOUNT", "ACCOUNT", "OTHER", "OTHER"]);
  });
});

/* ── what each write sends Stripe ────────────────────────────────────── */

describe("every Stripe write carries an idempotency key and SponsorX's ids in metadata", () => {
  const fake = fakeStripe("sxa");
  beforeAll(() => {
    setEnv({ PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x", APP_URL: "https://app.sponsorx.test/", PAYMENT_PROVIDER_TIMEOUT_MS: 5_000 });
    stripe.useStripeHttpClient(fake.http);
  });
  afterEach(() => fake.reset());

  it("checkout: a hosted session per attempt, its URL returned; the attempt and order in its metadata and its PaymentIntent's", async () => {
    const req77 = { attemptId: "pa_77", orderId: "o_77", orderRef: "SX-0000O_77", amountCents: 50_000, returnPath: "/sponsor/orders/o_77?payment=returned", cancelPath: "/sponsor/orders/o_77", now: new Date() };
    const opened = await adapter.openCheckout(req77);
    expect(opened.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [req] = fake.to("/v1/checkout/sessions");
    expect(req!.idempotencyKey).toBe("checkout:pa_77");
    expect(req!.authorization).toBe("Bearer sk_test_x");
    const p = Object.fromEntries(req!.params);
    expect(p).toMatchObject({
      mode: "payment", client_reference_id: "pa_77",
      "metadata[attemptId]": "pa_77", "metadata[orderId]": "o_77",
      "payment_intent_data[metadata][attemptId]": "pa_77", "payment_intent_data[metadata][orderId]": "o_77",
      "line_items[0][price_data][unit_amount]": "50000", "line_items[0][price_data][currency]": "usd", "line_items[0][quantity]": "1",
      success_url: "https://app.sponsorx.test/sponsor/orders/o_77?payment=returned", cancel_url: "https://app.sponsorx.test/sponsor/orders/o_77",
    });
    expect(Number(p.expires_at) - Date.now() / 1000).toBeGreaterThan(3500);
    /* No destination charge, no on_behalf_of: BTG is the merchant. */
    expect([...req!.params.keys()].some((k) => /transfer_data|on_behalf_of|application_fee/.test(k))).toBe(false);
    /* The same attempt again is the same session. */
    const again = await adapter.openCheckout(req77);
    expect(again.sessionRef).toBe(opened.sessionRef);
    /* The same key with different parameters is Stripe refusing (a bug), never "try again" forever. */
    await expect(adapter.openCheckout({ ...req77, returnPath: "/elsewhere" })).rejects.toMatchObject({ code: "provider_refused", providerCode: "idempotency_error" });
  });

  it("payout account: an Accounts v2 Express-equivalent recipient asking only for transfers, once per payee; onboarding through an Account Link back to the page", async () => {
    const owner = { payeeType: "PROPERTY" as const, payeeId: "prop_1", tenantId: "t_1", contactEmail: "dana@hawks.test", displayName: "Westfield Hawks" };
    const { accountRef } = await adapter.createPayoutAccount(owner);
    expect(accountRef).toMatch(/^acct_/);
    const [req] = fake.to("/v2/core/accounts");
    expect(req!.idempotencyKey).toBe("account:PROPERTY:prop_1");
    expect(req!.json).toEqual({
      dashboard: "express", contact_email: "dana@hawks.test", display_name: "Westfield Hawks", identity: { country: "us" },
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { payeeType: "PROPERTY", payeeId: "prop_1", tenantId: "t_1", sponsorx: "payout-account" },
    });
    /* Never the merchant configuration: payees don't take card payments (separate charges and transfers). */
    expect(JSON.stringify(req!.json)).not.toMatch(/merchant|card_payments/);
    expect((await adapter.createPayoutAccount(owner)).accountRef).toBe(accountRef);

    const url = await adapter.payoutAccountLinkUrl({ accountRef, returnPath: "/property/earnings", manage: false, requestId: "rq1" });
    expect(url).toMatch(/^https:\/\/connect\.stripe\.com\/setup\//);
    const [link] = fake.to("/v2/core/account_links");
    expect(link!.idempotencyKey).toBe("account-link:rq1");
    expect(link!.json).toEqual({ account: accountRef, use_case: { type: "account_onboarding", account_onboarding: { return_url: "https://app.sponsorx.test/property/earnings", refresh_url: "https://app.sponsorx.test/property/earnings" } } });
    /* The worker reads the account afresh when a thin event says it changed. */
    expect(await adapter.payoutAccountStatus(accountRef)).toMatchObject({ status: "NEEDS_INFO", rejected: false });
    fake.setAccount(accountRef, "ready");
    expect(await adapter.payoutAccountStatus(accountRef)).toEqual({ status: "READY", reason: null, rejected: false });
    const asked = decodeURIComponent(fake.to(`/v2/core/accounts/${accountRef}`, "GET")[0]!.query.toString());
    expect(asked).toMatch(/configuration\.recipient/);
    expect(asked).toMatch(/requirements/);
    /* Once READY: a login to the Express dashboard instead. */
    expect(await adapter.payoutAccountLinkUrl({ accountRef, returnPath: "/property/earnings", manage: true, requestId: "rq2" })).toMatch(/^https:\/\/connect\.stripe\.com\/express\//);
    expect(fake.to(`/v1/accounts/${accountRef}/login_links`)[0]!.idempotencyKey).toBe("account-login:rq2");
  });

  it("payout: a transfer per hand-over (idempotency key and metadata), found again rather than sent twice", async () => {
    const handOver = { payoutId: "po_9", amountCents: 40_000, currency: "USD", accountId: "acct_dest", idempotencyKey: "po_9:1" };
    const sent = await adapter.sendPayoutToProvider(handOver);
    expect(sent).toMatchObject({ provider: "stripe", reference: expect.stringMatching(/^tr_/) });
    const [req] = fake.to("/v1/transfers");
    expect(req!.idempotencyKey).toBe("transfer:po_9:1");
    expect(Object.fromEntries(req!.params)).toMatchObject({ amount: "40000", currency: "usd", destination: "acct_dest", transfer_group: "payout_po_9", "metadata[payoutId]": "po_9", "metadata[handOver]": "po_9:1" });
    /* Asked again (the key's day long gone, say): Stripe already has it — the same transfer, none made. */
    expect((await adapter.sendPayoutToProvider(handOver)).reference).toBe(sent.reference);
    expect(fake.to("/v1/transfers")).toHaveLength(1);
    /* A second hand-over is a new transfer. */
    expect((await adapter.sendPayoutToProvider({ ...handOver, idempotencyKey: "po_9:2" })).reference).not.toBe(sent.reference);
  });

  it("refund: queued on the request path; the worker's refund carries its key and SponsorX's refund id, found again rather than made twice", async () => {
    expect(adapter.refundCard({ paymentReference: "pi_5", amountCents: 2500 })).toEqual({ provider: "stripe", queued: true });
    expect(fake.seen).toHaveLength(0); // no network on the request path
    const r = await adapter.sendCardRefund({ refundDueId: "rd_5", orderId: "o_5", attemptId: "pa_5", paymentReference: "pi_5", amountCents: 2500 });
    expect(r.reference).toMatch(/^re_/);
    const [req] = fake.to("/v1/refunds");
    expect(req!.idempotencyKey).toBe("refund:rd_5");
    expect(Object.fromEntries(req!.params)).toMatchObject({ payment_intent: "pi_5", amount: "2500", "metadata[refundDueId]": "rd_5", "metadata[orderId]": "o_5", "metadata[attemptId]": "pa_5" });
    expect((await adapter.sendCardRefund({ refundDueId: "rd_5", orderId: "o_5", attemptId: "pa_5", paymentReference: "pi_5", amountCents: 2500 })).reference).toBe(r.reference);
    expect(fake.to("/v1/refunds")).toHaveLength(1);
  });

  it("Stripe down is 'try again' (nothing done); Stripe refusing is a refusal with its failure kind", async () => {
    fake.fail("/v1/transfers", 500, { type: "api_error", message: "Something went wrong on Stripe's end." });
    await expect(adapter.sendPayoutToProvider({ payoutId: "po_10", amountCents: 100, currency: "USD", accountId: "acct_d", idempotencyKey: "po_10:1" })).rejects.toBeInstanceOf(adapter.ProviderUnavailableError);
    fake.fail("/v1/transfers", 400, { type: "invalid_request_error", code: "balance_insufficient", message: "Insufficient funds in Stripe account." });
    const refused = await adapter.sendPayoutToProvider({ payoutId: "po_11", amountCents: 100, currency: "USD", accountId: "acct_d", idempotencyKey: "po_11:1" }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(adapter.ProviderRefusedError);
    expect(refused).toMatchObject({ kind: "TEMPORARY", providerCode: "balance_insufficient", status: 409 });
    /* No payout account at Stripe: the payee's to fix, and Stripe isn't even asked. */
    fake.reset();
    await expect(adapter.sendPayoutToProvider({ payoutId: "po_12", amountCents: 100, currency: "USD", accountId: "standin_acct_1", idempotencyKey: "po_12:1" })).rejects.toMatchObject({ kind: "ACCOUNT" });
    expect(fake.seen).toHaveLength(0);
    fake.fail("/v1/checkout/sessions", 400, { type: "invalid_request_error", code: "amount_too_small", message: "Amount must be at least $0.50 usd" });
    await expect(adapter.openCheckout({ attemptId: "pa_small", orderId: "o", orderRef: "SX-1", amountCents: 10, returnPath: "/a", cancelPath: "/b" })).rejects.toMatchObject({ status: 409, code: "provider_refused" });
  });
});
