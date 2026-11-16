/* --------------------------------------------------------------------------
   POL-FE-97 — the athlete's Payouts (/athlete/money), drawn like their
   Inventory, Listings and Sales (POL-FE-83/84/95). The words, pure:

   - cashBoard        the one question the page answers first: how much can
                      I cash out right now, and if nothing, why not — in a
                      sentence, with the Request button's label and state
                      (requestButton, unchanged, so e2e still finds it).
   - moneyStations    "How your money moves": Sponsor pays → Unlocking →
                      Ready → On its way → Paid, each the API's own total
                      (GET /payouts/me `totals`), never a sum we invent.
   - moneySidings     what sits off that road: in reserve, frozen, owed back.
   - orderMoneyCard   one order: where its money is now, as a sentence
                      ("$542.58 ready to cash out", "Unlocks Nov 20"), with
                      the API's figures as small labelled amounts.
   - payoutCard       one payout: its status in the payee's words
                      (payoutStatus), a stage for its hue, the tracker.
   - payoutTabs       the payout history's tabs, from the API's counts.
   - sampleMoney      ?demo=sample — a clickable sample that writes nothing.

   Every figure is an API field in cents (memory: stats-must-be-retrievable).
   -------------------------------------------------------------------------- */

import {
  FROZEN_LINE, HISTORY_STATES, approvalBadge, frozenOrders, orderBalanceCents, orderStatusLabel, payeeFixPrompt,
  payoutStatus, payoutTracker, requestButton, shortDate, usd,
  type ApiMyPayouts, type ApiPayout, type ApiPayoutOrder, type PayoutState, type TrackerStep,
} from "@/lib/payouts-live";

/* ── the cash-out board ────────────────────────────────────────────────── */

export type CashBoard = {
  /** The figure the board leads with, in cents (counted up on arrival). */
  cents: number;
  /** What that figure is. */
  eyebrow: string;
  headline: string;
  body: string;
  /** "ready": lit green; "wait": something is on its way in; "none": nothing yet. */
  mood: "ready" | "wait" | "none";
  button: { label: string; enabled: boolean };
  /** Why the button is off, in words; null when it is on. */
  reason: string | null;
  /** Points at the checklist when a rule is unmet. */
  checklist: boolean;
};

const lockedCents = (me: Pick<ApiMyPayouts, "totals">) => Math.max(0, me.totals.notYetReleasableCents);

export function cashBoard(me: Pick<ApiMyPayouts, "totals" | "canRequest" | "checks" | "account">): CashBoard {
  const t = me.totals;
  const btn = requestButton(me);
  const button = { label: btn.label, enabled: btn.enabled };
  const unmet = me.checks.filter((c) => !c.ok);
  const coming = t.awaitingPaymentCents + lockedCents(me);
  if (me.canRequest && t.requestableCents > 0) {
    return {
      cents: t.requestableCents,
      eyebrow: "Ready to cash out",
      headline: `${usd(t.requestableCents)} is yours to cash out`,
      body: "Request it and it goes to your payout account on Stripe. Most payouts are approved automatically and arrive within a few days.",
      mood: "ready",
      button,
      reason: null,
      checklist: false,
    };
  }
  if (t.requestableCents > 0) {
    const account = me.account.status !== "READY";
    return {
      cents: t.requestableCents,
      eyebrow: "Ready to cash out",
      headline: account ? `${usd(t.requestableCents)} is ready. Set up your payout account to cash out` : `${usd(t.requestableCents)} is ready`,
      body: account
        ? "Your money is waiting. It can only go to a payout account on Stripe, so that comes first. It takes about 5 minutes."
        : "One thing is left before you can request it. It's listed just below.",
      mood: "wait",
      button,
      reason: btn.reason,
      checklist: unmet.length > 0,
    };
  }
  if (t.inFlightCents > 0) {
    return {
      cents: t.inFlightCents,
      eyebrow: "On its way to you",
      headline: `${usd(t.inFlightCents)} is on its way to your bank`,
      body: coming > 0
        ? `Nothing more is ready yet. Another ${usd(coming)} is on its way in; see where it is below.`
        : "Nothing more is ready yet. You can follow it below, from request to paid.",
      mood: "wait",
      button,
      reason: btn.reason,
      checklist: false,
    };
  }
  if (coming > 0) {
    return {
      cents: coming,
      eyebrow: "Coming in",
      headline: `${usd(coming)} is on its way in`,
      body: "None of it can be cashed out yet. Each sale unlocks once the sponsor has paid, you've delivered, they've confirmed, and a short holding period has passed.",
      mood: "wait",
      button,
      reason: btn.reason,
      checklist: unmet.length > 0,
    };
  }
  return {
    cents: 0,
    eyebrow: "Ready to cash out",
    headline: t.paidOutCents > 0 ? "You're all paid up" : "Nothing to cash out yet",
    body: t.paidOutCents > 0
      ? `Every cent so far has been paid out: ${usd(t.paidOutCents)} in all. Your next sale's share shows up here.`
      : "When a sponsor buys one of your items and the sale is confirmed, your share lands here, ready to cash out.",
    mood: "none",
    button,
    reason: btn.reason,
    checklist: false,
  };
}

/* ── the road money travels ────────────────────────────────────────────── */

export type MoneyStage = "pay" | "locked" | "ready" | "moving" | "paid";
export type MoneyStation = { key: MoneyStage; label: string; hint: string; cents: number };

export function moneyStations(me: Pick<ApiMyPayouts, "totals">): MoneyStation[] {
  const t = me.totals;
  return [
    { key: "pay", label: "Sponsor pays", hint: "Bought, waiting for the sponsor to pay.", cents: t.awaitingPaymentCents },
    { key: "locked", label: "Unlocking", hint: "Paid. Unlocks once the sponsor confirms and a short hold passes.", cents: lockedCents(me) },
    { key: "ready", label: "Ready", hint: "Yours to cash out now.", cents: t.requestableCents },
    { key: "moving", label: "On its way", hint: "Requested, heading to your bank.", cents: t.inFlightCents },
    { key: "paid", label: "Paid", hint: "In your bank. Confirmed by the payment provider.", cents: t.paidOutCents },
  ];
}

export type MoneySiding = { key: "reserve" | "frozen" | "owed"; label: string; hint: string; cents: number };

export function moneySidings(me: Pick<ApiMyPayouts, "totals" | "orders">): MoneySiding[] {
  const out: MoneySiding[] = [];
  if (me.totals.heldCents > 0) {
    out.push({ key: "reserve", label: "In reserve", hint: "Kept back until each order closes, then paid with it.", cents: me.totals.heldCents });
  }
  const frozen = frozenOrders(me);
  if (frozen.length > 0) {
    out.push({ key: "frozen", label: "Frozen", hint: `${FROZEN_LINE}.`, cents: frozen.reduce((s, o) => s + o.cents, 0) });
  }
  const owed = me.totals.owedBackCents ?? me.orders.reduce((s, o) => s + Math.max(0, -orderBalanceCents(o)), 0);
  if (owed > 0) {
    out.push({ key: "owed", label: "Owed back", hint: "A sponsor was refunded after your share was paid out.", cents: owed });
  }
  return out;
}

/* ── one order's money ─────────────────────────────────────────────────── */

export type OrderMoneyStage = "frozen" | "owed" | "ready" | "pay" | "locked" | "moving" | "reserve" | "paid" | "ended";

export type OrderMoneyCard = {
  id: string;
  ref: string;
  sponsor: string;
  title: string;
  /** "$604.24". */
  share: string;
  stage: OrderMoneyStage;
  /** The stage in two words, for the pill. */
  label: string;
  /** Where its money is now, as a sentence, and the line under it. */
  next: { title: string; hint: string };
  /** The API's figures on this order that aren't $0, each labelled. */
  parts: Array<{ key: string; label: string; amount: string }>;
  /** The order's own state, in words. */
  status: string;
  frozen: boolean;
  /** "You owe $X back from a refund", or null. */
  owedBack: string | null;
  /** Where to go about it: Sales to deliver, the cash-out board, the payout list; null when nothing to do. */
  go: { label: string; href: string } | null;
};

const ENDED = new Set(["CANCELLED", "REFUNDED"]);

export function orderMoneyCard(o: ApiPayoutOrder, now: Date = new Date()): OrderMoneyCard {
  const balance = orderBalanceCents(o);
  const locked = Math.max(0, Math.max(0, balance) - o.requestableCents);
  const frozen = o.frozen === true;
  const owedBack = balance < 0 ? `You owe ${usd(-balance)} back from a refund` : null;
  const parts = [
    { key: "ready", label: "Ready", cents: o.requestableCents },
    { key: "locked", label: frozen ? "Held for review" : "Unlocking", cents: locked },
    { key: "pay", label: "Awaiting payment", cents: o.awaitingPaymentCents },
    { key: "moving", label: "On its way", cents: o.inFlightCents },
    { key: "reserve", label: "In reserve", cents: o.heldCents },
  ]
    .filter((p) => p.cents > 0)
    .map((p) => ({ key: p.key, label: p.label, amount: usd(p.cents) }));

  const base = {
    id: o.orderId,
    ref: o.orderRef,
    sponsor: o.sponsorName || "A sponsor",
    title: o.title || o.orderRef,
    share: usd(o.shareCents),
    parts,
    status: orderStatusLabel(o.state),
    frozen,
    owedBack,
    go: null as OrderMoneyCard["go"],
  };

  if (frozen) {
    return { ...base, stage: "frozen", label: "Frozen", next: { title: "Frozen for now", hint: `${FROZEN_LINE}. Nothing for you to do; we'll email you.` } };
  }
  if (owedBack) {
    return { ...base, stage: "owed", label: "Owed back", next: { title: owedBack, hint: "The sponsor was refunded after this was paid out. It comes off your next payout." } };
  }
  if (o.requestableCents > 0) {
    return { ...base, go: { label: "Cash out", href: "#cash-out" }, stage: "ready", label: "Ready", next: { title: `${usd(o.requestableCents)} ready to cash out`, hint: "It goes out with your next payout request." } };
  }
  if (o.awaitingPaymentCents > 0) {
    return { ...base, stage: "pay", label: "Sponsor pays", next: { title: "Waiting for the sponsor to pay", hint: "Nothing to do yet. Your share starts unlocking once they pay." } };
  }
  if (locked > 0) {
    const problem = (o.problemLines ?? 0) > 0;
    const until = o.holdUntil && new Date(o.holdUntil).getTime() > now.getTime() ? shortDate(o.holdUntil) : "";
    const next = problem
      ? { title: `${usd(locked)} on hold`, hint: "The sponsor reported a problem. BTG is sorting it out, and it unlocks once they have." }
      : until
        ? { title: `${usd(locked)} unlocks ${until}`, hint: "The sponsor confirmed. This is the short holding period after that." }
        : o.state === "FULFILLED"
          ? { title: `${usd(locked)} unlocks once the sponsor confirms`, hint: "You've delivered. They have 24 hours; no answer counts as confirmed." }
          : { title: `${usd(locked)} unlocks once you deliver`, hint: "Deliver it, then the sponsor confirms. Open the sale to see what's next." };
    const go = problem || until ? null : { label: o.state === "FULFILLED" ? "See your sales" : "Deliver it", href: o.state === "FULFILLED" ? "/athlete/sales?tab=delivered" : "/athlete/sales?tab=to_deliver" };
    return { ...base, go, stage: "locked", label: "Unlocking", next };
  }
  if (o.inFlightCents > 0) {
    return { ...base, go: { label: "Follow it", href: "#your-payouts" }, stage: "moving", label: "On its way", next: { title: `${usd(o.inFlightCents)} on its way to you`, hint: "Requested. Follow it in Your payouts below." } };
  }
  if (o.heldCents > 0) {
    return { ...base, stage: "reserve", label: "In reserve", next: { title: `${usd(o.heldCents)} in reserve`, hint: "Kept back until the order closes, then it's ready to cash out." } };
  }
  if (ENDED.has(o.state)) {
    return { ...base, stage: "ended", label: base.status, next: { title: `${base.status}. Nothing to pay out`, hint: "This order didn't go ahead, so there is no share to pay." } };
  }
  return { ...base, stage: "paid", label: "Paid out", next: { title: "All paid out", hint: "Every cent of your share on this order has been paid." } };
}

/* ── one payout ────────────────────────────────────────────────────────── */

export type PayoutStage = "review" | "moving" | "paid" | "problem" | "back";

const PAYOUT_STAGE: Record<PayoutState, PayoutStage> = {
  REQUESTED: "review",
  APPROVED: "moving",
  SENDING: "moving",
  PAID: "paid",
  FAILED: "problem",
  REJECTED: "back",
};

export type PayoutCardView = {
  id: string;
  date: string;
  amount: string;
  /** "Order SX-1" / "Orders SX-1, SX-2". */
  orders: string;
  stage: PayoutStage;
  status: string;
  /** "Approved automatically", once paid. */
  auto: string | null;
  track: TrackerStep[] | null;
  fix: { label: string; href: string; note: string } | null;
};

export function payoutCard(p: ApiPayout, fixHref = "/athlete/money#payout-account"): PayoutCardView {
  const refs = p.lines.map((l) => l.orderRef);
  const auto = approvalBadge(p);
  return {
    id: p.id,
    date: shortDate(p.requestedAt),
    amount: usd(p.amountCents),
    orders: refs.length === 0 ? "" : `${refs.length === 1 ? "Order" : "Orders"} ${refs.join(", ")}`,
    stage: PAYOUT_STAGE[p.state] ?? "review",
    status: payoutStatus(p).label,
    auto: auto && p.state === "PAID" ? auto : null,
    track: payoutTracker(p),
    fix: payeeFixPrompt(p, fixHref),
  };
}

/* ── the payout history's tabs ─────────────────────────────────────────── */

export type PayoutTab = { key: string; label: string; count: number };

const TAB_LABEL: Partial<Record<PayoutState, string>> = { REQUESTED: "In review" };

/** All, then each state that has a payout (or is the one picked). `key` "all" is every state. */
export function payoutTabs(counts: Partial<Record<PayoutState, number>>, current: PayoutState | ""): PayoutTab[] {
  const total = Object.values(counts).reduce<number>((s, n) => s + (n ?? 0), 0);
  return [
    { key: "all", label: "All", count: total },
    ...HISTORY_STATES.filter((s) => (counts[s.value] ?? 0) > 0 || s.value === current).map((s) => ({
      key: s.value,
      label: TAB_LABEL[s.value] ?? s.label,
      count: counts[s.value] ?? 0,
    })),
  ];
}

/** The URL change a payout tab makes: its own state key, back to its first page, the history list kept open. */
export function payoutTabPatch(key: string): Record<string, string | null> {
  return { hstate: key === "all" ? null : key, hpage: null, list: "payouts" };
}

/* ── ?demo=sample ──────────────────────────────────────────────────────── */

const DAY = 24 * 60 * 60 * 1000;

/** A sample athlete's money, dated from `now`. `as: "setup"` — the payout account isn't set up yet. */
export function sampleMoney(now: Date = new Date(), as: "ready" | "setup" = "ready"): ApiMyPayouts {
  const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  const order = (o: Partial<ApiPayoutOrder> & Pick<ApiPayoutOrder, "orderId" | "orderRef" | "state" | "sponsorName" | "title" | "shareCents">): ApiPayoutOrder => ({
    fulfilledAt: null, availableCents: 0, heldCents: 0, awaitingPaymentCents: 0, inFlightCents: 0, requestableCents: 0, holdUntil: null,
    balanceCents: undefined, owedBackCents: 0, frozen: false, confirmedLines: 0, problemLines: 0, ...o,
  });
  const orders: ApiPayoutOrder[] = [
    order({ orderId: "sample-1", orderRef: "SX-7Q2K", state: "FULFILLED", sponsorName: "Harbor Coffee", title: "Instagram post + story", shareCents: 60_424, availableCents: 54_258, requestableCents: 54_258, heldCents: 6_166, fulfilledAt: at(-12), confirmedLines: 1 }),
    order({ orderId: "sample-2", orderRef: "SX-4MZ8", state: "FULFILLED", sponsorName: "Peak Fitness", title: "Youth camp appearance", shareCents: 27_500, availableCents: 25_000, heldCents: 2_500, holdUntil: at(4), fulfilledAt: at(-3), confirmedLines: 1 }),
    order({ orderId: "sample-3", orderRef: "SX-9RT1", state: "AWAITING_PAYMENT", sponsorName: "Riverside Auto", title: "Autograph signing", shareCents: 12_000, awaitingPaymentCents: 12_000 }),
    order({ orderId: "sample-4", orderRef: "SX-2HN6", state: "IN_DELIVERY", sponsorName: "Lakeside Dental", title: "Store appearance", shareCents: 15_000, availableCents: 15_000, frozen: true }),
    order({ orderId: "sample-5", orderRef: "SX-6WE3", state: "CLOSED", sponsorName: "Summit Energy", title: "Video shout-out", shareCents: 30_000, availableCents: 30_000, inFlightCents: 30_000, balanceCents: 0, fulfilledAt: at(-20), confirmedLines: 1 }),
    order({ orderId: "sample-6", orderRef: "SX-8PL5", state: "CLOSED", sponsorName: "Northside Bikes", title: "Social post", shareCents: 88_000, fulfilledAt: at(-40), confirmedLines: 1 }),
  ];
  const payouts: ApiPayout[] = [
    { id: "sample-p2", amountCents: 30_000, state: "SENDING", requestedAt: at(-2), decidedAt: at(-2), decisionNote: null, providerRef: null, sentAt: at(-1), paidAt: null, failureReason: null, lines: [{ orderId: "sample-5", orderRef: "SX-6WE3", amountCents: 30_000 }], approvedAutomatically: true, waitingOn: null },
    { id: "sample-p1", amountCents: 88_000, state: "PAID", requestedAt: at(-30), decidedAt: at(-30), decisionNote: null, providerRef: null, sentAt: at(-29), paidAt: at(-27), failureReason: null, lines: [{ orderId: "sample-6", orderRef: "SX-8PL5", amountCents: 88_000 }], approvedAutomatically: true, waitingOn: null },
  ];
  const ready = as === "ready";
  const z = { count: 0, amountCents: 0 };
  return {
    currency: "USD",
    payee: { payeeType: "ATHLETE", name: "you" },
    account: { status: ready ? "READY" : "NOT_SET_UP", provider: "stripe", canSetUp: true, testProvider: false, updatedAt: at(-60) },
    totals: { requestableCents: 54_258, heldCents: 8_666, awaitingPaymentCents: 12_000, notYetReleasableCents: 40_000, inFlightCents: 30_000, paidOutCents: 88_000, owedBackCents: 0 },
    owedBackNote: null,
    byState: { REQUESTED: z, APPROVED: z, SENDING: { count: 1, amountCents: 30_000 }, PAID: { count: 1, amountCents: 88_000 }, REJECTED: z, FAILED: z },
    canRequest: ready,
    checks: [
      { key: "payment", label: "Sponsor's payment received", ok: true },
      { key: "delivered", label: "Delivery confirmed by the sponsor", ok: true },
      { key: "account", label: "Payout account ready", ok: ready },
      { key: "hold", label: "Holding period passed", ok: true },
      { key: "dispute", label: "1 order held — BTG is reviewing a problem with the sponsor's payment", ok: false },
    ],
    orders,
    payouts,
  };
}
