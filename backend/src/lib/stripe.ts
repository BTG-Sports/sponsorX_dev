import Stripe from "stripe";

import { env } from "../config/env";
import type { NeutralPaymentEvent } from "../contracts/payment-events";
import { redactEmails } from "./redact";
import { acceptedSecrets } from "./rotating-secret";

/**
 * Stripe — 2S5-INT-01 / -03. Only lib/payment-provider.ts imports this file;
 * past the adapter nothing knows Stripe exists.
 *
 * The money flow (programme owner, 2026-10-06): Stripe Connect as a
 * MARKETPLACE with SEPARATE CHARGES AND TRANSFERS. The sponsor pays BTG's
 * platform account on Stripe's hosted Checkout; SponsorX later transfers each
 * payee's share to their Express connected account, when the payout rules
 * (payouts.ts) allow. No destination charges, no on_behalf_of: BTG is the
 * merchant of record and owns refunds and disputes.
 *
 * Here: the client, the webhook verifier, the event mapping (pure — no call
 * to Stripe on the request path), and the small translations the adapter
 * needs (account readiness, failure kinds). Never logs or returns the key.
 */

/* ── the client ───────────────────────────────────────────────────────── */

let cached: { key: string; http: Stripe.HttpClient | null; client: Stripe } | null = null;
let httpOverride: Stripe.HttpClient | null = null;

/**
 * Tests only: every Stripe call goes through this HTTP client instead of the
 * network (the real SDK still builds each request — path, form body,
 * Idempotency-Key — so tests see exactly what Stripe would). null restores it.
 */
export function useStripeHttpClient(client: Stripe.HttpClient | null) {
  httpOverride = client;
  cached = null;
}

/** The Stripe client for the configured key. Throws (without the key) when there is none. */
export function stripeClient(): Stripe {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY is not set).");
  if (cached && cached.key === key && cached.http === httpOverride) return cached.client;
  const client = new Stripe(key, {
    /* One automatic retry on a network blip: safe, because every write carries an idempotency key. */
    maxNetworkRetries: 1,
    timeout: env.PAYMENT_PROVIDER_TIMEOUT_MS,
    appInfo: { name: "SponsorX", url: "https://sponsorx.net" },
    telemetry: false,
    ...(httpOverride ? { httpClient: httpOverride } : {}),
  });
  cached = { key, http: httpOverride, client };
  return client;
}

/**
 * Any Stripe key-shaped text in a message, masked: errors are logged and shown, keys never are.
 * 2S0-SEC-01 — and any email address, masked to its domain: Stripe's refusals can quote the
 * parameter they refused ("Invalid email address: …"), and the message is logged and kept on
 * the payout or refund it failed (`providerMessage`), where BTG reads it.
 */
export function scrub(text: string): string {
  return redactEmails(text.replace(/\b(sk|rk|pk)_(live|test)_[0-9A-Za-z*]+/g, "$1_$2_[redacted]").replace(/\bwhsec_[0-9A-Za-z+/=]+/g, "whsec_[redacted]"));
}

/* ── errors → what the adapter does next ─────────────────────────────── */

export type StripeFailure =
  /** Stripe couldn't be reached, timed out, rate-limited us or broke: try again later (nothing was done). */
  | { kind: "unavailable"; message: string }
  /** Stripe answered and refused: trying the same thing again won't help. `code` is Stripe's. */
  | { kind: "refused"; code: string | null; message: string };

export function classifyStripeError(error: unknown): StripeFailure {
  const e = error as { type?: string; code?: string; message?: string; statusCode?: number };
  const message = scrub(String(e?.message ?? error));
  switch (e?.type) {
    case "StripeConnectionError":
    case "StripeAPIError":
    case "StripeRateLimitError":
    case "RateLimitError":
      return { kind: "unavailable", message };
    /* The same key with different parameters: a bug, and retrying never heals it. */
    case "StripeIdempotencyError":
      return { kind: "refused", code: e.code ?? "idempotency_error", message };
    /* A key Stripe won't accept is an operations problem, not the caller's: "try again" once it is fixed. */
    case "StripeAuthenticationError":
      return { kind: "unavailable", message: "Stripe refused SponsorX's API key." };
    case "StripeInvalidRequestError":
      /* Another request with the same key still running, or a lock: it is the same request, a moment later. */
      if (e.code === "idempotency_key_in_use" || e.code === "lock_timeout") return { kind: "unavailable", message };
      return { kind: "refused", code: e.code ?? null, message };
    case "StripeCardError":
    case "StripePermissionError":
      return { kind: "refused", code: e.code ?? null, message };
    default:
      return typeof e?.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500
        ? { kind: "refused", code: e.code ?? null, message }
        : { kind: "unavailable", message };
  }
}

export type FailureKind = "TEMPORARY" | "ACCOUNT" | "OTHER";

/**
 * A Stripe failure code, as SponsorX's payout failure kinds (payout-auto.ts
 * `planFailure`): TEMPORARY is retried by the sweep, ACCOUNT waits for the
 * payee to fix their payout account, OTHER is BTG's. Covers transfer refusals
 * and the failure codes of a payout to a payee's bank.
 */
export function failureKindFor(code: string | null | undefined): FailureKind {
  switch (code) {
    /* BTG's platform balance can't cover it yet (card money still settling): later. */
    case "balance_insufficient":
    case "insufficient_funds":
    case "could_not_process":
    case "lock_timeout":
    case "rate_limit":
      return "TEMPORARY";
    /* The payee's side: their Stripe account or their bank account. */
    case "account_invalid":
    case "account_closed":
    case "account_frozen":
    case "bank_account_restricted":
    case "bank_ownership_changed":
    case "invalid_account_number":
    case "incorrect_account_holder_name":
    case "incorrect_account_holder_type":
    case "incorrect_account_holder_address":
    case "incorrect_account_holder_tax_id":
    case "invalid_currency":
    case "no_account":
    case "debit_not_authorized":
    case "unsupported_card":
    case "transfers_not_allowed":
    case "payouts_not_allowed":
      return "ACCOUNT";
    default:
      return "OTHER";
  }
}

/* ── connected accounts — 2S5-INT-03 ─────────────────────────────────── */

export type AccountReadiness = { status: "READY" | "NEEDS_INFO"; reason: string | null; rejected: boolean };

/**
 * Whether money can be sent to a payee's connected account. SponsorX's payees
 * only RECEIVE transfers (separate charges and transfers), so the account
 * asks for the `transfers` capability alone and is never `charges_enabled`.
 * READY therefore means: the transfers capability is active, payouts to the
 * payee's bank are enabled, nothing is currently due, and Stripe hasn't
 * disabled it. Everything else is NEEDS_INFO, with Stripe's reason — and an
 * account Stripe rejected is flagged, because the payee can't fix that.
 */
export function accountReadiness(a: Pick<Stripe.Account, "payouts_enabled" | "details_submitted" | "capabilities" | "requirements">): AccountReadiness {
  const due = a.requirements?.currently_due ?? [];
  const pastDue = a.requirements?.past_due ?? [];
  const disabled = a.requirements?.disabled_reason ?? null;
  const transfers = a.capabilities?.transfers ?? "inactive";
  if (a.payouts_enabled && transfers === "active" && due.length === 0 && pastDue.length === 0 && !disabled) {
    return { status: "READY", reason: null, rejected: false };
  }
  const rejected = typeof disabled === "string" && disabled.startsWith("rejected");
  const reason = rejected ? `Stripe rejected this payout account (${disabled}).`
    : !a.details_submitted ? "Payout set-up on Stripe isn't finished yet."
    : disabled === "requirements.pending_verification" || transfers === "pending" ? "Stripe is verifying the details given."
    : due.length || pastDue.length ? `Stripe needs more information (${[...new Set([...pastDue, ...due])].slice(0, 5).join(", ")}).`
    : disabled ? `Stripe has paused this payout account (${disabled}).`
    : !a.payouts_enabled ? "Stripe hasn't enabled payouts to the bank account yet."
    : "Stripe hasn't enabled transfers to this account yet.";
  return { status: "NEEDS_INFO", reason, rejected };
}

/**
 * The same question for an Accounts v2 account (how SponsorX opens them —
 * Stripe no longer accepts v1 account creation for new Connect platforms):
 * its recipient configuration's `stripe_balance.stripe_transfers` (money can
 * be sent to it) and `stripe_balance.payouts` (it reaches the payee's bank)
 * both active, and nothing the payee must still provide currently or past
 * due. A capability Stripe rejected, or a closed account, is flagged.
 */
export function accountReadinessV2(a: Pick<Stripe.V2.Core.Account, "closed" | "configuration" | "requirements">): AccountReadiness {
  const balance = a.configuration?.recipient?.capabilities?.stripe_balance;
  const transfers = balance?.stripe_transfers?.status ?? "restricted";
  const payouts = balance?.payouts?.status ?? "restricted";
  const due = (a.requirements?.entries ?? []).filter((e) => e.awaiting_action_from === "user" && e.minimum_deadline?.status !== "eventually_due");
  const verifying = (a.requirements?.entries ?? []).some((e) => e.awaiting_action_from === "stripe");
  if (!a.closed && transfers === "active" && payouts === "active" && due.length === 0) return { status: "READY", reason: null, rejected: false };
  const details = [...(balance?.stripe_transfers?.status_details ?? []), ...(balance?.payouts?.status_details ?? [])];
  const rejectedCode = details.find((d) => String(d.code).startsWith("rejected"))?.code;
  const rejected = Boolean(a.closed) || transfers === "rejected" || payouts === "rejected" || Boolean(rejectedCode);
  const reason = a.closed ? "This payout account was closed at Stripe."
    : rejected ? `Stripe rejected this payout account${rejectedCode ? ` (${String(rejectedCode).replace(/_/g, " ")})` : ""}.`
    : due.length ? `Stripe needs more information (${[...new Set(due.map((e) => e.description))].slice(0, 5).join(", ")}).`
    : verifying || transfers === "pending" || payouts === "pending" ? "Stripe is verifying the details given."
    : transfers !== "active" ? "Stripe hasn't enabled transfers to this account yet."
    : "Stripe hasn't enabled payouts to the bank account yet.";
  return { status: "NEEDS_INFO", reason, rejected };
}

/* ── webhooks — 2S5-INT-02's door, Stripe's lock ─────────────────────── */

export type WebhookCheck = { ok: true } | { ok: false; reason: string };

/** Every signing secret accepted now: the platform endpoint's, the thin-event destination's and the Connect endpoint's, each with its rotation pair. */
export function stripeWebhookSecrets(): string[] {
  return [
    ...acceptedSecrets(env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_PREVIOUS),
    ...acceptedSecrets(env.STRIPE_THIN_WEBHOOK_SECRET, env.STRIPE_THIN_WEBHOOK_SECRET_PREVIOUS),
    ...acceptedSecrets(env.STRIPE_CONNECT_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS),
  ];
}

/**
 * `Stripe-Signature` checked by the SDK (`constructEvent`) over the raw bytes,
 * against every accepted secret. A delivery older than
 * PAYMENT_WEBHOOK_TOLERANCE_SECONDS is a replay and is refused — and, as for
 * the stand-in, so is one dated further than that in the future.
 */
export function verifyStripeWebhook(rawBody: string, header: string | undefined, now = new Date()): WebhookCheck {
  if (!header) return { ok: false, reason: "no signature" };
  const t = Number(/(?:^|,)\s*t=(\d+)/.exec(header)?.[1]);
  if (!Number.isInteger(t) || !/(?:^|,)\s*v1=/.test(header)) return { ok: false, reason: "malformed signature" };
  const secrets = stripeWebhookSecrets();
  if (!secrets.length) return { ok: false, reason: "no Stripe webhook secret is configured" };
  let stale = false;
  /* A thin (v2) event notification is verified by the same SDK check constructEvent runs, without
     being built into a snapshot event (constructEvent refuses thin payloads by design). */
  const thin = (() => {
    try {
      return (JSON.parse(rawBody) as { object?: unknown })?.object === "v2.core.event";
    } catch {
      return false;
    }
  })();
  for (const secret of secrets) {
    try {
      if (thin) Stripe.webhooks.signature!.verifyHeader(rawBody, header, secret, env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS, undefined, now.getTime());
      else Stripe.webhooks.constructEvent(rawBody, header, secret, env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS, undefined, now.getTime());
      if (t - now.getTime() / 1000 > env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "signature timestamp outside the tolerance (a replay)" };
      return { ok: true };
    } catch (error) {
      /* The SDK checks the signature before the timestamp: "outside the tolerance" means this secret signed it. */
      if (/tolerance/i.test(String((error as Error)?.message))) stale = true;
    }
  }
  return { ok: false, reason: stale ? "signature timestamp outside the tolerance (a replay)" : "signature did not verify" };
}

/* ── the mapping: Stripe's events → SponsorX's own ───────────────────── */

type Obj = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
/** An expandable field: the id whether Stripe sent the id or the object. */
const idOf = (v: unknown): string | undefined => str(v) ?? str((v as Obj | null)?.id);
const meta = (o: Obj): Obj => ((o.metadata as Obj | null) ?? {});
const clean = (d: Obj): Obj => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));

/**
 * One Stripe event → zero or more neutral events. Pure: everything comes from
 * the event's own JSON. An event SponsorX doesn't act on — or a Checkout
 * session or transfer it didn't create (no SponsorX id in its metadata) —
 * maps to nothing and is acknowledged. The neutral event's id is Stripe's
 * event id, so a redelivery is a no-op.
 */
export type StripeIncoming =
  /* A snapshot event (Stripe's v1 events): the object as it is, in `data.object`. */
  | (Pick<Stripe.Event, "id" | "type" | "created" | "data"> & { object?: "event"; account?: string | null })
  /* A thin event (Stripe's v2 events, an event destination): only what changed's id, in `related_object`. */
  | { id: string; object: "v2.core.event"; type: string; created: string; related_object?: { id: string; type: string } | null };

export function mapStripeEvent(incoming: StripeIncoming): NeutralPaymentEvent[] {
  if (incoming.object === "v2.core.event") return mapThinEvent(incoming);
  const event = incoming;
  const o = event.data.object as unknown as Obj;
  const occurredAt = new Date(event.created * 1000);
  const one = (type: NeutralPaymentEvent["type"], data: Obj, suffix?: string): NeutralPaymentEvent =>
    ({ id: suffix ? `${event.id}:${suffix}` : event.id, type, occurredAt, data: clean(data) });

  switch (event.type) {
    /* ── card payment: hosted Checkout ── */
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const attemptId = str(meta(o).attemptId) ?? str(o.client_reference_id);
      if (!str(meta(o).attemptId)) return []; // not a session SponsorX opened
      const ids = { attemptId, paymentRef: idOf(o.payment_intent) };
      if (event.type === "checkout.session.expired") {
        return [one("payment.failed", { ...ids, reason: "The payment page expired before the sponsor paid — nothing was charged." })];
      }
      if (event.type === "checkout.session.async_payment_failed") {
        return [one("payment.failed", { ...ids, reason: "The payment didn't go through (the sponsor's bank declined it)." })];
      }
      if (event.type === "checkout.session.completed" && o.payment_status !== "paid") {
        /* "unpaid": an asynchronous method still clearing; "no_payment_required" never happens for an order. */
        return o.payment_status === "unpaid" ? [one("payment.processing", ids)] : [];
      }
      return [one("payment.succeeded", { ...ids, amountCents: o.amount_total })];
    }

    /* ── refunds: the money went back to the card ── */
    case "refund.created":
    case "refund.updated":
    case "charge.refund.updated": {
      if (o.status === "succeeded") return [refunded(o, one)];
      /* A failure is refund.failed's to report (once); a cancelled refund has no other event. */
      if (o.status === "canceled" && event.type === "refund.updated") return [refundNotice(o, one)];
      return []; // pending / requires_action: its "succeeded" follows
    }
    case "refund.failed":
      return [refundNotice(o, one)];
    case "charge.refunded": {
      /* The refunds themselves are in refund.*; a charge that carries its list is mapped too (one per refund, deduplicated by refund id downstream). */
      const list = ((o.refunds as Obj | null)?.data as Obj[] | undefined) ?? [];
      return list.filter((r) => r.status === "succeeded").map((r) => refunded({ ...r, payment_intent: r.payment_intent ?? o.payment_intent }, one, String(r.id)));
    }

    /* ── disputes ── */
    case "charge.dispute.created":
      return [one("dispute.opened", {
        paymentRef: idOf(o.payment_intent), disputeRef: str(o.id), amountCents: o.amount,
        reason: str(o.reason)?.replace(/_/g, " "),
      })];
    case "charge.dispute.closed": {
      const status = String(o.status);
      /* won; an inquiry closed without becoming a dispute; prevented: the money stayed. lost: the bank took it back. */
      const outcome = status === "lost" ? "LOST" : status === "won" || status === "warning_closed" || status === "prevented" ? "WON" : null;
      if (!outcome) return [one("provider.notice", { subject: str(o.id) ?? event.id, summary: `Stripe closed dispute ${String(o.id)} with an outcome SponsorX doesn't know ("${status}") — check it in Stripe.` })];
      return [one("dispute.closed", { paymentRef: idOf(o.payment_intent), disputeRef: str(o.id), outcome, amountCents: o.amount })];
    }

    /* ── payouts: a transfer to the payee's connected account ── */
    case "transfer.created": {
      const payoutId = str(meta(o).payoutId);
      if (!payoutId) return []; // not a transfer SponsorX made
      return [one("payout.paid", { payoutId, payoutRef: str(o.id) })];
    }
    case "transfer.reversed": {
      const payoutId = str(meta(o).payoutId);
      if (!payoutId) return [];
      const amount = Number(o.amount);
      const reversed = Number(o.amount_reversed);
      if (reversed >= amount) {
        return [one("payout.returned", { payoutId, payoutRef: str(o.id), reason: "The transfer to the payee's Stripe account was reversed." })];
      }
      return [one("provider.notice", {
        subject: str(o.id) ?? payoutId,
        summary: `Part of payout ${payoutId}'s transfer (${usd(reversed)} of ${usd(amount)}) was reversed in Stripe. SponsorX still has the payout as paid in full — record what was taken back.`,
      })];
    }

    /* ── payout accounts (Connect events) ── */
    case "account.updated": {
      const r = accountReadiness(o as unknown as Stripe.Account);
      return [one("account.updated", { accountRef: str(o.id) ?? str(event.account), status: r.status, reason: r.reason ?? undefined, rejected: r.rejected || undefined })];
    }
    /* A capability on a payee's account changed (a Connect snapshot event, sent for v2 accounts too):
       the account is read afresh by the worker — the capability alone doesn't say whether it is ready. */
    case "capability.updated":
      return [one("account.updated", { accountRef: str(event.account) ?? idOf(o.account) })];
    case "payout.failed": {
      /* A payout from a PAYEE's Stripe balance to their bank (a Connect event). BTG's own bank payouts are not SponsorX's. */
      if (!event.account) return [];
      const code = str(o.failure_code);
      return [one("provider.notice", {
        subject: event.account,
        summary: `Stripe couldn't pay ${usd(Number(o.amount))} from a payee's Stripe balance to their bank${code ? ` (${code.replace(/_/g, " ")})` : ""}. SponsorX's payout reached their Stripe account; the money waits there until they fix their bank details in Stripe (account ${event.account}).`,
      })];
    }

    /* payment_intent.payment_failed is deliberately not applied: on hosted
       Checkout a declined card is retried on the same page, so it is not the
       end of the attempt — checkout.session.expired is (and
       async_payment_failed). Recording it as FAILED would turn every "wrong
       card, then the right one" into a payment held for BTG. */
    default:
      return [];
  }
}

/**
 * A thin (v2) event names what changed, not how it is now. Every
 * `v2.core.account…` event about a payee's account becomes account.updated
 * with the account id alone; the worker reads the account from Stripe and
 * decides READY or not (payouts.ts `onAccountUpdated`) — so the order thin
 * events arrive in never matters: the latest read wins.
 */
function mapThinEvent(e: Extract<StripeIncoming, { object: "v2.core.event" }>): NeutralPaymentEvent[] {
  const accountRef = e.related_object?.type === "v2.core.account" ? str(e.related_object.id) : undefined;
  if (!accountRef || !/^v2\.core\.account(\.|\[)/.test(e.type)) return [];
  const at = new Date(e.created);
  return [{ id: e.id, type: "account.updated", occurredAt: Number.isNaN(at.getTime()) ? new Date() : at, data: { accountRef } }];
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function refunded(r: Obj, one: (type: NeutralPaymentEvent["type"], data: Obj, suffix?: string) => NeutralPaymentEvent, suffix?: string): NeutralPaymentEvent {
  return one("payment.refunded", {
    attemptId: str(meta(r).attemptId), paymentRef: idOf(r.payment_intent), refundRef: str(r.id), amountCents: r.amount,
    refundDueId: str(meta(r).refundDueId),
  }, suffix);
}

function refundNotice(r: Obj, one: (type: NeutralPaymentEvent["type"], data: Obj) => NeutralPaymentEvent): NeutralPaymentEvent {
  const why = str(r.failure_reason)?.replace(/_/g, " ");
  return one("provider.notice", {
    subject: str(r.id) ?? "refund",
    summary: `Stripe reports refund ${String(r.id)} of ${usd(Number(r.amount))} as ${String(r.status)}${why ? ` (${why})` : ""} — the money did NOT go back to the sponsor's card. Refund them another way, or try again in Stripe.`,
  });
}
