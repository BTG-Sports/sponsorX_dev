/**
 * Refunds and disputes — 2S5-BE-03.
 *
 * "Exceptions have to exist from day one, because they block payouts. An
 * open dispute freezes the associated funds." Done when: "A refund or dispute
 * correctly reverses ledger entries and blocks the related payout."
 *
 * REFUNDS. A refund SponsorX makes (a cancellation, a problem, BTG's refund)
 * already reverses the order's books in its own transaction
 * (marketplace-order.ts, delivery.ts → ledger.ts `reverseOrder`), records the
 * money owed back (refunds.ts) and is refused while a payout covering the
 * order is in progress. What arrives here is the provider's `payment.refunded`:
 *   - it CONFIRMS a refund SponsorX sent (its reference is a RefundDue's);
 *   - or it is a refund made AT the provider. The whole payment, on an order
 *     that can be refunded, with no dispute: the order is refunded in SponsorX
 *     automatically — books reversed, stock released, a RefundDue written
 *     already SENT with the provider's reference (never refunded twice) —
 *     after the payouts not yet sent that cover it are sent back as the
 *     system (their money went back to the sponsor). Anything else (a part
 *     refund SponsorX can't place on a line, a payout already being sent, an
 *     order closed or under dispute) is HELD for BTG, and while it is held the
 *     order's payouts wait. BTG refunding the matching amount in SponsorX
 *     takes it (refunds.ts), or BTG closes the event without (DISMISSED).
 *   Either way the payment's `refundedCents` is the provider's word, never
 *   more than it captured.
 *
 * DISPUTES (state machines §7). `dispute.opened` records an OPEN dispute and
 * gives BTG support the review item — the support mailbox and BTG's admins
 * are emailed, and it is on BTG's list (GET /disputes). From then on the
 * order's money is FROZEN: a payout covering it is neither approved nor sent,
 * none of it can be requested (payouts.ts), and the order can't be refunded.
 * A dispute is NEVER resolved by the system. `dispute.closed` records the
 * provider's outcome and tells BTG; a BTG admin then resolves it to that
 * outcome, after review (OPEN → UNDER_REVIEW → WON | LOST):
 *   - WON: the money unfreezes; an approved payout waiting on it is sent.
 *   - LOST: the bank took the money back, so the books are reversed — the
 *     whole order, or the lines BTG names for a part dispute — exactly as a
 *     refund reverses them (ledger design §4, REVERSAL), payouts not yet sent
 *     are sent back as the system, and money already paid out is owed back:
 *     recorded on the dispute (`owedBackCents`) and shown to the payee as GET
 *     /payouts/me counts it. No RefundDue: the bank already returned it.
 *
 * Every write is audited; the system's as the system (actor null).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { send } from "../lib/email";
import { reverseOrder } from "./ledger";
import { lockOrder, moveOrderIn } from "./marketplace-order";
import { refuseCardNumber } from "./marketplace-order-rules";
import { appUrl, btgAdmins, orderRef, tell, usd } from "./order-mail";
import { resumePayoutsCovering, sendBackPayoutsCovering } from "./payouts";
import { applied, deferred, findAttempt, held, ignored, type EventRow, type Handler } from "./payment-events";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class PaymentExceptionError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "PaymentExceptionError";
    this.status = status;
  }
}

export const DISPUTE_STATES = ["OPEN", "UNDER_REVIEW", "WON", "LOST"] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];
/** A dispute that freezes its order's money. */
export const OPEN_DISPUTE: readonly DisputeState[] = ["OPEN", "UNDER_REVIEW"];

const CONFIRMED = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);
const REFUNDABLE = new Set(["PAID", "IN_DELIVERY", "FULFILLED"]);
const system = (tenantId: string): AuditActor & { tenantId: string } => ({ userId: null, tenantId });

/* ── the freeze ───────────────────────────────────────────────────────── */

/**
 * Why each of these orders' money may not move now, in BTG's words: a
 * dispute open on it, or a refund the provider reported that BTG is holding.
 * Empty for an order that is clear. Read by payouts.ts before a payout is
 * requested, approved or sent.
 */
export async function moneyHoldsOn(db: Db, orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!orderIds.length) return out;
  const [disputes, refunds] = await Promise.all([
    db.paymentDispute.findMany({
      /* tenant-scope: the disputes of orders the caller loaded through its own scope (or the payee's own ledger), by order id. */
      where: { orderId: { in: orderIds }, state: { in: [...OPEN_DISPUTE] } }, select: { orderId: true },
    }),
    db.paymentRefund.findMany({
      /* tenant-scope: the provider refunds of those orders, by order id. */
      where: { orderId: { in: orderIds }, outcome: "HELD" }, select: { orderId: true },
    }),
  ]);
  for (const r of refunds) out.set(r.orderId, `The payment provider refunded part of order ${orderRef(r.orderId)} — BTG is checking it`);
  for (const d of disputes) out.set(d.orderId, `The sponsor disputed the payment for order ${orderRef(d.orderId)} — BTG support is handling it`);
  return out;
}

/**
 * A paid order may be refunded in SponsorX only when no dispute stands in the
 * way: an open one freezes it, and a lost one means the bank already returned
 * the money — refunding again would pay the sponsor twice. Called by every
 * refund (marketplace-order.ts `moveIn`, delivery.ts `refundLine`).
 */
export async function assertRefundable(tx: Tx, orderId: string) {
  const d = await tx.paymentDispute.findFirst({
    /* tenant-scope: this order's own disputes, named by its id; the caller loaded the order through its own scope. */
    where: { orderId, state: { in: ["OPEN", "UNDER_REVIEW", "LOST"] } }, select: { state: true }, orderBy: { createdAt: "desc" },
  });
  if (!d) return;
  throw new PaymentExceptionError(d.state === "LOST"
    ? "The sponsor's bank already returned this payment (a dispute was lost) — refunding it again would pay them twice."
    : "The sponsor has disputed this payment with their bank — BTG support is handling it, and the order can't be refunded until it is resolved.");
}

/* ── the provider's refund ────────────────────────────────────────────── */

/** payment.refunded — the provider refunded some or all of a payment. */
export const onRefunded: Handler = async (tx, ev, data, now) => {
  const found = await findAttempt(tx, ev.provider, data);
  if (!found) return deferred("No payment in SponsorX matches this refund yet — tried again shortly");
  await lockOrder(tx, found.orderId);
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    /* tenant-scope: the attempt just resolved from the event, re-read under its order's lock. */
    where: { id: found.id }, select: { id: true, tenantId: true, orderId: true, state: true, amountCents: true, refundedCents: true, providerRef: true },
  });
  const books = a.tenantId;
  const refundRef = String(data.refundRef);
  const amount = Number(data.amountCents);
  if (a.state === "PENDING" || a.state === "PROCESSING") return deferred("The refund arrived before the payment's confirmation — tried again shortly", books, a.orderId);
  if (!CONFIRMED.has(a.state)) return held(`The provider reports a refund of ${usd(amount)} on a payment SponsorX recorded as ${a.state.toLowerCase()}.`, books, a.orderId);
  const seen = await tx.paymentRefund.findUnique({
    /* tenant-scope: the provider's own refund reference — one row per refund, whichever event carried it. */
    where: { provider_providerRefundRef: { provider: ev.provider, providerRefundRef: refundRef } }, select: { id: true },
  });
  if (seen) return ignored("This refund was already recorded", books, a.orderId);
  if (a.refundedCents + amount > a.amountCents) {
    return held(`The provider reports refunding ${usd(a.refundedCents + amount)} in all, more than the ${usd(a.amountCents)} it captured — nothing was changed.`, books, a.orderId);
  }

  /* The payment's own record: refunded this much more, forward only. */
  const refundedCents = a.refundedCents + amount;
  const moved = await tx.paymentAttempt.updateMany({
    /* tenant-scope: the attempt just re-read; conditional on what was refunded before, so a second worker adds nothing. */
    where: { id: a.id, refundedCents: a.refundedCents },
    data: { refundedCents, state: refundedCents === a.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: now },
  });
  if (!moved.count) return ignored("This refund was already recorded", books, a.orderId);
  await audit(tx, system(books), "payment.refunded", "MarketplaceOrder", a.orderId, {
    before: { attemptId: a.id, state: a.state, refundedCents: a.refundedCents }, after: { refundedCents, amountCents: amount, refundRef, eventId: ev.id },
  });
  const record = (outcome: "CONFIRMED" | "APPLIED" | "HELD", refundDueId: string | null = null) =>
    tx.paymentRefund.create({
      data: { tenantId: books, attemptId: a.id, orderId: a.orderId, provider: ev.provider, providerRefundRef: refundRef, amountCents: amount, outcome, refundDueId },
      select: { id: true },
    });

  /* 1. It confirms a refund SponsorX sent — by its reference, or (2S5-INT-01) by SponsorX's own
     refund id the provider carried back, which names it even before the worker wrote the reference. */
  const refundDueId = typeof data.refundDueId === "string" ? data.refundDueId : null;
  const ours = await tx.refundDue.findFirst({
    /* tenant-scope: this order's own refunds, by the provider's reference or SponsorX's id. */
    where: { orderId: a.orderId, OR: [{ reference: refundRef }, ...(refundDueId ? [{ id: refundDueId }] : [])] }, select: { id: true },
  });
  if (ours && !(await tx.paymentRefund.findFirst({ /* tenant-scope: by the RefundDue just found. */ where: { refundDueId: ours.id }, select: { id: true } }))) {
    await record("CONFIRMED", ours.id);
    return applied(`The provider confirmed SponsorX's refund of ${usd(amount)}`, books, a.orderId);
  }

  /* 2. A refund made at the provider: the order is refunded here when every check passes. */
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order this attempt paid for, recorded on it. */
    where: { id: a.orderId }, select: { id: true, state: true, totalCents: true, paidVia: true, paymentReference: true },
  });
  const reasons: string[] = [];
  const whole = a.refundedCents === 0 && amount === a.amountCents && amount === order.totalCents;
  if (!whole) reasons.push(`a part refund (${usd(amount)} of ${usd(a.amountCents)}) made at the provider — SponsorX can't tell which line it was for`);
  if (order.paidVia !== "CARD" || order.paymentReference !== a.providerRef) reasons.push("this card payment is not the one that paid the order");
  if (!REFUNDABLE.has(order.state)) reasons.push(`the order is ${order.state.toLowerCase().replace("_", " ")}`);
  if (await tx.paymentDispute.findFirst({ /* tenant-scope: this order's own disputes. */ where: { orderId: order.id }, select: { id: true } })) reasons.push("the payment has been disputed");
  if (await tx.refundDue.findFirst({ /* tenant-scope: this order's own refunds. */ where: { orderId: order.id }, select: { id: true } })) reasons.push("part of the order was already refunded in SponsorX");
  const sending = await tx.payoutLine.findFirst({
    /* tenant-scope: payout lines naming this order (loaded above). */
    where: { orderId: order.id, payout: { state: "SENDING" } }, select: { id: true },
  });
  if (sending) reasons.push("a payout covering it is being sent right now");
  if (reasons.length) {
    await record("HELD");
    return held(`The provider refunded ${usd(amount)} of order ${orderRef(order.id)}; SponsorX didn't refund it by itself: ${reasons.join("; ")}. Its payouts wait until BTG refunds it here or closes this.`, books, order.id);
  }
  /* The money is back with the sponsor: a payout not yet sent must not pay it out. */
  const sentBack = await sendBackPayoutsCovering(tx, order.id, `The sponsor's payment for order ${orderRef(order.id)} was refunded at the payment provider, so this payout was cancelled. Request again for any other money.`, now);
  await moveOrderIn(tx, system(books), order.id, "REFUNDED", now, {
    cause: "PROVIDER_REFUNDED", lineId: null, cancellation: false, returned: { provider: ev.provider, reference: refundRef },
  });
  const due = await tx.refundDue.findFirstOrThrow({
    /* tenant-scope: the whole-order refund just written for this order. */
    where: { orderId: order.id, lineId: null, cause: "PROVIDER_REFUNDED" }, select: { id: true },
  });
  await record("APPLIED", due.id);
  return applied(`The provider refunded the whole payment: the order is refunded and its books reversed${sentBack ? `; ${sentBack} payout${sentBack === 1 ? "" : "s"} not yet sent ${sentBack === 1 ? "was" : "were"} sent back` : ""}`, books, order.id);
};

/**
 * BTG closed a held `payment.refunded` event without refunding the order in
 * SponsorX (payment-events.ts `resolvePaymentEvent`): the hold on the order's
 * payouts lifts, and an approved payout waiting on it is sent.
 */
export async function dismissHeldRefund(tx: Tx, actor: AuditActor, ev: { provider: string; payload: unknown }) {
  const refundRef = (ev.payload as { refundRef?: unknown } | null)?.refundRef;
  if (typeof refundRef !== "string") return;
  const row = await tx.paymentRefund.findUnique({
    /* tenant-scope: the provider refund the event (loaded through whereFor(paymentEvent, write)) names. */
    where: { provider_providerRefundRef: { provider: ev.provider, providerRefundRef: refundRef } }, select: { id: true, orderId: true, outcome: true },
  });
  if (!row || row.outcome !== "HELD") return;
  const moved = await tx.paymentRefund.updateMany({ /* tenant-scope: the row just found; conditional on HELD. */ where: { id: row.id, outcome: "HELD" }, data: { outcome: "DISMISSED" } });
  if (!moved.count) return;
  await audit(tx, actor, "paymentRefund.dismissed", "MarketplaceOrder", row.orderId, { before: { outcome: "HELD" }, after: { paymentRefundId: row.id, outcome: "DISMISSED" } });
  await resumePayoutsCovering(tx, row.orderId);
}

/* ── disputes: the provider's word ────────────────────────────────────── */

async function tellDisputeOpened(tx: Tx, d: { id: string; tenantId: string; orderId: string; amountCents: number; reason: string | null }) {
  const data = {
    orderRef: orderRef(d.orderId), amount: usd(d.amountCents), reason: d.reason ?? "not given",
    disputeUrl: appUrl(`/admin/payments/disputes/${d.id}`),
  };
  /* The review item: the support mailbox (2S1-BE-16) — disputes are never automated, they go to BTG support — and BTG's admins. */
  await send(tx, d.tenantId, { template: "dispute.opened", to: env.SUPPORT_EMAIL, idempotencyKey: `dispute.opened:${d.id}:support`, data });
  for (const u of await btgAdmins(tx, d.tenantId)) await tell(tx, { tenantId: d.tenantId, email: u.email }, "dispute.opened", d.id, data);
}

async function tellProviderClosed(tx: Tx, d: { id: string; tenantId: string; orderId: string; amountCents: number }, outcome: string) {
  for (const u of await btgAdmins(tx, d.tenantId)) {
    await tell(tx, { tenantId: d.tenantId, email: u.email }, "dispute.providerClosed", d.id, {
      orderRef: orderRef(d.orderId), amount: usd(d.amountCents), outcome: outcome === "WON" ? "won" : "lost",
      disputeUrl: appUrl(`/admin/payments/disputes/${d.id}`),
    });
  }
}

/** The dispute a confirmed payment's event opens (or, out of order, its closing event first creates). */
async function openDispute(tx: Tx, ev: EventRow, a: { id: string; tenantId: string; orderId: string; sponsorId: string; amountCents: number }, data: Record<string, unknown>, now: Date) {
  const created = await tx.paymentDispute.create({
    data: {
      tenantId: a.tenantId, orderId: a.orderId, attemptId: a.id, sponsorId: a.sponsorId, provider: ev.provider,
      providerDisputeRef: String(data.disputeRef), amountCents: typeof data.amountCents === "number" ? data.amountCents : a.amountCents,
      reason: typeof data.reason === "string" ? data.reason.slice(0, 500) : null, openedAt: now,
    },
    select: { id: true, tenantId: true, orderId: true, amountCents: true, reason: true },
  });
  await audit(tx, system(a.tenantId), "dispute.open", "PaymentDispute", created.id, {
    after: { orderId: a.orderId, attemptId: a.id, amountCents: created.amountCents, reason: created.reason, eventId: ev.id, frozen: true },
  });
  await tellDisputeOpened(tx, created);
  return created;
}

/** The confirmed payment a dispute event names, under its order's lock — or why not yet. */
async function disputedPayment(tx: Tx, ev: EventRow, data: Record<string, unknown>) {
  const found = await findAttempt(tx, ev.provider, data);
  if (!found) return { wait: deferred("No payment in SponsorX matches this dispute yet — tried again shortly") };
  await lockOrder(tx, found.orderId);
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    /* tenant-scope: the attempt just resolved from the event, re-read under its order's lock. */
    where: { id: found.id }, select: { id: true, tenantId: true, orderId: true, sponsorId: true, state: true, amountCents: true },
  });
  if (a.state === "PENDING" || a.state === "PROCESSING") return { wait: deferred("The dispute arrived before the payment's confirmation — tried again shortly", a.tenantId, a.orderId) };
  if (!CONFIRMED.has(a.state)) return { wait: held(`The provider reports a dispute on a payment SponsorX recorded as ${a.state.toLowerCase()}.`, a.tenantId, a.orderId) };
  return { a };
}

const disputeByRef = (tx: Tx, provider: string, ref: string) =>
  tx.paymentDispute.findUnique({
    /* tenant-scope: the provider's own dispute reference, unique per provider. */
    where: { provider_providerDisputeRef: { provider, providerDisputeRef: ref } },
    select: { id: true, tenantId: true, orderId: true, amountCents: true, state: true, providerOutcome: true },
  });

/** dispute.opened — the sponsor disputed the payment: OPEN, the money frozen, BTG support told. Never decided here. */
export const onDisputeOpened: Handler = async (tx, ev, data, now) => {
  const existing = await disputeByRef(tx, ev.provider, String(data.disputeRef));
  if (existing) return ignored("This dispute was already recorded", existing.tenantId, existing.orderId);
  const r = await disputedPayment(tx, ev, data);
  if (r.wait) return r.wait;
  const d = await openDispute(tx, ev, r.a, data, now);
  return applied(`A dispute of ${usd(d.amountCents)} was opened: the order's money is frozen and BTG support has it to review`, d.tenantId, d.orderId);
};

/**
 * dispute.closed — the provider decided (won or lost). Recorded, and BTG
 * told; the dispute is NOT resolved and its money stays frozen until a BTG
 * admin resolves it. Arriving before its `dispute.opened`, it opens the
 * dispute itself (the opened one then finds it and is ignored).
 */
export const onDisputeClosed: Handler = async (tx, ev, data, now) => {
  const outcome = data.outcome === "WON" ? "WON" : "LOST";
  let d = await disputeByRef(tx, ev.provider, String(data.disputeRef));
  if (!d) {
    const r = await disputedPayment(tx, ev, data);
    if (r.wait) return r.wait;
    const opened = await openDispute(tx, ev, r.a, data, now);
    d = { ...opened, state: "OPEN", providerOutcome: null };
  } else {
    await lockOrder(tx, d.orderId);
  }
  if (d.providerOutcome) return ignored(`The provider's outcome (${d.providerOutcome.toLowerCase()}) was already recorded`, d.tenantId, d.orderId);
  const moved = await tx.paymentDispute.updateMany({
    /* tenant-scope: the dispute just found by its provider reference; conditional, so a second close records nothing. */
    where: { id: d.id, providerOutcome: null }, data: { providerOutcome: outcome, providerClosedAt: now },
  });
  if (!moved.count) return ignored("The provider's outcome was already recorded", d.tenantId, d.orderId);
  await audit(tx, system(d.tenantId), "dispute.providerClosed", "PaymentDispute", d.id, { after: { providerOutcome: outcome, eventId: ev.id, resolved: false } });
  await tellProviderClosed(tx, d, outcome);
  return applied(`The provider closed the dispute (${outcome.toLowerCase()}); it stays frozen until BTG resolves it — nothing was decided automatically`, d.tenantId, d.orderId);
};

/* ── disputes: BTG's side ─────────────────────────────────────────────── */

const DISPUTE = {
  id: true, tenantId: true, orderId: true, attemptId: true, sponsorId: true, provider: true, providerDisputeRef: true, amountCents: true,
  reason: true, state: true, providerOutcome: true, providerClosedAt: true, openedAt: true, reviewStartedAt: true, reviewedBy: true,
  reviewNote: true, resolvedAt: true, resolvedBy: true, resolutionNote: true, lineIds: true, ledgerReversed: true, owedBackCents: true,
} as const;
type DisputeRow = Prisma.PaymentDisputeGetPayload<{ select: typeof DISPUTE }>;

async function disputeViews(rows: DisputeRow[]) {
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const [sponsors, payoutLines, lines] = await Promise.all([
    prisma.sponsor.findMany({
      /* tenant-scope: the sponsors named by disputes loaded through whereFor(paymentDispute). */
      where: { id: { in: [...new Set(rows.map((r) => r.sponsorId))] } }, select: { id: true, name: true },
    }),
    prisma.payoutLine.findMany({
      /* tenant-scope: payout lines naming the disputed orders (loaded through whereFor). */
      where: { orderId: { in: orderIds } }, select: { orderId: true, amountCents: true, payout: { select: { id: true, state: true, payeeType: true, payeeId: true } } },
    }),
    prisma.marketplaceOrderLine.findMany({
      /* tenant-scope: the lines of the disputed orders (loaded through whereFor). */
      where: { orderId: { in: orderIds } }, select: { id: true, orderId: true, title: true, lineTotalCents: true },
    }),
  ]);
  const sponsor = new Map(sponsors.map((s) => [s.id, s.name]));
  return rows.map((d) => ({
    ...d,
    orderRef: orderRef(d.orderId),
    sponsorName: sponsor.get(d.sponsorId) ?? "Sponsor",
    frozen: (OPEN_DISPUTE as readonly string[]).includes(d.state),
    /** The provider has decided, and BTG can resolve it to that. */
    canResolve: d.state === "UNDER_REVIEW" && d.providerOutcome !== null,
    lines: lines.filter((l) => l.orderId === d.orderId).map(({ orderId: _o, ...l }) => l),
    /** Payouts covering the order: frozen while it is open, sent back when it is lost. */
    payouts: payoutLines.filter((p) => p.orderId === d.orderId).map((p) => ({ ...p.payout, amountCents: p.amountCents })),
  }));
}

/** GET /disputes — BTG admin and Finance, in their own books: the open ones first. */
export async function listDisputes(actor: Actor, state?: DisputeState) {
  assertTenantWide(actor, "paymentDispute", "read");
  const scope = whereFor(actor, "paymentDispute", "read");
  const rows = await prisma.paymentDispute.findMany({
    /* tenant-scope: `scope` is whereFor(paymentDispute, read); the state only narrows it. */
    where: { ...scope, ...(state ? { state } : {}) }, select: DISPUTE, orderBy: [{ state: "asc" }, { openedAt: "asc" }], take: 200,
  });
  const grouped = await prisma.paymentDispute.groupBy({ /* tenant-scope: whereFor(paymentDispute, read). */ by: ["state"], where: scope, _count: { _all: true } });
  return {
    counts: Object.fromEntries(DISPUTE_STATES.map((s) => [s, grouped.find((g) => g.state === s)?._count._all ?? 0])),
    disputes: await disputeViews(rows),
  };
}

export async function getDispute(actor: Actor, id: string) {
  assertTenantWide(actor, "paymentDispute", "read");
  const row = await prisma.paymentDispute.findFirst({ where: { ...whereFor(actor, "paymentDispute", "read"), id }, select: DISPUTE });
  if (!row) throw new PaymentExceptionError("No such dispute.", 404);
  return (await disputeViews([row]))[0]!;
}

/** POST /disputes/{id}/review — BTG takes it (OPEN → UNDER_REVIEW), saying what it sent the provider. */
export async function reviewDispute(actor: Actor, id: string, note: string, now = new Date()) {
  assertTenantWide(actor, "paymentDispute", "write");
  const text = note.trim();
  if (!text) throw new PaymentExceptionError("Say what was sent to the provider (the evidence) — the next person reads this.", 422);
  refuseCardNumber(text); // 2S0-SEC-01 (O5)
  await prisma.$transaction(async (tx) => {
    const d = await tx.paymentDispute.findFirst({ where: { ...whereFor(actor, "paymentDispute", "write"), id }, select: { id: true, state: true } });
    if (!d) throw new PaymentExceptionError("No such dispute.", 404);
    if (d.state !== "OPEN") throw new PaymentExceptionError(`This dispute is ${d.state.toLowerCase().replace("_", " ")}, not waiting to be taken for review.`);
    const moved = await tx.paymentDispute.updateMany({
      /* tenant-scope: the row just loaded through whereFor(paymentDispute, write); conditional on OPEN. */
      where: { id: d.id, state: "OPEN" }, data: { state: "UNDER_REVIEW", reviewStartedAt: now, reviewedBy: actor.userId ?? "unknown", reviewNote: text.slice(0, 2000) },
    });
    if (!moved.count) throw new PaymentExceptionError("This dispute was just taken by someone else.");
    await audit(tx, actor, "dispute.review", "PaymentDispute", d.id, { before: { state: "OPEN" }, after: { state: "UNDER_REVIEW", note: text } });
  });
  return getDispute(actor, id);
}

/**
 * POST /disputes/{id}/resolve — a BTG admin resolves a dispute under review to
 * the outcome the provider reported. Never before the provider has decided,
 * never to the other outcome, never by the system. LOST on part of the
 * payment names the lines it was for (`lineIds`); on the whole, it reverses
 * the whole order.
 */
export async function resolveDispute(actor: Actor, id: string, input: { note: string; lineIds?: string[] }, now = new Date()) {
  assertTenantWide(actor, "paymentDispute", "approve");
  const text = input.note.trim();
  if (!text) throw new PaymentExceptionError("Say how it was resolved — the record for whoever looks next.", 422);
  refuseCardNumber(text); // 2S0-SEC-01 (O5)
  await prisma.$transaction(async (tx) => {
    const found = await tx.paymentDispute.findFirst({ where: { ...whereFor(actor, "paymentDispute", "approve"), id }, select: { id: true, orderId: true } });
    if (!found) throw new PaymentExceptionError("No such dispute.", 404);
    await lockOrder(tx, found.orderId);
    const d = await tx.paymentDispute.findUniqueOrThrow({
      /* tenant-scope: the row just found through whereFor(paymentDispute, approve), re-read under its order's lock. */
      where: { id: found.id }, select: DISPUTE,
    });
    if (d.state === "OPEN") throw new PaymentExceptionError("Take the dispute for review first — it can't be resolved straight from open.");
    if (d.state !== "UNDER_REVIEW") throw new PaymentExceptionError(`This dispute was already resolved (${d.state.toLowerCase()}).`);
    if (!d.providerOutcome) throw new PaymentExceptionError("The payment provider hasn't decided this dispute yet — it can be resolved once it has.");
    const books = { userId: actor.userId, tenantId: d.tenantId };
    if (d.providerOutcome === "WON") {
      const moved = await tx.paymentDispute.updateMany({
        /* tenant-scope: the row just re-read; conditional on UNDER_REVIEW. */
        where: { id: d.id, state: "UNDER_REVIEW" }, data: { state: "WON", resolvedAt: now, resolvedBy: actor.userId ?? "unknown", resolutionNote: text.slice(0, 2000) },
      });
      if (!moved.count) throw new PaymentExceptionError("This dispute was just resolved by someone else.");
      await audit(tx, books, "dispute.won", "PaymentDispute", d.id, { before: { state: "UNDER_REVIEW" }, after: { state: "WON", note: text, unfrozen: true } });
      /* The money unfreezes: an approved payout that was waiting on it goes to the provider. */
      await resumePayoutsCovering(tx, d.orderId);
      return;
    }
    await loseDispute(tx, books, d, input.lineIds ?? [], text, now);
  });
  return getDispute(actor, id);
}

/** LOST: the books reversed (the whole order or the named lines), payouts not yet sent sent back, what was paid out owed back. */
async function loseDispute(tx: Tx, actor: AuditActor, d: DisputeRow, lineIds: string[], note: string, now: Date) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order of the dispute loaded through whereFor(paymentDispute, approve). */
    where: { id: d.orderId }, select: { id: true, totalCents: true, lines: { select: { id: true, lineTotalCents: true } } },
  });
  const whole = d.amountCents >= order.totalCents;
  const chosen = [...new Set(lineIds)];
  if (!whole) {
    if (!chosen.length) throw new PaymentExceptionError(`The dispute is for ${usd(d.amountCents)} of the order's ${usd(order.totalCents)} — name the lines it was for, so their books are reversed.`, 422);
    const known = new Set(order.lines.map((l) => l.id));
    if (chosen.some((l) => !known.has(l))) throw new PaymentExceptionError("Those lines aren't this order's.", 422);
  }
  /* The bank took the money back: the mirror of what the order (or the lines) posted, as a refund's (ledger design §4). */
  if (whole) await reverseOrder(tx, d.orderId);
  else for (const lineId of chosen) await reverseOrder(tx, d.orderId, lineId);
  const sentBack = await sendBackPayoutsCovering(tx, d.orderId, `The sponsor's payment for order ${orderRef(d.orderId)} was disputed and the dispute was lost, so this payout was cancelled. Request again for any other money.`, now);
  /* Owed back: each payee's balance on this order after the reversal, where it went below zero (money already paid out). */
  const entries = await tx.ledgerEntry.findMany({
    /* tenant-scope: this order's own entries, named by its id. */
    where: { orderId: d.orderId, account: { in: ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE", "RESERVE_HELD"] } },
    select: { partyType: true, partyId: true, debitCents: true, creditCents: true },
  });
  const byPayee = new Map<string, number>();
  for (const e of entries) byPayee.set(`${e.partyType}:${e.partyId}`, (byPayee.get(`${e.partyType}:${e.partyId}`) ?? 0) + e.creditCents - e.debitCents);
  const owed = [...byPayee].filter(([, net]) => net < 0).map(([payee, net]) => ({ payee, owedBackCents: -net }));
  const owedBackCents = owed.reduce((s, o) => s + o.owedBackCents, 0);
  const moved = await tx.paymentDispute.updateMany({
    /* tenant-scope: the dispute loaded through whereFor(paymentDispute, approve); conditional on UNDER_REVIEW. */
    where: { id: d.id, state: "UNDER_REVIEW" },
    data: { state: "LOST", resolvedAt: now, resolvedBy: actor.userId ?? "unknown", resolutionNote: note.slice(0, 2000), ledgerReversed: true, lineIds: whole ? [] : chosen, owedBackCents },
  });
  if (!moved.count) throw new PaymentExceptionError("This dispute was just resolved by someone else.");
  await audit(tx, actor, "dispute.lost", "PaymentDispute", d.id, {
    before: { state: "UNDER_REVIEW" },
    after: { state: "LOST", note, reversed: whole ? "order" : chosen, payoutsSentBack: sentBack, owedBackCents, owed },
  });
}

/* ── wiring ───────────────────────────────────────────────────────────── */

/** The handlers this module owns, for payment-events.ts (resolved at call time). */
export function exceptionHandlerFor(type: string): Handler | null {
  if (type === "payment.refunded") return onRefunded;
  if (type === "dispute.opened") return onDisputeOpened;
  if (type === "dispute.closed") return onDisputeClosed;
  return null;
}
