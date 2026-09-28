-- Phase 2 batch 3 — 2S2-BE-01 inventory, 2S2-BE-04 team roster share, 2S3-BE-01 listings
-- (with the operator tenant), 2S2-BE-03 formal offers, 2S7-BE-01 tenant branding.
-- CreateEnum
CREATE TYPE "ListingState" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfferState" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN     "teamShareBps" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "operatorTenantId" TEXT;

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT,
    "propertyId" TEXT,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "categories" TEXT[],
    "restrictedCategories" TEXT[],
    "packageRules" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "state" "ListingState" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "brief" TEXT NOT NULL,
    "compensation" INTEGER NOT NULL,
    "sellPrice" INTEGER NOT NULL,
    "deliverables" JSONB NOT NULL,
    "usageRights" TEXT NOT NULL,
    "exclusivityDays" INTEGER,
    "disclosures" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" "OfferState" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "termsHash" TEXT,
    "termsSnapshot" JSONB,
    "orderId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBranding" (
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT,
    "logoKey" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "reportFooter" TEXT,
    "customDomain" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantBranding_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_athleteId_idx" ON "InventoryItem"("tenantId", "athleteId");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_propertyId_idx" ON "InventoryItem"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "Listing_tenantId_state_idx" ON "Listing"("tenantId", "state");

-- CreateIndex
CREATE INDEX "Listing_inventoryItemId_state_idx" ON "Listing"("inventoryItemId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_orderId_key" ON "Offer"("orderId");

-- CreateIndex
CREATE INDEX "Offer_tenantId_state_idx" ON "Offer"("tenantId", "state");

-- CreateIndex
CREATE INDEX "Offer_tenantId_athleteId_idx" ON "Offer"("tenantId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBranding_customDomain_key" ON "TenantBranding"("customDomain");

-- CreateIndex
CREATE INDEX "Tenant_operatorTenantId_idx" ON "Tenant"("operatorTenantId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NilJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CampaignOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: an organisation BTG already approved is operated by the tenant that approved it.
UPDATE "Tenant" t SET "operatorTenantId" = o."tenantId"
  FROM "PropertyOnboarding" o JOIN "Property" p ON p.id = o."propertyId"
 WHERE p."tenantId" = t.id AND t.id <> o."tenantId" AND t."operatorTenantId" IS NULL;

-- 2S2-BE-01 / 2S3-BE-01 — rules Prisma cannot express.
-- An inventory item has exactly one owner (an athlete or a team), a positive
-- price, a non-negative quantity and a window that closes after it opens; an
-- item has at most one live listing, so a buyer never sees it twice.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_one_owner";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_one_owner"
  CHECK (("athleteId" IS NULL) <> ("propertyId" IS NULL));
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_priced";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_priced"
  CHECK ("priceCents" > 0 AND ("quantity" IS NULL OR "quantity" >= 0)
         AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil" >= "availableFrom"));
DROP INDEX IF EXISTS "Listing_one_live_per_item";
CREATE UNIQUE INDEX "Listing_one_live_per_item" ON "Listing" ("inventoryItemId") WHERE "state" <> 'ARCHIVED';
ALTER TABLE "Athlete" DROP CONSTRAINT IF EXISTS "Athlete_team_share_range";
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_team_share_range"
  CHECK ("teamShareBps" IS NULL OR ("teamShareBps" >= 0 AND "teamShareBps" <= 10000));

-- 2S2-BE-03 — an offer's terms do not move once the athlete has them.
--
-- "Accepting an offer freezes commercial terms ... later rate-card edits do
-- not alter it." The application never updates them past DRAFT; this makes it
-- Postgres's rule too, so a future code path cannot quietly rewrite what an
-- athlete agreed to. Once SENT, the terms and their hash are fixed; once a
-- snapshot is written it and the order link are fixed; ACCEPTED is final.
-- (Idempotent: CI re-applies every file here after migrating.)

CREATE OR REPLACE FUNCTION offer_terms_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state" <> 'DRAFT' AND (
       NEW."campaignId" IS DISTINCT FROM OLD."campaignId" OR NEW."athleteId" IS DISTINCT FROM OLD."athleteId"
    OR NEW."jobId" IS DISTINCT FROM OLD."jobId" OR NEW."inventoryItemId" IS DISTINCT FROM OLD."inventoryItemId"
    OR NEW."brief" IS DISTINCT FROM OLD."brief" OR NEW."compensation" IS DISTINCT FROM OLD."compensation"
    OR NEW."sellPrice" IS DISTINCT FROM OLD."sellPrice" OR NEW."deliverables" IS DISTINCT FROM OLD."deliverables"
    OR NEW."usageRights" IS DISTINCT FROM OLD."usageRights" OR NEW."exclusivityDays" IS DISTINCT FROM OLD."exclusivityDays"
    OR NEW."disclosures" IS DISTINCT FROM OLD."disclosures" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."termsHash" IS DISTINCT FROM OLD."termsHash") THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % terms are fixed once sent', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."termsSnapshot" IS NOT NULL AND (
       NEW."termsSnapshot" IS DISTINCT FROM OLD."termsSnapshot" OR NEW."orderId" IS DISTINCT FROM OLD."orderId") THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % accepted terms never change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."state" = 'ACCEPTED' AND NEW."state" IS DISTINCT FROM OLD."state" THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % is accepted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_terms_immutable ON "Offer";
CREATE TRIGGER offer_terms_immutable BEFORE UPDATE ON "Offer"
  FOR EACH ROW EXECUTE FUNCTION offer_terms_immutable();
