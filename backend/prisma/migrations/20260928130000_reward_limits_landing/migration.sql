-- P6-BE-08 — reward eligibility, redemption cap and landing copy.
-- Additive only: every new column is nullable or defaulted, so rows written
-- before this migration read as "anyone, unlimited, default page copy".

-- CreateEnum
CREATE TYPE "RewardEligibility" AS ENUM ('ANYONE', 'AGE_18_PLUS', 'AGE_21_PLUS', 'TICKET_HOLDERS');

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "eligibility" "RewardEligibility" NOT NULL DEFAULT 'ANYONE',
ADD COLUMN     "eligibilityNote" TEXT,
ADD COLUMN     "landingHeadline" TEXT,
ADD COLUMN     "landingSubhead" TEXT,
ADD COLUMN     "redemptionCap" INTEGER;

-- A cap of zero or less is a reward nobody can redeem — refuse it at the
-- database as well as in the contract.
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redemptionCap_positive" CHECK ("redemptionCap" IS NULL OR "redemptionCap" > 0);
