/**
 * Payment, automated — 2S4-BE-10.
 *
 * Approval opens the payment window (marketplace-order.ts `contract`: the
 * order goes straight to AWAITING_PAYMENT, `paymentDueAt` three days on).
 * Then:
 *
 *   - UNPAID. The worker's sweep (`sweepUnpaidOrders`) reminds the sponsor
 *     one day and two days after the order started waiting, and at three
 *     days cancels it (UNPAID): the stock released, the contracted books
 *     reversed, the sponsor and the sellers told. Never while a payment is in
 *     progress — a card payment the provider is confirming (PROCESSING), or
 *     one the sponsor started within the last hour (PENDING: the provider's
 *     page is still open — the stand-in's link lasts an hour). The sweep
 *     looks again next pass. Every step is claimed with a conditional update
 *     and every email keyed by the order and the step, so overlapping runs
 *     and retries do nothing twice.
 *
 *   - PAID BY INVOICE. A Zoho Books invoice webhook for a marketplace
 *     order's Deal (2S7-INT-01 pushes the order as a Deal) lands in the same
 *     queue as a campaign's (routes/v1/zoho-webhooks.ts → worker
 *     `zoho.ingestInvoice` → invoice.ts → `ingestOrderInvoice` here). The
 *     invoice is mirrored; when Zoho says it is paid (status "paid", or a
 *     balance of 0) the order moves AWAITING_PAYMENT → PAID through the same
 *     path as a card payment (`payOrderIn`), audited with the Zoho invoice
 *     id. Idempotent: a redelivered payload is dropped by its hash, and an
 *     order already paid is left alone. An invoice in another currency than
 *     the order's never pays it (audited as unmatched, with the reason).
 *
 * Both take the order's row lock before they look at it (marketplace-order.ts
 * CONCURRENCY), so a cancel and a payment for the same order serialize: the
 * second one reads what the first did, and the sweep leaves an order a
 * payment got to first.
 *
 * Zoho Books is not connected yet (no Books credentials —
 * documentation/SponsorX-Zoho-Credentials-and-Sandbox.md §6); the ingest is
 * proven against a simulated payload.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { cancelOrderAsSystem, lockOrder, OrderStateConflictError, payOrderIn } from "./marketplace-order";
import { remindersDue, usd, zohoInvoicePaid } from "./marketplace-order-rules";
import { appUrl, orderRef, sellerRecipients, sponsorRecipient, tell, utc } from "./order-mail";

type Tx = Prisma.TransactionClient;

/** A PENDING card attempt this recent may still be on the provider's page (the stand-in's link lasts an hour). */
export const PAYMENT_PAGE_MS = 60 * 60 * 1000;

/* ── Zoho Books: the invoice paid → the order paid ─────────────────────── */

export type OrderInvoicePayload = {
  invoiceId: string;
  dealId: string;
  number?: string | null;
  status: string;
  /** cents */
  amount: number;
  /** cents still owed */
  balance?: number | null;
  currency?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
};

export type OrderInvoiceOutcome =
  | { applied: true; invoiceId: string; status: string; orderId: string; orderPaid: boolean; note?: string }
  | { applied: false; reason: string };

/**
 * Apply a Zoho invoice to the marketplace order whose Deal it names — in the
 * worker's transaction (invoice.ts `ingestZohoInvoice`). Mirrors the invoice
 * wholesale (Zoho is right); if it is paid and the order is waiting for
 * payment, the order is paid. An invoice for less than the order's total
 * does not pay it; nor does one in another currency, nor one arriving for an
 * order already ended — each is audited for BTG to look at.
 */
export async function ingestOrderInvoice(
  tx: Tx,
  order: { id: string; tenantId: string },
  payload: OrderInvoicePayload,
  hash: string,
  now = new Date(),
): Promise<OrderInvoiceOutcome> {
  const existing = await tx.marketplaceOrderInvoice.findUnique({
    /* tenant-scope: worker-side ingest; the order was resolved from the Zoho Deal it carries. */
    where: { zohoInvoiceId: payload.invoiceId }, select: { id: true, lastSyncHash: true, orderId: true },
  });
  if (existing?.lastSyncHash === hash) return { applied: false, reason: "identical payload already applied" };
  if (existing && existing.orderId !== order.id) return { applied: false, reason: "this invoice is already attached to another order" };
  const data = {
    tenantId: order.tenantId, orderId: order.id, number: payload.number ?? null, status: payload.status, amount: payload.amount,
    balance: payload.balance ?? null, currency: payload.currency ?? "USD",
    issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : null, dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
    paidAt: payload.paidAt ? new Date(payload.paidAt) : null, lastSyncHash: hash, syncedAt: now,
  };
  const row = await tx.marketplaceOrderInvoice.upsert({
    where: { zohoInvoiceId: payload.invoiceId },
    create: { zohoInvoiceId: payload.invoiceId, ...data },
    update: data,
    select: { id: true, status: true },
  });
  await audit(tx, { userId: null, tenantId: order.tenantId }, "marketplaceOrder.invoiceSynced", "MarketplaceOrder", order.id, {
    after: { zohoInvoiceId: payload.invoiceId, number: payload.number ?? null, status: payload.status, amount: payload.amount, balance: payload.balance ?? null },
  });
  const base = { applied: true as const, invoiceId: row.id, status: row.status, orderId: order.id };
  if (!zohoInvoicePaid(payload.status, payload.balance)) return { ...base, orderPaid: false };

  /* The order's row lock first: a cancel committing now is waited for and read, never overwritten. */
  await lockOrder(tx, order.id);
  const current = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order resolved from the Zoho Deal, above. */
    where: { id: order.id }, select: { state: true, totalCents: true, currency: true },
  });
  const unmatched = (reason: string, extra: Record<string, unknown> = {}) =>
    audit(tx, { userId: null, tenantId: order.tenantId }, "marketplaceOrder.invoicePaidUnmatched", "MarketplaceOrder", order.id, {
      after: { zohoInvoiceId: payload.invoiceId, number: payload.number ?? null, orderState: current.state, amount: payload.amount, reason, ...extra },
    });
  if (current.state !== "AWAITING_PAYMENT" && current.state !== "APPROVED") {
    const already = ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"].includes(current.state);
    const note = already ? "the order is already paid" : `the order is ${current.state}, not waiting for payment`;
    /* Money arrived for an order that is not waiting for it (cancelled, refunded, never approved): BTG's to sort out by hand. */
    if (!already) await unmatched(note);
    return { ...base, orderPaid: false, note };
  }
  /* The invoice's currency must be the order's: an amount in another currency is not the order's total, whatever its number. */
  const currency = (payload.currency ?? "USD").trim().toUpperCase();
  if (currency !== current.currency.toUpperCase()) {
    const note = `the invoice is in ${currency}, but the order is in ${current.currency}`;
    await unmatched(note, { currency, orderCurrency: current.currency });
    return { ...base, orderPaid: false, note };
  }
  if (payload.amount < current.totalCents) {
    await audit(tx, { userId: null, tenantId: order.tenantId }, "marketplaceOrder.invoicePaidShort", "MarketplaceOrder", order.id, {
      after: { zohoInvoiceId: payload.invoiceId, amount: payload.amount, totalCents: current.totalCents },
    });
    return { ...base, orderPaid: false, note: `the invoice (${usd(payload.amount)}) is less than the order's total (${usd(current.totalCents)})` };
  }
  await payOrderIn(tx, { userId: null, tenantId: order.tenantId }, order.id, {
    via: "ZOHO_INVOICE", reference: payload.number ?? payload.invoiceId, receivedOn: (payload.paidAt ?? now.toISOString()).slice(0, 10),
    zohoInvoiceId: payload.invoiceId, invoiceNumber: payload.number ?? null,
  }, now);
  return { ...base, orderPaid: true };
}

/* ── unpaid orders: two reminders, then cancelled ──────────────────────── */

const ORDER = {
  id: true, tenantId: true, sponsorId: true, createdBy: true, billingEmail: true, billingName: true, totalCents: true,
  awaitingPaymentAt: true, paymentDueAt: true, paymentRemindersSent: true,
} as const;

/** Is a payment for this order in progress — being confirmed, or just started on the provider's page? */
async function paymentInProgress(tx: Tx, orderId: string, now: Date) {
  const attempt = await tx.paymentAttempt.findFirst({
    /* tenant-scope: this order's own attempts, named by its id. */
    where: { orderId, OR: [{ state: "PROCESSING" }, { state: "PENDING", createdAt: { gt: new Date(now.getTime() - PAYMENT_PAGE_MS) } }] },
    select: { id: true },
  });
  return Boolean(attempt);
}

/**
 * The worker's sweep over orders waiting for payment. Reminder 1 a day in,
 * reminder 2 two days in (a sweep that missed day one sends only the
 * second); cancelled at `paymentDueAt` unless a payment is in progress.
 * `tenantIds` limits the pass to named order books (a test, or a re-run for
 * one marketplace); the worker passes none — every one.
 */
export async function sweepUnpaidOrders(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const scope = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  const waiting = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the worker's sweep across every tenant (or the named ones); each order is handled in its own books. */
    where: { ...scope, state: "AWAITING_PAYMENT", awaitingPaymentAt: { not: null, lte: new Date(now.getTime() - 86_400_000) } },
    select: { id: true }, orderBy: { awaitingPaymentAt: "asc" }, take: 1000,
  });
  let reminded = 0;
  let cancelled = 0;
  let deferred = 0;
  let failed = 0;
  let skipped = 0;
  for (const { id } of waiting) {
    await prisma.$transaction(async (tx) => {
      /* The row lock first: a payment committing now (or starting) is waited
         for, and the checks below are made on the state the cancel moves from. */
      await lockOrder(tx, id);
      const o = await tx.marketplaceOrder.findFirst({
        /* tenant-scope: the order the sweep just listed, by id; re-read inside its transaction. */
        where: { id, state: "AWAITING_PAYMENT" }, select: ORDER,
      });
      if (!o?.awaitingPaymentAt || !o.paymentDueAt) return;
      const sponsor = await sponsorRecipient(tx, o);
      const orderUrl = appUrl(`/sponsor/orders/${o.id}`);
      if (now >= o.paymentDueAt) {
        if (await paymentInProgress(tx, o.id, now)) { deferred++; return; }
        const lines = await tx.orderLineDelivery.findMany({
          /* tenant-scope: this order's own delivery rows (its sellers), named by its id. */
          where: { orderId: o.id }, select: { lineId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, line: { select: { title: true, quantity: true } } },
        });
        try {
          await cancelOrderAsSystem(tx, o.id, "UNPAID", now);
        } catch (error) {
          /* Moved meanwhile (paid): nothing was written — leave it. */
          if (error instanceof OrderStateConflictError) { skipped++; return; }
          throw error;
        }
        cancelled++;
        if (sponsor) await tell(tx, sponsor, "order.cancelledUnpaid", o.id, { firstName: sponsor.firstName, orderRef: orderRef(o.id), amount: usd(o.totalCents), dueAt: utc(o.paymentDueAt), shopUrl: appUrl("/sponsor/marketplace"), orderUrl });
        /* Each seller once, with only their own lines. */
        const bySeller = new Map<string, { r: Awaited<ReturnType<typeof sellerRecipients>>[number]; lines: string[] }>();
        for (const d of lines) {
          for (const r of await sellerRecipients(tx, d)) {
            const k = r.email.toLowerCase();
            const e = bySeller.get(k) ?? { r, lines: [] };
            e.lines.push(`${d.line.title} (×${d.line.quantity})`);
            bySeller.set(k, e);
          }
        }
        for (const { r, lines: mine } of bySeller.values()) {
          await tell(tx, r, "sale.cancelled", o.id, { firstName: r.firstName, orderRef: orderRef(o.id), lines: mine.join("\n"), ordersUrl: appUrl(`/${r.portal === "athlete" ? "athlete" : "property"}/sales`) });
        }
        return;
      }
      const due = remindersDue(o.awaitingPaymentAt, now);
      if (due <= o.paymentRemindersSent) return;
      const claimed = await tx.marketplaceOrder.updateMany({
        /* tenant-scope: the order just re-read by id; conditional on the count, so a second pass sends nothing. */
        where: { id: o.id, state: "AWAITING_PAYMENT", paymentRemindersSent: o.paymentRemindersSent }, data: { paymentRemindersSent: due },
      });
      if (claimed.count === 0) return;
      await audit(tx, { userId: null, tenantId: o.tenantId }, "marketplaceOrder.paymentReminder", "MarketplaceOrder", o.id, { before: { paymentRemindersSent: o.paymentRemindersSent }, after: { paymentRemindersSent: due } });
      reminded++;
      if (sponsor) {
        await tell(tx, sponsor, "order.paymentReminder", `${o.id}:${due}`, {
          firstName: sponsor.firstName, orderRef: orderRef(o.id), amount: usd(o.totalCents), payBy: utc(o.paymentDueAt),
          final: due >= 2 ? "yes" : "", orderUrl,
        });
      }
    }).catch((error: unknown) => {
      failed++;
      console.error(`[unpaid orders] order ${id} failed, will retry next pass:`, error);
    });
  }
  return { reminded, cancelled, deferred, failed, skipped };
}
