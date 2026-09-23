-- Fan consent, captured at claim — P6-SEC-01, §26.
--
-- `RewardEvent.fanEmail` is the only fan PII this system holds. Until now it
-- could be written with nothing recording that the fan agreed to it. These
-- three columns are that record, and the domain refuses to set the address
-- without them.
--
-- THE VERSION IS WHY THIS IS THREE COLUMNS AND NOT A BOOLEAN. "They
-- consented" is not a defensible record three months later, after the wording
-- has been edited twice. "They consented to version 2026-09-01, at this
-- timestamp, for reward delivery" is. The version string identifies the text
-- that was actually on the screen in front of them.
--
-- The purpose is scoped for the same reason: agreeing to be sent a voucher is
-- not agreeing to marketing, and a single boolean loses that distinction the
-- first time somebody exports the list for a campaign.
--
-- All nullable. A fan who claims without leaving an address has nothing to
-- consent to, and forcing a value would mean inventing one.
--
-- Verified by applying every migration from scratch to a throwaway Postgres.

-- AlterTable
ALTER TABLE "RewardEvent" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentPurpose" TEXT;
