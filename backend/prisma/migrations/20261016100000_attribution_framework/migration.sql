-- 3S6-BE-01 — attribution partners and their deliveries.

-- CreateTable
CREATE TABLE "AttributionPartner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "problems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "events" JSONB NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AttributionDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributionPartner_tenantId_idx" ON "AttributionPartner"("tenantId");

-- CreateIndex
CREATE INDEX "AttributionDelivery_tenantId_partnerId_receivedAt_idx" ON "AttributionDelivery"("tenantId", "partnerId", "receivedAt");
