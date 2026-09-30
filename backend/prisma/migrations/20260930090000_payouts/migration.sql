-- 2S5-BE-04 / 2S5-BE-05 / 2S5-INT-01 / 2S5-INT-03 — payout accounts, payment
-- attempts and payouts. The provider holds bank and card details; these rows
-- hold only its references and statuses.
ALTER TABLE "MarketplaceOrder" ADD COLUMN "fulfilledAt" TIMESTAMP(3);

CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_SET_UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayoutAccount_payeeType_payeeId_key" ON "PayoutAccount"("payeeType", "payeeId");
CREATE INDEX "PayoutAccount_tenantId_idx" ON "PayoutAccount"("tenantId");

CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAttempt_tenantId_orderId_idx" ON "PaymentAttempt"("tenantId", "orderId");
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "payeeTenantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payout_tenantId_state_idx" ON "Payout"("tenantId", "state");
CREATE INDEX "Payout_payeeTenantId_payeeType_payeeId_idx" ON "Payout"("payeeTenantId", "payeeType", "payeeId");

CREATE TABLE "PayoutLine" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "PayoutLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayoutLine_orderId_idx" ON "PayoutLine"("orderId");
CREATE INDEX "PayoutLine_payoutId_idx" ON "PayoutLine"("payoutId");
ALTER TABLE "PayoutLine" ADD CONSTRAINT "PayoutLine_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
