-- P9-BE-22 — edition ad artwork checked automatically on upload; a sponsor
-- with a clean record skips BTG's review; the sponsor's licence for its own
-- approved artwork recorded automatically.
-- P9-BE-23 — consent rights recorded automatically from a consent in force.
--
-- No backfill, deliberately (P5-BE-10's rule): with both clocks empty every
-- sponsor starts at a clean record of 0, so nobody skips BTG until three of
-- their artworks have been passed by BTG under this rule.

-- The latest file as its presigned grant described it, and its checks.
ALTER TABLE "EditionAsset" ADD COLUMN "artworkContentType" TEXT;
ALTER TABLE "EditionAsset" ADD COLUMN "artworkBytes" INTEGER;
ALTER TABLE "EditionAsset" ADD COLUMN "artworkChecks" JSONB;
ALTER TABLE "EditionAsset" ADD COLUMN "artworkChecksPassed" BOOLEAN;
ALTER TABLE "EditionAsset" ADD COLUMN "artworkCheckedAt" TIMESTAMP(3);
-- The trusted-sponsor skip, and the two clocks the record is read from.
ALTER TABLE "EditionAsset" ADD COLUMN "btgReviewSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EditionAsset" ADD COLUMN "skipReason" TEXT;
ALTER TABLE "EditionAsset" ADD COLUMN "btgPassedAt" TIMESTAMP(3);
ALTER TABLE "EditionAsset" ADD COLUMN "btgRevisionAt" TIMESTAMP(3);

-- None of it exists on an asset that is not a slot's artwork.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_artwork_review_fields" CHECK (
  "adSlotId" IS NOT NULL
  OR ("artworkChecks" IS NULL AND "artworkChecksPassed" IS NULL AND "artworkCheckedAt" IS NULL
      AND NOT "btgReviewSkipped" AND "btgPassedAt" IS NULL AND "btgRevisionAt" IS NULL)
);
-- A skip always says why, and only a skip has a reason.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_skipReason_check"
  CHECK ("btgReviewSkipped" = ("skipReason" IS NOT NULL));
-- Only artwork that passed its checks can have skipped — a failing upload
-- never reaches BTG, let alone past it.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_btgReviewSkipped_check"
  CHECK (NOT "btgReviewSkipped" OR "artworkChecksPassed" IS TRUE);
-- An upload that failed its checks is back with its supplier: never on a
-- review desk.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_failed_checks_draft"
  CHECK ("artworkChecksPassed" IS DISTINCT FROM false OR "reviewState" = 'DRAFT_SUBMITTED');

-- Rights recorded by the system, and on what.
ALTER TABLE "ContentRight" ADD COLUMN "autoBasis" TEXT;
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_autoBasis_check" CHECK (
  "autoBasis" IS NULL
  OR ("autoBasis" = 'AD_APPROVAL' AND "grantorKind" = 'THIRD_PARTY' AND "licenseRef" IS NOT NULL)
  OR ("autoBasis" = 'CONSENT' AND "grantorKind" IN ('STUDENT', 'ATHLETE', 'GUARDIAN') AND "acceptanceId" IS NOT NULL)
);
-- Idempotent by construction: one automatic ad licence per artwork, and one
-- automatic consent right per asset and acceptance. A retry, or two
-- triggers racing, cannot record a second.
CREATE UNIQUE INDEX "ContentRight_auto_ad_approval_key"
  ON "ContentRight"("assetId") WHERE "autoBasis" = 'AD_APPROVAL';
CREATE UNIQUE INDEX "ContentRight_auto_consent_key"
  ON "ContentRight"("assetId", "acceptanceId") WHERE "autoBasis" = 'CONSENT';
