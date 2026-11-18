-- 2S4-BE-15 — Deal Chat in the order flow: the final amount, calling off, the last warning.
ALTER TABLE "DealChat" ADD COLUMN "sponsorAmountCents" INTEGER,
  ADD COLUMN "sellerAmountCents" INTEGER,
  ADD COLUMN "calledOffBy" TEXT,
  ADD COLUMN "calledOffReason" TEXT,
  ADD COLUMN "calledOffAt" TIMESTAMP(3),
  ADD COLUMN "lastWarnedAt" TIMESTAMP(3);

-- An order's figures stay fixed from approval on. They may change while BTG
-- reviews it (as before) and, now, while it is IN_CHAT: the amount both sides
-- agreed becomes the order's price when the last agreement is signed.
CREATE OR REPLACE FUNCTION marketplace_order_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state"::text NOT IN ('PENDING_APPROVAL', 'IN_CHAT') AND (
       NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents" OR NEW."feesCents" IS DISTINCT FROM OLD."feesCents"
    OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."sponsorId" IS DISTINCT FROM OLD."sponsorId" OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId") THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % figures are fixed once approved', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."acceptanceId" IS DISTINCT FROM OLD."acceptanceId" OR NEW."billingName" IS DISTINCT FROM OLD."billingName"
    OR NEW."billingEmail" IS DISTINCT FROM OLD."billingEmail" OR NEW."billingReference" IS DISTINCT FROM OLD."billingReference" THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % acceptance and billing contact are fixed when it is placed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- An order line is never rewritten — except its price, and only while its
-- order is IN_CHAT: the agreed amount spread across the seller's lines.
CREATE OR REPLACE FUNCTION marketplace_order_line_immutable() RETURNS trigger AS $$
BEGIN
  IF (SELECT o."state"::text FROM "MarketplaceOrder" o WHERE o.id = OLD."orderId") = 'IN_CHAT'
     AND ROW(NEW."id", NEW."tenantId", NEW."orderId", NEW."listingId", NEW."inventoryItemId", NEW."itemTenantId", NEW."propertyId",
             NEW."sellerAthleteId", NEW."title", NEW."quantity", NEW."startsOn", NEW."endsOn")
         IS NOT DISTINCT FROM
         ROW(OLD."id", OLD."tenantId", OLD."orderId", OLD."listingId", OLD."inventoryItemId", OLD."itemTenantId", OLD."propertyId",
             OLD."sellerAthleteId", OLD."title", OLD."quantity", OLD."startsOn", OLD."endsOn")
     AND NEW."lineTotalCents" >= 0 AND NEW."unitPriceCents" >= 0 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'marketplace_order_line_immutable: order line % is never rewritten', OLD.id USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

-- Why an order was cancelled: also called off in the Deal Chat, or not signed by both in time.
ALTER TABLE "MarketplaceOrder" DROP CONSTRAINT IF EXISTS "MarketplaceOrder_cancelReason_check";
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_cancelReason_check"
  CHECK ("cancelReason" IS NULL OR "cancelReason" IN ('SPONSOR', 'BTG', 'BTG_REJECTED', 'SELLER_DECLINED', 'SELLER_NO_ANSWER', 'UNPAID', 'CALLED_OFF', 'NOT_SIGNED'));
