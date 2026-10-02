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
/** 2S5-BE-07 — who a REQUESTED or FAILED payout waits on (null otherwise). */
export type WaitingOn = "SYSTEM_RETRY" | "PAYEE_ACCOUNT" | "BTG";

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
  /** 2S5-BE-06 — approved by the rule, as the system. Optional: older reads. */
  approvedAutomatically?: boolean;
  /** 2S5-BE-07 — who it waits on. */
  waitingOn?: WaitingOn | null;
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

/** The payee's words for a payout. 2S5-BE-06 / -07 — never the internal reasons. */
export function payoutStatus(p: Pick<ApiPayout, "state" | "paidAt" | "decisionNote"> & Partial<Pick<ApiPayout, "approvedAutomatically" | "waitingOn">>): { label: string; tone: Tone } {
  switch (p.state) {
    case "REQUESTED":
      return { label: "BTG is reviewing this payout", tone: "neutral" };
    case "APPROVED":
      return { label: p.approvedAutomatically ? "Approved automatically — sending soon" : "Approved by BTG — sending soon", tone: "primary" };
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
      if (p.waitingOn === "PAYEE_ACCOUNT") return { label: PAYEE_FIX_LABEL, tone: "warn" };
      if (p.waitingOn === "SYSTEM_RETRY") return { label: "Couldn't be sent yet — it will be tried again automatically", tone: "warn" };
      return { label: "The payment provider couldn't send this — BTG is looking into it", tone: "danger" };
    default:
      return { label: String(p.state), tone: "neutral" };
  }
}

export const PAYEE_FIX_LABEL = "Your payout couldn't be sent — fix your payout account";

/** 2S5-BE-07 — the payee's "fix your payout account" prompt: only for a payout waiting on their account. */
export function payeeFixPrompt(p: Pick<ApiPayout, "state"> & Partial<Pick<ApiPayout, "waitingOn">>, href: string) {
  if (p.state !== "FAILED" || p.waitingOn !== "PAYEE_ACCOUNT") return null;
  return {
    label: "Fix your payout account",
    href,
    note: "Update it on the payment provider's page. As soon as it's ready, we send this payout again — you don't need to request it.",
  };
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
export function payoutTracker(p: Pick<ApiPayout, "state" | "requestedAt" | "decidedAt" | "sentAt" | "paidAt"> & Partial<Pick<ApiPayout, "approvedAutomatically">>): TrackerStep[] | null {
  /* How many steps are behind it: requested (1), approved (2), sent (3), paid (4). */
  const done = ({ REQUESTED: 1, APPROVED: 2, SENDING: 3, PAID: 4 } as Record<string, number>)[p.state];
  if (done === undefined) return null;
  const steps = [
    { label: "Requested", at: p.requestedAt, waiting: "" },
    { label: p.approvedAutomatically ? "Approved automatically" : "Approved by BTG", at: p.decidedAt, waiting: "Waiting for BTG" },
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
  { key: "problems", label: "Failed", states: ["FAILED"] },
];
export const approvalTab = (v: unknown): ApprovalTab =>
  APPROVAL_TABS.some((t) => t.key === v) ? (v as ApprovalTab) : "waiting";
/** A tab's count from GET /payouts' per-state counts. 2S5-BE-07 — the Failed
 *  tab counts only what needs BTG unless every failed payout is shown. */
export const tabCount = (tab: ApprovalTab, counts: Record<string, number>, waiting?: ApiPayoutList["waiting"], showAll = false) =>
  tab === "problems" && waiting && !showAll
    ? waiting.failed.BTG
    : APPROVAL_TABS.find((t) => t.key === tab)!.states.reduce((s, st) => s + (counts[st] ?? 0), 0);

/** 2S5-BE-07 — the Failed tab's filter: what needs BTG (the default), or every failed payout. */
export type FailedFilter = "btg" | "all";
export const failedFilter = (v: unknown): FailedFilter => (v === "all" ? "all" : "btg");
/** The list read for a tab: the Failed tab asks only for what waits on BTG by default. */
export function listQuery(tab: ApprovalTab, filter: FailedFilter = "btg"): string {
  const states = APPROVAL_TABS.find((t) => t.key === tab)!.states.join(",");
  return tab === "problems" && filter === "btg" ? `state=${states}&waitingOn=BTG` : `state=${states}`;
}

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

export type ApiAdminPayout = ApiPayout & {
  payeeType: string; payeeId: string; payeeName: string;
  /** 2S5-BE-06 / -07 — BTG's only: why it waits, the failure kind and the retry schedule. */
  reviewReasons?: string[];
  failureKind?: "TEMPORARY" | "ACCOUNT" | "OTHER" | null;
  retryCount?: number;
  nextRetryAt?: string | null;
};
export type ApiPayoutList = {
  payouts: ApiAdminPayout[];
  counts: Record<string, number>;
  /** 2S5-BE-07 — how many wait on whom; `failed` is the FAILED ones only. Optional: older reads. */
  waiting?: Record<WaitingOn, number> & { failed: Record<WaitingOn, number> };
};
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
export function auditTrail(p: Pick<ApiAdminPayout, "state" | "payeeName" | "requestedAt" | "decidedAt" | "sentAt" | "paidAt" | "decisionNote" | "failureReason" | "approvedAutomatically">) {
  const out: Array<{ what: string; when: string }> = [{ what: `Requested by ${p.payeeName}`, when: stamp(p.requestedAt) }];
  if (p.decidedAt) out.push({ what: p.state === "REJECTED" ? `Sent back by BTG${p.decisionNote ? `: “${p.decisionNote}”` : ""}` : p.approvedAutomatically ? "Approved automatically — every check passed" : "Approved by BTG", when: stamp(p.decidedAt) });
  if (p.sentAt) out.push({ what: "Handed to the payment provider", when: stamp(p.sentAt) });
  if (p.paidAt) out.push({ what: "Paid — confirmed by the payment provider", when: stamp(p.paidAt) });
  if (p.state === "FAILED") out.push({ what: `Couldn't send${p.failureReason ? `: ${p.failureReason}` : ""}`, when: "" });
  return out;
}

/* ======================= automatic approval and retries (2S5-FE-06) */

/** "Approved automatically" — on a payout the rule approved, whatever its state since. Null otherwise. */
export function approvalBadge(p: Pick<ApiPayout, "state"> & Partial<Pick<ApiPayout, "approvedAutomatically">>): string | null {
  return p.approvedAutomatically && p.state !== "REQUESTED" && p.state !== "REJECTED" ? "Approved automatically" : null;
}

/** BTG's line for why a REQUESTED payout waits: "Waiting because: Over $2,000 · …". Null when there is none. */
export function waitingReasons(p: Pick<ApiAdminPayout, "state" | "reviewReasons">): string | null {
  if (p.state !== "REQUESTED" || !p.reviewReasons?.length) return null;
  return `Waiting because: ${p.reviewReasons.join(" · ")}`;
}

/** "Oct 3, 4:00 pm" (UTC, as `stamp`). */
export function retryWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(" AM", " am").replace(" PM", " pm");
  return `${date}, ${time}`;
}

/** The automatic retries a temporary failure gets (2S5-BE-07). */
export const AUTO_RETRIES = 3;

/**
 * BTG's retry status for a FAILED payout, in words:
 *   "Retrying automatically — next try Oct 3, 4:00 pm (2 of 3)"
 *   "Waiting for the payee to fix their payout account"
 *   or BTG's: its reason ("Couldn't be sent after 3 tries"), else the provider's.
 */
export function retryStatus(p: Pick<ApiAdminPayout, "state" | "waitingOn" | "nextRetryAt" | "retryCount" | "reviewReasons" | "failureReason">): { label: string; tone: Tone; needsBtg: boolean } | null {
  if (p.state !== "FAILED") return null;
  if (p.waitingOn === "SYSTEM_RETRY") {
    const when = retryWhen(p.nextRetryAt);
    return { label: `Retrying automatically — next try ${when || "soon"} (${(p.retryCount ?? 0) + 1} of ${AUTO_RETRIES})`, tone: "primary", needsBtg: false };
  }
  if (p.waitingOn === "PAYEE_ACCOUNT") return { label: "Waiting for the payee to fix their payout account", tone: "warn", needsBtg: false };
  const why = p.reviewReasons?.[0] ?? (p.failureReason ? `Couldn't send: ${p.failureReason}` : "The payment provider couldn't send it");
  return { label: `Needs BTG — ${why}`, tone: "danger", needsBtg: true };
}
