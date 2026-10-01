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

   Pure: shapes and words.
   -------------------------------------------------------------------------- */

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
};

export type ApiOrderDeliveries = { orderId: string; confirmWindowHours: number; lines: ApiDeliveryLine[] };

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
export function deliveryBadge(l: Pick<ApiDeliveryLine, "state" | "confirmedBy">): { label: string; tone: Tone; mark: string } {
  switch (l.state) {
    case "UNPAID": return { label: "Delivery starts once paid", tone: "neutral", mark: "○" };
    case "IN_DELIVERY": return { label: "In delivery", tone: "primary", mark: "●" };
    case "DELIVERED": return { label: "Waiting for your answer", tone: "warn", mark: "!" };
    case "CONFIRMED":
      return { label: l.confirmedBy === "NO_ANSWER" ? "Counted as confirmed" : l.confirmedBy === "BTG" ? "Confirmed by BTG" : "Confirmed", tone: "accent", mark: "✓" };
    case "PROBLEM": return { label: "Problem reported — with BTG", tone: "danger", mark: "✕" };
    case "REFUNDED": return { label: "Refunded", tone: "neutral", mark: "↺" };
    case "CANCELLED": return { label: "Cancelled", tone: "neutral", mark: "–" };
  }
}

/** The sentence under a line, once something has happened to it. */
export function deliveryNote(l: ApiDeliveryLine): string | null {
  if (l.state === "DELIVERED" && l.confirmDueAt) {
    return `Confirm it, or report a problem, by ${stamp(l.confirmDueAt)}. If you don’t answer by then, it counts as confirmed.`;
  }
  if (l.state === "CONFIRMED" && l.confirmedBy === "NO_ANSWER") return `No answer came within ${CONFIRM_HOURS} hours, so it counted as confirmed.`;
  if (l.state === "PROBLEM") return "BTG is looking into it and will email you its decision. The seller isn't paid for this line until then.";
  if (l.state === "REFUNDED") return "BTG cancelled and refunded this line.";
  return null;
}

/** The sponsor's words for a refused answer, from the API's error body. */
export function answerRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a Sponsor Admin in your organisation can answer for this order.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
