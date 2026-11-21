-- POL-BE-119 — the fee statement at every acceptance (partnership agreement, 2026-11-21).
ALTER TABLE "CampaignOrder" ADD COLUMN "feeStatement" JSONB;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "feeTerms" JSONB;
ALTER TABLE "DealAgreement" ADD COLUMN "feeStatements" JSONB;
ALTER TABLE "OrderSellerApproval" ADD COLUMN "feeStatement" JSONB;
ALTER TABLE "Campaign" ADD COLUMN "priceConfirmation" JSONB;
ALTER TABLE "Listing" ADD COLUMN "feeAcceptance" JSONB;

-- An order's frozen fee terms are written once — at placement, or at first disclosure for an
-- order placed before this migration — and never change after.
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
  -- POL-BE-119 (migration 20261121100000): the fee terms are written once, then fixed.
  IF OLD."feeTerms" IS NOT NULL AND NEW."feeTerms" IS DISTINCT FROM OLD."feeTerms" THEN
    RAISE EXCEPTION 'marketplace_order_immutable: order % fee terms are fixed once disclosed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
