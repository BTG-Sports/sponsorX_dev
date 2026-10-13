/**
 * "Match the app" — 3S1-QA-03 (documentation/SponsorX-Fact-Ledger.md §7).
 *
 * `checkFactSummaries` proves the summaries equal the sum of the facts. This
 * proves the other half: that the facts agree with the app's own records.
 * For every campaign, each summary total is compared with the same figure
 * worked out from the app's tables. Examples:
 * - booked = the accepted orders' sell prices;
 * - paid = the PAID earnings;
 * - published = the deliverables with a published date.
 *
 * For every tenant, the marketplace's sales and refunds are compared too. A
 * difference means a fact is missing, extra or wrong — an action that
 * skipped its writer, history not yet filled, or a summary changed by hand.
 *
 * Read-only. Used by the history fills (3S1-DATA-05/06/07), by the run on
 * the live databases (3S1-OPS-04, `scripts/check-facts.mts`), and nightly by
 * 3S1-QA-01.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { AUDIT_ACTIONS } from "../db/audit";
import { MEASURE_COLUMNS, type FactMeasure } from "./fact-rules";
import { METRIC_SOURCE_MEASURES } from "./fact-classification";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Every measure the check compares — and the one it cannot. The app keeps
 * only the latest figure for a day's views, not a count of how often it was
 * corrected, so `metric_corrections` has nothing in the app to compare with.
 * tests/fact-app-check.test.ts holds these two lists to MEASURE_COLUMNS, so a
 * new measure must be added to the check (or here, with its reason).
 */
export const NOT_COMPARED: Readonly<Partial<Record<FactMeasure, string>>> = {
  metric_corrections: "The app keeps the corrected figure, not a count of corrections.",
};
export const COMPARED_MEASURES = (Object.keys(MEASURE_COLUMNS) as FactMeasure[]).filter((m) => !(m in NOT_COMPARED));

export type FactAppDifference = {
  tenantId: string;
  /** null — a tenant's marketplace figures, which belong to no campaign. */
  campaignId: string | null;
  measure: FactMeasure;
  /** What the app's own records say. */
  app: number;
  /** What the daily summaries say. */
  facts: number;
};

type Row = { tenantId: string; campaignId: string | null; measure: string; v: string | null };

/** The app's own figure for each measure, by tenant and campaign (null for the marketplace). */
async function appFigures(db: Db, t: string | null): Promise<Row[]> {
  const q = (sql: string, ...args: unknown[]) => db.$queryRawUnsafe<Row[]>(sql, t, ...args);
  const rows: Row[] = [];
  rows.push(...await q(
    /* tenant-scope: $1 is the tenant, or every tenant for the platform check. Accepted orders — what was booked, and what of it was cancelled. */
    `SELECT o."tenantId", o."campaignId", m.measure, sum(m.v)::text AS v
       FROM "CampaignOrder" o,
            LATERAL (VALUES ('booked_sell_cents', o."sellPrice"), ('booked_compensation_cents', o.compensation),
                            ('cancelled_sell_cents', CASE WHEN o.state = 'CANCELLED' THEN o."sellPrice" ELSE 0 END),
                            ('cancelled_compensation_cents', CASE WHEN o.state = 'CANCELLED' THEN o.compensation ELSE 0 END)) AS m(measure, v)
      WHERE o."acceptedAt" IS NOT NULL AND ($1::text IS NULL OR o."tenantId" = $1)
      GROUP BY 1, 2, 3`));
  rows.push(...await q(
    /* tenant-scope: as above. Deliverables — due while their accepted order is not cancelled (as the app counts them); published; verified. */
    `SELECT d."tenantId", o."campaignId", m.measure, sum(m.v)::text AS v
       FROM "Deliverable" d JOIN "CampaignOrder" o ON o.id = d."orderId",
            LATERAL (VALUES ('deliverables_due', CASE WHEN o."acceptedAt" IS NOT NULL AND o.state <> 'CANCELLED' THEN 1 ELSE 0 END),
                            ('deliverables_published', CASE WHEN d."publishedAt" IS NOT NULL THEN 1 ELSE 0 END),
                            ('deliverables_verified', CASE WHEN d.state = 'VERIFIED' THEN 1 ELSE 0 END)) AS m(measure, v)
      WHERE $1::text IS NULL OR d."tenantId" = $1
      GROUP BY 1, 2, 3`));
  rows.push(...await q(
    /* tenant-scope: as above. Drafts sent back — by a reviewer or the automatic checks — as the audit log records them. */
    `SELECT a."tenantId", o."campaignId", 'revisions_requested' AS measure, count(*)::text AS v
       FROM "AuditLog" a JOIN "Deliverable" d ON d.id = a."entityId" JOIN "CampaignOrder" o ON o.id = d."orderId"
      WHERE a.entity = 'Deliverable' AND a.action = ANY($2::text[]) AND ($1::text IS NULL OR a."tenantId" = $1)
      GROUP BY 1, 2`, [AUDIT_ACTIONS.deliverable.requestRevision, AUDIT_ACTIONS.deliverable.systemRevision]));
  const metrics = await db.$queryRawUnsafe<Array<{ tenantId: string; campaignId: string; source: string; views: string; engagements: string }>>(
    /* tenant-scope: as above. A day's views and engagements, by label. */
    `SELECT m."tenantId", o."campaignId", m.source::text AS source, sum(m.views)::text AS views, sum(m.engagements)::text AS engagements
       FROM "MetricDaily" m JOIN "Deliverable" d ON d.id = m."deliverableId" JOIN "CampaignOrder" o ON o.id = d."orderId"
      WHERE $1::text IS NULL OR m."tenantId" = $1
      GROUP BY 1, 2, 3`, t);
  for (const m of metrics) {
    const label = METRIC_SOURCE_MEASURES[m.source as keyof typeof METRIC_SOURCE_MEASURES];
    rows.push({ tenantId: m.tenantId, campaignId: m.campaignId, measure: label.views, v: m.views });
    rows.push({ tenantId: m.tenantId, campaignId: m.campaignId, measure: label.engagements, v: m.engagements });
  }
  rows.push(...await q(
    /* tenant-scope: as above. Earnings paid: gross plus adjustment. */
    `SELECT e."tenantId", o."campaignId", 'earnings_paid_cents' AS measure, sum(e.gross + e.adjustment)::text AS v
       FROM "Earning" e JOIN "CampaignOrder" o ON o.id = e."orderId"
      WHERE e.state = 'PAID' AND ($1::text IS NULL OR e."tenantId" = $1)
      GROUP BY 1, 2`));
  rows.push(...await q(
    /* tenant-scope: as above. Zoho invoices issued and paid; a void invoice counts nothing. */
    `SELECT i."tenantId", i."campaignId", m.measure, sum(m.v)::text AS v
       FROM "CampaignInvoice" i,
            LATERAL (VALUES ('invoiced_cents', CASE WHEN i."issuedAt" IS NOT NULL THEN i.amount ELSE 0 END),
                            ('invoice_paid_cents', CASE WHEN i."paidAt" IS NOT NULL THEN i.amount ELSE 0 END)) AS m(measure, v)
      WHERE lower(i.status) <> 'void' AND ($1::text IS NULL OR i."tenantId" = $1)
      GROUP BY 1, 2, 3`));
  rows.push(...await q(
    /* tenant-scope: as above. NEXT ad slots sold and still sold. */
    `SELECT s."tenantId", s."campaignId", 'ad_slot_sold_cents' AS measure, sum(s."soldCents")::text AS v
       FROM "AdSlot" s
      WHERE s."campaignId" IS NOT NULL AND s."soldAt" IS NOT NULL AND ($1::text IS NULL OR s."tenantId" = $1)
      GROUP BY 1, 2`));
  rows.push(...await q(
    /* tenant-scope: as above. Marketplace lines contracted and not unwound — a line is unwound when its booking journal is reversed. */
    `SELECT l."tenantId", NULL AS "campaignId", m.measure, sum(m.v)::text AS v
       FROM "MarketplaceOrderLine" l JOIN "OrderLineFinancials" f ON f."lineId" = l.id,
            LATERAL (VALUES ('marketplace_gross_cents', f."grossCents"), ('marketplace_net_cents', f."netCents")) AS m(measure, v)
      WHERE EXISTS (SELECT 1 FROM "LedgerEntry" e WHERE e."lineId" = l.id AND e."entryType" = 'BOOKING' AND e.status <> 'REVERSED')
        AND ($1::text IS NULL OR l."tenantId" = $1)
      GROUP BY 1, 2, 3`));
  rows.push(...await q(
    /* tenant-scope: as above. Marketplace refunds sent (an edition refund is not marketplace money). */
    `SELECT r."tenantId", NULL AS "campaignId", 'marketplace_refunded_cents' AS measure, sum(r."amountCents")::text AS v
       FROM "RefundDue" r
      WHERE r.state = 'SENT' AND r."orderId" IS NOT NULL AND ($1::text IS NULL OR r."tenantId" = $1)
      GROUP BY 1, 2`));
  return rows;
}

/** The daily summaries' total for each measure, by tenant and campaign (null for none). */
async function summaryFigures(db: Db, t: string | null): Promise<Row[]> {
  return db.$queryRawUnsafe<Row[]>(
    /* tenant-scope: $1 is the tenant, or every tenant for the platform check. */
    `SELECT s."tenantId", NULLIF(s."campaignId", '') AS "campaignId", m.measure, m.v::text AS v
       FROM (SELECT "tenantId", "campaignId", ${COMPARED_MEASURES.map((m) => `sum("${MEASURE_COLUMNS[m]}") AS "${m}"`).join(", ")}
               FROM "CampaignDaySummary" WHERE $1::text IS NULL OR "tenantId" = $1 GROUP BY 1, 2) s,
            LATERAL (VALUES ${COMPARED_MEASURES.map((m) => `('${m}', s."${m}")`).join(", ")}) AS m(measure, v)`,
    t,
  );
}

/**
 * Compare the summaries with the app's own records, campaign by campaign and
 * measure by measure. `ok` when every figure agrees.
 */
export async function checkFactsAgainstApp(
  db: Db,
  opts: { tenantId?: string } = {},
): Promise<{ ok: boolean; differences: FactAppDifference[] }> {
  const t = opts.tenantId ?? null;
  const key = (r: { tenantId: string; campaignId: string | null; measure: string }) => `${r.tenantId}|${r.campaignId ?? ""}|${r.measure}`;
  const tally = (rows: Row[]) => {
    const out = new Map<string, number>();
    for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + Number(r.v ?? 0));
    return out;
  };
  const app = tally(await appFigures(db, t));
  const facts = tally(await summaryFigures(db, t));
  const differences: FactAppDifference[] = [];
  for (const k of new Set([...app.keys(), ...facts.keys()])) {
    const a = app.get(k) ?? 0;
    const f = facts.get(k) ?? 0;
    if (a === f) continue;
    const [tenantId, campaignId, measure] = k.split("|") as [string, string, FactMeasure];
    differences.push({ tenantId, campaignId: campaignId || null, measure, app: a, facts: f });
  }
  differences.sort((x, y) => key(x).localeCompare(key(y)));
  return { ok: differences.length === 0, differences };
}
