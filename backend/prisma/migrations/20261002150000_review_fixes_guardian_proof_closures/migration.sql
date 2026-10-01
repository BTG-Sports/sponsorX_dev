-- The review fixes to 2S1-BE-10, 2S1-BE-13 and 2S1-BE-14 (2026-10-01).

-- 2S1-BE-10 — proof of guardianship is per (guardian, athlete): each minor's
-- approval needs proof naming THAT minor. A guardian's government ID still
-- serves every athlete they look after. A proof uploaded before this names
-- the guardian's first athlete — the one whose set-up it was uploaded on.
ALTER TABLE "AccountDocument" ADD COLUMN "wardId" TEXT;
UPDATE "AccountDocument" d
   SET "wardId" = (
     SELECT a."id" FROM "Athlete" a
      WHERE a."guardianId" = d."guardianId" AND a."tenantId" = d."tenantId"
      ORDER BY a."createdAt" ASC, a."id" ASC
      LIMIT 1)
 WHERE d."kind" = 'GUARDIANSHIP_PROOF';
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_ward_check"
  CHECK ("wardId" IS NULL OR "kind" = 'GUARDIANSHIP_PROOF');
CREATE INDEX "AccountDocument_tenantId_guardianId_wardId_idx" ON "AccountDocument"("tenantId", "guardianId", "wardId");

-- 2S1-BE-10 / -14 — a guardian already verified for another minor, named for
-- an approved athlete by a profile edit, acts for them only once proof naming
-- them and the agreement for them are in.
ALTER TABLE "Athlete" ADD COLUMN "guardianPendingSince" TIMESTAMP(3);

-- 2S1-BE-13 — a Reject before approval closes the APPLICATION: an
-- organisation's onboarding (no Property yet) and a sponsor's request
-- declined before an account opened. Their uploaded documents go on the same
-- 30-day purge, and they can ask BTG to look again.
ALTER TABLE "AccountClosure" DROP CONSTRAINT "AccountClosure_subjectKind_check";
ALTER TABLE "AccountClosure" ADD CONSTRAINT "AccountClosure_subjectKind_check"
  CHECK ("subjectKind" IN ('ATHLETE', 'GUARDIAN', 'PROPERTY', 'SPONSOR', 'ONBOARDING', 'INQUIRY'));
