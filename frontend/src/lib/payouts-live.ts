/* --------------------------------------------------------------------------
   Payouts — the payee's side, pure logic (2S5-FE-02, 2S5-FE-03).

   Everything the property Earnings page and the athlete home need to turn
   GET /payouts/account and GET /payouts/me into words: the payout-account
   panel per status, each payout's status label and tone, whether "Request
   payout" is live and — when it isn't — the reason, and a refusal reader
   for POST /payouts and POST /payouts/account/link.

   Every figure is an API field (integer cents → USD). Nothing here names a
   card or bank number: the provider holds those, and statuses say
   "confirmed by the payment provider". Where the user must act on Stripe the
   CTA names Stripe, ends in "↗" and its aria-label says it leaves SponsorX.
   -------------------------------------------------------------------------- */

export type PayoutAccountStatus = "NOT_SET_UP" | "NEEDS_INFO" | "READY";

/** GET /payouts/account — also embedded as `account` in GET /payouts/me. */
export type ApiPayoutAccount = {
  status: PayoutAccountStatus;
  provider: string;
  canSetUp: boolean;
  testProvider: boolean;
  updatedAt: string | null;
};

export type PayoutState = "REQUESTED" | "APPROVED" | "SENDING" | "PAID" | "REJECTED" | "FAILED";

export type ApiPayout = {
  id: string;
  amountCents: number;
  state: PayoutState;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  providerRef: string | null;
  sentAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
  lines: Array<{ orderId: string; orderRef: string; amountCents: number }>;
};

export type ApiPayoutOrder = {
  orderId: string;
  orderRef: string;
  state: string;
  fulfilledAt: string | null;
  sponsorName: string | null;
  title: string | null;
  shareCents: number;
  availableCents: number;
  heldCents: number;
  awaitingPaymentCents: number;
  inFlightCents: number;
  requestableCents: number;
  holdUntil: string | null;
};

export type PayoutCheck = { key: "payment" | "delivered" | "account" | "hold" | string; label: string; ok: boolean };

/** GET /payouts/me. */
export type ApiMyPayouts = {
  currency: string;
  payee: { payeeType: "ATHLETE" | "PROPERTY"; name: string };
  account: ApiPayoutAccount;
  totals: {
    requestableCents: number;
    heldCents: number;
    awaitingPaymentCents: number;
    notYetReleasableCents: number;
    inFlightCents: number;
    paidOutCents: number;
  };
  /** Every payout by state — how many and how much, counted by the API (2S2-FE-01). Optional: older reads. */
  byState?: Record<PayoutState, { count: number; amountCents: number }>;
  canRequest: boolean;
  checks: PayoutCheck[];
  orders: ApiPayoutOrder[];
  payouts: ApiPayout[];
};

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/* ================================================================ shared */

/** Integer cents → "$1,234.56". */
export function usd(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ISO → "Sep 20, 2026" (UTC, so server and test agree). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const STRIPE_ARIA_SUFFIX = "Leaves SponsorX and opens Stripe.";
export const PROVIDER_NOT_CONNECTED = "Opens once our payment provider is connected.";
export const TEST_PROVIDER_BADGE = "Test payment provider — staging only, no real money";

/** A same-site path to come back to — never another site. */
export function safeReturnPath(p: unknown, fallback: string): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p.slice(0, 300) : fallback;
}

/** The provider URL the API handed back — only ever http(s), absolute. */
export function providerUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ========================================================= account panel */

export type AccountPanelView = {
  status: PayoutAccountStatus;
  /** Chip beside the heading, with its mark — text, not colour alone. */
  chip: { label: string; mark: string; tone: Tone };
  headline: string;
  body: string;
  cta: {
    label: string;
    ariaLabel: string;
    variant: "primary" | "outline";
    disabled: boolean;
    /** Shown under a disabled CTA — the button stays visible. */
    disabledNote: string | null;
  };
  testBadge: string | null;
  /** Whether the payee still has something to do on Stripe. */
  actionNeeded: boolean;
};

export function accountPanel(a: ApiPayoutAccount, payeeLabel: string): AccountPanelView {
  const disabled = !a.canSetUp;
  const cta = (label: string, variant: "primary" | "outline") => ({
    label: `${label} ↗`,
    ariaLabel: `${label}. ${STRIPE_ARIA_SUFFIX}`,
    variant,
    disabled,
    disabledNote: disabled ? PROVIDER_NOT_CONNECTED : null,
  });
  const base = { status: a.status, testBadge: a.testProvider ? TEST_PROVIDER_BADGE : null };
  if (a.status === "READY") {
    return {
      ...base,
      chip: { label: "Active", mark: "✓", tone: "accent" },
      headline: "Payout account · Active ✓",
      body: "Payouts go to the bank account you added on Stripe. To change it, update it on Stripe.",
      cta: cta("Manage payouts on Stripe", "outline"),
      actionNeeded: false,
    };
  }
  if (a.status === "NEEDS_INFO") {
    return {
      ...base,
      chip: { label: "Needs information", mark: "●", tone: "warn" },
      headline: "Stripe needs a bit more information",
      body: "Pick up where you left off on Stripe, then you come straight back here. Bank and tax details stay with Stripe.",
      cta: cta("Continue on Stripe", "primary"),
      actionNeeded: true,
    };
  }
  return {
    ...base,
    chip: { label: "Not set up", mark: "●", tone: "warn" },
    headline: "Payout account not set up",
    body: `Set up where ${payeeLabel} gets paid. It takes about 5 minutes on Stripe, then you come straight back here.`,
    cta: cta("Set up payouts with Stripe", "primary"),
    actionNeeded: true,
  };
}

/** The athlete home's compact banner — only while something is left to do. */
export function athleteBanner(a: ApiPayoutAccount, opts: { minor?: boolean } = {}) {
  const panel = accountPanel(a, "you");
  if (!panel.actionNeeded) return { show: false as const, readyLine: "Payout account ready ✓ · managed by Stripe" };
  return {
    show: true as const,
    title: a.status === "NEEDS_INFO" ? "Stripe needs a bit more information" : "Payout account not set up",
    body: "Payouts go through Stripe. Set it up now so your first payout isn't held up.",
    minorLine: opts.minor ? "Because you're under 18, a parent or guardian finishes this on Stripe." : null,
    cta: panel.cta,
    testBadge: panel.testBadge,
  };
}

/* ============================================================ payout rows */

export function payoutStatus(p: Pick<ApiPayout, "state" | "paidAt" | "decisionNote">): { label: string; tone: Tone } {
  switch (p.state) {
    case "REQUESTED":
      return { label: "Requested — waiting for BTG", tone: "neutral" };
    case "APPROVED":
      return { label: "Approved by BTG — sending soon", tone: "primary" };
    case "SENDING":
      return { label: "Sending — with the payment provider", tone: "primary" };
    case "PAID": {
      const on = shortDate(p.paidAt);
      return { label: `Paid · confirmed by the payment provider${on ? ` ${on}` : ""}`, tone: "accent" };
    }
    case "REJECTED": {
      const note = p.decisionNote?.trim();
      return { label: note ? `Sent back by BTG: ${note}` : "Sent back by BTG", tone: "warn" };
    }
    case "FAILED":
      return { label: "The payment provider couldn't send this — BTG is looking into it", tone: "danger" };
    default:
      return { label: String(p.state), tone: "neutral" };
  }
}

export function historyRows(payouts: ApiPayout[]) {
  return payouts.map((p) => ({
    id: p.id,
    date: shortDate(p.requestedAt),
    amount: usd(p.amountCents),
    orders: p.lines.map((l) => l.orderRef),
    status: payoutStatus(p),
  }));
}

/* ========================================================= request button */

export type RequestButtonView = {
  label: string;
  enabled: boolean;
  /** Why it is disabled — the first unmet check, in words. Null when enabled. */
  reason: string | null;
};

export function requestButton(me: Pick<ApiMyPayouts, "canRequest" | "checks" | "totals">): RequestButtonView {
  const label = `Request payout · ${usd(me.totals.requestableCents)}`;
  if (me.canRequest) return { label, enabled: true, reason: null };
  const unmet = me.checks.find((c) => !c.ok);
  if (unmet) return { label, enabled: false, reason: `Waiting on: ${unmet.label}` };
  if (me.totals.inFlightCents > 0 && me.totals.requestableCents === 0) {
    return { label, enabled: false, reason: `${usd(me.totals.inFlightCents)} is already requested — nothing more is ready yet.` };
  }
  return { label, enabled: false, reason: "Nothing is ready to pay out yet." };
}

/** The orders a request would include — those with something requestable. */
export function requestOrders(orders: ApiPayoutOrder[]) {
  return orders
    .filter((o) => o.requestableCents > 0)
    .map((o) => ({
      orderId: o.orderId,
      orderRef: o.orderRef,
      title: [o.sponsorName, o.title].filter(Boolean).join(" · ") || o.orderRef,
      amount: usd(o.requestableCents),
    }));
}

/** Show "Can't request yet" when a request isn't possible but money is on its way. */
/** The "can't request yet" checklist: only when a rule is actually unmet —
 *  money already requested isn't a reason to show a list of ticks. */
export function showChecklist(me: Pick<ApiMyPayouts, "canRequest" | "totals" | "checks">): boolean {
  if (me.canRequest) return false;
  if (me.checks.every((c) => c.ok)) return false;
  const t = me.totals;
  return t.requestableCents + t.heldCents + t.awaitingPaymentCents + t.notYetReleasableCents > 0;
}

export function payoutTiles(me: Pick<ApiMyPayouts, "totals">) {
  const t = me.totals;
  return [
    {
      key: "requestable",
      label: "Available to pay out",
      value: usd(t.requestableCents),
      sub: t.inFlightCents > 0 ? `${usd(t.inFlightCents)} already requested` : "Paid, delivered and past its holding period",
    },
    { key: "held", label: "Held in reserve", value: usd(t.heldCents), sub: "Released when each order closes" },
    { key: "paid", label: "Paid out", value: usd(t.paidOutCents), sub: "Confirmed by the payment provider" },
  ];
}

/* ============================================================== refusals */

export type PayoutWriteFailure = { ok: false; status: number; message: string; reasons: string[] };

/** A non-2xx from a payout write, in words. The API's error.message is the
 *  explanation (a 409 says exactly why); reasons arrive as strings. */
export function payoutRefusal(status: number, body: unknown): PayoutWriteFailure {
  const e = (body as { error?: { message?: unknown; reasons?: unknown } } | null)?.error;
  const reasons = Array.isArray(e?.reasons)
    ? e.reasons
        .map((r) => (typeof r === "string" ? r : (r as { message?: unknown } | null)?.message))
        .filter((m): m is string => typeof m === "string" && m.length > 0)
    : [];
  if (status === 403) {
    return { ok: false, status, message: "Your login can't do this — payouts belong to the athlete, or to the property's manager.", reasons: [] };
  }
  const message = typeof e?.message === "string" && e.message ? e.message : `The request was refused (HTTP ${status}).`;
  return { ok: false, status, message, reasons: reasons.filter((r) => r !== message) };
}

export const UNREACHABLE: PayoutWriteFailure = { ok: false, status: 0, message: "The API is unreachable — nothing changed. Try again in a minute.", reasons: [] };

/* ============================================== the tracker (2S5-FE-03/-04) */

/** "Sep 30, 10:40" — a moment in the payout's life, in UTC so server and browser agree. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })}`;
}

export type TrackerStep = { label: string; state: "done" | "current" | "todo"; note: string };

/** Requested → Approved by BTG → Sent → Paid, from the payout's own timestamps.
 *  Null for a payout that left the road (sent back, failed) — its status says why. */
export function payoutTracker(p: Pick<ApiPayout, "state" | "requestedAt" | "decidedAt" | "sentAt" | "paidAt">): TrackerStep[] | null {
  /* How many steps are behind it: requested (1), approved (2), sent (3), paid (4). */
  const done = ({ REQUESTED: 1, APPROVED: 2, SENDING: 3, PAID: 4 } as Record<string, number>)[p.state];
  if (done === undefined) return null;
  const steps = [
    { label: "Requested", at: p.requestedAt, waiting: "" },
    { label: "Approved by BTG", at: p.decidedAt, waiting: "Waiting for BTG" },
    { label: "Sent", at: p.sentAt, waiting: "Sending soon" },
    { label: "Paid", at: p.paidAt, waiting: "With the payment provider" },
  ];
  return steps.map((s, i) =>
    i < done ? { label: s.label, state: "done", note: stamp(s.at) }
    : i === done ? { label: s.label, state: "current", note: s.waiting }
    : { label: s.label, state: "todo", note: "" });
}

/* ================================================ BTG's queue (2S5-FE-04) */

export type ApprovalTab = "waiting" | "sending" | "paid" | "problems";
export const APPROVAL_TABS: ReadonlyArray<{ key: ApprovalTab; label: string; states: PayoutState[] }> = [
  { key: "waiting", label: "Waiting for approval", states: ["REQUESTED"] },
  { key: "sending", label: "Sending", states: ["APPROVED", "SENDING"] },
  { key: "paid", label: "Paid", states: ["PAID"] },
  { key: "problems", label: "Problems", states: ["FAILED"] },
];
export const approvalTab = (v: unknown): ApprovalTab =>
  APPROVAL_TABS.some((t) => t.key === v) ? (v as ApprovalTab) : "waiting";
/** A tab's count from GET /payouts' per-state counts. */
export const tabCount = (tab: ApprovalTab, counts: Record<string, number>) =>
  APPROVAL_TABS.find((t) => t.key === tab)!.states.reduce((s, st) => s + (counts[st] ?? 0), 0);

export const payeeKind = (t: string) => (t === "PROPERTY" ? "Team" : "Athlete");

/** "All checks passed", or the first rule that isn't met. */
export function checkSummary(checks: PayoutCheck[]): { ok: boolean; label: string } {
  const failed = checks.find((c) => !c.ok);
  return failed ? { ok: false, label: `Not met: ${failed.label}` } : { ok: true, label: "All checks passed" };
}

/** How long a request has waited: "4 min", "3 h", "2 days". */
export function waitedFor(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** The order's state, in the words the payee reads. */
export function orderStatusLabel(state: string): string {
  return ({
    PAID: "Paid · in delivery soon", IN_DELIVERY: "In delivery", FULFILLED: "Delivered", CLOSED: "Closed",
    APPROVED: "Awaiting sponsor payment", AWAITING_PAYMENT: "Awaiting sponsor payment", REFUNDED: "Refunded", CANCELLED: "Cancelled",
  } as Record<string, string>)[state] ?? state;
}

/* ========================================== BTG's payout reads (2S5-FE-04) */

export type ApiAdminPayout = ApiPayout & { payeeType: string; payeeId: string; payeeName: string };
export type ApiPayoutList = { payouts: ApiAdminPayout[]; counts: Record<string, number> };
export type ApiPayoutDetail = ApiAdminPayout & {
  account: ApiPayoutAccount;
  orders: Array<{ orderId: string; orderRef: string; state: string; fulfilledAt: string | null; totalCents: number; title: string }>;
  checks: PayoutCheck[];
  provider: string;
};

/** The payee's part of an order's frozen split — an athlete's share (their
 *  cut after the team's), a team's cut of an athlete item, or a property's. */
export function payeeShare(
  f: { grossCents: number; availableCents: number; reserveCents: number; athleteId: string | null; teamAvailableCents: number | null; teamReserveCents: number | null },
  payeeType: string,
): { saleCents: number; shareCents: number; availableCents: number; reserveCents: number } {
  const teamA = f.teamAvailableCents ?? 0;
  const teamR = f.teamReserveCents ?? 0;
  const athleteItem = f.athleteId !== null && (f.teamAvailableCents !== null || f.teamReserveCents !== null);
  const [a, r] = payeeType === "ATHLETE" ? [f.availableCents - teamA, f.reserveCents - teamR] : athleteItem ? [teamA, teamR] : [f.availableCents, f.reserveCents];
  return { saleCents: f.grossCents, shareCents: a + r, availableCents: a, reserveCents: r };
}

/** The payout's own history, in order: who did what, when. */
export function auditTrail(p: Pick<ApiAdminPayout, "state" | "payeeName" | "requestedAt" | "decidedAt" | "sentAt" | "paidAt" | "decisionNote" | "failureReason">) {
  const out: Array<{ what: string; when: string }> = [{ what: `Requested by ${p.payeeName}`, when: stamp(p.requestedAt) }];
  if (p.decidedAt) out.push({ what: p.state === "REJECTED" ? `Sent back by BTG${p.decisionNote ? `: “${p.decisionNote}”` : ""}` : "Approved by BTG", when: stamp(p.decidedAt) });
  if (p.sentAt) out.push({ what: "Handed to the payment provider", when: stamp(p.sentAt) });
  if (p.paidAt) out.push({ what: "Paid — confirmed by the payment provider", when: stamp(p.paidAt) });
  if (p.state === "FAILED") out.push({ what: `Couldn't send${p.failureReason ? `: ${p.failureReason}` : ""}`, when: "" });
  return out;
}
