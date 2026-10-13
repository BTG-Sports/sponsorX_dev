/**
 * Does the warehouse agree with the app? — 3S1-DATA-02's acceptance
 * ("reconcile to transactional campaign, order and payment totals within
 * defined tolerance"); 3S1-QA-01 runs it nightly and alerts on drift.
 * Checks and tolerances: documentation/SponsorX-Warehouse-Schema.md §8.
 *
 * EVERY TOLERANCE IS ZERO. The model is built from the same rows with integer
 * arithmetic and day dating, so any difference is a defect, not rounding.
 * Each check compares totals key by key (a campaign, a campaign-day, a ledger
 * account); a key present on one side only is a difference too.
 *
 * The app is read through the warehouse's read-only login, which can see only
 * the allow-listed columns (worker/warehouse/grants.mts) — every column used
 * here is on that list.
 *
 * LIKE WITH LIKE. Every hourly run calls this with the same frozen view of the
 * app its copy was taken from (ingest.mts), so a change made during the run is
 * never a false alarm. Called with a pool instead, it compares the app as it
 * is now with the warehouse as of its last build — useful to see drift, but
 * expect the next run's changes to show.
 */
import type pg from "pg";

export type ReconcileCheck = { check: string; key: string; warehouse: number; product: number; ok: boolean };
export type ReconcileOutcome = { ok: boolean; checks: ReconcileCheck[] };

type Row = { k: string; v: string | number | null };

/** Anything that runs a query: a pool, or an open client (e.g. the run's frozen view of the app). */
type Queryable = Pick<pg.ClientBase, "query">;

export async function reconcileWarehouse(opts: { product: Queryable; warehouse: Queryable; tenantId?: string }): Promise<ReconcileOutcome> {
  const t = opts.tenantId ?? null;
  const P = async (sql: string) => (await opts.product.query<Row>(sql, [t])).rows;
  const W = async (sql: string) => (await opts.warehouse.query<Row>(sql, [t])).rows;
  /* `$1` is the tenant, or null for all. */
  const pt = (alias: string) => `($1::text IS NULL OR ${alias}."tenantId" = $1)`;
  const wt = `($1::text IS NULL OR f.tenant_id = $1)`;
  const fact = `dw.fact_campaign_daily f JOIN dw.dim_campaign c ON c.campaign_key = f.campaign_key JOIN dw.dim_date d ON d.date_key = f.date_key`;

  const pairs: Array<[string, Promise<Row[]>, Promise<Row[]>]> = [
    ["booked",
      P(`SELECT o."campaignId" k, sum(o."sellPrice") v FROM "CampaignOrder" o WHERE o."acceptedAt" IS NOT NULL AND ${pt("o")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.booked_sell_cents) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.booked_sell_cents) <> 0`)],
    ["compensation",
      P(`SELECT o."campaignId" k, sum(o.compensation) v FROM "CampaignOrder" o WHERE o."acceptedAt" IS NOT NULL AND ${pt("o")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.booked_compensation_cents) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.booked_compensation_cents) <> 0`)],
    ["earnings_paid",
      P(`SELECT o."campaignId" k, sum(e.gross + coalesce(e.adjustment, 0)) v FROM "Earning" e JOIN "CampaignOrder" o ON o.id = e."orderId"
          WHERE e."paidAt" IS NOT NULL AND ${pt("e")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.earnings_paid_cents) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.earnings_paid_cents) <> 0`)],
    ["invoiced",
      P(`SELECT i."campaignId" k, sum(i.amount) v FROM "CampaignInvoice" i WHERE i."issuedAt" IS NOT NULL AND ${pt("i")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.invoiced_cents) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.invoiced_cents) <> 0`)],
    ["invoice_paid",
      P(`SELECT i."campaignId" k, sum(i.amount) v FROM "CampaignInvoice" i WHERE i."paidAt" IS NOT NULL AND ${pt("i")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.invoice_paid_cents) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.invoice_paid_cents) <> 0`)],
    ["marketplace_net",
      P(`SELECT f."orderId" k, sum(f."netCents") v FROM "OrderLineFinancials" f JOIN "MarketplaceOrder" o ON o.id = f."orderId" WHERE ${pt("o")} GROUP BY 1`),
      W(`SELECT f.order_id k, sum(f.net_cents) v FROM dw.fact_marketplace_order_line f WHERE ${wt} GROUP BY 1 HAVING sum(f.net_cents) <> 0`)],
    ["ledger",
      P(`SELECT concat_ws(':', l."partyType", l."partyId", l.account, l.status) k, sum(l."debitCents" - l."creditCents") v FROM "LedgerEntry" l WHERE ${pt("l")} GROUP BY 1`),
      W(`SELECT concat_ws(':', f.party_type, f.party_id, f.account, f.status) k, sum(f.balance_cents) v FROM dw.snap_ledger_daily f
          WHERE ${wt} AND f.date_key = (SELECT max(date_key) FROM dw.snap_ledger_daily) GROUP BY 1`)],
    ["payments_open",
      P(`SELECT k, sum(v) v FROM (
            SELECT 'PAYMENT_ATTEMPT:' || a.state k, a."amountCents" v FROM "PaymentAttempt" a
             WHERE a.state NOT IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','FAILED') AND ${pt("a")}
            UNION ALL SELECT 'PAYOUT:' || p.state, p."amountCents" FROM "Payout" p WHERE p.state NOT IN ('PAID','REJECTED') AND ${pt("p")}
            UNION ALL SELECT 'REFUND_DUE:' || r.state, r."amountCents" FROM "RefundDue" r WHERE r.state <> 'SENT' AND ${pt("r")}
          ) x GROUP BY 1`),
      W(`SELECT f.subject_type || ':' || f.state k, sum(f.amount_cents) v FROM dw.snap_payment_status_daily f
          WHERE ${wt} AND NOT f.is_closed AND f.date_key = (SELECT max(date_key) FROM dw.snap_payment_status_daily) GROUP BY 1`)],
    ["fan_funnel",
      P(`SELECT concat_ws(':', r."campaignId", (e.at AT TIME ZONE 'UTC')::date, e.type) k, count(*) v
           FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId" WHERE ${pt("e")} GROUP BY 1`),
      W(`SELECT concat_ws(':', campaign_id, date, type) k, sum(n) v FROM (
            SELECT c.campaign_id, d.date, x.type, x.n FROM ${fact},
              LATERAL (VALUES ('SCAN', f.qr_scans), ('LANDING', f.qr_landings), ('CLAIM', f.qr_claims), ('REDEEM', f.qr_redemptions)) x(type, n)
             WHERE ${wt} AND x.n <> 0) y GROUP BY 1`)],
    ["clicks",
      P(`SELECT o."campaignId" k, count(*) v FROM "LinkEvent" e JOIN "TrackingLink" l ON l.id = e."linkId" JOIN "Deliverable" d ON d.id = l."deliverableId"
           JOIN "CampaignOrder" o ON o.id = d."orderId" WHERE ${pt("e")} GROUP BY 1`),
      W(`SELECT c.campaign_id k, sum(f.link_clicks) v FROM ${fact} WHERE ${wt} GROUP BY 1 HAVING sum(f.link_clicks) <> 0`)],
    ["views",
      P(`SELECT concat_ws(':', o."campaignId", m.day, m.source) k, sum(m.views) v FROM "MetricDaily" m JOIN "Deliverable" d ON d.id = m."deliverableId"
           JOIN "CampaignOrder" o ON o.id = d."orderId" WHERE ${pt("m")} GROUP BY 1 HAVING sum(m.views) <> 0`),
      W(`SELECT concat_ws(':', campaign_id, date, source) k, sum(n) v FROM (
            SELECT c.campaign_id, d.date, x.source, x.n FROM ${fact},
              LATERAL (VALUES ('VERIFIED_API', f.views_verified_api), ('VERIFIED_MANUAL', f.views_verified_manual), ('SELF_REPORTED', f.views_self_reported),
                              ('ESTIMATED', f.views_estimated), ('ATTRIBUTED', f.views_attributed)) x(source, n)
             WHERE ${wt} AND x.n <> 0) y GROUP BY 1`)],
  ];

  const checks: ReconcileCheck[] = [];
  for (const [check, p, w] of pairs) {
    const prod = new Map((await p).map((r) => [String(r.k), Number(r.v ?? 0)]));
    const wh = new Map((await w).map((r) => [String(r.k), Number(r.v ?? 0)]));
    const keys = [...new Set([...prod.keys(), ...wh.keys()])].sort();
    if (!keys.length) checks.push({ check, key: "(none)", warehouse: 0, product: 0, ok: true });
    for (const key of keys) {
      const a = wh.get(key) ?? 0;
      const b = prod.get(key) ?? 0;
      checks.push({ check, key, warehouse: a, product: b, ok: a === b });
    }
  }
  return { ok: checks.every((c) => c.ok), checks };
}
