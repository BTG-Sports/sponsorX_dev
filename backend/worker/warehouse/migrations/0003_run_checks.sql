-- 3S1-DATA-02 · each run records how long the model took to build and the
-- result of the double-check against the app, taken inside the same frozen
-- view of the app as the copy (so a change mid-run is never a false alarm).
ALTER TABLE raw._ingest_run ADD COLUMN IF NOT EXISTS build_ms integer;
ALTER TABLE raw._ingest_run ADD COLUMN IF NOT EXISTS reconcile jsonb;
