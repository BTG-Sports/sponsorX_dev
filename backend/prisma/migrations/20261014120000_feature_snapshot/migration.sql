-- 3S2-BE-01 — daily feature snapshots: what was known about an athlete on a day, written once.

-- CreateTable
CREATE TABLE "FeatureSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "version" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureSnapshot_tenantId_entityType_entityId_day_key" ON "FeatureSnapshot"("tenantId", "entityType", "entityId", "day");
