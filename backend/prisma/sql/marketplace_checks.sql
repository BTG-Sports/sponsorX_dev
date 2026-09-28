-- 2S2-BE-01 / 2S3-BE-01 — rules Prisma cannot express.
-- An inventory item has exactly one owner (an athlete or a team), a positive
-- price, a non-negative quantity and a window that closes after it opens; an
-- item has at most one live listing, so a buyer never sees it twice.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_one_owner";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_one_owner"
  CHECK (("athleteId" IS NULL) <> ("propertyId" IS NULL));
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_priced";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_priced"
  CHECK ("priceCents" > 0 AND ("quantity" IS NULL OR "quantity" >= 0)
         AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil" >= "availableFrom"));
DROP INDEX IF EXISTS "Listing_one_live_per_item";
CREATE UNIQUE INDEX "Listing_one_live_per_item" ON "Listing" ("inventoryItemId") WHERE "state" <> 'ARCHIVED';
ALTER TABLE "Athlete" DROP CONSTRAINT IF EXISTS "Athlete_team_share_range";
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_team_share_range"
  CHECK ("teamShareBps" IS NULL OR ("teamShareBps" >= 0 AND "teamShareBps" <= 10000));
