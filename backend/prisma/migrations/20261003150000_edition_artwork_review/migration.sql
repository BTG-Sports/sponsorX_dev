-- P9-BE-16 — edition ad artwork on the approval board (option B, programme
-- owner 2026-10-02). The board learns a second kind of subject: the buyer's
-- artwork for a SOLD AdSlot is an EditionAsset (kind AD_CREATIVE) that carries
-- the deliverable review states. No new state machine — the transitions are
-- deliverable-state.ts's — and no fake Campaign Order.

ALTER TABLE "EditionAsset" ADD COLUMN "adSlotId" TEXT;
ALTER TABLE "EditionAsset" ADD COLUMN "reviewState" "DeliverableState";
ALTER TABLE "EditionAsset" ADD COLUMN "artworkVersion" INTEGER;
ALTER TABLE "EditionAsset" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "EditionAsset" ADD COLUMN "revisionNote" TEXT;

-- One artwork per slot.
CREATE UNIQUE INDEX "EditionAsset_adSlotId_key" ON "EditionAsset"("adSlotId");
CREATE INDEX "EditionAsset_tenantId_reviewState_idx" ON "EditionAsset"("tenantId", "reviewState");

ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_adSlotId_fkey"
  FOREIGN KEY ("adSlotId") REFERENCES "AdSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The shape: either an ordinary asset with no review at all, or a slot's
-- artwork — an AD_CREATIVE with a file, a version, a submission time and a
-- review state. The review stops at APPROVED: PUBLISHED and VERIFIED are an
-- athlete's post going live and BTG checking the link, and an ad is
-- published by its edition, not by itself.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_artwork_shape" CHECK (
  ("adSlotId" IS NULL AND "reviewState" IS NULL AND "artworkVersion" IS NULL
     AND "submittedAt" IS NULL AND "revisionNote" IS NULL)
  OR
  ("adSlotId" IS NOT NULL AND "kind" = 'AD_CREATIVE' AND "r2Key" IS NOT NULL
     AND "artworkVersion" >= 1 AND "submittedAt" IS NOT NULL
     AND "reviewState" IN ('DRAFT_SUBMITTED', 'BTG_REVIEW', 'SPONSOR_REVIEW', 'APPROVED'))
);

-- An open revision request lives only while the artwork is back with whoever
-- supplies it.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_revision_note_draft" CHECK (
  "revisionNote" IS NULL OR "reviewState" = 'DRAFT_SUBMITTED'
);

-- The artwork belongs to the slot's own edition, and only to a sold slot.
CREATE OR REPLACE FUNCTION edition_asset_guard_artwork() RETURNS trigger AS $$
DECLARE
  slot RECORD;
BEGIN
  IF NEW."adSlotId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "editionId", "campaignId", "tenantId" INTO slot FROM "AdSlot" WHERE id = NEW."adSlotId";
  IF slot."editionId" IS DISTINCT FROM NEW."editionId" OR slot."tenantId" IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'edition_artwork_wrong_edition' USING ERRCODE = 'check_violation';
  END IF;
  IF slot."campaignId" IS NULL THEN
    RAISE EXCEPTION 'edition_artwork_unsold_slot' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER edition_asset_guard_artwork
  BEFORE INSERT OR UPDATE OF "adSlotId", "editionId" ON "EditionAsset"
  FOR EACH ROW EXECUTE FUNCTION edition_asset_guard_artwork();
