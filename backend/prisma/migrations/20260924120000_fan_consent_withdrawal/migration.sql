-- P6-SEC-03 — fan unsubscribe. Withdrawal is recorded on the same RewardEvent
-- row as the consent it withdraws. Nullable, no default: every existing claim
-- is un-withdrawn, which is exactly what null says. Additive, so safe to apply
-- ahead of the code that reads it.
ALTER TABLE "RewardEvent" ADD COLUMN "consentWithdrawnAt" TIMESTAMP(3);
