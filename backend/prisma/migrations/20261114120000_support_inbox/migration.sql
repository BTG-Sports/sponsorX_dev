-- POL-BE-41 — the support inbox. A message has a status BTG works it by,
-- and BTG's replies are kept with it (each one emailed to the sender from
-- noreply@, never written in Gmail).

-- Messages already received start as New: none of them was answered here.
ALTER TABLE "SupportMessage"
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW',
    ADD COLUMN "answeredAt" TIMESTAMP(3),
    ADD COLUMN "closedAt" TIMESTAMP(3),
    ADD COLUMN "closedById" TEXT;

ALTER TABLE "SupportMessage"
    ADD CONSTRAINT "SupportMessage_status_check" CHECK ("status" IN ('NEW', 'ANSWERED', 'CLOSED')),
    -- Closed: when and by whom.
    ADD CONSTRAINT "SupportMessage_closed_check" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

CREATE INDEX "SupportMessage_tenantId_status_createdAt_idx" ON "SupportMessage"("tenantId", "status", "createdAt");

CREATE TABLE "SupportReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportReply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportReply_body_check" CHECK (length(btrim("body")) > 0)
);

CREATE INDEX "SupportReply_tenantId_messageId_createdAt_idx" ON "SupportReply"("tenantId", "messageId", "createdAt");

ALTER TABLE "SupportReply" ADD CONSTRAINT "SupportReply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
