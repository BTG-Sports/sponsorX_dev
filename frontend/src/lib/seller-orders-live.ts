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

import { cancelMarkWhy, sellerCancelBadge, sellerCancelBanner, type SellerCancellation } from "@/lib/cancellations-live";
import {
  ANSWER_WINDOW_HOURS, OVERDUE_HANDOVER_DAYS, answerQuote, datesText, dayOf, inWords, money, stamp,
  type ApiIssue, type ApiTimelineItem,
} from "@/lib/order-automation-live";

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
  /* 2S4-BE-11 — the date it is due by now (a redelivery's, else the line's
     own), the problem exchange, and whether it is the seller's turn. Optional
     so older reads (and fixtures) still type. */
  lastDate?: string;
  redeliverOn?: string | null;
  issue?: ApiIssue | null;
  canAnswerProblem?: boolean;
  /** GET /sales/:id only — the whole exchange, oldest first. */
  timeline?: ApiTimelineItem[];
  /* 2S4-BE-12 — the sponsor asked to cancel (answer before the deadline), and
     the seller's own cancelling: may they, their count in the last 90 days,
     and how the line was cancelled. Optional: older reads and fixtures. */
  canAnswerCancellation?: boolean;
  cancellation?: SellerCancellation | null;
};

/** The line's total — what a refund of the whole line gives back. */
export const lineTotalCents = (o: Pick<ApiSellerOrder, "line">) => o.line.quantity * o.line.unitPriceCents;

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

/* The day words are shared with the order-automation helpers (2S4-FE-05). */
export { datesText, dayOf, stamp };

/** "2 sessions × $500". */
export function lineSummary(l: Pick<ApiSellerOrder["line"], "quantity" | "unit" | "unitPriceCents">): string {
  return `${l.quantity} ${l.quantity === 1 ? l.unit : `${l.unit}s`} × ${usd(l.unitPriceCents)}`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** The status pill — in words and a mark, never colour alone. A problem says whose turn it is (2S4-BE-11). */
export function orderBadge(
  o: Pick<ApiSellerOrder, "state" | "sponsor"> & Partial<Pick<ApiSellerOrder, "issue" | "redeliverOn" | "cancellation" | "canAnswerCancellation">>,
): { label: string; tone: Tone; mark: string } {
  /* 2S4-FE-06 — a request to cancel, or a cancelled line, says so first. */
  const cancel = sellerCancelBadge(o);
  if (cancel) return cancel;
  switch (o.state) {
    case "UNPAID": return { label: "Waiting for payment", tone: "neutral", mark: "○" };
    case "IN_DELIVERY":
      return o.redeliverOn ? { label: `Redelivery booked · ${dayOf(o.redeliverOn)}`, tone: "accent", mark: "✓" } : { label: "In delivery", tone: "primary", mark: "●" };
    case "DELIVERED": return { label: `Waiting for ${o.sponsor.name}`, tone: "warn", mark: "!" };
    case "CONFIRMED": return { label: "Confirmed", tone: "accent", mark: "✓" };
    case "PROBLEM":
      if (o.issue?.stage === "SPONSOR_TO_ANSWER") return { label: `Waiting for ${o.sponsor.name}`, tone: "warn", mark: "!" };
      if (o.issue?.stage === "ESCALATED") return { label: "BTG is deciding", tone: "warn", mark: "!" };
      return { label: "Problem reported", tone: "danger", mark: "✕" };
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

export type SellerBanner = { tone: "warn" | "accent" | "danger" | "primary"; title: string; text: string; quote?: string; money?: boolean };

/** "You chose: Deliver again on Oct 24: “…”" — the seller's own answer, quoted back. */
function chose(o: ApiSellerOrder): string | undefined {
  const a = o.issue?.sellerAnswer;
  return a ? `You chose: ${answerQuote(a, lineTotalCents(o), o.sponsor.name)}` : undefined;
}

/**
 * The banner above a reported problem once it has left the seller's turn
 * (SO sent / escalated / noanswer / settled / refunded) — null while it is
 * the seller's to answer: the answer card says it then.
 */
function problemBanner(o: ApiSellerOrder, now: Date): SellerBanner | null {
  const s = o.sponsor.name;
  const i = o.issue ?? null;
  if (o.state === "PROBLEM") {
    if (!i || i.kind !== "PROBLEM") {
      return { tone: "warn", title: `${s} reported a problem — BTG is deciding`, text: "This line’s payout is on hold until BTG decides. You’ll hear by email.", quote: o.problem ? `${s}: “${o.problem.text}”` : undefined };
    }
    if (i.stage === "SELLER_TO_ANSWER") {
      if (o.canAnswerProblem ?? i.sellerCanAnswer) return null;
      return { tone: "warn", title: `No answer from you in ${ANSWER_WINDOW_HOURS} hours — BTG is deciding.`, text: `The answer was due ${i.sellerDueAt ? stamp(i.sellerDueAt) : "earlier"}. You’ll hear by email.` };
    }
    if (i.stage === "SPONSOR_TO_ANSWER" && i.sponsorDueAt) {
      const left = inWords(i.sponsorDueAt, now);
      return {
        tone: "primary",
        title: `Sent ✓ — ${s} has until ${stamp(i.sponsorDueAt)} to accept or reject your answer.`,
        text: `${i.sellerAnswer?.at ? `You answered ${stamp(i.sellerAnswer.at)}. ` : ""}${left ? `Their deadline is ${left}. ` : ""}If they reject it, BTG decides.`,
        quote: chose(o),
      };
    }
    if (i.stage === "ESCALATED") {
      const why = i.escalation?.reason;
      if (why === "SELLER_NO_ANSWER") {
        return { tone: "warn", title: `No answer from you in ${ANSWER_WINDOW_HOURS} hours — BTG is deciding.`, text: `The answer was due ${i.sellerDueAt ? stamp(i.sellerDueAt) : "earlier"}. You’ll hear by email.` };
      }
      return {
        tone: "warn",
        title: why === "SPONSOR_NO_ANSWER" ? `${s} didn’t answer in ${ANSWER_WINDOW_HOURS} hours — BTG is deciding.` : `${s} rejected your answer — BTG is deciding. You’ll hear by email.`,
        text: "Your payout for this line is on hold until BTG decides.",
        quote: chose(o),
      };
    }
  }
  if (i?.stage === "SETTLED" && i.outcome) {
    if (o.state === "IN_DELIVERY" && i.outcome.outcome === "REDELIVER") {
      const day = o.redeliverOn ? dayOf(o.redeliverOn) : i.sellerAnswer?.newDate ? dayOf(i.sellerAnswer.newDate) : "the new date";
      return { tone: "accent", title: `${s} accepted — redelivery booked ${day}.`, text: `Deliver it on ${day}, then mark it delivered. ${s} confirms within ${CONFIRM_HOURS} hours, as usual.` };
    }
    if (o.state === "REFUNDED" && i.outcome.outcome === "REFUNDED") {
      return { tone: "accent", title: `${s} accepted the refund — ${money(lineTotalCents(o))} refunded.`, text: "Your share for this line is $0.00. Any other lines on the order are paid as usual." };
    }
  }
  if (o.state === "IN_DELIVERY" && i?.kind === "OVERDUE" && i.stage === "ESCALATED") {
    return { tone: "warn", title: `No delivery marked ${OVERDUE_HANDOVER_DAYS} days after ${dayOf(o.lastDate ?? o.line.endsOn)} — BTG has been told.`, text: "Mark it delivered as soon as it’s done. BTG may contact you." };
  }
  return null;
}

/** The banner above a line once something has happened to it. */
export function orderBanner(o: ApiSellerOrder, now: Date = new Date()): SellerBanner | null {
  const s = o.sponsor.name;
  /* 2S4-FE-06 — a cancellation has its own box (with Agree / Keep while it is the seller's turn). */
  if (sellerCancelBanner(o, lineTotalCents(o), now)) return null;
  const p = problemBanner(o, now);
  if (p || o.state === "PROBLEM") return p;
  if (o.state === "DELIVERED" && o.markedAt) {
    return {
      tone: "warn",
      title: `Marked delivered · waiting for ${s}`,
      text: `${s} has until ${stamp(o.confirmDueAt ?? confirmBy(o.markedAt))} to confirm or report a problem. If they don’t answer by then, it counts as confirmed.`,
    };
  }
  if (o.state === "CONFIRMED" && o.confirmedAt) {
    const agreed = o.issue?.stage === "SETTLED" && o.issue.outcome?.outcome === "CONFIRMED";
    const title = agreed
      ? `${s} accepted your answer — it counts as delivered ✓`
      : o.confirmedBy === "NO_ANSWER"
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
export function markControl(
  o: Pick<ApiSellerOrder, "state"> & Partial<Pick<ApiSellerOrder, "issue" | "sponsor" | "canMarkDelivered" | "canAnswerCancellation">>,
): { applies: boolean; why: string } {
  switch (o.state) {
    case "UNPAID": return { applies: false, why: "You can mark it delivered once it’s paid" };
    case "IN_DELIVERY": {
      /* 2S4-BE-12 — not while the sponsor's request to cancel is open. */
      const asked = cancelMarkWhy({ state: o.state, sponsor: o.sponsor ?? { name: "the sponsor" }, issue: o.issue, canAnswerCancellation: o.canAnswerCancellation });
      if (asked) return { applies: false, why: asked };
      if (o.canMarkDelivered === false) return { applies: false, why: "It can’t be marked delivered just now" };
      return { applies: true, why: "Add a short note on what you delivered" };
    }
    case "DELIVERED": return { applies: false, why: "Already marked delivered" };
    case "CONFIRMED": return { applies: false, why: "Delivered and confirmed" };
    case "PROBLEM":
      if (o.issue?.stage === "SELLER_TO_ANSWER" && o.issue.sellerCanAnswer) return { applies: false, why: "Answer the problem above first" };
      if (o.issue?.stage === "SPONSOR_TO_ANSWER") return { applies: false, why: "Waiting for the sponsor to accept or reject your answer" };
      return { applies: false, why: "BTG is deciding this line" };
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
  const stage = o.issue?.stage;
  const problemNote = stage === "SPONSOR_TO_ANSWER" ? `Waiting for ${o.sponsor.name}` : stage === "ESCALATED" ? "BTG is deciding" : "Problem reported";
  const currentNote = {
    UNPAID: "Not paid yet", IN_DELIVERY: o.redeliverOn ? `Redelivery ${dayOf(o.redeliverOn)}` : "Now", DELIVERED: "Waiting", PROBLEM: problemNote, CONFIRMED: "",
    REFUNDED: o.cancellation?.cancelled ? "Cancelled" : "Refunded", CANCELLED: "Cancelled",
  }[o.state];
  const waiting = o.state === "PROBLEM" && (stage === "SPONSOR_TO_ANSWER" || stage === "ESCALATED");
  const tone = waiting ? "warn" : o.state === "PROBLEM" || o.state === "REFUNDED" ? "danger" : o.state === "UNPAID" || o.state === "CANCELLED" ? "warn" : "primary";
  return labels.map((label, i) => ({
    label,
    state: i < reached ? "done" : i === reached ? "current" : "todo",
    note: i < reached ? done[i]! : i === reached ? currentNote : "Not yet",
    tone,
  }));
}

/** The seller's words for a refused write, from the API's error body. */
export function apiRefusal(status: number, body: unknown, fallback: string): string {
  const e = (body as { error?: { code?: unknown; message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  /* A coded 403 says why (e.g. guardian_must_act — a minor's guardian answers); only a bare one means "not yours". */
  if (status === 403 && !(typeof e?.code === "string" && e.code !== "forbidden" && typeof e?.message === "string")) return "Only this line’s own seller can do that.";
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
