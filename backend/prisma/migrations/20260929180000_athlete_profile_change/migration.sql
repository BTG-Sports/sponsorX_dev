-- P3-BE-16 — an approved athlete's proposed profile edits, held for BTG
-- review. The Athlete row moves only on approval.
CREATE TYPE "ProfileChangeState" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

CREATE TABLE "AthleteProfileChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "sections" TEXT[],
    "fields" JSONB NOT NULL,
    "note" TEXT,
    "state" "ProfileChangeState" NOT NULL DEFAULT 'PENDING',
    "reviewerNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteProfileChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AthleteProfileChange_tenantId_state_createdAt_idx" ON "AthleteProfileChange"("tenantId", "state", "createdAt");
CREATE INDEX "AthleteProfileChange_athleteId_state_idx" ON "AthleteProfileChange"("athleteId", "state");

ALTER TABLE "AthleteProfileChange" ADD CONSTRAINT "AthleteProfileChange_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
