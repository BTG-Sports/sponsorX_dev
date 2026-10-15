-- 3S9-OPS-01 — the nightly pipeline's record.

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_day_step_key" ON "PipelineRun"("day", "step");
