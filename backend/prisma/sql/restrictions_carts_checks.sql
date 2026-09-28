-- 2S2-BE-02 / 2S3-BE-03 / 2S4-BE-01 — rules Prisma cannot express.
-- A restriction has exactly one owner, a known type and a window that closes
-- after it opens; a commitment and a cart line hold at least one; a sponsor
-- has at most one ACTIVE cart.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "BrandRestriction" DROP CONSTRAINT IF EXISTS "BrandRestriction_one_owner";
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_one_owner"
  CHECK (("athleteId" IS NULL) <> ("propertyId" IS NULL));
ALTER TABLE "BrandRestriction" DROP CONSTRAINT IF EXISTS "BrandRestriction_shape";
ALTER TABLE "BrandRestriction" ADD CONSTRAINT "BrandRestriction_shape"
  CHECK ("type" IN ('PROHIBITED', 'LEAGUE_RULE', 'SCHOOL_POLICY', 'EXCLUSIVITY')
         AND ("startsOn" IS NULL OR "endsOn" IS NULL OR "endsOn" >= "startsOn"));
ALTER TABLE "InventoryCommitment" DROP CONSTRAINT IF EXISTS "InventoryCommitment_shape";
ALTER TABLE "InventoryCommitment" ADD CONSTRAINT "InventoryCommitment_shape"
  CHECK ("quantity" > 0 AND "endsOn" >= "startsOn");
ALTER TABLE "CartLine" DROP CONSTRAINT IF EXISTS "CartLine_shape";
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_shape"
  CHECK ("quantity" > 0 AND "endsOn" >= "startsOn" AND "unitPriceCents" > 0);
DROP INDEX IF EXISTS "Cart_one_active_per_sponsor";
CREATE UNIQUE INDEX "Cart_one_active_per_sponsor" ON "Cart" ("sponsorId") WHERE "state" = 'ACTIVE';
