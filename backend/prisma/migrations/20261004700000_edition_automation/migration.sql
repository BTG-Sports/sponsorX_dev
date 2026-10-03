-- P9-BE-17, P9-BE-18, P9-BE-19 (programme owner, 2026-10-03, item 23).
-- Editions move through their stages by themselves; ad slots are priced from
-- a masthead's rate card; a campaign's ad sale is made by the system when
-- every safety check passes and held for SALES when one fails; Finance locks
-- an edition's split; cancelling an edition queues the refunds of money
-- actually received.

-- ── P9-BE-17 — the day sales open by themselves. Null: BTG opens by hand. ──
ALTER TABLE "Edition" ADD COLUMN "salesOpenAt" TIMESTAMP(3);

-- ── P9-BE-19 — the split lock. ──────────────────────────────────────────────
ALTER TABLE "Edition" ADD COLUMN "splitLockedAt" TIMESTAMP(3);
ALTER TABLE "Edition" ADD COLUMN "splitLockedBy" TEXT;
ALTER TABLE "Edition" ADD COLUMN "splitLockNote" TEXT;
-- Locked: when, by whom and why, together. Unlocked: none of them.
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_split_lock_check" CHECK (
  ("splitLockedAt" IS NULL) = ("splitLockedBy" IS NULL)
  AND ("splitLockedAt" IS NULL) = ("splitLockNote" IS NULL)
  AND ("splitLockNote" IS NULL OR length(btrim("splitLockNote")) BETWEEN 1 AND 500)
);

-- A locked split is never replaced, by the domain or by any other write:
-- RevenueSplit takes no insert, update or delete while its edition is
-- locked, and SchoolPoolAllocation no update or delete (pools that were never
-- resolved may still be resolved once, from the locked SCHOOL share, when the
-- edition publishes).
CREATE OR REPLACE FUNCTION revenuesplit_guard_lock() RETURNS trigger AS $$
DECLARE
  ed TEXT;
  locked TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN ed := OLD."editionId"; ELSE ed := NEW."editionId"; END IF;
  SELECT "splitLockedAt" INTO locked FROM "Edition" WHERE id = ed;
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'revenuesplit_locked: the split of edition % is locked by Finance', ed
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revenuesplit_guard_lock ON "RevenueSplit";
CREATE TRIGGER revenuesplit_guard_lock
  BEFORE INSERT OR UPDATE OR DELETE ON "RevenueSplit"
  FOR EACH ROW EXECUTE FUNCTION revenuesplit_guard_lock();

DROP TRIGGER IF EXISTS schoolpool_guard_lock ON "SchoolPoolAllocation";
CREATE TRIGGER schoolpool_guard_lock
  BEFORE UPDATE OR DELETE ON "SchoolPoolAllocation"
  FOR EACH ROW EXECUTE FUNCTION revenuesplit_guard_lock();

-- ── P9-BE-18 — a masthead's rate card. ─────────────────────────────────────
CREATE TABLE "EditionRateCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "kind" "AdSlotKind" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "EditionRateCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EditionRateCard_publicationId_kind_key" ON "EditionRateCard"("publicationId", "kind");
CREATE INDEX "EditionRateCard_tenantId_idx" ON "EditionRateCard"("tenantId");
ALTER TABLE "EditionRateCard" ADD CONSTRAINT "EditionRateCard_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditionRateCard" ADD CONSTRAINT "EditionRateCard_price_check" CHECK ("priceCents" > 0);

-- ── P9-BE-18 — ad sales held for SALES. ────────────────────────────────────
CREATE TABLE "AdSaleHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "editionId" TEXT,
    "heldKeys" TEXT[],
    "heldReasons" TEXT[],
    "heldAt" TIMESTAMP(3) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdSaleHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdSaleHold_campaignId_key" ON "AdSaleHold"("campaignId");
CREATE INDEX "AdSaleHold_tenantId_resolvedAt_idx" ON "AdSaleHold"("tenantId", "resolvedAt");
-- A hold is about its campaign and nothing else: it goes with it.
ALTER TABLE "AdSaleHold" ADD CONSTRAINT "AdSaleHold_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdSaleHold" ADD CONSTRAINT "AdSaleHold_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdSaleHold" ADD CONSTRAINT "AdSaleHold_shape_check" CHECK (
  -- Every hold says why, key for key, in words.
  cardinality("heldKeys") >= 1
  AND cardinality("heldKeys") = cardinality("heldReasons")
  AND ("resolution" IS NULL OR "resolution" IN ('SOLD', 'CAMPAIGN_CANCELLED'))
  AND (("resolution" IS NULL) = ("resolvedAt" IS NULL))
);

-- ── P9-BE-19 — a cancelled edition's paid ad sales on Finance's list. ─────
-- The row names the campaign and the edition instead of an order; it was
-- invoiced through Zoho (a credit note), and there is one per (edition,
-- campaign), so a retried cancellation never makes two.
ALTER TABLE "RefundDue" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "RefundDue" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "RefundDue" ADD COLUMN "editionId" TEXT;
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RefundDue_editionId_idx" ON "RefundDue"("editionId");

ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION', 'EDITION_CANCELLED'));
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_source_check" CHECK (
  -- An order's refund names its order and no campaign or edition…
  ("cause" <> 'EDITION_CANCELLED' AND "orderId" IS NOT NULL AND "campaignId" IS NULL AND "editionId" IS NULL)
  -- …and an edition's names the campaign and the edition, never an order or a line, and was a Zoho invoice.
  OR ("cause" = 'EDITION_CANCELLED' AND "orderId" IS NULL AND "lineId" IS NULL
      AND "campaignId" IS NOT NULL AND "editionId" IS NOT NULL AND "paidVia" = 'ZOHO_INVOICE')
);
CREATE UNIQUE INDEX "RefundDue_one_per_edition_campaign" ON "RefundDue"("editionId", "campaignId")
  WHERE "cause" = 'EDITION_CANCELLED';
