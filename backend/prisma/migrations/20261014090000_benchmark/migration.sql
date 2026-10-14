-- 3S1-DATA-03 — percentile benchmarks of effective CPM, rebuilt nightly from the fact ledger's summaries.

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "p25" INTEGER NOT NULL,
    "median" INTEGER NOT NULL,
    "p75" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_tenantId_dimension_segment_metric_key" ON "Benchmark"("tenantId", "dimension", "segment", "metric");
