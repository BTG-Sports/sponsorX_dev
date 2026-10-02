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
 * THE GATE (2S4-BE-09, replacing 2S4-BE-05's fixed $1,000 and first-order
 * holds). Each sponsor has a SPENDING LIMIT, replayed from their own orders
 * (spending-limit.ts): $5,000 to start, then twice their largest completed
 * order, up to $25,000; a refund or an upheld delivery problem stops it
 * rising. An order within it is approved by policy in the same transaction,
 * as "system" — their first order too. Above it, it waits for BTG in
 * PENDING_APPROVAL ("$12,000.00 is above Harbor Apparel's limit of
 * $5,000.00"), holding its stock, and BTG's admins are emailed a link to
 * it; BTG approves (the stock is contracted) or rejects (CANCELLED, the
 * stock released).
 *
 * THE SELLER'S STEP. A listing that asks for approval
 * (`packageRules.requiresApproval`) asks its SELLER, not BTG: the order
 * waits in PENDING_SELLER while each seller asked (the team's manager, or
 * the independent athlete / their guardian) accepts or declines within 48
 * hours (order-approval.ts); silence declines. An order that is both above
 * the limit and asks its seller goes to the seller FIRST, then to BTG: the
 * seller's answer is the one that can end it outright, and there is no
 * point in BTG reviewing an order the seller would not take.
 *
 * PAYMENT (2S4-BE-10). Approval moves it straight on to AWAITING_PAYMENT —
 * the payment window opens (3 days: reminders after 1 and 2, cancelled at 3,
 * order-payment.ts) and the sponsor is emailed the deadline. It is PAID by
 * the card provider's confirmation, by Zoho Books marking its invoice paid,
 * or by BTG recording a payment made another way (method, reference, date
 * received) — all three through `payOrderIn`, the same move and the same
 * emails.
 *
 * THE CONTRACT GATE (2S4-FE-02). An order is placed only with the sponsor's
 * acceptance of the tenant's MARKETPLACE_ORDER terms and the billing contact
 * they confirmed. Both are refused with 422 when missing. The terms are
 * re-read and re-hashed on the server inside the order's transaction
 * (order-terms.ts): a version issued since checkout loaded, a file edited
 * after issue, or a hash that is not the stored one is refused (409,
 * AgreementTextChangedError) — the acceptance is recorded only for words the
 * sponsor was actually shown. The acceptance (acceptAgreementIn: who, when,
 * the hash, IP and agent) and the billing snapshot are written in the same
 * transaction as the order and audited with it. placeOrder is the only
 * writer of a MarketplaceOrder, so there is no second way round the gate.
 *
 * THE MACHINE. Every state change goes through `moveIn` and the table in
 * marketplace-order-rules.ts. APPROVED is reachable only through the
 * decision (or policy), never through a transition. The figures are
 * Postgres's to keep from placement on.
 *
 * CONCURRENCY (the 2S4-BE-09/-10 review). A cancel and a payment can race
 * for one order — the unpaid sweep, a Zoho ingest, BTG marking it paid, the
 * card provider. Two rules keep one of them from overwriting the other:
 *   - every move is CLAIMED: `moveIn` (and `contract`) update only where
 *     the state is still the one read (`updateMany where {id, state:
 *     from}`); a count of 0 is OrderStateConflictError (409) and nothing
 *     else is written — the audit, the stock, the books and Zoho follow only
 *     a successful claim;
 *   - every decision that reads before it moves takes the order's row lock
 *     first (`lockOrder`, SELECT … FOR UPDATE), so the checks it makes (is
 *     a payment in progress? is every seller's answer in?) are made on the
 *     state the move will be made from. Lock order: the order row first,
 *     then its attempts, approvals and lines.
 *
 * THE LINES (2S4-BE-06 / -07). Contracting opens a delivery row per line and
 * tells each seller of the sale (delivery.ts `openDeliveries`); every move
 * then takes the lines with it (`followOrder`) — paid opens delivery,
 * cancelling or refunding ends it, and BTG fulfilling by hand confirms what
 * is left, never over a problem a sponsor reported.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { unitsTaken } from "./availability";
import { convertReservation, lockItems } from "./reservation";
import { acceptAgreementIn, AgreementTextChangedError } from "./agreement";
import { currentOrderTerms } from "./order-terms";
import { bookOrder, markOrderPaid, releaseReserve, reverseOrder } from "./ledger";
import { followOrder, openDeliveries } from "./delivery";
import { sponsorLimit } from "./spending-limit";
import { approvalsForOrders, openSellerApprovals } from "./order-approval";
import { tellBtgHeld, tellSponsorApproved, tellSponsorPaid } from "./order-mail";
import {
  approvalReasons,
  billingProblems,
  canTransitionMarketplaceOrder,
  feeFor,
  IllegalMarketplaceOrderTransitionError,
  manualPaymentProblems,
  PAYMENT_WINDOW_DAYS,
  RELEASES,
  type BillingContact,
  type CancelReason,
  type ManualPayment,
  type MarketplaceOrderState,
  type PaymentMethod,
} from "./marketplace-order-rules";

export class MarketplaceOrderError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "MarketplaceOrderError";
    this.status = status;
  }
}

/** The order moved on while this request was deciding — its move was not made (409). */
export class OrderStateConflictError extends MarketplaceOrderError {
  readonly from: MarketplaceOrderState;
  readonly to: MarketplaceOrderState;
  readonly current: MarketplaceOrderState | null;
  constructor(from: MarketplaceOrderState, to: MarketplaceOrderState, current: MarketplaceOrderState | null) {
    super(`This order changed while that was being done: it was ${from} and is now ${current ?? "gone"}, so it was not moved to ${to}. Reload it and try again.`);
    this.name = "OrderStateConflictError";
    this.from = from;
    this.to = to;
    this.current = current;
  }
}

/**
 * Hold the order's row until the transaction ends (SELECT … FOR UPDATE) and
 * read its state as it is now — committed moves included. Every path that
 * checks something about an order before moving it takes this first, so a
 * concurrent move waits rather than slipping in between. Taking it twice in
 * one transaction is free. Null if there is no such order.
 */
export async function lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<MarketplaceOrderState | null> {
  const rows = await tx.$queryRaw<Array<{ state: MarketplaceOrderState }>>`SELECT state::text AS state FROM "MarketplaceOrder" WHERE id = ${orderId} FOR UPDATE`;
  return rows[0]?.state ?? null;
}

/** The caller's order, locked, and read after the lock: `where` is the caller's whereFor(marketplaceOrder, …) filter. */
async function lockedOrder(tx: Prisma.TransactionClient, where: Prisma.MarketplaceOrderWhereInput) {
  const found = await tx.marketplaceOrder.findFirst({
    /* tenant-scope: `where` is the caller's whereFor(marketplaceOrder, …) filter, with the id. */
    where, select: { id: true },
  });
  if (!found) return null;
  await lockOrder(tx, found.id);
  return tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the row just found through the caller's whereFor filter, re-read under its lock. */
    where: { id: found.id }, select: SELECT,
  });
}

/** Claim a move: update only while the order is still `from`. 0 rows → OrderStateConflictError, nothing written. */
async function claim(tx: Prisma.TransactionClient, orderId: string, from: MarketplaceOrderState, to: MarketplaceOrderState, data: Prisma.MarketplaceOrderUpdateManyMutationInput) {
  const claimed = await tx.marketplaceOrder.updateMany({
    /* tenant-scope: the row loaded by the caller through whereFor(marketplaceOrder, …); conditional on the state it was read in. */
    where: { id: orderId, state: from }, data: { ...data, state: to },
  });
  if (claimed.count === 1) {
    return tx.marketplaceOrder.findUniqueOrThrow({
      /* tenant-scope: the row just claimed by id. */
      where: { id: orderId }, select: SELECT,
    });
  }
  const now = await tx.marketplaceOrder.findUnique({
    /* tenant-scope: the row the caller loaded, re-read to say what it became. */
    where: { id: orderId }, select: { state: true },
  });
  throw new OrderStateConflictError(from, to, (now?.state as MarketplaceOrderState | undefined) ?? null);
}

const SELECT = {
  id: true, tenantId: true, sponsorId: true, reservationId: true, state: true, currency: true, subtotalCents: true, feesCents: true,
  totalCents: true, requiresApproval: true, approvalReasons: true, decidedAt: true, decidedBy: true, decisionNotes: true,
  contractedAt: true, fulfilledAt: true, createdAt: true, createdBy: true,
  /* 2S4-FE-02 — the contract gate's record: the billing snapshot and the acceptance. */
  billingName: true, billingEmail: true, billingReference: true, acceptanceId: true,
  acceptance: { select: { acceptedAt: true, userId: true, bodyHash: true, user: { select: { email: true } }, agreement: { select: { kind: true, version: true } } } },
  /* 2S4-BE-09 — the limit it was checked against, and why it ended if it was cancelled. */
  spendingLimitCents: true, cancelReason: true,
  /* 2S4-BE-10 — the payment window, and how it was paid. */
  awaitingPaymentAt: true, paymentDueAt: true, paymentRemindersSent: true,
  paidAt: true, paidVia: true, paymentReference: true, paymentReceivedOn: true, refundedAt: true,
  lines: {
    select: { id: true, listingId: true, inventoryItemId: true, propertyId: true, sellerAthleteId: true, title: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true, lineTotalCents: true },
    orderBy: { startsOn: "asc" },
  },
} as const;

type Row = Prisma.MarketplaceOrderGetPayload<{ select: typeof SELECT }>;
const SYSTEM = "system";
const DAY = 86_400_000;
const systemIn = (tenantId: string): AuditActor & { tenantId: string } => ({ userId: null, tenantId });

/**
 * What the order is waiting on, and by when — for the sponsor's and BTG's
 * screens. SELLER: the sellers asked have until `deadlineAt` (the earliest
 * still open). BTG: no deadline. PAYMENT: paid by `deadlineAt`, or it is
 * cancelled. Nothing once it is paid or has ended.
 */
function waitingOn(row: Row, approvals: Array<{ state: string; dueAt: Date }>) {
  if (row.state === "PENDING_SELLER") {
    const open = approvals.filter((a) => a.state === "PENDING").map((a) => a.dueAt.getTime());
    return { waitingOn: "SELLER" as const, deadlineAt: open.length ? new Date(Math.min(...open)) : null };
  }
  if (row.state === "PENDING_APPROVAL") return { waitingOn: "BTG" as const, deadlineAt: null };
  if (row.state === "APPROVED" || row.state === "AWAITING_PAYMENT") return { waitingOn: "PAYMENT" as const, deadlineAt: row.paymentDueAt };
  return { waitingOn: null, deadlineAt: null };
}

/** The order as the sponsor's and BTG's screens read it: the row, the sellers' answers, and what it is waiting on. */
async function views(rows: Row[]) {
  const [approvals, sellers] = await Promise.all([approvalsForOrders(rows.map((r) => r.id)), lineSellers(rows)]);
  return rows.map((r) => {
    const mine = approvals.get(r.id) ?? [];
    return { ...r, lines: r.lines.map((l) => ({ ...l, seller: sellers(l) })), sellerApprovals: mine, ...waitingOn(r, mine) };
  });
}

/**
 * 2S3-FE-03 — who sells each line, as the sponsor's and BTG's screens name
 * it: the team, or the independent athlete (2S3-BE-05: such a line has no
 * property). The athlete's display name — the name the shop showed.
 */
async function lineSellers(rows: Row[]) {
  const lines = rows.flatMap((r) => r.lines);
  const ids = (f: (l: Row["lines"][number]) => string | null) => [...new Set(lines.map(f).filter((x): x is string => Boolean(x)))];
  const [teams, athletes] = await Promise.all([
    prisma.property.findMany({
      /* tenant-scope: the teams named on order lines the caller loaded through whereFor(marketplaceOrder). */
      where: { id: { in: ids((l) => l.propertyId) } }, select: { id: true, name: true },
    }),
    prisma.athlete.findMany({
      /* tenant-scope: the independent sellers named on order lines the caller loaded through whereFor(marketplaceOrder). */
      where: { id: { in: ids((l) => (l.propertyId ? null : l.sellerAthleteId)) } }, select: { id: true, displayName: true },
    }),
  ]);
  const team = new Map(teams.map((t) => [t.id, t.name]));
  const athlete = new Map(athletes.map((a) => [a.id, a.displayName]));
  return (l: Row["lines"][number]) =>
    l.propertyId
      ? { type: "PROPERTY" as const, id: l.propertyId, name: team.get(l.propertyId) ?? "Team" }
      : l.sellerAthleteId
        ? { type: "ATHLETE" as const, id: l.sellerAthleteId, name: athlete.get(l.sellerAthleteId) ?? "Athlete" }
        : null;
}
const viewOf = async (row: Row) => (await views([row]))[0]!;

export async function listMarketplaceOrders(actor: Actor, state?: MarketplaceOrderState) {
  const rows = await prisma.marketplaceOrder.findMany({
    where: { ...whereFor(actor, "marketplaceOrder", "read"), ...(state ? { state } : {}) },
    select: SELECT, orderBy: { createdAt: "asc" },
  });
  return views(rows);
}

export async function getMarketplaceOrder(actor: Actor, id: string) {
  const row = await prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("marketplaceOrder", "read");
  return viewOf(row);
}

/** The order's stock: every commitment it wrote. */
const orderHolds = (orderId: string) => ({ source: "ORDER", sourceId: { startsWith: `${orderId}:` }, releasedAt: null });

/**
 * Contract the order's stock — only ever from an approval (BTG's, or
 * policy's) — and open the payment window: APPROVED → AWAITING_PAYMENT in
 * the same transaction (2S4-BE-10), the sponsor emailed the deadline.
 */
async function contract(tx: Prisma.TransactionClient, order: Row, by: string, now: Date, notes: string | null, auditor: { userId: string | null; tenantId: string }) {
  /* Claimed first, on the state it was read in — nothing is contracted for an order that moved meanwhile. */
  const approved = await claim(tx, order.id, order.state as MarketplaceOrderState, "APPROVED", { decidedAt: now, decidedBy: by, decisionNotes: notes, contractedAt: now });
  await tx.inventoryCommitment.updateMany({
    /* tenant-scope: the commitments this order wrote, named by its id (unique); the order was loaded through the caller's scope. */
    where: orderHolds(order.id), data: { contracted: true },
  });
  /* 2S4-BE-04 / 2S5-BE-02 — contract time: the breakdown frozen, the ledger booked, in this transaction. */
  await bookOrder(tx, order.id, now);
  /* 2S4-BE-06 — the sold lines, as their sellers will read them; each seller emailed. */
  await openDeliveries(tx, order.id);
  await audit(tx, auditor, "marketplaceOrder.approve", "MarketplaceOrder", order.id, {
    before: { state: order.state }, after: { state: "APPROVED", decidedBy: by, contracted: true, totalCents: order.totalCents },
  });
  /* 2S4-BE-10 — straight on to payment. The move queues the Zoho push
     (2S7-INT-01: the contracted order becomes a Deal). */
  const awaiting = await moveIn(tx, auditor, approved, "AWAITING_PAYMENT", now, {});
  await tellSponsorApproved(tx, awaiting, by !== SYSTEM ? "BTG" : order.state === "PENDING_SELLER" ? "SELLER" : "AUTOMATIC");
  return awaiting;
}

export type PlaceOrderRequest = {
  reservationId: string;
  /** The MARKETPLACE_ORDER agreement checkout showed, and the hash of its text as rendered. */
  agreementId?: string;
  bodyHashShown?: string;
  /** The billing contact the sponsor confirmed. */
  billing?: BillingContact;
  /** §12 evidence — from the request, never the body. */
  ip: string;
  userAgent: string;
};

/** A sponsor places the order its live hold describes — only through the contract gate. */
export async function placeOrder(actor: Actor, request: PlaceOrderRequest, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("marketplaceOrder", "write");
  const { reservationId } = request;
  if (!request.agreementId || !request.bodyHashShown) {
    throw new MarketplaceOrderError("Accept the order terms before placing the order — an order needs the terms shown and their acceptance.", 422);
  }
  const missing = billingProblems(request.billing);
  if (missing.length) throw new MarketplaceOrderError(`Confirm the billing details before placing the order: ${missing.join("; ")}.`, 422);
  const billing = request.billing!;
  const placed = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { ...whereFor(actor, "reservation", "write"), id: reservationId },
      select: { id: true, cartId: true, state: true, expiresAt: true },
    });
    if (!reservation) throw new ForbiddenError("reservation", "write");
    if (reservation.state !== "HELD" || reservation.expiresAt <= now) {
      throw new MarketplaceOrderError(`A reservation that is ${reservation.state === "HELD" ? "EXPIRED" : reservation.state} cannot become an order. Reserve again.`);
    }
    /* The gate: the terms in force NOW, re-hashed from the file on the server.
       Not the current version (or no servable text) → the sponsor saw
       something else, or nothing; acceptAgreementIn then refuses a hash that
       is not the stored one. Per order, not once per signer. */
    const terms = await currentOrderTerms(tx, actor.tenantId, now);
    if (!terms) throw new MarketplaceOrderError("The order terms are not available right now, so the order cannot be placed. BTG has been asked to publish them — try again later.", 409);
    if (terms.id !== request.agreementId) throw new AgreementTextChangedError();
    const acceptance = await acceptAgreementIn(tx, actor, {
      agreementId: terms.id, bodyHashShown: request.bodyHashShown!, ip: request.ip, userAgent: request.userAgent,
    }, { oncePerSigner: false });
    const lines = await tx.cartLine.findMany({
      where: { tenantId: actor.tenantId, cartId: reservation.cartId },
      select: {
        id: true, listingId: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true,
        listing: { select: { title: true, tenantId: true, propertyId: true, sellerAthleteId: true, inventoryItemId: true, item: { select: { packageRules: true, components: { select: { componentItemId: true } } } } } },
      },
    });
    await lockItems(tx, lines.flatMap((l) => [l.listing.inventoryItemId, ...l.listing.item.components.map((c) => c.componentItemId)]));

    const subtotalCents = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const feesCents = feeFor(subtotalCents, env.MARKETPLACE_BUYER_FEE_BPS);
    const totalCents = subtotalCents + feesCents;
    /* 2S4-BE-09 — the sponsor's spending limit, replayed from their own orders. */
    const sponsor = await tx.sponsor.findFirst({ where: { tenantId: actor.tenantId, id: actor.sponsorId! }, select: { name: true } });
    const limit = await sponsorLimit(tx, actor.tenantId, actor.sponsorId!);
    const reasons = approvalReasons({ totalCents, limitCents: limit.limitCents, sponsorName: sponsor?.name ?? "the sponsor" });
    /* A listing that asks for approval asks its seller (2S4-BE-09). */
    const asking = new Set(lines.filter((l) => (l.listing.item.packageRules as { requiresApproval?: boolean } | null)?.requiresApproval).map((l) => l.listingId));

    const order = await tx.marketplaceOrder.create({
      data: {
        tenantId: actor.tenantId, sponsorId: actor.sponsorId!, reservationId: reservation.id, currency: "USD",
        state: asking.size ? "PENDING_SELLER" : "PENDING_APPROVAL",
        subtotalCents, feesCents, totalCents, requiresApproval: reasons.length > 0, approvalReasons: reasons, createdBy: actor.userId,
        spendingLimitCents: limit.limitCents,
        acceptanceId: acceptance.acceptanceId,
        billingName: billing.name.trim(), billingEmail: billing.email.trim(), billingReference: billing.reference?.trim() || null,
        lines: {
          create: lines.map((l) => ({
            tenantId: actor.tenantId, listingId: l.listingId, inventoryItemId: l.listing.inventoryItemId, itemTenantId: l.listing.tenantId,
            propertyId: l.listing.propertyId, sellerAthleteId: l.listing.sellerAthleteId, title: l.listing.title, quantity: l.quantity, startsOn: l.startsOn, endsOn: l.endsOn,
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
      after: {
        reservationId: reservation.id, totalCents, requiresApproval: reasons.length > 0, reasons, state: order.state,
        /* 2S4-BE-09 — the limit it was checked against, and which listings ask their seller. */
        spendingLimitCents: limit.limitCents, sellerAsks: lines.filter((l) => asking.has(l.listingId)).map((l) => l.listing.title),
        /* 2S4-FE-02 — which terms, accepted when, under which acceptance. The
           signer is this entry's actor; the billing contact is on the order
           row itself, fixed (marketplace_order_immutable.sql). */
        acceptanceId: acceptance.acceptanceId, acceptedAt: acceptance.acceptedAt.toISOString(),
        terms: { kind: terms.kind, version: terms.version, bodyHash: terms.bodyHash },
      },
    });

    /* The seller first (2S4-BE-09): each seller asked has 48 hours. */
    if (asking.size) {
      await openSellerApprovals(tx, order, asking, now);
      return order;
    }
    /* Above the limit: BTG decides, and its admins are told. */
    if (reasons.length) {
      await tellBtgHeld(tx, order);
      return order;
    }
    /* Within the limit: recorded as the system's decision, not the sponsor's. */
    return contract(tx, order, SYSTEM, now, "Approved automatically: within the sponsor's spending limit.", systemIn(actor.tenantId));
  });
  return viewOf(placed);
}

/**
 * 2S4-BE-09 — every seller asked accepted (order-approval.ts, inside the
 * last answer's transaction). Above the limit, it now waits for BTG; within
 * it, policy approves it and the payment window opens.
 */
export async function afterSellersAccepted(tx: Prisma.TransactionClient, orderId: string, now = new Date()) {
  await lockOrder(tx, orderId);
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order named by the seller's approval row, which the seller loaded through whereFor(orderSellerApproval, write). */
    where: { id: orderId }, select: SELECT,
  });
  if (order.state !== "PENDING_SELLER") return order;
  if (order.requiresApproval) {
    const held = await moveIn(tx, systemIn(order.tenantId), order, "PENDING_APPROVAL", now, {});
    await tellBtgHeld(tx, held);
    return held;
  }
  return contract(tx, order, SYSTEM, now, "Approved automatically: the seller accepted, and it is within the sponsor's spending limit.", systemIn(order.tenantId));
}

/** An order the system ends — a seller declined or never answered (2S4-BE-09), or it went unpaid (2S4-BE-10). */
export async function cancelOrderAsSystem(tx: Prisma.TransactionClient, orderId: string, reason: CancelReason, now = new Date()) {
  await lockOrder(tx, orderId);
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the system's own sweep (or a seller's answer, loaded through its scope) names. */
    where: { id: orderId }, select: SELECT,
  });
  return moveIn(tx, systemIn(order.tenantId), order, "CANCELLED", now, { cancelReason: reason });
}

/** BTG's decision on an order policy held for approval. */
export async function decideMarketplaceOrder(actor: Actor, id: string, decision: "APPROVE" | "REJECT", notes?: string | null, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "approve");
  if (scope !== "any" && scope !== "own-tenant") throw new ForbiddenError("marketplaceOrder", "approve");
  if (decision === "REJECT" && !notes?.trim()) throw new MarketplaceOrderError("REJECT needs a note — the sponsor is told why.", 422);
  const row = await prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, { ...whereFor(actor, "marketplaceOrder", "approve"), id });
    if (!order) throw new ForbiddenError("marketplaceOrder", "approve");
    if (order.state === "PENDING_SELLER") throw new MarketplaceOrderError("This order is waiting for the seller's answer first — BTG decides once the seller has accepted.");
    const to = decision === "APPROVE" ? "APPROVED" : "CANCELLED";
    if (order.state !== "PENDING_APPROVAL") throw new IllegalMarketplaceOrderTransitionError(order.state as MarketplaceOrderState, to);
    if (decision === "APPROVE") return contract(tx, order, actor.userId, now, notes?.trim() || null, actor);
    return moveIn(tx, actor, order, "CANCELLED", now, { decidedAt: now, decidedBy: actor.userId, decisionNotes: notes!.trim(), cancelReason: "BTG_REJECTED" });
  });
  return viewOf(row);
}

/** Who may record a payment made another way (2S4-BE-10): BTG admin and Finance only. */
const RECORDS_PAYMENT = new Set(["BTG_ADMIN", "FINANCE"]);

/**
 * Staff (payment and delivery states) and the sponsor (cancel before paying).
 *
 * PAID by hand is BTG's fallback for a payment made another way (2S4-BE-10):
 * BTG admin or Finance only, with how it was paid, the payment reference and
 * the date it was received — recorded on the order, audited, and the sponsor
 * and sellers told exactly as for a card payment. Refused while a card
 * payment is being confirmed.
 */
export async function transitionMarketplaceOrder(actor: Actor, id: string, to: MarketplaceOrderState, payment?: Partial<ManualPayment> | null, now = new Date()) {
  if (to === "APPROVED") throw new MarketplaceOrderError("An order is approved by BTG's decision (or by policy), never by a transition.");
  if (to === "PENDING_APPROVAL" || to === "PENDING_SELLER") throw new MarketplaceOrderError("An order is held for approval by policy, never by a transition.");
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope === "own-sponsor" && to !== "CANCELLED") throw new ForbiddenError("marketplaceOrder", "write");
  if (to === "PAID") {
    if (!actor.roles.some((r) => RECORDS_PAYMENT.has(r))) throw new ForbiddenError("marketplaceOrder", "write");
    const problems = manualPaymentProblems(payment, now);
    if (problems.length) throw new MarketplaceOrderError(`To mark it paid, give ${problems.join("; ")}.`, 422);
  }
  const row = await prisma.$transaction(async (tx) => {
    /* Locked first: the card check below and the move are made on the same state. */
    const order = await lockedOrder(tx, { ...whereFor(actor, "marketplaceOrder", "write"), id });
    if (!order) throw new ForbiddenError("marketplaceOrder", "write");
    if (to === "PAID" || to === "CANCELLED") {
      /* A card payment the provider is confirming may already have taken the
         money: neither a second payment nor a cancel until it answers (the
         unpaid sweep defers the same way). */
      const confirming = await tx.paymentAttempt.findFirst({
        /* tenant-scope: this order's own attempts, named by its id; the order was loaded through whereFor. */
        where: { orderId: order.id, state: "PROCESSING" }, select: { id: true },
      });
      if (confirming) {
        throw new MarketplaceOrderError(to === "PAID"
          ? "A card payment for this order is being confirmed by the payment provider — wait for it before recording another payment."
          : "A card payment for this order is being confirmed by the payment provider — wait for it before cancelling the order.");
      }
    }
    if (to === "PAID") {
      const p = payment as ManualPayment;
      return payOrderIn(tx, actor, order.id, { via: p.method, reference: p.reference.trim(), receivedOn: p.receivedOn, recordedBy: actor.userId }, now);
    }
    return moveIn(tx, actor, order, to, now, to === "CANCELLED" ? { cancelReason: scope === "own-sponsor" ? "SPONSOR" : "BTG" } : {});
  });
  return viewOf(row);
}

export type OrderPayment = {
  via: PaymentMethod;
  reference?: string | null;
  /** YYYY-MM-DD — the day the money arrived. */
  receivedOn?: string | null;
  /** The BTG user who recorded it (manual methods). */
  recordedBy?: string | null;
  /** Which card attempt, or which Zoho invoice, it was. */
  attemptId?: string;
  zohoInvoiceId?: string;
  invoiceNumber?: string | null;
  /** Who to send the receipt to (the sponsor user who paid by card). */
  receiptTo?: string | null;
};

/**
 * 2S4-BE-10 — the order is paid, however the money came: the card
 * provider's confirmation (payouts.ts `confirmPayment`), Zoho Books marking
 * its invoice paid (order-payment.ts), or BTG recording it by hand. One
 * path: AWAITING_PAYMENT → PAID through the machine (the ledger's payables
 * made available, every line into delivery and each seller emailed), the
 * payment recorded on the order and audited, and the sponsor's receipt.
 */
export async function payOrderIn(tx: Prisma.TransactionClient, actor: AuditActor & { tenantId: string }, orderId: string, p: OrderPayment, now = new Date()) {
  await lockOrder(tx, orderId);
  let order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the caller loaded through its own scope (or named by the provider's, or Zoho's, record of it). */
    where: { id: orderId }, select: SELECT,
  });
  /* An order approved before 2S4-BE-10 may still be APPROVED: the window opens on the way. */
  if (order.state === "APPROVED") order = await moveIn(tx, actor, order, "AWAITING_PAYMENT", now, {});
  const paid = await moveIn(tx, actor, order, "PAID", now, {
    paidVia: p.via, paymentReference: p.reference ?? null, paymentReceivedOn: p.receivedOn ? new Date(`${p.receivedOn}T00:00:00.000Z`) : null,
    paymentRecordedBy: p.recordedBy ?? null,
  });
  await audit(tx, actor, "marketplaceOrder.paymentRecorded", "MarketplaceOrder", order.id, {
    after: {
      via: p.via, reference: p.reference ?? null, receivedOn: p.receivedOn ?? null, amountCents: order.totalCents,
      ...(p.attemptId ? { attemptId: p.attemptId } : {}), ...(p.zohoInvoiceId ? { zohoInvoiceId: p.zohoInvoiceId, invoiceNumber: p.invoiceNumber ?? null } : {}),
    },
  });
  await tellSponsorPaid(tx, paid, { via: p.via, reference: p.reference, receivedOn: p.receivedOn, invoiceNumber: p.invoiceNumber }, p.receiptTo);
  return paid;
}

/**
 * An order move made by the system on the payment provider's word — the
 * provider confirming a card payment (2S5-INT-02) — rather than by a person.
 * Audited with no actor, in the order's own books.
 */
export async function moveOrderAsSystem(tx: Prisma.TransactionClient, orderId: string, to: MarketplaceOrderState, now = new Date()) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the provider's confirmation names, loaded by the caller from its own payment attempt. */
    where: { id: orderId }, select: SELECT,
  });
  return moveIn(tx, systemIn(order.tenantId), order, to, now, {});
}

/**
 * 2S4-BE-07 — an order move made inside another domain's transaction on a
 * person's word (BTG refunding the last line a sponsor reported a problem
 * with). The caller has already loaded the order's line through its own scope.
 */
export async function moveOrderIn(tx: Prisma.TransactionClient, actor: AuditActor & { tenantId: string }, orderId: string, to: MarketplaceOrderState, now = new Date()) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order of a delivery row the caller loaded through whereFor(orderDelivery, approve). */
    where: { id: orderId }, select: SELECT,
  });
  return moveIn(tx, actor, order, to, now, {});
}

async function moveIn(tx: Prisma.TransactionClient, actor: AuditActor & { tenantId: string }, order: Row, to: MarketplaceOrderState, now: Date, extra: Prisma.MarketplaceOrderUpdateManyMutationInput) {
  const from = order.state as MarketplaceOrderState;
  if (!canTransitionMarketplaceOrder(from, to)) throw new IllegalMarketplaceOrderTransitionError(from, to);
  /* Claimed on the state it was read in (see CONCURRENCY above): an order
     that moved meanwhile is a conflict, and none of what follows happens. */
  const updated = await claim(tx, order.id, from, to, {
    /* 2S5-BE-04 — the payout holding period runs from fulfilment. */
    ...(to === "FULFILLED" ? { fulfilledAt: now } : {}),
    /* 2S4-BE-10 — the payment window opens: reminders after 1 and 2 days, cancelled at 3. */
    ...(to === "AWAITING_PAYMENT" ? { awaitingPaymentAt: now, paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_DAYS * DAY), paymentRemindersSent: 0 } : {}),
    ...(to === "PAID" ? { paidAt: now } : {}),
    /* 2S4-BE-09 — a refund stops the sponsor's limit rising, from this moment. */
    ...(to === "REFUNDED" ? { refundedAt: now } : {}),
    ...extra,
  });
  /* 2S4-BE-09 — an order that ends while its sellers are still asked closes their questions. */
  if (from === "PENDING_SELLER" && RELEASES.has(to)) {
    await tx.orderSellerApproval.updateMany({
      /* tenant-scope: this order's own approval rows, named by its id. */
      where: { orderId: order.id, state: "PENDING" }, data: { state: "CLOSED" },
    });
  }
  /* 2S4-BE-06 / -07 — the order's lines follow it (and FULFILLED is refused over a reported problem). */
  await followOrder(tx, actor, order.id, to, now);
  if (RELEASES.has(to)) {
    /* 2S5-BE-05 — a payout in progress claims this order's money: it is sent
       back (or fails) before the order can be cancelled or refunded. */
    const claimed = await tx.payoutLine.findFirst({
      /* tenant-scope: payout lines naming this order, loaded by the caller through its own scope. */
      where: { orderId: order.id, payout: { state: { in: ["REQUESTED", "APPROVED", "SENDING"] } } }, select: { id: true },
    });
    if (claimed) throw new MarketplaceOrderError("A payout covering this order is in progress — it has to be sent back or finish before the order can be cancelled or refunded.");
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
  await audit(tx, actor, `marketplaceOrder.${to.toLowerCase()}` as `${string}.${string}`, "MarketplaceOrder", order.id, {
    before: { state: from }, after: { state: to, ...("cancelReason" in extra ? { cancelReason: extra.cancelReason } : {}) },
  });
  /* Zoho follows the order once it has been contracted (its Deal exists from approval on). */
  if (updated.contractedAt) await enqueue(tx, actor.tenantId, "zoho.pushMarketplaceOrder", { orderId: order.id });
  return updated;
}
