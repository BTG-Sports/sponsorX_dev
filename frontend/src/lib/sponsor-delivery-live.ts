/* --------------------------------------------------------------------------
   2S4-FE-04 (sponsor half) — confirming a delivery, on the sponsor's order
   page (/sponsor/orders/[id]). No Claude Design artboard exists for it; the
   words follow the seller's Orders page and the agreed rule (programme
   owner, 2026-10-01): when a seller marks a line delivered, the sponsor has
   24 hours to confirm it or report a problem, and silence counts as
   confirmed.

     GET  /marketplace-orders/:id/deliveries   each line's delivery (no shares)
     POST /deliveries/:lineId/confirm          the sponsor confirms
     POST /deliveries/:lineId/problem          { note } — within the 24 hours
     GET  /deliveries/:lineId/proof            the seller's photo, 5-minute link

   2S4-FE-05 / 2S4-BE-11 — a reported problem now goes to the seller first
   (72 hours to deliver again, refund the line, or disagree), then back to
   the sponsor (72 hours to accept or reject); BTG decides only if they
   can't settle it:

     POST /deliveries/:lineId/problem-answer   { decision: ACCEPT } | { decision: REJECT, note }
     GET  /deliveries/:lineId/proof?issue=&photo=answer   the seller's answer photo

   Pure: shapes and words.
   -------------------------------------------------------------------------- */

import type { ApiCancellationTerms, LineCancelled } from "@/lib/cancellations-live";
import type { ApiIssue, ApiTimelineItem } from "@/lib/order-automation-live";
import type { SponsorRefund } from "@/lib/refunds-live";

export type DeliveryLineState = "UNPAID" | "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED";

export type ApiDeliveryLine = {
  lineId: string;
  title: string;
  state: DeliveryLineState;
  seller: string;
  markedAt: string | null;
  markedBy: string | null;
  note: string | null;
  proof: { photo: boolean; link: string | null };
  confirmDueAt: string | null;
  confirmedAt: string | null;
  confirmedBy: "SPONSOR" | "NO_ANSWER" | "BTG" | null;
  problem: { reportedAt: string; text: string } | null;
  resolution: { decision: "CONFIRMED" | "REFUNDED"; note: string | null; at: string | null } | null;
  canAnswer: boolean;
  /* 2S4-BE-11 — the date it is due by now, the problem exchange, and whether the sponsor's answer is due. */
  lastDate?: string;
  redeliverOn?: string | null;
  issue?: ApiIssue | null;
  canAnswerSellerReply?: boolean;
  timeline?: ApiTimelineItem[];
  /* 2S4-BE-12 / -13 — cancelling it (the sponsor's terms; null for a seller),
     how it was cancelled, and its refund: on its way or sent (never how). */
  cancellation?: ApiCancellationTerms | null;
  cancelled?: LineCancelled | null;
  refund?: SponsorRefund | null;
};

export type ApiOrderDeliveries = {
  orderId: string;
  confirmWindowHours: number;
  answerWindowHours?: number;
  freeCancelDays?: number;
  refunds?: SponsorRefund[];
  lines: ApiDeliveryLine[];
};

export const CONFIRM_HOURS = 24;

/** "23 h 12 min left", "40 min left", or null once the window has closed. */
export function timeLeft(dueIso: string, now: Date): string | null {
  const ms = new Date(dueIso).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min left` : `${m} min left`;
}

/** "Oct 18, 7:40 pm UTC". */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).toLowerCase();
  return `${day}, ${time} UTC`;
}

export type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** The delivery pill for one line — in words and a mark, never colour alone. */
export function deliveryBadge(l: Pick<ApiDeliveryLine, "state" | "confirmedBy"> & Partial<Pick<ApiDeliveryLine, "issue" | "redeliverOn">>): { label: string; tone: Tone; mark: string } {
  switch (l.state) {
    case "UNPAID": return { label: "Delivery starts once paid", tone: "neutral", mark: "○" };
    case "IN_DELIVERY": return l.redeliverOn ? { label: "Redelivery booked", tone: "accent", mark: "✓" } : { label: "In delivery", tone: "primary", mark: "●" };
    case "DELIVERED": return { label: "Waiting for your answer", tone: "warn", mark: "!" };
    case "CONFIRMED":
      return { label: l.confirmedBy === "NO_ANSWER" ? "Counted as confirmed" : l.confirmedBy === "BTG" ? "Confirmed by BTG" : "Confirmed", tone: "accent", mark: "✓" };
    case "PROBLEM":
      if (l.issue?.stage === "SPONSOR_TO_ANSWER") return { label: "Problem reported · answer needed", tone: "warn", mark: "!" };
      if (l.issue?.stage === "SELLER_TO_ANSWER") return { label: "Problem reported · waiting for the seller", tone: "danger", mark: "✕" };
      return { label: "BTG is deciding", tone: "warn", mark: "!" };
    case "REFUNDED": return { label: "Refunded", tone: "neutral", mark: "↺" };
    case "CANCELLED": return { label: "Cancelled", tone: "neutral", mark: "–" };
  }
}

/** The sentence under a line, once something has happened to it. */
export function deliveryNote(l: ApiDeliveryLine): string | null {
  /* 2S4-FE-06 — a cancelled line's words are the cancellation's (cancellations-live sponsorCancelView). */
  if (l.cancelled) return null;
  if (l.state === "DELIVERED" && l.confirmDueAt) {
    return `Confirm it, or report a problem, by ${stamp(l.confirmDueAt)}. If you don’t answer by then, it counts as confirmed.`;
  }
  if (l.state === "CONFIRMED" && l.confirmedBy === "NO_ANSWER") return `No answer came within ${CONFIRM_HOURS} hours, so it counted as confirmed.`;
  /* 2S4-FE-05 — a problem's own words come from the exchange (order-automation-live sponsorIssueStatus). */
  if (l.state === "PROBLEM" && !l.issue) return "BTG is deciding and will email you. The seller isn't paid for this line until then.";
  if (l.state === "IN_DELIVERY" && l.redeliverOn) return `The seller delivers it again on ${dayWord(l.redeliverOn)}. When it's marked delivered you have ${CONFIRM_HOURS} hours to confirm it or report a problem.`;
  if (l.state === "REFUNDED") return l.issue?.stage === "SETTLED" ? "Refunded in full — you accepted the seller’s refund." : "BTG cancelled and refunded this line.";
  return null;
}

const dayWord = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The sponsor's words for a refused answer, from the API's error body. */
export function answerRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a Sponsor Admin in your organisation can answer for this order.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
