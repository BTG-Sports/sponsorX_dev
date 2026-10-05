import { createHmac, randomBytes } from "node:crypto";

import { env } from "../config/env";
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
