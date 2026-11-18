-- 2S4-BE-16 — Deal Chat: one chat per seller on a marketplace order, its
-- question-card answers, its offer exchanges and its messages. A message's
-- words, author and time never change once sent (trigger at the end).

-- CreateTable
CREATE TABLE "DealChat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "sellerKey" TEXT NOT NULL,
    "athleteId" TEXT,
    "athleteTenantId" TEXT,
    "propertyId" TEXT,
    "propertyTenantId" TEXT,
    "lineIds" TEXT[],
    "forms" TEXT[],
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "dealAgreementId" TEXT,
    "sponsorReadAt" TIMESTAMP(3),
    "sellerReadAt" TIMESTAMP(3),
    "sponsorEmailedAt" TIMESTAMP(3),
    "sellerEmailedAt" TIMESTAMP(3),
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealChatPick" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "value" TEXT[],
    "userId" TEXT NOT NULL,
    "guardianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealChatPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealChatExchange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "cardKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "startedBy" TEXT NOT NULL,
    "latestMessageId" TEXT,
    "sponsorAcceptedMessageId" TEXT,
    "sellerAcceptedMessageId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealChatExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "exchangeId" TEXT,
    "kind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guardianId" TEXT,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'VISIBLE',
    "heldReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "keptBackReason" TEXT,
    "reportedAt" TIMESTAMP(3),
    "reportedBy" TEXT,
    "reportReason" TEXT,
    "reportClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealChat_tenantId_state_idx" ON "DealChat"("tenantId", "state");

-- CreateIndex
CREATE INDEX "DealChat_athleteTenantId_athleteId_idx" ON "DealChat"("athleteTenantId", "athleteId");

-- CreateIndex
CREATE INDEX "DealChat_propertyTenantId_propertyId_idx" ON "DealChat"("propertyTenantId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "DealChat_orderId_sellerKey_key" ON "DealChat"("orderId", "sellerKey");

-- CreateIndex
CREATE UNIQUE INDEX "DealChatPick_chatId_cardKey_side_key" ON "DealChatPick"("chatId", "cardKey", "side");

-- CreateIndex
CREATE INDEX "DealChatExchange_chatId_state_idx" ON "DealChatExchange"("chatId", "state");

-- CreateIndex
CREATE INDEX "DealChatMessage_chatId_createdAt_idx" ON "DealChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "DealChatMessage_tenantId_state_idx" ON "DealChatMessage"("tenantId", "state");

-- CreateIndex
CREATE INDEX "DealChatMessage_tenantId_reportedAt_idx" ON "DealChatMessage"("tenantId", "reportedAt");

-- AddForeignKey
ALTER TABLE "DealChat" ADD CONSTRAINT "DealChat_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealChatPick" ADD CONSTRAINT "DealChatPick_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DealChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealChatExchange" ADD CONSTRAINT "DealChatExchange_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DealChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealChatMessage" ADD CONSTRAINT "DealChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DealChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A message is never edited after it is sent: only BTG's check (state,
-- reasons, reviewer, kept-back reason) and a report may be recorded on it.
CREATE OR REPLACE FUNCTION "DealChatMessage_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."body" IS DISTINCT FROM OLD."body"
     OR NEW."chatId" IS DISTINCT FROM OLD."chatId"
     OR NEW."exchangeId" IS DISTINCT FROM OLD."exchangeId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."side" IS DISTINCT FROM OLD."side"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."guardianId" IS DISTINCT FROM OLD."guardianId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" THEN
    RAISE EXCEPTION 'A Deal Chat message cannot be changed after it is sent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DealChatMessage_immutable"
  BEFORE UPDATE ON "DealChatMessage"
  FOR EACH ROW EXECUTE FUNCTION "DealChatMessage_immutable"();
