-- 3S1-DATA-01 — the warehouse's ingestion bookkeeping
-- (documentation/SponsorX-Warehouse-Schema.md §2). The raw copies themselves
-- are created from worker/warehouse/sources.mts, one per source table, all of
-- one of two shapes; this file holds what is shared.
CREATE SCHEMA IF NOT EXISTS raw;

-- One row per ingestion run: when, how it ended, and rows per table.
CREATE TABLE IF NOT EXISTS raw._ingest_run (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  rows        jsonb,
  error       text
);

-- APPEND tables: the latest event time copied, per table. Each run re-reads
-- from a little before it (the overlap) so late writes are not missed.
CREATE TABLE IF NOT EXISTS raw._watermark (
  table_name text PRIMARY KEY,
  last_at    timestamp NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
