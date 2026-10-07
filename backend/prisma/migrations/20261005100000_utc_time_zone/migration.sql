-- 2S8-OPS-02 — the database runs in UTC, and no rule depends on the session.
--
-- Every timestamp column holds UTC as `timestamp without time zone`. Bare
-- `now()` is a timestamptz, and comparing it with such a column makes
-- Postgres read the column in the SESSION's zone: on the local Mac database
-- (Asia/Manila) an edition stopped selling eight hours before its close date.

-- 1. Pin this database to UTC — staging, production and every local or CI
--    database alike, on its next `prisma migrate deploy`. It applies to NEW
--    sessions only; a connection already open keeps its zone until it is
--    re-established (the API and worker reconnect on their next deploy).
--    `current_database()`, so the same migration names whichever database it
--    runs in.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;

-- 2. The edition rule from 20260925120000, redefined to read the clock in UTC
--    whatever the session's zone. Identical to prisma/sql/adslot_inventory.sql
--    (sql-rules-in-migrations.test.ts holds the two together).
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
  -- 2S8-OPS-02: "closeDate" is UTC wall-clock time, so the clock is too.
  IF ed.state <> 'SELLING' OR (now() AT TIME ZONE 'UTC') >= ed."closeDate" THEN
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
