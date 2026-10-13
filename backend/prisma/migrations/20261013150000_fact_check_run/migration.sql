-- 3S1-QA-01 — the nightly fact check's record, one row per day (FactCheckRun).
-- CreateTable
CREATE TABLE "FactCheckRun" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summariesOk" BOOLEAN,
    "appOk" BOOLEAN,
    "differenceCount" INTEGER NOT NULL DEFAULT 0,
    "failingTenants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "differences" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "FactCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactCheckRun_day_key" ON "FactCheckRun"("day");

-- CreateIndex
CREATE INDEX "FactCheckRun_finishedAt_idx" ON "FactCheckRun"("finishedAt");
