-- 3S1-DATA-02 · the semantic layer (design §6): one definition per name.
-- Ratios are computed over sums, never averaged; a figure blending labels says
-- so in its name. Every view carries tenant_id; callers filter on it (the API
-- in 3S7 passes the caller's tenant — there is no cross-tenant read).
CREATE OR REPLACE VIEW sem.campaign_daily AS
SELECT f.tenant_id, d.date, c.campaign_id, c.name AS campaign_name, ch.channel_code, ch.channel_group,
       a.athlete_id, i.inventory_kind, i.source_id AS inventory_id, m.state_code AS market_state, m.city AS market_city,
       f.views_verified_api + f.views_verified_manual AS views_verified,
       f.views_verified_api + f.views_verified_manual + f.views_self_reported + f.views_estimated + f.views_attributed AS views_all_labels,
       f.engagements_verified_api + f.engagements_verified_manual AS engagements_verified,
       f.deliverables_due, f.deliverables_published, f.deliverables_verified, f.revisions_requested, f.metric_corrections,
       f.qr_scans, f.qr_landings, f.qr_claims, f.qr_redemptions, f.qr_refused_redeems, f.link_clicks,
       f.edition_print_scans, f.edition_digital_engagements,
       f.booked_sell_cents - f.cancelled_sell_cents AS booked_net_cents,
       f.booked_compensation_cents - f.cancelled_compensation_cents AS compensation_net_cents,
       f.earnings_paid_cents, f.ad_slot_sold_cents, f.invoiced_cents, f.invoice_paid_cents
  FROM dw.fact_campaign_daily f
  JOIN dw.dim_date d ON d.date_key = f.date_key
  JOIN dw.dim_campaign c ON c.campaign_key = f.campaign_key
  JOIN dw.dim_channel ch ON ch.channel_key = f.channel_key
  JOIN dw.dim_athlete a ON a.athlete_key = f.athlete_key
  JOIN dw.dim_inventory i ON i.inventory_key = f.inventory_key
  JOIN dw.dim_market m ON m.market_key = f.market_key;

CREATE OR REPLACE VIEW sem.campaign_summary AS
SELECT s.tenant_id, s.campaign_id, max(s.campaign_name) AS campaign_name,
       sum(views_verified) AS views_verified, sum(views_all_labels) AS views_all_labels,
       sum(engagements_verified)::numeric / nullif(sum(views_verified), 0) AS engagement_rate_verified,
       sum(qr_claims)::numeric / nullif(sum(qr_landings), 0) AS claim_rate,
       sum(qr_redemptions)::numeric / nullif(sum(qr_claims), 0) AS redemption_rate,
       1 - sum(qr_landings)::numeric / nullif(sum(qr_scans), 0) AS scan_to_landing_gap,
       sum(booked_net_cents) AS booked_net_cents,
       sum(booked_net_cents) - sum(compensation_net_cents) AS margin_cents,
       sum(booked_net_cents) * 1000 / nullif(sum(views_verified), 0) AS effective_cpm_cents,
       (SELECT count(*) FILTER (WHERE (d._row->>'publishedAt')::timestamp::date <= (d._row->>'dueDate')::timestamp::date)::numeric
               / nullif(count(*), 0)
          FROM stg."Deliverable" d JOIN stg."CampaignOrder" o ON o.id = d._row->>'orderId'
         WHERE o._row->>'campaignId' = s.campaign_id
           AND (d._row->>'dueDate')::timestamp::date <= (now() AT TIME ZONE 'UTC')::date) AS delivery_on_time_rate
  FROM sem.campaign_daily s
 GROUP BY s.tenant_id, s.campaign_id;
