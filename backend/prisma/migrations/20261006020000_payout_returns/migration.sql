-- 2S5-BE-05 — a payout's states, its hand-overs to the provider, and a payout the bank returned.
-- (documentation/SponsorX-Phase2-State-Machines.md §6.)

-- ── Payout: its states; a payout the bank returned ─────────────────────────
ALTER TABLE "Payout" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0;
-- Each hand-over to the provider: the idempotency key it is sent with.
ALTER TABLE "Payout" ADD COLUMN "sendAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_state_check"
  CHECK ("state" IN ('REQUESTED', 'APPROVED', 'SENDING', 'PAID', 'REJECTED', 'FAILED'));
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_return_check"
  CHECK ("returnCount" >= 0 AND "sendAttempts" >= 0 AND (("returnCount" > 0) = ("returnedAt" IS NOT NULL)));
-- A payout handed to the provider before this column existed was handed over once.
UPDATE "Payout" SET "sendAttempts" = 1 WHERE "sentAt" IS NOT NULL;
-- A payout is returned only after it was paid, and never more often than it was sent.
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_returned_check" CHECK ("returnCount" <= "sendAttempts");

