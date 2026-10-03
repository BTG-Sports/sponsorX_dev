-- P5-BE-09 — automatic checks before BTG reviews content, and the 48-hour
-- review reminders.
--
-- CreativeAsset.contentType: the MIME type the upload was presigned for, read
-- from the grant's audit row when the asset is registered. Existing assets
-- were never recorded: null (the file-type check then fails, honestly).
ALTER TABLE "CreativeAsset" ADD COLUMN "contentType" TEXT;

-- Deliverable: the latest submission's caption (and the version it went with)
-- and its checks; when the current draft reached its current reviewer, and
-- whether that wait has had its reminder.
ALTER TABLE "Deliverable" ADD COLUMN "caption" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "captionVersion" INTEGER;
ALTER TABLE "Deliverable" ADD COLUMN "checks" JSONB;
ALTER TABLE "Deliverable" ADD COLUMN "checksPassed" BOOLEAN;
ALTER TABLE "Deliverable" ADD COLUMN "checkedAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "reviewWaitingSince" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "reviewRemindedAt" TIMESTAMP(3);

-- A checked submission has its verdict, its checks and its time together.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_checks_check"
  CHECK (("checksPassed" IS NULL) = ("checkedAt" IS NULL) AND ("checksPassed" IS NULL) = ("checks" IS NULL));
-- A caption only ever arrives with a submission.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_caption_check"
  CHECK ("caption" IS NULL OR "checkedAt" IS NOT NULL);
-- Waiting is measured only on a review desk, and a draft that failed its
-- checks is with the athlete, not waiting on anyone.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_reviewWaitingSince_check"
  CHECK ("reviewWaitingSince" IS NULL OR ("state" IN ('DRAFT_SUBMITTED', 'BTG_REVIEW', 'SPONSOR_REVIEW') AND "checksPassed" IS DISTINCT FROM false));
-- A reminder belongs to a wait.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_reviewRemindedAt_check"
  CHECK ("reviewRemindedAt" IS NULL OR "reviewWaitingSince" IS NOT NULL);

CREATE INDEX "Deliverable_state_reviewWaitingSince_idx" ON "Deliverable"("state", "reviewWaitingSince");

-- Backfill the waits already under way, so the reminders cover them.
-- With the sponsor: since it was sent to them.
UPDATE "Deliverable" d SET "reviewWaitingSince" = COALESCE(
  (SELECT max(a."at") FROM "AuditLog" a
    WHERE a."entity" = 'Deliverable' AND a."entityId" = d."id" AND a."action" = 'deliverable.sponsorReview'),
  CURRENT_TIMESTAMP)
WHERE d."state" = 'SPONSOR_REVIEW';

-- With BTG: since the latest upload (the desk's own "waiting" clock) — but not
-- a draft a reviewer sent back that the athlete has not answered yet.
UPDATE "Deliverable" d SET "reviewWaitingSince" = COALESCE(
  (SELECT max(c."uploadedAt") FROM "CreativeAsset" c WHERE c."deliverableId" = d."id"),
  (SELECT max(a."at") FROM "AuditLog" a
    WHERE a."entity" = 'Deliverable' AND a."entityId" = d."id" AND a."action" = 'deliverable.submitDraft'),
  CURRENT_TIMESTAMP)
WHERE d."state" IN ('DRAFT_SUBMITTED', 'BTG_REVIEW')
  AND (d."state" = 'BTG_REVIEW' OR NOT EXISTS (
    SELECT 1 FROM "AuditLog" r
     WHERE r."entity" = 'Deliverable' AND r."entityId" = d."id" AND r."action" = 'deliverable.requestRevision'
       AND r."at" > COALESCE((SELECT max(c."uploadedAt") FROM "CreativeAsset" c WHERE c."deliverableId" = d."id"), '-infinity'::timestamp)));
