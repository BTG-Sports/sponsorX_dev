-- A sale's attribution is permanent — P9-BE-13, spec §5.1 and §6.3.
--
-- "A SalesAttribution row is never updated and never deleted — including when
-- the student graduates, is suspended, or the sponsor churns." That is the
-- decision most likely to be undone by someone trying to be helpful, so it is
-- Postgres's rule and not just the application's.
--
-- The only way past it is deliberate and named: a transaction that runs
--   SET LOCAL sponsorx.attribution_purge = 'on';
-- may DELETE (never UPDATE). That exists for test teardown and for a lawful
-- erasure request, both of which are decisions a person makes on purpose.
-- (Idempotent: CI re-applies every file here after migrating.)

CREATE OR REPLACE FUNCTION sales_attribution_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.attribution_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'sales_attribution_immutable: attribution % cannot be %d', OLD.id, lower(TG_OP)
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_attribution_immutable ON "SalesAttribution";
CREATE TRIGGER sales_attribution_immutable
  BEFORE UPDATE OR DELETE ON "SalesAttribution"
  FOR EACH ROW EXECUTE FUNCTION sales_attribution_immutable();
