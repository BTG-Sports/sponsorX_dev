-- P8-BE-12 — cancel and change a campaign, automatically.

-- An earning whose order was cancelled before any work: nothing is owed.
ALTER TYPE "EarningState" ADD VALUE IF NOT EXISTS 'VOIDED';

-- A cancel or change held for BTG.
CREATE TABLE "CampaignChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'HELD',
    "reason" TEXT,
    "proposed" JSONB,
    "holdReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "impact" JSONB NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByEmail" TEXT,
    "requestedByRole" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByEmail" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignChangeRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignChangeRequest_kind_check" CHECK ("kind" IN ('CANCEL', 'CHANGE')),
    CONSTRAINT "CampaignChangeRequest_state_check" CHECK ("state" IN ('HELD', 'APPLIED', 'DECLINED')),
    -- Decided: when and by whom; a decline says why.
    CONSTRAINT "CampaignChangeRequest_decided_check" CHECK (
      ("state" = 'HELD') = ("decidedAt" IS NULL)
      AND ("state" = 'HELD' OR "decidedById" IS NOT NULL)
      AND ("state" <> 'DECLINED' OR length(btrim(coalesce("decisionNote", ''))) > 0))
);
CREATE INDEX "CampaignChangeRequest_tenantId_state_createdAt_idx" ON "CampaignChangeRequest"("tenantId", "state", "createdAt");
CREATE INDEX "CampaignChangeRequest_campaignId_idx" ON "CampaignChangeRequest"("campaignId");
CREATE UNIQUE INDEX "CampaignChangeRequest_one_held" ON "CampaignChangeRequest"("campaignId") WHERE "state" = 'HELD';
ALTER TABLE "CampaignChangeRequest" ADD CONSTRAINT "CampaignChangeRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A cancelled campaign's money back to the sponsor: named by the campaign, paid via its Zoho invoice.
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION', 'PAID_AFTER_REFUND', 'PAID_TWICE',
  'EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED', 'PROVIDER_REFUNDED',
  'CAMPAIGN_CANCELLED'));
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_source_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_source_check" CHECK (
  ("cause" NOT IN ('EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED', 'CAMPAIGN_CANCELLED') AND "orderId" IS NOT NULL AND "campaignId" IS NULL AND "editionId" IS NULL)
  OR ("cause" IN ('EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED') AND "orderId" IS NULL AND "lineId" IS NULL
      AND "campaignId" IS NOT NULL AND "editionId" IS NOT NULL AND "paidVia" = 'ZOHO_INVOICE')
  OR ("cause" = 'CAMPAIGN_CANCELLED' AND "orderId" IS NULL AND "lineId" IS NULL
      AND "campaignId" IS NOT NULL AND "editionId" IS NULL AND "paidVia" = 'ZOHO_INVOICE')
);
CREATE UNIQUE INDEX "RefundDue_one_per_cancelled_campaign" ON "RefundDue"("campaignId") WHERE "cause" = 'CAMPAIGN_CANCELLED';
