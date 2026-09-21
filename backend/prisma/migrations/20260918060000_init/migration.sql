-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BTG_ADMIN', 'SALES', 'CAMPAIGN_MGR', 'NETWORK_MGR', 'FINANCE', 'ATHLETE', 'GUARDIAN', 'PROPERTY_MGR', 'SPONSOR_ADMIN', 'SPONSOR_ANALYST', 'SERVICE');

-- CreateEnum
CREATE TYPE "AthleteState" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BriefState" AS ENUM ('DRAFT', 'QUALIFIED', 'APPROVED', 'CAMPAIGN_CREATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InviteState" AS ENUM ('INVITED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CampaignState" AS ENUM ('DRAFT', 'STAFFING', 'APPROVAL', 'ACTIVE', 'REPORTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverableState" AS ENUM ('NOT_STARTED', 'DRAFT_SUBMITTED', 'BTG_REVIEW', 'SPONSOR_REVIEW', 'APPROVED', 'PUBLISHED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "EarningState" AS ENUM ('PENDING', 'ELIGIBLE', 'APPROVED_FOR_PAYOUT', 'PAID', 'HELD', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RewardState" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RewardEventType" AS ENUM ('SCAN', 'LANDING', 'CLAIM', 'REDEEM');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('VERIFIED_API', 'VERIFIED_MANUAL', 'SELF_REPORTED', 'ESTIMATED', 'ATTRIBUTED');

-- CreateEnum
CREATE TYPE "SyncOrigin" AS ENUM ('SPONSORX', 'ZOHO');

-- CreateEnum
CREATE TYPE "AthleteTier" AS ENUM ('EMERGING', 'CREATOR', 'PREMIUM', 'ANCHOR');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "Role"[],
    "athleteId" TEXT,
    "sponsorId" TEXT,
    "propertyId" TEXT,
    "guardianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "city" TEXT,
    "stateCode" TEXT,
    "zohoId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "relationship" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "city" TEXT,
    "stateCode" TEXT,
    "sport" TEXT NOT NULL,
    "school" TEXT,
    "gradYear" INTEGER,
    "state" "AthleteState" NOT NULL DEFAULT 'DRAFT',
    "tier" "AthleteTier",
    "guardianId" TEXT,
    "propertyId" TEXT,
    "zohoId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteSocial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "followers" INTEGER,
    "avgViews" INTEGER,
    "source" "MetricSource" NOT NULL DEFAULT 'SELF_REPORTED',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteSocial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "scoredBy" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NilJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseLow" INTEGER NOT NULL,
    "baseHigh" INTEGER NOT NULL,
    "sellLow" INTEGER NOT NULL,
    "sellHigh" INTEGER NOT NULL,
    "sellFloorEmerging" INTEGER NOT NULL,
    "sellFloorCreator" INTEGER NOT NULL,
    "sellFloorPremium" INTEGER NOT NULL,

    CONSTRAINT "NilJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AthleteRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceLow" INTEGER NOT NULL,
    "priceHigh" INTEGER NOT NULL,
    "athleteCountMin" INTEGER NOT NULL,
    "athleteCountMax" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "includes" JSONB,
    "exclusivity" BOOLEAN NOT NULL DEFAULT false,
    "durationWeeks" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SponsorPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zohoAccountId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBrief" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "packageId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sports" TEXT[],
    "stateCodes" TEXT[],
    "categories" TEXT[],
    "state" "BriefState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "briefId" TEXT,
    "name" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "state" "CampaignState" NOT NULL DEFAULT 'DRAFT',
    "zohoDealId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "offered" INTEGER NOT NULL,
    "state" "InviteState" NOT NULL DEFAULT 'INVITED',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "compensation" INTEGER NOT NULL,
    "usageRights" TEXT NOT NULL,
    "exclusivity" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "state" "OrderState" NOT NULL DEFAULT 'DRAFT',
    "acceptedAt" TIMESTAMP(3),
    "acceptanceId" TEXT,

    CONSTRAINT "CampaignOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "state" "DeliverableState" NOT NULL DEFAULT 'NOT_STARTED',
    "publishedUrl" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "derivatives" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "source" "MetricSource" NOT NULL,
    "enteredBy" TEXT,

    CONSTRAINT "MetricDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,

    CONSTRAINT "TrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "city" TEXT,
    "region" TEXT,

    CONSTRAINT "LinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "offerText" TEXT NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "terms" TEXT NOT NULL,
    "state" "RewardState" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "athleteId" TEXT,
    "token" TEXT NOT NULL,
    "qrKey" TEXT,

    CONSTRAINT "RewardToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "type" "RewardEventType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "city" TEXT,
    "region" TEXT,
    "fanEmail" TEXT,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Earning" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "adjustment" INTEGER NOT NULL DEFAULT 0,
    "state" "EarningState" NOT NULL DEFAULT 'PENDING',
    "taxYear" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,

    CONSTRAINT "Earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guardianId" TEXT,

    CONSTRAINT "AgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "signatureOk" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_athleteId_key" ON "User"("athleteId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_email_idx" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Property_slug_key" ON "Property"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Property_zohoId_key" ON "Property"("zohoId");

-- CreateIndex
CREATE INDEX "Property_tenantId_idx" ON "Property"("tenantId");

-- CreateIndex
CREATE INDEX "Guardian_tenantId_idx" ON "Guardian"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_slug_key" ON "Athlete"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_zohoId_key" ON "Athlete"("zohoId");

-- CreateIndex
CREATE INDEX "Athlete_tenantId_state_idx" ON "Athlete"("tenantId", "state");

-- CreateIndex
CREATE INDEX "Athlete_tenantId_sport_stateCode_idx" ON "Athlete"("tenantId", "sport", "stateCode");

-- CreateIndex
CREATE INDEX "AthleteSocial_tenantId_idx" ON "AthleteSocial"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteSocial_athleteId_platform_key" ON "AthleteSocial"("athleteId", "platform");

-- CreateIndex
CREATE INDEX "AthleteScore_athleteId_scoredAt_idx" ON "AthleteScore"("athleteId", "scoredAt");

-- CreateIndex
CREATE INDEX "AthleteScore_tenantId_idx" ON "AthleteScore"("tenantId");

-- CreateIndex
CREATE INDEX "NilJob_tenantId_idx" ON "NilJob"("tenantId");

-- CreateIndex
CREATE INDEX "AthleteRate_tenantId_idx" ON "AthleteRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteRate_athleteId_jobId_version_key" ON "AthleteRate"("athleteId", "jobId", "version");

-- CreateIndex
CREATE INDEX "SponsorPackage_tenantId_idx" ON "SponsorPackage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorPackage_tenantId_code_key" ON "SponsorPackage"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsor_zohoAccountId_key" ON "Sponsor"("zohoAccountId");

-- CreateIndex
CREATE INDEX "Sponsor_tenantId_idx" ON "Sponsor"("tenantId");

-- CreateIndex
CREATE INDEX "CampaignBrief_tenantId_state_idx" ON "CampaignBrief"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_briefId_key" ON "Campaign"("briefId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_zohoDealId_key" ON "Campaign"("zohoDealId");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_state_idx" ON "Campaign"("tenantId", "state");

-- CreateIndex
CREATE INDEX "CampaignInvite_tenantId_state_expiresAt_idx" ON "CampaignInvite"("tenantId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInvite_campaignId_athleteId_jobId_key" ON "CampaignInvite"("campaignId", "athleteId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignOrder_acceptanceId_key" ON "CampaignOrder"("acceptanceId");

-- CreateIndex
CREATE INDEX "CampaignOrder_tenantId_state_idx" ON "CampaignOrder"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignOrder_campaignId_athleteId_jobId_key" ON "CampaignOrder"("campaignId", "athleteId", "jobId");

-- CreateIndex
CREATE INDEX "Deliverable_tenantId_state_dueDate_idx" ON "Deliverable"("tenantId", "state", "dueDate");

-- CreateIndex
CREATE INDEX "CreativeAsset_tenantId_idx" ON "CreativeAsset"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeAsset_deliverableId_version_key" ON "CreativeAsset"("deliverableId", "version");

-- CreateIndex
CREATE INDEX "MetricDaily_tenantId_idx" ON "MetricDaily"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDaily_deliverableId_day_source_key" ON "MetricDaily"("deliverableId", "day", "source");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingLink_code_key" ON "TrackingLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingLink_deliverableId_key" ON "TrackingLink"("deliverableId");

-- CreateIndex
CREATE INDEX "TrackingLink_tenantId_idx" ON "TrackingLink"("tenantId");

-- CreateIndex
CREATE INDEX "LinkEvent_tenantId_linkId_at_idx" ON "LinkEvent"("tenantId", "linkId", "at");

-- CreateIndex
CREATE INDEX "Reward_tenantId_state_idx" ON "Reward"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "RewardToken_token_key" ON "RewardToken"("token");

-- CreateIndex
CREATE INDEX "RewardToken_tenantId_idx" ON "RewardToken"("tenantId");

-- CreateIndex
CREATE INDEX "RewardEvent_tenantId_type_at_idx" ON "RewardEvent"("tenantId", "type", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Earning_orderId_key" ON "Earning"("orderId");

-- CreateIndex
CREATE INDEX "Earning_athleteId_taxYear_idx" ON "Earning"("athleteId", "taxYear");

-- CreateIndex
CREATE INDEX "Earning_tenantId_state_idx" ON "Earning"("tenantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_tenantId_kind_version_key" ON "Agreement"("tenantId", "kind", "version");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_tenantId_agreementId_idx" ON "AgreementAcceptance"("tenantId", "agreementId");

-- CreateIndex
CREATE INDEX "OutboxJob_dispatchedAt_createdAt_idx" ON "OutboxJob"("dispatchedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxJob_tenantId_idx" ON "OutboxJob"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_source_receivedAt_idx" ON "WebhookDelivery"("source", "receivedAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_at_idx" ON "AuditLog"("tenantId", "at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteSocial" ADD CONSTRAINT "AthleteSocial_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteScore" ADD CONSTRAINT "AthleteScore_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteRate" ADD CONSTRAINT "AthleteRate_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteRate" ADD CONSTRAINT "AthleteRate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NilJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SponsorPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CampaignBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NilJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOrder" ADD CONSTRAINT "CampaignOrder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOrder" ADD CONSTRAINT "CampaignOrder_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOrder" ADD CONSTRAINT "CampaignOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "NilJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOrder" ADD CONSTRAINT "CampaignOrder_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "AgreementAcceptance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CampaignOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDaily" ADD CONSTRAINT "MetricDaily_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEvent" ADD CONSTRAINT "LinkEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackingLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardToken" ADD CONSTRAINT "RewardToken_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardToken" ADD CONSTRAINT "RewardToken_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "RewardToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CampaignOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

