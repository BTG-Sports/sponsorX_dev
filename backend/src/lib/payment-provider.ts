import { createHash, createHmac, randomBytes } from "node:crypto";

import { env } from "../config/env";
import { PAYMENT_EVENT_DATA, ProviderWebhookEnvelope, type NeutralPaymentEvent, type PaymentEventType } from "../contracts/payment-events";
import { acceptedSecrets, hmacMatchesAny } from "./rotating-secret";
import {
  accountReadinessV2, classifyStripeError, failureKindFor, mapStripeEvent, stripeClient, verifyStripeWebhook, type AccountReadiness, type FailureKind,
  type StripeIncoming,
} from "./stripe";
import { logError } from "./redact";

/**
 * The payment-provider adapter (2S5-INT-01 / -03, 2S5-BE-05).
 *
 * Everything that involves the provider goes through here: the link a payee
 * follows to set up where they are paid, the link a sponsor follows to pay
 * by card, and sending an approved payout. SponsorX never sees card or bank
 * details — only links out, and the provider's word back.
 *
 * Three implementations:
 *   - "stripe" — the real one (2S5-INT-01 / -03; lib/stripe.ts): hosted
 *     Checkout for the sponsor, Connect Express accounts onboarded through
 *     Account Links for payees, a transfer per payout, a refund per refund.
 *     Every write carries an idempotency key and SponsorX's own ids in
 *     `metadata`, so a retry is the same object and every webhook names
 *     SponsorX's record.
 *   - "standin" — staging and local only. Its "hosted pages" are SponsorX's
 *     own /test-provider pages, labelled as a test, and it moves no money.
 *     It exists so the whole sponsor-pays → payee-is-paid story can be run
 *     end to end before the provider is chosen (agreed 2026-09-30).
 *   - "none" — production until a provider is connected: every link is
 *     null, and the screens say payment and payouts open once it is.
 */

export type ProviderName = "standin" | "none" | "stripe";

export function providerName(): ProviderName {
  if (env.PAYMENT_PROVIDER) return env.PAYMENT_PROVIDER;
  return env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production" ? "none" : "standin";
}

/* ── the stand-in's signed links ─────────────────────────────────────── */

export type StandinLink =
  | { kind: "account"; payeeType: "ATHLETE" | "PROPERTY"; payeeId: string; tenantId: string; returnPath: string }
  | { kind: "checkout"; attemptId: string; returnPath: string };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const mac = (body: string) => createHmac("sha256", env.STANDIN_PROVIDER_SECRET).update(body).digest("base64url");

/** A link to one of the stand-in's pages, valid for an hour. */
export function standinLink(link: StandinLink, now = new Date()): string {
  const body = b64(JSON.stringify({ ...link, exp: now.getTime() + 60 * 60 * 1000 }));
  const page = link.kind === "account" ? "account" : "checkout";
  return `${env.APP_URL.replace(/\/+$/, "")}/test-provider/${page}?t=${body}.${mac(body)}`;
}

export class StandinTokenError extends Error {
  readonly status = 400;
  constructor(message = "This test-provider link is invalid or has expired — go back to SponsorX and start again.") {
    super(message);
    this.name = "StandinTokenError";
  }
}

/** Read a stand-in link's token back; throws if it was altered or has expired. */
export function readStandinToken(token: string, now = new Date()): StandinLink {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new StandinTokenError();
  /* Signed with the current secret; verified against it and, mid-rotation,
     STANDIN_PROVIDER_SECRET_PREVIOUS (2S8-SEC-02). */
  const secrets = acceptedSecrets(env.STANDIN_PROVIDER_SECRET, env.STANDIN_PROVIDER_SECRET_PREVIOUS);
  if (!hmacMatchesAny(secrets, body, sig, "base64url")) throw new StandinTokenError();
  let parsed: StandinLink & { exp: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new StandinTokenError();
  }
  if (!parsed.exp || parsed.exp < now.getTime()) throw new StandinTokenError();
  const { exp: _exp, ...link } = parsed;
  return link as StandinLink;
}

/** The stand-in's reference for something it "did". */
export function standinRef(prefix: "acct" | "pay" | "po" | "re"): string {
  return `standin_${prefix}_${randomBytes(6).toString("hex")}`;
}

/* ── webhooks — 2S5-INT-02 ───────────────────────────────────────────── */

/**
 * What a provider's webhook must carry, and how it is checked. Each provider
 * signs differently; past this adapter every event is a NeutralPaymentEvent
 * (contracts/payment-events.ts), so Stripe joins by adding its verifier and
 * its name mapping here — nothing that applies an event changes.
 *
 * The stand-in signs like Stripe does: `t=<unix seconds>,v1=<hex HMAC-SHA256
 * of "<t>.<raw body>">` under STANDIN_PROVIDER_SECRET (and, mid-rotation,
 * STANDIN_PROVIDER_SECRET_PREVIOUS — 2S8-SEC-02). The timestamp is inside the
 * signature, so a replayed delivery cannot be freshened: one older (or newer)
 * than PAYMENT_WEBHOOK_TOLERANCE_SECONDS is refused, and one inside the
 * window is a duplicate event id — a no-op.
 */
export const WEBHOOK_SIGNATURE_HEADER: Record<Exclude<ProviderName, "none">, string> = { standin: "x-standin-signature", stripe: "stripe-signature" };

export type WebhookCheck = { ok: true } | { ok: false; reason: string };

/** The stand-in's signature header for a raw body, signed now (current secret only). */
export function standinWebhookSignature(rawBody: string, now = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", env.STANDIN_PROVIDER_SECRET).update(`${t}.${rawBody}`).digest("hex")}`;
}

/** Is this delivery really from `provider`, and fresh? Constant-time over every accepted secret. */
export function verifyProviderWebhook(provider: string, rawBody: string, header: string | undefined, now = new Date()): WebhookCheck {
  /* Stripe: `Stripe-Signature`, checked by its SDK against STRIPE_WEBHOOK_SECRET (and the Connect endpoint's), each with its _PREVIOUS. */
  if (provider === "stripe") return verifyStripeWebhook(rawBody, header, now);
  if (provider !== "standin") return { ok: false, reason: `no webhook verifier for provider "${provider}"` };
  if (!header) return { ok: false, reason: "no signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return { ok: false, reason: "malformed signature" };
  const secrets = acceptedSecrets(env.STANDIN_PROVIDER_SECRET, env.STANDIN_PROVIDER_SECRET_PREVIOUS);
  if (!hmacMatchesAny(secrets, `${t}.${rawBody}`, parts.v1, "hex")) return { ok: false, reason: "signature did not verify" };
  if (Math.abs(now.getTime() / 1000 - t) > env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "signature timestamp outside the tolerance (a replay)" };
  return { ok: true };
}

export class WebhookPayloadError extends Error {
  readonly status = 400;
  constructor(message = "This webhook body is not an event this provider sends.") {
    super(message);
    this.name = "WebhookPayloadError";
  }
}

/**
 * A verified body, mapped onto SponsorX's own event model. The stand-in sends
 * the neutral envelope as it is; each event's data is checked against its
 * type. Throws WebhookPayloadError for anything else.
 */
export function parseProviderWebhook(provider: string, body: unknown): NeutralPaymentEvent[] {
  if (provider === "stripe") return parseStripeWebhook(body);
  if (provider !== "standin") throw new WebhookPayloadError(`No event mapping for provider "${provider}".`);
  const envelope = ProviderWebhookEnvelope.safeParse(body);
  if (!envelope.success) throw new WebhookPayloadError();
  const data = PAYMENT_EVENT_DATA[envelope.data.type].safeParse(envelope.data.data);
  if (!data.success) throw new WebhookPayloadError(`This ${envelope.data.type} event is missing what it must name.`);
  return [{ id: envelope.data.id, type: envelope.data.type, occurredAt: new Date(envelope.data.created), data: data.data as Record<string, unknown> }];
}

/** A Stripe event, mapped (lib/stripe.ts) and each neutral event checked against its type, as the stand-in's are. */
function parseStripeWebhook(body: unknown): NeutralPaymentEvent[] {
  const e = body as { id?: unknown; object?: unknown; type?: unknown; created?: unknown; data?: { object?: unknown } } | null;
  const snapshot = !!e && typeof e.created === "number" && !!e.data && typeof e.data.object === "object" && e.data.object !== null;
  const thin = !!e && e.object === "v2.core.event" && typeof e.created === "string";
  if (!e || typeof e.id !== "string" || typeof e.type !== "string" || !(snapshot || thin)) {
    throw new WebhookPayloadError("This webhook body is not a Stripe event.");
  }
  const mapped = mapStripeEvent(e as unknown as StripeIncoming);
  return mapped.map((n) => {
    const data = PAYMENT_EVENT_DATA[n.type as PaymentEventType].safeParse(n.data);
    if (!data.success) throw new WebhookPayloadError(`This Stripe ${e.type as string} event is missing what SponsorX's ${n.type} must name.`);
    return { ...n, data: data.data as Record<string, unknown> };
  });
}

/* ── outages — 2S8-QA-02 ─────────────────────────────────────────────── */

/** The provider couldn't be reached, or didn't answer in time: nothing it was asked to do is recorded as done. */
export class ProviderUnavailableError extends Error {
  readonly status = 503;
  readonly retryAfter = 30;
  /* The one 5xx code a client may branch on (lib/error-body.ts): "try again", not "we broke". */
  readonly code = "busy";
  readonly operation: StandinOperation;
  readonly timedOut: boolean;
  constructor(operation: StandinOperation, timedOut = false) {
    super(timedOut
      ? "The payment provider didn't answer in time. Nothing was charged or sent — try again in a moment."
      : "The payment provider is unavailable right now. Nothing was charged or sent — try again in a moment.");
    this.name = "ProviderUnavailableError";
    this.operation = operation;
    this.timedOut = timedOut;
  }
}

export type StandinOperation = "checkout" | "payout" | "refund" | "account";

/**
 * The provider answered and refused (a Stripe 4xx): trying the same thing
 * again won't help. `kind` is what a payout failure of this sort means
 * (payout-auto.ts), `providerMessage` Stripe's words (no key, ever) for the
 * record — the caller-facing message stays plain.
 */
export class ProviderRefusedError extends Error {
  readonly status = 409;
  readonly code = "provider_refused";
  readonly operation: StandinOperation;
  readonly providerCode: string | null;
  readonly providerMessage: string;
  readonly kind: FailureKind;
  constructor(operation: StandinOperation, providerCode: string | null, providerMessage: string, kind: FailureKind) {
    super(operation === "checkout"
      ? "The payment provider couldn't open a payment page for this order. Nothing was charged — BTG has the details."
      : operation === "account"
        ? "The payment provider couldn't open payout set-up right now. Nothing changed — try again, or contact BTG support."
        : "The payment provider refused this request.");
    this.name = "ProviderRefusedError";
    this.operation = operation;
    this.providerCode = providerCode;
    this.providerMessage = providerMessage;
    this.kind = kind;
  }
}

/**
 * The stand-in can be told to be down (STANDIN_OUTAGE, staging and tests
 * only): a comma list of operations — `checkout`, `payout`, `refund` — each
 * failing at once, or, written `payout:timeout`, hanging until the provider
 * timeout (PAYMENT_PROVIDER_TIMEOUT_MS) gives up on it. Returns how it fails.
 */
function standinOutage(op: StandinOperation): "error" | "timeout" | null {
  for (const part of (env.STANDIN_OUTAGE ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [name, mode] = part.split(":");
    if (name === op) return mode === "timeout" ? "timeout" : "error";
  }
  return null;
}

/** A Stripe call, inside `providerCall`: a network or 5xx failure is ProviderUnavailableError (retry), a 4xx ProviderRefusedError. Logged without the key. */
async function stripeCall<T>(op: StandinOperation, call: () => Promise<T>): Promise<T> {
  return providerCall(op, async () => {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ProviderRefusedError || error instanceof ProviderUnavailableError) throw error;
      const f = classifyStripeError(error);
      logError(`[stripe] ${op} ${f.kind}${f.kind === "refused" && f.code ? ` (${f.code})` : ""}: ${f.message}`);
      if (f.kind === "unavailable") throw new ProviderUnavailableError(op);
      throw new ProviderRefusedError(op, f.code, f.message, failureKindFor(f.code));
    }
  });
}

/** Every provider call goes through this: refused when the stand-in is told it is down, and never waits past the timeout. */
async function providerCall<T>(op: StandinOperation, call: () => Promise<T>): Promise<T> {
  const outage = providerName() === "standin" ? standinOutage(op) : null;
  if (outage === "error") throw new ProviderUnavailableError(op);
  const work = outage === "timeout" ? new Promise<T>(() => {}) : call();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderUnavailableError(op, true)), env.PAYMENT_PROVIDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/* ── checkout — 2S5-INT-01 ───────────────────────────────────────────── */

export type CheckoutRequest = {
  attemptId: string;
  orderId: string;
  /** "SX-…", what the sponsor sees on the payment page. */
  orderRef: string;
  amountCents: number;
  /** Same-site paths the provider sends the sponsor back to. */
  returnPath: string;
  cancelPath: string;
  now?: Date;
};

const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

/**
 * Open the provider's payment page for an attempt, inside the attempt's own
 * transaction: if the provider is down, the attempt is never recorded and
 * the order is untouched. Returns the page's URL.
 *
 * The stand-in's page is SponsorX's own (`standinLink`), so it only has to be
 * up. Stripe's is a hosted Checkout Session (mode `payment`) on
 * BTG's platform account, created once per attempt (idempotency key
 * `checkout:<attempt id>`), carrying the attempt and order ids in its
 * metadata and in its PaymentIntent's — so every event about it, and about
 * the refunds and disputes that follow, names SponsorX's attempt. It expires
 * after an hour, like the stand-in's link. Card details go to Stripe only.
 */
export async function openCheckout(p: CheckoutRequest): Promise<{ url: string; sessionRef: string | null }> {
  const provider = providerName();
  if (provider === "none") throw new Error("No payment provider is connected.");
  if (provider === "standin") {
    await providerCall("checkout", async () => undefined);
    return { url: standinLink({ kind: "checkout", attemptId: p.attemptId, returnPath: p.returnPath }, p.now), sessionRef: null };
  }
  const now = p.now ?? new Date();
  const metadata = { attemptId: p.attemptId, orderId: p.orderId, sponsorx: "checkout" };
  const session = await stripeCall("checkout", () => stripeClient().checkout.sessions.create({
    mode: "payment",
    /* Which methods show is the Dashboard's payment-method settings (this API version has no
       per-session list). A method that clears later is still mapped: completed-but-unpaid →
       payment.processing, then async_payment_succeeded / _failed. */
    client_reference_id: p.attemptId,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.amountCents, product_data: { name: `SponsorX order ${p.orderRef}` } } }],
    metadata,
    payment_intent_data: { metadata, description: `SponsorX order ${p.orderRef}` },
    success_url: appUrl(p.returnPath),
    cancel_url: appUrl(p.cancelPath),
    expires_at: Math.floor(now.getTime() / 1000) + 60 * 60,
  }, { idempotencyKey: `checkout:${p.attemptId}` }));
  if (!session.url) throw new ProviderRefusedError("checkout", null, "Stripe returned a Checkout Session without a URL.", "OTHER");
  return { url: session.url, sessionRef: session.id };
}

/* ── payout accounts — 2S5-INT-03 ─────────────────────────────────────── */

export type PayoutAccountOwner = { payeeType: "ATHLETE" | "PROPERTY"; payeeId: string; tenantId: string };

/**
 * Stripe: open a connected account for a payee, through Accounts v2 (Stripe
 * refuses v1 account creation for new Connect platforms) — the Express
 * equivalent: Stripe's Express dashboard (so Stripe collects the
 * requirements), BTG as the platform collecting fees and carrying losses,
 * and only the RECIPIENT configuration with `stripe_balance.stripe_transfers`:
 * payees receive transfers, they never take card payments. Stripe requires a
 * contact email for a recipient — the person setting it up. Idempotent per
 * payee (`account:<type>:<id>`), so a retry is the same account. SponsorX
 * stores the account id it returns and nothing else.
 */
export async function createPayoutAccount(owner: PayoutAccountOwner & { contactEmail: string; displayName: string }): Promise<{ accountRef: string }> {
  if (providerName() !== "stripe") throw new Error("Only Stripe opens payout accounts this way.");
  const account = await stripeCall("account", () => stripeClient().v2.core.accounts.create({
    dashboard: "express",
    contact_email: owner.contactEmail,
    display_name: owner.displayName.slice(0, 100),
    identity: { country: env.STRIPE_CONNECT_COUNTRY.toLowerCase() },
    defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    metadata: { payeeType: owner.payeeType, payeeId: owner.payeeId, tenantId: owner.tenantId, sponsorx: "payout-account" },
  }, { idempotencyKey: `account:${owner.payeeType}:${owner.payeeId}` }));
  return { accountRef: account.id };
}

/**
 * Stripe: a payee's account as it is now — read by the worker when Stripe
 * only said it changed (a thin event). Never on a request path.
 */
export async function payoutAccountStatus(accountRef: string): Promise<AccountReadiness> {
  if (providerName() !== "stripe") throw new Error("Only Stripe reads payout accounts this way.");
  const account = await stripeCall("account", () => stripeClient().v2.core.accounts.retrieve(accountRef, { include: ["configuration.recipient", "requirements"] }));
  return accountReadinessV2(account);
}

/**
 * Stripe: whether an account the provider names is one SponsorX opened — the
 * `sponsorx` tag `createPayoutAccount` puts on every payout account. BTG's
 * Stripe account can hold other connected accounts; their events are not
 * SponsorX's to wait for. An account Stripe doesn't have is not ours either.
 * Stripe down still throws, so the queue retries. Worker only.
 */
export async function isSponsorXPayoutAccount(accountRef: string): Promise<boolean> {
  if (providerName() !== "stripe") return true;
  try {
    const account = await stripeCall("account", () => stripeClient().v2.core.accounts.retrieve(accountRef));
    return (account.metadata as Record<string, string> | null | undefined)?.sponsorx === "payout-account";
  } catch (error) {
    if (error instanceof ProviderRefusedError && error.providerCode === "resource_missing") return false;
    throw error;
  }
}

/**
 * Stripe: the link a payee follows — hosted onboarding (an Account Link) to
 * set up or finish, or, once READY, a one-time login to their Express
 * dashboard to manage it. Return and refresh both come back to the payout
 * page they started from (APP_URL + `returnPath`). Links are single-use, so
 * each request is its own idempotency key.
 */
export async function payoutAccountLinkUrl(p: { accountRef: string; returnPath: string; manage: boolean; requestId: string }): Promise<string> {
  if (providerName() !== "stripe") throw new Error("Only Stripe links to payout accounts this way.");
  if (p.manage) {
    const login = await stripeCall("account", () => stripeClient().accounts.createLoginLink(p.accountRef, {}, { idempotencyKey: `account-login:${p.requestId}` }));
    return login.url;
  }
  const link = await stripeCall("account", () => stripeClient().v2.core.accountLinks.create({
    account: p.accountRef,
    use_case: { type: "account_onboarding", account_onboarding: { return_url: appUrl(p.returnPath), refresh_url: appUrl(p.returnPath) } },
  }, { idempotencyKey: `account-link:${p.requestId}` }));
  return link.url;
}

/* ── payouts — 2S5-BE-05 ─────────────────────────────────────────────── */

export type PayoutHandOver = { payoutId: string; amountCents: number; currency: string; accountId: string | null; idempotencyKey: string };

/**
 * Hand an approved payout to the provider: its reference back. The stand-in
 * accepts at once (its answer — paid or failed — follows as an event, like a
 * real provider's webhook). A real provider is sent `idempotencyKey`, so a
 * hand-over retried after a crash between its call and our commit is the
 * same payout to the provider, never a second one. A throw (the provider
 * down) is the caller's to roll back: nothing is recorded as sent.
 */
export async function sendPayoutToProvider(p: PayoutHandOver): Promise<{ provider: ProviderName; reference: string }> {
  const provider = providerName();
  if (provider === "none") throw new Error("No payment provider is connected.");
  if (provider === "stripe") return { provider, reference: await stripeTransfer(p) };
  /* The stand-in honours the key as a provider would: the same hand-over is the same payout reference. */
  return providerCall("payout", async () => ({ provider, reference: `standin_po_${createHash("sha256").update(p.idempotencyKey).digest("hex").slice(0, 16)}` }));
}

/**
 * Stripe: a payout is a TRANSFER from BTG's platform balance to the payee's
 * connected account (separate charges and transfers). Idempotency key
 * `transfer:<payout id>:<hand-over>`; the payout id and hand-over in its
 * metadata (transfer.created → payout.paid names it); grouped by payout. A
 * hand-over Stripe already has — the key's 24 hours long gone — is found in
 * its group and reused, never sent twice. A refusal (no destination, BTG's
 * balance short, an account that can't take transfers) is ProviderRefusedError
 * with its failure kind, for sendPayout to record.
 */
async function stripeTransfer(p: PayoutHandOver): Promise<string> {
  const destination = p.accountId;
  if (!destination?.startsWith("acct_")) {
    throw new ProviderRefusedError("payout", "account_invalid", "The payee has no Stripe payout account.", "ACCOUNT");
  }
  const group = `payout_${p.payoutId}`;
  const earlier = await stripeCall("payout", () => stripeClient().transfers.list({ transfer_group: group, limit: 100 }));
  const same = earlier.data.find((t) => t.metadata?.handOver === p.idempotencyKey);
  if (same) return same.id;
  const transfer = await stripeCall("payout", () => stripeClient().transfers.create({
    amount: p.amountCents,
    currency: p.currency.toLowerCase(),
    destination,
    transfer_group: group,
    description: `SponsorX payout ${p.payoutId}`,
    metadata: { payoutId: p.payoutId, handOver: p.idempotencyKey, sponsorx: "payout" },
  }, { idempotencyKey: `transfer:${p.idempotencyKey}` }));
  return transfer.id;
}

/* ── refunds — 2S4-BE-13 ─────────────────────────────────────────────── */

export type CardRefund = { provider: ProviderName; reference: string; test: boolean };
/** Stripe's refund is a network call, so it is never made here: the refund is queued for the worker (`refunds.send`). */
export type QueuedCardRefund = { provider: ProviderName; queued: true };

/**
 * Refund a card payment, in full or for one line, back to the card it came
 * from. The stand-in "refunds" at once — labelled a test, moving no money —
 * so the whole cancel → refunded story runs on staging. With no provider
 * connected it returns null: the refund stays on Finance's "Refunds to send"
 * list and is sent by hand. Stripe's refund is a network call, so it is
 * QUEUED: the caller enqueues `refunds.send` in its own transaction and the
 * worker sends it (`sendCardRefund`), never on a request path.
 * SponsorX never sees the card: only the payment's own reference goes out.
 */
export function refundCard(_p: { paymentReference: string | null; amountCents: number }): CardRefund | QueuedCardRefund | null {
  const provider = providerName();
  if (provider === "none") return null;
  if (provider === "stripe") return { provider, queued: true };
  /* 2S8-QA-02 — the stand-in told it is down: refused (the caller keeps the refund on Finance's list). */
  if (provider === "standin" && standinOutage("refund")) throw new ProviderUnavailableError("refund");
  return { provider, reference: standinRef("re"), test: true };
}

/**
 * The worker's half of a Stripe refund (`refunds.send`): refund the payment
 * (its PaymentIntent, or a charge) by this amount. Idempotency key
 * `refund:<refund id>`; SponsorX's refund, order and attempt ids in its
 * metadata — so the webhook that follows names SponsorX's refund even before
 * its reference is written. A refund Stripe already made for this row (the
 * key long expired) is found and reused, never made twice.
 */
export async function sendCardRefund(p: { refundDueId: string; orderId: string; attemptId: string | null; paymentReference: string; amountCents: number }): Promise<{ provider: ProviderName; reference: string }> {
  const provider = providerName();
  if (provider !== "stripe") throw new Error("Only Stripe refunds through the worker.");
  const target = p.paymentReference.startsWith("ch_") ? { charge: p.paymentReference } : { payment_intent: p.paymentReference };
  const earlier = await stripeCall("refund", () => stripeClient().refunds.list({ ...target, limit: 100 }));
  const same = earlier.data.find((r) => r.metadata?.refundDueId === p.refundDueId && r.status !== "failed" && r.status !== "canceled");
  if (same) return { provider, reference: same.id };
  const refund = await stripeCall("refund", () => stripeClient().refunds.create({
    ...target,
    amount: p.amountCents,
    reason: "requested_by_customer",
    metadata: { refundDueId: p.refundDueId, orderId: p.orderId, ...(p.attemptId ? { attemptId: p.attemptId } : {}), sponsorx: "refund" },
  }, { idempotencyKey: `refund:${p.refundDueId}` }));
  return { provider, reference: refund.id };
}
