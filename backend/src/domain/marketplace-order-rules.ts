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
