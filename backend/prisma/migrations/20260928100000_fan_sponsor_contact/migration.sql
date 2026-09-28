-- AlterTable
ALTER TABLE "RewardEvent" ADD COLUMN     "sponsorContactAt" TIMESTAMP(3),
ADD COLUMN     "sponsorContactVersion" TEXT,
ADD COLUMN     "sponsorContactWithdrawnAt" TIMESTAMP(3),
ADD COLUMN     "zohoLeadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RewardEvent_zohoLeadId_key" ON "RewardEvent"("zohoLeadId");


-- ── 2S6-BE-03 (copy: prisma/sql/fan_sponsor_contact_check.sql) ──
-- 2S6-BE-03 — the "sponsor may contact me" consent never stands alone.
-- It extends an address the fan gave WITH the delivery consent; a sponsor-
-- contact version on a claim with no address, or no delivery consent, would
-- be permission to share something that was never lawfully held.
-- (Idempotent: CI re-applies every file here after migrating.)
ALTER TABLE "RewardEvent" DROP CONSTRAINT IF EXISTS "RewardEvent_sponsor_contact_needs_address";
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_sponsor_contact_needs_address"
  CHECK ("sponsorContactVersion" IS NULL OR ("fanEmail" IS NOT NULL AND "consentVersion" IS NOT NULL));
