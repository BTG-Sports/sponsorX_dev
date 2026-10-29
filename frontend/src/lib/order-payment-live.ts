/* --------------------------------------------------------------------------
   2S5-FE-05 — the sponsor pays an approved order. The pure pieces behind the
   order page's Payment card (designs E1 due / E2 confirming / E3 paid /
   E4 failed), its order-progress tracker, and the stand-in provider's pages.

   Wire shape is the backend's `orderPayment()` (backend/src/domain/payouts.ts,
   GET /marketplace-orders/:id/payment). Money is integer cents, formatted by
   shop-live's `usd` so the order page's figures all read the same.
   -------------------------------------------------------------------------- */

import { isSafeLocalPath } from "@/lib/safe-path";
import { fmtStamp, usd } from "@/lib/shop-live";

/* ------------------------------------------------------------------ shapes */

export type PaymentAttemptState = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export type ApiPaymentAttempt = {
  id: string;
  state: PaymentAttemptState;
  amountCents: number;
  failureReason: string | null;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiOrderPayment = {
  orderId: string;
  amountCents: number;
  /** The order is APPROVED or AWAITING_PAYMENT. */
  due: boolean;
  provider: "standin" | "none";
  canPay: boolean;
  testProvider: boolean;
  latest: ApiPaymentAttempt | null;
};

/* ------------------------------------------------------------- the card */

/** Which design the Payment card shows. `not-open` is before BTG approves;
 *  `held` (POL-FE-04) is approved while card payment is closed — the order
 *  waits with no pay-by date; `none` is an order that will never be paid
 *  here (cancelled, refunded). */
export type PaymentKind = "due" | "held" | "processing" | "paid" | "failed" | "not-open" | "none";

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

export type PaymentView = {
  kind: PaymentKind;
  /** The status line in the side card: "Due now", "Confirming…", "Paid $1,000.00", "Not paid". */
  status: string;
  tone: Tone;
  /** The banner above the lines — null when the card alone says enough. */
  banner: { title: string; text: string; detail: string | null; role: "region" | "status" | "alert" } | null;
  /** The Stripe CTA, when the sponsor has to act on Stripe. */
  cta: { label: string; ariaLabel: string } | null;
  /** One line under the CTA or in its place. */
  note: string | null;
  /** True while the provider is confirming — the page refreshes itself. */
  poll: boolean;
};

const PAID_OR_LATER: ReadonlySet<string> = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);
const DUE: ReadonlySet<string> = new Set(["APPROVED", "AWAITING_PAYMENT"]);

export const PAY_NOTE = "You’ll pay on Stripe’s secure page. SponsorX never sees your card.";
/** POL-FE-04 — card payment is closed (GET …/payment `canPay: false`): the
 *  order is held with no pay-by date, and the sponsor is emailed one when
 *  payment opens (POL-BE-04). Never a countdown while this is true. */
export const HELD_TITLE = "Held for you — card payment opens soon; we’ll email your pay-by date";
export const HELD_TEXT = "Your order is approved and waiting for you. No pay-by date is running: your three days start only when card payment opens, and we’ll email you then. Nothing has been charged.";
export const NOT_CONNECTED_NOTE = `${HELD_TITLE}.`;
export const TEST_PROVIDER_BADGE = "Test payment provider — staging only, no real money";

/* ---------------------------------------------- a failed card payment (POL-FE-31) */

/** Stripe's decline codes in plain words; anything else is left out of the
 *  headline and kept, verbatim, in the small reference line for support. */
const PLAIN_FAILURE: Record<string, string> = {
  card_declined: "your bank declined the card",
  generic_decline: "your bank declined the card",
  insufficient_funds: "the card didn’t have enough funds",
  expired_card: "the card has expired",
  incorrect_cvc: "the security code didn’t match",
  incorrect_number: "the card number didn’t match",
  invalid_number: "the card number didn’t match",
  processing_error: "Stripe couldn’t process the card just then",
  authentication_required: "your bank asked for extra authentication and it wasn’t completed",
  do_not_honor: "your bank declined the card",
  fraudulent: "your bank declined the card",
  lost_card: "your bank declined the card",
  stolen_card: "your bank declined the card",
};

/** The reason in words, or null when Stripe gave none we can translate. */
export function plainFailure(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return PLAIN_FAILURE[reason.trim().toLowerCase()] ?? null;
}

/**
 * What a sponsor reads after a failed card payment: what happened (in plain
 * words when Stripe's code has them), what to do next, and how to reach
 * support. The provider's code and reference stay out of the headline and
 * go in `reference`, a small line a sponsor can quote to support.
 */
export function failedPaymentWords(
  latest: Pick<ApiPaymentAttempt, "failureReason" | "providerRef"> | null,
  supportEmail: string | null | undefined,
): { text: string; reference: string | null } {
  const why = plainFailure(latest?.failureReason);
  const help = supportEmail ? `write to ${supportEmail}` : "contact BTG";
  const text = [
    why ? `Nothing was charged — ${why}.` : "Nothing was charged.",
    "Your order is still approved. Try again on Stripe’s page with the same card or another one.",
    `If it keeps failing, call the number on your card or ${help} and we’ll sort it out with you.`,
  ].join(" ");
  const parts = [
    latest?.providerRef ? `Reference for support: ${latest.providerRef}` : null,
    latest?.failureReason && !why ? `Stripe’s code: ${latest.failureReason}` : null,
  ].filter(Boolean);
  return { text, reference: parts.length ? parts.join(" · ") : null };
}

/** "Pay $1,000.00 by card. Leaves SponsorX and opens Stripe." — every Stripe CTA ends so. */
export function stripeCta(label: string): { label: string; ariaLabel: string } {
  return { label, ariaLabel: `${label}. Leaves SponsorX and opens Stripe.` };
}

/**
 * The order's state plus its latest payment attempt → the card to show.
 *
 *  - paid or later                         → E3 (the order state decides, not the attempt)
 *  - due, latest PROCESSING (or SUCCEEDED
 *    before the order has caught up)       → E2, and the page polls
 *  - due, latest FAILED                    → E4, with the provider's reason
 *  - due otherwise (no attempt, or one the
 *    sponsor walked away from — PENDING)   → E1
 *
 *  - due, card payment closed (canPay false,
 *    POL-FE-04)                             → held: no countdown, no button
 *
 * `payment` may be null when its read failed — the card then says so rather
 * than guessing, and offers no button. `opts.supportEmail` is the address a
 * failed payment's banner points to (POL-FE-31).
 */
export function paymentView(orderState: string, payment: ApiOrderPayment | null, opts: { supportEmail?: string | null } = {}): PaymentView {
  const latest = payment?.latest ?? null;

  if (PAID_OR_LATER.has(orderState)) {
    const confirmed = latest?.state === "SUCCEEDED";
    const amount = payment ? usd(payment.amountCents) : null;
    return {
      kind: "paid",
      status: amount ? `Paid ${amount}` : "Paid",
      tone: "accent",
      banner: {
        title: confirmed ? `Paid ✓ · confirmed by the payment provider ${fmtStamp(latest.updatedAt)}` : "Paid ✓ · payment recorded by BTG",
        text: "Sellers deliver on the dates of each line.",
        detail: null,
        role: "status",
      },
      cta: null,
      note: null,
      poll: false,
    };
  }

  if (orderState === "PENDING_SELLER") {
    return {
      kind: "not-open",
      status: "Not due yet",
      tone: "neutral",
      banner: null,
      cta: null,
      note: "You can pay by card once the seller accepts this order. Nothing is charged until then.",
      poll: false,
    };
  }

  if (orderState === "PENDING_APPROVAL") {
    return {
      kind: "not-open",
      status: "Not due yet",
      tone: "neutral",
      banner: null,
      cta: null,
      note: "You can pay by card once BTG approves this order. Nothing is charged until then.",
      poll: false,
    };
  }

  if (!DUE.has(orderState)) {
    return { kind: "none", status: "", tone: "neutral", banner: null, cta: null, note: null, poll: false };
  }

  if (!payment) {
    return {
      kind: "due",
      status: "Unavailable",
      tone: "neutral",
      banner: null,
      cta: null,
      note: "The payment status couldn't be loaded just now. Refresh the page in a minute.",
      poll: false,
    };
  }

  if (latest?.state === "PROCESSING" || latest?.state === "SUCCEEDED") {
    return {
      kind: "processing",
      status: "Confirming…",
      tone: "primary",
      banner: {
        title: "Payment received — confirming…",
        text: "You’re back from Stripe. We’re waiting for the payment provider to confirm the payment, which usually takes under a minute. You can leave this page.",
        detail: null,
        role: "status",
      },
      cta: null,
      note: "Please don’t pay again. We’ll update this page and email you as soon as the payment provider confirms.",
      poll: true,
    };
  }

  const amount = usd(payment.amountCents);
  if (latest?.state === "FAILED") {
    const words = failedPaymentWords(latest, opts.supportEmail);
    return {
      kind: "failed",
      status: "Not paid",
      tone: "danger",
      banner: {
        title: "Your card payment didn’t go through",
        text: words.text,
        detail: words.reference,
        role: "alert",
      },
      cta: stripeCta("Try again on Stripe"),
      note: payment.canPay ? PAY_NOTE : NOT_CONNECTED_NOTE,
      poll: false,
    };
  }

  /* POL-FE-04 — approved while card payment is closed: held, no pay-by
     date, no countdown, no button. The API's deadlineAt / paymentDueAt are
     null meanwhile, so nothing here could count down even if it tried. */
  if (!payment.canPay) {
    return {
      kind: "held",
      status: "Held for you",
      tone: "primary",
      banner: { title: HELD_TITLE, text: HELD_TEXT, detail: null, role: "status" },
      cta: null,
      note: null,
      poll: false,
    };
  }

  return {
    kind: "due",
    status: "Due now",
    tone: "warn",
    banner: {
      title: "Approved — payment due",
      text: "Pay the total within 3 days to start delivery. Nothing has been charged yet.",
      detail: null,
      role: "region",
    },
    cta: stripeCta(`Pay ${amount} by card`),
    note: payment.canPay ? PAY_NOTE : NOT_CONNECTED_NOTE,
    poll: false,
  };
}

/** The line under the lines list, where the order's generic hint would talk
 *  about invoicing — replaced while payment is by card. */
export function paymentHint(kind: PaymentKind): string | null {
  if (kind === "due" || kind === "failed") return "Your order is approved. Pay the total by card to start delivery.";
  if (kind === "held") return "Your order is approved and held for you. Card payment opens soon — we’ll email your pay-by date.";
  if (kind === "processing") return "Your payment is being confirmed by the payment provider.";
  return null;
}

/* ------------------------------------------------------------ the tracker */

export type TrackerStep = {
  label: "Order placed" | "Approved" | "Payment" | "In delivery" | "Complete";
  state: "done" | "current" | "todo";
  /** A date for a done step, a short word for the current one ("Due now"), or "". */
  note: string;
  tone: Tone;
};

/** How long the page keeps refreshing itself while the provider confirms. */
export const POLL_MS = 3000;
export const POLL_LIMIT = 100; // ~5 minutes, then the page asks for a manual refresh

/* ---------------------------------------------- paying: refusals (2S5-FE-11) */

export const PAYMENT_BUSY = "The payment service is busy. Try again in a minute.";
export const PAY_NOT_ALLOWED = "Your role can't pay for orders — a Sponsor Admin pays for your organisation.";

/**
 * What the sponsor reads when POST /marketplace-orders/:id/pay is refused.
 * A 503 with code `busy` is the provider being down — nothing was recorded,
 * so the sponsor is told to try again (the button stays enabled). A 403 is
 * the role rule in words; anything else is the API's own message (a 409 says
 * exactly why — including "provider not connected", which is NOT busy).
 */
export function payRefusal(r: { status: number; code?: string | null; message: string }): string {
  if (r.status === 503 && r.code === "busy") return PAYMENT_BUSY;
  if (r.status === 403) return PAY_NOT_ALLOWED;
  return r.message;
}

/* ------------------------------------------------- the stand-in's pages */

export type StandinDetails =
  | { kind: "account"; payeeName: string; status: string; returnPath: string }
  | { kind: "checkout"; orderRef: string; amountCents: number; sponsorName: string; state: PaymentAttemptState | string; returnPath: string };

export const STANDIN_BANNER = "Test payment provider — staging only. This page stands in for Stripe. No real money moves.";

/**
 * Where the stand-in sends the browser back to: a path on SponsorX, never
 * another site. The API signs the path into the token, so this only guards
 * against a malformed answer — "//evil.example" and "https://…" become "/".
 */
export function safeReturnPath(p: unknown): string {
  return isSafeLocalPath(p) ? p : "/";
}

/** The stand-in's details answer, checked — anything else is treated as a bad link. */
export function parseStandinDetails(body: unknown): StandinDetails | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;
  if (b.kind === "account" && typeof b.payeeName === "string") {
    return { kind: "account", payeeName: b.payeeName, status: String(b.status ?? ""), returnPath: safeReturnPath(b.returnPath) };
  }
  if (b.kind === "checkout" && typeof b.amountCents === "number" && Number.isInteger(b.amountCents)) {
    return {
      kind: "checkout",
      orderRef: String(b.orderRef ?? ""),
      amountCents: b.amountCents,
      sponsorName: String(b.sponsorName ?? ""),
      state: String(b.state ?? ""),
      returnPath: safeReturnPath(b.returnPath),
    };
  }
  return null;
}

/** The stand-in's copy for a payout account status. */
export function accountStatusLabel(status: string): string {
  if (status === "READY") return "Set up — payouts can be sent";
  if (status === "NEEDS_INFO") return "More information needed";
  return "Not set up yet";
}
