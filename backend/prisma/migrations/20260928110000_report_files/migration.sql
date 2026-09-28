-- CreateTable
CREATE TABLE "ReportFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "requestedBy" TEXT,
    "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportFile_r2Key_key" ON "ReportFile"("r2Key");

-- CreateIndex
CREATE INDEX "ReportFile_tenantId_campaignId_idx" ON "ReportFile"("tenantId", "campaignId");

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

