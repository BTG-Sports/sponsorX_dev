-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SchoolPool" AS ENUM ('SALES', 'CONTENT');

-- AlterEnum
ALTER TYPE "AthleteState" ADD VALUE 'FEATURED';

-- AlterTable
ALTER TABLE "AgreementAcceptance" ADD COLUMN     "athleteId" TEXT,
ADD COLUMN     "studentId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Athlete" ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EditionAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "studentId" TEXT,
    "athleteId" TEXT,
    "r2Key" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "grantorKind" TEXT NOT NULL,
    "grantorRef" TEXT NOT NULL,
    "mayPublishDigital" BOOLEAN NOT NULL DEFAULT false,
    "mayPublishPrint" BOOLEAN NOT NULL DEFAULT false,
    "mayPromote" BOOLEAN NOT NULL DEFAULT false,
    "mayReuseCommercially" BOOLEAN NOT NULL DEFAULT false,
    "territory" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "attribution" TEXT,
    "acceptanceId" TEXT,
    "licenseRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "gradYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "ageBand" TEXT,
    "rosterMatched" BOOLEAN NOT NULL DEFAULT false,
    "state" "ClaimState" NOT NULL DEFAULT 'SUBMITTED',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentContribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPoolAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "pool" "SchoolPool" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolPoolAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditionAsset_tenantId_editionId_idx" ON "EditionAsset"("tenantId", "editionId");

-- CreateIndex
CREATE INDEX "ContentRight_tenantId_assetId_idx" ON "ContentRight"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "RosterEntry_tenantId_propertyId_idx" ON "RosterEntry"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "AthleteClaim_tenantId_athleteId_idx" ON "AthleteClaim"("tenantId", "athleteId");

-- CreateIndex
CREATE INDEX "ContentContribution_tenantId_editionId_idx" ON "ContentContribution"("tenantId", "editionId");

-- CreateIndex
CREATE INDEX "SchoolPoolAllocation_tenantId_idx" ON "SchoolPoolAllocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolPoolAllocation_editionId_propertyId_pool_key" ON "SchoolPoolAllocation"("editionId", "propertyId", "pool");

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EditionAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "AgreementAcceptance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteClaim" ADD CONSTRAINT "AthleteClaim_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentContribution" ADD CONSTRAINT "ContentContribution_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentContribution" ADD CONSTRAINT "ContentContribution_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPoolAllocation" ADD CONSTRAINT "SchoolPoolAllocation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── P9-BE-10/11: shape rules (copy: prisma/sql/next_rights_checks.sql) ──
-- SponsorX NEXT rights and consent — shape rules Prisma cannot express.
-- (Idempotent: CI re-applies every file here after migrating.)

-- P9-BE-11, spec §6.2 — an acceptance has EXACTLY ONE subject: a User who
-- clicked, or an athlete / student recorded without a login (a featured
-- athlete, a minor whose guardian signed). Never none, never two.
ALTER TABLE "AgreementAcceptance" DROP CONSTRAINT IF EXISTS "AgreementAcceptance_one_subject";
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_one_subject"
  CHECK (num_nonnulls("userId", "athleteId", "studentId") = 1);

-- P9-BE-10, spec §5.3 — a right is EITHER consent (points at the acceptance)
-- OR a negotiated licence (a contract reference). Exactly one.
ALTER TABLE "ContentRight" DROP CONSTRAINT IF EXISTS "ContentRight_one_basis";
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_one_basis"
  CHECK (num_nonnulls("acceptanceId", "licenseRef") = 1);

-- …and consent is what students, athletes and guardians give; a licence is
-- what BTG and third parties negotiate. The basis must match the grantor.
ALTER TABLE "ContentRight" DROP CONSTRAINT IF EXISTS "ContentRight_basis_matches_grantor";
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_basis_matches_grantor"
  CHECK (
    ("grantorKind" IN ('STUDENT', 'ATHLETE', 'GUARDIAN') AND "acceptanceId" IS NOT NULL)
    OR ("grantorKind" IN ('BTG', 'THIRD_PARTY') AND "licenseRef" IS NOT NULL)
  );
