-- Phase 2 batch 4 — 2S2-BE-02 brand restrictions (and sponsor categories), 2S3-BE-03
-- inventory commitments, 2S4-BE-01 carts.
-- CreateEnum
CREATE TYPE "CartState" AS ENUM ('ACTIVE', 'EXPIRED', 'CHECKED_OUT');

-- AlterTable
ALTER TABLE "Sponsor" ADD COLUMN     "categories" TEXT[];

-- CreateTable
CREATE TABLE "BrandRestriction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT,
    "propertyId" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "reason" TEXT,
    "sourceOfferId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCommitment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "createdBy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "state" "CartState" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandRestriction_tenantId_athleteId_idx" ON "BrandRestriction"("tenantId", "athleteId");

-- CreateIndex
CREATE INDEX "BrandRestriction_tenantId_propertyId_idx" ON "BrandRestriction"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "BrandRestriction_sourceOfferId_idx" ON "BrandRestriction"("sourceOfferId");

-- CreateIndex
CREATE INDEX "InventoryCommitment_inventoryItemId_releasedAt_idx" ON "InventoryCommitment"("inventoryItemId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCommitment_source_sourceId_inventoryItemId_key" ON "InventoryCommitment"("source", "sourceId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "Cart_tenantId_sponsorId_state_idx" ON "Cart"("tenantId", "sponsorId", "state");

-- CreateIndex
CREATE INDEX "Cart_state_expiresAt_idx" ON "Cart"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "CartLine_tenantId_idx" ON "CartLine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartLine_cartId_listingId_key" ON "CartLine"("cartId", "listingId");

-- AddForeignKey
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommitment" ADD CONSTRAINT "InventoryCommitment_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing sponsors have no categories yet: an empty list, never NULL.
UPDATE "Sponsor" SET "categories" = ARRAY[]::TEXT[] WHERE "categories" IS NULL;

-- 2S2-BE-02 / 2S3-BE-03 / 2S4-BE-01 — rules Prisma cannot express.
-- A restriction has exactly one owner, a known type and a window that closes
-- after it opens; a commitment and a cart line hold at least one; a sponsor
-- has at most one ACTIVE cart.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "BrandRestriction" DROP CONSTRAINT IF EXISTS "BrandRestriction_one_owner";
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_one_owner"
  CHECK (("athleteId" IS NULL) <> ("propertyId" IS NULL));
ALTER TABLE "BrandRestriction" DROP CONSTRAINT IF EXISTS "BrandRestriction_shape";
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_shape"
  CHECK ("type" IN ('PROHIBITED', 'LEAGUE_RULE', 'SCHOOL_POLICY', 'EXCLUSIVITY')
         AND ("startsOn" IS NULL OR "endsOn" IS NULL OR "endsOn" >= "startsOn"));
ALTER TABLE "InventoryCommitment" DROP CONSTRAINT IF EXISTS "InventoryCommitment_shape";
ALTER TABLE "InventoryCommitment" ADD CONSTRAINT "InventoryCommitment_shape"
  CHECK ("quantity" > 0 AND "endsOn" >= "startsOn");
ALTER TABLE "CartLine" DROP CONSTRAINT IF EXISTS "CartLine_shape";
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_shape"
  CHECK ("quantity" > 0 AND "endsOn" >= "startsOn" AND "unitPriceCents" > 0);
DROP INDEX IF EXISTS "Cart_one_active_per_sponsor";
CREATE UNIQUE INDEX "Cart_one_active_per_sponsor" ON "Cart" ("sponsorId") WHERE "state" = 'ACTIVE';
