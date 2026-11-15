-- P9-BE-24 — student assignments and the advisor's content review.
-- A piece of edition content a student is assigned, writes and submits, and
-- the school's advisor approves or sends back. The review reuses the
-- deliverable states (deliverable-state.ts) and stops at APPROVED.

CREATE TABLE "StudentAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT,
    "brief" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "reviewState" "DeliverableState" NOT NULL DEFAULT 'NOT_STARTED',
    "draftText" TEXT,
    "r2Key" TEXT,
    "fileType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "revisionNote" TEXT,
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentAssignment_assetId_key" ON "StudentAssignment"("assetId");
CREATE INDEX "StudentAssignment_tenantId_propertyId_reviewState_idx" ON "StudentAssignment"("tenantId", "propertyId", "reviewState");
CREATE INDEX "StudentAssignment_tenantId_studentId_idx" ON "StudentAssignment"("tenantId", "studentId");

ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EditionAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The four states this review uses: no sponsor step, and it stops at APPROVED.
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_state_check"
  CHECK ("reviewState" IN ('NOT_STARTED', 'DRAFT_SUBMITTED', 'BTG_REVIEW', 'APPROVED'));
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_kind_check"
  CHECK ("kind" IN ('ARTICLE', 'INTERVIEW', 'PHOTO', 'DESIGN'));
-- A change request is open only while the piece is back with the student.
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_revision_check"
  CHECK ("revisionNote" IS NULL OR "reviewState" = 'DRAFT_SUBMITTED');
-- Submitted means something was submitted: words or a file.
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_draft_check"
  CHECK ("reviewState" = 'NOT_STARTED' OR ("version" > 0 AND ("draftText" IS NOT NULL OR "r2Key" IS NOT NULL)));
-- Approved, and only approved, carries its edition content item.
ALTER TABLE "StudentAssignment" ADD CONSTRAINT "StudentAssignment_asset_check"
  CHECK (("reviewState" = 'APPROVED') = ("assetId" IS NOT NULL AND "approvedAt" IS NOT NULL));
