/**
 * Property analytics aggregates — 2S7-DATA-01.
 *
 * "Per-property revenue, sell-through, average CPM, campaign completion,
 * sponsor mix and payout trends." Done when: "Property analytics reconcile to
 * the ledger and campaign records."
 *
 * Every figure has one named source, and nothing is estimated:
 *   revenue, sponsor mix, payout trends — the property's ledger entries
 *     (ledger.ts), so the totals ARE the dashboard's;
 *   campaign completion — the marketplace orders its lines appear in;
 *   sell-through — the contracted commitments on its items, against stock.
 * AVERAGE CPM IS NOT SHOWN. Marketplace inventory carries no impression data
 * yet, and a CPM without impressions would be a number with no retrieval
 * path. It is returned as null with the reason.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { summarise } from "./ledger";

const month = (d: Date) => d.toISOString().slice(0, 7);

export async function propertyAnalytics(actor: Actor) {
  const scope = assertAllowed(actor, "ledgerEntry", "read");
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("ledgerEntry", "read");
  const propertyId = actor.propertyId;

  const entries = await prisma.ledgerEntry.findMany({
    where: { ...whereFor(actor, "ledgerEntry", "read"), account: { in: ["PROPERTY_PAYABLE", "RESERVE_HELD"] } },
    select: { entryType: true, account: true, status: true, debitCents: true, creditCents: true, createdAt: true, orderId: true },
  });

  /* Revenue by month: booked, and reversed, in the month each was posted. */
  const byMonth = new Map<string, { bookedCents: number; reversedCents: number; paidCents: number }>();
  const bump = (m: string, k: "bookedCents" | "reversedCents" | "paidCents", v: number) => {
    const row = byMonth.get(m) ?? { bookedCents: 0, reversedCents: 0, paidCents: 0 };
    row[k] += v;
    byMonth.set(m, row);
  };
  for (const e of entries) {
    if (e.entryType === "BOOKING") bump(month(e.createdAt), "bookedCents", e.creditCents);
    if (e.entryType === "REVERSAL") bump(month(e.createdAt), "reversedCents", e.debitCents - e.creditCents);
    if (e.entryType === "PAYOUT") bump(month(e.createdAt), "paidCents", e.debitCents);
  }

  /* The orders behind them — for completion and for the sponsor mix. */
  const lineOrders = await prisma.marketplaceOrderLine.findMany({
    /* tenant-scope: the order lines that name this property — the manager's own (actor.propertyId); a line of an invited athlete's item is in the athlete's tenant (2S2-BE-05). Only ids and states are read. */
    where: { propertyId },
    select: { orderId: true, order: { select: { state: true, contractedAt: true, sponsorId: true, tenantId: true } } },
  });
  const orders = new Map(lineOrders.map((l) => [l.orderId, l.order]));
  const contracted = [...orders.values()].filter((o) => o.contractedAt);
  const completed = contracted.filter((o) => o.state === "FULFILLED" || o.state === "CLOSED").length;
  const cancelled = contracted.filter((o) => o.state === "CANCELLED" || o.state === "REFUNDED").length;

  const sponsors = await prisma.sponsor.findMany({
    /* tenant-scope: the sponsors of this property's own contracted orders; categories only, never names or contacts. */
    where: { id: { in: [...new Set(contracted.map((o) => o.sponsorId))] } },
    select: { id: true, categories: true },
  });
  const categoryOf = new Map(sponsors.map((s) => [s.id, s.categories[0] ?? "UNCATEGORISED"]));
  const mix = new Map<string, number>();
  for (const e of entries) {
    if (e.entryType !== "BOOKING" || !e.orderId) continue;
    const o = orders.get(e.orderId);
    const cat = o ? (categoryOf.get(o.sponsorId) ?? "UNCATEGORISED") : "UNCATEGORISED";
    mix.set(cat, (mix.get(cat) ?? 0) + e.creditCents);
  }

  /* Sell-through: contracted units on the property's own items, against their stock. */
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: actor.tenantId, propertyId }, select: { id: true, title: true, kind: true, quantity: true },
  });
  const sold = await prisma.inventoryCommitment.groupBy({
    by: ["inventoryItemId"],
    /* tenant-scope: commitments on this property's own items, loaded above with its tenantId. */
    where: { inventoryItemId: { in: items.map((i) => i.id) }, contracted: true, releasedAt: null },
    _sum: { quantity: true },
  });
  const soldOf = new Map(sold.map((s) => [s.inventoryItemId, s._sum.quantity ?? 0]));

  const totals = summarise(entries);
  return {
    currency: "USD",
    revenue: {
      bookedCents: totals.bookedRevenueCents, reversedCents: totals.reversedCents, netCents: totals.bookedRevenueCents - totals.reversedCents,
      byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v })),
    },
    campaignCompletion: {
      contractedOrders: contracted.length, completedOrders: completed, cancelledOrders: cancelled,
      rate: contracted.length ? completed / contracted.length : null,
    },
    sellThrough: items.map((i) => ({
      itemId: i.id, title: i.title, kind: i.kind, stock: i.quantity, soldUnits: soldOf.get(i.id) ?? 0,
      rate: i.quantity ? (soldOf.get(i.id) ?? 0) / i.quantity : null,
    })),
    sponsorMix: [...mix.entries()].sort((a, b) => b[1] - a[1]).map(([category, bookedCents]) => ({ category, bookedCents })),
    payoutTrends: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, paidCents: v.paidCents })),
    averageCpm: null,
    averageCpmBasis: "Not shown: marketplace inventory carries no impression data yet, so a CPM would have no source.",
    reconciles: totals.reconciles,
  };
}
