-- 2S5-BE-06 / -07 / -08 — payouts approved and retried automatically, and
-- Phase 1 earnings approved for payout automatically.
--
-- PayoutAccount.changedAt: when where the payee is paid last changed (the
-- provider's account id replaced, or the account leaving READY). Existing
-- accounts were set up once: null.
ALTER TABLE "PayoutAccount" ADD COLUMN "changedAt" TIMESTAMP(3);

-- Payout: the automatic approval and its reasons; the failure kind and who a
-- failed payout waits on; the automatic retry count and schedule.
ALTER TABLE "Payout" ADD COLUMN "approvedAutomatically" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payout" ADD COLUMN "reviewReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Payout" ADD COLUMN "failureKind" TEXT;
ALTER TABLE "Payout" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "waitingOn" TEXT;
ALTER TABLE "Payout" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payout" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "accountRetryUsed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payout" ADD CONSTRAINT "Payout_failureKind_check"
  CHECK ("failureKind" IS NULL OR "failureKind" IN ('TEMPORARY', 'ACCOUNT', 'OTHER'));
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_waitingOn_check"
  CHECK ("waitingOn" IS NULL OR ("state" = 'FAILED' AND "waitingOn" IN ('SYSTEM_RETRY', 'PAYEE_ACCOUNT', 'BTG')));
-- A scheduled retry exists only while the system is the one waiting.
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_nextRetryAt_check"
  CHECK (("nextRetryAt" IS NOT NULL) = ("state" = 'FAILED' AND "waitingOn" IS NOT DISTINCT FROM 'SYSTEM_RETRY'));
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_retryCount_check" CHECK ("retryCount" BETWEEN 0 AND 3);
-- Approved by the rule means approved by the system, never by a person.
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_approvedAutomatically_check"
  CHECK (NOT "approvedAutomatically" OR ("decidedBy" = 'system' AND "decidedAt" IS NOT NULL));

CREATE INDEX "Payout_state_waitingOn_nextRetryAt_idx" ON "Payout"("state", "waitingOn", "nextRetryAt");
CREATE INDEX "Payout_payeeType_payeeId_decidedAt_idx" ON "Payout"("payeeType", "payeeId", "decidedAt");

-- Earning: approved for payout by the rule, when, and why one was left for Finance.
ALTER TABLE "Earning" ADD COLUMN "approvedAutomatically" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Earning" ADD COLUMN "autoApprovedAt" TIMESTAMP(3);
ALTER TABLE "Earning" ADD COLUMN "reviewReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_approvedAutomatically_check"
  CHECK (NOT "approvedAutomatically" OR "autoApprovedAt" IS NOT NULL);

CREATE INDEX "Earning_athleteId_autoApprovedAt_idx" ON "Earning"("athleteId", "autoApprovedAt");
