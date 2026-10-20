-- P8-BE-02 / P8-BE-03 (P0-LEG-06): the athlete's own rules are their
-- responsibility, and a complaint about a deal pauses it.

-- CreateEnum
CREATE TYPE "DealDisputeState" AS ENUM ('OPEN', 'DOCUMENTS_IN', 'RESUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealDisputeSource" AS ENUM ('SCHOOL', 'LEAGUE', 'PARENT', 'SPONSOR', 'OTHER');

-- AlterTable: when, which wording and where the athlete (or a minor's guardian) confirmed their own rules.
ALTER TABLE "Athlete" ADD COLUMN     "rulesAttestationVersion" TEXT,
ADD COLUMN     "rulesAttestedAt" TIMESTAMP(3),
ADD COLUMN     "rulesAttestedVia" TEXT;

-- AlterTable: off until the sign-up screen sends the confirmation.
ALTER TABLE "Tenant" ADD COLUMN     "requireRulesAttestation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DealDispute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "source" "DealDisputeSource" NOT NULL,
    "sourceName" TEXT,
    "reason" TEXT NOT NULL,
    "documentsRequested" TEXT NOT NULL,
    "state" "DealDisputeState" NOT NULL DEFAULT 'OPEN',
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentsInAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "earningStateBefore" "EarningState",

    CONSTRAINT "DealDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDisputeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealDisputeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealDispute_tenantId_state_idx" ON "DealDispute"("tenantId", "state");

-- CreateIndex
CREATE INDEX "DealDispute_orderId_idx" ON "DealDispute"("orderId");

-- One open dispute per order: two people opening one at once can't both win.
CREATE UNIQUE INDEX "DealDispute_one_open_per_order" ON "DealDispute"("orderId") WHERE "state" IN ('OPEN', 'DOCUMENTS_IN');

-- CreateIndex
CREATE UNIQUE INDEX "DealDisputeDocument_r2Key_key" ON "DealDisputeDocument"("r2Key");

-- CreateIndex
CREATE INDEX "DealDisputeDocument_tenantId_disputeId_idx" ON "DealDisputeDocument"("tenantId", "disputeId");

-- AddForeignKey
ALTER TABLE "DealDispute" ADD CONSTRAINT "DealDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CampaignOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDispute" ADD CONSTRAINT "DealDispute_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDisputeDocument" ADD CONSTRAINT "DealDisputeDocument_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "DealDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
