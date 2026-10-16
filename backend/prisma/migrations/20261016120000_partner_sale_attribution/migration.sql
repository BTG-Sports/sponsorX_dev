-- 3S6-BE-02/03/04 — partner sales normalised, matched exact-first, and the
-- reconciliation queue (documentation/SponsorX-Attribution-Matching.md).

-- CreateTable
CREATE TABLE "PartnerSaleAttribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "orderId" TEXT,
    "stateCode" TEXT,
    "status" TEXT NOT NULL,
    "class" TEXT,
    "method" TEXT,
    "matchKey" TEXT,
    "windowDays" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "campaignId" TEXT,
    "athleteId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "reason" TEXT,
    "candidates" INTEGER,
    "dismissedBy" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissNote" TEXT,

    CONSTRAINT "PartnerSaleAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerSaleAttribution_partnerId_externalId_key" ON "PartnerSaleAttribution"("partnerId", "externalId");

-- CreateIndex
CREATE INDEX "PartnerSaleAttribution_tenantId_status_receivedAt_idx" ON "PartnerSaleAttribution"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "PartnerSaleAttribution_tenantId_campaignId_occurredAt_idx" ON "PartnerSaleAttribution"("tenantId", "campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "PartnerSaleAttribution_partnerId_orderId_idx" ON "PartnerSaleAttribution"("partnerId", "orderId");

-- The claims rule (SponsorX-Attribution-Claims.md), held by the database:
-- verified means an exact match on a named key, certain; modelled means a
-- named model and a confidence below 1. A modelled row can never be verified.
-- Wrapped in IS TRUE: a CHECK passes on NULL, and a missing key or confidence
-- must fail it, not slip through as "unknown".
ALTER TABLE "PartnerSaleAttribution" ADD CONSTRAINT "PartnerSaleAttribution_class_check" CHECK ((
  "status" IN ('matched', 'unmatched', 'dismissed')
  AND "kind" IN ('sale', 'refund')
  AND CASE "status"
    WHEN 'matched' THEN "campaignId" IS NOT NULL AND "reason" IS NULL AND (
      ("class" = 'VERIFIED_TRANSACTION' AND "method" = 'deterministic' AND "matchKey" IN ('token', 'order_id', 'click_id') AND "confidence" = 1 AND "modelVersion" IS NULL)
      OR ("class" = 'MODELLED' AND "method" = 'probabilistic' AND "matchKey" IS NULL AND "confidence" > 0 AND "confidence" < 1 AND "modelVersion" IS NOT NULL))
    ELSE "class" IS NULL AND "method" IS NULL AND "campaignId" IS NULL
      AND "reason" IN ('no_match', 'ambiguous', 'outside_window', 'unknown_token')
  END
) IS TRUE);
