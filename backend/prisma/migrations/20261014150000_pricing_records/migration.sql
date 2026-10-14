-- 3S2-BE-03 — suggested prices kept as made, and BTG's overrides with their reasons.

-- CreateTable
CREATE TABLE "PricingRecommendation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "snapshotDay" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "currentCpmCents" INTEGER,
    "recommendedCpmCents" INTEGER NOT NULL,
    "baseCpmCents" INTEGER NOT NULL,
    "floorCpmCents" INTEGER,
    "factors" JSONB NOT NULL,
    "range" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "cpmCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingRecommendation_tenantId_inventoryId_day_key" ON "PricingRecommendation"("tenantId", "inventoryId", "day");

-- CreateIndex
CREATE INDEX "PricingOverride_tenantId_inventoryId_createdAt_idx" ON "PricingOverride"("tenantId", "inventoryId", "createdAt");

-- A suggestion and an override are never edited or deleted. The database
-- refuses an UPDATE or DELETE, as it does for facts and the audit log —
-- except a DELETE in a database marked for purging (the test databases:
-- `sponsorx.audit_purge = 'on'`). Production and staging never carry it.
CREATE OR REPLACE FUNCTION pricing_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'pricing_append_only: % % cannot be %d', TG_TABLE_NAME, OLD.id, lower(TG_OP) USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pricing_append_only ON "PricingRecommendation";
CREATE TRIGGER pricing_append_only BEFORE UPDATE OR DELETE ON "PricingRecommendation"
  FOR EACH ROW EXECUTE FUNCTION pricing_append_only();
DROP TRIGGER IF EXISTS pricing_append_only ON "PricingOverride";
CREATE TRIGGER pricing_append_only BEFORE UPDATE OR DELETE ON "PricingOverride"
  FOR EACH ROW EXECUTE FUNCTION pricing_append_only();
