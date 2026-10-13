-- 3S1-DATA-02 — the analytical model's tables
-- (documentation/SponsorX-Warehouse-Schema.md §4–§7 and Appendix A).
-- The rows are rebuilt by worker/warehouse/transforms/*.sql after every
-- ingestion; this file only holds the shapes.
--
-- KEYS ARE COMPUTED, NOT COUNTED. dw.k() turns a row's own identity (its
-- source id, and for a type-2 dimension the version's first day) into a
-- bigint. A rebuild produces the same keys, so anything that keeps a key
-- (benchmarks, feature snapshots) never sees it renumbered. Key 0 is each
-- dimension's unknown member.
CREATE SCHEMA IF NOT EXISTS stg;
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS sem;

CREATE OR REPLACE FUNCTION dw.k(text) RETURNS bigint LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('x' || substr(md5($1), 1, 15))::bit(60)::bigint $$;

ALTER TABLE raw._ingest_run ADD COLUMN IF NOT EXISTS built jsonb;

CREATE TABLE IF NOT EXISTS dw.dim_date (
  date_key     int PRIMARY KEY,
  date         date NOT NULL UNIQUE,
  year         smallint NOT NULL,
  quarter      smallint NOT NULL,
  month        smallint NOT NULL,
  iso_week     smallint NOT NULL,
  day_of_week  smallint NOT NULL,
  month_start  date NOT NULL,
  week_start   date NOT NULL,
  season       text NOT NULL CHECK (season IN ('FALL','WINTER','SPRING','SUMMER'))
);

CREATE TABLE IF NOT EXISTS dw.dim_sponsor (
  sponsor_key  bigint PRIMARY KEY,
  tenant_id    text NOT NULL,
  sponsor_id   text NOT NULL,
  name         text NOT NULL,
  ownership    text,
  categories   text[] NOT NULL DEFAULT '{}',
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (sponsor_id, valid_from)
);

CREATE TABLE IF NOT EXISTS dw.bridge_sponsor_category (
  sponsor_key  bigint NOT NULL REFERENCES dw.dim_sponsor (sponsor_key),
  category     text NOT NULL,
  PRIMARY KEY (sponsor_key, category)
);

CREATE TABLE IF NOT EXISTS dw.dim_property (
  property_key bigint PRIMARY KEY,
  tenant_id    text NOT NULL,
  property_id  text NOT NULL,
  name         text NOT NULL,
  kind         text,
  city         text,
  state_code   text,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (property_id, valid_from)
);

CREATE TABLE IF NOT EXISTS dw.dim_athlete (
  athlete_key  bigint PRIMARY KEY,
  tenant_id    text NOT NULL,
  athlete_id   text NOT NULL,
  display_name text NOT NULL,
  sport        text,
  position     text,
  level        text,
  school       text,
  grad_year    smallint,
  tier         text,
  age_band     text,
  is_minor     boolean NOT NULL,
  city         text,
  state_code   text,
  property_id  text,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (athlete_id, valid_from)
);

CREATE TABLE IF NOT EXISTS dw.dim_campaign (
  campaign_key      bigint PRIMARY KEY,
  tenant_id         text NOT NULL,
  campaign_id       text NOT NULL UNIQUE,
  name              text NOT NULL,
  sponsor_id        text NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  budget_cents      bigint NOT NULL,
  brief_categories  text[] NOT NULL DEFAULT '{}',
  brief_state_codes text[] NOT NULL DEFAULT '{}',
  current_state     text NOT NULL,
  launched_on       date,
  completed_on      date
);

CREATE TABLE IF NOT EXISTS dw.dim_channel (
  channel_key   bigint PRIMARY KEY,
  channel_code  text NOT NULL UNIQUE,
  channel_group text NOT NULL CHECK (channel_group IN ('SOCIAL','IN_PERSON','FAN','EDITION','CAMPAIGN','UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS dw.dim_inventory (
  inventory_key   bigint PRIMARY KEY,
  tenant_id       text NOT NULL,
  inventory_kind  text NOT NULL CHECK (inventory_kind IN ('NIL_JOB','LISTING_ITEM','AD_SLOT','UNKNOWN')),
  source_id       text NOT NULL,
  name            text NOT NULL,
  format          text,
  list_low_cents  bigint,
  list_high_cents bigint,
  source_version  int NOT NULL DEFAULT 1,
  UNIQUE (inventory_kind, source_id)
);

CREATE TABLE IF NOT EXISTS dw.dim_market (
  market_key  bigint PRIMARY KEY,
  state_code  text NOT NULL,
  city        text NOT NULL DEFAULT '',
  region      text NOT NULL CHECK (region IN ('NORTHEAST','MIDWEST','SOUTH','WEST','UNKNOWN')),
  UNIQUE (state_code, city)
);

CREATE TABLE IF NOT EXISTS dw.fact_campaign_daily (
  date_key       int    NOT NULL REFERENCES dw.dim_date (date_key),
  tenant_id      text   NOT NULL,
  campaign_key   bigint NOT NULL REFERENCES dw.dim_campaign (campaign_key),
  sponsor_key    bigint NOT NULL REFERENCES dw.dim_sponsor (sponsor_key),
  athlete_key    bigint NOT NULL REFERENCES dw.dim_athlete (athlete_key),
  property_key   bigint NOT NULL REFERENCES dw.dim_property (property_key),
  channel_key    bigint NOT NULL REFERENCES dw.dim_channel (channel_key),
  inventory_key  bigint NOT NULL REFERENCES dw.dim_inventory (inventory_key),
  market_key     bigint NOT NULL REFERENCES dw.dim_market (market_key),
  deliverables_due            int NOT NULL DEFAULT 0,
  deliverables_published      int NOT NULL DEFAULT 0,
  deliverables_verified       int NOT NULL DEFAULT 0,
  revisions_requested         int NOT NULL DEFAULT 0,
  views_verified_api          bigint NOT NULL DEFAULT 0,
  views_verified_manual       bigint NOT NULL DEFAULT 0,
  views_self_reported         bigint NOT NULL DEFAULT 0,
  views_estimated             bigint NOT NULL DEFAULT 0,
  views_attributed            bigint NOT NULL DEFAULT 0,
  engagements_verified_api    bigint NOT NULL DEFAULT 0,
  engagements_verified_manual bigint NOT NULL DEFAULT 0,
  engagements_self_reported   bigint NOT NULL DEFAULT 0,
  engagements_estimated       bigint NOT NULL DEFAULT 0,
  engagements_attributed      bigint NOT NULL DEFAULT 0,
  metric_corrections          int NOT NULL DEFAULT 0,
  qr_scans                    int NOT NULL DEFAULT 0,
  qr_landings                 int NOT NULL DEFAULT 0,
  qr_claims                   int NOT NULL DEFAULT 0,
  qr_redemptions              int NOT NULL DEFAULT 0,
  qr_refused_redeems          int NOT NULL DEFAULT 0,
  link_clicks                 int NOT NULL DEFAULT 0,
  edition_print_scans         int NOT NULL DEFAULT 0,
  edition_digital_engagements int NOT NULL DEFAULT 0,
  booked_sell_cents           bigint NOT NULL DEFAULT 0,
  booked_compensation_cents   bigint NOT NULL DEFAULT 0,
  cancelled_sell_cents        bigint NOT NULL DEFAULT 0,
  cancelled_compensation_cents bigint NOT NULL DEFAULT 0,
  earnings_paid_cents         bigint NOT NULL DEFAULT 0,
  ad_slot_sold_cents          bigint NOT NULL DEFAULT 0,
  invoiced_cents              bigint NOT NULL DEFAULT 0,
  invoice_paid_cents          bigint NOT NULL DEFAULT 0,
  _built_at timestamptz NOT NULL DEFAULT now(),
  -- market joins the key: a reward code's venue can differ between rows that
  -- share every other key (3S1-DATA-02); elsewhere it follows the athlete.
  PRIMARY KEY (date_key, campaign_key, athlete_key, channel_key, inventory_key, market_key)
);
CREATE INDEX IF NOT EXISTS fact_campaign_daily_tenant_date ON dw.fact_campaign_daily (tenant_id, date_key);
CREATE INDEX IF NOT EXISTS fact_campaign_daily_athlete ON dw.fact_campaign_daily (athlete_key, date_key);

CREATE TABLE IF NOT EXISTS dw.fact_marketplace_order_line (
  tenant_id            text   NOT NULL,
  seller_tenant_id     text   NOT NULL,
  order_id             text   NOT NULL,
  line_id              text   PRIMARY KEY,
  sponsor_key          bigint NOT NULL REFERENCES dw.dim_sponsor (sponsor_key),
  property_key         bigint NOT NULL REFERENCES dw.dim_property (property_key),
  athlete_key          bigint NOT NULL REFERENCES dw.dim_athlete (athlete_key),
  inventory_key        bigint NOT NULL REFERENCES dw.dim_inventory (inventory_key),
  market_key           bigint NOT NULL REFERENCES dw.dim_market (market_key),
  placed_date_key      int    NOT NULL REFERENCES dw.dim_date (date_key),
  contracted_date_key  int    REFERENCES dw.dim_date (date_key),
  paid_date_key        int    REFERENCES dw.dim_date (date_key),
  fulfilled_date_key   int    REFERENCES dw.dim_date (date_key),
  ended_date_key       int    REFERENCES dw.dim_date (date_key),
  starts_on_key        int    NOT NULL REFERENCES dw.dim_date (date_key),
  ends_on_key          int    NOT NULL REFERENCES dw.dim_date (date_key),
  order_state          text   NOT NULL,
  currency             text   NOT NULL,
  quantity             int    NOT NULL,
  unit_price_cents     bigint NOT NULL,
  line_total_cents     bigint NOT NULL,
  gross_cents          bigint NOT NULL DEFAULT 0,
  discount_cents       bigint NOT NULL DEFAULT 0,
  net_cents            bigint NOT NULL DEFAULT 0,
  platform_fee_cents   bigint NOT NULL DEFAULT 0,
  management_fee_cents bigint NOT NULL DEFAULT 0,
  processing_cents     bigint NOT NULL DEFAULT 0,
  property_share_cents bigint NOT NULL DEFAULT 0,
  referral_cents       bigint NOT NULL DEFAULT 0,
  reserve_cents        bigint NOT NULL DEFAULT 0,
  available_cents      bigint NOT NULL DEFAULT 0,
  team_available_cents bigint NOT NULL DEFAULT 0,
  team_reserve_cents   bigint NOT NULL DEFAULT 0,
  refunded_cents       bigint NOT NULL DEFAULT 0,
  _built_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fact_mol_tenant_placed ON dw.fact_marketplace_order_line (tenant_id, placed_date_key);
CREATE INDEX IF NOT EXISTS fact_mol_seller ON dw.fact_marketplace_order_line (seller_tenant_id, placed_date_key);

CREATE TABLE IF NOT EXISTS dw.snap_ledger_daily (
  date_key        int    NOT NULL REFERENCES dw.dim_date (date_key),
  tenant_id       text   NOT NULL,
  party_tenant_id text   NOT NULL,
  party_type      text   NOT NULL,
  party_id        text   NOT NULL,
  account         text   NOT NULL,
  status          text   NOT NULL,
  entries         int    NOT NULL,
  debit_cents     bigint NOT NULL,
  credit_cents    bigint NOT NULL,
  balance_cents   bigint NOT NULL,
  PRIMARY KEY (date_key, tenant_id, party_type, party_id, account, status)
);

CREATE TABLE IF NOT EXISTS dw.snap_payment_status_daily (
  date_key       int    NOT NULL REFERENCES dw.dim_date (date_key),
  tenant_id      text   NOT NULL,
  subject_type   text   NOT NULL CHECK (subject_type IN ('PAYMENT_ATTEMPT','PAYOUT','REFUND_DUE')),
  subject_id     text   NOT NULL,
  party_type     text   NOT NULL,
  party_id       text   NOT NULL,
  state          text   NOT NULL,
  amount_cents   bigint NOT NULL,
  refunded_cents bigint NOT NULL DEFAULT 0,
  days_in_state  int    NOT NULL,
  is_closed      boolean NOT NULL,
  PRIMARY KEY (date_key, subject_type, subject_id)
);
