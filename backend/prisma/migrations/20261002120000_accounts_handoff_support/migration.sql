-- 2S1-BE-13 · 2S1-BE-14 · 2S1-BE-15 · 2S1-BE-16 — closing an account and
-- coming back, profile edits without BTG review, changing a minor's
-- guardian, and contacting BTG support.

-- 2S1-BE-13 — closed accounts, their 30-day retention and reactivation.
CREATE TABLE "AccountClosure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CLOSED',
    "reason" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pausedListingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "listingAccessWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reactivatedAt" TIMESTAMP(3),
    "reactivatedBy" TEXT,
    "recheckNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purgedAt" TIMESTAMP(3),
    "reactivationRequestedAt" TIMESTAMP(3),
    "reactivationRequestNote" TEXT,
    "reactivationDecision" TEXT,
    "reactivationDecidedAt" TIMESTAMP(3),
    "reactivationDecidedBy" TEXT,
    "reactivationDecisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountClosure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountClosure_tenantId_state_retainUntil_idx" ON "AccountClosure"("tenantId", "state", "retainUntil");
CREATE INDEX "AccountClosure_tenantId_subjectKind_subjectId_idx" ON "AccountClosure"("tenantId", "subjectKind", "subjectId");
/* One open closure per account: closing twice, or two closes racing, fails here. */
CREATE UNIQUE INDEX "AccountClosure_one_open_per_subject" ON "AccountClosure"("subjectKind", "subjectId") WHERE "state" = 'CLOSED';
ALTER TABLE "AccountClosure" ADD CONSTRAINT "AccountClosure_subjectKind_check" CHECK ("subjectKind" IN ('ATHLETE', 'GUARDIAN', 'PROPERTY', 'SPONSOR'));
ALTER TABLE "AccountClosure" ADD CONSTRAINT "AccountClosure_cause_check" CHECK ("cause" IN ('SELF', 'REJECTED', 'TERMINATED'));
ALTER TABLE "AccountClosure" ADD CONSTRAINT "AccountClosure_state_check" CHECK ("state" IN ('CLOSED', 'REACTIVATED', 'PURGED'));
ALTER TABLE "AccountClosure" ADD CONSTRAINT "AccountClosure_reactivationDecision_check" CHECK ("reactivationDecision" IS NULL OR "reactivationDecision" IN ('DECLINED'));

-- 2S1-BE-14 — edits publish at once; sensitive ones re-run the checks.
ALTER TABLE "AthleteProfileChange" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AthleteProfileChange" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentKey" TEXT;
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentFilename" TEXT;
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentContentType" TEXT;
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentBytes" INTEGER;
ALTER TABLE "AthleteProfileChange" ADD COLUMN "idDocumentUploadedAt" TIMESTAMP(3);
ALTER TABLE "AthleteProfileChange" ADD COLUMN "checkNotes" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "AthleteProfileChange_idDocumentKey_key" ON "AthleteProfileChange"("idDocumentKey");

-- 2S1-BE-15 — the guardian handoff and the new guardian's documents.
CREATE TABLE "GuardianHandoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "fromGuardianId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "relationship" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "emailConfirmedAt" TIMESTAMP(3),
    "agreementAcceptedAt" TIMESTAMP(3),
    "agreementVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "declineNote" TEXT,
    "documentsCheckedAt" TIMESTAMP(3),
    "switchedAt" TIMESTAMP(3),
    "newGuardianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuardianHandoff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GuardianHandoff_tenantId_athleteId_state_idx" ON "GuardianHandoff"("tenantId", "athleteId", "state");
CREATE INDEX "GuardianHandoff_tenantId_fromGuardianId_state_idx" ON "GuardianHandoff"("tenantId", "fromGuardianId", "state");
ALTER TABLE "GuardianHandoff" ADD CONSTRAINT "GuardianHandoff_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuardianHandoff" ADD CONSTRAINT "GuardianHandoff_state_check" CHECK ("state" IN ('REQUESTED', 'WAITING', 'SWITCHED', 'DECLINED', 'CANCELLED'));
ALTER TABLE "GuardianHandoff" ADD CONSTRAINT "GuardianHandoff_relationship_check" CHECK ("relationship" IN ('PARENT', 'LEGAL_GUARDIAN', 'AUTHORIZED_REP'));

CREATE TABLE "GuardianHandoffDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "handoffId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "proofKind" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuardianHandoffDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuardianHandoffDocument_r2Key_key" ON "GuardianHandoffDocument"("r2Key");
CREATE INDEX "GuardianHandoffDocument_tenantId_handoffId_idx" ON "GuardianHandoffDocument"("tenantId", "handoffId");
ALTER TABLE "GuardianHandoffDocument" ADD CONSTRAINT "GuardianHandoffDocument_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "GuardianHandoff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuardianHandoffDocument" ADD CONSTRAINT "GuardianHandoffDocument_kind_check" CHECK ("kind" IN ('GUARDIAN_ID', 'GUARDIANSHIP_PROOF'));
ALTER TABLE "GuardianHandoffDocument" ADD CONSTRAINT "GuardianHandoffDocument_proofKind_check"
  CHECK ("proofKind" IS NULL OR "proofKind" IN ('BIRTH_CERTIFICATE', 'COURT_ORDER', 'SCHOOL_RECORD'));

-- 2S1-BE-16 — messages to BTG support and their attachments.
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "queuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportMessage_tenantId_createdAt_idx" ON "SupportMessage"("tenantId", "createdAt");
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_topic_check" CHECK ("topic" IN ('GUARDIANSHIP', 'ACCOUNT', 'PAYMENT', 'OTHER'));
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_state_check" CHECK ("state" IN ('DRAFT', 'QUEUED'));

CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportAttachment_r2Key_key" ON "SupportAttachment"("r2Key");
CREATE INDEX "SupportAttachment_tenantId_messageId_idx" ON "SupportAttachment"("tenantId", "messageId");
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
