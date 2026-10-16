-- 4S1-BE-04 — placement availability windows: overlapping purchases of the
-- same placement are rejected (documentation/SponsorX-Virtual-Registry.md §4).

-- The EXCLUDE constraint below compares a text column for equality inside a
-- GiST index, which needs btree_gist (a standard Postgres contrib extension).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "PlacementWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "state" TEXT NOT NULL DEFAULT 'BOOKED',
    "bookedBy" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,

    CONSTRAINT "PlacementWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlacementWindow_tenantId_placementId_startsAt_idx" ON "PlacementWindow"("tenantId", "placementId", "startsAt");

-- CreateIndex
CREATE INDEX "PlacementWindow_tenantId_campaignId_idx" ON "PlacementWindow"("tenantId", "campaignId");

ALTER TABLE "PlacementWindow" ADD CONSTRAINT "PlacementWindow_values_check" CHECK ((
  "state" IN ('BOOKED', 'RELEASED') AND "slot" >= 1 AND "priceCents" > 0 AND "endsAt" > "startsAt"
  AND ("state" = 'RELEASED') = ("releasedAt" IS NOT NULL)
) IS TRUE);

-- The rule itself: one booking per placement and slot for any day.
-- Half-open ranges, so one week ending as the next begins is not an overlap.
ALTER TABLE "PlacementWindow" ADD CONSTRAINT "PlacementWindow_no_overlap"
  EXCLUDE USING gist ("placementId" WITH =, "slot" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("state" = 'BOOKED');
