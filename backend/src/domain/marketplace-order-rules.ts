/**
 * The marketplace order's lifecycle and approval policy — 2S4-BE-03,
 * 2S4-BE-05. Pure.
 *
 * documentation/SponsorX-Phase2-State-Machines.md §4, transcribed:
 *
 *   PENDING_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → IN_DELIVERY → FULFILLED → CLOSED
 *   CANCELLED is reachable before PAID. REFUNDED is reachable from PAID or IN_DELIVERY
 *   (and from FULFILLED while no payout has been paid — there are no payouts yet, 2S5).
 *
 * Illegal, named: PENDING_APPROVAL → AWAITING_PAYMENT (no payment before BTG
 * approves); PAID → CANCELLED (after payment the way out is a refund);
 * changing the financial snapshot after APPROVED (Postgres refuses it —
 * prisma/sql/marketplace_order_immutable.sql).
 */
export type MarketplaceOrderState =
  | "PENDING_APPROVAL" | "APPROVED" | "AWAITING_PAYMENT" | "PAID" | "IN_DELIVERY" | "FULFILLED" | "CLOSED" | "CANCELLED" | "REFUNDED";
export const MARKETPLACE_ORDER_STATES: readonly MarketplaceOrderState[] = [
  "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED",
];

const TRANSITIONS: Readonly<Record<MarketplaceOrderState, readonly MarketplaceOrderState[]>> = {
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

/**
 * Why this order needs BTG's approval — empty means policy approves it.
 * SIMULATED policy, set with the programme owner on 2026-09-28: $1,000 or
 * more; a sponsor's first marketplace order; or a listing that asks for it.
 */
export function approvalReasons(o: { totalCents: number; thresholdCents: number; priorFulfilledOrders: number; listingsAsking: string[] }): string[] {
  const out: string[] = [];
  if (o.totalCents >= o.thresholdCents) out.push(`total of $${(o.totalCents / 100).toFixed(2)} is at or above $${(o.thresholdCents / 100).toFixed(2)}`);
  if (o.priorFulfilledOrders === 0) out.push("the sponsor's first marketplace order");
  for (const t of o.listingsAsking) out.push(`"${t}" asks for approval`);
  return out;
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
