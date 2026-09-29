-- P4-FE-07 — why BTG closed a brief. Shown back on the Briefs queue; also
-- recorded on the brief.close audit row.
ALTER TABLE "CampaignBrief" ADD COLUMN "closeReason" TEXT;
