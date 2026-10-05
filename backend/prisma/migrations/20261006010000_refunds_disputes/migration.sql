-- 2S5-BE-03 — refunds the provider reports, and disputes.
-- (documentation/SponsorX-Phase2-State-Machines.md §5, §7;
--  documentation/SponsorX-Phase2-Ledger-Design.md §4.)

-- ── PaymentRefund: a refund the provider reported, once per refund ─────────
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundRef" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refundDueId" TEXT,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentRefund_provider_providerRefundRef_key" ON "PaymentRefund"("provider", "providerRefundRef");
CREATE INDEX "PaymentRefund_tenantId_orderId_idx" ON "PaymentRefund"("tenantId", "orderId");
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_shape_check" CHECK (
  "amountCents" > 0 AND "outcome" IN ('CONFIRMED', 'APPLIED', 'HELD', 'DISMISSED')
  -- CONFIRMED: it confirms a refund SponsorX sent. APPLIED: SponsorX refunded
  -- the order because of it. Both name that refund. HELD: BTG's, and it holds
  -- the order's payouts until BTG refunds the order in SponsorX (→ APPLIED) or
  -- closes it without (DISMISSED); neither names a refund.
  AND (("outcome" IN ('CONFIRMED', 'APPLIED')) = ("refundDueId" IS NOT NULL)));
CREATE UNIQUE INDEX "PaymentRefund_refundDueId_key" ON "PaymentRefund"("refundDueId") WHERE "refundDueId" IS NOT NULL;

-- ── PaymentDispute: the sponsor disputed the payment with their bank ───────
-- OPEN → UNDER_REVIEW → WON | LOST. Never decided by the system: the
-- provider's outcome is recorded, and a BTG person resolves it to that outcome.
CREATE TABLE "PaymentDispute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT,
    "sponsorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerDisputeRef" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "providerOutcome" TEXT,
    "providerClosedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL,
    "reviewStartedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "lineIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ledgerReversed" BOOLEAN NOT NULL DEFAULT false,
    "owedBackCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentDispute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentDispute_provider_providerDisputeRef_key" ON "PaymentDispute"("provider", "providerDisputeRef");
CREATE INDEX "PaymentDispute_tenantId_state_idx" ON "PaymentDispute"("tenantId", "state");
CREATE INDEX "PaymentDispute_orderId_state_idx" ON "PaymentDispute"("orderId", "state");
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_state_check"
  CHECK ("state" IN ('OPEN', 'UNDER_REVIEW', 'WON', 'LOST')
         AND ("providerOutcome" IS NULL OR "providerOutcome" IN ('WON', 'LOST'))
         AND ("providerOutcome" IS NULL) = ("providerClosedAt" IS NULL)
         AND "amountCents" > 0 AND "owedBackCents" >= 0);
-- Out of OPEN only by a person's review.
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_reviewed_check"
  CHECK ("state" = 'OPEN' OR ("reviewStartedAt" IS NOT NULL AND "reviewedBy" IS NOT NULL));
-- Closed only by a person, and only to the outcome the provider reported.
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_resolved_check"
  CHECK (("state" IN ('WON', 'LOST')) = ("resolvedAt" IS NOT NULL)
         AND ("state" NOT IN ('WON', 'LOST') OR ("resolvedBy" IS NOT NULL AND "resolvedBy" <> 'system' AND "state" = "providerOutcome")));
-- The books are reversed only for a dispute that was lost.
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_reversal_check"
  CHECK (NOT "ledgerReversed" OR "state" = 'LOST');

-- ── RefundDue: a refund the provider made, recorded as already sent ────────
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION', 'EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED', 'PROVIDER_REFUNDED'));
