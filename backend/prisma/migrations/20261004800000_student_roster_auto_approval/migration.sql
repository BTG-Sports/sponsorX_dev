-- P9-BE-20 — students approved from the school roster; P9-BE-21 — prospects
-- decided automatically. A step is automatic when every safety check passes,
-- and held for the right person, with the reason, when one fails.

-- The school's email domain: an adult student is approved from the roster
-- only with an application email on it. Lower case, no "@", at least one dot,
-- and only on a school.
ALTER TABLE "Property" ADD COLUMN "emailDomain" TEXT;
ALTER TABLE "Property" ADD CONSTRAINT "Property_emailDomain_check"
  CHECK ("emailDomain" IS NULL OR ("kind" = 'SCHOOL' AND "emailDomain" ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'));

-- Why an application waits for the advisor, and the automatic approval.
ALTER TABLE "Student" ADD COLUMN "reviewReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Student" ADD COLUMN "autoApprovedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "autoApprovedRosterEntryId" TEXT;
ALTER TABLE "Student" ADD COLUMN "autoApprovalDigestedAt" TIMESTAMP(3);
-- Reasons are a hold, and a hold is UNDER_REVIEW: any move out clears them.
ALTER TABLE "Student" ADD CONSTRAINT "Student_reviewReasons_check"
  CHECK (cardinality("reviewReasons") = 0 OR "state" = 'UNDER_REVIEW');
-- An automatic approval names the roster entry it matched — both or neither —
-- and is put in a digest only once it has happened.
ALTER TABLE "Student" ADD CONSTRAINT "Student_autoApproved_check"
  CHECK (("autoApprovedAt" IS NULL) = ("autoApprovedRosterEntryId" IS NULL)
     AND ("autoApprovalDigestedAt" IS NULL OR "autoApprovedAt" IS NOT NULL));

-- A prospect the system decided, and why one was held for SALES / BTG.
ALTER TABLE "StudentProspect" ADD COLUMN "decidedAutomatically" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudentProspect" ADD COLUMN "reviewReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Decided automatically means decided, and never after being held.
ALTER TABLE "StudentProspect" ADD CONSTRAINT "StudentProspect_decidedAutomatically_check"
  CHECK (NOT "decidedAutomatically" OR ("state" <> 'SUBMITTED' AND "decidedAt" IS NOT NULL AND cardinality("reviewReasons") = 0));

-- The BTG desk reads held (SUBMITTED) prospects across the tenant.
CREATE INDEX "StudentProspect_tenantId_state_idx" ON "StudentProspect"("tenantId", "state");
