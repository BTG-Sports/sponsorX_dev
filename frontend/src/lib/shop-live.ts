/* --------------------------------------------------------------------------
   Sponsor self-service buying — 2S4-FE-01 (shop, cart, reservation) and
   2S4-FE-02 (checkout, orders). The pure pieces: every figure the shop,
   cart, checkout and order screens show comes through one of these, from a
   named field of the API's answer.

   Wire shapes are the backend's (backend/src/domain/marketplace-search.ts,
   cart.ts, reservation.ts, marketplace-order.ts). Money is integer cents,
   formatted here as USD. Dates on the wire are ISO datetimes; the date
   pickers work in calendar days, sent as midnight UTC — the same instant the
   API's own "available from / until" messages are written against.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import type { ApiCheckout, ApiOrderAcceptance } from "@/lib/checkout-gate";

/* ------------------------------------------------------------------ shapes */

/** A COPY of backend/src/domain/inventory.ts INVENTORY_KINDS (Addendum B —
 *  the frontend cannot import the backend). A kind outside this list is
 *  dropped from the search rather than sent, since the API would 400 it. */
export const INVENTORY_KINDS = [
  "SOCIAL_POST",
  "VIDEO",
  "APPEARANCE",
  "AUTOGRAPH",
  "CAMP",
  "SIGNAGE",
  "TICKETS",
  "OTHER",
  "PACKAGE",
] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export type PackageRules = {
  minQuantity?: number;
  maxQuantity?: number;
  bundleOnly?: boolean;
  exclusive?: boolean;
  requiresApproval?: boolean;
} | null;

export type ApiSearchResult = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  /** null for an independent athlete's listing (2S3-BE-05) — `seller` names them. */
  property: { id: string; name: string; kind: string; stateCode: string | null; city: string | null } | null;
  seller?: { type: "PROPERTY" | "ATHLETE"; id: string; name: string };
  athlete: { displayName: string; sport: string | null; position: string | null } | null;
  item: {
    id: string;
    kind: string;
    priceCents: number;
    quantity: number | null;
    availableFrom: string | null;
    availableUntil: string | null;
    categories: string[];
    packageRules: PackageRules;
  };
};

export type ApiCartLine = {
  id: string;
  listingId: string;
  quantity: number;
  startsOn: string;
  endsOn: string;
  unitPriceCents: number;
  title: string;
  /** The team that sells it; null for an independent athlete's listing (2S3-BE-05). */
  propertyName: string | null;
  /** Who sells it — the team, or the independent athlete (2S3-FE-03). Optional: older reads. */
  sellerName?: string | null;
  lineTotalCents: number;
};

export type ApiCart = {
  id: string;
  sponsorId: string;
  currency: string;
  state: "ACTIVE" | "EXPIRED" | "CHECKED_OUT";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  lines: ApiCartLine[];
  totalCents: number;
  /** The live hold on this cart, or null (2S4-FE-01). */
  activeReservation: { id: string; expiresAt: string } | null;
};

export type ReservationState = "HELD" | "RELEASED" | "EXPIRED" | "CONVERTED";

export type ApiReservation = {
  id: string;
  sponsorId: string;
  cartId: string;
  state: ReservationState;
  expiresAt: string;
  releasedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  /** The order a CONVERTED hold became, else null (2S4-FE-02). */
  orderId: string | null;
  /** A live (HELD) hold's contract gate — the terms and the billing prefill; null otherwise (2S4-FE-02). */
  checkout: ApiCheckout | null;
};

export type OrderState =
  | "PENDING_SELLER"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "IN_DELIVERY"
  | "FULFILLED"
  | "CLOSED"
  | "CANCELLED"
  | "REFUNDED";

export type ApiOrderLine = {
  id: string;
  listingId: string;
  inventoryItemId: string;
  /** null for an independent athlete's line (2S3-BE-05) — `sellerAthleteId` / `seller` name them. */
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

export type ApiOrder = {
  id: string;
  sponsorId: string;
  reservationId: string;
  state: OrderState;
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
  /** 2S4-FE-02 — the billing contact confirmed at checkout (null on orders placed before the gate). */
  billingName: string | null;
  billingEmail: string | null;
  billingReference: string | null;
  acceptanceId: string | null;
  acceptance: ApiOrderAcceptance | null;
  lines: ApiOrderLine[];
  /* 2S4-BE-09 / -10 — the limit it was checked against, why it ended, the
     payment window, how it was paid, what it waits on, and the sellers'
     answers (optional: older reads and fixtures). */
  spendingLimitCents?: number | null;
  cancelReason?: "SPONSOR" | "BTG" | "BTG_REJECTED" | "SELLER_DECLINED" | "SELLER_NO_ANSWER" | "UNPAID" | null;
  awaitingPaymentAt?: string | null;
  paymentDueAt?: string | null;
  paidAt?: string | null;
  paidVia?: string | null;
  waitingOn?: "SELLER" | "BTG" | "PAYMENT" | null;
  deadlineAt?: string | null;
  sellerApprovals?: { id: string; seller: { type: string; id: string; name: string }; lineIds: string[]; state: string; dueAt: string; decidedAt: string | null; reason: string | null }[];
};

/** What a server action hands back to its island. `reasons` is every
 *  availability reason the API gave (409), never only the first. */
export type ShopResult = { ok: true } | { ok: false; message: string; reasons: string[] };

/* ------------------------------------------------------------------ money */

/** Integer cents → "$1,234.50". Commerce always shows the cents. */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "$12.50" → 1250; "" or junk → null. Filters are typed in dollars. */
export function dollarsToCents(v: string): number | null {
  const t = v.trim().replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/* ------------------------------------------------------------------ days */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day "YYYY-MM-DD" → midnight UTC ISO, or null. */
export function dayToIso(day: string): string | null {
  if (!DAY.test(day)) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null;
  return d.toISOString();
}

/** ISO datetime → its UTC calendar day, the value a date input holds. */
export function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const STAMP_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** "Oct 1, 2026" — a calendar day, in UTC so server and browser agree. */
export function fmtDay(iso: string): string {
  return DAY_FMT.format(new Date(iso));
}

/** "Oct 1, 3:42 PM UTC" — a moment (expiry, placed, decided). */
export function fmtStamp(iso: string): string {
  return STAMP_FMT.format(new Date(iso));
}

/** "Oct 1 – Oct 31, 2026", "from Oct 1, 2026", "any dates". */
export function windowLabel(from: string | null, until: string | null): string {
  if (from && until) return `${fmtDay(from)} – ${fmtDay(until)}`;
  if (from) return `from ${fmtDay(from)}`;
  if (until) return `until ${fmtDay(until)}`;
  return "any dates";
}

/* ------------------------------------------------------------ search query */

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** The filter form's values, exactly as typed — what the GET form re-renders. */
export type ShopFilters = {
  q: string;
  kind: string;
  category: string;
  sport: string;
  stateCode: string;
  minPrice: string;
  maxPrice: string;
  availableFrom: string;
  availableUntil: string;
};

export const FILTER_KEYS: (keyof ShopFilters)[] = [
  "q",
  "kind",
  "category",
  "sport",
  "stateCode",
  "minPrice",
  "maxPrice",
  "availableFrom",
  "availableUntil",
];

export function shopFilters(sp: SearchParams): ShopFilters {
  return Object.fromEntries(FILTER_KEYS.map((k) => [k, one(sp[k])])) as ShopFilters;
}

/** How many results one search asks for. The API has no paging (limit ≤ 100). */
export const SEARCH_LIMIT = 50;

/**
 * The URL's filters → `GET /marketplace/search` query string. Only values the
 * contract accepts are sent (SearchQuery in backend/src/contracts/marketplace.ts):
 * a kind or category outside its list, a state code that isn't two letters, a
 * price that isn't a number or a day that isn't a day is dropped and named in
 * `ignored`, so a typo narrows nothing instead of failing the page with a 400.
 * Prices are typed in dollars and sent in cents; days are sent as midnight UTC.
 */
export function searchApiQuery(sp: SearchParams): { query: string; ignored: string[] } {
  const f = shopFilters(sp);
  const out = new URLSearchParams();
  const ignored: string[] = [];

  if (f.q) out.set("q", f.q.slice(0, 200));
  if (f.kind) {
    if ((INVENTORY_KINDS as readonly string[]).includes(f.kind)) out.set("kind", f.kind);
    else ignored.push("type");
  }
  if (f.category) {
    if ((BRAND_CATEGORIES as readonly string[]).includes(f.category)) out.set("category", f.category);
    else ignored.push("category");
  }
  if (f.sport) out.set("sport", f.sport.slice(0, 60));
  if (f.stateCode) {
    if (/^[A-Za-z]{2}$/.test(f.stateCode)) out.set("stateCode", f.stateCode.toUpperCase());
    else ignored.push("state");
  }
  for (const [key, label] of [
    ["minPrice", "minimum price"],
    ["maxPrice", "maximum price"],
  ] as const) {
    if (!f[key]) continue;
    const cents = dollarsToCents(f[key]);
    if (cents === null) ignored.push(label);
    else out.set(key, String(cents));
  }
  for (const [key, label] of [
    ["availableFrom", "available from"],
    ["availableUntil", "available until"],
  ] as const) {
    if (!f[key]) continue;
    const iso = dayToIso(f[key]);
    if (iso === null) ignored.push(label);
    else out.set(key, iso);
  }
  out.set("limit", String(SEARCH_LIMIT));
  return { query: `?${out.toString()}`, ignored };
}

/** True when any filter is set — the empty state then says "loosen them". */
export function hasFilters(f: ShopFilters): boolean {
  return FILTER_KEYS.some((k) => f[k] !== "");
}

export function kindLabel(kind: string): string {
  if (kind === "SOCIAL_POST") return "Social post";
  const s = kind.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const KIND_OPTIONS = INVENTORY_KINDS.map((k) => ({ value: k, label: kindLabel(k) }));
export const CATEGORY_OPTIONS = BRAND_CATEGORIES.map((c: BrandCategory) => ({ value: c, label: categoryLabel(c) }));

/** "Westfield Hawks · school · Laurel, MD". */
export function propertyLine(p: NonNullable<ApiSearchResult["property"]>): string {
  const place = [p.city, p.stateCode].filter(Boolean).join(", ");
  return [p.name, p.kind.replace(/_/g, " ").toLowerCase(), place].filter(Boolean).join(" · ");
}

/** Who sells it: the property line, or — an independent athlete's listing has
 *  no property (2S3-BE-05) — the athlete's display name. */
export function sellerLine(r: Pick<ApiSearchResult, "property" | "seller" | "athlete">): string {
  if (r.property) return propertyLine(r.property);
  return `${r.seller?.name ?? r.athlete?.displayName ?? "Athlete"} · independent athlete`;
}

/** "Riley Carter · Basketball" or null. */
export function athleteLine(a: ApiSearchResult["athlete"]): string | null {
  if (!a) return null;
  return [a.displayName, a.sport, a.position].filter(Boolean).join(" · ");
}

/** The package rules a buyer needs to know before adding, as plain lines. */
export function ruleNotes(rules: PackageRules): string[] {
  if (!rules) return [];
  const out: string[] = [];
  if (rules.minQuantity != null && rules.maxQuantity != null) out.push(`${rules.minQuantity}–${rules.maxQuantity} per purchase`);
  else if (rules.minQuantity != null) out.push(`at least ${rules.minQuantity} per purchase`);
  else if (rules.maxQuantity != null) out.push(`at most ${rules.maxQuantity} per purchase`);
  if (rules.exclusive) out.push("exclusive — one buyer per date window");
  if (rules.requiresApproval) out.push("the seller approves orders that include this, within 48 hours");
  return out;
}

/* --------------------------------------------------------- date windows */

export type LineDraft = { quantity: number; startsOn: string; endsOn: string };
export type ItemWindow = { availableFrom: string | null; availableUntil: string | null; packageRules?: PackageRules };

/**
 * What is wrong with a line before it is sent, in the API's own words
 * (backend/src/domain/availability.ts) — so the check here and the refusal
 * there read the same. The API still decides; this saves a round trip.
 */
export function validateLine(draft: LineDraft, item?: ItemWindow): string[] {
  const out: string[] = [];
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) out.push("quantity must be at least 1");
  else if (draft.quantity > 1000) out.push("at most 1,000 in one line");
  const start = dayToIso(draft.startsOn);
  const end = dayToIso(draft.endsOn);
  if (!start) out.push("pick a start date");
  if (!end) out.push("pick an end date");
  if (start && end && end < start) out.push("the end date is before the start date");
  if (item?.availableFrom && start && start < item.availableFrom) out.push(`available from ${fmtDay(item.availableFrom)}`);
  if (item?.availableUntil && end && end > item.availableUntil) out.push(`available until ${fmtDay(item.availableUntil)}`);
  const rules = item?.packageRules;
  if (rules?.maxQuantity != null && draft.quantity > rules.maxQuantity) out.push(`at most ${rules.maxQuantity} per purchase`);
  if (rules?.minQuantity != null && draft.quantity < rules.minQuantity) out.push(`at least ${rules.minQuantity} per purchase`);
  return out;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The dates the add-to-cart form opens with: from the later of today and the
 * item's first day, to the item's last day — or thirty days on when it has
 * none. `today` is passed in (the server's day) so the form renders the same
 * on the server and in the browser.
 */
export function defaultWindow(item: ItemWindow, today: string): { startsOn: string; endsOn: string } {
  const first = item.availableFrom ? isoDay(item.availableFrom) : today;
  const startsOn = first > today ? first : today;
  const last = item.availableUntil ? isoDay(item.availableUntil) : addDays(startsOn, 30);
  return { startsOn, endsOn: last < startsOn ? startsOn : last };
}

/** The quantity the add form opens with — the package's minimum, else 1. */
export function defaultQuantity(rules: PackageRules): number {
  return rules?.minQuantity != null && rules.minQuantity > 1 ? rules.minQuantity : 1;
}

/* ------------------------------------------------------------- refusals */

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    issues?: Array<{ message?: string }>;
    reasons?: Array<{ code?: string; message?: string }>;
    problems?: unknown;
  };
};

/**
 * An API refusal → the message and EVERY reason, for the island to list.
 * 409 availability refusals carry `reasons[{code,message}]`; Zod 400s carry
 * `issues`; some rules carry `problems`. The status line is the last resort.
 */
export function refusalFrom(status: number, body: unknown): { message: string; reasons: string[] } {
  const e = (body as ErrorBody | null)?.error;
  const reasons = (e?.reasons ?? []).map((r) => r.message).filter((m): m is string => typeof m === "string" && m.length > 0);
  const issues = (e?.issues ?? []).map((i) => i.message).filter((m): m is string => typeof m === "string" && m.length > 0);
  const problems = Array.isArray(e?.problems)
    ? e.problems.map((p) => (typeof p === "string" ? p : (p as { message?: string })?.message)).filter((m): m is string => typeof m === "string")
    : [];
  if (status === 403) {
    return { message: "Your role can't do this — a Sponsor Admin buys for your organisation.", reasons: [] };
  }
  if (reasons.length) return { message: "Not available as asked:", reasons };
  const message = issues[0] ?? e?.message ?? `The request was refused (HTTP ${status}).`;
  const rest = (issues.length ? issues : problems).filter((m) => m !== message);
  return { message, reasons: rest };
}

/* ---------------------------------------------------------------- states */

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

export const RESERVATION_COPY: Record<ReservationState, { label: string; tone: Tone }> = {
  HELD: { label: "Held for you", tone: "accent" },
  RELEASED: { label: "Released", tone: "neutral" },
  EXPIRED: { label: "Hold ended", tone: "warn" },
  CONVERTED: { label: "Ordered", tone: "primary" },
};

export const ORDER_COPY: Record<OrderState, { label: string; tone: Tone; hint: string }> = {
  /* 2S4-BE-09 — a listing on it asks its seller first; they have 48 hours. */
  PENDING_SELLER: { label: "Waiting for the seller", tone: "warn", hint: "The seller has 48 hours to accept. The items stay yours while they decide." },
  PENDING_APPROVAL: { label: "Held for BTG", tone: "warn", hint: "The order is above your spending limit, so BTG checks it before it is confirmed. The items stay yours while they do." },
  /* 2S4-BE-09 / -10 — approved on its own within the sponsor's limit (or by BTG above it); paid by card within 3 days. */
  APPROVED: { label: "Approved", tone: "primary", hint: "Your order is approved. Pay the total by card within 3 days to lock in the dates." },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "warn", hint: "Pay the total by card within 3 days, or the order is cancelled and the dates released." },
  PAID: { label: "Paid", tone: "accent", hint: "Payment is recorded. Sellers deliver on the dates of each line." },
  IN_DELIVERY: { label: "In delivery", tone: "primary", hint: "Sellers are delivering the items." },
  FULFILLED: { label: "Fulfilled", tone: "accent", hint: "Every item has been delivered." },
  CLOSED: { label: "Closed", tone: "neutral", hint: "This order is complete and closed." },
  CANCELLED: { label: "Cancelled", tone: "neutral", hint: "This order was cancelled and its items went back on sale." },
  REFUNDED: { label: "Refunded", tone: "neutral", hint: "This order was refunded." },
};

export function orderCopy(state: string): { label: string; tone: Tone; hint: string } {
  return ORDER_COPY[state as OrderState] ?? { label: state, tone: "neutral", hint: "" };
}

export function reservationCopy(state: string): { label: string; tone: Tone } {
  return RESERVATION_COPY[state as ReservationState] ?? { label: state, tone: "neutral" };
}

/** A sponsor may cancel only before payment (Phase 2 state machine §4). */
const CANCELLABLE: ReadonlySet<OrderState> = new Set(["PENDING_SELLER", "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT"]);
export function canCancel(state: string): boolean {
  return CANCELLABLE.has(state as OrderState);
}

/** The order states the orders list may filter by — the API does not
 *  validate `?state=`, so only these are ever sent. */
export const ORDER_STATES: OrderState[] = [
  "PENDING_SELLER",
  "PENDING_APPROVAL",
  "APPROVED",
  "AWAITING_PAYMENT",
  "PAID",
  "IN_DELIVERY",
  "FULFILLED",
  "CLOSED",
  "CANCELLED",
  "REFUNDED",
];
export function orderStateParam(v: string | string[] | undefined): OrderState | null {
  return typeof v === "string" && (ORDER_STATES as string[]).includes(v) ? (v as OrderState) : null;
}

/** "SX-1A2B3C4D" — a short reference for an order id, for people. */
export function orderRef(id: string): string {
  return `SX-${id.slice(-8).toUpperCase()}`;
}

export type SellerFields = {
  propertyName?: string | null;
  sellerName?: string | null;
  propertyId?: string | null;
  sellerAthleteId?: string | null;
  seller?: { type: string; id: string; name: string } | null;
  listingId?: string;
};

/** A cart or order line as checkout and the order page list it. */
export type ShopLine = SellerFields & {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  startsOn: string;
  endsOn: string;
  lineTotalCents: number;
};

/** Who sells a cart or order line, for people: the team, or the independent
 *  athlete — an athlete's line has no property (2S3-FE-03). */
export function lineSeller(l: SellerFields): string {
  return l.seller?.name ?? l.sellerName ?? l.propertyName ?? (l.propertyId ? "The team" : "Independent athlete");
}

/** One seller, once: by id where the line carries one, else by its name. */
function sellerKey(l: SellerFields): string {
  if (l.seller) return `${l.seller.type}:${l.seller.id}`;
  if (l.propertyId) return `PROPERTY:${l.propertyId}`;
  if (l.sellerAthleteId) return `ATHLETE:${l.sellerAthleteId}`;
  const name = l.sellerName ?? l.propertyName;
  return name ? `NAME:${name}` : `LISTING:${l.listingId ?? "?"}`;
}

/** "3 items · 2 sellers" over the cart's or order's lines — an athlete
 *  selling with no team counts as a seller of their own (2S3-FE-03). */
export function lineSummary(lines: Array<{ quantity: number } & SellerFields>): string {
  const items = lines.reduce((s, l) => s + l.quantity, 0);
  const sellers = new Set(lines.map(sellerKey)).size;
  return `${items} ${items === 1 ? "item" : "items"} · ${sellers} ${sellers === 1 ? "seller" : "sellers"}`;
}

/* -------------------------------------------------------------- countdown */

/** The hold's time left: "12:48", or expired. Seconds, floored, never negative. */
export function countdown(expiresAtIso: string, nowMs: number): { expired: boolean; seconds: number; label: string } {
  const seconds = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - nowMs) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return { expired: seconds === 0, seconds, label: `${m}:${String(s).padStart(2, "0")}` };
}
