/* --------------------------------------------------------------------------
   POL-FE-95 — the athlete's Sales, drawn like their Inventory and Listings
   (POL-FE-83/84). Pure: what each sale says, from GET /sales and
   GET /seller-approvals. Nothing here invents a number — every count is the
   API's tab count, every amount the line's own share.

   The old page was hard to read: four KPI plates with captions, a table led
   by the order ref, and a status pill that said whose turn it was without
   saying what to do. Each sale now answers three questions, in this order:
     1. what was sold, to whom, and what you get (the share);
     2. what happens next, as a sentence, and whether it's YOUR move;
     3. where it is on the way: Paid → Delivering → Delivered → Confirmed.
   -------------------------------------------------------------------------- */

import { sellerCancelBadge } from "@/lib/cancellations-live";
import { approvalAsk, approvalBadge, datesText, dayOf, deadline, inWords, stamp, type ApiSellerApproval } from "@/lib/order-automation-live";
import { markControl, shareUsd, trackSteps, type ApiSalesTab, type ApiSellerOrder } from "@/lib/seller-orders-live";

/** Where a sale is on its way — each has its own hue and glyph on screen. */
export type SaleStage = "pay" | "deliver" | "confirm" | "done" | "problem" | "ended";

export type SaleTrackStep = { label: string; state: "done" | "current" | "todo" };

export type SaleCard = {
  id: string;
  ref: string;
  title: string;
  sponsor: string;
  /** "2 sessions". */
  units: string;
  /** "Oct 10 and Oct 17". */
  dates: string;
  ordered: string;
  /** "$604.24" — the athlete's own share, never anyone else's. */
  share: string;
  stage: SaleStage;
  /** The short status on the pill. */
  label: string;
  /** It's the athlete's move: deliver, or answer. */
  move: boolean;
  /** What happens next, as a sentence, and the line under it. */
  next: { title: string; hint: string };
  /** The card's call to action, in words (the whole card opens the sale). */
  cta: string;
  /** Paid → Delivering → Delivered → Confirmed. */
  track: SaleTrackStep[];
  /** How many of the track's three gaps are filled (0–3). */
  progress: number;
  /** A refunded or cancelled sale: the track is struck through. */
  ended: boolean;
  /** Overdue: a delivery date has passed with nothing marked. */
  late: boolean;
};

const TRACK_LABELS = ["Paid", "Delivering", "Delivered", "Confirmed"];

const plural = (n: number, unit: string) => `${n} ${n === 1 ? unit : `${unit}s`}`;

/** The sale's words, from one GET /sales row. */
export function saleCard(o: ApiSellerOrder, now: Date = new Date()): SaleCard {
  const s = o.sponsor.name;
  const issue = o.issue ?? null;
  const cancelled = o.cancellation?.cancelled ?? null;
  const cancelAsk = issue?.kind === "CANCELLATION" && issue.open ? issue : null;
  const cancelPill = sellerCancelBadge(o);
  const lastDay = dayOf(o.lastDate ?? o.line.endsOn);
  const oneDay = o.line.dates.length <= 1;

  let stage: SaleStage;
  let label: string;
  let move = false;
  let cta = "Open";
  let next: SaleCard["next"];
  let late = false;

  if (cancelled || o.state === "CANCELLED" || o.state === "REFUNDED") {
    stage = "ended";
    const by = cancelled?.by;
    label = cancelPill?.label ?? (o.state === "REFUNDED" ? "Refunded" : "Cancelled");
    next = o.state === "REFUNDED" && !cancelled
      ? { title: `Refunded to ${s}`, hint: "There’s no share to pay for this sale." }
      : {
          title: by === "SELLER" ? "You cancelled this sale" : by === "SPONSOR" ? `${s} cancelled this sale` : by === "BTG" ? "BTG cancelled this sale" : "This sale was cancelled",
          hint: "Nothing more to do here.",
        };
  } else if (cancelAsk) {
    stage = "problem";
    const mine = cancelAsk.stage === "SELLER_TO_ANSWER" && (o.canAnswerCancellation ?? cancelAsk.sellerCanAnswer);
    label = mine ? "Asked to cancel" : "BTG is deciding";
    move = Boolean(mine);
    cta = mine ? "Answer" : "Open";
    next = mine
      ? { title: `${s} asked to cancel`, hint: cancelAsk.sellerDueAt ? `Agree, or keep it. Answer by ${stamp(cancelAsk.sellerDueAt)}.` : "Agree, or keep it. Open the sale to answer." }
      : { title: "BTG is deciding the cancellation", hint: "You’ll hear by email." };
  } else {
    switch (o.state) {
      case "UNPAID":
        stage = "pay";
        label = "Not paid yet";
        next = { title: `Waiting for ${s} to pay`, hint: "Nothing to do yet. We’ll email you once it’s paid." };
        break;
      case "IN_DELIVERY": {
        stage = "deliver";
        const mark = markControl(o);
        move = mark.applies;
        cta = mark.applies ? "Mark delivered" : "Open";
        late = o.overdue || (issue?.kind === "OVERDUE" && issue.open);
        if (o.redeliverOn) {
          label = `Redeliver ${dayOf(o.redeliverOn)}`;
          next = { title: `Deliver again on ${dayOf(o.redeliverOn)}`, hint: `${s} accepted. Then mark it delivered.` };
        } else if (late) {
          label = "Overdue";
          next = { title: "Overdue: mark it delivered", hint: `The last date was ${lastDay}. Your share is paid once ${s} confirms.` };
        } else {
          label = "To deliver";
          next = { title: oneDay ? `Deliver it on ${lastDay}` : `Deliver it by ${lastDay}`, hint: `Then mark it delivered so ${s} can confirm.` };
        }
        if (!mark.applies && !late) next = { ...next, hint: mark.why };
        break;
      }
      case "DELIVERED": {
        stage = "confirm";
        label = "Waiting to confirm";
        const due = o.confirmDueAt;
        const left = due ? inWords(due, now) : null;
        next = {
          title: `Waiting for ${s} to confirm`,
          hint: left ? `If they don’t answer, it counts as confirmed ${left}.` : "If they don’t answer within 24 hours, it counts as confirmed.",
        };
        break;
      }
      case "CONFIRMED":
        stage = "done";
        label = "Confirmed";
        next = { title: "Done. Confirmed ✓", hint: "Your share goes to Payouts once the payout hold ends." };
        break;
      case "PROBLEM": {
        stage = "problem";
        const st = issue?.stage;
        const mine = st === "SELLER_TO_ANSWER" && (o.canAnswerProblem ?? issue?.sellerCanAnswer ?? false);
        if (mine) {
          label = "Problem: answer it";
          move = true;
          cta = "Answer";
          next = { title: `${s} reported a problem`, hint: issue?.sellerDueAt ? `Answer by ${stamp(issue.sellerDueAt)}, or BTG decides.` : "Open the sale to answer." };
        } else if (st === "SPONSOR_TO_ANSWER") {
          label = `Waiting for ${s}`;
          next = { title: `Waiting for ${s} to answer you`, hint: "If they reject your answer, BTG decides." };
        } else {
          label = "BTG is deciding";
          next = { title: "BTG is deciding", hint: "Your share for this sale is on hold. You’ll hear by email." };
        }
        break;
      }
      default:
        stage = "ended";
        label = "Cancelled";
        next = { title: "This sale was cancelled", hint: "Nothing more to do here." };
    }
    /* A kept booking after a request to cancel says so on the pill. */
    if (cancelPill && stage === "deliver" && !late && !o.redeliverOn) label = cancelPill.label;
  }

  const steps = trackSteps(o);
  const ended = stage === "ended";
  const track: SaleTrackStep[] = steps.map((t, i) => ({ label: TRACK_LABELS[i]!, state: ended && t.state === "current" ? "todo" : t.state }));
  /* The gaps filled run up to the step it's on: unpaid 0, delivering 1, delivered 2, a problem or confirmed 3. */
  const reached = steps.findIndex((t) => t.state !== "done");
  const progress = Math.min(3, reached === -1 ? 3 : reached);

  return {
    id: o.id,
    ref: o.ref,
    title: o.line.title,
    sponsor: s,
    units: plural(o.line.quantity, o.line.unit),
    dates: datesText(o.line.dates),
    ordered: dayOf(o.placedAt),
    share: shareUsd(o.shareCents),
    stage,
    label,
    move,
    next,
    cta,
    track,
    progress,
    ended,
    late,
  };
}

/* ── the tabs ──────────────────────────────────────────────────────────── */

/** The API's tab keys (backend domain/delivery.ts SALE_TABS), in the order a sale moves. */
const TAB_ORDER = ["all", "to_deliver", "problems", "awaiting_payment", "delivered", "confirmed", "cancelled"];
/** Plainer words than the API's for two of them. */
const TAB_LABEL: Record<string, string> = { awaiting_payment: "Not paid yet", delivered: "Waiting to confirm", confirmed: "Done" };

export type SalesTabDef = { key: string; label: string; count: number };

/**
 * All and To deliver always; every other tab only when it has a sale (or is
 * the one open), in the order a sale moves. Counts are the API's.
 */
export function salesShopTabs(tabs: readonly ApiSalesTab[], current: string): SalesTabDef[] {
  const rank = (k: string) => (TAB_ORDER.indexOf(k) === -1 ? TAB_ORDER.length : TAB_ORDER.indexOf(k));
  return [...tabs]
    .filter((t) => t.key === "all" || t.key === "to_deliver" || t.count > 0 || t.key === current)
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((t) => ({ key: t.key, label: TAB_LABEL[t.key] ?? t.label, count: t.count }));
}

/** The URL change a tab makes: `?tab=` (none for All); the page resets to 1. */
export function salesTabPatch(key: string): Record<string, string | null> {
  return { tab: key === "all" ? null : key };
}

/* ── the way a sale moves: the band at the top ─────────────────────────── */

export type SalesStation = { key: string; label: string; hint: string; count: number; stage: SaleStage };

const STATIONS: Array<Omit<SalesStation, "count">> = [
  { key: "awaiting_payment", label: "Not paid yet", hint: "sold; the sponsor pays next", stage: "pay" },
  { key: "to_deliver", label: "To deliver", hint: "paid; yours to deliver", stage: "deliver" },
  { key: "delivered", label: "Waiting to confirm", hint: "the sponsor has 24 hours", stage: "confirm" },
  { key: "confirmed", label: "Done", hint: "confirmed; your share heads to Payouts", stage: "done" },
];

/** The four stations a sale passes, each with the API's count for its tab. */
export function salesStations(tabs: readonly ApiSalesTab[]): SalesStation[] {
  const n = (k: string) => tabs.find((t) => t.key === k)?.count ?? 0;
  return STATIONS.map((s) => ({ ...s, count: n(s.key) }));
}

/** Off the main road: problems and cancellations, when there are any. */
export function salesSidings(tabs: readonly ApiSalesTab[]): SalesStation[] {
  const out: SalesStation[] = [];
  const p = tabs.find((t) => t.key === "problems")?.count ?? 0;
  const c = tabs.find((t) => t.key === "cancelled")?.count ?? 0;
  if (p > 0) out.push({ key: "problems", label: "Problems", hint: "a sponsor reported something", count: p, stage: "problem" });
  if (c > 0) out.push({ key: "cancelled", label: "Cancelled", hint: "cancelled or refunded", count: c, stage: "ended" });
  return out;
}

/* ── the approvals: a sponsor wants to book, and the athlete says yes or no ─ */

export type ApprovalCard = { id: string; ref: string; sponsor: string; ask: string; waiting: boolean; label: string; due: string | null; urgent: boolean; total: string };

export function approvalCard(a: ApiSellerApproval, now: Date = new Date()): ApprovalCard {
  const d = a.canAnswer ? deadline("Answer by", a.dueAt, now) : null;
  return {
    id: a.id,
    ref: a.orderRef,
    sponsor: a.sponsorName,
    ask: approvalAsk(a),
    waiting: a.canAnswer,
    label: approvalBadge(a).label,
    due: d?.label ?? null,
    urgent: d?.tone === "danger",
    total: shareUsd(a.totalCents),
  };
}
