import type { PaymentKind, ApiOrderPayment } from "@/lib/order-payment-live";
import { DEMO_LISTINGS, type ApiOrder, type ApiOrderLine } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-94 — the sponsor's order page as the payment wizard's summary.
   What the page says, in plain words, for each state an order can be in:

     orderHero   the one headline at the top: what is happening now, and
                 the mark beside it (a tick that draws itself once placed or
                 paid, a card while payment is due, a clock while someone
                 else decides, a cross once it ended);
     orderJourney the four stops on the board — Placed, Approved, Paid,
                 Delivered — each done with its date, the one it waits on
                 lit, and, for an order that ended, where it stopped;
     whatNext    up to three numbered steps after this one, so a sponsor
                 never has to guess what comes next.

   Every figure comes from GET /marketplace-orders/:id (and its /payment and
   /deliveries reads); nothing is guessed (memory: stats-must-be-retrievable).
   sampleOrder is `?demo=sample`, a clickable order in each state.
   -------------------------------------------------------------------------- */

export type OrderMood = "placed" | "wait" | "pay" | "confirming" | "failed" | "paid" | "done" | "ended";

export type OrderHero = {
  mood: OrderMood;
  /** "Order placed ✓", "Payment due", … — the small lit line above the title. */
  kicker: string;
  /** The headline: what is happening now. */
  title: string;
  /** One or two sentences under it. */
  text: string;
};

const DUE_STATES = new Set(["APPROVED", "AWAITING_PAYMENT"]);
const PAID_STATES = new Set(["PAID", "IN_DELIVERY"]);

/** The page's headline. `placed` is checkout's redirect (?placed=1): the order was just placed. */
export function orderHero(o: Pick<ApiOrder, "state">, payKind: PaymentKind, placed: boolean): OrderHero {
  const s = o.state;
  if (placed && (s === "PENDING_SELLER" || s === "PENDING_APPROVAL" || DUE_STATES.has(s))) {
    return {
      mood: "placed",
      kicker: "Order placed ✓",
      title: "Your order is placed",
      text:
        s === "PENDING_SELLER"
          ? "It's sent to the seller, who has 48 hours to accept. The items stay yours while they decide. Nothing was charged — you pay by card once it's accepted."
          : s === "PENDING_APPROVAL"
            ? "It's above your spending limit, so BTG checks it first. The items stay yours while they do. Nothing was charged — you pay by card once BTG approves it."
            : payKind === "held"
              ? "It was approved automatically and is held for you. Nothing was charged yet — card payment opens soon, and we'll email your pay-by date."
              : "It was approved automatically. Nothing was charged yet — pay the total by card within 3 days to lock in your dates.",
    };
  }
  if (s === "PENDING_SELLER") {
    return { mood: "wait", kicker: "Waiting for the seller", title: "The seller is deciding", text: "They have 48 hours to accept. The items stay yours while they decide, and nothing is charged until they do." };
  }
  if (s === "PENDING_APPROVAL") {
    return { mood: "wait", kicker: "Held for BTG", title: "BTG is checking your order", text: "It's above your spending limit, so BTG checks it first — usually within a working day. Nothing is charged until it's approved." };
  }
  if (DUE_STATES.has(s)) {
    if (payKind === "processing") return { mood: "confirming", kicker: "Paying", title: "We're confirming your payment", text: "You're back from Stripe. The payment provider usually confirms in under a minute — this page updates by itself." };
    if (payKind === "failed") return { mood: "failed", kicker: "Payment didn't go through", title: "Nothing was charged — try again", text: "Your order is still approved. Pay again on Stripe's page, with the same card or another one." };
    if (payKind === "held") return { mood: "wait", kicker: "Approved ✓", title: "Approved and held for you", text: "Card payment opens soon. No pay-by date is running yet — we'll email you when it starts. Nothing has been charged." };
    return { mood: "pay", kicker: "Payment due", title: "Approved — pay to lock in your dates", text: "One step left: pay the total by card on Stripe's secure page. Unpaid orders are cancelled after 3 days and the dates released." };
  }
  if (PAID_STATES.has(s)) {
    return { mood: "paid", kicker: "Paid ✓", title: s === "IN_DELIVERY" ? "Paid — the sellers are delivering" : "Paid — you're all set", text: "Sellers deliver on each item's dates. You confirm each one here when it's done." };
  }
  if (s === "FULFILLED") return { mood: "done", kicker: "Delivered ✓", title: "Everything is delivered", text: "Every item on this order has been delivered and confirmed." };
  if (s === "CLOSED") return { mood: "done", kicker: "Complete ✓", title: "This order is complete", text: "It was delivered, confirmed and closed." };
  if (s === "REFUNDED") return { mood: "ended", kicker: "Refunded", title: "This order was refunded", text: "The money goes back the way you paid. The refunds are listed beside the order." };
  return { mood: "ended", kicker: "Cancelled", title: "This order was cancelled", text: "Its items went back on sale." };
}

/* ------------------------------------------------------------ the journey */

export type JourneyStop = {
  label: "Placed" | "Approved" | "Paid" | "Delivered";
  state: "done" | "now" | "todo" | "ended";
  /** A date for a done stop, a word for the lit one, "" otherwise. */
  note: string;
};

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const day = (iso: string | null | undefined) => (iso ? DAY.format(new Date(iso)) : "");

type JourneyOrder = Pick<ApiOrder, "state" | "createdAt" | "decidedAt" | "contractedAt" | "awaitingPaymentAt" | "paidAt">;

/**
 * The four stops and how far the wire is lit (0…1). `delivered` is the
 * delivery count when the deliveries were read (cancelled lines left out),
 * null when they weren't.
 */
export function orderJourney(o: JourneyOrder, payKind: PaymentKind, delivered: { done: number; total: number } | null): { stops: JourneyStop[]; fill: number } {
  const approvedOn = day(o.decidedAt ?? o.awaitingPaymentAt ?? o.contractedAt);
  const ended = o.state === "CANCELLED" || o.state === "REFUNDED";
  /* How many stops are behind the order; for one that ended, how far it got before it did. */
  let behind: number;
  switch (o.state) {
    case "PENDING_SELLER":
    case "PENDING_APPROVAL":
      behind = 1;
      break;
    case "APPROVED":
    case "AWAITING_PAYMENT":
      behind = 2;
      break;
    case "PAID":
    case "IN_DELIVERY":
      behind = 3;
      break;
    case "FULFILLED":
    case "CLOSED":
      behind = 4;
      break;
    default:
      behind = o.paidAt ? 3 : o.decidedAt || o.awaitingPaymentAt ? 2 : 1;
  }
  const nowWord: Record<number, string> = {
    1: o.state === "PENDING_APPROVAL" ? "BTG checking" : "Seller deciding",
    2: payKind === "processing" ? "Confirming…" : payKind === "failed" ? "Try again" : payKind === "held" ? "Opens soon" : "Due now",
    3: delivered && delivered.total > 0 ? `${delivered.done} of ${delivered.total}` : "Under way",
  };
  const doneNote = [day(o.createdAt), approvedOn, day(o.paidAt), "All done"];
  const labels: JourneyStop["label"][] = ["Placed", "Approved", "Paid", "Delivered"];
  const stops = labels.map((label, i): JourneyStop => {
    if (i < behind) return { label, state: "done", note: doneNote[i] ?? "" };
    if (i === behind) return ended ? { label, state: "ended", note: o.state === "REFUNDED" ? "Refunded" : "Cancelled" } : { label, state: "now", note: nowWord[i] ?? "" };
    return { label, state: "todo", note: "" };
  });
  const lit = Math.min(behind, 3);
  return { stops, fill: lit / 3 };
}

/* ------------------------------------------------------------ what happens next */

export type NextStep = { title: string; text: string };

const PAY: NextStep = { title: "You pay by card", text: "Within 3 days of approval, on Stripe's secure page. SponsorX never sees your card." };
const DELIVER: NextStep = { title: "The sellers deliver", text: "On each item's dates. You're emailed as each one is marked delivered." };
const CONFIRM: NextStep = { title: "You confirm each delivery", text: "Within 24 hours of the seller marking it — or it confirms itself." };
const CLOSE: NextStep = { title: "The order closes", text: "Once every item is delivered and confirmed." };

/** Up to three numbered steps, the first being the one the order is on now; none once it has ended. */
export function whatNext(o: Pick<ApiOrder, "state">, payKind: PaymentKind): NextStep[] {
  switch (o.state) {
    case "PENDING_SELLER":
      return [{ title: "The seller accepts", text: "They have 48 hours. You're emailed either way." }, PAY, DELIVER];
    case "PENDING_APPROVAL":
      return [{ title: "BTG checks the order", text: "Usually within a working day. You're emailed either way." }, PAY, DELIVER];
    case "APPROVED":
    case "AWAITING_PAYMENT":
      if (payKind === "processing") return [{ title: "The provider confirms", text: "Usually under a minute. Please don't pay again." }, DELIVER, CONFIRM];
      if (payKind === "held") return [{ title: "Card payment opens", text: "We email your pay-by date; you then have 3 days." }, PAY, DELIVER];
      return [{ ...PAY, title: "You pay by card — now" }, DELIVER, CONFIRM];
    case "PAID":
    case "IN_DELIVERY":
      return [DELIVER, CONFIRM, CLOSE];
    default:
      return [];
  }
}

/* ------------------------------------------------------------ the sample */

export const SAMPLE_AS = ["placed", "seller", "btg", "due", "held", "confirming", "failed", "paid", "delivered", "cancelled"] as const;
export type SampleAs = (typeof SAMPLE_AS)[number];

export function sampleAs(v: unknown): SampleAs {
  return SAMPLE_AS.includes(v as SampleAs) ? (v as SampleAs) : "placed";
}

/**
 * `?demo=sample&as=<state>` — a sample order from the shop's demo deck in
 * each state the page draws. Nothing on it pays, cancels or confirms.
 */
export function sampleOrder(as: SampleAs, now: number): { order: ApiOrder; payment: ApiOrderPayment | null } {
  const base = new Date(now);
  const at = (days: number, hours = 0) => new Date(now + days * 86_400_000 + hours * 3_600_000).toISOString();
  const onDay = (n: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + n)).toISOString();
  const picks: Array<[string, number, number, number]> = [
    ["demo-1", 2, 3, 9],
    ["demo-2", 1, 10, 10],
    ["demo-3", 1, 14, 14],
  ];
  const lines: ApiOrderLine[] = picks.flatMap(([id, quantity, a, b], k) => {
    const r = DEMO_LISTINGS.find((l) => l.id === id);
    if (!r) return [];
    return [
      {
        id: `demo-line-${k}`,
        listingId: r.id,
        inventoryItemId: `demo-item-${k}`,
        propertyId: r.property?.id ?? null,
        seller: r.property ? { type: "PROPERTY" as const, id: r.property.id, name: r.property.name } : null,
        title: r.title,
        quantity,
        startsOn: onDay(a),
        endsOn: onDay(b),
        unitPriceCents: r.item.priceCents,
        lineTotalCents: quantity * r.item.priceCents,
      },
    ];
  });
  const sub = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const fee = Math.round(sub * 0.05);
  const state: ApiOrder["state"] =
    as === "seller" ? "PENDING_SELLER"
    : as === "btg" ? "PENDING_APPROVAL"
    : as === "paid" ? "IN_DELIVERY"
    : as === "delivered" ? "FULFILLED"
    : as === "cancelled" ? "CANCELLED"
    : "AWAITING_PAYMENT";
  const approved = state === "AWAITING_PAYMENT" || state === "IN_DELIVERY" || state === "FULFILLED";
  const paid = state === "IN_DELIVERY" || state === "FULFILLED";
  const order: ApiOrder = {
    id: "demo-order-7f3a9c21",
    sponsorId: "demo-sponsor",
    reservationId: "demo-hold",
    state,
    currency: "USD",
    subtotalCents: sub,
    feesCents: fee,
    totalCents: sub + fee,
    requiresApproval: as === "btg",
    approvalReasons: [],
    decidedAt: approved ? at(0, -1) : null,
    decidedBy: approved ? "system" : null,
    decisionNotes: null,
    contractedAt: approved ? at(0, -1) : null,
    createdAt: at(0, -1),
    billingName: "Dana Brooks",
    billingEmail: "dana@yourcompany.com",
    billingReference: "PO-2291",
    acceptanceId: "demo-acceptance",
    acceptance: { acceptedAt: at(0, -1), userId: "demo-user", bodyHash: "sha256:demo", user: { email: "dana@yourcompany.com" }, agreement: { kind: "MARKETPLACE_ORDER", version: 2 } },
    lines,
    spendingLimitCents: as === "btg" ? Math.round((sub + fee) / 2) : 500_000,
    cancelReason: as === "cancelled" ? "SPONSOR" : null,
    awaitingPaymentAt: approved ? at(0, -1) : null,
    paymentDueAt: state === "AWAITING_PAYMENT" && as !== "held" ? at(3, -1) : null,
    paidAt: paid ? at(0, -0.5) : null,
    paidVia: paid ? "CARD" : null,
    waitingOn: as === "seller" ? "SELLER" : as === "btg" ? "BTG" : state === "AWAITING_PAYMENT" ? "PAYMENT" : null,
    deadlineAt: as === "seller" ? at(2, -1) : state === "AWAITING_PAYMENT" && as !== "held" ? at(3, -1) : null,
    sellerApprovals:
      as === "seller" && lines[0]?.seller
        ? [{ id: "demo-approval", seller: { type: "PROPERTY", id: lines[0].seller.id, name: lines[0].seller.name }, lineIds: [lines[0].id], state: "PENDING", dueAt: at(2, -1), decidedAt: null, reason: null }]
        : [],
    refunds: [],
  };
  const attempt = (s: "PROCESSING" | "FAILED" | "SUCCEEDED") => ({
    id: "demo-attempt",
    state: s,
    amountCents: sub + fee,
    failureReason: s === "FAILED" ? "card_declined" : null,
    providerRef: s === "FAILED" ? "demo_ref_4242" : null,
    createdAt: at(0, -0.6),
    updatedAt: at(0, -0.5),
  });
  const payment: ApiOrderPayment | null =
    state === "AWAITING_PAYMENT" || paid
      ? {
          orderId: order.id,
          amountCents: sub + fee,
          due: state === "AWAITING_PAYMENT",
          provider: "standin",
          canPay: as !== "held",
          testProvider: false,
          latest: as === "confirming" ? attempt("PROCESSING") : as === "failed" ? attempt("FAILED") : paid ? attempt("SUCCEEDED") : null,
        }
      : null;
  return { order, payment };
}
