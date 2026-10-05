-- P5-BE-10 — BTG's content review skipped for trusted drafts.
--
-- Deliverable.btgReviewSkipped / skipReason: the latest submission went
-- straight to the sponsor, and why. btgPassedAt / btgRevisionAt: the last
-- time a BTG reviewer passed it on from BTG_REVIEW, and the last time BTG
-- asked for a revision on it — the athlete's clean streak is read from these.
--
-- No backfill, deliberately: with both clocks empty every athlete starts at
-- a streak of 0, so nobody skips BTG until three drafts have been passed by
-- BTG under this rule. Backfilling passes without the matching revisions
-- would be the unsafe direction.
ALTER TABLE "Deliverable" ADD COLUMN "btgReviewSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deliverable" ADD COLUMN "skipReason" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "btgPassedAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "btgRevisionAt" TIMESTAMP(3);

-- A skip always says why, and only a skip has a reason.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_skipReason_check"
  CHECK ("btgReviewSkipped" = ("skipReason" IS NOT NULL));
-- Only a submitted draft that passed its checks can have skipped.
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_btgReviewSkipped_check"
  CHECK (NOT "btgReviewSkipped" OR ("state" <> 'NOT_STARTED' AND "checksPassed" IS TRUE));
