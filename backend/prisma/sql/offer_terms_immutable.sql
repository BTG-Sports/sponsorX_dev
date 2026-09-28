-- 2S2-BE-03 — an offer's terms do not move once the athlete has them.
--
-- "Accepting an offer freezes commercial terms ... later rate-card edits do
-- not alter it." The application never updates them past DRAFT; this makes it
-- Postgres's rule too, so a future code path cannot quietly rewrite what an
-- athlete agreed to. Once SENT, the terms and their hash are fixed; once a
-- snapshot is written it and the order link are fixed; ACCEPTED is final.
-- (Idempotent: CI re-applies every file here after migrating.)

CREATE OR REPLACE FUNCTION offer_terms_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."state" <> 'DRAFT' AND (
       NEW."campaignId" IS DISTINCT FROM OLD."campaignId" OR NEW."athleteId" IS DISTINCT FROM OLD."athleteId"
    OR NEW."jobId" IS DISTINCT FROM OLD."jobId" OR NEW."inventoryItemId" IS DISTINCT FROM OLD."inventoryItemId"
    OR NEW."brief" IS DISTINCT FROM OLD."brief" OR NEW."compensation" IS DISTINCT FROM OLD."compensation"
    OR NEW."sellPrice" IS DISTINCT FROM OLD."sellPrice" OR NEW."deliverables" IS DISTINCT FROM OLD."deliverables"
    OR NEW."usageRights" IS DISTINCT FROM OLD."usageRights" OR NEW."exclusivityDays" IS DISTINCT FROM OLD."exclusivityDays"
    OR NEW."disclosures" IS DISTINCT FROM OLD."disclosures" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."termsHash" IS DISTINCT FROM OLD."termsHash") THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % terms are fixed once sent', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."termsSnapshot" IS NOT NULL AND (
       NEW."termsSnapshot" IS DISTINCT FROM OLD."termsSnapshot" OR NEW."orderId" IS DISTINCT FROM OLD."orderId") THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % accepted terms never change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."state" = 'ACCEPTED' AND NEW."state" IS DISTINCT FROM OLD."state" THEN
    RAISE EXCEPTION 'offer_terms_immutable: offer % is accepted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_terms_immutable ON "Offer";
CREATE TRIGGER offer_terms_immutable BEFORE UPDATE ON "Offer"
  FOR EACH ROW EXECUTE FUNCTION offer_terms_immutable();
