import { INT4_MAX, z } from "./zod";

/* --------------------------------------------------------------------------
   The payment provider's events, in SponsorX's own words (2S5-INT-02).

   PROVIDER-NEUTRAL. Every provider's webhook is verified and then mapped, in
   lib/payment-provider.ts, onto these nine types; nothing past the adapter
   ever reads a provider's own event names. The stand-in provider (staging)
   sends this envelope as it is. Stripe's names map onto it in 2S5-INT-01:

     payment_intent.processing          → payment.processing
     payment_intent.succeeded           → payment.succeeded
     payment_intent.payment_failed      → payment.failed
     charge.refunded / refund.updated   → payment.refunded
     charge.dispute.created             → dispute.opened
     charge.dispute.closed              → dispute.closed (won | lost)
     payout.paid / transfer.paid        → payout.paid
     payout.failed                      → payout.failed (kind from failure_code)
     transfer.reversed / payout returned→ payout.returned

   A payment is named by SponsorX's own attempt id (the metadata a provider
   carries back) or the provider's payment reference; a payout by its id or
   the provider's payout reference. Amounts are whole cents.
   -------------------------------------------------------------------------- */

export const PAYMENT_EVENT_TYPES = [
  "payment.processing", "payment.succeeded", "payment.failed", "payment.refunded",
  "dispute.opened", "dispute.closed",
  "payout.paid", "payout.failed", "payout.returned",
] as const;
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
  "payment.refunded": z.object({ ...payment, refundRef: ref, amountCents: cents }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  "dispute.opened": z.object({ ...payment, disputeRef: ref, amountCents: cents, reason }).refine(names(["attemptId", "paymentRef"]), "an attemptId or a paymentRef"),
  "dispute.closed": z.object({ ...payment, disputeRef: ref, outcome: z.enum(["WON", "LOST"]), amountCents: cents.optional() }),
  "payout.paid": PayoutData,
  "payout.failed": z.object({ ...payout, kind: z.enum(["TEMPORARY", "ACCOUNT", "OTHER"]), reason }).refine(names(["payoutId", "payoutRef"]), "a payoutId or a payoutRef"),
  "payout.returned": z.object({ ...payout, reason }).refine(names(["payoutId", "payoutRef"]), "a payoutId or a payoutRef"),
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
  })
  .meta({ id: "PaymentEventsQuery", description: "Which provider events to list." });

export const StandinEventInput = z
  .object({
    type: z.enum(PAYMENT_EVENT_TYPES),
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
  .object({ state: z.enum(["OPEN", "UNDER_REVIEW", "WON", "LOST"]).optional() })
  .meta({ id: "DisputesQuery", description: "Which disputes: by state. Omitted: all, the open ones first." });

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
