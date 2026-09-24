-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "zohoRenewalDealId" TEXT;

-- AlterTable
ALTER TABLE "CampaignBrief" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncHash" TEXT,
ADD COLUMN     "lastSyncOrigin" "SyncOrigin",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "zohoDealId" TEXT;

-- AlterTable
ALTER TABLE "Sponsor" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SponsorContact" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "zohoUserId" TEXT;

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "source" TEXT NOT NULL,
    "zohoLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "briefId" TEXT,
    "campaignId" TEXT,
    "zohoTaskId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "SyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZohoReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked" INTEGER NOT NULL,
    "missingInZoho" JSONB NOT NULL,
    "unknownInSponsorX" JSONB NOT NULL,
    "diverged" JSONB NOT NULL,

    CONSTRAINT "ZohoReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_zohoLeadId_key" ON "Inquiry"("zohoLeadId");

-- CreateIndex
CREATE INDEX "Inquiry_tenantId_createdAt_idx" ON "Inquiry"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncTask_zohoTaskId_key" ON "SyncTask"("zohoTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncTask_dedupeKey_key" ON "SyncTask"("dedupeKey");

-- CreateIndex
CREATE INDEX "SyncTask_tenantId_dueDate_idx" ON "SyncTask"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "ZohoReconciliation_tenantId_ranAt_idx" ON "ZohoReconciliation"("tenantId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_zohoRenewalDealId_key" ON "Campaign"("zohoRenewalDealId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBrief_zohoDealId_key" ON "CampaignBrief"("zohoDealId");

-- CreateIndex
CREATE UNIQUE INDEX "User_zohoUserId_key" ON "User"("zohoUserId");

