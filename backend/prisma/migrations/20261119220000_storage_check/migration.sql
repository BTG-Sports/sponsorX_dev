-- POL-BE-113 — the live storage check's record: can a browser on the website upload to each storage area?
CREATE TABLE "StorageCheck" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "results" JSONB NOT NULL,
    "problem" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageCheck_pkey" PRIMARY KEY ("id"),
    -- A pass names no problem; a failure always says what failed.
    CONSTRAINT "StorageCheck_problem_check" CHECK (("ok" AND "problem" IS NULL) OR (NOT "ok" AND "problem" IS NOT NULL))
);

CREATE INDEX "StorageCheck_finishedAt_idx" ON "StorageCheck"("finishedAt");
