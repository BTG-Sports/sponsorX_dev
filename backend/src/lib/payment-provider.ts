import { createHmac, randomBytes } from "node:crypto";

import { env } from "../config/env";
import { PAYMENT_EVENT_DATA, ProviderWebhookEnvelope, type NeutralPaymentEvent } from "../contracts/payment-events";
import { acceptedSecrets, hmacMatchesAny } from "./rotating-secret";

/**
 * The payment-provider adapter (2S5-INT-01 / -03, 2S5-BE-05).
 *
 * Everything that involves the provider goes through here: the link a payee
 * follows to set up where they are paid, the link a sponsor follows to pay
 * by card, and sending an approved payout. SponsorX never sees card or bank
 * details — only links out, and the provider's word back.
 *
 * Two implementations today:
 *   - "standin" — staging and local only. Its "hosted pages" are SponsorX's
 *     own /test-provider pages, labelled as a test, and it moves no money.
 *     It exists so the whole sponsor-pays → payee-is-paid story can be run
 *     end to end before the provider is chosen (agreed 2026-09-30).
 *   - "none" — production until a provider is connected: every link is
 *     null, and the screens say payment and payouts open once it is.
 * Stripe is added here when 2S0-PMO-03 is decided; nothing else changes.
 */

export type ProviderName = "standin" | "none";

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
export const WEBHOOK_SIGNATURE_HEADER: Record<Exclude<ProviderName, "none">, string> = { standin: "x-standin-signature" };

export type WebhookCheck = { ok: true } | { ok: false; reason: string };

/** The stand-in's signature header for a raw body, signed now (current secret only). */
export function standinWebhookSignature(rawBody: string, now = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", env.STANDIN_PROVIDER_SECRET).update(`${t}.${rawBody}`).digest("hex")}`;
}

/** Is this delivery really from `provider`, and fresh? Constant-time over every accepted secret. */
export function verifyProviderWebhook(provider: string, rawBody: string, header: string | undefined, now = new Date()): WebhookCheck {
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
  if (provider !== "standin") throw new WebhookPayloadError(`No event mapping for provider "${provider}".`);
  const envelope = ProviderWebhookEnvelope.safeParse(body);
  if (!envelope.success) throw new WebhookPayloadError();
  const data = PAYMENT_EVENT_DATA[envelope.data.type].safeParse(envelope.data.data);
  if (!data.success) throw new WebhookPayloadError(`This ${envelope.data.type} event is missing what it must name.`);
  return [{ id: envelope.data.id, type: envelope.data.type, occurredAt: new Date(envelope.data.created), data: data.data as Record<string, unknown> }];
}

/* ── refunds — 2S4-BE-13 ─────────────────────────────────────────────── */

export type CardRefund = { provider: ProviderName; reference: string; test: boolean };

/**
 * Refund a card payment, in full or for one line, back to the card it came
 * from. The stand-in "refunds" at once — labelled a test, moving no money —
 * so the whole cancel → refunded story runs on staging. With no provider
 * connected it returns null: the refund stays on Finance's "Refunds to send"
 * list and is sent by hand. A real provider is a network call, so when one
 * is added this moves onto the worker (an outbox job), never a request path.
 * SponsorX never sees the card: only the payment's own reference goes out.
 */
export function refundCard(_p: { paymentReference: string | null; amountCents: number }): CardRefund | null {
  const provider = providerName();
  if (provider === "none") return null;
  return { provider, reference: standinRef("re"), test: true };
}
