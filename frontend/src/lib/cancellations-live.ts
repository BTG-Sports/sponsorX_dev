/* --------------------------------------------------------------------------
   2S4-FE-06 — cancelling a paid line, on screen (Claude Design
   OrderCancellations.dc.html, CX-1 … CX-10). The pure pieces: what the
   sponsor's terms mean right now, the words for each cancelled or asked-for
   line on the sponsor's and the seller's order pages, and the seller's
   90-day warning.

   The rules they put into words (2S4-BE-12, programme owner 2026-10-02):
     · the sponsor cancels a paid line for free until 3 days before its first
       date — refunded at once;
     · after that, until the first date starts, the sponsor ASKS the seller
       (a reason required), who has 72 hours (or until the first date, if
       sooner) to agree or say no; a no, or no answer, goes to BTG, which
       cancels and refunds it or keeps it;
     · the seller can cancel a line it can't deliver at any time while it is
       in delivery; two in 90 days and BTG checks the seller's new listings.

   Wire shapes are the backend's: domain/delivery.ts (cancellationTerms,
   saleView.cancellation, orderDeliveries) and domain/refunds.ts
   (refundsForOrders — never a method or a reference).
   -------------------------------------------------------------------------- */

import {
  dayOf, deadline, inWords, money, possessive, stamp,
  type ApiIssue, type Deadline, type IssueStage, type Pill, type Tone,
} from "@/lib/order-automation-live";
import { refundWords, type SponsorRefund } from "@/lib/refunds-live";

/** Free until this many days before the first date (delivery.ts FREE_CANCEL_DAYS). */
export const FREE_CANCEL_DAYS = 3;
/** After that, the seller has this long to answer, or until the first date if sooner (CANCEL_ANSWER_HOURS). */
export const CANCEL_ANSWER_HOURS = 72;

const HOUR = 3_600_000;

export type CancelledBy = "SPONSOR" | "SELLER" | "AGREED" | "BTG";
/** A paid line that was cancelled: when, by whom, and the reason or BTG's note. */
export type LineCancelled = { at: string; by: CancelledBy; note: string | null };

/** GET /deliveries/:id/cancellation — and each line's `cancellation` on GET /marketplace-orders/:id/deliveries. */
export type ApiCancellationTerms = {
  lineId?: string;
  orderId?: string;
  title?: string;
  freeCancelDays?: number;
  answerWindowHours?: number;
  canCancel: boolean;
  free: boolean;
  freeUntil: string;
  /** The line's first date, YYYY-MM-DD. */
  firstDate: string;
  refundCents: number;
  needsSellerAgreement: boolean;
  sellerAnswerBy: string | null;
  blockedReason: string | null;
  request: { issueId: string; stage: IssueStage; sellerDueAt: string | null } | null;
};

/** The seller's side, on GET /sales and /sales/:id. */
export type SellerCancellation = {
  canCancel: boolean;
  cancellationsLast90Days: number;
  /** What the sponsor gets back if it is cancelled now: the line's total, or (the order's last live line) the rest of the order, the buyer fee too. */
  refundCents?: number;
  limit: number;
  windowDays: number;
  warning: string;
  cancelled: LineCancelled | null;
};

const firstDateStart = (firstDate: string) => new Date(`${firstDate}T00:00:00.000Z`);
const quoted = (text: string | null | undefined) => (text?.trim() ? `“${text.trim()}”` : null);

/* ----------------------------------------------------------- the sponsor */

export type CancelMode = "free" | "ask";

/** What the sponsor's dialog tells the API it showed (POST /deliveries/:id/cancel `expect`). */
export const cancelExpect = (mode: CancelMode): "FREE" | "ASK" => (mode === "free" ? "FREE" : "ASK");

/**
 * The API refused because the terms changed under the open dialog
 * (`cancel_terms_changed`): a free cancel the cut-off overtook now has to ask
 * the seller — the dialog switches to asking, with the API's words. Pure.
 */
export function afterTermsChanged(mode: CancelMode, message: string): { mode: CancelMode | null; message: string } {
  return { mode: mode === "free" ? "ask" : null, message };
}

/**
 * What pressing "Cancel" means right now: free (refunded at once), ask the
 * seller, or nothing (null). The page's clock may have passed the free
 * cut-off since the terms were read, so the cut-off is checked again here —
 * the dialog must never promise a free cancellation the API would turn into
 * a request.
 */
export function cancelMode(t: ApiCancellationTerms | null | undefined, now: Date): CancelMode | null {
  if (!t?.canCancel) return null;
  if (now >= firstDateStart(t.firstDate)) return null;
  return t.free && now < new Date(t.freeUntil) ? "free" : "ask";
}

/** When the seller would have to answer by if the sponsor asked now: 72 hours, or the first date's start if sooner. */
export function answerByIfAsked(t: Pick<ApiCancellationTerms, "firstDate">, now: Date): string {
  return new Date(Math.min(now.getTime() + CANCEL_ANSWER_HOURS * HOUR, firstDateStart(t.firstDate).getTime())).toISOString();
}

/** The chip under a line the sponsor can still cancel: until when it's free, or that the seller has to agree. */
export function termsChip(t: ApiCancellationTerms, seller: string, now: Date): Deadline | null {
  const mode = cancelMode(t, now);
  if (mode === "free") return deadline("Free cancellation until", t.freeUntil, now, "primary");
  if (mode === "ask") return { label: `Less than ${FREE_CANCEL_DAYS} days to go · ${seller} has to agree`, tone: "warn", passed: false };
  return null;
}

export type SponsorCancelDialog = {
  title: string;
  lead: string;
  points: string[];
  chip: Deadline | null;
  reasonRequired: boolean;
  hint: string;
  button: string;
  cancelLabel: string;
  danger: boolean;
};

/** The confirm dialog's words (CX-2 free, CX-3 ask): exactly what will happen. */
export function sponsorCancelDialog(
  mode: CancelMode,
  x: { title: string; seller: string; refundCents: number; terms: Pick<ApiCancellationTerms, "freeUntil" | "firstDate"> },
  now: Date,
): SponsorCancelDialog {
  const back = `${money(x.refundCents)} comes back to you, the way you paid.`;
  if (mode === "free") {
    return {
      title: `Cancel ${x.title}?`,
      lead: `${back} Free until ${stamp(x.terms.freeUntil)} — ${inWords(x.terms.freeUntil, now) ?? "now"}.`,
      points: [`The whole line is cancelled, every date on it. ${x.seller} is told by email.`],
      chip: null,
      reasonRequired: false,
      hint: `${x.seller} sees this.`,
      button: "Cancel the line",
      cancelLabel: "Keep it",
      danger: true,
    };
  }
  const by = answerByIfAsked(x.terms, now);
  return {
    title: `Ask ${x.seller} to cancel ${x.title}?`,
    lead: `It’s less than ${FREE_CANCEL_DAYS} days to its first date (${dayOf(x.terms.firstDate)}), so ${x.seller} has to agree. ${x.seller} has until ${stamp(by)} to answer. If ${x.seller} says no or doesn’t answer, BTG decides.`,
    points: [`If it’s cancelled, ${back}`],
    chip: deadline(`${x.seller} answers by`, by, now),
    reasonRequired: true,
    hint: `${x.seller} reads this, and BTG too if it comes to them.`,
    button: `Ask ${x.seller}`,
    cancelLabel: "Cancel",
    danger: false,
  };
}

/** What the sponsor's order page says about one line's cancellation. Every field optional — null leaves the line's usual words. */
export type SponsorCancelView = {
  badge: Pill | null;
  note: string | null;
  chip: Deadline | null;
  quote: string | null;
  refund: (Pill & { amount: string | null }) | null;
  action: { mode: CancelMode; label: string } | null;
  /** Why it can't be cancelled now — shown small, only while it is in delivery. */
  hint: string | null;
  /** The line is the cancellation's to describe (its usual "refunded" words are replaced). */
  owns: boolean;
};

type SponsorLine = {
  state: string;
  seller: string;
  issue?: ApiIssue | null;
  cancellation?: ApiCancellationTerms | null;
  cancelled?: LineCancelled | null;
  refund?: SponsorRefund | null;
};

const NONE: SponsorCancelView = { badge: null, note: null, chip: null, quote: null, refund: null, action: null, hint: null, owns: false };

/** The refund line under a cancelled line: on its way, or sent on a date. Never how. */
function refundPill(r: SponsorRefund | null | undefined): SponsorCancelView["refund"] {
  if (!r) return null;
  return { ...refundWords(r), amount: money(r.amountCents) };
}

/** CX-1 … CX-5b on the sponsor's order page, from the line's terms, its request, and how it ended. Pure. */
export function sponsorCancelView(l: SponsorLine, now: Date): SponsorCancelView {
  const s = l.seller;
  const i = l.issue ?? null;
  const c = l.cancelled ?? null;
  if (c) {
    const refund = refundPill(l.refund);
    switch (c.by) {
      case "SPONSOR":
        return { ...NONE, owns: true, refund, badge: { label: "Cancelled by you", tone: "neutral", mark: "✕" }, note: `Cancelled ✓ — ${s} was told.` };
      case "AGREED":
        return { ...NONE, owns: true, refund, badge: { label: "Cancelled", tone: "neutral", mark: "✕" }, note: `${s} agreed to cancel it.` };
      case "SELLER":
        return {
          ...NONE, owns: true, refund,
          badge: { label: `Cancelled by ${s}`, tone: "neutral", mark: "✕" },
          note: `${s} couldn’t deliver it and cancelled it.`,
          quote: c.note?.trim() ? `${s}: ${quoted(c.note)}` : null,
        };
      case "BTG":
        /* BTG's note is the line's resolution, which the page already quotes. */
        return { ...NONE, owns: true, refund, badge: { label: "Cancelled by BTG", tone: "neutral", mark: "✕" }, note: "BTG cancelled and refunded this line." };
    }
  }
  if (i?.kind === "CANCELLATION" && i.open) {
    const yours = quoted(i.problem.text);
    if (i.stage === "SELLER_TO_ANSWER" && i.sellerCanAnswer && i.sellerDueAt) {
      return {
        ...NONE, owns: true,
        badge: { label: `Waiting for ${s}`, tone: "warn", mark: "!" },
        note: `Asked ✓ — waiting for ${s} until ${stamp(i.sellerDueAt)}.`,
        chip: deadline(`${s} answers by`, i.sellerDueAt, now),
        quote: yours ? `Your reason: ${yours}` : null,
      };
    }
    const declined = i.escalation?.reason === "SELLER_DECLINED_CANCELLATION";
    const theirs = quoted(i.sellerAnswer?.note);
    return {
      ...NONE, owns: true,
      badge: { label: "BTG is deciding", tone: "warn", mark: "!" },
      note: declined ? `${s} said no. BTG is deciding. You’ll hear by email.` : `${s} didn’t answer in time. BTG is deciding. You’ll hear by email.`,
      quote: declined && theirs ? `${s}: ${theirs}` : yours ? `Your reason: ${yours}` : null,
    };
  }
  if (i?.kind === "CANCELLATION" && i.outcome?.outcome === "KEPT" && l.state === "IN_DELIVERY") {
    return {
      ...NONE,
      note: "BTG kept this line — it goes ahead as booked.",
      quote: i.outcome.note?.trim() ? `BTG: ${quoted(i.outcome.note)}` : null,
    };
  }
  /* A line refunded another way (a problem settled, BTG's decision) still shows where its refund stands. */
  if (l.state === "REFUNDED") return { ...NONE, refund: refundPill(l.refund) };
  const t = l.cancellation ?? null;
  if (!t) return NONE;
  const mode = cancelMode(t, now);
  if (mode) {
    return {
      ...NONE,
      chip: termsChip(t, s, now),
      action: { mode, label: mode === "free" ? "Cancel this line" : `Ask ${s} to cancel` },
    };
  }
  /* Only while it waits to be delivered — a delivered line's own words ("Report a problem") say the rest. */
  return { ...NONE, hint: l.state === "IN_DELIVERY" && t.blockedReason ? t.blockedReason : null };
}

/** CX-5's banner at the top of the sponsor's order page: a seller cancelled a line, and the refund is still on its way. Null otherwise. */
export function sellerCancelledBanner(l: SponsorLine & { title: string }): { tag: string; title: string; quote: string | null } | null {
  if (l.cancelled?.by !== "SELLER" || l.refund?.state === "SENT") return null;
  const r = l.refund ? ` ${money(l.refund.amountCents)} refund on its way.` : "";
  return {
    tag: `${l.seller} cancelled a line`,
    title: `${l.seller} cancelled ${l.title}.${r}`,
    quote: l.cancelled.note?.trim() ? `${l.seller}: ${quoted(l.cancelled.note)}` : null,
  };
}

/* ------------------------------------------------------------ the seller */

/**
 * The warning in the seller's "Can't deliver" dialog (CX-8): how many sold
 * lines they cancelled in the last 90 days, and what this one would do.
 * `near` — this cancellation reaches (or is past) the limit. Pure.
 */
export function cancelWarning(c: Pick<SellerCancellation, "cancellationsLast90Days" | "limit" | "windowDays">): { text: string; near: boolean } {
  const n = Math.max(0, c.cancellationsLast90Days);
  const lines = (k: number) => `${k} sold ${k === 1 ? "line" : "lines"}`;
  if (n >= c.limit) {
    return { near: true, text: `You’ve cancelled ${lines(n)} in the last ${c.windowDays} days, so BTG already checks your new listings before they go live.` };
  }
  if (n + 1 >= c.limit) {
    return { near: true, text: `You’ve cancelled ${lines(n)} in the last ${c.windowDays} days. Cancelling this one means BTG checks your new listings before they go live.` };
  }
  return { near: false, text: `Cancelling ${lines(c.limit)} in ${c.windowDays} days means BTG checks your new listings before they go live.` };
}

/** BTG checks the seller's new listings: they reached the limit (CX-8b's "Your listings" note). Never why. */
export function listingsChecked(c: Pick<SellerCancellation, "cancellationsLast90Days" | "limit"> | null | undefined): boolean {
  return Boolean(c && c.cancellationsLast90Days >= c.limit);
}

export const LISTINGS_CHECKED_NOTE = "BTG is checking your account. New listings go live once BTG has looked.";

type SellerLine = {
  state: string;
  sponsor: { name: string };
  issue?: ApiIssue | null;
  canAnswerCancellation?: boolean;
  cancellation?: SellerCancellation | null;
};

/** The pill on the seller's list and order page, when a cancellation has a better word than the line's state. Null → the usual one. */
export function sellerCancelBadge(o: SellerLine): Pill | null {
  const s = o.sponsor.name;
  const c = o.cancellation?.cancelled;
  if (c) {
    if (c.by === "SELLER") return { label: "Cancelled by you", tone: "neutral", mark: "✕" };
    if (c.by === "SPONSOR") return { label: `Cancelled by ${s}`, tone: "neutral", mark: "✕" };
    if (c.by === "BTG") return { label: "Cancelled by BTG", tone: "neutral", mark: "✕" };
    return { label: "Cancelled", tone: "neutral", mark: "✕" };
  }
  const i = o.issue;
  if (i?.kind === "CANCELLATION" && i.open) {
    return i.stage === "SELLER_TO_ANSWER" && (o.canAnswerCancellation ?? i.sellerCanAnswer)
      ? { label: "Cancellation asked", tone: "warn", mark: "!" }
      : { label: "BTG is deciding", tone: "warn", mark: "!" };
  }
  if (i?.kind === "CANCELLATION" && i.outcome?.outcome === "KEPT" && o.state === "IN_DELIVERY") {
    return { label: "Booked · deliver as planned", tone: "accent", mark: "✓" };
  }
  return null;
}

export type SellerCancelBanner = {
  tone: Tone;
  tag: string;
  title: string;
  text?: string;
  quote?: string;
  deadline?: Deadline;
  after?: string;
  /** Show Agree to cancel / Keep the session. */
  ask: boolean;
};

/** CX-6 … CX-8d on the seller's order page. Null when no cancellation touches the line. Pure. */
export function sellerCancelBanner(o: SellerLine & { line: { title: string } }, lineTotalCents: number, now: Date): SellerCancelBanner | null {
  const s = o.sponsor.name;
  const zero = "Your share for this line is $0.00.";
  const c = o.cancellation?.cancelled;
  if (c) {
    const note = quoted(c.note);
    switch (c.by) {
      case "SELLER":
        return { ask: false, tone: "primary", tag: "Line cancelled", title: `Cancelled — ${s} was told and refunded.`, text: zero, quote: note ? `Your reason: ${note}` : undefined };
      case "AGREED":
        return { ask: false, tone: "accent", tag: "You agreed", title: "Agreed ✓ — the line is cancelled.", text: `${s} was refunded. ${zero}` };
      case "SPONSOR":
        return {
          ask: false, tone: "primary", tag: "Line cancelled",
          title: `${s} cancelled this line more than ${FREE_CANCEL_DAYS} days before its first date — they were refunded.`,
          text: `There’s nothing to deliver. ${zero}`, quote: note ? `${s}: ${note}` : undefined,
        };
      case "BTG":
        return { ask: false, tone: "primary", tag: "BTG decided", title: `BTG cancelled the line and refunded ${s}.`, text: zero, quote: note ? `BTG: ${note}` : undefined };
    }
  }
  const i = o.issue;
  if (i?.kind === "CANCELLATION" && i.open) {
    const theirs = quoted(i.problem.text);
    if (i.stage === "SELLER_TO_ANSWER" && (o.canAnswerCancellation ?? i.sellerCanAnswer) && i.sellerDueAt) {
      return {
        ask: true, tone: "warn", tag: `${s} asks to cancel`,
        title: `${s} asks to cancel ${o.line.title}${theirs ? `: ${theirs}` : "."}`,
        deadline: deadline("Answer by", i.sellerDueAt, now),
        after: "If you don’t answer, BTG decides.",
      };
    }
    if (i.escalation?.reason === "SELLER_DECLINED_CANCELLATION" || i.sellerAnswer?.answer === "DECLINE") {
      const yours = quoted(i.sellerAnswer?.note);
      return {
        ask: false, tone: "warn", tag: "Sent to BTG", title: "Sent to BTG — you’ll hear by email.",
        text: "You said no, so BTG decides: cancel and refund the line, or keep it as booked.",
        quote: yours ? `Your reason: ${yours}` : undefined,
      };
    }
    return {
      ask: false, tone: "warn", tag: "Sent to BTG", title: "You didn’t answer in time — BTG is deciding. You’ll hear by email.",
      text: "BTG decides: cancel and refund the line, or keep it as booked.",
      quote: theirs ? `${s}: ${theirs}` : undefined,
    };
  }
  if (i?.kind === "CANCELLATION" && i.outcome?.outcome === "KEPT" && o.state === "IN_DELIVERY") {
    const btg = quoted(i.outcome.note);
    return { ask: false, tone: "accent", tag: "BTG decided", title: "BTG kept the line — deliver as planned.", quote: btg ? `BTG: ${btg}` : undefined };
  }
  return null;
}

/** Why "Mark delivered" is off while a request to cancel is open (null otherwise). */
export function cancelMarkWhy(o: SellerLine): string | null {
  const i = o.issue;
  if (!(i?.kind === "CANCELLATION" && i.open)) return null;
  return i.stage === "SELLER_TO_ANSWER" && (o.canAnswerCancellation ?? i.sellerCanAnswer)
    ? `Answer ${possessive(o.sponsor.name)} request to cancel first`
    : "BTG is deciding whether this line goes ahead";
}

/** The seller's confirm dialogs (CX-6b agree, CX-7 keep, CX-8 can't deliver): exactly what will happen. */
/** The amount the seller's dialogs state: the API's `cancellation.refundCents`, else (an older API) the line's own total. */
export function sellerRefundCents(o: { cancellation?: Pick<SellerCancellation, "refundCents"> | null; line: { quantity: number; unitPriceCents: number } }): number {
  const r = o.cancellation?.refundCents;
  return typeof r === "number" && r >= 0 ? r : o.line.quantity * o.line.unitPriceCents;
}

export function sellerCancelDialog(kind: "agree" | "keep" | "cant", x: { title: string; sponsor: string; refundCents: number }) {
  const back = `${x.sponsor} gets ${money(x.refundCents)} back and your share for this line goes to $0.00.`;
  if (kind === "agree") {
    return {
      title: `Agree to cancel ${x.title}?`,
      lead: null,
      points: [back, "Any other lines on the order aren’t affected."],
      reasonRequired: false,
      hint: null,
      button: "Agree to cancel",
      cancelLabel: "Cancel",
      danger: false,
    };
  }
  if (kind === "keep") {
    return {
      title: `Keep ${x.title}?`,
      lead: `${x.sponsor} reads your reason. Because you both disagree, BTG decides — cancel and refund it, or keep it as booked — and emails you both.`,
      points: [],
      reasonRequired: true,
      hint: `${x.sponsor} reads this, and BTG.`,
      button: "Keep the line",
      cancelLabel: "Cancel",
      danger: false,
    };
  }
  return {
    title: `Cancel ${x.title}?`,
    lead: `${back} ${x.sponsor} is refunded at once and emailed your reason.`,
    points: [],
    reasonRequired: true,
    hint: `${x.sponsor} reads this.`,
    button: "Cancel the line",
    cancelLabel: "Keep it",
    danger: true,
  };
}
