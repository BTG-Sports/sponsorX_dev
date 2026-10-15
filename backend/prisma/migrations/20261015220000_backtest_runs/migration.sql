-- 3S9-QA-01 — backtest runs per model version.

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "calibration" JSONB NOT NULL,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_tenantId_model_ranAt_idx" ON "BacktestRun"("tenantId", "model", "ranAt");
