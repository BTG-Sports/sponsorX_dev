-- 2S3-BE-05 — an athlete with no team sells their own item. A listing, and
-- the order line bought from it, belongs to a property OR to that athlete —
-- exactly one.
ALTER TABLE "Listing" ALTER COLUMN "propertyId" DROP NOT NULL;
ALTER TABLE "Listing" ADD COLUMN "sellerAthleteId" TEXT;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerAthleteId_fkey"
  FOREIGN KEY ("sellerAthleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Listing_sellerAthleteId_idx" ON "Listing"("sellerAthleteId");

ALTER TABLE "MarketplaceOrderLine" ALTER COLUMN "propertyId" DROP NOT NULL;
ALTER TABLE "MarketplaceOrderLine" ADD COLUMN "sellerAthleteId" TEXT;
CREATE INDEX "MarketplaceOrderLine_sellerAthleteId_idx" ON "MarketplaceOrderLine"("sellerAthleteId");

ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "Listing_one_seller";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_one_seller"
  CHECK (("propertyId" IS NULL) <> ("sellerAthleteId" IS NULL));
ALTER TABLE "MarketplaceOrderLine" DROP CONSTRAINT IF EXISTS "MarketplaceOrderLine_one_seller";
ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_one_seller"
  CHECK (("propertyId" IS NULL) <> ("sellerAthleteId" IS NULL));
