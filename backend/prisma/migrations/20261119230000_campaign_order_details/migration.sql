-- POL-BE-116 — every athlete order follows the Athlete Campaign Order template.
ALTER TABLE "CampaignBrief" ADD COLUMN "orderDetails" JSONB, ADD COLUMN "orderCode" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "orderDetails" JSONB, ADD COLUMN "orderCode" TEXT, ADD COLUMN "orderCodeYear" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "orderDetails" JSONB;
ALTER TABLE "CampaignOrder" ADD COLUMN "orderNumber" TEXT, ADD COLUMN "orderDetails" JSONB;
ALTER TABLE "Earning" ADD COLUMN "payBy" TIMESTAMP(3);

CREATE TABLE "OrderNumberCounter" (
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("tenantId", "code", "year")
);

CREATE UNIQUE INDEX "CampaignOrder_tenantId_orderNumber_key" ON "CampaignOrder"("tenantId", "orderNumber");
CREATE UNIQUE INDEX "Campaign_tenantId_orderCode_orderCodeYear_key" ON "Campaign"("tenantId", "orderCode", "orderCodeYear");

-- Three capital letters, and a code always with its year.
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orderCode_check" CHECK ("orderCode" IS NULL OR "orderCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orderCodeYear_check" CHECK (("orderCode" IS NULL) = ("orderCodeYear" IS NULL));
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_orderCode_check" CHECK ("orderCode" IS NULL OR "orderCode" ~ '^[A-Z]{3}$');
ALTER TABLE "OrderNumberCounter" ADD CONSTRAINT "OrderNumberCounter_code_check" CHECK ("code" ~ '^[A-Z]{3}$' AND "last" >= 0);
