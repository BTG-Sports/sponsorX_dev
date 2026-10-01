/* --------------------------------------------------------------------------
   2S4-FE-03 / the seller half of 2S4-FE-04 — the seller's Orders page
   (Claude Design Orders.dc.html), for an athlete and for a team.

   SCAFFOLD. Neither read exists for a seller yet:

     GET /marketplace-orders, /marketplace-orders/:id   the policy matrix
         (backend/src/auth/policy.ts `marketplaceOrder`) admits BTG, Finance
         and the buying sponsor only — an ATHLETE or PROPERTY_MGR is refused.
         The sellers' view, each seeing only their own share, is 2S4-BE-06.
     GET /marketplace-orders/:id/financials             BTG and Finance only
         (`orderFinancials`) — the frozen split is the margin.
     Marking a line delivered and the sponsor's confirmation are 2S4-BE-07.

   So the screens render from the samples below, typed like the read
   2S4-BE-06 is expected to return: one row per order line the seller sold,
   carrying THEIR share only, and the sponsor's contact only once paid.

   The agreed rules (programme owner, 2026-10-01) the words follow:
     · the sponsor has 24 hours from "marked delivered" to confirm or report
       a problem; no answer counts as confirmed;
     · a confirmed line closes 30 days after confirmation;
     · each seller sees only their own share.
   -------------------------------------------------------------------------- */

export type SellerKind = "athlete" | "team";

export type SellerLineState = "UNPAID" | "IN_DELIVERY" | "MARKED_DELIVERED" | "CONFIRMED" | "PROBLEM";

/** One sold line, as the seller sees it — the expected 2S4-BE-06 shape. */
export type ApiSellerOrder = {
  id: string;
  /** The order's reference, as the sponsor sees it on their receipt. */
  ref: string;
  state: SellerLineState;
  sponsor: {
    name: string;
    /** Null until the sponsor has paid — contact details are never shown before. */
    contact: { name: string; email: string; phone: string | null } | null;
  };
  line: {
    title: string;
    quantity: number;
    /** "session", "post" — the unit the item is sold in. */
    unit: string;
    unitPriceCents: number;
    /** The delivery days, ISO dates. */
    dates: string[];
    /** Who sold it: the athlete themselves, or their team. */
    soldBy: string;
  };
  /** The caller's own share of the line, in cents. Never anyone else's. */
  shareCents: number;
  placedAt: string;
  paidAt: string | null;
  markedAt: string | null;
  markedBy: string | null;
  deliveryNote: string | null;
  confirmedAt: string | null;
  /** SPONSOR — they confirmed; NO_ANSWER — 24 hours passed without a reply. */
  confirmedBy: "SPONSOR" | "NO_ANSWER" | null;
  problem: { reportedAt: string; text: string } | null;
};

/* ------------------------------------------------------------- the rules */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The sponsor's window to confirm or report a problem. */
export const CONFIRM_HOURS = 24;
/** A confirmed line closes this many days after confirmation. */
export const CLOSE_DAYS = 30;

export function confirmBy(markedAt: string): string {
  return new Date(new Date(markedAt).getTime() + CONFIRM_HOURS * HOUR).toISOString();
}

export function closesOn(confirmedAt: string): string {
  return new Date(new Date(confirmedAt).getTime() + CLOSE_DAYS * DAY).toISOString();
}

/* ---------------------------------------------------------------- words */

export function usd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Shares always show cents: "$604.24". */
export function shareUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Oct 10" — a delivery day (UTC, so server and browser agree). */
export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 18, 7:40 pm UTC". */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).toLowerCase();
  return `${dayOf(iso)}, ${time} UTC`;
}

/** "Oct 10", "Oct 10 and Oct 17", "Oct 10, Oct 17 and Oct 24". */
export function datesText(dates: readonly string[]): string {
  const days = dates.map(dayOf);
  if (days.length <= 1) return days[0] ?? "";
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/** "2 sessions × $500". */
export function lineSummary(l: ApiSellerOrder["line"]): string {
  return `${l.quantity} ${l.quantity === 1 ? l.unit : `${l.unit}s`} × ${usd(l.unitPriceCents)}`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** The status pill — in words and a mark, never colour alone. */
export function orderBadge(o: Pick<ApiSellerOrder, "state" | "sponsor">): { label: string; tone: Tone; mark: string } {
  switch (o.state) {
    case "UNPAID": return { label: "Waiting for payment", tone: "neutral", mark: "○" };
    case "IN_DELIVERY": return { label: "In delivery", tone: "primary", mark: "●" };
    case "MARKED_DELIVERED": return { label: `Waiting for ${o.sponsor.name}`, tone: "warn", mark: "!" };
    case "CONFIRMED": return { label: "Confirmed", tone: "accent", mark: "✓" };
    case "PROBLEM": return { label: "Problem reported", tone: "danger", mark: "✕" };
  }
}

/** Whose share the page shows, and where the other one lives. */
export function shareNote(kind: SellerKind, soldByTeam: boolean): string {
  if (kind === "team") return "Only the team’s share is shown. Each athlete’s share is on their own Orders page.";
  return soldByTeam
    ? "Only your share is shown. Your team’s share is on their own Orders page."
    : "Only your share is shown.";
}

/** The banner above a line once something has happened to it. */
export function orderBanner(o: ApiSellerOrder): null | { tone: "warn" | "accent" | "danger"; title: string; text: string; quote?: string; money?: boolean } {
  const s = o.sponsor.name;
  if (o.state === "MARKED_DELIVERED" && o.markedAt) {
    return {
      tone: "warn",
      title: `Marked delivered · waiting for ${s}`,
      text: `${s} has until ${stamp(confirmBy(o.markedAt))} to confirm or report a problem. If they don’t answer by then, it counts as confirmed.`,
    };
  }
  if (o.state === "CONFIRMED" && o.confirmedAt) {
    return {
      tone: "accent",
      title: o.confirmedBy === "NO_ANSWER" ? `Counted as confirmed ✓ — ${s} didn’t answer in ${CONFIRM_HOURS} hours` : `Confirmed by ${s} ✓`,
      text: `Your share can now be paid out. The order closes on ${dayOf(closesOn(o.confirmedAt))}, ${CLOSE_DAYS} days after confirmation.`,
      money: true,
    };
  }
  if (o.state === "PROBLEM" && o.problem) {
    return {
      tone: "danger",
      title: `${s} reported a problem`,
      text: "BTG is looking into it — this line’s payout is on hold.",
      quote: `${s}: “${o.problem.text}”`,
    };
  }
  return null;
}

/** Whether "Mark delivered" applies to this line, and the reason beside it. */
export function markControl(o: Pick<ApiSellerOrder, "state">): { applies: boolean; why: string } {
  switch (o.state) {
    case "UNPAID": return { applies: false, why: "You can mark it delivered once it’s paid" };
    case "IN_DELIVERY": return { applies: true, why: "Add a short note on what you delivered" };
    case "MARKED_DELIVERED": return { applies: false, why: "Already marked delivered" };
    case "CONFIRMED": return { applies: false, why: "Delivered and confirmed" };
    case "PROBLEM": return { applies: false, why: "BTG is reviewing this line" };
  }
}

export type TrackStep = { label: string; state: "done" | "current" | "todo"; note: string; tone: "primary" | "warn" | "danger" };

/** Paid → In delivery → Marked delivered → Confirmed by sponsor. */
export function trackSteps(o: ApiSellerOrder): TrackStep[] {
  const labels = ["Paid", "In delivery", "Marked delivered", "Confirmed by sponsor"];
  const reached = { UNPAID: 0, IN_DELIVERY: 1, MARKED_DELIVERED: 2, PROBLEM: 3, CONFIRMED: 4 }[o.state];
  const done = [
    o.paidAt ? dayOf(o.paidAt) : "Done",
    o.line.dates[0] ? dayOf(o.line.dates[0]) : "Done",
    o.markedAt ? dayOf(o.markedAt) : "Done",
    o.confirmedAt ? dayOf(o.confirmedAt) : "Done",
  ];
  const currentNote = { UNPAID: "Not paid yet", IN_DELIVERY: "Now", MARKED_DELIVERED: "Waiting", PROBLEM: "Problem reported", CONFIRMED: "" }[o.state];
  const tone = o.state === "PROBLEM" ? "danger" : o.state === "UNPAID" ? "warn" : "primary";
  return labels.map((label, i) => ({
    label,
    state: i < reached ? "done" : i === reached ? "current" : "todo",
    note: i < reached ? done[i]! : i === reached ? currentNote : "Not yet",
    tone,
  }));
}

/* -------------------------------------------------------------- samples */

/* Riley Carter, on the Westfield Hawks roster, and the Hawks themselves:
   the same five lines, each seeing their own share. The first is the
   design's own order (SX-BAY6NFY3: $1,000, Riley $604.24, Hawks $151.05);
   the others use the same split so every state is on screen. */
const SPLIT = { athlete: 0.60424, team: 0.15105 } as const;

type Base = Omit<ApiSellerOrder, "shareCents">;

const BASE: Base[] = [
  {
    id: "ord-bay6nfy3", ref: "SX-BAY6NFY3", state: "IN_DELIVERY",
    sponsor: { name: "Harbor Coffee", contact: { name: "Dana Brooks", email: "dana@harborcoffee.example", phone: "(301) 555-0142" } },
    line: { title: "Youth basketball clinic with Riley Carter", quantity: 2, unit: "session", unitPriceCents: 50_000, dates: ["2026-10-10", "2026-10-17"], soldBy: "Westfield Hawks" },
    placedAt: "2026-10-01T14:05:00.000Z", paidAt: "2026-10-01T14:06:00.000Z",
    markedAt: null, markedBy: null, deliveryNote: null, confirmedAt: null, confirmedBy: null, problem: null,
  },
  {
    id: "ord-7qk2pl9d", ref: "SX-7QK2PL9D", state: "MARKED_DELIVERED",
    sponsor: { name: "Laurel Auto Body", contact: { name: "Marcus Hill", email: "marcus@laurelautobody.example", phone: null } },
    line: { title: "Sponsored Instagram post by Riley Carter", quantity: 1, unit: "post", unitPriceCents: 30_000, dates: ["2026-09-29"], soldBy: "Westfield Hawks" },
    placedAt: "2026-09-24T16:20:00.000Z", paidAt: "2026-09-24T16:21:00.000Z",
    markedAt: "2026-09-30T19:40:00.000Z", markedBy: "Riley Carter", deliveryNote: "Posted Sep 29 with the shop tagged; the link is in the post caption.",
    confirmedAt: null, confirmedBy: null, problem: null,
  },
  {
    id: "ord-m4t8rc2w", ref: "SX-M4T8RC2W", state: "CONFIRMED",
    sponsor: { name: "Westfield Pizza Co.", contact: { name: "Ana Ruiz", email: "ana@westfieldpizza.example", phone: "(301) 555-0187" } },
    line: { title: "Autograph session with Riley Carter", quantity: 1, unit: "session", unitPriceCents: 40_000, dates: ["2026-09-19"], soldBy: "Westfield Hawks" },
    placedAt: "2026-09-08T12:00:00.000Z", paidAt: "2026-09-08T12:01:00.000Z",
    markedAt: "2026-09-19T21:10:00.000Z", markedBy: "Riley Carter", deliveryNote: "Two hours at the store, about 60 fans signed for.",
    confirmedAt: "2026-09-20T09:30:00.000Z", confirmedBy: "SPONSOR", problem: null,
  },
  {
    id: "ord-h9vd3n6k", ref: "SX-H9VD3N6K", state: "PROBLEM",
    sponsor: { name: "Bayside Dental", contact: { name: "Priya Shah", email: "priya@baysidedental.example", phone: "(301) 555-0119" } },
    line: { title: "Youth basketball clinic with Riley Carter", quantity: 2, unit: "session", unitPriceCents: 50_000, dates: ["2026-09-20", "2026-09-27"], soldBy: "Westfield Hawks" },
    placedAt: "2026-09-10T15:00:00.000Z", paidAt: "2026-09-10T15:02:00.000Z",
    markedAt: "2026-09-27T19:40:00.000Z", markedBy: "Riley Carter", deliveryNote: "Both clinics held, Sep 20 and 27, 18 kids each.",
    confirmedAt: null, confirmedBy: null,
    problem: { reportedAt: "2026-09-28T10:15:00.000Z", text: "We only saw one clinic. The Sep 27 session didn’t happen." },
  },
  {
    id: "ord-p2w7xj5b", ref: "SX-P2W7XJ5B", state: "UNPAID",
    sponsor: { name: "Chesapeake Credit Union", contact: null },
    line: { title: "Game-day appearance by Riley Carter", quantity: 1, unit: "appearance", unitPriceCents: 60_000, dates: ["2026-10-24"], soldBy: "Westfield Hawks" },
    placedAt: "2026-09-30T18:00:00.000Z", paidAt: null,
    markedAt: null, markedBy: null, deliveryNote: null, confirmedAt: null, confirmedBy: null, problem: null,
  },
];

const shareOf = (b: Base, kind: SellerKind) => {
  const gross = b.line.quantity * b.line.unitPriceCents;
  /* The design's own figures for its own order; the same split elsewhere. */
  if (b.ref === "SX-BAY6NFY3") return kind === "athlete" ? 60_424 : 15_105;
  return Math.round(gross * SPLIT[kind]);
};

export function sampleOrders(kind: SellerKind): ApiSellerOrder[] {
  return BASE.map((b) => ({ ...b, shareCents: shareOf(b, kind) }));
}

export function sampleOrder(kind: SellerKind, id: string): ApiSellerOrder | null {
  return sampleOrders(kind).find((o) => o.id === id) ?? null;
}

/** The seller the samples speak for, and where their money and nav live. */
export const SELLER = {
  athlete: { name: "Riley Carter", basePath: "/athlete/sales", moneyHref: "/athlete/money", moneyLabel: "Go to My money" },
  team: { name: "Westfield Hawks", basePath: "/property/sales", moneyHref: "/property/earnings", moneyLabel: "Go to Earnings" },
} as const;
