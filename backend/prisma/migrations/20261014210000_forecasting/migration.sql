-- 3S4 — forecasting and pacing: a campaign's guarantee, daily pacing, forecasts kept as made, and risk alerts.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "guaranteeMetric" TEXT,
ADD COLUMN "guaranteeValue" INTEGER;

-- CreateTable
CREATE TABLE "CampaignPacing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "guarantee" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "expected" INTEGER NOT NULL,
    "elapsed" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CampaignPacing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignForecast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "guarantee" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "deliveredSource" TEXT NOT NULL,
    "elapsed" DOUBLE PRECISION NOT NULL,
    "low" INTEGER NOT NULL,
    "mid" INTEGER NOT NULL,
    "high" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "risk" TEXT NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "projection" JSONB NOT NULL,
    "forecastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignForecastAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),

    CONSTRAINT "CampaignForecastAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignPacing_tenantId_day_idx" ON "CampaignPacing"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPacing_campaignId_day_key" ON "CampaignPacing"("campaignId", "day");

-- CreateIndex
CREATE INDEX "CampaignForecast_tenantId_day_idx" ON "CampaignForecast"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignForecast_campaignId_day_key" ON "CampaignForecast"("campaignId", "day");

-- CreateIndex
CREATE INDEX "CampaignForecastAlert_tenantId_campaignId_raisedAt_idx" ON "CampaignForecastAlert"("tenantId", "campaignId", "raisedAt");
