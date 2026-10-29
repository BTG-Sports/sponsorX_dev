-- POL-BE-08 — each fan who scans a shared code gets their own claim.
--
-- A code issued from the desk is an athlete's shared QR, shown to many fans.
-- A fan claiming through it gets a code of their own (parentTokenId = the
-- shared code), on which the claim, the hold and the redeem happen. Never
-- printed, so it has no QR image. Rows already here are shared codes.
ALTER TABLE "RewardToken" ADD COLUMN "parentTokenId" TEXT;
ALTER TABLE "RewardToken" ADD CONSTRAINT "RewardToken_parentTokenId_fkey"
  FOREIGN KEY ("parentTokenId") REFERENCES "RewardToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RewardToken_parentTokenId_idx" ON "RewardToken"("parentTokenId");
