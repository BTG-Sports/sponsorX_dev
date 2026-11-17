-- POL-BE-107: the country a campaign brief targets. Every existing brief was
-- written against US states and US athletes (Athlete.countryCode defaults to
-- US), so the default backfills them as US and changes no match.
ALTER TABLE "CampaignBrief" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'US';
