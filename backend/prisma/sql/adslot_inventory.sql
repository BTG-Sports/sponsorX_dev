-- The NEXT ad inventory's rules, enforced by Postgres — P9-BE-03.
--
-- "The back cover sells exactly once, enforced by the database and not by a
-- query; a slot cannot be sold after the edition's closeDate." Application
-- code checks these too, for a readable error — but two booths selling at the
-- same instant, or a script someone runs by hand, meet these instead.

-- One row per position. Several identical positions are several rows, so
-- each can be sold, and refused, on its own.
-- (Idempotent throughout: CI re-applies every file here after migrating.)
ALTER TABLE "AdSlot" DROP CONSTRAINT IF EXISTS "AdSlot_quantity_one";
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_quantity_one" CHECK (quantity = 1);
ALTER TABLE "AdSlot" DROP CONSTRAINT IF EXISTS "AdSlot_price_nonnegative";
ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_price_nonnegative"
  CHECK ("priceCents" >= 0 AND ("soldCents" IS NULL OR "soldCents" >= 0));

-- One back cover and one presenting sponsor per edition — quantity ONE in
-- the rate card (P9-PMO-01) — however many rows someone tries to add.
CREATE UNIQUE INDEX IF NOT EXISTS "AdSlot_one_exclusive_per_edition"
  ON "AdSlot" ("editionId", kind)
  WHERE kind IN ('BACK_COVER', 'PRESENTING');

-- A sale is setting campaignId. It must be the first sale of that row, into
-- an edition still SELLING and before its close date, to a campaign in the
-- same tenant. Releasing (campaignId back to NULL, when a campaign is
-- cancelled or deleted) is allowed; moving a sold slot straight to another
-- campaign is not.
CREATE OR REPLACE FUNCTION adslot_guard_sale() RETURNS trigger AS $$
DECLARE
  ed RECORD;
BEGIN
  IF NEW."campaignId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."campaignId" IS NOT DISTINCT FROM NEW."campaignId" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."campaignId" IS NOT NULL THEN
    RAISE EXCEPTION 'adslot_already_sold: slot % is already sold', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "closeDate", state INTO ed FROM "Edition" WHERE id = NEW."editionId" FOR SHARE;
  IF ed.state <> 'SELLING' OR now() >= ed."closeDate" THEN
    RAISE EXCEPTION 'adslot_edition_closed: edition % is not selling', NEW."editionId"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Campaign" WHERE id = NEW."campaignId" AND "tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'adslot_cross_tenant: campaign % is not in this tenant', NEW."campaignId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS adslot_guard_sale ON "AdSlot";
CREATE TRIGGER adslot_guard_sale
  BEFORE INSERT OR UPDATE OF "campaignId" ON "AdSlot"
  FOR EACH ROW EXECUTE FUNCTION adslot_guard_sale();
