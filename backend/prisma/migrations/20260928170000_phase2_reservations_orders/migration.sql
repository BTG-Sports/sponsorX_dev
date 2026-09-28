-- Phase 2 batch 5 — 2S3-BE-02 packages, 2S4-BE-02 reservations, 2S4-BE-03/-05 marketplace
-- orders and the approval gate, 2S7-INT-01 the property's Zoho contact.
-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('HELD', 'CONVERTED', 'EXPIRED', 'RELEASED');

-- CreateEnum
CREATE TYPE "MarketplaceOrderState" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'AWAITING_PAYMENT', 'PAID', 'IN_DELIVERY', 'FULFILLED', 'CLOSED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "InventoryCommitment" ADD COLUMN     "contracted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "zohoContactId" TEXT;

-- CreateTable
CREATE TABLE "BundleComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bundleItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "state" "ReservationState" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "state" "MarketplaceOrderState" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalCents" INTEGER NOT NULL,
    "feesCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "approvalReasons" TEXT[],
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decisionNotes" TEXT,
    "contractedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "zohoDealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemTenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,

    CONSTRAINT "MarketplaceOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BundleComponent_tenantId_idx" ON "BundleComponent"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleComponent_bundleItemId_componentItemId_key" ON "BundleComponent"("bundleItemId", "componentItemId");

-- CreateIndex
CREATE INDEX "Reservation_tenantId_sponsorId_state_idx" ON "Reservation"("tenantId", "sponsorId", "state");

-- CreateIndex
CREATE INDEX "Reservation_state_expiresAt_idx" ON "Reservation"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_reservationId_key" ON "MarketplaceOrder"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_zohoDealId_key" ON "MarketplaceOrder"("zohoDealId");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_tenantId_sponsorId_state_idx" ON "MarketplaceOrder"("tenantId", "sponsorId", "state");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_tenantId_state_idx" ON "MarketplaceOrder"("tenantId", "state");

-- CreateIndex
CREATE INDEX "MarketplaceOrderLine_tenantId_orderId_idx" ON "MarketplaceOrderLine"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "MarketplaceOrderLine_propertyId_idx" ON "MarketplaceOrderLine"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_zohoContactId_key" ON "Property"("zohoContactId");

-- AddForeignKey
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_bundleItemId_fkey" FOREIGN KEY ("bundleItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


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
