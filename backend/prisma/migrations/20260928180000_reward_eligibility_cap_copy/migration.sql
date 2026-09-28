-- P6-BE-08 — reward eligibility, a redemption cap, and the fan page's landing copy.
-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "eligibility" TEXT,
ADD COLUMN     "landingHeadline" TEXT,
ADD COLUMN     "landingSubhead" TEXT,
ADD COLUMN     "redemptionCap" INTEGER,
ADD COLUMN     "redemptionCount" INTEGER NOT NULL DEFAULT 0;


-- Every redemption already made counts against a cap set later.
UPDATE "Reward" r SET "redemptionCount" = (
  SELECT count(*) FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId"
   WHERE t."rewardId" = r.id AND e.type = 'REDEEM');

-- P6-BE-08 — a cap is at least one, and the count never passes it.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "Reward" DROP CONSTRAINT IF EXISTS "Reward_redemption_cap";
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redemption_cap"
  CHECK ("redemptionCap" IS NULL OR ("redemptionCap" >= 1 AND "redemptionCount" <= "redemptionCap"));
