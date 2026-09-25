-- CreateEnum
CREATE TYPE "EditionState" AS ENUM ('PLANNING', 'SELLING', 'CLOSED', 'IN_PRODUCTION', 'PUBLISHED_DIGITAL', 'PRINTED', 'DISTRIBUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdSlotKind" AS ENUM ('QUARTER', 'HALF', 'FULL', 'BACK_COVER', 'PRESENTING');

-- CreateEnum
CREATE TYPE "SplitPayeeKind" AS ENUM ('SPONSORX', 'SCHOOL', 'STUDENT_POOL', 'EDITORIAL_FUND');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('QR_SCAN', 'LINK_CLICK', 'PROFILE_VIEW', 'CAMPAIGN_VIEW', 'CTA_CLICK');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "publishTarget" TIMESTAMP(3) NOT NULL,
    "printDate" TIMESTAMP(3),
    "pageCount" INTEGER,
    "contentReady" BOOLEAN NOT NULL DEFAULT false,
    "rightsCleared" BOOLEAN NOT NULL DEFAULT false,
    "revenueMet" BOOLEAN NOT NULL DEFAULT false,
    "thresholdCents" INTEGER NOT NULL,
    "state" "EditionState" NOT NULL DEFAULT 'PLANNING',

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "slotCode" TEXT NOT NULL,
    "kind" "AdSlotKind" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "campaignId" TEXT,
    "soldCents" INTEGER,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueSplit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "payeeKind" "SplitPayeeKind" NOT NULL,
    "bps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "type" "EngagementType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "city" TEXT,
    "region" TEXT,

    CONSTRAINT "EditionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publication_tenantId_idx" ON "Publication"("tenantId");

-- CreateIndex
CREATE INDEX "Edition_tenantId_state_idx" ON "Edition"("tenantId", "state");

-- CreateIndex
CREATE INDEX "AdSlot_tenantId_editionId_idx" ON "AdSlot"("tenantId", "editionId");

-- CreateIndex
CREATE INDEX "AdSlot_campaignId_idx" ON "AdSlot"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSlot_editionId_slotCode_key" ON "AdSlot"("editionId", "slotCode");

-- CreateIndex
CREATE INDEX "RevenueSplit_tenantId_idx" ON "RevenueSplit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSplit_editionId_payeeKind_key" ON "RevenueSplit"("editionId", "payeeKind");

-- CreateIndex
CREATE INDEX "EditionEvent_tenantId_editionId_type_at_idx" ON "EditionEvent"("tenantId", "editionId", "type", "at");

-- CreateIndex
CREATE INDEX "EditionEvent_targetKind_targetRef_idx" ON "EditionEvent"("targetKind", "targetRef");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueSplit" ADD CONSTRAINT "RevenueSplit_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionEvent" ADD CONSTRAINT "EditionEvent_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── P9-BE-03: inventory rules (copy: prisma/sql/adslot_inventory.sql) ──
-- The NEXT ad inventory's rules, enforced by Postgres — P9-BE-03.
--
-- "The back cover sells exactly once, enforced by the database and not by a
-- query; a slot cannot be sold after the edition's closeDate." Application
-- code checks these too, for a readable error — but two booths selling at the
-- same instant, or a script someone runs by hand, meet these instead.

-- One row per position. Several identical positions are several rows, so
-- each can be sold, and refused, on its own.
-- (Idempotent throughout: CI re-applies every file here after migrating.)
ALTER TABLE "AdSlot" DROP CONSTRAINT IF EXISTS "AdSlot_quantity_one";
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_quantity_one" CHECK (quantity = 1);
ALTER TABLE "AdSlot" DROP CONSTRAINT IF EXISTS "AdSlot_price_nonnegative";
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_price_nonnegative"
  CHECK ("priceCents" >= 0 AND ("soldCents" IS NULL OR "soldCents" >= 0));

-- One back cover and one presenting sponsor per edition — quantity ONE in
-- the rate card (P9-PMO-01) — however many rows someone tries to add.
CREATE UNIQUE INDEX IF NOT EXISTS "AdSlot_one_exclusive_per_edition"
  ON "AdSlot" ("editionId", kind)
  WHERE kind IN ('BACK_COVER', 'PRESENTING');

-- A sale is setting campaignId. It must be the first sale of that row, into
-- an edition still SELLING and before its close date, to a campaign in the
-- same tenant. Releasing (campaignId back to NULL, when a campaign is
-- cancelled or deleted) is allowed; moving a sold slot straight to another
-- campaign is not.
CREATE OR REPLACE FUNCTION adslot_guard_sale() RETURNS trigger AS $$
DECLARE
  ed RECORD;
BEGIN
  IF NEW."campaignId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."campaignId" IS NOT DISTINCT FROM NEW."campaignId" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."campaignId" IS NOT NULL THEN
    RAISE EXCEPTION 'adslot_already_sold: slot % is already sold', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "closeDate", state INTO ed FROM "Edition" WHERE id = NEW."editionId" FOR SHARE;
  IF ed.state <> 'SELLING' OR now() >= ed."closeDate" THEN
    RAISE EXCEPTION 'adslot_edition_closed: edition % is not selling', NEW."editionId"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Campaign" WHERE id = NEW."campaignId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'adslot_cross_tenant: campaign % is not in this tenant', NEW."campaignId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS adslot_guard_sale ON "AdSlot";
CREATE TRIGGER adslot_guard_sale
  BEFORE INSERT OR UPDATE OF "campaignId" ON "AdSlot"
  FOR EACH ROW EXECUTE FUNCTION adslot_guard_sale();
