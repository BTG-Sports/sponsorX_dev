-- P4-BE-12 — campaigns staff themselves from their package. P4-BE-13 (a
-- campaign launches on its own startDate) needs no column.
--
-- Campaign.autoStaffing: on for a campaign created from a brief whose package
-- has athlete job lines (createCampaignFromBrief sets it); off otherwise.
-- Campaign.staffingStopReason / staffingStoppedAt: why automatic staffing
-- handed the campaign to BTG, and when.
ALTER TABLE "Campaign" ADD COLUMN "autoStaffing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "staffingStopReason" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "staffingStoppedAt" TIMESTAMP(3);

-- A stop has its reason and its time together, and the reason is words.
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_staffingStop_check"
  CHECK (("staffingStopReason" IS NULL) = ("staffingStoppedAt" IS NULL)
    AND ("staffingStopReason" IS NULL OR length(btrim("staffingStopReason")) > 0));

-- The athletes automatic staffing skipped on a campaign, and why.
CREATE TABLE "CampaignStaffingSkip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignStaffingSkip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignStaffingSkip_reason_check" CHECK (length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "CampaignStaffingSkip_campaignId_athleteId_key" ON "CampaignStaffingSkip"("campaignId", "athleteId");
CREATE INDEX "CampaignStaffingSkip_tenantId_idx" ON "CampaignStaffingSkip"("tenantId");

ALTER TABLE "CampaignStaffingSkip" ADD CONSTRAINT "CampaignStaffingSkip_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Campaigns already made from a brief with an athlete package take the
-- default they would have been created with. The flag acts only on a
-- campaign in DRAFT or STAFFING, so a live or finished one is untouched.
UPDATE "Campaign" c SET "autoStaffing" = true
  FROM "CampaignBrief" b JOIN "SponsorPackage" p ON p."id" = b."packageId"
  WHERE c."briefId" = b."id"
    AND p."athleteCountMax" > 0
    AND jsonb_typeof(p."lineItems") = 'array' AND jsonb_array_length(p."lineItems") > 0;
