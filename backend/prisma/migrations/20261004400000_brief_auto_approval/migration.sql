-- P4-BE-11 — sponsor briefs approved automatically; BTG handles only the
-- exceptions. A brief whose every safety check passes moves DRAFT →
-- QUALIFIED → APPROVED → CAMPAIGN_CREATED as the system (`autoApproved`);
-- one that fails any check stays DRAFT, held for BTG with its reasons.
ALTER TABLE "CampaignBrief" ADD COLUMN "autoApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CampaignBrief" ADD COLUMN "heldAt" TIMESTAMP(3);
ALTER TABLE "CampaignBrief" ADD COLUMN "heldKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CampaignBrief" ADD COLUMN "heldReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The failed checks come from one closed list (HOLD_KEYS in
-- src/domain/brief-auto-rules.ts).
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_heldKeys_check"
  CHECK ("heldKeys" <@ ARRAY['OBJECTIVE', 'DATES', 'NO_PACKAGE', 'BUDGET', 'ATHLETES', 'SENSITIVE', 'SPONSOR']::TEXT[]);
-- A hold has its start, its checks and its reasons together, or none of them.
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_hold_check"
  CHECK (("heldAt" IS NULL) = (cardinality("heldKeys") = 0) AND ("heldAt" IS NULL) = (cardinality("heldReasons") = 0));
-- An automatically approved brief has left DRAFT, and was never left held.
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_autoApproved_check"
  CHECK (NOT "autoApproved" OR ("state" <> 'DRAFT' AND "heldAt" IS NULL));

-- The daily re-check reads DRAFT briefs held for too few athletes.
CREATE INDEX "CampaignBrief_state_heldAt_idx" ON "CampaignBrief"("state", "heldAt");
