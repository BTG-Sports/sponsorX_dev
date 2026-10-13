-- 3S1-DATA-02 · the dimensions (design §4). The whole model is rebuilt each
-- run (user, 2026-10-13); keys are computed (dw.k), so a rebuild yields the
-- same keys and the same rows.
-- The money snapshots are a diary and are NOT rebuilt (50_snapshots adds
-- only the days not yet written); the date table is fixed and only topped up.
TRUNCATE dw.fact_campaign_daily, dw.fact_marketplace_order_line,
         dw.bridge_sponsor_category, dw.dim_sponsor, dw.dim_property, dw.dim_athlete, dw.dim_campaign,
         dw.dim_channel, dw.dim_inventory, dw.dim_market;

/* ── date: 2020–2035, wider than any event SponsorX holds ─────────────────── */
SELECT dw.ensure_dates(ARRAY(SELECT g::date FROM generate_series('2020-01-01'::date, '2035-12-31'::date, interval '1 day') g));

/* ── channel: fixed ───────────────────────────────────────────────────────── */
INSERT INTO dw.dim_channel (channel_key, channel_code, channel_group) VALUES
  (0, 'UNKNOWN', 'UNKNOWN'),
  (1, 'SOCIAL_INSTAGRAM', 'SOCIAL'), (2, 'SOCIAL_TIKTOK', 'SOCIAL'), (3, 'SOCIAL_YOUTUBE', 'SOCIAL'),
  (4, 'SOCIAL_X', 'SOCIAL'), (5, 'SOCIAL_FACEBOOK', 'SOCIAL'), (6, 'SOCIAL_OTHER', 'SOCIAL'),
  (7, 'UNPUBLISHED', 'SOCIAL'), (8, 'IN_PERSON', 'IN_PERSON'),
  (9, 'REWARD_QR', 'FAN'), (10, 'TRACKING_LINK', 'FAN'),
  (11, 'EDITION_PRINT', 'EDITION'), (12, 'EDITION_DIGITAL', 'EDITION'),
  (13, 'CAMPAIGN', 'CAMPAIGN');

/* ── type-2 history from raw versions ──────────────────────────────────────
   A version is the last raw version of a day whose tracked attributes differ
   from the previous kept version. The first version covers all earlier time
   (nothing older is known); a row deleted in the product ends its last
   version the day before. */
CREATE TEMP TABLE _v ON COMMIT DROP AS
WITH v AS (
  SELECT 'Sponsor' AS t, id, tenant_id, _row, _deleted, _version_id, (_ingested_at AT TIME ZONE 'UTC')::date AS d,
         md5(concat_ws('|', _row->>'name', _row->>'ownership', _row->>'categories')) AS h FROM raw."Sponsor"
  UNION ALL
  SELECT 'Property', id, tenant_id, _row, _deleted, _version_id, (_ingested_at AT TIME ZONE 'UTC')::date,
         md5(concat_ws('|', _row->>'name', _row->>'kind', _row->>'city', _row->>'stateCode')) FROM raw."Property"
  UNION ALL
  SELECT 'Athlete', id, tenant_id, _row, _deleted, _version_id, (_ingested_at AT TIME ZONE 'UTC')::date,
         md5(concat_ws('|', _row->>'tier', _row->>'city', _row->>'stateCode', _row->>'propertyId', _row->>'sport',
                       _row->>'level', _row->>'school', _row->>'is_minor')) FROM raw."Athlete"
), daylast AS (
  SELECT DISTINCT ON (t, id, d) * FROM v ORDER BY t, id, d, _version_id DESC
), marked AS (
  SELECT *, lag(h) OVER w AS prev_h, lag(_deleted) OVER w AS prev_del, row_number() OVER w AS rn
    FROM daylast WINDOW w AS (PARTITION BY t, id ORDER BY d)
), changes AS (
  SELECT * FROM marked WHERE rn = 1 OR h IS DISTINCT FROM prev_h OR _deleted IS DISTINCT FROM prev_del
)
SELECT t, id, tenant_id, _row, _deleted,
       CASE WHEN row_number() OVER w = 1 THEN '-infinity'::date ELSE d END AS valid_from,
       coalesce(lead(d) OVER w - 1, '9999-12-31'::date) AS valid_to,
       lead(d) OVER w IS NULL AS is_last
  FROM changes WINDOW w AS (PARTITION BY t, id ORDER BY d);

/* Type-1 columns inside a type-2 dimension come from the latest version. */
CREATE TEMP TABLE _latest ON COMMIT DROP AS
  SELECT DISTINCT ON (t, id) t, id, _row FROM (
    SELECT 'Athlete' AS t, id, _row, _version_id FROM raw."Athlete"
  ) x ORDER BY t, id, _version_id DESC;

INSERT INTO dw.dim_sponsor (sponsor_key, tenant_id, sponsor_id, name, ownership, categories, valid_from, valid_to, is_current)
SELECT dw.k('sponsor:' || id || ':' || valid_from), tenant_id, id, _row->>'name', _row->>'ownership',
       dw.arr(_row->'categories'), valid_from, valid_to, is_last
  FROM _v WHERE t = 'Sponsor' AND NOT _deleted;
INSERT INTO dw.dim_sponsor (sponsor_key, tenant_id, sponsor_id, name, valid_from, is_current) VALUES (0, '', '', 'Unattributed', '-infinity', true);
INSERT INTO dw.bridge_sponsor_category SELECT sponsor_key, unnest(categories) FROM dw.dim_sponsor WHERE sponsor_key <> 0 ON CONFLICT DO NOTHING;

INSERT INTO dw.dim_property (property_key, tenant_id, property_id, name, kind, city, state_code, valid_from, valid_to, is_current)
SELECT dw.k('property:' || id || ':' || valid_from), tenant_id, id, _row->>'name', _row->>'kind', _row->>'city', _row->>'stateCode', valid_from, valid_to, is_last
  FROM _v WHERE t = 'Property' AND NOT _deleted;
INSERT INTO dw.dim_property (property_key, tenant_id, property_id, name, valid_from, is_current) VALUES (0, '', '', 'No property', '-infinity', true);

INSERT INTO dw.dim_athlete (athlete_key, tenant_id, athlete_id, display_name, sport, position, level, school, grad_year, tier, age_band, is_minor,
                            city, state_code, property_id, valid_from, valid_to, is_current)
SELECT dw.k('athlete:' || v.id || ':' || v.valid_from), v.tenant_id, v.id, l._row->>'displayName', v._row->>'sport', l._row->>'position', v._row->>'level',
       v._row->>'school', (l._row->>'gradYear')::smallint, v._row->>'tier', l._row->>'ageBand', coalesce((v._row->>'is_minor')::boolean, false),
       v._row->>'city', v._row->>'stateCode', v._row->>'propertyId', v.valid_from, v.valid_to, v.is_last
  FROM _v v JOIN _latest l ON l.t = 'Athlete' AND l.id = v.id
 WHERE v.t = 'Athlete' AND NOT v._deleted;
INSERT INTO dw.dim_athlete (athlete_key, tenant_id, athlete_id, display_name, is_minor, valid_from, is_current) VALUES (0, '', '', 'Unattributed', false, '-infinity', true);

/* ── campaign: type 1 ─────────────────────────────────────────────────────── */
INSERT INTO dw.dim_campaign (campaign_key, tenant_id, campaign_id, name, sponsor_id, start_date, end_date, budget_cents,
                             brief_categories, brief_state_codes, current_state, launched_on, completed_on)
SELECT dw.k('campaign:' || c.id), c.tenant_id, c.id, c._row->>'name', c._row->>'sponsorId',
       (c._row->>'startDate')::timestamp::date, (c._row->>'endDate')::timestamp::date, (c._row->>'budget')::bigint,
       dw.arr(b._row->'categories'),
       dw.arr(b._row->'stateCodes'),
       c._row->>'state',
       (SELECT min(at)::date FROM stg.audit a WHERE a.entity_id = c.id AND a.action = 'campaign.launch'),
       (SELECT min(at)::date FROM stg.audit a WHERE a.entity_id = c.id AND a.action = 'campaign.complete')
  FROM stg."Campaign" c LEFT JOIN stg."CampaignBrief" b ON b.id = c._row->>'briefId';

/* ── inventory: type 1 with version ───────────────────────────────────────── */
INSERT INTO dw.dim_inventory (inventory_key, tenant_id, inventory_kind, source_id, name, format, list_low_cents, list_high_cents, source_version)
SELECT dw.k('NIL_JOB:' || id), tenant_id, 'NIL_JOB', id, _row->>'name', id,
       (_row->>'sellLow')::bigint * 100, (_row->>'sellHigh')::bigint * 100, 1 FROM stg."NilJob"
UNION ALL
SELECT dw.k('LISTING_ITEM:' || id), tenant_id, 'LISTING_ITEM', id, _row->>'title', _row->>'kind',
       (_row->>'priceCents')::bigint, (_row->>'priceCents')::bigint, coalesce((_row->>'version')::int, 1) FROM stg."InventoryItem"
UNION ALL
SELECT dw.k('AD_SLOT:' || id), tenant_id, 'AD_SLOT', id, _row->>'slotCode', _row->>'kind',
       (_row->>'priceCents')::bigint, (_row->>'priceCents')::bigint, 1 FROM stg."AdSlot"
UNION ALL
/* A job an order names but the catalogue no longer has (deleted, or never
   copied) keeps its own line, named by its id — never folded into unknown. */
SELECT DISTINCT ON (o._row->>'jobId') dw.k('NIL_JOB:' || (o._row->>'jobId')), o.tenant_id, 'NIL_JOB', o._row->>'jobId', o._row->>'jobId', o._row->>'jobId', NULL::bigint, NULL::bigint, 1
  FROM stg."CampaignOrder" o
 WHERE o._row->>'jobId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stg."NilJob" j WHERE j.id = o._row->>'jobId');
INSERT INTO dw.dim_inventory (inventory_key, tenant_id, inventory_kind, source_id, name) VALUES (0, '', 'UNKNOWN', '', 'Unknown');

/* ── market: every registered or venue location, US Census region ─────────── */
INSERT INTO dw.dim_market (market_key, state_code, city, region)
SELECT DISTINCT ON (dw.market_key(city, state)) dw.market_key(city, state), upper(btrim(state)), coalesce(initcap(btrim(city)), ''),
       CASE WHEN upper(btrim(state)) IN ('CT','ME','MA','NH','RI','VT','NJ','NY','PA') THEN 'NORTHEAST'
            WHEN upper(btrim(state)) IN ('IL','IN','MI','OH','WI','IA','KS','MN','MO','NE','ND','SD') THEN 'MIDWEST'
            WHEN upper(btrim(state)) IN ('DE','DC','FL','GA','MD','NC','SC','VA','WV','AL','KY','MS','TN','AR','LA','OK','TX') THEN 'SOUTH'
            WHEN upper(btrim(state)) IN ('AZ','CO','ID','MT','NV','NM','UT','WY','AK','CA','HI','OR','WA') THEN 'WEST'
            ELSE 'UNKNOWN' END
  FROM (
    SELECT _row->>'city' AS city, _row->>'stateCode' AS state FROM raw."Athlete"
    UNION SELECT _row->>'city', _row->>'stateCode' FROM raw."Property"
    UNION SELECT _row->>'venueCity', _row->>'venueStateCode' FROM raw."Reward"
  ) m
 WHERE dw.market_key(city, state) <> 0;
INSERT INTO dw.dim_market (market_key, state_code, city, region) VALUES (0, 'ZZ', '', 'UNKNOWN');
