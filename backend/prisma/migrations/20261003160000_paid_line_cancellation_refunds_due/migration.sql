-- 2S4-BE-12 — cancelling a paid order line; 2S4-BE-13 — refunds to send
-- (programme owner, 2026-10-02).
--
-- A sponsor cancels a paid line for free until 3 days before its first date;
-- closer than that they ask the seller (a CANCELLATION issue: the seller
-- accepts, declines, or doesn't answer — BTG decides the last two). A seller
-- cancels a line it can't deliver, and the sponsor is refunded in full. Every
-- refund of money actually received leaves a RefundDue row for Finance to
-- send by hand until a payment provider is connected.

-- The line: who cancelled it, why, and the seller it counts against.
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelledByUser" TEXT;
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelledSellerType" TEXT;
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelledSellerId" TEXT;
ALTER TABLE "OrderLineDelivery" ADD COLUMN "cancelNote" TEXT;
CREATE INDEX "OrderLineDelivery_cancelledSellerType_cancelledSellerId_cancelledAt_idx"
    ON "OrderLineDelivery"("cancelledSellerType", "cancelledSellerId", "cancelledAt");
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_cancellation_check" CHECK (
  ("cancelledBy" IS NULL OR "cancelledBy" IN ('SPONSOR', 'SELLER', 'AGREED', 'BTG'))
  AND (("cancelledAt" IS NULL) = ("cancelledBy" IS NULL))
  -- A cancelled paid line is a refunded line.
  AND ("cancelledAt" IS NULL OR "state" = 'REFUNDED')
  AND ("cancelledSellerType" IS NULL OR "cancelledSellerType" IN ('PROPERTY', 'ATHLETE'))
  AND (("cancelledSellerType" IS NULL) = ("cancelledSellerId" IS NULL))
  -- A seller's cancellation names the seller it counts against, and why.
  AND ("cancelledBy" IS DISTINCT FROM 'SELLER' OR ("cancelledSellerId" IS NOT NULL AND length(btrim(coalesce("cancelNote", ''))) > 0))
);

-- The order: why it was refunded. A cancellation refund does not stop the
-- sponsor's spending limit rising (spending-limit.ts).
ALTER TABLE "MarketplaceOrder" ADD COLUMN "refundCause" TEXT;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_refundCause_check"
  CHECK ("refundCause" IS NULL OR "refundCause" IN ('CANCELLATION', 'PROBLEM', 'BTG'));

-- The cancellation request rides on the delivery issue's stages, timeline and desk.
ALTER TABLE "DeliveryIssue" DROP CONSTRAINT "DeliveryIssue_kind_check";
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_kind_check" CHECK ("kind" IN ('PROBLEM', 'OVERDUE', 'CANCELLATION'));
ALTER TABLE "DeliveryIssue" DROP CONSTRAINT "DeliveryIssue_seller_answer_check";
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_seller_answer_check"
  CHECK ("sellerAnswer" IS NULL OR "sellerAnswer" IN ('DELIVER_AGAIN', 'REFUND', 'DISAGREE', 'ACCEPT', 'DECLINE'));
ALTER TABLE "DeliveryIssue" DROP CONSTRAINT "DeliveryIssue_reason_check";
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_reason_check"
  CHECK ("escalationReason" IS NULL OR "escalationReason" IN (
    'SPONSOR_REJECTED', 'SELLER_NO_ANSWER', 'SPONSOR_NO_ANSWER', 'NOT_DELIVERED', 'REPORTED_TO_BTG',
    'SELLER_DECLINED_CANCELLATION', 'SELLER_DIDNT_ANSWER_CANCELLATION'));
ALTER TABLE "DeliveryIssue" DROP CONSTRAINT "DeliveryIssue_outcome_check";
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_outcome_check"
  CHECK ("outcome" IS NULL OR "outcome" IN ('REDELIVER', 'REFUNDED', 'CONFIRMED', 'MARKED_DELIVERED', 'ORDER_ENDED', 'KEPT', 'SELLER_CANCELLED'));

ALTER TABLE "DeliveryIssue" DROP CONSTRAINT "DeliveryIssue_shape_check";
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_shape_check" CHECK (
  length(btrim("problemNote")) > 0
  -- The seller's turn: a deadline, no answer yet.
  AND ("stage" <> 'SELLER_TO_ANSWER' OR ("kind" IN ('PROBLEM', 'CANCELLATION') AND "sellerDueAt" IS NOT NULL AND "sellerAnswer" IS NULL))
  -- The sponsor's turn: the seller has answered; a deadline, no answer yet. (Problems only.)
  AND ("stage" <> 'SPONSOR_TO_ANSWER' OR ("kind" = 'PROBLEM' AND "sellerAnswer" IS NOT NULL AND "sponsorDueAt" IS NOT NULL AND "sponsorAnswer" IS NULL))
  -- With BTG, or decided by BTG: why it went there is always recorded.
  AND ("stage" NOT IN ('ESCALATED', 'RESOLVED') OR ("escalatedAt" IS NOT NULL AND "escalationReason" IS NOT NULL AND length(btrim(coalesce("escalationNote", ''))) > 0))
  -- Open has no outcome; finished has one, and when.
  AND (("stage" IN ('SELLER_TO_ANSWER', 'SPONSOR_TO_ANSWER', 'ESCALATED')) = ("outcome" IS NULL AND "closedAt" IS NULL))
  -- BTG decides confirmed or refunded (a problem), refunded or kept (a cancellation), with a note everyone reads.
  AND ("stage" <> 'RESOLVED' OR (
        ("outcome" IN ('CONFIRMED', 'REFUNDED') AND "kind" IN ('PROBLEM', 'OVERDUE'))
     OR ("outcome" IN ('REFUNDED', 'KEPT') AND "kind" = 'CANCELLATION'))
     AND length(btrim(coalesce("closingNote", ''))) > 0)
  -- An answer carries what it needs.
  AND ("sellerAnswer" IS NULL OR ("sellerAnsweredAt" IS NOT NULL))
  AND ("sellerAnswer" IS DISTINCT FROM 'DELIVER_AGAIN' OR ("redeliverOn" IS NOT NULL AND length(btrim(coalesce("sellerNote", ''))) > 0))
  AND ("sellerAnswer" IS DISTINCT FROM 'DISAGREE' OR length(btrim(coalesce("sellerNote", ''))) > 0)
  AND ("sellerAnswer" IS DISTINCT FROM 'DECLINE' OR length(btrim(coalesce("sellerNote", ''))) > 0)
  -- A problem's answers are a problem's; a cancellation's are a cancellation's.
  AND ("kind" <> 'CANCELLATION' OR ("sellerAnswer" IS NULL OR "sellerAnswer" IN ('ACCEPT', 'DECLINE')) AND "sponsorAnswer" IS NULL)
  AND ("kind" <> 'PROBLEM' OR "sellerAnswer" IS NULL OR "sellerAnswer" IN ('DELIVER_AGAIN', 'REFUND', 'DISAGREE'))
  AND ("sponsorAnswer" IS NULL OR "sponsorAnswer" IS NOT NULL AND "sponsorAnsweredAt" IS NOT NULL)
  AND ("sponsorAnswer" IS DISTINCT FROM 'REJECT' OR length(btrim(coalesce("sponsorNote", ''))) > 0)
  -- An overdue hand-over has no exchange.
  AND ("kind" <> 'OVERDUE' OR ("sellerAnswer" IS NULL AND "sponsorAnswer" IS NULL))
  AND ("sellerProofLink" IS NULL OR "sellerProofLink" LIKE 'https://%')
  AND ("markedProofLink" IS NULL OR "markedProofLink" LIKE 'https://%')
);

-- Refunds to send.
CREATE TABLE "RefundDue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT,
    "sponsorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cause" TEXT NOT NULL,
    "paidVia" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "method" TEXT,
    "reference" TEXT,
    "sentOn" DATE,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundDue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefundDue_orderId_lineId_key" ON "RefundDue"("orderId", "lineId");
-- (orderId, lineId) is unique, but NULLs are distinct: one whole-order row per order as well.
CREATE UNIQUE INDEX "RefundDue_one_whole_order" ON "RefundDue"("orderId") WHERE "lineId" IS NULL;
CREATE INDEX "RefundDue_tenantId_state_createdAt_idx" ON "RefundDue"("tenantId", "state", "createdAt");
CREATE INDEX "RefundDue_tenantId_sponsorId_idx" ON "RefundDue"("tenantId", "sponsorId");
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_state_check" CHECK ("state" IN ('OPEN', 'SENT'));
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER'));
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_paidVia_check"
  CHECK ("paidVia" IS NULL OR "paidVia" IN ('CARD', 'ZOHO_INVOICE', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'));
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_method_check"
  CHECK ("method" IS NULL OR "method" IN ('BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'));
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_shape_check" CHECK (
  "amountCents" > 0
  -- On its way: nothing about sending yet. Sent: how, the reference, the day, and who.
  AND ("state" <> 'OPEN' OR ("sentAt" IS NULL AND "sentBy" IS NULL AND "method" IS NULL AND "reference" IS NULL AND "sentOn" IS NULL))
  AND ("state" <> 'SENT' OR ("sentAt" IS NOT NULL AND "sentBy" IS NOT NULL AND "method" IS NOT NULL AND "sentOn" IS NOT NULL
       AND "reference" IS NOT NULL AND length(btrim("reference")) BETWEEN 1 AND 200))
);
