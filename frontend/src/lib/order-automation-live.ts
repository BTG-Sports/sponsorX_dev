/* --------------------------------------------------------------------------
   2S4-FE-05 — automatic order handling, on screen. The pure pieces behind
   Claude Design SellerOrderActions.dc.html (SO), SponsorOrderUpdates.dc.html
   (SP) and OrderExceptions.dc.html (BX).

   The rules they put into words (2S4-BE-09 / -10 / -11):
     · a listing that asks for approval asks its SELLER, who has 48 hours to
       accept or decline (silence declines);
     · within the sponsor's spending limit an order is approved on its own;
       above it, it waits for BTG. The limit starts at $5,000, becomes twice
       the largest completed order (capped at $25,000) and stops rising after
       a refund or an upheld problem;
     · an approved order is paid within 3 days or cancelled;
     · a reported problem goes to the seller first (72 hours: deliver again,
       refund the line, or disagree), then back to the sponsor (72 hours:
       accept or reject); BTG decides only what they can't settle.

   Wire shapes are the backend's: domain/order-approval.ts (seller
   approvals), domain/marketplace-order.ts (the order's new fields),
   domain/spending-limit.ts, domain/delivery.ts (issue, timeline, desk).
   -------------------------------------------------------------------------- */

import type { TrackStep } from "@/lib/seller-orders-live";

/* The day and time words, as the Orders pages print them (seller-orders-live
   imports these, so they live here rather than the other way round). */

/** "Oct 10" — a delivery day (UTC, so server and browser agree). */
export function dayOf(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 18, 7:40 pm UTC". */
export function stamp(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).toLowerCase();
  return `${dayOf(iso)}, ${time} UTC`;
}

/** "Oct 10", "Oct 10 and Oct 17", "Oct 10, Oct 17 and Oct 24". */
export function datesText(dates: readonly string[]): string {
  const days = dates.map(dayOf);
  if (days.length <= 1) return days[0] ?? "";
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";
export type Pill = { label: string; tone: Tone; mark: string };

export const SELLER_ANSWER_HOURS = 48;
export const ANSWER_WINDOW_HOURS = 72;
export const PAYMENT_WINDOW_DAYS = 3;
export const CONFIRM_HOURS = 24;
export const OVERDUE_HANDOVER_DAYS = 7;

const HOUR = 3_600_000;

/** "$1,000.00" — order money always shows the cents. */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "Riley Carter’s", "Westfield Hawks’". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/* --------------------------------------------------------------- deadlines */

/** "in 2 days", "in 5 hours", "in 40 min" — null once the time has passed. */
export function inWords(dueIso: string, now: Date): string | null {
  const ms = new Date(dueIso).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const hours = ms / HOUR;
  if (hours >= 24) {
    const d = Math.round(hours / 24);
    return `in ${d} day${d === 1 ? "" : "s"}`;
  }
  if (hours >= 1) {
    const h = Math.floor(hours);
    return `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  return `in ${Math.max(1, Math.floor(ms / 60_000))} min`;
}

/** Hours left before a deadline (0 once passed). */
export function hoursLeft(dueIso: string, now: Date): number {
  return Math.max(0, (new Date(dueIso).getTime() - now.getTime()) / HOUR);
}

export type Deadline = { label: string; tone: Tone; passed: boolean };

/**
 * The deadline chip every party sees: "Answer by Oct 3, 4:00 pm UTC · in 2
 * days". Under a day left it turns red; once passed it says so.
 */
export function deadline(lead: string, dueIso: string, now: Date, tone: Tone = "warn"): Deadline {
  const left = inWords(dueIso, now);
  if (left === null) return { label: `${lead} ${stamp(dueIso)} · time’s up`, tone: "neutral", passed: true };
  return { label: `${lead} ${stamp(dueIso)} · ${left}`, tone: hoursLeft(dueIso, now) < 24 ? "danger" : tone, passed: false };
}

/* --------------------------------------------------- the seller's approval */

export type SellerApprovalState = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CLOSED";
export type ApprovalOutcome = "WAITING" | "WITH_BTG" | "APPROVED" | "CANCELLED";

export type ApiApprovalLine = {
  id: string;
  title: string;
  quantity: number;
  startsOn: string;
  endsOn: string;
  unitPriceCents: number;
  lineTotalCents: number;
};

/** One order waiting for (or answered by) the seller — GET /seller-approvals (2S4-BE-09). */
export type ApiSellerApproval = {
  id: string;
  orderRef: string;
  state: SellerApprovalState;
  canAnswer: boolean;
  dueAt: string;
  hoursLeft: number;
  decidedAt: string | null;
  reason: string | null;
  orderOutcome: ApprovalOutcome;
  sponsorName: string;
  seller: { type: "PROPERTY" | "ATHLETE"; id: string; name: string };
  lines: ApiApprovalLine[];
  totalCents: number;
  createdAt: string;
};

/** The days a line covers: one, or its first and last. */
export function lineDays(l: { startsOn: string; endsOn: string }): string[] {
  const a = l.startsOn.slice(0, 10);
  const b = l.endsOn.slice(0, 10);
  return a === b ? [a] : [a, b];
}

/** "Harbor Coffee wants to book Youth basketball clinic with Riley Carter (2 × $500.00) — Oct 10 and Oct 17." */
export function approvalAsk(a: Pick<ApiSellerApproval, "sponsorName" | "lines">): string {
  if (a.lines.length !== 1) return `${a.sponsorName} wants to book ${a.lines.length} of your listings.`;
  const l = a.lines[0]!;
  return `${a.sponsorName} wants to book ${l.title} (${l.quantity} × ${money(l.unitPriceCents)}) — ${datesText(lineDays(l))}.`;
}

/** The pill on an approval: in words and a mark, never colour alone. */
export function approvalBadge(a: Pick<ApiSellerApproval, "state" | "canAnswer" | "orderOutcome">): Pill {
  switch (a.state) {
    case "PENDING":
      return a.canAnswer ? { label: "Waiting for your approval", tone: "warn", mark: "!" } : { label: "Time to answer is up", tone: "neutral", mark: "○" };
    case "ACCEPTED":
      if (a.orderOutcome === "APPROVED") return { label: "Accepted · waiting for payment", tone: "primary", mark: "●" };
      if (a.orderOutcome === "WITH_BTG") return { label: "Accepted · BTG is checking", tone: "primary", mark: "●" };
      if (a.orderOutcome === "CANCELLED") return { label: "Accepted · order cancelled", tone: "neutral", mark: "–" };
      return { label: "Accepted · waiting for the other sellers", tone: "primary", mark: "●" };
    case "DECLINED": return { label: "Declined by you", tone: "neutral", mark: "✕" };
    case "EXPIRED": return { label: "Declined automatically", tone: "neutral", mark: "✕" };
    case "CLOSED": return { label: "Order ended", tone: "neutral", mark: "–" };
  }
}

export type Banner = { tone: Tone; title: string; text?: string; quote?: string };

/** What came of the seller's answer (SO accepted / declined / expired). Null while it is still theirs to give. */
export function approvalOutcome(a: ApiSellerApproval): Banner | null {
  const s = a.sponsorName;
  if (a.state === "PENDING") {
    return a.canAnswer ? null : { tone: "warn", title: `Not answered in ${SELLER_ANSWER_HOURS} hours`, text: `The answer was due ${stamp(a.dueAt)}. The order is being declined automatically.` };
  }
  if (a.state === "DECLINED") {
    return { tone: "primary", title: `Declined — ${s} was told and the dates are free again.`, quote: a.reason ? `Your reason: “${a.reason}”` : undefined };
  }
  if (a.state === "EXPIRED") {
    return { tone: "warn", title: `Not answered in ${SELLER_ANSWER_HOURS} hours — declined automatically.`, text: `The answer was due ${stamp(a.dueAt)}. ${s} was told and the dates are free again.` };
  }
  if (a.state === "CLOSED") {
    return { tone: "neutral", title: "This order ended before you answered.", text: `Another seller on it declined, or ${s} cancelled it. Nothing is booked.` };
  }
  /* ACCEPTED */
  switch (a.orderOutcome) {
    case "APPROVED":
      return { tone: "accent", title: `Accepted ✓ — ${s} is paying now.`, text: `They have ${PAYMENT_WINDOW_DAYS} days to pay. If they don’t, the order is cancelled and the dates are free again.` };
    case "WITH_BTG":
      return { tone: "accent", title: "Accepted ✓ — BTG checks the order next.", text: `Then ${s} is asked to pay within ${PAYMENT_WINDOW_DAYS} days. You’re emailed when it’s paid.` };
    case "CANCELLED":
      return { tone: "neutral", title: "You accepted, but the order was cancelled.", text: `${s} cancelled it, another seller declined, or it wasn’t paid in time. Nothing is booked.` };
    default:
      return { tone: "accent", title: "Accepted ✓ — waiting for the other sellers on this order.", text: "It goes ahead once they accept too." };
  }
}

/** Ordered → Paid → In delivery → Confirmed by sponsor, while the order waits on (or was ended by) the seller's answer. */
export function approvalTrack(a: ApiSellerApproval): TrackStep[] {
  const labels = ["Ordered", "Paid", "In delivery", "Confirmed by sponsor"];
  const current: { note: string; tone: TrackStep["tone"] } =
    a.state === "PENDING" ? { note: a.canAnswer ? "Waiting for you" : "Not answered", tone: a.canAnswer ? "warn" : "danger" }
    : a.state === "DECLINED" ? { note: "Declined", tone: "danger" }
    : a.state === "EXPIRED" ? { note: "Not answered", tone: "danger" }
    : a.state === "CLOSED" || a.orderOutcome === "CANCELLED" ? { note: "Cancelled", tone: "danger" }
    : a.orderOutcome === "WITH_BTG" ? { note: "BTG is checking", tone: "primary" }
    : a.orderOutcome === "WAITING" ? { note: "Other sellers", tone: "primary" }
    : { note: `${a.sponsorName} is paying`, tone: "primary" };
  return labels.map((label, i) => ({
    label,
    state: i === 0 ? "done" : i === 1 ? "current" : "todo",
    note: i === 0 ? stamp(a.createdAt) : i === 1 ? current.note : "Not yet",
    tone: current.tone,
  }));
}

/** The approvals the Orders page lists above the sales: everything not yet a sale (an accepted, approved order is). */
export function approvalsToList(list: readonly ApiSellerApproval[], max = 20): ApiSellerApproval[] {
  return list.filter((a) => !(a.state === "ACCEPTED" && a.orderOutcome === "APPROVED")).slice(0, max);
}

/* ------------------------------------------------- the problem exchange */

export type IssueKind = "PROBLEM" | "OVERDUE";
export type IssueStage = "SELLER_TO_ANSWER" | "SPONSOR_TO_ANSWER" | "ESCALATED" | "SETTLED" | "RESOLVED" | "CLOSED";
export type SellerAnswer = "DELIVER_AGAIN" | "REFUND" | "DISAGREE";
export type SponsorAnswer = "ACCEPT" | "REJECT";
export type EscalationReason = "SPONSOR_REJECTED" | "SELLER_NO_ANSWER" | "SPONSOR_NO_ANSWER" | "NOT_DELIVERED" | "REPORTED_TO_BTG";
export type IssueOutcome = "REDELIVER" | "REFUNDED" | "CONFIRMED" | "MARKED_DELIVERED" | "ORDER_ENDED";

/** One problem as every reader sees it (delivery.ts issueSummary). */
export type ApiIssue = {
  id: string;
  kind: IssueKind;
  stage: IssueStage;
  open: boolean;
  problem: { text: string | null; at: string };
  sellerDueAt: string | null;
  sellerCanAnswer: boolean;
  sellerAnswer: {
    answer: SellerAnswer;
    words: string;
    note: string | null;
    newDate: string | null;
    by: string | null;
    at: string | null;
    proof: { photo: boolean; link: string | null };
  } | null;
  sponsorDueAt: string | null;
  sponsorCanAnswer: boolean;
  sponsorAnswer: { decision: SponsorAnswer; note: string | null; at: string | null } | null;
  escalation: { at: string; reason: EscalationReason; text: string } | null;
  outcome: { outcome: IssueOutcome; at: string | null; by: "BTG" | "SELLER_AND_SPONSOR" | "SYSTEM"; note: string | null } | null;
};

export type TimelineKind =
  | "PAID" | "MARKED_DELIVERED" | "PROBLEM_REPORTED" | "SELLER_ANSWERED" | "SPONSOR_ACCEPTED" | "SPONSOR_REJECTED"
  | "ESCALATED" | "SETTLED" | "BTG_DECIDED" | "CLOSED" | "REMINDED" | "CONFIRMED";

/** One step of a line's exchange, oldest first (delivery.ts timelineOf). Never money. */
export type ApiTimelineItem = {
  at: string;
  kind: TimelineKind;
  by: "SELLER" | "SPONSOR" | "BTG" | "SYSTEM";
  name: string | null;
  text: string;
  note: string | null;
  issueId: string | null;
  answer: SellerAnswer | SponsorAnswer | null;
  newDate: string | null;
  reason: EscalationReason | null;
  outcome: IssueOutcome | null;
  proof: { photo: boolean; link: string | null; photoOf: "marked" | "answer" | "current" } | null;
};

/** The seller's answer in one line, as they chose it: "Deliver again on Oct 24: “…”". */
export function answerQuote(a: { answer: SellerAnswer; note: string | null; newDate: string | null; proof?: { photo: boolean; link: string | null } }, refundCents?: number, sponsor = "the sponsor"): string {
  const note = a.note?.trim() ? `“${a.note.trim()}”` : "";
  if (a.answer === "DELIVER_AGAIN") return `Deliver again on ${a.newDate ? dayOf(a.newDate) : "a new date"}${note ? `: ${note}` : ""}`;
  if (a.answer === "REFUND") return `Refund this line${refundCents !== undefined ? `: ${money(refundCents)} back to ${sponsor}` : ""}${note ? ` — ${note}` : ""}`;
  const extra = [a.proof?.photo ? "1 photo" : null, a.proof?.link ? "a link" : null].filter(Boolean).join(" and ");
  return `Disagree${note ? `: ${note}` : ""}${extra ? ` · ${extra}` : ""}`;
}

/** The seller's answer, as the sponsor reads it before accepting or rejecting it (SP ansRe / ansRf / ansDg). */
export function answerForSponsor(issue: Pick<ApiIssue, "sellerAnswer">, seller: string, refundCents?: number) {
  const a = issue.sellerAnswer;
  if (!a) return null;
  const note = a.note?.trim() ? `“${a.note.trim()}”` : null;
  const who = firstWord(seller);
  if (a.answer === "DELIVER_AGAIN") {
    const day = a.newDate ? dayOf(a.newDate) : "a new date";
    return {
      means: `${seller} will deliver it again on ${day} — you’ll confirm it after`,
      quote: note,
      acceptMeans: `It’s booked for ${day}. When it’s marked delivered you have ${CONFIRM_HOURS} hours to confirm it or report a problem, as usual.`,
      accepted: "Accepted ✓ — the redelivery is booked",
      photo: false,
      who,
    };
  }
  if (a.answer === "REFUND") {
    return {
      means: `Refund of this line${refundCents !== undefined ? ` — ${money(refundCents)}` : ""}`,
      quote: note ?? `${seller} offered to refund this line in full.`,
      acceptMeans: "The line is refunded in full and the rest of the order stays as it is. BTG returns the money through the payment provider.",
      accepted: "Accepted ✓ — the refund is on its way",
      photo: false,
      who,
    };
  }
  return {
    means: `${seller} disagrees — they say it was delivered`,
    quote: note,
    acceptMeans: "You agree it was delivered. The line counts as delivered and nothing is refunded.",
    accepted: "Accepted ✓ — the line counts as delivered",
    photo: a.proof.photo,
    who,
  };
}

/** How a problem the sponsor reported stands, in the sponsor's words — once it has left their hands. */
export function sponsorIssueStatus(issue: ApiIssue, seller: string, now: Date): { tone: Tone; text: string } | null {
  if (issue.kind !== "PROBLEM") return null;
  if (issue.stage === "SELLER_TO_ANSWER") {
    if (!issue.sellerDueAt || !issue.sellerCanAnswer) return { tone: "warn", text: `${seller} didn’t answer in ${ANSWER_WINDOW_HOURS} hours, so BTG decides. You’ll hear by email.` };
    return {
      tone: "warn",
      text: `${seller} has until ${stamp(issue.sellerDueAt)} (${inWords(issue.sellerDueAt, now) ?? "now"}) to answer: deliver it again, refund this line, or disagree. If they don’t, BTG decides. The seller isn’t paid for this line meanwhile.`,
    };
  }
  if (issue.stage === "SPONSOR_TO_ANSWER" && !issue.sponsorCanAnswer) {
    return { tone: "warn", text: `The ${ANSWER_WINDOW_HOURS} hours to answer have passed, so BTG decides. You’ll hear by email.` };
  }
  if (issue.stage === "ESCALATED") {
    const why = issue.escalation?.reason;
    if (why === "SPONSOR_REJECTED") return { tone: "warn", text: "Rejected — BTG is deciding. You’ll hear by email." };
    if (why === "SELLER_NO_ANSWER") return { tone: "warn", text: `${seller} didn’t answer in ${ANSWER_WINDOW_HOURS} hours — BTG is deciding. You’ll hear by email.` };
    if (why === "SPONSOR_NO_ANSWER") return { tone: "warn", text: `You didn’t accept or reject the answer in ${ANSWER_WINDOW_HOURS} hours — BTG is deciding. You’ll hear by email.` };
    return { tone: "warn", text: "BTG is deciding. You’ll hear by email." };
  }
  if (issue.stage === "SETTLED" && issue.outcome) {
    const o = issue.outcome.outcome;
    return {
      tone: "accent",
      text: o === "REDELIVER" ? "Accepted ✓ — the redelivery is booked" : o === "REFUNDED" ? "Accepted ✓ — the refund is on its way" : "Accepted ✓ — the line counts as delivered",
    };
  }
  return null;
}

/* ------------------------------------------- the sponsor's order status */

type ApprovalRow = { id: string; seller: { type: string; id: string; name: string }; lineIds: string[]; state: string; dueAt: string; decidedAt: string | null; reason: string | null };

/** The order fields 2S4-BE-09 / -10 add to GET /marketplace-orders/:id. */
export type OrderAutomation = {
  state: string;
  totalCents: number;
  decidedBy: string | null;
  decisionNotes: string | null;
  approvalReasons?: string[];
  spendingLimitCents?: number | null;
  cancelReason?: "SPONSOR" | "BTG" | "BTG_REJECTED" | "SELLER_DECLINED" | "SELLER_NO_ANSWER" | "UNPAID" | null;
  paymentDueAt?: string | null;
  deadlineAt?: string | null;
  waitingOn?: "SELLER" | "BTG" | "PAYMENT" | null;
  sellerApprovals?: ApprovalRow[];
  lines: { startsOn: string; endsOn: string }[];
};

export type StatusCard = {
  tag: string;
  tone: Tone;
  title: string;
  text?: string;
  quote?: string;
  deadline?: Deadline;
  /** Show the Pay by card button in the card. */
  pay: boolean;
  /** Show "Order again". */
  again: boolean;
};

const joinNames = (names: string[]) => (names.length <= 1 ? names[0] ?? "The seller" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The order's days in words, or "the dates" when there are too many to list. */
function orderDays(o: Pick<OrderAutomation, "lines">): string {
  const days = [...new Set(o.lines.flatMap(lineDays))].sort();
  return days.length && days.length <= 3 ? datesText(days) : "the dates";
}

const approvedHow = (o: Pick<OrderAutomation, "decidedBy" | "sellerApprovals">) =>
  o.decidedBy !== "system" ? "Approved by BTG" : o.sellerApprovals?.length ? "Accepted by the seller" : "Approved automatically";

/**
 * The status card at the top of the sponsor's order page (SP-1…7): approved
 * and due (3 days, 1 day, last day), waiting for the seller, declined by the
 * seller, held for BTG, cancelled. Null once paid — the page's own payment
 * and delivery sections take over — and while a card payment is confirming
 * or has failed (those have their own banners).
 */
export function sponsorStatus(o: OrderAutomation, payKind: string, now: Date): StatusCard | null {
  const approvals = o.sellerApprovals ?? [];
  if (o.state === "APPROVED" || o.state === "AWAITING_PAYMENT") {
    if (payKind !== "due") return null;
    const due = o.paymentDueAt ?? o.deadlineAt ?? null;
    const left = due ? hoursLeft(due, now) : null;
    if (due && left !== null && left < 24) {
      return {
        tag: "Last day to pay", tone: "danger", pay: true, again: false,
        title: `Last day to pay — this order is cancelled at ${stamp(due)}.`,
        deadline: deadline("Cancelled at", due, now, "danger"),
      };
    }
    if (due && left !== null && left < 48) {
      return {
        tag: "1 day left to pay", tone: "warn", pay: true, again: false, title: "1 day left to pay",
        text: `Pay to lock in ${orderDays(o)}. Unpaid orders are cancelled and the dates released.`,
        deadline: deadline("Pay by", due, now),
      };
    }
    return {
      tag: approvedHow(o), tone: "warn", pay: true, again: false,
      title: "Your order is confirmed — pay to lock in the dates.",
      text: `Pay within ${PAYMENT_WINDOW_DAYS} days. Unpaid orders are cancelled and the dates released.`,
      deadline: due ? deadline("Pay by", due, now) : undefined,
    };
  }
  if (o.state === "PENDING_SELLER") {
    const waiting = approvals.filter((a) => a.state === "PENDING").map((a) => a.seller.name);
    const names = joinNames(waiting);
    const by = o.deadlineAt ?? null;
    return {
      tag: "Waiting for the seller", tone: "primary", pay: false, again: false,
      title: by ? `${names} ${waiting.length > 1 ? "have" : "has"} until ${stamp(by)} to accept. You’ll be emailed.` : `${names} ${waiting.length > 1 ? "are" : "is"} asked to accept. You’ll be emailed.`,
      text: "This listing needs the seller’s approval. Nothing is charged until they accept.",
      deadline: by ? deadline("Seller answers by", by, now, "primary") : undefined,
    };
  }
  if (o.state === "PENDING_APPROVAL") {
    const limit = o.spendingLimitCents ?? null;
    return {
      tag: "Held for BTG", tone: "warn", pay: false, again: false,
      title: limit !== null && o.totalCents > limit
        ? `BTG is checking this order because it’s above your current limit of ${money(limit)}. Your limit goes up as your orders are paid and delivered.`
        : `BTG is checking this order before it’s confirmed${o.approvalReasons?.length ? `: ${o.approvalReasons.join("; ")}` : ""}.`,
      text: "We’ll email you, usually within a working day. Nothing is charged until BTG approves it.",
    };
  }
  if (o.state === "CANCELLED") {
    const declined = approvals.find((a) => a.state === "DECLINED");
    const expired = approvals.filter((a) => a.state === "EXPIRED").map((a) => a.seller.name);
    switch (o.cancelReason) {
      case "SELLER_DECLINED":
        return {
          tag: "Declined by the seller", tone: "danger", pay: false, again: true,
          title: `${declined?.seller.name ?? "The seller"} declined this order. Nothing was charged.`,
          quote: declined?.reason ? `“${declined.reason}”` : undefined,
        };
      case "SELLER_NO_ANSWER":
        return {
          tag: "Not answered by the seller", tone: "danger", pay: false, again: true,
          title: `${joinNames(expired)} didn’t answer within ${SELLER_ANSWER_HOURS} hours, so the order was cancelled. Nothing was charged.`,
        };
      case "UNPAID":
        return {
          tag: "Cancelled", tone: "neutral", pay: false, again: true,
          title: `Cancelled — not paid within ${PAYMENT_WINDOW_DAYS} days. Nothing was charged. Order again any time.`,
          text: o.paymentDueAt ? `Payment was due ${stamp(o.paymentDueAt)}. The dates were released.` : "The dates were released.",
        };
      case "BTG_REJECTED":
        return {
          tag: "Not approved", tone: "danger", pay: false, again: true,
          title: "BTG didn’t approve this order. Nothing was charged.",
          quote: o.decisionNotes ? `BTG: “${o.decisionNotes}”` : undefined,
        };
      case "SPONSOR":
        return { tag: "Cancelled", tone: "neutral", pay: false, again: true, title: "You cancelled this order. Nothing was charged." };
      case "BTG":
        return { tag: "Cancelled", tone: "neutral", pay: false, again: true, title: "BTG cancelled this order.", text: "Contact BTG if you have a question about it." };
      default:
        return { tag: "Cancelled", tone: "neutral", pay: false, again: true, title: "This order was cancelled." };
    }
  }
  return null;
}

/** The pill beside the order's title, where the automation has a better word than the bare state. Null → the state's own. */
export function sponsorBadge(o: OrderAutomation, payKind: string, now: Date): Pill | null {
  if ((o.state === "APPROVED" || o.state === "AWAITING_PAYMENT") && payKind === "due") {
    const due = o.paymentDueAt ?? o.deadlineAt ?? null;
    if (due && hoursLeft(due, now) < 24) return { label: "Last day to pay", tone: "danger", mark: "!" };
    return { label: "Confirmed · payment due", tone: "warn", mark: "!" };
  }
  if (o.state === "PENDING_SELLER") return { label: "Waiting for the seller", tone: "primary", mark: "●" };
  if (o.state === "PENDING_APPROVAL") return { label: "Held for BTG", tone: "warn", mark: "!" };
  if (o.state === "CANCELLED") {
    if (o.cancelReason === "SELLER_DECLINED") return { label: "Declined by the seller", tone: "neutral", mark: "✕" };
    if (o.cancelReason === "SELLER_NO_ANSWER") return { label: "Not answered by the seller", tone: "neutral", mark: "✕" };
    if (o.cancelReason === "BTG_REJECTED") return { label: "Not approved", tone: "neutral", mark: "✕" };
    return { label: "Cancelled", tone: "neutral", mark: "✕" };
  }
  return null;
}

/* ------------------------------------------------- the spending limit */

export type LimitKind = "COMPLETED" | "REFUNDED" | "PROBLEM_UPHELD";

/** GET /sponsors/:id/spending-limit (BTG). */
export type ApiSpendingLimit = {
  sponsorId: string;
  sponsorName: string;
  limitCents: number;
  startCents: number;
  capCents: number;
  largestCompletedCents: number;
  rising: boolean;
  frozen: { at: string; kind: LimitKind; orderId: string; orderRef: string } | null;
  history: { at: string; kind: LimitKind; orderId: string; orderRef: string; totalCents: number | null; limitBeforeCents: number; limitAfterCents: number; note: string }[];
};

/** "How it works", from the figures the API applies — never hard-coded amounts. */
export function limitRule(l: Pick<ApiSpendingLimit, "startCents" | "capCents">): string {
  return `How it works: starts at ${money(l.startCents)}. Goes up to twice the largest completed order, with a maximum of ${money(l.capCents)}. Stops rising after a refund or an upheld problem.`;
}

/** Where the limit stands: rising, at the maximum, or stopped — and why. */
export function limitStanding(l: ApiSpendingLimit): string {
  if (l.frozen) {
    const why = l.frozen.kind === "REFUNDED" ? `the refund of ${l.frozen.orderRef}` : `an upheld problem on ${l.frozen.orderRef}`;
    return `Stopped rising on ${dayOf(l.frozen.at)}, after ${why}.`;
  }
  if (l.limitCents >= l.capCents) return "At the maximum.";
  return l.largestCompletedCents > 0 ? `Largest completed order: ${money(l.largestCompletedCents)}.` : "No completed orders yet.";
}

/** The history rows, oldest first: "Sep 28 · SX-BAY6NFY3 · Completed $1,000.00 — the limit stays at $5,000.00 …". */
export function limitHistory(l: Pick<ApiSpendingLimit, "history">): { when: string; text: string }[] {
  return l.history.map((h) => ({ when: dayOf(h.at), text: `${h.orderRef} · ${h.note}` }));
}

/** BTG's Approve / Reject on an order held above the limit (BX approveHeld / rejectHeld). */
export function heldDecision(decision: "APPROVE" | "REJECT", o: { ref: string; totalCents: number }, l: { sponsorName: string; limitCents: number } | null) {
  const above = l !== null && o.totalCents > l.limitCents;
  if (decision === "APPROVE") {
    return {
      title: `Approve ${o.ref}?`,
      points: [
        above ? `The ${money(o.totalCents)} order is approved, above the ${money(l!.limitCents)} limit, this once.` : `The ${money(o.totalCents)} order is approved.`,
        `${l?.sponsorName ?? "The sponsor"} is asked to pay within ${PAYMENT_WINDOW_DAYS} days.${above ? " The limit itself doesn’t change." : ""}`,
      ],
      button: "Approve",
      needsReason: false,
    };
  }
  return {
    title: `Reject ${o.ref}?`,
    points: [
      `The ${money(o.totalCents)} order is cancelled. Nothing is charged.`,
      l ? `${possessive(l.sponsorName)} limit stays ${money(l.limitCents)}.` : "The stock goes back on sale.",
    ],
    button: "Reject the order",
    needsReason: true,
  };
}

/* ------------------------------------------------------- Mark paid (BX-7) */

export const ZOHO_PAID_NOTE = "Paid through a Zoho Books invoice? You don’t need this — the order updates by itself when Zoho marks the invoice paid.";

export function markPaidSummary(totalCents: number): string {
  return `The order moves to paid, the sellers are told, and the reference is recorded. Amount: ${money(totalCents)}.`;
}

/* --------------------------------------------------------- BTG's desk */

type DeskRow = {
  sponsor: { name: string };
  seller: { name: string };
  lastDate: string;
  redeliverOn?: string | null;
  remindedAt: string | null;
  secondRemindedAt?: string | null;
  issue?: ApiIssue | null;
  escalation?: { at: string; reason: EscalationReason; text: string } | null;
};

/** Why an escalated line needs BTG (BX needs): the pill and the line under it. */
export function deskReason(r: DeskRow): Pill & { sub: string } {
  const why = r.escalation?.reason ?? r.issue?.escalation?.reason ?? null;
  const seller = firstWord(r.seller.name);
  const answered = r.issue?.sellerAnswer;
  switch (why) {
    case "SPONSOR_REJECTED":
      return { label: "The two sides disagree", tone: "danger", mark: "✕", sub: `${r.sponsor.name} rejected ${possessive(seller)} answer` };
    case "SELLER_NO_ANSWER":
      return { label: `Seller didn’t answer in ${ANSWER_WINDOW_HOURS} hours`, tone: "warn", mark: "!", sub: "The sponsor’s problem is still open" };
    case "SPONSOR_NO_ANSWER":
      return { label: `Sponsor didn’t answer in ${ANSWER_WINDOW_HOURS} hours`, tone: "warn", mark: "!", sub: answered ? `${seller} answered: ${answered.words}` : "The seller’s answer is still open" };
    case "NOT_DELIVERED":
      return {
        label: `No delivery marked ${OVERDUE_HANDOVER_DAYS} days after ${dayOf(r.lastDate)}`,
        tone: "warn", mark: "!",
        sub: r.secondRemindedAt ? "After two reminders" : r.remindedAt ? "After a reminder" : "Not marked delivered",
      };
    default:
      return { label: "Reported before the new rule", tone: "warn", mark: "!", sub: "Sellers didn’t answer problems themselves then, so BTG decides" };
  }
}

/** The line in the decision panel that says what BTG is deciding. */
export function decisionLead(r: DeskRow): string {
  switch (r.escalation?.reason ?? r.issue?.escalation?.reason) {
    case "SPONSOR_REJECTED": return "The two sides disagree. You decide for this line.";
    case "SELLER_NO_ANSWER": return `The seller didn’t answer in ${ANSWER_WINDOW_HOURS} hours. You decide for this line.`;
    case "SPONSOR_NO_ANSWER": return `The sponsor didn’t accept or reject the seller’s answer in ${ANSWER_WINDOW_HOURS} hours. You decide for this line.`;
    case "NOT_DELIVERED": return `Nothing was marked delivered ${OVERDUE_HANDOVER_DAYS} days after ${dayOf(r.lastDate)}. You decide for this line.`;
    default: return "You decide for this line.";
  }
}

export type Settlement = { issueId: string; outcome: IssueOutcome; at: string | null; text: string; answer: SellerAnswer | null };

/** A problem the two sides settled (BX settled): "Settled — redelivery Oct 24". */
export function settledBadge(r: DeskRow & { settlement: Settlement }): Pill & { sub: string } {
  const s = r.settlement;
  const label =
    s.outcome === "REDELIVER" ? `Settled — redelivery ${r.redeliverOn ? dayOf(r.redeliverOn) : "agreed"}`
    : s.outcome === "REFUNDED" ? "Settled — line refunded"
    : "Settled — counted as delivered";
  return { label, tone: "accent", mark: "✓", sub: `${r.sponsor.name} accepted ${possessive(firstWord(r.seller.name))} answer` };
}

/** A settled problem in a sentence: "Settled between them — the seller delivers it again on Oct 24." */
export function settledWords(outcome: IssueOutcome | null | undefined, redeliverOn?: string | null): string {
  if (outcome === "REDELIVER") return `Settled between them — the seller delivers it again${redeliverOn ? ` on ${dayOf(redeliverOn)}` : ""}.`;
  if (outcome === "REFUNDED") return "Settled between them — the line is refunded in full.";
  if (outcome === "CONFIRMED") return "Settled between them — the sponsor accepted it was delivered.";
  return "Settled between them.";
}

/** An overdue line (BX overdue): its reminders so far, and the button's word. */
export function overdueState(r: DeskRow): Pill & { sub: string; button: string } {
  const sub = `Last date ${dayOf(r.redeliverOn ?? r.lastDate)}`;
  if (r.secondRemindedAt) return { label: `Second reminder sent ${dayOf(r.secondRemindedAt)}`, tone: "warn", mark: "!", sub, button: "Remind again" };
  if (r.remindedAt) return { label: `Reminder sent ${dayOf(r.remindedAt)}`, tone: "primary", mark: "●", sub, button: "Remind again" };
  return { label: "Not marked delivered", tone: "warn", mark: "!", sub, button: "Remind seller" };
}

export const DESK_EMPTY = {
  problems: { title: "Nothing needs you", hint: "Nothing needs you — sellers and sponsors settled everything." },
  settled: { title: "Nothing settled yet", hint: "Problems the two sides settle between them appear here." },
  overdue: { title: "Nothing overdue", hint: `Lines past their last date with no delivery marked appear here. After ${OVERDUE_HANDOVER_DAYS} days they move to Needs BTG.` },
} as const;

/* ------------------------------------------------------------ the timeline */

export type TimelineEvent = {
  when: string;
  who: string;
  what: string;
  quote: string | null;
  tone: Tone;
  proof: { photo: boolean; link: string | null; issueId: string | null; photoOf: "marked" | "answer" | "current" } | null;
};

/** "Oct 18, 7:40 PM" (UTC). */
export function momentOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/**
 * "What happened" (BX timeline): each step as "when · who · what", with the
 * words each side wrote and any photo. The API's own `text` is the fallback.
 */
export function timelineEvents(items: readonly ApiTimelineItem[], names: { seller: string; sponsor: string }): TimelineEvent[] {
  return items.map((t) => {
    const who = t.name ?? (t.by === "SELLER" ? names.seller : t.by === "SPONSOR" ? names.sponsor : t.by === "BTG" ? "BTG" : "SponsorX");
    let what: string;
    let tone: Tone = t.by === "SELLER" ? "primary" : t.by === "SPONSOR" ? "accent" : t.by === "BTG" ? "accent" : "warn";
    switch (t.kind) {
      case "PAID": what = "the order was paid"; break;
      case "MARKED_DELIVERED": what = "marked it delivered"; break;
      case "PROBLEM_REPORTED": what = "reported a problem"; tone = "danger"; break;
      case "SELLER_ANSWERED":
        what = t.answer === "DELIVER_AGAIN" ? `offered to deliver it again on ${t.newDate ? dayOf(t.newDate) : "a new date"}` : t.answer === "REFUND" ? "offered to refund the line" : "disagreed";
        break;
      case "SPONSOR_ACCEPTED": what = "accepted the answer"; break;
      case "SPONSOR_REJECTED": what = "rejected the answer"; tone = "danger"; break;
      case "ESCALATED": {
        const why = t.text.replace(/^Sent to BTG ?·? ?/, "").trim();
        what = why ? `sent it to BTG — ${why.charAt(0).toLowerCase()}${why.slice(1)}` : "sent it to BTG";
        break;
      }
      case "BTG_DECIDED": what = t.outcome === "REFUNDED" ? "refunded the line" : "confirmed it was delivered"; break;
      case "REMINDED": what = t.text.toLowerCase().startsWith("second") ? "sent the seller a second reminder" : "reminded the seller"; break;
      default: what = t.text;
    }
    return {
      when: momentOf(t.at),
      who,
      what,
      quote: t.note?.trim() ? `“${t.note.trim()}”` : null,
      tone,
      proof: t.proof ? { photo: t.proof.photo, link: t.proof.link, issueId: t.issueId, photoOf: t.proof.photoOf } : null,
    };
  });
}
