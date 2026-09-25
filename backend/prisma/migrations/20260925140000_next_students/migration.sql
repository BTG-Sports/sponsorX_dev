-- CreateEnum
CREATE TYPE "StudentState" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProspectState" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'STUDENT';
ALTER TYPE "Role" ADD VALUE 'ADVISOR';

-- AlterTable
ALTER TABLE "CampaignBrief" ADD COLUMN     "studentCodeId" TEXT;

-- AlterTable
ALTER TABLE "Sponsor" ADD COLUMN     "assignedStudentId" TEXT,
ADD COLUMN     "ownership" TEXT NOT NULL DEFAULT 'SPONSORX',
ADD COLUMN     "schoolPropertyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "studentId" TEXT;

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "athleteId" TEXT,
    "guardianId" TEXT,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "gradYear" INTEGER,
    "birthDate" TIMESTAMP(3),
    "ageBand" TEXT,
    "masthead" TEXT[],
    "state" "StudentState" NOT NULL DEFAULT 'DRAFT',
    "reviewerNotes" TEXT,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesAttribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "campaignId" TEXT,
    "editionId" TEXT,
    "value" INTEGER NOT NULL,
    "originatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPointAccrual" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "editionId" TEXT,
    "accruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPointAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProspect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "state" "ProspectState" NOT NULL DEFAULT 'SUBMITTED',
    "reasonCode" TEXT,
    "redirectCategories" TEXT[],
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProspect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_athleteId_key" ON "Student"("athleteId");

-- CreateIndex
CREATE INDEX "Student_tenantId_propertyId_state_idx" ON "Student"("tenantId", "propertyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCode_studentId_key" ON "StudentCode"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCode_code_key" ON "StudentCode"("code");

-- CreateIndex
CREATE INDEX "SalesAttribution_tenantId_studentId_idx" ON "SalesAttribution"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SalesAttribution_sponsorId_idx" ON "SalesAttribution"("sponsorId");

-- CreateIndex
CREATE INDEX "StudentPointAccrual_tenantId_studentId_idx" ON "StudentPointAccrual"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "StudentProspect_tenantId_studentId_idx" ON "StudentProspect"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentId_key" ON "User"("studentId");

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_studentCodeId_fkey" FOREIGN KEY ("studentCodeId") REFERENCES "StudentCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCode" ADD CONSTRAINT "StudentCode_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAttribution" ADD CONSTRAINT "SalesAttribution_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPointAccrual" ADD CONSTRAINT "StudentPointAccrual_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProspect" ADD CONSTRAINT "StudentProspect_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── P9-BE-13: attribution is permanent (copy: prisma/sql/sales_attribution_immutable.sql) ──
-- A sale's attribution is permanent — P9-BE-13, spec §5.1 and §6.3.
--
-- "A SalesAttribution row is never updated and never deleted — including when
-- the student graduates, is suspended, or the sponsor churns." That is the
-- decision most likely to be undone by someone trying to be helpful, so it is
-- Postgres's rule and not just the application's.
--
-- The only way past it is deliberate and named: a transaction that runs
--   SET LOCAL sponsorx.attribution_purge = 'on';
-- may DELETE (never UPDATE). That exists for test teardown and for a lawful
-- erasure request, both of which are decisions a person makes on purpose.
-- (Idempotent: CI re-applies every file here after migrating.)

CREATE OR REPLACE FUNCTION sales_attribution_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.attribution_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'sales_attribution_immutable: attribution % cannot be %d', OLD.id, lower(TG_OP)
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_attribution_immutable ON "SalesAttribution";
CREATE TRIGGER sales_attribution_immutable
  BEFORE UPDATE OR DELETE ON "SalesAttribution"
  FOR EACH ROW EXECUTE FUNCTION sales_attribution_immutable();
