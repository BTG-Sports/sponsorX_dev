/**
 * Refunds to send — 2S4-BE-13 (programme owner, 2026-10-02).
 *
 * "Until a payment provider is connected, money goes back by hand. Finance
 * works from a 'Refunds to send' list."
 *
 * ONE ROW PER REFUND OF MONEY ACTUALLY RECEIVED. Every path that refunds a
 * paid order — a line's own refund (a sponsor's or a seller's cancellation,
 * one agreed between them, a delivery problem settled or decided, BTG's
 * decision on the desk) and the whole order moving to REFUNDED (BTG's
 * transition, or the last live line's refund) — calls `recordRefund` in its
 * own transaction. An order that was never paid gets no row. The row is
 * unique per (order, line), and per order for a whole-order row
 * (RefundDue_one_whole_order), so a retry never makes two.
 *
 * HOW MUCH. A line's refund is the line's total (the buyer's fee stays with
 * the order, as the ledger keeps it — ledger.ts `reverseOrder(…, lineId)`).
 * A whole-order refund is what is left: the order's total less every refund
 * already recorded for it — so the last line's refund returns the fee too.
 *
 * CARD. A card payment the provider can refund is refunded through the
 * adapter (lib/payment-provider.ts `refundCard`) and the row marked SENT at
 * once: the stand-in on staging does it inline, labelled a test; with no
 * provider ("none", production until one is chosen) it stays OPEN for
 * Finance. Everything else — bank transfer, cheque, other, a Zoho invoice —
 * Finance sends by hand and marks sent with the method, a reference and the
 * day (`markRefundSent`, BTG admin and Finance only). A Zoho-invoiced order
 * also needs a credit note in Zoho Books, which the row says.
 *
 * Never a card or bank number: the reference is checked like a payment's.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { refundCard } from "../lib/payment-provider";
import { looksLikeCardNumber } from "./marketplace-order-rules";
import { appUrl, orderRef, sponsorRecipient, tell, usd } from "./order-mail";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class RefundError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "RefundError";
    this.status = status;
  }
}

export const REFUND_CAUSES = [
  "SPONSOR_CANCELLED", "SELLER_CANCELLED", "CANCELLATION_AGREED", "PROBLEM_AGREED", "BTG_DECIDED", "BTG_REFUNDED_ORDER",
  /* A card payment the provider confirmed after the order was cancelled (payouts.ts `confirmPayment`). */
  "PAID_AFTER_CANCELLATION",
] as const;
export type RefundCause = (typeof REFUND_CAUSES)[number];
export const REFUND_STATES = ["OPEN", "SENT"] as const;
export type RefundState = (typeof REFUND_STATES)[number];
export const REFUND_METHODS = ["BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** Why the money goes back, in the words Finance and the sponsor read. */
export const CAUSE_WORDS: Record<RefundCause, string> = {
  SPONSOR_CANCELLED: "The sponsor cancelled the line",
  SELLER_CANCELLED: "The seller cancelled the line — they couldn't deliver it",
  CANCELLATION_AGREED: "The sponsor asked to cancel and the seller agreed",
  PROBLEM_AGREED: "A delivery problem — the seller refunded the line and the sponsor accepted",
  BTG_DECIDED: "BTG decided to refund the line",
  BTG_REFUNDED_ORDER: "BTG refunded the order",
  PAID_AFTER_CANCELLATION: "Paid after the order was cancelled",
};

const PAID_VIA_WORDS: Record<string, string> = {
  CARD: "Card", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", OTHER: "Other", ZOHO_INVOICE: "Zoho invoice",
};

/** What a Zoho-invoiced refund also needs. */
export const ZOHO_NOTE = "Issue a credit note in Zoho Books for this invoice";

/**
 * What started a refund, as the refunding path knows it. `cancellation`
 * marks a refund nobody is at fault for — the sponsor, the seller, or both
 * cancelling (BTG's REFUND of an escalated cancellation too) — which does
 * not stop the sponsor's spending limit rising (spending-limit.ts).
 */
export type RefundContext = { cause: RefundCause; lineId: string | null; cancellation: boolean };

/** The order's refundCause for a whole-order refund. Pure. */
export function orderRefundCause(ctx: Pick<RefundContext, "cause" | "cancellation">): "CANCELLATION" | "PROBLEM" | "BTG" {
  if (ctx.cancellation) return "CANCELLATION";
  return ctx.cause === "BTG_REFUNDED_ORDER" ? "BTG" : "PROBLEM";
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** What is wrong with a "refund sent" record, in words Finance can act on. Empty means fine. Pure. */
export function refundSentProblems(p: { method?: string | null; reference?: string | null; sentOn?: string | null } | null | undefined, now: Date): string[] {
  const out: string[] = [];
  if (!p?.method || !(REFUND_METHODS as readonly string[]).includes(p.method)) out.push("how it was sent (bank transfer, cheque, card or other)");
  const ref = p?.reference?.trim() ?? "";
  if (!ref) out.push("the refund's reference");
  else if (ref.length > 200) out.push("a reference of at most 200 characters");
  else if (looksLikeCardNumber(ref)) out.push("a reference that is not a card number — SponsorX never takes card or bank numbers");
  const day = p?.sentOn ?? "";
  const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!when || Number.isNaN(when.getTime()) || dayOf(when) !== day) out.push("the date it was sent");
  else if (day > dayOf(now)) out.push("a date sent that is not in the future");
  return out;
}

/**
 * Write the refund owed for a paid order, in the refund's own transaction:
 * a line's (`whole: false` — the line's total) or the whole order's
 * (`whole: true` — what is left of its total). Nothing for an order that was
 * never paid, or once nothing is left to return. Idempotent: a second call
 * for the same (order, line) finds the row and changes nothing. A card
 * payment is refunded through the adapter where it can be, and the row
 * marked SENT.
 */
export async function recordRefund(
  tx: Tx, actor: AuditActor, orderId: string, ctx: RefundContext,
  opts: {
    whole: boolean;
    /** Money that arrived without paying the order (a card confirmed after it was cancelled): how much, how, and the provider's reference. */
    received?: { amountCents: number; paidVia: string; paymentReference: string | null };
  },
  now = new Date(),
) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the refunding path loaded through its caller's scope (or the system's own sweep), by id. */
    where: { id: orderId },
    select: { id: true, tenantId: true, sponsorId: true, totalCents: true, paidAt: true, paidVia: true, paymentReference: true, createdBy: true, billingEmail: true, billingName: true },
  });
  /* Money actually received: the order was paid (paidAt from 2S4-BE-10 on; before it, its lines opened for delivery). */
  const paid = Boolean(opts.received) || Boolean(order.paidAt || order.paidVia) || (await tx.orderLineDelivery.count({
    /* tenant-scope: this order's own delivery rows, named by its id. */
    where: { orderId, paidAt: { not: null } },
  })) > 0;
  if (!paid) return null;
  /* Already written (a retry): nothing more to do. */
  const existing = await tx.refundDue.findFirst({
    /* tenant-scope: this order's own refund for this line (or the whole order), by the unique pair. */
    where: { orderId, lineId: ctx.lineId }, select: { id: true, state: true, amountCents: true },
  });
  if (existing) return existing;

  const paidVia = opts.received?.paidVia ?? order.paidVia;
  const paymentReference = opts.received ? opts.received.paymentReference : order.paymentReference;
  let amountCents: number;
  if (opts.received) {
    amountCents = opts.received.amountCents;
  } else if (opts.whole) {
    const already = await tx.refundDue.aggregate({
      /* tenant-scope: this order's own refunds, named by its id. */
      where: { orderId }, _sum: { amountCents: true },
    });
    amountCents = order.totalCents - (already._sum.amountCents ?? 0);
  } else {
    const line = await tx.marketplaceOrderLine.findFirstOrThrow({
      /* tenant-scope: a line of this order, by its own id. */
      where: { id: ctx.lineId!, orderId }, select: { lineTotalCents: true },
    });
    amountCents = line.lineTotalCents;
  }
  if (amountCents <= 0) return null;

  const made = await tx.refundDue.createMany({
    data: [{
      tenantId: order.tenantId, orderId, lineId: ctx.lineId, sponsorId: order.sponsorId, amountCents, cause: ctx.cause, paidVia,
    }],
    /* (order, line) is unique — and one whole-order row per order: a retry finds its row and writes nothing. */
    skipDuplicates: true,
  });
  const row = await tx.refundDue.findFirstOrThrow({
    /* tenant-scope: this order's own refund for this line (or the whole order), by the unique pair. */
    where: { orderId, lineId: ctx.lineId }, select: { id: true, state: true, amountCents: true },
  });
  if (!made.count) return row;
  await audit(tx, actor, "refundDue.create", "MarketplaceOrder", orderId, {
    after: { refundId: row.id, lineId: ctx.lineId, amountCents, cause: ctx.cause, paidVia, whole: opts.whole },
  });

  /* A card payment the provider can refund goes back at once; with no provider it waits for Finance. */
  if (paidVia === "CARD") {
    const refunded = refundCard({ paymentReference, amountCents });
    if (refunded) {
      const sent = await tx.refundDue.updateMany({
        /* tenant-scope: the row just written, by id, only while still on its way. */
        where: { id: row.id, state: "OPEN" },
        data: { state: "SENT", sentAt: now, sentBy: "system", method: "CARD", reference: refunded.reference, sentOn: new Date(`${dayOf(now)}T00:00:00.000Z`), provider: refunded.provider },
      });
      if (sent.count) {
        await audit(tx, actor, "refundDue.sent", "MarketplaceOrder", orderId, {
          before: { refundId: row.id, state: "OPEN" },
          after: { refundId: row.id, state: "SENT", method: "CARD", provider: refunded.provider, test: refunded.test, reference: refunded.reference },
        });
        await tellRefundSent(tx, order, row.id, amountCents, "to the card it was paid with", now);
        return { ...row, state: "SENT" };
      }
    }
  }
  return row;
}

async function tellRefundSent(
  tx: Tx, order: { id: string; tenantId: string; createdBy: string | null; billingEmail: string | null; billingName: string | null },
  refundId: string, amountCents: number, how: string, sentOn: Date,
) {
  const sponsor = await sponsorRecipient(tx, order);
  if (!sponsor) return;
  await tell(tx, sponsor, "refund.sent", refundId, {
    firstName: sponsor.firstName, orderRef: orderRef(order.id), amount: usd(amountCents), how, sentOn: dayOf(sentOn),
    orderUrl: appUrl(`/sponsor/orders/${order.id}`),
  });
}

/* ── Finance's list ──────────────────────────────────────────────────── */

const ROW = {
  id: true, tenantId: true, orderId: true, lineId: true, sponsorId: true, amountCents: true, cause: true, paidVia: true, state: true,
  sentAt: true, sentBy: true, method: true, reference: true, sentOn: true, provider: true, createdAt: true,
} as const;
type Row = Prisma.RefundDueGetPayload<{ select: typeof ROW }>;

async function viewsOf(rows: Row[]) {
  const ids = (f: (r: Row) => string | null) => [...new Set(rows.map(f).filter((x): x is string => Boolean(x)))];
  const [sponsors, lines] = await Promise.all([
    prisma.sponsor.findMany({
      /* tenant-scope: the sponsors named on refunds the caller loaded through whereFor(refundDue). */
      where: { id: { in: ids((r) => r.sponsorId) } }, select: { id: true, name: true },
    }),
    prisma.marketplaceOrderLine.findMany({
      /* tenant-scope: the lines named on refunds the caller loaded through whereFor(refundDue). */
      where: { id: { in: ids((r) => r.lineId) } }, select: { id: true, title: true, quantity: true, startsOn: true, endsOn: true },
    }),
  ]);
  const sponsor = new Map(sponsors.map((s) => [s.id, s.name]));
  const line = new Map(lines.map((l) => [l.id, l]));
  return rows.map((r) => {
    const l = r.lineId ? line.get(r.lineId) : null;
    const dates = l ? [...new Set([dayOf(l.startsOn), dayOf(l.endsOn)])] : [];
    return {
      id: r.id,
      orderId: r.orderId,
      orderRef: orderRef(r.orderId),
      sponsor: { id: r.sponsorId, name: sponsor.get(r.sponsorId) ?? "Sponsor" },
      line: l ? { id: l.id, title: l.title, quantity: l.quantity, dates } : null,
      wholeOrder: !r.lineId,
      amountCents: r.amountCents,
      cause: r.cause as RefundCause,
      causeWords: CAUSE_WORDS[r.cause as RefundCause] ?? r.cause,
      paidVia: r.paidVia,
      paidViaWords: r.paidVia ? PAID_VIA_WORDS[r.paidVia] ?? r.paidVia : null,
      zohoNote: r.paidVia === "ZOHO_INVOICE" ? ZOHO_NOTE : null,
      state: r.state as RefundState,
      createdAt: r.createdAt,
      sent: r.state === "SENT"
        ? { at: r.sentAt, on: r.sentOn ? dayOf(r.sentOn) : null, method: r.method as RefundMethod, reference: r.reference, by: r.sentBy === "system" ? "SYSTEM" as const : "BTG" as const, test: r.provider === "standin" }
        : null,
    };
  });
}

/** GET /refunds — BTG admin and Finance, tenant-wide: what is still to send (oldest first), or what was sent (latest first). */
export async function listRefunds(actor: Actor, state?: RefundState) {
  assertTenantWide(actor, "refundDue", "read");
  const where = whereFor(actor, "refundDue", "read");
  const rows = await prisma.refundDue.findMany({
    where: { ...where, ...(state ? { state } : {}) }, select: ROW,
    orderBy: state === "SENT" ? [{ sentAt: "desc" }] : [{ state: "asc" }, { createdAt: "asc" }], take: 500,
  });
  const [open, sent, owed] = await Promise.all([
    prisma.refundDue.count({ where: { ...where, state: "OPEN" } }),
    prisma.refundDue.count({ where: { ...where, state: "SENT" } }),
    prisma.refundDue.aggregate({ where: { ...where, state: "OPEN" }, _sum: { amountCents: true } }),
  ]);
  return { counts: { open, sent }, openCents: owed._sum.amountCents ?? 0, refunds: await viewsOf(rows) };
}

export type RefundSentInput = { method: RefundMethod; reference: string; sentOn: string };

/**
 * POST /refunds/{id}/sent — Finance (or BTG admin) sent it by hand: how, the
 * reference and the day. Once only; audited; the sponsor is emailed that it
 * was sent. A refund outside the caller's books is 404.
 */
export async function markRefundSent(actor: Actor, id: string, input: Partial<RefundSentInput>, now = new Date()) {
  assertTenantWide(actor, "refundDue", "write");
  const problems = refundSentProblems(input, now);
  if (problems.length) throw new RefundError(`To mark it sent, give ${problems.join("; ")}.`, 422);
  const reference = input.reference!.trim();
  const row = await prisma.$transaction(async (tx) => {
    const found = await tx.refundDue.findFirst({ where: { ...whereFor(actor, "refundDue", "write"), id }, select: ROW });
    if (!found) throw new RefundError("No such refund.", 404);
    if (found.state !== "OPEN") throw new RefundError(`This refund was already marked sent${found.sentOn ? ` on ${dayOf(found.sentOn)}` : ""}.`);
    const sentOn = new Date(`${input.sentOn}T00:00:00.000Z`);
    const moved = await tx.refundDue.updateMany({
      /* tenant-scope: the row just loaded through whereFor(refundDue, write), only while still on its way. */
      where: { id: found.id, state: "OPEN" },
      data: { state: "SENT", sentAt: now, sentBy: actor.userId ?? "unknown", method: input.method!, reference, sentOn },
    });
    if (!moved.count) throw new RefundError("This refund was just marked sent — reload to see it.");
    await audit(tx, actor, "refundDue.sent", "MarketplaceOrder", found.orderId, {
      before: { refundId: found.id, state: "OPEN" },
      after: { refundId: found.id, state: "SENT", method: input.method, reference, sentOn: input.sentOn, amountCents: found.amountCents },
    });
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      /* tenant-scope: the order of the refund just loaded through whereFor(refundDue, write). */
      where: { id: found.orderId }, select: { id: true, tenantId: true, createdBy: true, billingEmail: true, billingName: true },
    });
    const how = input.method === "BANK_TRANSFER" ? "by bank transfer" : input.method === "CHEQUE" ? "by cheque" : input.method === "CARD" ? "to your card" : "by BTG";
    await tellRefundSent(tx, order, found.id, found.amountCents, how, sentOn);
    return tx.refundDue.findUniqueOrThrow({
      /* tenant-scope: the row just moved, by id. */
      where: { id: found.id }, select: ROW,
    });
  });
  return (await viewsOf([row]))[0]!;
}

/* ── the sponsor's view ──────────────────────────────────────────────── */

/**
 * Each refund of these orders as the sponsor reads it: how much, and on its
 * way (OPEN) or sent on a date. Never a method's details, a reference, or a
 * bank or card number. `orderIds` were loaded by the caller through its own
 * scope (marketplaceOrder or orderDelivery).
 */
export async function refundsForOrders(db: Db, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, SponsorRefund[]>();
  const rows = await db.refundDue.findMany({
    /* tenant-scope: the refunds of orders the caller loaded through its own whereFor scope. */
    where: { orderId: { in: orderIds } }, select: { id: true, orderId: true, lineId: true, amountCents: true, cause: true, state: true, sentOn: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, SponsorRefund[]>();
  for (const r of rows) {
    const sentOn = r.sentOn ? dayOf(r.sentOn) : null;
    out.set(r.orderId, [...(out.get(r.orderId) ?? []), {
      id: r.id, lineId: r.lineId, amountCents: r.amountCents, cause: r.cause as RefundCause, state: r.state as RefundState, sentOn,
      text: r.state === "SENT" ? `Refund sent${sentOn ? ` on ${sentOn}` : ""}` : "Refund on its way",
    }]);
  }
  return out;
}

export type SponsorRefund = { id: string; lineId: string | null; amountCents: number; cause: RefundCause; state: RefundState; sentOn: string | null; text: string };
