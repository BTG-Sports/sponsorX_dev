-- 2S3-BE-02 / 2S4-BE-02 / 2S4-BE-03 — rules Prisma cannot express.
--
-- A package component takes at least one unit and is never the package
-- itself. A cart has at most one HELD reservation. An order's total is its
-- subtotal plus fees, and — state machines §4, "changing the financial
-- snapshot after APPROVED" is illegal — its figures are Postgres's to keep
-- once it leaves PENDING_APPROVAL. An order line is never rewritten.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "BundleComponent" DROP CONSTRAINT IF EXISTS "BundleComponent_shape";
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_shape"
  CHECK ("quantity" > 0 AND "bundleItemId" <> "componentItemId");
DROP INDEX IF EXISTS "Reservation_one_held_per_cart";
CREATE UNIQUE INDEX "Reservation_one_held_per_cart" ON "Reservation" ("cartId") WHERE "state" = 'HELD';
ALTER TABLE "MarketplaceOrder" DROP CONSTRAINT IF EXISTS "MarketplaceOrder_totals";
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_totals"
  CHECK ("subtotalCents" >= 0 AND "feesCents" >= 0 AND "totalCents" = "subtotalCents" + "feesCents");

CREATE OR REPLACE FUNCTION marketplace_order_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state" <> 'PENDING_APPROVAL' AND (
       NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents" OR NEW."feesCents" IS DISTINCT FROM OLD."feesCents"
    OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."sponsorId" IS DISTINCT FROM OLD."sponsorId" OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId") THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % figures are fixed once approved', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS marketplace_order_immutable ON "MarketplaceOrder";
CREATE TRIGGER marketplace_order_immutable BEFORE UPDATE ON "MarketplaceOrder"
  FOR EACH ROW EXECUTE FUNCTION marketplace_order_immutable();

CREATE OR REPLACE FUNCTION marketplace_order_line_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'marketplace_order_line_immutable: order line % is never rewritten', OLD.id USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS marketplace_order_line_immutable ON "MarketplaceOrderLine";
CREATE TRIGGER marketplace_order_line_immutable BEFORE UPDATE ON "MarketplaceOrderLine"
  FOR EACH ROW EXECUTE FUNCTION marketplace_order_line_immutable();
