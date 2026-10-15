-- 3S5 — make-goods: a campaign's projected shortfall, the substitutes offered for it, and the decision.

-- CreateTable
CREATE TABLE "MakeGoodShortfall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metric" TEXT NOT NULL,
    "sold" INTEGER NOT NULL,
    "projected" INTEGER NOT NULL,
    "shortfall" INTEGER NOT NULL,
    "unitValueCents" DOUBLE PRECISION NOT NULL,
    "shortfallValueCents" INTEGER NOT NULL,
    "elapsed" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "heldReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decidedOptionId" TEXT,
    "decidedBy" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "runsFrom" DATE,
    "runsUntil" DATE,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "MakeGoodShortfall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeGoodOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shortfallId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "inventoryName" TEXT NOT NULL,
    "propertyName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "estimatedDelivery" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "verifiedEstimate" BOOLEAN NOT NULL,
    "equivalencyScore" DOUBLE PRECISION NOT NULL,
    "costCents" INTEGER NOT NULL,
    "costImpactCents" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL,
    "exclusivityClear" BOOLEAN NOT NULL,
    "meetsTarget" BOOLEAN NOT NULL,
    "youth" BOOLEAN NOT NULL,
    "problems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL,

    CONSTRAINT "MakeGoodOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MakeGoodShortfall_tenantId_status_idx" ON "MakeGoodShortfall"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MakeGoodShortfall_campaignId_idx" ON "MakeGoodShortfall"("campaignId");

-- CreateIndex
CREATE INDEX "MakeGoodOption_shortfallId_idx" ON "MakeGoodOption"("shortfallId");

-- CreateIndex
CREATE INDEX "MakeGoodOption_tenantId_idx" ON "MakeGoodOption"("tenantId");

-- AddForeignKey
ALTER TABLE "MakeGoodOption" ADD CONSTRAINT "MakeGoodOption_shortfallId_fkey" FOREIGN KEY ("shortfallId") REFERENCES "MakeGoodShortfall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open shortfall per campaign; the nightly run refreshes it rather than opening another.
CREATE UNIQUE INDEX "MakeGoodShortfall_one_open" ON "MakeGoodShortfall"("campaignId") WHERE "status" = 'OPEN';

-- A decided shortfall never changes: an APPROVED (or CLOSED) row refuses any
-- update or delete, and so do its options. Only a test database marked
-- purgeable (sponsorx.audit_purge) may delete them, to clean up.
CREATE OR REPLACE FUNCTION makegood_decided_is_final() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'MakeGoodShortfall' THEN
    IF OLD.status <> 'OPEN' THEN
      RAISE EXCEPTION 'makegood_decided_is_final: shortfall % is % and cannot be %d', OLD.id, OLD.status, lower(TG_OP) USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'makegood_decided_is_final: shortfall % cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO parent_status FROM "MakeGoodShortfall"
   WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW."shortfallId" ELSE OLD."shortfallId" END;
  IF parent_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'makegood_decided_is_final: the options of a % shortfall cannot be %d', coalesce(parent_status, 'missing'), lower(TG_OP) USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS makegood_decided_is_final ON "MakeGoodShortfall";
CREATE TRIGGER makegood_decided_is_final BEFORE UPDATE OR DELETE ON "MakeGoodShortfall"
  FOR EACH ROW EXECUTE FUNCTION makegood_decided_is_final();
DROP TRIGGER IF EXISTS makegood_decided_is_final ON "MakeGoodOption";
CREATE TRIGGER makegood_decided_is_final BEFORE INSERT OR UPDATE OR DELETE ON "MakeGoodOption"
  FOR EACH ROW EXECUTE FUNCTION makegood_decided_is_final();
