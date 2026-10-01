/* --------------------------------------------------------------------------
   2S4-FE-03 / the seller half of 2S4-FE-04 — the seller's Orders page
   (Claude Design Orders.dc.html), for an athlete and for a team.

   LIVE since 2S4-BE-06 / 2S4-BE-07:

     GET  /sales                 every order line the caller sells — a team's
                                 manager, or the athlete whose item it is —
                                 newest first, with the caller's OWN share
                                 only (from their own ledger entries), and
                                 the sponsor's contact only once paid
     GET  /sales/:lineId         one of them
     POST /sales/:lineId/proof   a presigned PUT for the optional photo
                                 (private bucket)
     POST /sales/:lineId/delivered  { note, proofKey?, proofLink? } — the
                                 sponsor then has 24 hours to confirm or
                                 report a problem; silence confirms

   The agreed rules (programme owner, 2026-10-01) the words follow:
     · the sponsor has 24 hours from "marked delivered" to confirm or report
       a problem; no answer counts as confirmed;
     · an order closes 30 days after its last line is confirmed;
     · each seller sees only their own share.

   Pure: shapes, rules and the words the screens derive.
   -------------------------------------------------------------------------- */

export type SellerKind = "athlete" | "team";

export type SellerLineState = "UNPAID" | "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED";

/** One sold line, as the seller sees it — GET /sales (2S4-BE-06). */
export type ApiSellerOrder = {
  /** The order line's id — what /sales/:id and the delivery routes take. */
  id: string;
  orderId: string;
  /** The order's reference, as the sponsor sees it on their receipt. */
  ref: string;
  state: SellerLineState;
  orderState: string;
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
    startsOn: string;
    endsOn: string;
    /** The days the line covers, ISO dates: one, or its first and last. */
    dates: string[];
    /** Who sold it: the team, or the athlete themselves. */
    soldBy: string;
    /** The athlete whose item it is, when there is one. */
    athlete: string | null;
  };
  /** The caller's own share of the line, in cents. Never anyone else's. */
  shareCents: number;
  placedAt: string;
  paidAt: string | null;
  markedAt: string | null;
  markedBy: string | null;
  deliveryNote: string | null;
  proof: { photo: boolean; link: string | null };
  /** markedAt + 24 hours: when silence counts as confirmed. */
  confirmDueAt: string | null;
  confirmedAt: string | null;
  /** SPONSOR — they confirmed; NO_ANSWER — 24 hours passed without a reply; BTG — BTG confirmed it. */
  confirmedBy: "SPONSOR" | "NO_ANSWER" | "BTG" | null;
  problem: { reportedAt: string; text: string } | null;
  resolution: { decision: "CONFIRMED" | "REFUNDED"; note: string | null; at: string | null } | null;
  overdue: boolean;
  canMarkDelivered: boolean;
};

/* ------------------------------------------------------------- the rules */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The sponsor's window to confirm or report a problem. */
export const CONFIRM_HOURS = 24;
/** An order closes this many days after its last line is confirmed. */
export const CLOSE_DAYS = 30;

export function confirmBy(markedAt: string): string {
  return new Date(new Date(markedAt).getTime() + CONFIRM_HOURS * HOUR).toISOString();
}

export function closesOn(confirmedAt: string): string {
  return new Date(new Date(confirmedAt).getTime() + CLOSE_DAYS * DAY).toISOString();
}

/** The proof photo the API takes: JPEG, PNG or PDF, up to 10 MB. Null means fine. */
export const PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export function proofProblem(f: { type: string; size: number }): string | null {
  if (!(PROOF_TYPES as readonly string[]).includes(f.type)) return "A photo (JPEG or PNG) or a PDF.";
  if (f.size > PROOF_MAX_BYTES) return "That file is over 10 MB.";
  return null;
}

/** A link the API takes: https only. Null means fine (or empty). */
export function linkProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? null : "A link starts with https://";
  } catch {
    return "That isn't a link — it starts with https://";
  }
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
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
export function lineSummary(l: Pick<ApiSellerOrder["line"], "quantity" | "unit" | "unitPriceCents">): string {
  return `${l.quantity} ${l.quantity === 1 ? l.unit : `${l.unit}s`} × ${usd(l.unitPriceCents)}`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** The status pill — in words and a mark, never colour alone. */
export function orderBadge(o: Pick<ApiSellerOrder, "state" | "sponsor">): { label: string; tone: Tone; mark: string } {
  switch (o.state) {
    case "UNPAID": return { label: "Waiting for payment", tone: "neutral", mark: "○" };
    case "IN_DELIVERY": return { label: "In delivery", tone: "primary", mark: "●" };
    case "DELIVERED": return { label: `Waiting for ${o.sponsor.name}`, tone: "warn", mark: "!" };
    case "CONFIRMED": return { label: "Confirmed", tone: "accent", mark: "✓" };
    case "PROBLEM": return { label: "Problem reported", tone: "danger", mark: "✕" };
    case "REFUNDED": return { label: "Refunded", tone: "neutral", mark: "↺" };
    case "CANCELLED": return { label: "Cancelled", tone: "neutral", mark: "–" };
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
  if (o.state === "DELIVERED" && o.markedAt) {
    return {
      tone: "warn",
      title: `Marked delivered · waiting for ${s}`,
      text: `${s} has until ${stamp(o.confirmDueAt ?? confirmBy(o.markedAt))} to confirm or report a problem. If they don’t answer by then, it counts as confirmed.`,
    };
  }
  if (o.state === "CONFIRMED" && o.confirmedAt) {
    const title = o.confirmedBy === "NO_ANSWER"
      ? `Counted as confirmed ✓ — ${s} didn’t answer in ${CONFIRM_HOURS} hours`
      : o.confirmedBy === "BTG" ? "Confirmed by BTG ✓" : `Confirmed by ${s} ✓`;
    return {
      tone: "accent",
      title,
      /* Payable after the payout hold, not at once; the order closes 30 days after its LAST line is confirmed. */
      text: `Your share becomes payable once the payout hold ends — My money shows when. The order closes ${CLOSE_DAYS} days after its last line is confirmed.`,
      quote: o.resolution?.note ? `BTG: “${o.resolution.note}”` : undefined,
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
  if (o.state === "REFUNDED") {
    return {
      tone: "danger",
      title: "Cancelled and refunded",
      text: `${s} was refunded for this line, so there is no share to pay out.`,
      quote: o.resolution?.note ? `BTG: “${o.resolution.note}”` : undefined,
    };
  }
  if (o.state === "IN_DELIVERY" && o.overdue) {
    return { tone: "warn", title: "The last date has passed", text: "Mark it delivered once it’s done — your share is paid only after the sponsor confirms." };
  }
  return null;
}

/** Whether "Mark delivered" applies to this line, and the reason beside it. */
export function markControl(o: Pick<ApiSellerOrder, "state">): { applies: boolean; why: string } {
  switch (o.state) {
    case "UNPAID": return { applies: false, why: "You can mark it delivered once it’s paid" };
    case "IN_DELIVERY": return { applies: true, why: "Add a short note on what you delivered" };
    case "DELIVERED": return { applies: false, why: "Already marked delivered" };
    case "CONFIRMED": return { applies: false, why: "Delivered and confirmed" };
    case "PROBLEM": return { applies: false, why: "BTG is reviewing this line" };
    case "REFUNDED": return { applies: false, why: "This line was refunded" };
    case "CANCELLED": return { applies: false, why: "This order was cancelled" };
  }
}

export type TrackStep = { label: string; state: "done" | "current" | "todo"; note: string; tone: "primary" | "warn" | "danger" };

/** Paid → In delivery → Marked delivered → Confirmed by sponsor. */
export function trackSteps(o: ApiSellerOrder): TrackStep[] {
  const labels = ["Paid", "In delivery", "Marked delivered", "Confirmed by sponsor"];
  const reached = { UNPAID: 0, IN_DELIVERY: 1, DELIVERED: 2, PROBLEM: 3, CONFIRMED: 4, REFUNDED: 3, CANCELLED: 0 }[o.state];
  const done = [
    o.paidAt ? dayOf(o.paidAt) : "Done",
    o.line.dates[0] ? dayOf(o.line.dates[0]) : "Done",
    o.markedAt ? dayOf(o.markedAt) : "Done",
    o.confirmedAt ? dayOf(o.confirmedAt) : "Done",
  ];
  const currentNote = {
    UNPAID: "Not paid yet", IN_DELIVERY: "Now", DELIVERED: "Waiting", PROBLEM: "Problem reported", CONFIRMED: "",
    REFUNDED: "Refunded", CANCELLED: "Cancelled",
  }[o.state];
  const tone = o.state === "PROBLEM" || o.state === "REFUNDED" ? "danger" : o.state === "UNPAID" || o.state === "CANCELLED" ? "warn" : "primary";
  return labels.map((label, i) => ({
    label,
    state: i < reached ? "done" : i === reached ? "current" : "todo",
    note: i < reached ? done[i]! : i === reached ? currentNote : "Not yet",
    tone,
  }));
}

/** The seller's words for a refused write, from the API's error body. */
export function apiRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only this line’s own seller can do that.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}

/** The seller the pages speak for: where their orders, money and nav live. */
export const SELLER = {
  athlete: { basePath: "/athlete/sales", moneyHref: "/athlete/money", moneyLabel: "Go to My money" },
  team: { basePath: "/property/sales", moneyHref: "/property/earnings", moneyLabel: "Go to Earnings" },
} as const;
