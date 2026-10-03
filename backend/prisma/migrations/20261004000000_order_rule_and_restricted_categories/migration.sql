-- 1. The contract gate's lock on an order's acceptance and billing contact
--    (2S4-FE-02) was added to prisma/sql/marketplace_order_immutable.sql but
--    never to a migration. CI re-applies prisma/sql after migrating, so tests
--    passed; a deploy only migrates, so staging and production never had it.
--    This installs the function exactly as prisma/sql has it. The guard test
--    tests/sql-rules-in-migrations.test.ts now fails if the two drift again.
CREATE OR REPLACE FUNCTION marketplace_order_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state" <> 'PENDING_APPROVAL' AND (
       NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents" OR NEW."feesCents" IS DISTINCT FROM OLD."feesCents"
    OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."sponsorId" IS DISTINCT FROM OLD."sponsorId" OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId") THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % figures are fixed once approved', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  -- 2S4-FE-02 — what the sponsor accepted and who they named to bill are
  -- the record of the contract gate: fixed from the moment it is placed.
  IF NEW."acceptanceId" IS DISTINCT FROM OLD."acceptanceId" OR NEW."billingName" IS DISTINCT FROM OLD."billingName"
    OR NEW."billingEmail" IS DISTINCT FROM OLD."billingEmail" OR NEW."billingReference" IS DISTINCT FROM OLD."billingReference" THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % acceptance and billing contact are fixed when it is placed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS marketplace_order_immutable ON "MarketplaceOrder";
CREATE TRIGGER marketplace_order_immutable BEFORE UPDATE ON "MarketplaceOrder"
  FOR EACH ROW EXECUTE FUNCTION marketplace_order_immutable();

-- 2. An athlete or inventory item that never set restricted categories had
--    NULL, and the matching filter NOT (restrictedCategories && <brief's
--    categories>) is NULL for NULL, so such athletes silently fell off every
--    shortlist for a brief that names categories. No restrictions is an empty
--    list, never unknown.
UPDATE "Athlete" SET "restrictedCategories" = '{}' WHERE "restrictedCategories" IS NULL;
ALTER TABLE "Athlete" ALTER COLUMN "restrictedCategories" SET DEFAULT '{}',
                      ALTER COLUMN "restrictedCategories" SET NOT NULL;
UPDATE "InventoryItem" SET "restrictedCategories" = '{}' WHERE "restrictedCategories" IS NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "restrictedCategories" SET DEFAULT '{}',
                            ALTER COLUMN "restrictedCategories" SET NOT NULL;
