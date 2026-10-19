-- 4S7-BE-01 — an INFINEX placement booked inside a campaign is a money fact
-- (PLACEMENT_WINDOW_BOOKED), summed per campaign and day beside the orders and
-- ad slots (documentation/SponsorX-Fact-Ledger.md).

-- AlterTable
ALTER TABLE "CampaignDaySummary" ADD COLUMN "virtualBookedCents" BIGINT NOT NULL DEFAULT 0;

-- A booked window belongs to a real campaign: the campaign counts its windows
-- beside its orders and ad slots (one campaign, virtual and other inventory).
-- AddForeignKey
ALTER TABLE "PlacementWindow" ADD CONSTRAINT "PlacementWindow_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
