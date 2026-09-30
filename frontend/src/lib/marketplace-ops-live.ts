/* --------------------------------------------------------------------------
   Marketplace operations — the pure pieces of 2S7-FE-02 (BTG's console) and
   the waiting-time labels 2S1-FE-02's verification queue shares.

   The order lifecycle is backend/src/domain/marketplace-order-rules.ts
   transcribed (documentation/SponsorX-Phase2-State-Machines.md §4): the
   console offers only moves the API would accept from the order's state,
   and never APPROVED as a transition — approval is the decision, not a move.
   Listing decisions are domain/listing.ts's decideListing: from
   PENDING_APPROVAL only.
   -------------------------------------------------------------------------- */

export type MarketplaceOrderState =
  | "PENDING_APPROVAL" | "APPROVED" | "AWAITING_PAYMENT" | "PAID" | "IN_DELIVERY" | "FULFILLED" | "CLOSED" | "CANCELLED" | "REFUNDED";

export const ORDER_STATES: readonly MarketplaceOrderState[] = [
  "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED",
];

const ORDER_TRANSITIONS: Readonly<Record<MarketplaceOrderState, readonly MarketplaceOrderState[]>> = {
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

/** The staff transitions POST /marketplace-orders/:id/transition accepts from
 *  this state. None before approval: a held order is decided, not moved. */
export function orderMoves(state: MarketplaceOrderState): MarketplaceOrderState[] {
  if (state === "PENDING_APPROVAL") return [];
  return (ORDER_TRANSITIONS[state] ?? []).filter((s) => s !== "APPROVED");
}

export type OrderDecision = "APPROVE" | "REJECT";
/** BTG's decisions on an order policy held — only while it is held. */
export function orderDecisions(state: MarketplaceOrderState): OrderDecision[] {
  return state === "PENDING_APPROVAL" ? ["APPROVE", "REJECT"] : [];
}

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export type ListingDecision = "APPROVE" | "REQUEST_CHANGES";
export function listingDecisions(state: ListingState): ListingDecision[] {
  return state === "PENDING_APPROVAL" ? ["APPROVE", "REQUEST_CHANGES"] : [];
}

export const ORDER_STATE_COPY: Record<MarketplaceOrderState, { label: string; tone: "neutral" | "primary" | "accent" | "danger" | "warn" }> = {
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warn" },
  APPROVED: { label: "Approved", tone: "accent" },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "primary" },
  PAID: { label: "Paid", tone: "accent" },
  IN_DELIVERY: { label: "In delivery", tone: "primary" },
  FULFILLED: { label: "Fulfilled", tone: "accent" },
  CLOSED: { label: "Closed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "danger" },
};

/** The button for each staff move — payment states are marked by hand
 *  today (there is no payment provider yet), and the words say so. */
export const MOVE_COPY: Record<MarketplaceOrderState, { label: string; hint: string; confirm?: boolean }> = {
  PENDING_APPROVAL: { label: "—", hint: "" },
  APPROVED: { label: "—", hint: "" },
  AWAITING_PAYMENT: { label: "Mark awaiting payment", hint: "The sponsor owes payment. It moves here on its own when they start paying by card." },
  PAID: { label: "Mark paid", hint: "Only for a payment made another way — card payments are marked paid by the payment provider. Makes the payables available in the ledger.", confirm: true },
  IN_DELIVERY: { label: "Mark in delivery", hint: "Delivery of the order's inventory has started." },
  FULFILLED: { label: "Mark fulfilled", hint: "Everything on the order was delivered." },
  CLOSED: { label: "Close order", hint: "Final. Releases the reserve held against it.", confirm: true },
  CANCELLED: { label: "Cancel order", hint: "Final. The stock goes back; a contracted order's books are reversed.", confirm: true },
  REFUNDED: { label: "Mark refunded", hint: "Final. The stock goes back and the order's books are reversed.", confirm: true },
};

export const isOrderState = (v: unknown): v is MarketplaceOrderState =>
  typeof v === "string" && (ORDER_STATES as readonly string[]).includes(v);

/* ── the API's shapes ─────────────────────────────────────────────────── */

export type ApiListing = {
  id: string;
  propertyId: string;
  inventoryItemId: string;
  title: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  state: ListingState;
  publishAt: string | null;
  submittedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  item: { id: string; title: string; kind: string; priceCents: number; quantity: number | null; availableUntil: string | null; active: boolean; athleteId: string | null; propertyId: string | null };
  propertyName: string;
  blockers: string[];
};

export type ApiOrderLine = {
  id: string;
  listingId: string;
  inventoryItemId: string;
  propertyId: string;
  title: string;
  quantity: number;
  startsOn: string;
  endsOn: string;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type ApiMarketplaceOrder = {
  id: string;
  sponsorId: string;
  reservationId: string | null;
  state: MarketplaceOrderState;
  currency: string;
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  requiresApproval: boolean;
  approvalReasons: string[];
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNotes: string | null;
  contractedAt: string | null;
  createdAt: string;
  lines: ApiOrderLine[];
};

export type ApiLineFinancials = {
  lineId: string;
  grossCents: number;
  discountCents: number;
  netCents: number;
  platformFeeCents: number;
  managementFeeCents: number;
  processingCents: number;
  propertyShareCents: number;
  referralCents: number;
  reserveCents: number;
  availableCents: number;
  teamShareBps: number | null;
  teamAvailableCents: number | null;
  teamReserveCents: number | null;
  athleteId: string | null;
  computedAt: string;
};

/** The split lines shown for each order line: the sale, what comes off it,
 *  and who is paid — for a roster athlete's item, the athlete and the team
 *  separately, each with what is available now and what the reserve holds.
 *  The payees and fees sum back to the sale exactly (the API's remainders). */
export type SplitRow = { label: string; cents: number; sub?: boolean };
export function splitRows(f: ApiLineFinancials): SplitRow[] {
  const rows: SplitRow[] = [{ label: "Sale", cents: f.grossCents }];
  if (f.discountCents) rows.push({ label: "Discount", cents: -f.discountCents });
  rows.push(
    { label: "BTG platform fee", cents: -f.platformFeeCents },
    { label: "BTG management fee", cents: -f.managementFeeCents },
    { label: "Card processing", cents: -f.processingCents },
    { label: "Referral fee", cents: -f.referralCents },
  );
  const payee = (label: string, available: number, reserve: number) => {
    rows.push({ label, cents: available + reserve });
    rows.push({ label: "available", cents: available, sub: true });
    rows.push({ label: "held in reserve", cents: reserve, sub: true });
  };
  if (f.athleteId && (f.teamAvailableCents !== null || f.teamReserveCents !== null)) {
    const teamAvailable = f.teamAvailableCents ?? 0;
    const teamReserve = f.teamReserveCents ?? 0;
    payee("Athlete", f.availableCents - teamAvailable, f.reserveCents - teamReserve);
    payee(`Team (${(f.teamShareBps ?? 0) / 100}% of the athlete's share)`, teamAvailable, teamReserve);
  } else {
    payee("Property", f.availableCents, f.reserveCents);
  }
  return rows;
}

/* ── figures ──────────────────────────────────────────────────────────── */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Integer cents from the API, as dollars. Negative shown with a minus. */
export function usd(cents: number): string {
  return USD.format(cents / 100);
}

/** How long something has waited, from an ISO time: "just now", "40 min",
 *  "5 h", "3 days". Null for no time. */
export function waitLabel(fromIso: string | null | undefined, now: number): string | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Waiting longer than two days is flagged — BTG's review target (simulated). */
export const OVERDUE_HOURS = 48;
export function isOverdue(fromIso: string | null | undefined, now: number): boolean {
  if (!fromIso) return false;
  const t = Date.parse(fromIso);
  return !Number.isNaN(t) && now - t > OVERDUE_HOURS * 3_600_000;
}

/** The order reference the sponsor sees ("SX-1A2B3C4D", lib/shop-live), so BTG and the buyer quote the same one. */
export const shortId = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;

/** A staff refusal, as copy. */
export function explainStaffRefusal(status: number, message: string | undefined): string {
  if (status === 403) return "Your role can't make this decision.";
  if (status === 409) return message ?? "This changed since the page loaded — reload to see where it stands.";
  if (status >= 500) return "The API had a problem — nothing changed. Try again in a minute.";
  return message ?? "That was refused. Check the note and try again.";
}
