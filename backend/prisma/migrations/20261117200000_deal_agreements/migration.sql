-- 2S4-BE-14 — Deal Chat agreements: the approved DEAL template filled in from
-- an order and its chat, between the order's sponsor and one seller, with each
-- side's signature (AgreementAcceptance).

-- CreateTable
CREATE TABLE "DealAgreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "athleteId" TEXT,
    "athleteTenantId" TEXT,
    "propertyId" TEXT,
    "propertyTenantId" TEXT,
    "lineIds" TEXT[],
    "agreementId" TEXT NOT NULL,
    "forms" TEXT[],
    "body" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "originalAmountCents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "sponsorAcceptanceId" TEXT,
    "sellerAcceptanceId" TEXT,
    "signedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "DealAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealAgreement_sponsorAcceptanceId_key" ON "DealAgreement"("sponsorAcceptanceId");

-- CreateIndex
CREATE UNIQUE INDEX "DealAgreement_sellerAcceptanceId_key" ON "DealAgreement"("sellerAcceptanceId");

-- CreateIndex
CREATE INDEX "DealAgreement_tenantId_state_idx" ON "DealAgreement"("tenantId", "state");

-- CreateIndex
CREATE INDEX "DealAgreement_orderId_idx" ON "DealAgreement"("orderId");

-- CreateIndex
CREATE INDEX "DealAgreement_athleteTenantId_athleteId_idx" ON "DealAgreement"("athleteTenantId", "athleteId");

-- CreateIndex
CREATE INDEX "DealAgreement_propertyTenantId_propertyId_idx" ON "DealAgreement"("propertyTenantId", "propertyId");

-- AddForeignKey
ALTER TABLE "DealAgreement" ADD CONSTRAINT "DealAgreement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAgreement" ADD CONSTRAINT "DealAgreement_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAgreement" ADD CONSTRAINT "DealAgreement_sponsorAcceptanceId_fkey" FOREIGN KEY ("sponsorAcceptanceId") REFERENCES "AgreementAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAgreement" ADD CONSTRAINT "DealAgreement_sellerAcceptanceId_fkey" FOREIGN KEY ("sellerAcceptanceId") REFERENCES "AgreementAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
