-- Invoice and payment status mirrored from Zoho — P7-BE-04, §18.
--
-- SPONSORX IS NOT THE INVOICE SYSTEM OF RECORD. This table holds a COPY of
-- what Zoho Books owns, so that "has this campaign been paid?" can be answered
-- without a request to Zoho on a page load — §18 keeps Zoho off every request
-- path, and a report page that blocked on their API would go down whenever
-- they did.
--
-- The shape enforces the boundary. There is no line-item table, no tax column
-- and no total to compute: nothing here can originate an invoice, only reflect
-- one. "zohoInvoiceId" is UNIQUE because the Zoho record is this row's real
-- identity; it has none of its own to defend, and the uniqueness is what makes
-- ingestion idempotent when a webhook is redelivered.
--
-- "status" is Zoho's own string, copied verbatim rather than mapped onto an
-- enum of ours. An enum would need a translation table that silently drops any
-- status Zoho adds later, and a payment state we fail to recognise must be
-- visible rather than coerced into the nearest one we know.
--
-- "lastSyncOrigin"/"lastSyncHash" are §18's loop prevention, matching Sponsor
-- and Campaign: they let an echo of our own write be recognised and dropped
-- instead of bouncing back.
--
-- Written by hand rather than with `prisma migrate diff`: that command needs a
-- shadow database, and Railway's Postgres is reachable only over its private
-- network. `prisma validate` passes on the schema this was derived from.

-- CreateTable
CREATE TABLE "CampaignInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "zohoInvoiceId" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInvoice_zohoInvoiceId_key" ON "CampaignInvoice"("zohoInvoiceId");

-- CreateIndex
CREATE INDEX "CampaignInvoice_tenantId_status_idx" ON "CampaignInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CampaignInvoice_campaignId_idx" ON "CampaignInvoice"("campaignId");

-- AddForeignKey
ALTER TABLE "CampaignInvoice" ADD CONSTRAINT "CampaignInvoice_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
