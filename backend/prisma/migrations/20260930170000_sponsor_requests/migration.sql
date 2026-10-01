-- 2S1-BE-05 — BTG reviews a sponsor's request and opens the account. The
-- request (Inquiry) gains BTG's decision; approving creates the sponsor.
ALTER TABLE "Inquiry" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "Inquiry" ADD COLUMN "categoryText" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "Inquiry" ADD COLUMN "decidedBy" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "decisionNote" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "sponsorId" TEXT;
CREATE INDEX "Inquiry_tenantId_state_idx" ON "Inquiry"("tenantId", "state");
ALTER TABLE "Inquiry" DROP CONSTRAINT IF EXISTS "Inquiry_state_check";
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_state_check" CHECK ("state" IN ('NEW', 'APPROVED', 'DECLINED'));
