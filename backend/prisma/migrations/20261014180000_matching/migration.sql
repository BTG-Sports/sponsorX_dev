-- 3S3 — sponsor matching: the brief's matching inputs, ranking runs and their scores, and shortlists.

-- AlterTable
ALTER TABLE "CampaignBrief" ADD COLUMN "audienceMinFollowers" INTEGER,
ADD COLUMN "audienceTiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "excludedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "filteredOut" JSONB NOT NULL,
    "candidates" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "reasons" TEXT[],
    "availability" JSONB NOT NULL,

    CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefShortlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "savedBy" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefShortlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRun_tenantId_briefId_kind_computedAt_idx" ON "MatchRun"("tenantId", "briefId", "kind", "computedAt");

-- CreateIndex
CREATE INDEX "MatchScore_runId_rank_idx" ON "MatchScore"("runId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_runId_matchId_key" ON "MatchScore"("runId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefShortlist_briefId_key" ON "BriefShortlist"("briefId");
