/**
 * One writer per business event — 3S1-BE-02
 * (documentation/SponsorX-Fact-Ledger.md §4).
 *
 * Each is called by the action that causes the event, INSIDE that action's
 * transaction, right after its own write. It reads what it needs (the order,
 * the athlete's registered market, the deliverable's channel) through the same
 * transaction, so the fact describes exactly the state being committed, and
 * hands it to `recordFact`. The channel and market rules live here, once.
 *
 * Every fact has a key naming its event, so calling a writer twice for the
 * same event (a retried job, a repeated webhook) adds nothing.
 */
import type { Prisma } from "../generated/prisma/client";
import { recordFact, reverseFact } from "./facts";
import type { FactChannel, FactMeasure } from "./fact-rules";
import { METRIC_SOURCE_MEASURES, PLATFORM_CHANNELS } from "./fact-classification";
import type { DeliverablePlatform } from "./deliverable-platform";

type Tx = Prisma.TransactionClient;

/** The product's appearance jobs (deliverables.ts `APPEARANCE_JOBS`). */
const APPEARANCE_JOBS = new Set(["SX-05"]);

/** A deliverable's channel: an appearance job is in person; otherwise its recorded platform (fact-classification.ts); unpublished until it has one. */
export function deliverableChannel(jobId: string, platform: string | null | undefined): FactChannel {
  if (APPEARANCE_JOBS.has(jobId)) return "IN_PERSON";
  return (platform && PLATFORM_CHANNELS[platform as DeliverablePlatform]) || "UNPUBLISHED";
}

async function athleteMarket(tx: Tx, athleteId: string | null | undefined) {
  if (!athleteId) return null;
  const a = await tx.athlete.findUnique({
    /* tenant-scope: by id, the athlete the fact's own order or line names. */
    where: { id: athleteId }, select: { stateCode: true, city: true },
  });
  return a ? { state: a.stateCode, city: a.city } : null;
}

/** The facts not yet reversed for one source row and kind. */
async function liveFacts(tx: Tx, tenantId: string, kind: string, sourceType: string, sourceId: string) {
  return tx.$queryRawUnsafe<Array<{ idempotencyKey: string; measures: unknown; channel: string; occurredOn: Date }>>(
    /* tenant-scope: explicit — this tenant's facts for one source row, not yet reversed. */
    `SELECT f."idempotencyKey", f.measures, f.channel, f."occurredOn" FROM "Fact" f
      WHERE f."tenantId" = $1 AND f.kind = $2 AND f."sourceType" = $3 AND f."sourceId" = $4
        AND NOT EXISTS (SELECT 1 FROM "Fact" r WHERE r."reversesId" = f.id)
      ORDER BY f."recordedAt"`, tenantId, kind, sourceType, sourceId);
}

/* ── campaign orders ──────────────────────────────────────────────────────── */

async function orderContext(tx: Tx, orderId: string) {
  return tx.campaignOrder.findUniqueOrThrow({
    /* tenant-scope: by id, the order the calling action just wrote. */
    where: { id: orderId },
    select: { id: true, tenantId: true, campaignId: true, athleteId: true, jobId: true, sellPrice: true, compensation: true, acceptedAt: true },
  });
}

/** An order was accepted: its sell price and the athlete's pay, booked on the acceptance day. Also schedules its deliverables. */
export async function factOrderBooked(tx: Tx, orderId: string): Promise<void> {
  const o = await orderContext(tx, orderId);
  if (!o.acceptedAt) return;
  await recordFact(tx, {
    tenantId: o.tenantId, kind: "ORDER_BOOKED", key: `order.booked:${o.id}`, occurredOn: o.acceptedAt,
    campaignId: o.campaignId, athleteId: o.athleteId, inventory: { kind: "NIL_JOB", id: o.jobId }, channel: "CAMPAIGN",
    market: await athleteMarket(tx, o.athleteId), source: { type: "CampaignOrder", id: o.id },
    measures: { booked_sell_cents: o.sellPrice, booked_compensation_cents: o.compensation },
  });
  const deliverables = await tx.deliverable.findMany({
    /* tenant-scope: this order's own deliverables. */
    where: { orderId: o.id, tenantId: o.tenantId }, select: { id: true },
  });
  for (const d of deliverables) await factDeliverableDue(tx, d.id);
}

/**
 * An accepted order was cancelled: the same amounts, on the cancellation day.
 * An order never accepted booked nothing. Its deliverables are no longer due —
 * the app stops counting a cancelled order's deliverables (sponsor overview,
 * campaign list) — so their "due" facts are reversed on their own due days.
 * Anything already published or verified happened, and stays.
 */
export async function factOrderCancelled(tx: Tx, orderId: string, at: Date): Promise<void> {
  const o = await orderContext(tx, orderId);
  if (!o.acceptedAt) return;
  await recordFact(tx, {
    tenantId: o.tenantId, kind: "ORDER_CANCELLED", key: `order.cancelled:${o.id}`, occurredOn: at,
    campaignId: o.campaignId, athleteId: o.athleteId, inventory: { kind: "NIL_JOB", id: o.jobId }, channel: "CAMPAIGN",
    market: await athleteMarket(tx, o.athleteId), source: { type: "CampaignOrder", id: o.id },
    measures: { cancelled_sell_cents: o.sellPrice, cancelled_compensation_cents: o.compensation },
  });
  const deliverables = await tx.deliverable.findMany({
    /* tenant-scope: this order's own deliverables. */
    where: { orderId: o.id, tenantId: o.tenantId }, select: { id: true },
  });
  for (const d of deliverables) {
    for (const due of await liveFacts(tx, o.tenantId, "DELIVERABLE_DUE", "Deliverable", d.id)) {
      await reverseFact(tx, { tenantId: o.tenantId, key: due.idempotencyKey, occurredOn: due.occurredOn, reason: "order cancelled" });
    }
  }
}

/* ── deliverables ─────────────────────────────────────────────────────────── */

async function deliverableContext(tx: Tx, deliverableId: string) {
  const d = await tx.deliverable.findUniqueOrThrow({
    /* tenant-scope: by id, the deliverable the calling action just wrote. */
    where: { id: deliverableId },
    select: { id: true, tenantId: true, dueDate: true, platform: true, publishedAt: true, order: { select: { campaignId: true, athleteId: true, jobId: true } } },
  });
  return { ...d, channel: deliverableChannel(d.order.jobId, d.platform) };
}

async function deliverableFact(tx: Tx, d: Awaited<ReturnType<typeof deliverableContext>>, kind: "DELIVERABLE_DUE" | "DELIVERABLE_PUBLISHED" | "DELIVERABLE_VERIFIED" | "REVISION_REQUESTED",
  key: string, occurredOn: Date, measure: FactMeasure) {
  await recordFact(tx, {
    tenantId: d.tenantId, kind, key, occurredOn, campaignId: d.order.campaignId, athleteId: d.order.athleteId,
    inventory: { kind: "NIL_JOB", id: d.order.jobId }, channel: d.channel, market: await athleteMarket(tx, d.order.athleteId),
    source: { type: "Deliverable", id: d.id }, measures: { [measure]: 1 },
  });
}

/** A deliverable is due on its due date, under its current channel. */
export async function factDeliverableDue(tx: Tx, deliverableId: string): Promise<void> {
  const d = await deliverableContext(tx, deliverableId);
  await deliverableFact(tx, d, "DELIVERABLE_DUE", `deliverable.due:${d.id}:${d.channel}`, d.dueDate, "deliverables_due");
}

/**
 * A deliverable was published. Its "due" fact was filed under "not yet
 * published"; now that its platform is known it is reversed and filed again
 * under that platform, so a platform's figures include everything due there.
 */
export async function factDeliverablePublished(tx: Tx, deliverableId: string, at: Date): Promise<void> {
  const d = await deliverableContext(tx, deliverableId);
  for (const due of await liveFacts(tx, d.tenantId, "DELIVERABLE_DUE", "Deliverable", d.id)) {
    if (due.channel === d.channel) continue;
    await reverseFact(tx, { tenantId: d.tenantId, key: due.idempotencyKey, occurredOn: due.occurredOn, reason: `published on ${d.channel}` });
  }
  await deliverableFact(tx, d, "DELIVERABLE_DUE", `deliverable.due:${d.id}:${d.channel}`, d.dueDate, "deliverables_due");
  await deliverableFact(tx, d, "DELIVERABLE_PUBLISHED", `deliverable.published:${d.id}`, at, "deliverables_published");
}

export async function factDeliverableVerified(tx: Tx, deliverableId: string, at: Date): Promise<void> {
  const d = await deliverableContext(tx, deliverableId);
  await deliverableFact(tx, d, "DELIVERABLE_VERIFIED", `deliverable.verified:${d.id}`, at, "deliverables_verified");
}

/**
 * A draft was sent back — by a reviewer or by the automatic checks. Each
 * sending-back is its own event. Filed under the channel the deliverable had
 * at that moment: a draft sent back before it was published is UNPUBLISHED,
 * which is what the live action always sees; the history fill (which reads a
 * deliverable after publication) gets the same answer from the published date.
 */
export async function factRevisionRequested(tx: Tx, deliverableId: string, at: Date): Promise<void> {
  const d = await deliverableContext(tx, deliverableId);
  const before = !d.publishedAt || at < d.publishedAt;
  const channel = before && d.channel !== "IN_PERSON" ? "UNPUBLISHED" : d.channel;
  await deliverableFact(tx, { ...d, channel }, "REVISION_REQUESTED", `deliverable.revision:${d.id}:${at.toISOString()}`, at, "revisions_requested");
}

/* ── metrics ──────────────────────────────────────────────────────────────── */


/**
 * One day's views and engagements from one source were recorded. A same-source
 * correction reverses the figure it replaces and records the new one, both on
 * the figure's own day, and counts one metric correction.
 */
export async function factMetricRecorded(tx: Tx, metricDailyId: string): Promise<void> {
  const m = await tx.metricDaily.findUniqueOrThrow({
    /* tenant-scope: by id, the row the calling action just wrote. */
    where: { id: metricDailyId },
    select: { id: true, tenantId: true, day: true, views: true, engagements: true, source: true, updatedAt: true, deliverableId: true },
  });
  const d = await deliverableContext(tx, m.deliverableId);
  const label = METRIC_SOURCE_MEASURES[m.source];
  const measures: Partial<Record<FactMeasure, number>> = { [label.views]: m.views, [label.engagements]: m.engagements };
  const previous = await liveFacts(tx, m.tenantId, "METRIC_RECORDED", "MetricDaily", m.id);
  const same = (p: { measures: unknown }) => {
    const pm = p.measures as Record<string, number>;
    return pm[label.views] === m.views && pm[label.engagements] === m.engagements;
  };
  if (previous.length && previous.every(same)) return;
  for (const p of previous) await reverseFact(tx, { tenantId: m.tenantId, key: p.idempotencyKey, occurredOn: p.occurredOn, reason: "metric corrected" });
  await recordFact(tx, {
    tenantId: m.tenantId, kind: "METRIC_RECORDED", key: `metric:${m.id}:${m.updatedAt.toISOString()}`, occurredOn: m.day,
    campaignId: d.order.campaignId, athleteId: d.order.athleteId, inventory: { kind: "NIL_JOB", id: d.order.jobId }, channel: d.channel,
    market: await athleteMarket(tx, d.order.athleteId), source: { type: "MetricDaily", id: m.id },
    measures: previous.length ? { ...measures, metric_corrections: 1 } : measures,
  });
}

/* ── earnings and invoices ────────────────────────────────────────────────── */

/** An earning was paid: gross plus adjustment, on the paid day. */
export async function factEarningPaid(tx: Tx, earningId: string): Promise<void> {
  const e = await tx.earning.findUniqueOrThrow({
    /* tenant-scope: by id, the earning the calling action just wrote. */
    where: { id: earningId }, select: { id: true, tenantId: true, gross: true, adjustment: true, paidAt: true, orderId: true },
  });
  if (!e.paidAt) return;
  const o = await orderContext(tx, e.orderId);
  await recordFact(tx, {
    tenantId: e.tenantId, kind: "EARNING_PAID", key: `earning.paid:${e.id}`, occurredOn: e.paidAt,
    campaignId: o.campaignId, athleteId: o.athleteId, inventory: { kind: "NIL_JOB", id: o.jobId }, channel: "CAMPAIGN",
    market: await athleteMarket(tx, o.athleteId), source: { type: "Earning", id: e.id },
    measures: { earnings_paid_cents: e.gross + (e.adjustment ?? 0) },
  });
}

/**
 * Zoho reported an invoice: issued on its issue day, paid on its paid day —
 * each once. Zoho can change an invoice after the fact (a new amount, a moved
 * date, a void), so the writer compares what is recorded with what the
 * invoice now says: a figure that no longer holds is reversed on its own day
 * and the new one recorded. A void invoice keeps nothing.
 */
export async function factInvoice(tx: Tx, invoiceId: string): Promise<void> {
  const i = await tx.campaignInvoice.findUniqueOrThrow({
    /* tenant-scope: by id, the invoice the ingest just wrote. */
    where: { id: invoiceId }, select: { id: true, tenantId: true, campaignId: true, amount: true, status: true, issuedAt: true, paidAt: true, syncedAt: true },
  });
  const voided = i.status.toLowerCase() === "void";
  const wanted = [
    { kind: "INVOICE_ISSUED" as const, measure: "invoiced_cents" as const, on: voided ? null : i.issuedAt },
    { kind: "INVOICE_PAID" as const, measure: "invoice_paid_cents" as const, on: voided ? null : i.paidAt },
  ];
  for (const w of wanted) {
    const live = await liveFacts(tx, i.tenantId, w.kind, "CampaignInvoice", i.id);
    const holds = (f: (typeof live)[number]) => w.on !== null && (f.measures as Record<string, number>)[w.measure] === i.amount
      && f.occurredOn.toISOString().slice(0, 10) === w.on.toISOString().slice(0, 10);
    if (live.length && live.every(holds)) continue;
    for (const f of live) await reverseFact(tx, { tenantId: i.tenantId, key: f.idempotencyKey, occurredOn: f.occurredOn, reason: voided ? "invoice voided" : "invoice changed in Zoho" });
    if (!w.on) continue;
    await recordFact(tx, {
      tenantId: i.tenantId, campaignId: i.campaignId, channel: "CAMPAIGN", source: { type: "CampaignInvoice", id: i.id },
      kind: w.kind, key: `${w.kind === "INVOICE_ISSUED" ? "invoice.issued" : "invoice.paid"}:${i.id}:${i.syncedAt.toISOString()}`,
      occurredOn: w.on, measures: { [w.measure]: i.amount },
    });
  }
}

/* ── NEXT ad slots ────────────────────────────────────────────────────────── */

/** A slot was sold to a campaign. A slot released and sold again is a new sale (keyed by its sale time). */
export async function factAdSlotSold(tx: Tx, slotId: string): Promise<void> {
  const s = await tx.adSlot.findUniqueOrThrow({
    /* tenant-scope: by id, the slot the calling action just sold. */
    where: { id: slotId }, select: { id: true, tenantId: true, campaignId: true, soldCents: true, soldAt: true },
  });
  if (!s.campaignId || !s.soldAt || s.soldCents == null) return;
  await recordFact(tx, {
    tenantId: s.tenantId, kind: "AD_SLOT_SOLD", key: `adslot.sold:${s.id}:${s.soldAt.toISOString()}`, occurredOn: s.soldAt,
    campaignId: s.campaignId, inventory: { kind: "AD_SLOT", id: s.id }, channel: "EDITION_PRINT",
    source: { type: "AdSlot", id: s.id }, measures: { ad_slot_sold_cents: s.soldCents },
  });
}

/** A sold slot was released: its sale is reversed on the release day. Call BEFORE clearing the slot's sale. */
export async function factAdSlotReleased(tx: Tx, tenantId: string, slotId: string, at: Date): Promise<void> {
  for (const f of await liveFacts(tx, tenantId, "AD_SLOT_SOLD", "AdSlot", slotId)) {
    await reverseFact(tx, { tenantId, key: f.idempotencyKey, occurredOn: at, reason: "slot released" });
  }
}

/* ── marketplace ──────────────────────────────────────────────────────────── */

/** A marketplace order was contracted: each line's gross and net, on the contract day. Call after its financials are written. */
export async function factMarketplaceContracted(tx: Tx, orderId: string, at: Date): Promise<void> {
  const lines = await tx.marketplaceOrderLine.findMany({
    /* tenant-scope: this order's own lines. */
    where: { orderId },
    select: { id: true, tenantId: true, propertyId: true, sellerAthleteId: true, inventoryItemId: true },
  });
  for (const l of lines) {
    const f = await tx.orderLineFinancials.findFirst({
      /* tenant-scope: this line's own financials. */
      where: { lineId: l.id }, select: { grossCents: true, netCents: true, athleteId: true, computedAt: true },
    });
    if (!f) continue;
    const athleteId = l.sellerAthleteId ?? f.athleteId;
    const property = l.propertyId ? await tx.property.findUnique({
      /* tenant-scope: by id, the line's own seller. */
      where: { id: l.propertyId }, select: { stateCode: true, city: true },
    }) : null;
    await recordFact(tx, {
      tenantId: l.tenantId, kind: "MARKETPLACE_LINE_CONTRACTED", key: `mkt.line:${l.id}:${f.computedAt.toISOString()}`, occurredOn: at,
      athleteId, inventory: { kind: "LISTING_ITEM", id: l.inventoryItemId }, channel: "MARKETPLACE",
      market: property?.stateCode ? { state: property.stateCode, city: property.city } : await athleteMarket(tx, athleteId),
      source: { type: "MarketplaceOrderLine", id: l.id }, measures: { marketplace_gross_cents: f.grossCents, marketplace_net_cents: f.netCents },
    });
  }
}

/** A contracted order (or one line of it) was unwound: its contracted facts are reversed. */
export async function factMarketplaceUnwound(tx: Tx, orderId: string, at: Date, lineId?: string): Promise<void> {
  const lines = await tx.marketplaceOrderLine.findMany({
    /* tenant-scope: this order's own lines. */
    where: { orderId, ...(lineId ? { id: lineId } : {}) }, select: { id: true, tenantId: true },
  });
  for (const l of lines) {
    for (const f of await liveFacts(tx, l.tenantId, "MARKETPLACE_LINE_CONTRACTED", "MarketplaceOrderLine", l.id)) {
      await reverseFact(tx, { tenantId: l.tenantId, key: f.idempotencyKey, occurredOn: at, reason: "order unwound" });
    }
  }
}

/**
 * A marketplace refund was sent, on the day it was sent (the day Finance
 * gives, for one sent by hand). A refund on a cancelled NEXT edition is not
 * marketplace money and records no fact here.
 */
export async function factRefundSent(tx: Tx, refundDueId: string): Promise<void> {
  const r = await tx.refundDue.findUniqueOrThrow({
    /* tenant-scope: by id, the refund the calling action just marked sent. */
    where: { id: refundDueId }, select: { id: true, tenantId: true, orderId: true, amountCents: true, sentAt: true, sentOn: true, state: true },
  });
  const on = r.sentOn ?? r.sentAt;
  if (r.state !== "SENT" || !r.orderId || !on) return;
  await recordFact(tx, {
    tenantId: r.tenantId, kind: "MARKETPLACE_REFUND", key: `refund.sent:${r.id}`, occurredOn: on, channel: "MARKETPLACE",
    source: { type: "RefundDue", id: r.id }, measures: { marketplace_refunded_cents: r.amountCents },
  });
}
