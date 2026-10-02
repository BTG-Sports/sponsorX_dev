/**
 * A sponsor's spending limit — 2S4-BE-09.
 *
 * "An order within the sponsor's limit is approved automatically; above it,
 * it waits for BTG." The limit starts at MARKETPLACE_SPENDING_LIMIT_START_CENTS
 * ($5,000). After each of the sponsor's orders is completed (it reached
 * FULFILLED: paid and delivered), it becomes twice their largest completed
 * order — never below the start — up to MARKETPLACE_SPENDING_LIMIT_CAP_CENTS
 * ($25,000). A refunded order, or a delivery problem BTG upheld by refunding
 * the line, STOPS it rising: it stays where it was.
 *
 * NOTHING IS STORED. The limit is replayed from the sponsor's own records
 * every time it is read (marketplace-order-rules.ts `spendingLimit`): when
 * each order reached FULFILLED (`fulfilledAt`), when one was refunded
 * (`refundedAt`), and which lines BTG refunded over a reported problem
 * (`OrderLineDelivery.resolution = REFUNDED`), or the seller refunded and the
 * sponsor accepted (a SETTLED DeliveryIssue, 2S4-BE-11). So the figure can always be
 * explained — the history is those same events, oldest first, with what each
 * did to it — and it cannot drift from what actually happened. Each order
 * also keeps the limit it was checked against (`spendingLimitCents`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { spendingLimit, type LimitEvent } from "./marketplace-order-rules";
import { orderRef } from "./order-mail";

type Db = Prisma.TransactionClient | typeof prisma;

export const limitSettings = () => ({ startCents: env.MARKETPLACE_SPENDING_LIMIT_START_CENTS, capCents: env.MARKETPLACE_SPENDING_LIMIT_CAP_CENTS });

/** The events that move a sponsor's limit, from their own orders. */
export async function limitEvents(db: Db, tenantId: string, sponsorId: string): Promise<LimitEvent[]> {
  const orders = await db.marketplaceOrder.findMany({
    where: { tenantId, sponsorId, OR: [{ fulfilledAt: { not: null } }, { state: "REFUNDED" }] },
    select: { id: true, totalCents: true, fulfilledAt: true, refundedAt: true, updatedAt: true, state: true },
  });
  const upheld = await db.orderLineDelivery.findMany({
    where: { tenantId, sponsorId, resolution: "REFUNDED" },
    select: { orderId: true, lineId: true, resolvedAt: true, updatedAt: true },
  });
  const events: LimitEvent[] = [];
  for (const o of orders) {
    if (o.fulfilledAt) events.push({ kind: "COMPLETED", at: o.fulfilledAt, orderId: o.id, totalCents: o.totalCents });
    /* refundedAt is recorded from 2S4-BE-10 on; an older refund is dated by its last change. */
    if (o.state === "REFUNDED") events.push({ kind: "REFUNDED", at: o.refundedAt ?? o.updatedAt, orderId: o.id });
  }
  for (const d of upheld) events.push({ kind: "PROBLEM_UPHELD", at: d.resolvedAt ?? d.updatedAt, orderId: d.orderId, lineId: d.lineId });
  /* 2S4-BE-11 — a line the seller refunded over a problem, and the sponsor
     accepted, settles between them without BTG: a refund all the same, so it
     stops the limit rising too. (BTG's own refunds are `resolution` above.) */
  const sponsorOrders = await db.marketplaceOrder.findMany({ where: { tenantId, sponsorId }, select: { id: true } });
  if (sponsorOrders.length) {
    const agreed = await db.deliveryIssue.findMany({
      /* tenant-scope: the sponsor's own orders, found above in their tenant. */
      where: { tenantId, orderId: { in: sponsorOrders.map((o) => o.id) }, stage: "SETTLED", outcome: "REFUNDED" },
      select: { orderId: true, lineId: true, closedAt: true },
    });
    const counted = new Set(upheld.map((d) => d.lineId));
    for (const a of agreed) {
      if (counted.has(a.lineId) || !a.closedAt) continue;
      events.push({ kind: "PROBLEM_UPHELD", at: a.closedAt, orderId: a.orderId, lineId: a.lineId });
    }
  }
  return events;
}

/** The sponsor's limit now, with its history. */
export async function sponsorLimit(db: Db, tenantId: string, sponsorId: string) {
  return spendingLimit(await limitEvents(db, tenantId, sponsorId), limitSettings());
}

/**
 * GET /sponsors/:id/spending-limit — BTG's view of a sponsor's limit and how
 * it got there (the BTG sponsor page). BTG staff in the sponsor's tenant.
 */
export async function sponsorSpendingLimit(actor: Actor, sponsorId: string) {
  assertTenantWide(actor, "sponsor", "read");
  const sponsor = await prisma.sponsor.findFirst({ where: { ...whereFor(actor, "sponsor", "read"), id: sponsorId }, select: { id: true, tenantId: true, name: true } });
  if (!sponsor) throw new ForbiddenError("sponsor", "read");
  const limit = await sponsorLimit(prisma, sponsor.tenantId, sponsor.id);
  return {
    sponsorId: sponsor.id,
    sponsorName: sponsor.name,
    limitCents: limit.limitCents,
    startCents: limit.startCents,
    capCents: limit.capCents,
    largestCompletedCents: limit.largestCompletedCents,
    rising: !limit.frozen && limit.limitCents < limit.capCents,
    frozen: limit.frozen ? { ...limit.frozen, orderRef: orderRef(limit.frozen.orderId) } : null,
    history: limit.history.map((h) => ({ ...h, orderRef: orderRef(h.orderId) })),
  };
}
