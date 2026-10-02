-- 2S4-BE-09 — order approval, automated; 2S4-BE-10 — payment, automated.
--
-- An order within the sponsor's spending limit is approved on its own and
-- goes straight to AWAITING_PAYMENT; above it, it waits for BTG. A listing
-- that asks for approval now asks its SELLER: the order waits in
-- PENDING_SELLER for 48 hours. An unpaid order is reminded after 1 and 2
-- days and cancelled at 3. Zoho Books marking a marketplace order's invoice
-- paid marks the order paid; BTG's manual "Mark paid" records how, the
-- reference and the date received.
ALTER TYPE "MarketplaceOrderState" ADD VALUE IF NOT EXISTS 'PENDING_SELLER' BEFORE 'PENDING_APPROVAL';

ALTER TABLE "MarketplaceOrder" ADD COLUMN "spendingLimitCents" INTEGER;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "awaitingPaymentAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paymentDueAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paymentRemindersSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paidVia" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paymentReceivedOn" DATE;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "paymentRecordedBy" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "refundedAt" TIMESTAMP(3);

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_cancelReason_check"
  CHECK ("cancelReason" IS NULL OR "cancelReason" IN ('SPONSOR', 'BTG', 'BTG_REJECTED', 'SELLER_DECLINED', 'SELLER_NO_ANSWER', 'UNPAID'));
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_paidVia_check"
  CHECK ("paidVia" IS NULL OR "paidVia" IN ('CARD', 'ZOHO_INVOICE', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'));
-- A payment BTG records by hand always says what it was, when it arrived and who recorded it.
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_manual_payment_check"
  CHECK ("paidVia" IS NULL OR "paidVia" IN ('CARD', 'ZOHO_INVOICE')
      OR ("paymentReference" IS NOT NULL AND length(btrim("paymentReference")) BETWEEN 1 AND 200 AND "paymentReceivedOn" IS NOT NULL AND "paymentRecordedBy" IS NOT NULL));
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_payment_window_check"
  CHECK ("paymentRemindersSent" BETWEEN 0 AND 2 AND ("paymentDueAt" IS NULL OR ("awaitingPaymentAt" IS NOT NULL AND "paymentDueAt" > "awaitingPaymentAt")));

-- Orders already waiting for payment get a fresh three days from this release,
-- rather than being cancelled the moment the sweep first runs.
UPDATE "MarketplaceOrder"
   SET "awaitingPaymentAt" = CURRENT_TIMESTAMP, "paymentDueAt" = CURRENT_TIMESTAMP + INTERVAL '3 days'
 WHERE "state" = 'AWAITING_PAYMENT' AND "awaitingPaymentAt" IS NULL;

CREATE INDEX "MarketplaceOrder_state_paymentDueAt_idx" ON "MarketplaceOrder"("state", "paymentDueAt");
CREATE INDEX "MarketplaceOrder_tenantId_decidedBy_decidedAt_idx" ON "MarketplaceOrder"("tenantId", "decidedBy", "decidedAt");

-- A seller's answer to an order a listing of theirs asks to approve.
CREATE TABLE "OrderSellerApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyTenantId" TEXT,
    "athleteId" TEXT,
    "athleteTenantId" TEXT,
    "lineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSellerApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderSellerApproval_tenantId_state_idx" ON "OrderSellerApproval"("tenantId", "state");
CREATE INDEX "OrderSellerApproval_orderId_idx" ON "OrderSellerApproval"("orderId");
CREATE INDEX "OrderSellerApproval_propertyTenantId_propertyId_idx" ON "OrderSellerApproval"("propertyTenantId", "propertyId");
CREATE INDEX "OrderSellerApproval_athleteTenantId_athleteId_idx" ON "OrderSellerApproval"("athleteTenantId", "athleteId");
CREATE INDEX "OrderSellerApproval_state_dueAt_idx" ON "OrderSellerApproval"("state", "dueAt");
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_state_check"
  CHECK ("state" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CLOSED'));
-- One seller: the team (in its tenant) or the independent athlete (in theirs).
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_seller_check"
  CHECK (("propertyId" IS NOT NULL AND "propertyTenantId" IS NOT NULL AND "athleteId" IS NULL AND "athleteTenantId" IS NULL)
      OR ("propertyId" IS NULL AND "propertyTenantId" IS NULL AND "athleteId" IS NOT NULL AND "athleteTenantId" IS NOT NULL));
-- An answer says who and when; a decline says why (the sponsor reads it).
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_answer_check"
  CHECK ("state" NOT IN ('ACCEPTED', 'DECLINED') OR ("decidedAt" IS NOT NULL AND "decidedBy" IS NOT NULL));
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_reason_check"
  CHECK ("state" <> 'DECLINED' OR ("reason" IS NOT NULL AND length(btrim("reason")) BETWEEN 1 AND 2000));
ALTER TABLE "OrderSellerApproval" ADD CONSTRAINT "OrderSellerApproval_lines_check"
  CHECK (cardinality("lineIds") >= 1);

-- BTG's daily summary of orders approved automatically: one per BTG tenant per UTC day.
CREATE TABLE "OrderApprovalDigest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "orders" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderApprovalDigest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderApprovalDigest_tenantId_day_key" ON "OrderApprovalDigest"("tenantId", "day");
ALTER TABLE "OrderApprovalDigest" ADD CONSTRAINT "OrderApprovalDigest_day_check" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "OrderApprovalDigest" ADD CONSTRAINT "OrderApprovalDigest_window_check" CHECK ("windowStart" < "windowEnd" AND "orders" >= 0);

-- A Zoho Books invoice for a marketplace order's Deal, as Zoho last described it.
CREATE TABLE "MarketplaceOrderInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "zohoInvoiceId" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lastSyncHash" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOrderInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceOrderInvoice_zohoInvoiceId_key" ON "MarketplaceOrderInvoice"("zohoInvoiceId");
CREATE INDEX "MarketplaceOrderInvoice_tenantId_status_idx" ON "MarketplaceOrderInvoice"("tenantId", "status");
CREATE INDEX "MarketplaceOrderInvoice_orderId_idx" ON "MarketplaceOrderInvoice"("orderId");
ALTER TABLE "MarketplaceOrderInvoice" ADD CONSTRAINT "MarketplaceOrderInvoice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
