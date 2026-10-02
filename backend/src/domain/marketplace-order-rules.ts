/**
 * The marketplace order's lifecycle and approval policy — 2S4-BE-03,
 * 2S4-BE-05, 2S4-BE-09, 2S4-BE-10. Pure.
 *
 * documentation/SponsorX-Phase2-State-Machines.md §4, transcribed, with the
 * seller's step 2S4-BE-09 adds in front:
 *
 *   PENDING_SELLER → PENDING_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → IN_DELIVERY → FULFILLED → CLOSED
 *   (PENDING_SELLER → APPROVED, and PENDING_APPROVAL → APPROVED, when there is no further reason to hold it)
 *   CANCELLED is reachable before PAID. REFUNDED is reachable from PAID or IN_DELIVERY
 *   (and from FULFILLED while no payout has been paid).
 *
 * Illegal, named: PENDING_APPROVAL → AWAITING_PAYMENT (no payment before BTG
 * approves); PAID → CANCELLED (after payment the way out is a refund);
 * changing the financial snapshot after placement (Postgres refuses it —
 * prisma/sql/marketplace_order_immutable.sql).
 */
export type MarketplaceOrderState =
  | "PENDING_SELLER" | "PENDING_APPROVAL" | "APPROVED" | "AWAITING_PAYMENT" | "PAID" | "IN_DELIVERY" | "FULFILLED" | "CLOSED" | "CANCELLED" | "REFUNDED";
export const MARKETPLACE_ORDER_STATES: readonly MarketplaceOrderState[] = [
  "PENDING_SELLER", "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED",
];

const TRANSITIONS: Readonly<Record<MarketplaceOrderState, readonly MarketplaceOrderState[]>> = {
  PENDING_SELLER: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["IN_DELIVERY", "REFUNDED"],
  IN_DELIVERY: ["FULFILLED", "REFUNDED"],
  FULFILLED: ["CLOSED", "REFUNDED"],
  CLOSED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionMarketplaceOrder(from: MarketplaceOrderState, to: MarketplaceOrderState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalMarketplaceOrderTransitionError extends Error {
  readonly status = 409;
  constructor(from: MarketplaceOrderState, to: MarketplaceOrderState) {
    super(`An order cannot go from ${from} to ${to}. Legal moves from ${from}: ${TRANSITIONS[from].join(", ") || "none — it is terminal"}.`);
    this.name = "IllegalMarketplaceOrderTransitionError";
  }
}

/** States where the order's stock is contracted — APPROVED onward, until it ends. */
export const CONTRACTED: ReadonlySet<MarketplaceOrderState> = new Set(["APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);
/** Ending states that hand the stock back. */
export const RELEASES: ReadonlySet<MarketplaceOrderState> = new Set(["CANCELLED", "REFUNDED"]);

/** Why an order was cancelled — recorded on the order (cancelReason). */
export type CancelReason = "SPONSOR" | "BTG" | "BTG_REJECTED" | "SELLER_DECLINED" | "SELLER_NO_ANSWER" | "UNPAID";

/* ── the timers — 2S4-BE-09 / 2S4-BE-10 ─────────────────────────────────── */

/** The seller's window to accept or decline an order a listing of theirs asks to approve. */
export const SELLER_APPROVAL_HOURS = 48;
/** The sponsor is reminded this many days after the order is waiting for payment… */
export const PAYMENT_REMINDER_DAYS = [1, 2] as const;
/** …and an order still unpaid this many days after is cancelled. */
export const PAYMENT_WINDOW_DAYS = 3;
/** How the money arrived. CARD and ZOHO_INVOICE are recorded by the system; the rest by BTG. */
export const PAYMENT_METHODS = ["CARD", "ZOHO_INVOICE", "BANK_TRANSFER", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MANUAL_PAYMENT_METHODS = ["BANK_TRANSFER", "CHEQUE", "OTHER"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/** How many reminders an order waiting since `since` should have had by `now` (0, 1 or 2). Pure. */
export function remindersDue(since: Date, now: Date): number {
  const days = (now.getTime() - since.getTime()) / 86_400_000;
  return PAYMENT_REMINDER_DAYS.filter((d) => days >= d).length;
}

/** "$12,000.00" — the way the reasons and emails write money. */
export const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── the spending limit — 2S4-BE-09 ─────────────────────────────────────── */

/**
 * What moves a sponsor's limit, read from their own records
 * (spending-limit.ts): an order COMPLETED (it reached FULFILLED — paid and
 * delivered); an order REFUNDED; a delivery problem BTG UPHELD by refunding
 * the line.
 */
export type LimitEvent =
  | { kind: "COMPLETED"; at: Date; orderId: string; totalCents: number }
  | { kind: "REFUNDED"; at: Date; orderId: string }
  | { kind: "PROBLEM_UPHELD"; at: Date; orderId: string; lineId: string };

export type LimitHistoryEntry = {
  at: Date; kind: LimitEvent["kind"]; orderId: string; totalCents: number | null;
  limitBeforeCents: number; limitAfterCents: number; note: string;
};

export type SpendingLimit = {
  limitCents: number; startCents: number; capCents: number;
  /** The largest order completed while the limit could still rise. */
  largestCompletedCents: number;
  /** A refund or an upheld problem stopped it rising — when, and which order. */
  frozen: { at: Date; kind: "REFUNDED" | "PROBLEM_UPHELD"; orderId: string } | null;
  /** Oldest first — every event and what it did to the limit. */
  history: LimitHistoryEntry[];
};

/**
 * The sponsor's spending limit, replayed from its events. Pure.
 *
 * It starts at `startCents`. Each order COMPLETED makes it
 * max(start, 2 × the largest completed order), capped at `capCents`. The
 * first refund or upheld problem STOPS it rising: it stays at the value it
 * had then (it never falls), and later completions leave it there. Events
 * are taken in time order; at the same instant a stop counts before a
 * completion, so an order refunded as it completed never raises it.
 */
export function spendingLimit(events: readonly LimitEvent[], o: { startCents: number; capCents: number }): SpendingLimit {
  const order = (e: LimitEvent) => (e.kind === "COMPLETED" ? 1 : 0);
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime() || order(a) - order(b) || a.orderId.localeCompare(b.orderId));
  let limit = Math.min(o.startCents, o.capCents);
  let largest = 0;
  let frozen: SpendingLimit["frozen"] = null;
  const history: LimitHistoryEntry[] = [];
  for (const e of sorted) {
    const before = limit;
    if (e.kind === "COMPLETED") {
      if (frozen) {
        history.push({ at: e.at, kind: e.kind, orderId: e.orderId, totalCents: e.totalCents, limitBeforeCents: before, limitAfterCents: before, note: `Completed ${usd(e.totalCents)} — the limit stays at ${usd(before)}: it stopped rising after a ${frozen.kind === "REFUNDED" ? "refund" : "delivery problem BTG upheld"}.` });
        continue;
      }
      largest = Math.max(largest, e.totalCents);
      limit = Math.min(o.capCents, Math.max(o.startCents, 2 * largest));
      const why = limit === o.capCents && 2 * largest >= o.capCents ? `the cap of ${usd(o.capCents)}` : 2 * largest > o.startCents ? `twice the largest completed order (${usd(largest)})` : `the starting limit`;
      history.push({ at: e.at, kind: e.kind, orderId: e.orderId, totalCents: e.totalCents, limitBeforeCents: before, limitAfterCents: limit, note: `Completed ${usd(e.totalCents)} — the limit is ${usd(limit)}, ${why}.` });
      continue;
    }
    const word = e.kind === "REFUNDED" ? "Refunded" : "A delivery problem BTG upheld (line refunded)";
    if (!frozen) {
      frozen = { at: e.at, kind: e.kind, orderId: e.orderId };
      history.push({ at: e.at, kind: e.kind, orderId: e.orderId, totalCents: null, limitBeforeCents: before, limitAfterCents: before, note: `${word} — the limit stops rising and stays at ${usd(before)}.` });
    } else {
      history.push({ at: e.at, kind: e.kind, orderId: e.orderId, totalCents: null, limitBeforeCents: before, limitAfterCents: before, note: `${word} — the limit had already stopped rising; it stays at ${usd(before)}.` });
    }
  }
  return { limitCents: limit, startCents: o.startCents, capCents: o.capCents, largestCompletedCents: largest, frozen, history };
}

/**
 * Why this order waits for BTG — empty means the limit approves it. An order
 * within the sponsor's limit (equal included) is approved automatically,
 * their first order too; above it, BTG decides (programme owner, 2026-10-02).
 * A listing that asks for approval asks its SELLER, not BTG (sellerAsks).
 */
export function approvalReasons(o: { totalCents: number; limitCents: number; sponsorName: string }): string[] {
  return o.totalCents > o.limitCents ? [`${usd(o.totalCents)} is above ${o.sponsorName}'s limit of ${usd(o.limitCents)}`] : [];
}

export function feeFor(subtotalCents: number, bps: number): number {
  return Math.round((subtotalCents * bps) / 10_000);
}

/* ── the contract gate — 2S4-FE-02 ──────────────────────────────────────── */

/** The agreement kind a sponsor accepts to place a marketplace order —
 *  `agreements/MARKETPLACE_ORDER.v<n>.txt`, placeholder wording pending counsel. */
export const MARKETPLACE_ORDER_TERMS_KIND = "MARKETPLACE_ORDER";

export type BillingContact = { name: string; email: string; reference?: string | null };

/**
 * A card number typed into the PO / reference box: 13–19 digits (spaces and
 * dashes ignored) that pass the Luhn check. SponsorX never takes card or bank
 * numbers (§26), so a free-text field must not become a way to store one.
 */
export function looksLikeCardNumber(s: string): boolean {
  const digits = s.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** What is wrong with a billing contact, in words the sponsor can act on. Empty means fine. */
export function billingProblems(b: Partial<BillingContact> | null | undefined): string[] {
  const out: string[] = [];
  if (!b?.name?.trim()) out.push("the billing contact's name");
  if (!b?.email?.trim()) out.push("the billing contact's email");
  if (b?.reference && looksLikeCardNumber(b.reference)) out.push("a PO or reference that is not a card number — SponsorX never takes card or bank numbers");
  return out;
}

/* ── payment — 2S4-BE-10 ────────────────────────────────────────────────── */

export type ManualPayment = { method: ManualPaymentMethod; reference: string; receivedOn: string };

/**
 * What is wrong with a payment BTG records by hand, in words BTG can act on.
 * Empty means fine. The reference is required (at most 200 characters) and
 * is never a card number; the date received is a real date, not in the future.
 */
export function manualPaymentProblems(p: Partial<ManualPayment> | null | undefined, now: Date): string[] {
  const out: string[] = [];
  if (!p?.method || !(MANUAL_PAYMENT_METHODS as readonly string[]).includes(p.method)) out.push("how it was paid (bank transfer, cheque or other)");
  const ref = p?.reference?.trim() ?? "";
  if (!ref) out.push("the payment reference");
  else if (ref.length > 200) out.push("a payment reference of at most 200 characters");
  else if (looksLikeCardNumber(ref)) out.push("a payment reference that is not a card number — SponsorX never takes card or bank numbers");
  const day = p?.receivedOn ?? "";
  const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!when || Number.isNaN(when.getTime()) || when.toISOString().slice(0, 10) !== day) out.push("the date the payment was received");
  else if (day > now.toISOString().slice(0, 10)) out.push("a date received that is not in the future");
  return out;
}

/** Zoho Books' word that an invoice is settled: status "paid", or nothing left owing on a live invoice. Pure. */
export function zohoInvoicePaid(status: string, balanceCents: number | null | undefined): boolean {
  const s = status.trim().toLowerCase();
  if (s === "paid") return true;
  return balanceCents === 0 && s !== "void" && s !== "draft";
}
