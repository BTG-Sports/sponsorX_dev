/**
 * Filling the fact history — 3S1-DATA-05 (orders and deliverables)
 * (documentation/SponsorX-Fact-Ledger.md §8).
 *
 * Records the facts for what happened before the ledger existed, from the
 * app's records and its audit log, through the SAME writers the live actions
 * call (fact-writers.ts). A history fact therefore means exactly what a live
 * one does. Each event is dated by when it happened, not when it is filled.
 *
 * RE-RUNNABLE, AND SAFE WHILE THE APP IS LIVE. Every fact has the key its
 * live action would have used, so an event already recorded — by an earlier
 * run, or live since the ledger went in — adds nothing. Revisions are the one
 * event with no fixed key (each sending-back is its own event), so they are
 * counted: the audit log's revisions for a deliverable, less the facts it
 * already has, and the oldest missing ones are recorded.
 *
 * One order per transaction, so a long fill never holds a lock for long and
 * never collides with a live action for more than one order.
 *
 * DATES. Booked: the acceptance. Published: the published date. Cancelled,
 * verified and sent back: the audit log's entry, written in the same
 * transaction as the action. A record with no audit entry (data seeded
 * straight into the database) falls back to the nearest known date —
 * cancelled to the acceptance, verified to the publication — and is counted
 * in `fallbackDates` so it is visible, never silent.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { AUDIT_ACTIONS } from "../db/audit";
import type { FactMeasure } from "./fact-rules";
import {
  factDeliverablePublished, factDeliverableVerified, factOrderBooked, factOrderCancelled, factRevisionRequested,
} from "./fact-writers";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** The measures this fill is answerable for — what the check must match for every campaign after it runs. */
export const ORDER_HISTORY_MEASURES: readonly FactMeasure[] = [
  "booked_sell_cents", "booked_compensation_cents", "cancelled_sell_cents", "cancelled_compensation_cents",
  "deliverables_due", "deliverables_published", "deliverables_verified", "revisions_requested",
];

const ORDER_CANCEL = "order.cancel";
const REVISIONS = [AUDIT_ACTIONS.deliverable.requestRevision, AUDIT_ACTIONS.deliverable.systemRevision];

export type FillReport = { orders: number; factsAdded: number; fallbackDates: number };

async function factCount(db: Db | Tx, tenantId: string | null): Promise<number> {
  const [r] = await db.$queryRawUnsafe<Array<{ n: string }>>(
    /* tenant-scope: $1 is the tenant, or every tenant for the platform fill. */
    `SELECT count(*)::text AS n FROM "Fact" WHERE $1::text IS NULL OR "tenantId" = $1`, tenantId);
  return Number(r!.n);
}

/** The audit time of the first entry with this action for a row, or null. */
async function auditAt(tx: Tx, tenantId: string, entity: string, entityId: string, actions: string[]): Promise<Date[]> {
  const rows = await tx.auditLog.findMany({
    /* tenant-scope: the row's own tenant, named by its id. */
    where: { tenantId, entity, entityId, action: { in: actions } },
    select: { at: true }, orderBy: { at: "asc" },
  });
  return rows.map((r) => r.at);
}

/**
 * One order's history, in the order it happened: booked (with its
 * deliverables due), then each deliverable's sending-back, publication and
 * verification, then — last, because it is final — its cancellation.
 */
async function fillOrder(tx: Tx, orderId: string): Promise<number> {
  let fallbacks = 0;
  const o = await tx.campaignOrder.findUniqueOrThrow({
    /* tenant-scope: by id, an order the fill listed in its own tenant. */
    where: { id: orderId }, select: { id: true, tenantId: true, state: true, acceptedAt: true },
  });
  if (!o.acceptedAt) return 0;
  await factOrderBooked(tx, o.id);

  const deliverables = await tx.deliverable.findMany({
    /* tenant-scope: this order's own deliverables. */
    where: { orderId: o.id, tenantId: o.tenantId },
    select: { id: true, state: true, publishedAt: true }, orderBy: { id: "asc" },
  });
  for (const d of deliverables) {
    const sentBack = await auditAt(tx, o.tenantId, "Deliverable", d.id, REVISIONS);
    const [{ n } = { n: "0" }] = await tx.$queryRawUnsafe<Array<{ n: string }>>(
      /* tenant-scope: this deliverable's own facts, in its tenant. */
      `SELECT count(*)::text AS n FROM "Fact" f WHERE f."tenantId" = $1 AND f.kind = 'REVISION_REQUESTED' AND f."sourceId" = $2
          AND NOT EXISTS (SELECT 1 FROM "Fact" r WHERE r."reversesId" = f.id)`, o.tenantId, d.id);
    for (const at of sentBack.slice(0, Math.max(0, sentBack.length - Number(n)))) await factRevisionRequested(tx, d.id, at);

    if (d.publishedAt) await factDeliverablePublished(tx, d.id, d.publishedAt);
    if (d.state === "VERIFIED") {
      const [verified] = await auditAt(tx, o.tenantId, "Deliverable", d.id, [AUDIT_ACTIONS.deliverable.verify]);
      if (!verified) fallbacks++;
      await factDeliverableVerified(tx, d.id, verified ?? d.publishedAt ?? o.acceptedAt);
    }
  }

  if (o.state === "CANCELLED") {
    const [cancelled] = await auditAt(tx, o.tenantId, "CampaignOrder", o.id, [ORDER_CANCEL]);
    if (!cancelled) fallbacks++;
    await factOrderCancelled(tx, o.id, cancelled ?? o.acceptedAt);
  }
  return fallbacks;
}

/**
 * Fill the order and deliverable history, for one tenant or all. Re-running
 * adds nothing; `factsAdded` says what this run recorded.
 */
export async function fillOrderHistory(db: Db, opts: { tenantId?: string } = {}): Promise<FillReport> {
  const t = opts.tenantId ?? null;
  const before = await factCount(db, t);
  const orders = await db.campaignOrder.findMany({
    /* tenant-scope: the platform fill — every tenant, or the one named. */
    where: { acceptedAt: { not: null }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: { id: true }, orderBy: { acceptedAt: "asc" },
  });
  let fallbackDates = 0;
  for (const o of orders) fallbackDates += await db.$transaction((tx) => fillOrder(tx, o.id));
  return { orders: orders.length, factsAdded: (await factCount(db, t)) - before, fallbackDates };
}
