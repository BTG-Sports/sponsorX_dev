-- POL-BE-102 — a sponsor's Account page: the company's details and the person's own.

-- Saved at once by a sponsor admin, audited.
ALTER TABLE "Sponsor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "billingContactEmail" TEXT,
ADD COLUMN     "billingContactName" TEXT,
ADD COLUMN     "billingContactPhone" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "website" TEXT;

ALTER TABLE "User" ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "jobTitle" TEXT;

-- A change to the company name or brand categories, waiting for BTG.
CREATE TABLE "SponsorAccountChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "name" TEXT,
    "categories" TEXT[],
    "categoriesChanged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorAccountChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SponsorAccountChange_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT "SponsorAccountChange_something_check" CHECK ("name" IS NOT NULL OR "categoriesChanged")
);

CREATE INDEX "SponsorAccountChange_tenantId_status_idx" ON "SponsorAccountChange"("tenantId", "status");
CREATE INDEX "SponsorAccountChange_sponsorId_idx" ON "SponsorAccountChange"("sponsorId");

-- One change waits at a time per sponsor.
CREATE UNIQUE INDEX "SponsorAccountChange_one_pending" ON "SponsorAccountChange"("sponsorId") WHERE "status" = 'PENDING';

ALTER TABLE "SponsorAccountChange" ADD CONSTRAINT "SponsorAccountChange_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
