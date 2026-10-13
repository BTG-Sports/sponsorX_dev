-- 3S1-DATA-02 · stg — the raw copies, made usable.
--
-- For every VERSIONED raw table, stg."<Table>" is the latest version of each
-- row that still exists in the product; APPEND tables already hold one row per
-- source row. Columns stay in `_row` (jsonb) and are read with ->> where used.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
            WHERE c.table_schema = 'raw' AND c.column_name = '_version_id' LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW stg.%I AS
         SELECT id, tenant_id, _row FROM (
           SELECT DISTINCT ON (id) id, tenant_id, _row, _deleted FROM raw.%I ORDER BY id, _version_id DESC
         ) v WHERE NOT _deleted', t.table_name, t.table_name);
  END LOOP;
  FOR t IN SELECT c.table_name FROM information_schema.columns c
            WHERE c.table_schema = 'raw' AND c.column_name = '_at' AND c.table_name NOT LIKE '\_%' LOOP
    EXECUTE format('CREATE OR REPLACE VIEW stg.%I AS SELECT id, tenant_id, _row FROM raw.%I', t.table_name, t.table_name);
  END LOOP;
END $$;

-- The audit history, with names that changed mapped to the current one
-- (audit §6: `listing.archived` was written before 3S0-BE-03).
CREATE OR REPLACE VIEW stg.audit AS
  SELECT id, tenant_id,
         CASE _row->>'action' WHEN 'listing.archived' THEN 'listing.archive' ELSE _row->>'action' END AS action,
         _row->>'entity' AS entity, _row->>'entityId' AS entity_id, (_row->>'at')::timestamp AS at
    FROM raw."AuditLog";

-- yyyymmdd for a date.
CREATE OR REPLACE FUNCTION dw.dk(date) RETURNS int LANGUAGE sql IMMUTABLE AS
  $$ SELECT to_char($1, 'YYYYMMDD')::int $$;

-- A market's key from a city and a US state (design §4 dim_market): the city
-- trimmed and title-cased, '' when absent; no state means unknown (key 0).
CREATE OR REPLACE FUNCTION dw.market_key(city text, state text) RETURNS bigint LANGUAGE sql IMMUTABLE AS
  $$ SELECT CASE WHEN nullif(btrim(coalesce(state, '')), '') IS NULL THEN 0::bigint
                 ELSE dw.k('market:' || upper(btrim(state)) || ':' || coalesce(initcap(btrim(city)), '')) END $$;

-- A JSON list as text[]; anything that is not a list (absent, JSON null) is
-- empty rather than an error — a nullable array column must not stop a build.
CREATE OR REPLACE FUNCTION dw.arr(j jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(j)) ELSE '{}'::text[] END $$;

-- Add these dates to the date table if missing. The table is seeded with
-- 2020–2035, but every date the data actually holds must be there too: one
-- odd date in a record must never stop the build (found 2026-10-13).
CREATE OR REPLACE FUNCTION dw.ensure_dates(ds date[]) RETURNS void LANGUAGE sql AS $$
  INSERT INTO dw.dim_date
  SELECT dw.dk(d), d, extract(year FROM d), extract(quarter FROM d), extract(month FROM d), extract(week FROM d), extract(isodow FROM d),
         date_trunc('month', d)::date, date_trunc('week', d)::date,
         CASE WHEN extract(month FROM d) BETWEEN 8 AND 11 THEN 'FALL'
              WHEN extract(month FROM d) IN (12, 1, 2) THEN 'WINTER'
              WHEN extract(month FROM d) BETWEEN 3 AND 5 THEN 'SPRING' ELSE 'SUMMER' END
    FROM (SELECT DISTINCT unnest(ds) AS d) x WHERE d IS NOT NULL
  ON CONFLICT (date_key) DO NOTHING
$$;
