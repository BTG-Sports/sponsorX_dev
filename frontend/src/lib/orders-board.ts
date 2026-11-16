/* --------------------------------------------------------------------------
   POL-FE-98 — the sponsor's Orders list, drawn like the athlete's Inventory,
   Listings and Sales (POL-FE-83/84/95), on the Stadium Board. Pure: what
   each order says, from one GET /marketplace-orders row and the API's tab
   counts. Nothing here invents a number (memory: stats-must-be-retrievable).

   The old page was a table led by an order reference ("SX-7F3A9C21"), a
   status chip and four KPI tiles; the owner found it confusing. Each order
   now answers three questions, in this order:
     1. what you bought, from whom, and what it costs;
     2. what happens next, as a sentence, and whether it's YOUR move (pay);
     3. where it is on its way: Placed → Approved → Paid → Delivered — the
        same four stops as the order's own page (POL-FE-94).
   -------------------------------------------------------------------------- */

import { dayOf, hoursLeft, inWords, stamp } from "@/lib/order-automation-live";
import { orderRef, usd, type ApiOrder } from "@/lib/shop-live";

/** Where an order is on its way — each has its own light on screen. */
export type OrderStage = "wait" | "pay" | "deliver" | "done" | "ended";

export type OrderStop = { label: "Placed" | "Approved" | "Paid" | "Delivered"; state: "done" | "now" | "todo" | "ended" };

export type OrderCard = {
  id: string;
  ref: string;
  /** The first item's title. */
  title: string;
  /** How many other items the order holds ("+ 2 more"). */
  more: number;
  /** Every item's title, for the screen reader and the hover title. */
  all: string;
  /** "From Coastal FC", "From Coastal FC and 2 others", "" when unknown. */
  from: string;
  /** The seller's initials for the avatar ("CF"); "" when unknown. */
  initials: string;
  /** "Nov 20 – Dec 3", "Nov 20", "" when no line has dates. */
  dates: string;
  /** "Placed Nov 14". */
  placed: string;
  total: string;
  stage: OrderStage;
  /** The short status on the pill. */
  label: string;
  /** It's the sponsor's move: pay. */
  move: boolean;
  /** What happens next, as a sentence, and the line under it. */
  next: { title: string; hint: string };
  /** A deadline that matters right now ("Pay within 2 days"); null when none. */
  due: { text: string; urgent: boolean } | null;
  /** The call to action, in words (the whole card opens the order). */
  cta: string;
  stops: OrderStop[];
  /** How many of the three gaps between stops are lit (0–3). */
  progress: number;
  ended: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return ((words[0]![0] ?? "") + (words.length > 1 ? (words[words.length - 1]![0] ?? "") : (words[0]![1] ?? ""))).toUpperCase();
}

/** The span of dates the order's items run on. */
function spanOf(lines: ApiOrder["lines"]): string {
  const starts = lines.map((l) => l.startsOn).filter((x): x is string => Boolean(x)).sort();
  const ends = lines.map((l) => l.endsOn ?? l.startsOn).filter((x): x is string => Boolean(x)).sort();
  if (starts.length === 0) return "";
  const a = dayOf(starts[0]!);
  const b = dayOf(ends[ends.length - 1] ?? starts[0]!);
  return a === b ? a : `${a} – ${b}`;
}

/** How many stops are behind the order (as order-summary's journey counts them). */
function behindOf(o: Pick<ApiOrder, "state" | "paidAt" | "decidedAt" | "awaitingPaymentAt">): number {
  switch (o.state) {
    case "PENDING_SELLER":
    case "PENDING_APPROVAL":
      return 1;
    case "APPROVED":
    case "AWAITING_PAYMENT":
      return 2;
    case "PAID":
    case "IN_DELIVERY":
      return 3;
    case "FULFILLED":
    case "CLOSED":
      return 4;
    default:
      return o.paidAt ? 3 : o.decidedAt || o.awaitingPaymentAt ? 2 : 1;
  }
}

const STOP_LABELS: OrderStop["label"][] = ["Placed", "Approved", "Paid", "Delivered"];

export function orderStops(o: Pick<ApiOrder, "state" | "paidAt" | "decidedAt" | "awaitingPaymentAt">): { stops: OrderStop[]; progress: number } {
  const behind = behindOf(o);
  const ended = o.state === "CANCELLED" || o.state === "REFUNDED";
  const stops = STOP_LABELS.map((label, i): OrderStop => ({
    label,
    state: i < behind ? "done" : i === behind ? (ended ? "ended" : "now") : "todo",
  }));
  return { stops, progress: Math.min(behind, 3) };
}

const CANCELLED_BY: Record<string, string> = {
  SPONSOR: "You cancelled this order",
  BTG: "BTG cancelled this order",
  BTG_REJECTED: "BTG didn’t approve this order",
  SELLER_DECLINED: "The seller declined this order",
  SELLER_NO_ANSWER: "The seller didn’t answer in time",
  UNPAID: "It wasn’t paid in time",
};

/**
 * The order's words. `paymentsOpen` is the summary's switch (POL-BE-72):
 * false while card payment is closed, when an approved order reads
 * "Approved" and asks nothing of the sponsor.
 */
export function orderCard(o: ApiOrder, now: Date = new Date(), paymentsOpen?: boolean): OrderCard {
  const lines = o.lines ?? [];
  const sellers = [...new Set(lines.map((l) => l.seller?.name).filter((x): x is string => Boolean(x)))];
  const one = sellers.length === 1 ? sellers[0]! : null;
  const from = sellers.length === 0 ? "" : sellers.length === 1 ? `From ${sellers[0]}` : `From ${sellers[0]} and ${plural(sellers.length - 1, "other")}`;
  const total = usd(o.totalCents);
  const dates = spanOf(lines);

  let stage: OrderStage;
  let label: string;
  let move = false;
  let cta = "View order";
  let next: OrderCard["next"];
  let due: OrderCard["due"] = null;

  switch (o.state) {
    case "PENDING_SELLER": {
      stage = "wait";
      label = "Waiting for the seller";
      const left = o.deadlineAt ? inWords(o.deadlineAt, now) : null;
      next = {
        title: one ? `${one} is deciding` : sellers.length > 1 ? "The sellers are deciding" : "The seller is deciding",
        hint: o.deadlineAt ? `They have until ${stamp(o.deadlineAt)} to accept. Nothing is charged yet.` : "They have 48 hours to accept. Nothing is charged yet.",
      };
      if (left) due = { text: `Answer due ${left}`, urgent: false };
      break;
    }
    case "PENDING_APPROVAL":
      stage = "wait";
      label = "BTG is checking";
      next = { title: "BTG is checking your order", hint: "It’s above your spending limit, so BTG checks it first — usually within a working day. Nothing is charged yet." };
      break;
    case "APPROVED":
    case "AWAITING_PAYMENT": {
      const payBy = o.paymentDueAt ?? (o.waitingOn === "PAYMENT" ? o.deadlineAt : null) ?? null;
      if (paymentsOpen === false || !payBy) {
        stage = "wait";
        label = "Approved";
        next = { title: "Approved and held for you", hint: "Card payment opens soon. We’ll email you your pay-by date. Nothing is charged yet." };
        break;
      }
      const left = inWords(payBy, now);
      stage = "pay";
      move = true;
      label = "Ready to pay";
      cta = "Pay now";
      next = { title: `Pay ${total} by ${dayOf(payBy)}`, hint: "By card, on Stripe’s secure page. Unpaid orders are cancelled and the dates released." };
      due = left ? { text: `Pay ${left}`, urgent: hoursLeft(payBy, now) < 24 } : { text: "Pay-by date passed", urgent: true };
      break;
    }
    case "PAID":
    case "IN_DELIVERY":
      stage = "deliver";
      label = o.state === "IN_DELIVERY" ? "Being delivered" : "Paid";
      cta = "Track it";
      next = {
        title: one ? `${one} is delivering` : sellers.length > 1 ? "The sellers are delivering" : "It’s being delivered",
        hint: dates ? `On ${dates}. You confirm each item once it’s done.` : "On each item’s dates. You confirm each item once it’s done.",
      };
      break;
    case "FULFILLED":
    case "CLOSED":
      stage = "done";
      label = o.state === "CLOSED" ? "Complete" : "Delivered";
      next = { title: "Everything is delivered ✓", hint: o.state === "CLOSED" ? "Delivered, confirmed and closed." : "Every item was delivered and confirmed." };
      break;
    case "REFUNDED":
      stage = "ended";
      label = "Refunded";
      next = { title: "This order was refunded", hint: "The money goes back the way you paid." };
      break;
    default: {
      stage = "ended";
      label = "Cancelled";
      const refunding = (o.refunds?.length ?? 0) > 0 || Boolean(o.paidAt);
      next = {
        title: CANCELLED_BY[o.cancelReason ?? ""] ?? "This order was cancelled",
        hint: refunding ? "Your money goes back the way you paid. Its items went back on sale." : "Nothing was charged. Its items went back on sale.",
      };
    }
  }

  const { stops, progress } = orderStops(o);
  const first = lines[0]?.title ?? "An order";
  return {
    id: o.id,
    ref: orderRef(o.id),
    title: first,
    more: Math.max(0, lines.length - 1),
    all: lines.map((l) => (l.quantity > 1 ? `${l.title} × ${l.quantity}` : l.title)).join(", ") || first,
    from,
    initials: sellers[0] ? initialsOf(sellers[0]) : "",
    dates,
    placed: `Placed ${dayOf(o.createdAt)}`,
    total,
    stage,
    label,
    move,
    next,
    due,
    cta,
    stops,
    progress,
    ended: stage === "ended",
  };
}

/* ── the way an order moves: the board at the top ───────────────────────── */

export type OrderStation = { key: string; label: string; hint: string; count: number; stage: OrderStage };

/**
 * The four stations an order passes, each with the API's count for its tab
 * (the summary's whole-scope counts, so a search doesn't empty the board).
 * While card payment is closed, "To pay" reads "Approved" (POL-FE-72).
 */
export function orderStations(byTab: Record<string, number>, paymentsOpen?: boolean): OrderStation[] {
  const n = (k: string) => byTab[k] ?? 0;
  return [
    { key: "waiting", label: "Waiting", hint: "the seller or BTG approves it", count: n("waiting"), stage: "wait" },
    paymentsOpen === false
      ? { key: "to_pay", label: "Approved", hint: "card payment opens soon", count: n("to_pay"), stage: "wait" }
      : { key: "to_pay", label: "To pay", hint: "approved; you pay by card", count: n("to_pay"), stage: "pay" },
    { key: "in_progress", label: "In progress", hint: "paid; the sellers deliver", count: n("in_progress"), stage: "deliver" },
    { key: "delivered", label: "Delivered", hint: "done and confirmed", count: n("delivered"), stage: "done" },
  ];
}

/* ── the tabs ──────────────────────────────────────────────────────────── */

export type OrderTabDef = { key: string; label: string; count: number; hot: boolean };

/** Plainer words than the API's for one of them. */
const TAB_LABEL: Record<string, string> = { waiting: "Waiting" };

/**
 * The API's own tabs, in its order, with its counts. "To pay" glows while
 * there's something to pay, and reads "Approved" while card payment is
 * closed (paymentsOpen === false ? "Approved" : t.label). Cancelled shows
 * only when it holds an order (or is the one open).
 */
export function orderTabs(tabs: readonly { key: string; label: string; count: number }[], current: string, paymentsOpen?: boolean): OrderTabDef[] {
  return tabs
    .filter((t) => t.key !== "cancelled" || t.count > 0 || t.key === current)
    .map((t) => ({
      key: t.key,
      label: t.key === "to_pay" ? (paymentsOpen === false ? "Approved" : t.label) : (TAB_LABEL[t.key] ?? t.label),
      count: t.count,
      hot: t.key === "to_pay" && paymentsOpen !== false && t.count > 0,
    }));
}

/** The URL change a tab makes: `?tab=` (none for All); the page resets to 1. */
export function orderTabPatch(key: string): Record<string, string | null> {
  return { tab: key === "all" ? null : key };
}

/** "No orders to pay" … for the tab that came back empty. */
export function emptyWords(tab: string, q: string, outOfRange: boolean): { title: string; hint: string } {
  if (outOfRange) return { title: "Nothing on this page", hint: "Go back to the first page to see your orders." };
  if (q) return { title: "No orders match your search", hint: "Try another word, or clear the search to see every order." };
  switch (tab) {
    case "waiting":
      return { title: "Nothing is waiting", hint: "No order is waiting for a seller or for BTG." };
    case "to_pay":
      return { title: "Nothing to pay", hint: "You’re all paid up. Approved orders show here until they’re paid." };
    case "in_progress":
      return { title: "Nothing in progress", hint: "Paid orders show here while their items are delivered." };
    case "delivered":
      return { title: "Nothing delivered yet", hint: "Orders land here once every item is delivered and confirmed." };
    case "cancelled":
      return { title: "Nothing cancelled", hint: "No order was cancelled or refunded." };
    default:
      return { title: "No orders here", hint: "Browse the shop to buy your first item." };
  }
}
