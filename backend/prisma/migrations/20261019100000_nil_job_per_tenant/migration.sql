-- P8-BE-01 — a NIL job's id ("SX-02") is unique within its tenant, not across
-- the database, so a second tenant can hold its own catalogue (the finding in
-- documentation/SponsorX-Phase1-Acceptance.md, criterion 2). The four tables
-- that name a job now name it by (tenant, id), which also means the database
-- refuses a rate, invite, order or offer pointing at another tenant's job.

-- Refuse to start if a row already points at another tenant's job: the new
-- keys could not hold it, and it would be a cross-tenant leak to look into.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(t || ' ' || id, ', ') INTO bad FROM (
    SELECT 'AthleteRate' t, r.id FROM "AthleteRate" r JOIN "NilJob" j ON j.id = r."jobId" WHERE j."tenantId" <> r."tenantId"
    UNION ALL SELECT 'CampaignInvite', i.id FROM "CampaignInvite" i JOIN "NilJob" j ON j.id = i."jobId" WHERE j."tenantId" <> i."tenantId"
    UNION ALL SELECT 'CampaignOrder', o.id FROM "CampaignOrder" o JOIN "NilJob" j ON j.id = o."jobId" WHERE j."tenantId" <> o."tenantId"
    UNION ALL SELECT 'Offer', f.id FROM "Offer" f JOIN "NilJob" j ON j.id = f."jobId" WHERE j."tenantId" <> f."tenantId"
  ) x;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'P8-BE-01: rows point at another tenant''s NIL job: %', bad;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "AthleteRate" DROP CONSTRAINT "AthleteRate_jobId_fkey";
ALTER TABLE "CampaignInvite" DROP CONSTRAINT "CampaignInvite_jobId_fkey";
ALTER TABLE "CampaignOrder" DROP CONSTRAINT "CampaignOrder_jobId_fkey";
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_jobId_fkey";

-- AlterTable
ALTER TABLE "NilJob" DROP CONSTRAINT "NilJob_pkey",
ADD CONSTRAINT "NilJob_pkey" PRIMARY KEY ("tenantId", "id");

-- AddForeignKey
ALTER TABLE "AthleteRate" ADD CONSTRAINT "AthleteRate_tenantId_jobId_fkey" FOREIGN KEY ("tenantId", "jobId") REFERENCES "NilJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_tenantId_jobId_fkey" FOREIGN KEY ("tenantId", "jobId") REFERENCES "NilJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignOrder" ADD CONSTRAINT "CampaignOrder_tenantId_jobId_fkey" FOREIGN KEY ("tenantId", "jobId") REFERENCES "NilJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_jobId_fkey" FOREIGN KEY ("tenantId", "jobId") REFERENCES "NilJob"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
