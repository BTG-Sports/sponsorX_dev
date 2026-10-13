-- 3S1-DATA-02 · fact_campaign_daily (design §5). Every measure lands on the
-- UTC day of its own event; rows are summed into the grain
-- campaign × athlete × channel × inventory × market × day.

/* Typed helpers over stg, used by several sources below. */
CREATE TEMP TABLE _order ON COMMIT DROP AS
  SELECT id, tenant_id, _row->>'campaignId' AS campaign_id, _row->>'athleteId' AS athlete_id, _row->>'jobId' AS job_id,
         (_row->>'sellPrice')::bigint AS sell, (_row->>'compensation')::bigint AS comp, (_row->>'acceptedAt')::timestamp AS accepted_at
    FROM stg."CampaignOrder";

/* A deliverable's channel (design §4 dim_channel): an appearance job is in
   person; otherwise its recorded platform; unpublished until it has one. */
CREATE TEMP TABLE _deliv ON COMMIT DROP AS
  SELECT d.id, o.campaign_id, o.athlete_id, o.job_id,
         CASE WHEN o.job_id = 'SX-05' THEN 'IN_PERSON'
              WHEN d._row->>'platform' IN ('INSTAGRAM','TIKTOK','YOUTUBE','X','FACEBOOK') THEN 'SOCIAL_' || (d._row->>'platform')
              WHEN d._row->>'platform' = 'OTHER' THEN 'SOCIAL_OTHER'
              ELSE 'UNPUBLISHED' END AS channel,
         (d._row->>'dueDate')::timestamp::date AS due_on, (d._row->>'publishedAt')::timestamp::date AS published_on
    FROM stg."Deliverable" d JOIN _order o ON o.id = d._row->>'orderId';

/* The job a reward code's events belong to: only when the athlete holds
   exactly one job on that campaign — never a guess (3S1-DATA-02). */
CREATE TEMP TABLE _one_job ON COMMIT DROP AS
  SELECT campaign_id, athlete_id, min(job_id) AS job_id FROM _order GROUP BY 1, 2 HAVING count(DISTINCT job_id) = 1;

CREATE TEMP TABLE _act (
  d date, campaign_id text, athlete_id text, channel text, inv_kind text, inv_id text, venue_city text, venue_state text,
  deliverables_due int DEFAULT 0, deliverables_published int DEFAULT 0, deliverables_verified int DEFAULT 0, revisions_requested int DEFAULT 0,
  views_verified_api bigint DEFAULT 0, views_verified_manual bigint DEFAULT 0, views_self_reported bigint DEFAULT 0, views_estimated bigint DEFAULT 0, views_attributed bigint DEFAULT 0,
  engagements_verified_api bigint DEFAULT 0, engagements_verified_manual bigint DEFAULT 0, engagements_self_reported bigint DEFAULT 0,
  engagements_estimated bigint DEFAULT 0, engagements_attributed bigint DEFAULT 0, metric_corrections int DEFAULT 0,
  qr_scans int DEFAULT 0, qr_landings int DEFAULT 0, qr_claims int DEFAULT 0, qr_redemptions int DEFAULT 0, qr_refused_redeems int DEFAULT 0,
  link_clicks int DEFAULT 0, edition_print_scans int DEFAULT 0, edition_digital_engagements int DEFAULT 0,
  booked_sell_cents bigint DEFAULT 0, booked_compensation_cents bigint DEFAULT 0, cancelled_sell_cents bigint DEFAULT 0,
  cancelled_compensation_cents bigint DEFAULT 0, earnings_paid_cents bigint DEFAULT 0, ad_slot_sold_cents bigint DEFAULT 0,
  invoiced_cents bigint DEFAULT 0, invoice_paid_cents bigint DEFAULT 0
) ON COMMIT DROP;

/* Delivery: due and published, on the deliverable's own channel. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, deliverables_due)
  SELECT due_on, campaign_id, athlete_id, channel, 'NIL_JOB', job_id, 1 FROM _deliv WHERE due_on IS NOT NULL;
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, deliverables_published)
  SELECT published_on, campaign_id, athlete_id, channel, 'NIL_JOB', job_id, 1 FROM _deliv WHERE published_on IS NOT NULL;
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, deliverables_verified, revisions_requested)
  SELECT a.at::date, x.campaign_id, x.athlete_id, x.channel, 'NIL_JOB', x.job_id,
         (a.action = 'deliverable.verify')::int, (a.action IN ('deliverable.requestRevision', 'deliverable.systemRevision'))::int
    FROM stg.audit a JOIN _deliv x ON x.id = a.entity_id
   WHERE a.action IN ('deliverable.verify', 'deliverable.requestRevision', 'deliverable.systemRevision');

/* Views and engagements, by provenance label, on the metric's own day. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id,
                  views_verified_api, views_verified_manual, views_self_reported, views_estimated, views_attributed,
                  engagements_verified_api, engagements_verified_manual, engagements_self_reported, engagements_estimated, engagements_attributed)
  SELECT (m._row->>'day')::date, x.campaign_id, x.athlete_id, x.channel, 'NIL_JOB', x.job_id,
         CASE s WHEN 'VERIFIED_API' THEN v ELSE 0 END, CASE s WHEN 'VERIFIED_MANUAL' THEN v ELSE 0 END,
         CASE s WHEN 'SELF_REPORTED' THEN v ELSE 0 END, CASE s WHEN 'ESTIMATED' THEN v ELSE 0 END, CASE s WHEN 'ATTRIBUTED' THEN v ELSE 0 END,
         CASE s WHEN 'VERIFIED_API' THEN e ELSE 0 END, CASE s WHEN 'VERIFIED_MANUAL' THEN e ELSE 0 END,
         CASE s WHEN 'SELF_REPORTED' THEN e ELSE 0 END, CASE s WHEN 'ESTIMATED' THEN e ELSE 0 END, CASE s WHEN 'ATTRIBUTED' THEN e ELSE 0 END
    FROM stg."MetricDaily" m
    JOIN _deliv x ON x.id = m._row->>'deliverableId',
         LATERAL (SELECT m._row->>'source' AS s, (m._row->>'views')::bigint AS v, (m._row->>'engagements')::bigint AS e) y;

/* Corrections: raw versions of a metric row beyond its first, by the day it was corrected. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, metric_corrections)
  SELECT (r._row->>'updatedAt')::timestamp::date, x.campaign_id, x.athlete_id, x.channel, 'NIL_JOB', x.job_id, 1
    FROM (SELECT _row, _deleted, row_number() OVER (PARTITION BY id ORDER BY _version_id) AS rn FROM raw."MetricDaily") r
    JOIN _deliv x ON x.id = r._row->>'deliverableId'
   WHERE r.rn > 1 AND NOT r._deleted AND r._row->>'updatedAt' IS NOT NULL;

/* The fan funnel: reward code → athlete; reward → campaign and venue. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, venue_city, venue_state, qr_scans, qr_landings, qr_claims, qr_redemptions)
  SELECT (e._row->>'at')::timestamp::date, r._row->>'campaignId', t._row->>'athleteId', 'REWARD_QR', 'NIL_JOB', j.job_id,
         r._row->>'venueCity', r._row->>'venueStateCode',
         (e._row->>'type' = 'SCAN')::int, (e._row->>'type' = 'LANDING')::int, (e._row->>'type' = 'CLAIM')::int, (e._row->>'type' = 'REDEEM')::int
    FROM stg."RewardEvent" e
    JOIN stg."RewardToken" t ON t.id = e._row->>'tokenId'
    JOIN stg."Reward" r ON r.id = t._row->>'rewardId'
    LEFT JOIN _one_job j ON j.campaign_id = r._row->>'campaignId' AND j.athlete_id = t._row->>'athleteId';

/* Refused redemptions of a used code (3S0-BE-04): the increase between
   copied versions of the code's count, dated by its latest refusal. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, venue_city, venue_state, qr_refused_redeems)
  SELECT (v._row->>'lastRefusedRedeemAt')::timestamp::date, r._row->>'campaignId', v._row->>'athleteId', 'REWARD_QR', 'NIL_JOB', j.job_id,
         r._row->>'venueCity', r._row->>'venueStateCode', v.delta
    FROM (SELECT _row, (_row->>'refusedRedeems')::int - coalesce(lag((_row->>'refusedRedeems')::int) OVER (PARTITION BY id ORDER BY _version_id), 0) AS delta
            FROM raw."RewardToken") v
    JOIN stg."Reward" r ON r.id = v._row->>'rewardId'
    LEFT JOIN _one_job j ON j.campaign_id = r._row->>'campaignId' AND j.athlete_id = v._row->>'athleteId'
   WHERE v.delta > 0 AND v._row->>'lastRefusedRedeemAt' IS NOT NULL;

/* Tracking-link clicks: link → deliverable → order. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, link_clicks)
  SELECT (c._row->>'at')::timestamp::date, x.campaign_id, x.athlete_id, 'TRACKING_LINK', 'NIL_JOB', x.job_id, 1
    FROM stg."LinkEvent" c
    JOIN stg."TrackingLink" l ON l.id = c._row->>'linkId'
    JOIN _deliv x ON x.id = l._row->>'deliverableId';

/* NEXT editions: engagement with a slot sold to the campaign, and the sale. */
INSERT INTO _act (d, campaign_id, channel, inv_kind, inv_id, edition_print_scans, edition_digital_engagements)
  SELECT (e._row->>'at')::timestamp::date, s._row->>'campaignId',
         CASE e._row->>'type' WHEN 'QR_SCAN' THEN 'EDITION_PRINT' ELSE 'EDITION_DIGITAL' END, 'AD_SLOT', s.id,
         (e._row->>'type' = 'QR_SCAN')::int, (e._row->>'type' <> 'QR_SCAN')::int
    FROM stg."EditionEvent" e JOIN stg."AdSlot" s ON s.id = e._row->>'targetRef'
   WHERE e._row->>'targetKind' = 'AD_SLOT' AND s._row->>'campaignId' IS NOT NULL;
INSERT INTO _act (d, campaign_id, channel, inv_kind, inv_id, ad_slot_sold_cents)
  SELECT (_row->>'soldAt')::timestamp::date, _row->>'campaignId', 'EDITION_PRINT', 'AD_SLOT', id, (_row->>'soldCents')::bigint
    FROM stg."AdSlot" WHERE _row->>'campaignId' IS NOT NULL AND _row->>'soldAt' IS NOT NULL AND (_row->>'soldCents') IS NOT NULL;

/* Money that belongs to an order is not tied to a channel (one order can
   cover several): it lands on CAMPAIGN, with the order's athlete and job. */
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, booked_sell_cents, booked_compensation_cents)
  SELECT accepted_at::date, campaign_id, athlete_id, 'CAMPAIGN', 'NIL_JOB', job_id, sell, comp FROM _order WHERE accepted_at IS NOT NULL;
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, cancelled_sell_cents, cancelled_compensation_cents)
  SELECT c.at::date, o.campaign_id, o.athlete_id, 'CAMPAIGN', 'NIL_JOB', o.job_id, o.sell, o.comp
    FROM (SELECT DISTINCT ON (entity_id) entity_id, at FROM stg.audit WHERE action = 'order.cancel' ORDER BY entity_id, at) c
    JOIN _order o ON o.id = c.entity_id
   WHERE o.accepted_at IS NOT NULL;
INSERT INTO _act (d, campaign_id, athlete_id, channel, inv_kind, inv_id, earnings_paid_cents)
  SELECT (e._row->>'paidAt')::timestamp::date, o.campaign_id, e._row->>'athleteId', 'CAMPAIGN', 'NIL_JOB', o.job_id,
         (e._row->>'gross')::bigint + coalesce((e._row->>'adjustment')::bigint, 0)
    FROM stg."Earning" e JOIN _order o ON o.id = e._row->>'orderId'
   WHERE e._row->>'paidAt' IS NOT NULL;
INSERT INTO _act (d, campaign_id, channel, invoiced_cents)
  SELECT (_row->>'issuedAt')::timestamp::date, _row->>'campaignId', 'CAMPAIGN', (_row->>'amount')::bigint
    FROM stg."CampaignInvoice" WHERE _row->>'issuedAt' IS NOT NULL;
INSERT INTO _act (d, campaign_id, channel, invoice_paid_cents)
  SELECT (_row->>'paidAt')::timestamp::date, _row->>'campaignId', 'CAMPAIGN', (_row->>'amount')::bigint
    FROM stg."CampaignInvoice" WHERE _row->>'paidAt' IS NOT NULL;

SELECT dw.ensure_dates(ARRAY(SELECT DISTINCT d FROM _act));

/* Keys, then sum into the grain. A row takes the dimension versions valid on
   its day; market is the reward's venue when it has one, else the athlete's
   registered city and state (design §5). */
INSERT INTO dw.fact_campaign_daily
SELECT dw.dk(a.d), c.tenant_id, c.campaign_key, coalesce(sp.sponsor_key, 0), coalesce(at.athlete_key, 0), coalesce(pr.property_key, 0),
       ch.channel_key, coalesce(inv.inventory_key, 0),
       CASE WHEN dw.market_key(a.venue_city, a.venue_state) <> 0 THEN dw.market_key(a.venue_city, a.venue_state)
            ELSE coalesce(dw.market_key(at.city, at.state_code), 0) END AS market_key,
       sum(deliverables_due), sum(deliverables_published), sum(deliverables_verified), sum(revisions_requested),
       sum(views_verified_api), sum(views_verified_manual), sum(views_self_reported), sum(views_estimated), sum(views_attributed),
       sum(engagements_verified_api), sum(engagements_verified_manual), sum(engagements_self_reported), sum(engagements_estimated), sum(engagements_attributed),
       sum(metric_corrections), sum(qr_scans), sum(qr_landings), sum(qr_claims), sum(qr_redemptions), sum(qr_refused_redeems),
       sum(link_clicks), sum(edition_print_scans), sum(edition_digital_engagements),
       sum(booked_sell_cents), sum(booked_compensation_cents), sum(cancelled_sell_cents), sum(cancelled_compensation_cents),
       sum(earnings_paid_cents), sum(ad_slot_sold_cents), sum(invoiced_cents), sum(invoice_paid_cents)
  FROM _act a
  JOIN dw.dim_campaign c ON c.campaign_id = a.campaign_id
  JOIN dw.dim_channel ch ON ch.channel_code = a.channel
  LEFT JOIN dw.dim_sponsor sp ON sp.sponsor_id = c.sponsor_id AND a.d BETWEEN sp.valid_from AND sp.valid_to
  LEFT JOIN dw.dim_athlete at ON at.athlete_id = a.athlete_id AND a.d BETWEEN at.valid_from AND at.valid_to
  LEFT JOIN dw.dim_property pr ON pr.property_id = at.property_id AND a.d BETWEEN pr.valid_from AND pr.valid_to
  LEFT JOIN dw.dim_inventory inv ON inv.inventory_kind = a.inv_kind AND inv.source_id = a.inv_id
 WHERE a.d IS NOT NULL
 GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9;
