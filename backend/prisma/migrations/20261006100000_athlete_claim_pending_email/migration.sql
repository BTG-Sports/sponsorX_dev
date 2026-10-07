-- 2S8-PMO-02, owner decision 5 (2026-10-06): a profile claim waits for the
-- claimant to confirm their email before a school's advisor can see or
-- verify it. PENDING_EMAIL comes first in the enum because it is first in
-- the claim's life. The value can't be used in the transaction that adds it,
-- so the default and the backfill are the next migration.

-- AlterEnum
ALTER TYPE "ClaimState" ADD VALUE 'PENDING_EMAIL' BEFORE 'SUBMITTED';

-- AlterTable
ALTER TABLE "AthleteClaim" ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);
