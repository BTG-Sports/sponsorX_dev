-- 3S1-BE-01 — the fact ledger and the daily summaries
-- (documentation/SponsorX-Fact-Ledger.md; stack-decision Addendum D).

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "campaignId" TEXT,
    "athleteId" TEXT,
    "inventoryKind" TEXT,
    "inventoryId" TEXT,
    "channel" TEXT NOT NULL,
    "marketState" TEXT NOT NULL DEFAULT '',
    "marketCity" TEXT NOT NULL DEFAULT '',
    "measures" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reversesId" TEXT,
    "reason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDaySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "inventoryKey" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "deliverablesDue" BIGINT NOT NULL DEFAULT 0,
    "deliverablesPublished" BIGINT NOT NULL DEFAULT 0,
    "deliverablesVerified" BIGINT NOT NULL DEFAULT 0,
    "revisionsRequested" BIGINT NOT NULL DEFAULT 0,
    "viewsVerifiedApi" BIGINT NOT NULL DEFAULT 0,
    "viewsVerifiedManual" BIGINT NOT NULL DEFAULT 0,
    "viewsSelfReported" BIGINT NOT NULL DEFAULT 0,
    "viewsEstimated" BIGINT NOT NULL DEFAULT 0,
    "viewsAttributed" BIGINT NOT NULL DEFAULT 0,
    "engagementsVerifiedApi" BIGINT NOT NULL DEFAULT 0,
    "engagementsVerifiedManual" BIGINT NOT NULL DEFAULT 0,
    "engagementsSelfReported" BIGINT NOT NULL DEFAULT 0,
    "engagementsEstimated" BIGINT NOT NULL DEFAULT 0,
    "engagementsAttributed" BIGINT NOT NULL DEFAULT 0,
    "metricCorrections" BIGINT NOT NULL DEFAULT 0,
    "bookedSellCents" BIGINT NOT NULL DEFAULT 0,
    "bookedCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "cancelledSellCents" BIGINT NOT NULL DEFAULT 0,
    "cancelledCompensationCents" BIGINT NOT NULL DEFAULT 0,
    "earningsPaidCents" BIGINT NOT NULL DEFAULT 0,
    "adSlotSoldCents" BIGINT NOT NULL DEFAULT 0,
    "invoicedCents" BIGINT NOT NULL DEFAULT 0,
    "invoicePaidCents" BIGINT NOT NULL DEFAULT 0,
    "marketplaceGrossCents" BIGINT NOT NULL DEFAULT 0,
    "marketplaceNetCents" BIGINT NOT NULL DEFAULT 0,
    "marketplaceRefundedCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDaySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fact_reversesId_key" ON "Fact"("reversesId");

-- CreateIndex
CREATE INDEX "Fact_tenantId_campaignId_occurredOn_idx" ON "Fact"("tenantId", "campaignId", "occurredOn");

-- CreateIndex
CREATE INDEX "Fact_sourceType_sourceId_idx" ON "Fact"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Fact_tenantId_idempotencyKey_key" ON "Fact"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CampaignDaySummary_tenantId_day_idx" ON "CampaignDaySummary"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDaySummary_tenantId_campaignId_athleteId_channel_in_key" ON "CampaignDaySummary"("tenantId", "campaignId", "athleteId", "channel", "inventoryKey", "marketKey", "day");

-- A fact is never edited or deleted: a correction is a new fact that reverses
-- it. The database refuses an UPDATE or DELETE, as it does for the audit log —
-- except a DELETE in a database marked for purging (the test databases:
-- `sponsorx.audit_purge = 'on'`). Production and staging never carry it.
CREATE OR REPLACE FUNCTION fact_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'fact_append_only: fact % cannot be %d', OLD.id, lower(TG_OP) USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fact_append_only ON "Fact";
CREATE TRIGGER fact_append_only BEFORE UPDATE OR DELETE ON "Fact"
  FOR EACH ROW EXECUTE FUNCTION fact_append_only();
