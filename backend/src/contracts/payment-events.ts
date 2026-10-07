import { INT4_MAX, z } from "./zod";

/* --------------------------------------------------------------------------
   The payment provider's events, in SponsorX's own words (2S5-INT-02).

   PROVIDER-NEUTRAL. Every provider's webhook is verified and then mapped, in
   lib/payment-provider.ts, onto these types; nothing past the adapter ever
   reads a provider's own event names. The stand-in provider (staging) sends
   this envelope as it is. Stripe's events are mapped in lib/stripe.ts
   (2S5-INT-01 / -03); the table, and why, is in
   documentation/SponsorX-Stripe-Integration.md §4:

     checkout.session.completed (paid)        → payment.succeeded
     checkout.session.completed (unpaid)      → payment.processing
     checkout.session.async_payment_succeeded → payment.succeeded
     checkout.session.async_payment_failed    → payment.failed
     checkout.session.expired                 → payment.failed
     refund.created / refund.updated /
       charge.refund.updated (succeeded),
       charge.refunded (its refunds)          → payment.refunded
     charge.dispute.created                   → dispute.opened
     charge.dispute.closed                    → dispute.closed (won | lost)
     transfer.created                         → payout.paid
     transfer.reversed (in full)              → payout.returned
     v2.core.account… (thin, Accounts v2),
       capability.updated, account.updated    → account.updated
     refund.failed, a part reversal, a payee's
       bank payout failing (Connect)          → provider.notice (BTG's)

   `account.updated` is a payee's payout account at the provider, ready or
   not (2S5-INT-03). `provider.notice` is something the provider reported
   that SponsorX must not act on by itself: always HELD for BTG, in words.

   A payment is named by SponsorX's own attempt id (the metadata a provider
   carries back) or the provider's payment reference; a payout by its id or
   the provider's payout reference. Amounts are whole cents.
   -------------------------------------------------------------------------- */

/** The events about an order's payment or a payout — what staging's "send a test event" can send. */
export const STANDIN_EVENT_TYPES = [
  "payment.processing", "payment.succeeded", "payment.failed", "payment.refunded",
  "dispute.opened", "dispute.closed",
  "payout.paid", "payout.failed", "payout.returned",
] as const;
export const PAYMENT_EVENT_TYPES = [...STANDIN_EVENT_TYPES, "account.updated", "provider.notice"] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export const PAYMENT_EVENT_STATUSES = ["RECEIVED", "APPLIED", "IGNORED", "DEFERRED", "HELD", "FAILED"] as const;
export type PaymentEventStatus = (typeof PAYMENT_EVENT_STATUSES)[number];

const ref = z.string().trim().min(1).max(200);
const cents = z.number().int().min(1).max(INT4_MAX);
const reason = z.string().trim().max(500).optional();

/** A payment, as the provider names it: SponsorX's attempt id, or the provider's reference. */
const payment = { attemptId: ref.optional(), paymentRef: ref.optional() };
const payout = { payoutId: ref.optional(), payoutRef: ref.optional() };
const names = (keys: string[]) => (d: Record<string, unknown>) => keys.some((k) => typeof d[k] === "string" && (d[k] as string).length > 0);

const PaymentData = z.object(payment).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef");
const PayoutData = z.object(payout).refine(names(["payoutId", "payoutRef"]), "a payoutId or a payoutRef");

export const PAYMENT_EVENT_DATA = {
  "payment.processing": PaymentData,
  "payment.succeeded": z.object({ ...payment, amountCents: cents }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  "payment.failed": z.object({ ...payment, reason }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  /* refundDueId: SponsorX's own refund, carried back in the provider's metadata — it is ours even before its reference is written. */
  "payment.refunded": z.object({ ...payment, refundRef: ref, amountCents: cents, refundDueId: ref.optional() }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  "dispute.opened": z.object({ ...payment, disputeRef: ref, amountCents: cents, reason }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  "dispute.closed": z.object({ ...payment, disputeRef: ref, outcome: z.enum(["WON", "LOST"]), amountCents: cents.optional() }),
  "payout.paid": PayoutData,
  "payout.failed": z.object({ ...payout, kind: z.enum(["TEMPORARY", "ACCOUNT", "OTHER"]), reason }).refine(names(["payoutId", "payoutRef"]), "a payoutId or a payoutRef"),
  "payout.returned": z.object({ ...payout, reason }).refine(names(["payoutId", "payoutRef"]), "a payoutId or a payoutRef"),
  /* 2S5-INT-03 — the provider's account id, and whether money can be sent to it. `rejected`: the provider closed it; the payee can't fix that.
     No status: the provider only said it changed (a thin event) — the worker reads the account afresh. */
  "account.updated": z.object({ accountRef: ref, status: z.enum(["READY", "NEEDS_INFO"]).optional(), reason, rejected: z.boolean().optional() }),
  "provider.notice": z.object({ subject: ref, summary: z.string().trim().min(1).max(1000) }),
} as const satisfies Record<PaymentEventType, z.ZodType>;

export type PaymentEventData<T extends PaymentEventType> = z.infer<(typeof PAYMENT_EVENT_DATA)[T]>;

/** The neutral event: what every provider's webhook is mapped onto. */
export type NeutralPaymentEvent = {
  /** The provider's own event id — the idempotency key. */
  id: string;
  type: PaymentEventType;
  occurredAt: Date;
  data: Record<string, unknown>;
};

export const ProviderWebhookEnvelope = z
  .object({
    id: ref.describe("The provider's event id. A second delivery of the same id is a no-op."),
    type: z.enum(PAYMENT_EVENT_TYPES),
    created: z.iso.datetime().describe("When the provider says it happened"),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({
    id: "ProviderWebhookEnvelope",
    description:
      "A payment provider's event, as the stand-in provider sends it (a real provider's own format is mapped onto these types by the adapter). " +
      "Signed: the `x-standin-signature` header is `t=<unix seconds>,v1=<hex HMAC-SHA256 of \"<t>.<raw body>\">`.",
  });

export const PaymentEventsQuery = z
  .object({
    status: z.string().max(80).optional().describe("Comma-separated: RECEIVED, APPLIED, IGNORED, DEFERRED, HELD, FAILED. Omitted: the exceptions — HELD, FAILED and DEFERRED — not yet resolved."),
    /* 2S5-FE-07 — the desk's Resolved tab: only events a person closed (true), or only those nobody has (false). */
    resolved: z.enum(["true", "false"]).optional().describe("true: only events BTG has marked dealt with; false: only those not yet. Omitted: both (or, with no ?status, the unresolved exceptions)."),
    /* 2S5-FE-07 — the house pager; without ?page the list is unpaged (capped at 200). */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "PaymentEventsQuery", description: "Which provider events to list, and which page of them." });

export const StandinEventInput = z
  .object({
    type: z.enum(STANDIN_EVENT_TYPES),
    orderId: ref.optional().describe("payment.* and dispute.*: the order whose latest card payment the event is about"),
    payoutId: ref.optional().describe("payout.*: the payout"),
    disputeRef: ref.optional().describe("dispute.*: the provider's dispute reference (default: one per payment)"),
    refundRef: ref.optional().describe("payment.refunded: the provider's refund reference (default: a new one)"),
    amountCents: cents.optional().describe("Default: the payment's whole amount"),
    outcome: z.enum(["WON", "LOST"]).optional().describe("dispute.closed"),
    kind: z.enum(["TEMPORARY", "ACCOUNT", "OTHER"]).optional().describe("payout.failed"),
    reason: reason,
    deliveries: z.number().int().min(1).max(3).optional().describe("Send the same event this many times — a provider retrying its delivery"),
  })
  .strict()
  .meta({ id: "StandinEventInput", description: "Staging only: have the stand-in payment provider send an event, once or more, in any order." });

/* 2S5-BE-03 — disputes, on BTG's side. */
export const DisputesQuery = z
  .object({
    state: z.enum(["OPEN", "UNDER_REVIEW", "WON", "LOST"]).optional(),
    /* 2S5-FE-08 — the house pager; without ?page the list is unpaged (capped at 200, open ones first). */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "DisputesQuery", description: "Which disputes: by state, and which page of them. Omitted: all, the open ones first." });

export const DisputeReviewInput = z
  .object({ note: z.string().trim().min(1).max(2000).describe("What BTG sent the provider (the evidence), or is gathering") })
  .strict()
  .meta({ id: "DisputeReviewInput", description: "BTG takes a dispute for review: OPEN → UNDER_REVIEW." });

export const DisputeResolveInput = z
  .object({
    note: z.string().trim().min(1).max(2000).describe("How it was resolved"),
    lineIds: z.array(ref).max(200).optional().describe("A dispute lost on part of the order: the lines it was for (their books are reversed). Not needed for the whole order."),
  })
  .strict()
  .meta({ id: "DisputeResolveInput", description: "A BTG admin resolves a dispute under review to the outcome the provider reported (WON or LOST)." });

export const PaymentEventResolveInput = z
  .object({ note: z.string().trim().min(1).max(2000).describe("What BTG did about it — the record for whoever looks next") })
  .strict()
  .meta({ id: "PaymentEventResolveInput", description: "BTG has dealt with a held or failed provider event (recorded the payment by hand, refunded it, confirmed it with the provider)." });
