/**
 * The seller's marketplace at a glance — 2S2-FE-01 (the athlete portal home,
 * "inventory performance" and upcoming sales).
 *
 * GET /sales/summary. Every figure is counted in Postgres over the caller's
 * own rows, never over a capped list: the items they may read
 * (whereFor(inventoryItem)), the listings of those items by state
 * (whereFor(listing)), the order lines they sell (whereFor(orderDelivery)) —
 * sold, awaiting payment, and the next ones with dates ahead — and the
 * orders waiting for their answer (whereFor(orderSellerApproval)).
 *
 * The caller is a seller: an athlete (or the guardian acting for them) or a
 * team's manager — the same people GET /sales serves. Anyone else is 403.
 * No money here: each seller's share is GET /sales and GET /payouts/me.
 */

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

/** Sold: the sponsor has paid and the line is being or has been delivered. */
const SOLD = ["IN_DELIVERY", "DELIVERED", "CONFIRMED", "PROBLEM"];
/** Approved, waiting for the sponsor's payment. */
const AWAITING_PAYMENT = ["UNPAID"];
/** Still to deliver: the lines whose dates the home lists as upcoming. */
const UPCOMING = ["UNPAID", "IN_DELIVERY"];
/** How many upcoming lines the summary carries; `upcoming.total` counts them all. */
export const UPCOMING_SHOWN = 3;

const orderRef = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The listing states, as the seller reads them. */
const LISTING_BUCKET: Record<string, "live" | "held" | "draft" | "paused" | "ended"> = {
  PUBLISHED: "live", PENDING_APPROVAL: "held", DRAFT: "draft", PAUSED: "paused", ARCHIVED: "ended",
};

export async function sellerSummary(actor: Actor, now = new Date()) {
  const scope = assertAllowed(actor, "orderDelivery", "read");
  if (!((scope === "own-property" && actor.propertyId) || (scope === "own" && actor.athleteId))) {
    throw new ForbiddenError("orderDelivery", "read");
  }
  const today = new Date(`${day(now)}T00:00:00.000Z`);
  const upcomingWhere = { AND: [whereFor(actor, "orderDelivery", "read"), { state: { in: UPCOMING } }, { line: { endsOn: { gte: today } } }] };
  const askable = can(actor, "orderSellerApproval", "read");

  const [items, activeItems, listings, sold, awaiting, upcomingTotal, upcoming, approvals] = await Promise.all([
    prisma.inventoryItem.count({ where: whereFor(actor, "inventoryItem", "read") }),
    prisma.inventoryItem.count({ where: { AND: [whereFor(actor, "inventoryItem", "read"), { active: true }] } }),
    prisma.listing.groupBy({ by: ["state"], where: whereFor(actor, "listing", "read"), _count: { _all: true } }),
    prisma.marketplaceOrderLine.aggregate({
      where: { delivery: { is: { AND: [whereFor(actor, "orderDelivery", "read"), { state: { in: SOLD } }] } } },
      _count: { _all: true }, _sum: { quantity: true },
    }),
    prisma.marketplaceOrderLine.aggregate({
      where: { delivery: { is: { AND: [whereFor(actor, "orderDelivery", "read"), { state: { in: AWAITING_PAYMENT } }] } } },
      _count: { _all: true }, _sum: { quantity: true },
    }),
    prisma.orderLineDelivery.count({
      /* tenant-scope: upcomingWhere is whereFor(orderDelivery, read), narrowed. */
      where: upcomingWhere,
    }),
    prisma.orderLineDelivery.findMany({
      /* tenant-scope: upcomingWhere is whereFor(orderDelivery, read), narrowed. */
      where: upcomingWhere,
      select: { lineId: true, orderId: true, state: true, sponsorId: true, line: { select: { title: true, quantity: true, startsOn: true, endsOn: true } } },
      orderBy: [{ line: { startsOn: "asc" } }, { lineId: "asc" }], take: UPCOMING_SHOWN,
    }),
    askable
      ? prisma.orderSellerApproval.count({
        where: { AND: [whereFor(actor, "orderSellerApproval", "read"), { state: "PENDING", dueAt: { gt: now }, order: { state: "PENDING_SELLER" } }] },
      })
      : Promise.resolve(null),
  ]);

  const sponsors = upcoming.length
    ? await prisma.sponsor.findMany({
      /* tenant-scope: the sponsors named on the caller's own sold lines, loaded through whereFor(orderDelivery). */
      where: { id: { in: [...new Set(upcoming.map((u) => u.sponsorId))] } }, select: { id: true, name: true },
    })
    : [];
  const sponsorName = new Map(sponsors.map((s) => [s.id, s.name]));

  const byState = { live: 0, held: 0, draft: 0, paused: 0, ended: 0 };
  for (const g of listings) {
    const k = LISTING_BUCKET[g.state];
    if (k) byState[k] += g._count._all;
  }

  return {
    items: { total: items, active: activeItems },
    listings: { ...byState, total: listings.reduce((s, g) => s + g._count._all, 0) },
    sold: { lines: sold._count._all, units: sold._sum.quantity ?? 0 },
    awaitingPayment: { lines: awaiting._count._all, units: awaiting._sum.quantity ?? 0 },
    /** Orders waiting for the seller's answer, inside their 48 hours; null when the caller answers none. */
    approvalsWaiting: approvals,
    upcoming: {
      total: upcomingTotal,
      lines: upcoming.map((u) => ({
        id: u.lineId,
        orderId: u.orderId,
        ref: orderRef(u.orderId),
        state: u.state,
        sponsorName: sponsorName.get(u.sponsorId) ?? "Sponsor",
        title: u.line.title,
        quantity: u.line.quantity,
        startsOn: day(u.line.startsOn),
        endsOn: day(u.line.endsOn),
      })),
    },
  };
}
