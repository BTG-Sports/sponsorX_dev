-- 4S2-BE-01/02/03 — sponsors' creative for virtual placements, checked against
-- the placement's specs; deployments; and the world's manifest version
-- (documentation/SponsorX-Virtual-Registry.md §5–§7).

-- AlterTable
ALTER TABLE "VirtualWorld" ADD COLUMN "manifestVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VirtualAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "creativeType" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "checksum" TEXT,
    "state" TEXT NOT NULL,
    "problems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeDeployment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetVersion" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAsset_windowId_version_key" ON "VirtualAsset"("windowId", "version");

-- CreateIndex
CREATE INDEX "VirtualAsset_tenantId_windowId_idx" ON "VirtualAsset"("tenantId", "windowId");

-- CreateIndex
CREATE INDEX "CreativeDeployment_tenantId_worldId_state_idx" ON "CreativeDeployment"("tenantId", "worldId", "state");

-- CreateIndex
CREATE INDEX "CreativeDeployment_tenantId_windowId_idx" ON "CreativeDeployment"("tenantId", "windowId");

ALTER TABLE "VirtualAsset" ADD CONSTRAINT "VirtualAsset_values_check" CHECK ((
  "state" IN ('VALIDATED', 'REJECTED') AND "creativeType" IN ('IMAGE', 'VIDEO', 'LOGO')
  AND "mime" IN ('image/png', 'image/jpeg', 'image/webp', 'video/mp4')
  AND "version" >= 1 AND "bytes" > 0
  -- A validated version has no problems; a rejected one names at least one.
  AND ("state" = 'VALIDATED') = (cardinality("problems") = 0)
) IS TRUE);

ALTER TABLE "CreativeDeployment" ADD CONSTRAINT "CreativeDeployment_values_check" CHECK ((
  "state" IN ('DRAFT', 'APPROVED', 'PAUSED', 'ROLLED_BACK', 'ENDED')
  AND "endsAt" > "startsAt" AND "sequence" >= 1
  AND ("state" = 'DRAFT' OR "approvedAt" IS NOT NULL OR "state" = 'ENDED')
  AND ("state" = 'ENDED') = ("endedAt" IS NOT NULL)
) IS TRUE);

-- One creative at a time on a booked window: two APPROVED deployments on the
-- same window never share a moment (btree_gist, created by 20261016170000).
ALTER TABLE "CreativeDeployment" ADD CONSTRAINT "CreativeDeployment_no_overlap"
  EXCLUDE USING gist ("windowId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("state" = 'APPROVED');
