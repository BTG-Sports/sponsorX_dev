-- POL-BE-104 — a team's own details page.

-- The public description, saved at once.
ALTER TABLE "Property" ADD COLUMN "description" TEXT;

-- A change to the name, place or type details: automatic when every check passes, held for BTG when one fails.
CREATE TABLE "PropertyProfileChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "holdReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyProfileChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PropertyProfileChange_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX "PropertyProfileChange_tenantId_status_idx" ON "PropertyProfileChange"("tenantId", "status");
CREATE INDEX "PropertyProfileChange_propertyId_idx" ON "PropertyProfileChange"("propertyId");

-- One change waits at a time per property.
CREATE UNIQUE INDEX "PropertyProfileChange_one_pending" ON "PropertyProfileChange"("propertyId") WHERE "status" = 'PENDING';

ALTER TABLE "PropertyProfileChange" ADD CONSTRAINT "PropertyProfileChange_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- POL-BE-102 brought in line with Phase 2 automation: a sponsor's name or
-- category change goes through at once when every check passes.
ALTER TABLE "SponsorAccountChange" ADD COLUMN "holdReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "autoApproved" BOOLEAN NOT NULL DEFAULT false;
