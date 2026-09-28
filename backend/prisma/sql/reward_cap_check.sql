-- P6-BE-08 — a cap is at least one, and the count never passes it.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "Reward" DROP CONSTRAINT IF EXISTS "Reward_redemption_cap";
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redemption_cap"
  CHECK ("redemptionCap" IS NULL OR ("redemptionCap" >= 1 AND "redemptionCount" <= "redemptionCap"));
