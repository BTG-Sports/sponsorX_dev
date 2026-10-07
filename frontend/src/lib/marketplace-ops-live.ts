/* --------------------------------------------------------------------------
   Marketplace operations — the pure pieces of 2S7-FE-02 (BTG's console) and
   the waiting-time labels 2S1-FE-02's verification queue shares.

   The order lifecycle is backend/src/domain/marketplace-order-rules.ts
   transcribed (documentation/SponsorX-Phase2-State-Machines.md §4): the
   console offers only moves the API would accept from the order's state,
   and never APPROVED as a transition — approval is the decision, not a move.
   Listing decisions are domain/listing.ts's decideListing: from
   PENDING_APPROVAL only — which, since 2S3-BE-06, holds only the listings
   something flagged (restricted words, the seller's standing, a BTG
   pause); the rest go live on their own, and BTG pauses or ends those with
   a reason (btgActOnListing).
   -------------------------------------------------------------------------- */

export type MarketplaceOrderState =
  | "PENDING_SELLER" | "PENDING_APPROVAL" | "APPROVED" | "AWAITING_PAYMENT" | "PAID" | "IN_DELIVERY" | "FULFILLED" | "CLOSED" | "CANCELLED" | "REFUNDED";

export const ORDER_STATES: readonly MarketplaceOrderState[] = [
  "PENDING_SELLER", "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED",
];

const ORDER_TRANSITIONS: Readonly<Record<MarketplaceOrderState, readonly MarketplaceOrderState[]>> = {
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

/** The staff transitions POST /marketplace-orders/:id/transition accepts from
 *  this state. None before approval: a held order is decided, not moved —
 *  except that BTG may cancel one still waiting for its seller (2S4-BE-09). */
export function orderMoves(state: MarketplaceOrderState): MarketplaceOrderState[] {
  if (state === "PENDING_APPROVAL") return [];
  return (ORDER_TRANSITIONS[state] ?? []).filter((s) => s !== "APPROVED" && s !== "PENDING_APPROVAL");
}

/** 2S4-BE-10 — a payment BTG records by hand: how it arrived, its reference, the day it was received. */
export type ManualPaymentMethod = "BANK_TRANSFER" | "CHEQUE" | "OTHER";
export type ManualPayment = { method: ManualPaymentMethod; reference: string; receivedOn: string };
export const PAYMENT_METHOD_COPY: Record<ManualPaymentMethod, string> = { BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", OTHER: "Other" };
/** What is missing from a hand-recorded payment, in words BTG can act on. Empty means it can be sent. */
export function manualPaymentProblem(p: Partial<ManualPayment>, today: string): string | null {
  if (!p.method || !(p.method in PAYMENT_METHOD_COPY)) return "Choose how it was paid.";
  const ref = (p.reference ?? "").trim();
  if (!ref) return "Give the payment reference.";
  if (ref.length > 200) return "Keep the reference to 200 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.receivedOn ?? "")) return "Give the date the payment was received.";
  if ((p.receivedOn ?? "") > today) return "The date received can't be in the future.";
  return null;
}

export type OrderDecision = "APPROVE" | "REJECT";
/** BTG's decisions on an order policy held — only while it is held. */
export function orderDecisions(state: MarketplaceOrderState): OrderDecision[] {
  return state === "PENDING_APPROVAL" ? ["APPROVE", "REJECT"] : [];
}

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export type ListingDecision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";
export function listingDecisions(state: ListingState): ListingDecision[] {
  return state === "PENDING_APPROVAL" ? ["APPROVE", "REQUEST_CHANGES", "REJECT"] : [];
}

/** 2S3-BE-06 — BTG on a listing that is live, or that BTG paused. */
export type BtgListingAction = "PAUSE" | "END" | "RESUME";
export function btgListingActions(l: { state: ListingState; btgAction?: "PAUSED" | "ENDED" | null }): BtgListingAction[] {
  if (l.state === "PUBLISHED") return ["PAUSE", "END"];
  if (l.state === "PAUSED") return l.btgAction === "PAUSED" ? ["RESUME", "END"] : ["END"];
  return [];
}
/** Pause and End need a reason — the seller is emailed it. */
export const needsReason = (a: BtgListingAction) => a !== "RESUME";
export const BTG_ACTION_COPY: Record<BtgListingAction, { label: string; done: string; placeholder: string }> = {
  PAUSE: { label: "Pause", done: "Paused — the seller is emailed why", placeholder: "Why it's paused — the seller is emailed this" },
  END: { label: "End", done: "Ended — the seller is emailed why", placeholder: "Why it's ended — the seller is emailed this" },
  RESUME: { label: "Put back live", done: "Back live", placeholder: "" },
};

/**
 * The console's listing tabs: held for BTG; published automatically (the
 * last 30 days); and every live listing (2S3-FE-04), however it went live —
 * so BTG can pause or end any of them.
 */
export const LISTING_TABS = [
  { key: "held", label: "Held for BTG" },
  { key: "auto", label: "Published automatically" },
  { key: "live", label: "Live listings" },
] as const;
export type ListingTab = (typeof LISTING_TABS)[number]["key"];
export const listingTab = (v: unknown): ListingTab => (v === "auto" ? "auto" : v === "live" ? "live" : "held");
/** The "Live listings" page from `?page=` — 1-based, anything else is page 1. */
export function livePage(v: unknown): number {
  const n = typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : 1;
  return n >= 1 ? n : 1;
}
/** GET /listings/live's page block. */
export type ApiPage = { page: number; size: number; total: number; pages: number };

/**
 * The marketplace desk's queues (P1-ART-20) — one tile each on the queue
 * strip, in the order BTG works them; the picked one's rows show under it.
 */
export const QUEUES = [
  { key: "applications", label: "Property applications", short: "Applications" },
  { key: "listings", label: "Listings", short: "Listings" },
  { key: "orders", label: "Orders awaiting approval", short: "Orders" },
  { key: "payments", label: "Failed payments", short: "Payments" },
  { key: "payouts", label: "Payout problems", short: "Payouts" },
] as const;
export type QueueKey = (typeof QUEUES)[number]["key"];
/** `?queue=` from the URL; an old `?listings=` link (the listing emails) lands on the listings queue. */
export function queueKey(v: unknown, listings?: unknown): QueueKey | null {
  if (QUEUES.some((q) => q.key === v)) return v as QueueKey;
  if (typeof listings === "string" && listings) return "listings";
  return null;
}
/** The queue the desk opens on when the URL names none: the first with work in it, else applications. */
export function firstBusyQueue(counts: Record<QueueKey, number | null>): QueueKey {
  return QUEUES.find((q) => (counts[q.key] ?? 0) > 0)?.key ?? "applications";
}

/** "Published automatically" or "Approved by BTG" — how a listing went live. */
export function publishedByLabel(l: { publishedBy?: "AUTOMATIC" | "BTG" | null }): string | null {
  return l.publishedBy === "AUTOMATIC" ? "Published automatically" : l.publishedBy === "BTG" ? "Approved by BTG" : null;
}

/** Who sells it: the team, or the independent athlete. */
export function sellerLabel(l: Pick<ApiListing, "seller" | "propertyName">): string {
  if (l.seller) return l.seller.type === "ATHLETE" ? `${l.seller.name} (athlete)` : l.seller.name;
  return l.propertyName ?? "—";
}

export const ORDER_STATE_COPY: Record<MarketplaceOrderState, { label: string; tone: "neutral" | "primary" | "accent" | "danger" | "warn" }> = {
  PENDING_SELLER: { label: "Waiting for the seller", tone: "warn" },
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
  PENDING_SELLER: { label: "—", hint: "" },
  PENDING_APPROVAL: { label: "—", hint: "" },
  APPROVED: { label: "—", hint: "" },
  AWAITING_PAYMENT: { label: "Mark awaiting payment", hint: "The sponsor owes payment. It moves here on its own when they start paying by card." },
  PAID: { label: "Mark paid", hint: "Only for a payment made another way (bank transfer, cheque) — give the reference and the date it arrived. Card payments and Zoho invoices are marked paid on their own. Makes the payables available in the ledger.", confirm: true },
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
  propertyId: string | null;
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
  propertyName: string | null;
  blockers: string[];
  /* 2S3-BE-06 — the seller, how it went live, why it is held (BTG reads the reasons in full), and BTG's pause or end. */
  seller?: { type: "PROPERTY" | "ATHLETE"; id: string; name: string };
  publishedAt?: string | null;
  publishedAutomatically?: boolean;
  publishedBy?: "AUTOMATIC" | "BTG" | null;
  reviewReasons?: string[];
  btgAction?: "PAUSED" | "ENDED" | null;
  btgReason?: string | null;
  btgActedAt?: string | null;
};

export type ApiOrderLine = {
  id: string;
  listingId: string;
  inventoryItemId: string;
  /** null for an independent athlete's line (2S3-BE-05). */
  propertyId: string | null;
  sellerAthleteId?: string | null;
  /** Who sells the line: the team, or the independent athlete (2S3-FE-03). Optional: older reads. */
  seller?: { type: "PROPERTY" | "ATHLETE"; id: string; name: string } | null;
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

/* ── the console's money exceptions ───────────────────────────────────── */

/** GET /payments/failed — an order still owing payment whose latest card
 *  payment failed (backend domain/payouts.ts failedPayments). */
export type ApiFailedPayment = {
  orderId: string;
  orderRef: string;
  orderState: MarketplaceOrderState;
  totalCents: number;
  sponsorId: string;
  sponsorName: string;
  attemptId: string;
  amountCents: number;
  failureReason: string | null;
  failedAt: string;
  failedTries: number;
};

/** "1 failed try", "3 failed tries". */
export const failedTriesLabel = (n: number) => `${n} failed ${n === 1 ? "try" : "tries"}`;

/** The provider's reason, or plain words when it gave none. */
export const failureCopy = (reason: string | null | undefined) => reason?.trim() || "The payment provider gave no reason.";

/** When a failed payout last moved: handed to the provider (each retry
 *  re-sends it), else approved, else requested. Payouts carry no failedAt. */
export function payoutProblemSince(p: { sentAt: string | null; decidedAt: string | null; requestedAt: string }): string {
  return p.sentAt ?? p.decidedAt ?? p.requestedAt;
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

/** "40 min ago", "3 days ago", "just now"; "—" for no time. */
export function agoLabel(fromIso: string | null | undefined, now: number): string {
  const w = waitLabel(fromIso, now);
  return w === null ? "—" : w === "just now" ? w : `${w} ago`;
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
