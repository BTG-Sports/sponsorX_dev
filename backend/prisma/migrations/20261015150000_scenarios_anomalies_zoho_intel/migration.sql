-- 3S7-BE-01 saved scenarios; 3S8-DATA-01 anomalies; 3S7-INT-01 what was last sent to Zoho.

-- AlterTable
ALTER TABLE "Sponsor" ADD COLUMN "zohoIntelHash" TEXT,
ADD COLUMN "zohoIntelPushedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "savedBy" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT,
    "note" TEXT,
    "decidedBy" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyScan" (
    "tenantId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnomalyScan_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "Scenario_tenantId_savedAt_idx" ON "Scenario"("tenantId", "savedAt");

-- CreateIndex
CREATE INDEX "Anomaly_tenantId_outcome_idx" ON "Anomaly"("tenantId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "Anomaly_tenantId_fingerprint_key" ON "Anomaly"("tenantId", "fingerprint");
