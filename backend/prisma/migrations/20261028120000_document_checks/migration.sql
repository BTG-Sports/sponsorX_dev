-- P8-BE-11 — what reading each document found; P8-BE-10 — BTG sending a document back.
-- Every column is nullable: documents uploaded before today were never read, and are not held.

-- AlterTable
ALTER TABLE "AccountDocument" ADD COLUMN "checkState" TEXT,
ADD COLUMN "checkFindings" JSONB,
ADD COLUMN "checkedAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "returnedReason" TEXT,
ADD COLUMN "returnedBy" TEXT;

-- AlterTable
ALTER TABLE "InquiryDocument" ADD COLUMN "checkState" TEXT,
ADD COLUMN "checkFindings" JSONB,
ADD COLUMN "checkedAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "returnedReason" TEXT,
ADD COLUMN "returnedBy" TEXT;

-- AlterTable
ALTER TABLE "OnboardingDocument" ADD COLUMN "checkState" TEXT,
ADD COLUMN "checkFindings" JSONB,
ADD COLUMN "checkedAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "returnedReason" TEXT,
ADD COLUMN "returnedBy" TEXT;

-- AlterTable
ALTER TABLE "GuardianHandoffDocument" ADD COLUMN "checkState" TEXT,
ADD COLUMN "checkFindings" JSONB,
ADD COLUMN "checkedAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "returnedReason" TEXT,
ADD COLUMN "returnedBy" TEXT;

-- AlterTable
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentCheckState" TEXT,
ADD COLUMN "idDocumentCheckFindings" JSONB,
ADD COLUMN "idDocumentCheckedAt" TIMESTAMP(3),
ADD COLUMN "idDocumentReturnedAt" TIMESTAMP(3),
ADD COLUMN "idDocumentReturnedReason" TEXT;
