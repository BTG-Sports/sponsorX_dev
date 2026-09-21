-- Sent-email ledger — P3-INT-01.
--
-- Exists only to make sending idempotent. The outbox drain is at-least-once
-- by design (P2-BE-05) and pg-boss retries failed jobs, so the handler can be
-- asked to send the same message more than once. It claims the key here first
-- and refuses a key already claimed.
--
-- It stores the key, template and recipient — not the message body. §26 is
-- clear that personal data should not accumulate where nobody thinks to look.

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "idempotencyKey" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSendLog_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE INDEX "EmailSendLog_tenantId_sentAt_idx" ON "EmailSendLog"("tenantId", "sentAt");

