-- 2S3-BE-06 — listings publish automatically; BTG handles the exceptions.
--
-- A listing whose checks pass goes live on submit. One that is flagged
-- (restricted words, the seller's standing) waits in PENDING_APPROVAL with
-- its reasons. BTG can pause or end any live listing, with a reason the
-- seller is emailed.
ALTER TABLE "Listing" ADD COLUMN "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Listing" ADD COLUMN "heldWords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Listing" ADD COLUMN "publishedAutomatically" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN "btgAction" TEXT;
ALTER TABLE "Listing" ADD COLUMN "btgReason" TEXT;
ALTER TABLE "Listing" ADD COLUMN "btgActedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "btgActedBy" TEXT;

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_btgAction_check"
  CHECK ("btgAction" IS NULL OR "btgAction" IN ('PAUSED', 'ENDED'));
-- A BTG pause or end always carries its reason, when and by whom.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_btgAction_reason_check"
  CHECK ("btgAction" IS NULL OR (length(btrim("btgReason")) BETWEEN 1 AND 2000 AND "btgActedAt" IS NOT NULL AND "btgActedBy" IS NOT NULL));
-- A BTG pause is never on a live listing (it stays on the row, through the
-- seller's edits and BTG's review, until BTG puts it back live); a BTG end
-- is on an archived one.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_btgAction_state_check"
  CHECK ("btgAction" IS NULL
      OR ("btgAction" = 'PAUSED' AND "state" <> 'PUBLISHED')
      OR ("btgAction" = 'ENDED' AND "state" = 'ARCHIVED'));
-- Published automatically means it is (or was) published, by nobody's decision.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_auto_published_check"
  CHECK (NOT "publishedAutomatically" OR "publishedAt" IS NOT NULL);

CREATE INDEX "Listing_tenantId_publishedAutomatically_publishedAt_idx" ON "Listing"("tenantId", "publishedAutomatically", "publishedAt");

-- BTG's daily summary: one per BTG tenant per UTC day.
CREATE TABLE "ListingDigest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "listings" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingDigest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ListingDigest_tenantId_day_key" ON "ListingDigest"("tenantId", "day");
ALTER TABLE "ListingDigest" ADD CONSTRAINT "ListingDigest_day_check" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "ListingDigest" ADD CONSTRAINT "ListingDigest_window_check" CHECK ("windowStart" < "windowEnd" AND "listings" >= 0);
