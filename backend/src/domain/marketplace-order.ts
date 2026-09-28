/**
 * The marketplace order — 2S4-BE-03, and BTG's approval gate — 2S4-BE-05.
 *
 * 2S4-BE-03: "The commercial order: subtotal, fees, total, currency, and its
 * lifecycle." Done when: "Order states enforce correctly; an unapproved order
 * cannot contract inventory."
 * 2S4-BE-05: "Where policy requires it, an order waits for BTG approval before
 * inventory is contracted." Done when: "An order requiring approval holds
 * inventory without contracting it, and releases on rejection."
 *
 * PLACING. A sponsor turns a live reservation into an order, in one
 * transaction: the lines and figures are written from the held cart, the
 * hold converts (an expired one cannot — state machines §3), and the stock
 * moves from the 15-minute hold to the order's own hold, which does not
 * lapse but is NOT contracted (`InventoryCommitment.contracted = false`).
 *
 * THE GATE. `approvalReasons` decides: $1,000 or more, a sponsor's first
 * marketplace order, or a listing that asks. With a reason the order stays
 * PENDING_APPROVAL, holding its stock; BTG approves (the stock is contracted,
 * `contractedAt` is set) or rejects (CANCELLED, the stock released). With no
 * reason, policy approves it in the same transaction, as "system".
 *
 * THE MACHINE. Every state change goes through `moveOrder` and the table in
 * marketplace-order-rules.ts. APPROVED is reachable only through the
 * decision (or policy), never through a transition; payment states will be
 * set by the payment webhooks (2S5) through the same function staff use now.
 * The figures are Postgres's to keep from APPROVED on.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { unitsTaken } from "./availability";
import { convertReservation, lockItems } from "./reservation";
import { bookOrder, markOrderPaid, releaseReserve, reverseOrder } from "./ledger";
import {
  approvalReasons,
  canTransitionMarketplaceOrder,
  feeFor,
  IllegalMarketplaceOrderTransitionError,
  RELEASES,
  type MarketplaceOrderState,
} from "./marketplace-order-rules";

export class MarketplaceOrderError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "MarketplaceOrderError";
    this.status = status;
  }
}

const SELECT = {
  id: true, sponsorId: true, reservationId: true, state: true, currency: true, subtotalCents: true, feesCents: true,
  totalCents: true, requiresApproval: true, approvalReasons: true, decidedAt: true, decidedBy: true, decisionNotes: true,
  contractedAt: true, createdAt: true,
  lines: {
    select: { id: true, listingId: true, inventoryItemId: true, propertyId: true, title: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true, lineTotalCents: true },
    orderBy: { startsOn: "asc" },
  },
} as const;

type Row = Prisma.MarketplaceOrderGetPayload<{ select: typeof SELECT }>;
const SYSTEM = "system";

export async function listMarketplaceOrders(actor: Actor, state?: MarketplaceOrderState) {
  return prisma.marketplaceOrder.findMany({
    where: { ...whereFor(actor, "marketplaceOrder", "read"), ...(state ? { state } : {}) },
    select: SELECT, orderBy: { createdAt: "asc" },
  });
}

export async function getMarketplaceOrder(actor: Actor, id: string) {
  const row = await prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("marketplaceOrder", "read");
  return row;
}

/** The order's stock: every commitment it wrote. */
const orderHolds = (orderId: string) => ({ source: "ORDER", sourceId: { startsWith: `${orderId}:` }, releasedAt: null });

/** Contract the order's stock — only ever from the approval. */
async function contract(tx: Prisma.TransactionClient, order: Row, by: string, now: Date, notes: string | null, auditor: { userId: string | null; tenantId: string }) {
  await tx.inventoryCommitment.updateMany({
    /* tenant-scope: the commitments this order wrote, named by its id (unique); the order was loaded through the caller's scope. */
    where: orderHolds(order.id), data: { contracted: true },
  });
  const updated = await tx.marketplaceOrder.update({
    /* tenant-scope: the row loaded by the caller through whereFor(marketplaceOrder, …). */
    where: { id: order.id }, data: { state: "APPROVED", decidedAt: now, decidedBy: by, decisionNotes: notes, contractedAt: now }, select: SELECT,
  });
  /* 2S4-BE-04 / 2S5-BE-02 — contract time: the breakdown frozen, the ledger booked, in this transaction. */
  await bookOrder(tx, order.id, now);
  await audit(tx, auditor, "marketplaceOrder.approve", "MarketplaceOrder", order.id, {
    before: { state: "PENDING_APPROVAL" }, after: { state: "APPROVED", decidedBy: by, contracted: true, totalCents: order.totalCents },
  });
  /* 2S7-INT-01 — the contracted order becomes a Deal in Zoho, queued. */
  await enqueue(tx, auditor.tenantId, "zoho.pushMarketplaceOrder", { orderId: order.id });
  return updated;
}

/** A sponsor places the order its live hold describes. */
export async function placeOrder(actor: Actor, reservationId: string, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("marketplaceOrder", "write");
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { ...whereFor(actor, "reservation", "write"), id: reservationId },
      select: { id: true, cartId: true, state: true, expiresAt: true },
    });
    if (!reservation) throw new ForbiddenError("reservation", "write");
    if (reservation.state !== "HELD" || reservation.expiresAt <= now) {
      throw new MarketplaceOrderError(`A reservation that is ${reservation.state === "HELD" ? "EXPIRED" : reservation.state} cannot become an order. Reserve again.`);
    }
    const lines = await tx.cartLine.findMany({
      where: { tenantId: actor.tenantId, cartId: reservation.cartId },
      select: {
        id: true, listingId: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true,
        listing: { select: { title: true, tenantId: true, propertyId: true, inventoryItemId: true, item: { select: { packageRules: true, components: { select: { componentItemId: true } } } } } },
      },
    });
    await lockItems(tx, lines.flatMap((l) => [l.listing.inventoryItemId, ...l.listing.item.components.map((c) => c.componentItemId)]));

    const subtotalCents = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const feesCents = feeFor(subtotalCents, env.MARKETPLACE_BUYER_FEE_BPS);
    const totalCents = subtotalCents + feesCents;
    const priorFulfilledOrders = await tx.marketplaceOrder.count({
      where: { tenantId: actor.tenantId, sponsorId: actor.sponsorId!, state: { in: ["FULFILLED", "CLOSED"] } },
    });
    const reasons = approvalReasons({
      totalCents, thresholdCents: env.MARKETPLACE_APPROVAL_THRESHOLD_CENTS, priorFulfilledOrders,
      listingsAsking: lines.filter((l) => (l.listing.item.packageRules as { requiresApproval?: boolean } | null)?.requiresApproval).map((l) => l.listing.title),
    });

    const order = await tx.marketplaceOrder.create({
      data: {
        tenantId: actor.tenantId, sponsorId: actor.sponsorId!, reservationId: reservation.id, currency: "USD",
        subtotalCents, feesCents, totalCents, requiresApproval: reasons.length > 0, approvalReasons: reasons, createdBy: actor.userId,
        lines: {
          create: lines.map((l) => ({
            tenantId: actor.tenantId, listingId: l.listingId, inventoryItemId: l.listing.inventoryItemId, itemTenantId: l.listing.tenantId,
            propertyId: l.listing.propertyId, title: l.listing.title, quantity: l.quantity, startsOn: l.startsOn, endsOn: l.endsOn,
            unitPriceCents: l.unitPriceCents, lineTotalCents: l.quantity * l.unitPriceCents,
          })),
        },
      },
      select: SELECT,
    });

    /* The hold becomes the order's — not lapsing, not yet contracted. */
    await convertReservation(tx, reservation.id, now);
    for (const l of lines) {
      for (const u of await unitsTaken(tx, l.listing.inventoryItemId, l.listing.tenantId, l.quantity)) {
        await tx.inventoryCommitment.create({
          data: { ...u, source: "ORDER", sourceId: `${order.id}:${l.id}`, startsOn: l.startsOn, endsOn: l.endsOn, contracted: false },
          select: { id: true },
        });
      }
    }
    await tx.cart.updateMany({ where: { id: reservation.cartId, tenantId: actor.tenantId }, data: { state: "CHECKED_OUT" } });
    await audit(tx, actor, "marketplaceOrder.place", "MarketplaceOrder", order.id, {
      after: { reservationId: reservation.id, totalCents, requiresApproval: reasons.length > 0, reasons },
    });

    /* Policy approves it: recorded as the system's decision, not the sponsor's. */
    if (!reasons.length) return contract(tx, order, SYSTEM, now, "Approved by policy: no reason to hold it.", { userId: null, tenantId: actor.tenantId });
    return order;
  });
}

/** BTG's decision on an order policy held for approval. */
export async function decideMarketplaceOrder(actor: Actor, id: string, decision: "APPROVE" | "REJECT", notes?: string | null, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "approve");
  if (scope !== "any" && scope !== "own-tenant") throw new ForbiddenError("marketplaceOrder", "approve");
  if (decision === "REJECT" && !notes?.trim()) throw new MarketplaceOrderError("REJECT needs a note — the sponsor is told why.", 422);
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "approve"), id }, select: SELECT });
    if (!order) throw new ForbiddenError("marketplaceOrder", "approve");
    const to = decision === "APPROVE" ? "APPROVED" : "CANCELLED";
    if (order.state !== "PENDING_APPROVAL") throw new IllegalMarketplaceOrderTransitionError(order.state as MarketplaceOrderState, to);
    if (decision === "APPROVE") return contract(tx, order, actor.userId, now, notes?.trim() || null, actor);
    return moveIn(tx, actor, order, "CANCELLED", now, { decidedAt: now, decidedBy: actor.userId, decisionNotes: notes!.trim() });
  });
}

/** Staff (payment and delivery states) and the sponsor (cancel before paying). */
export async function transitionMarketplaceOrder(actor: Actor, id: string, to: MarketplaceOrderState, now = new Date()) {
  if (to === "APPROVED") throw new MarketplaceOrderError("An order is approved by BTG's decision (or by policy), never by a transition.");
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope === "own-sponsor" && to !== "CANCELLED") throw new ForbiddenError("marketplaceOrder", "write");
  return prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "write"), id }, select: SELECT });
    if (!order) throw new ForbiddenError("marketplaceOrder", "write");
    return moveIn(tx, actor, order, to, now, {});
  });
}

async function moveIn(tx: Prisma.TransactionClient, actor: Actor, order: Row, to: MarketplaceOrderState, now: Date, extra: Prisma.MarketplaceOrderUpdateInput) {
  const from = order.state as MarketplaceOrderState;
  if (!canTransitionMarketplaceOrder(from, to)) throw new IllegalMarketplaceOrderTransitionError(from, to);
  const updated = await tx.marketplaceOrder.update({
    /* tenant-scope: the row loaded by the caller through whereFor(marketplaceOrder, …). */
    where: { id: order.id }, data: { state: to, ...extra }, select: SELECT,
  });
  if (RELEASES.has(to)) {
    await tx.inventoryCommitment.updateMany({
      /* tenant-scope: the commitments this order wrote, named by its id (unique). */
      where: orderHolds(order.id), data: { releasedAt: now },
    });
    /* 2S5-BE-02 — a contracted order's books are reversed, never deleted. */
    if (order.contractedAt) await reverseOrder(tx, order.id);
  }
  /* 2S5-BE-02 — payment makes the payables available; closing releases the reserve. */
  if (to === "PAID") await markOrderPaid(tx, order.id);
  if (to === "CLOSED") await releaseReserve(tx, order.id);
  await audit(tx, actor, `marketplaceOrder.${to.toLowerCase()}` as `${string}.${string}`, "MarketplaceOrder", order.id, { before: { state: from }, after: { state: to } });
  /* Zoho follows the order once it has been contracted (its Deal exists from approval on). */
  if (order.contractedAt) await enqueue(tx, actor.tenantId, "zoho.pushMarketplaceOrder", { orderId: order.id });
  return updated;
}
