-- P9-BE-19 follow-ups (programme owner's review, 2026-10-03): money must never
-- go untracked.
--
-- 1. A Zoho payment that arrives AFTER an edition was cancelled is owed back
--    too. The cancellation now leaves a record of each sale it undid
--    (CancelledAdSale — the released slots no longer name the campaign), so
--    the invoice ingest can find what the payment was for and put it on
--    Finance's list as PAID_AFTER_EDITION_CANCELLED: one row per (edition,
--    campaign, invoice), and never beyond what the cancelled sale was worth
--    less what was already refunded for it.
-- 2. A refunded sale stops counting toward the student who originated it.
--    SalesAttribution stays append-only (trigger sales_attribution_immutable):
--    the reversal is a NEW row, the negative of the one it reverses, named by
--    `reversesId` (unique — a sale is reversed once). Totals are sums, so the
--    student's total and SALES_500 milestones drop by the refunded sale.

-- ── 1. the sales a cancellation undid ─────────────────────────────────────
CREATE TABLE "CancelledAdSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "soldCents" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CancelledAdSale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CancelledAdSale_editionId_campaignId_key" ON "CancelledAdSale"("editionId", "campaignId");
CREATE INDEX "CancelledAdSale_tenantId_campaignId_idx" ON "CancelledAdSale"("tenantId", "campaignId");
ALTER TABLE "CancelledAdSale" ADD CONSTRAINT "CancelledAdSale_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CancelledAdSale" ADD CONSTRAINT "CancelledAdSale_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CancelledAdSale" ADD CONSTRAINT "CancelledAdSale_sold_check" CHECK ("soldCents" >= 0);

-- ── 1. a payment after the cancellation, on Finance's list ─────────────────
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION', 'EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED'));
-- attemptId names where late money came from: a card attempt for an order,
-- the CampaignInvoice for an edition's ad sale.
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_attempt_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_attempt_check"
  CHECK (("cause" IN ('PAID_AFTER_CANCELLATION', 'PAID_AFTER_EDITION_CANCELLED')) = ("attemptId" IS NOT NULL));
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_source_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_source_check" CHECK (
  ("cause" NOT IN ('EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED') AND "orderId" IS NOT NULL AND "campaignId" IS NULL AND "editionId" IS NULL)
  OR ("cause" IN ('EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED') AND "orderId" IS NULL AND "lineId" IS NULL
      AND "campaignId" IS NOT NULL AND "editionId" IS NOT NULL AND "paidVia" = 'ZOHO_INVOICE')
);
CREATE UNIQUE INDEX "RefundDue_one_per_edition_campaign_invoice" ON "RefundDue"("editionId", "campaignId", "attemptId")
  WHERE "cause" = 'PAID_AFTER_EDITION_CANCELLED';

-- ── 2. a refunded sale's attribution, reversed by a new row ───────────────
ALTER TABLE "SalesAttribution" ADD COLUMN "reversesId" TEXT;
CREATE UNIQUE INDEX "SalesAttribution_reversesId_key" ON "SalesAttribution"("reversesId");
ALTER TABLE "SalesAttribution" ADD CONSTRAINT "SalesAttribution_reversesId_fkey"
    FOREIGN KEY ("reversesId") REFERENCES "SalesAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A sale is never negative; a reversal always is, and always names its sale.
ALTER TABLE "SalesAttribution" ADD CONSTRAINT "SalesAttribution_reversal_check"
  CHECK (("reversesId" IS NULL AND "value" >= 0) OR ("reversesId" IS NOT NULL AND "value" < 0));
