-- CreateEnum
CREATE TYPE "OnboardingState" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "listingAccessAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PropertyOnboarding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "state" "OnboardingState" NOT NULL DEFAULT 'DRAFT',
    "orgType" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "stateCode" TEXT,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "details" JSONB NOT NULL DEFAULT '{}',
    "payoutAcknowledgedAt" TIMESTAMP(3),
    "termsAgreementId" TEXT,
    "termsHash" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "propertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOnboarding_propertyId_key" ON "PropertyOnboarding"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyOnboarding_tenantId_state_idx" ON "PropertyOnboarding"("tenantId", "state");

-- AddForeignKey
ALTER TABLE "PropertyOnboarding" ADD CONSTRAINT "PropertyOnboarding_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

