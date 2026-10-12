-- 3S0-BE-04 — a used code presented again is refused, and now counted on the
-- code with the time of the latest try (3S0-DATA-01 gap G4).
ALTER TABLE "RewardToken"
ADD COLUMN     "refusedRedeems" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastRefusedRedeemAt" TIMESTAMP(3);
