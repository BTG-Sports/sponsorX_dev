/* --------------------------------------------------------------------------
   POL-FE-24 — the athlete's Campaign Orders list, and declining one.

   The API has no GET /orders list; a Campaign Order is what an accepted
   invitation becomes once BTG sends it, and GET /invitations?state=accepted
   (paged) carries each one's order {id, state} (invitationsOut, P5-FE-01).
   A DRAFT order is BTG's working copy and arrives as `order: null` — the row
   says BTG is still drafting it. An order from an accepted marketplace
   offer is created already ACCEPTED (offer.ts) and lives on the Offers
   page; nothing here is to sign or decline for those.

   Declining is POST /orders/:id/transition {to:"REJECTED"} — the athlete's
   own move, allowed only while the order is SENT and the deal isn't paused
   (campaign-order.ts). Accepting stays on the order page: it hashes the
   agreement text rendered there (P5-FE-01).

   Pure: shapes, the row model and the words. tests/athlete-orders-live.test.ts.
   -------------------------------------------------------------------------- */

import type { ApiInvitation } from "@/lib/invitations-live";
import { apiListQuery, type SearchParams } from "@/lib/list-query";
import { ORDER_STATE_COPY } from "@/lib/order-live";

export const ORDERS_PATH = "/athlete/orders";

/** The URL → GET /invitations' paged query, pinned to the accepted tab. */
export function ordersApiQuery(sp: SearchParams): string {
  return apiListQuery(sp, { state: "accepted" });
}

export type OrderRowTone = "primary" | "accent" | "neutral" | "danger" | "warn";

export type OrderRow = {
  /** The invitation's id — stable even before the order exists. */
  key: string;
  /** The Campaign Order's id, or null while BTG drafts it. */
  orderId: string | null;
  href: string | null;
  state: string;
  stateLabel: string;
  tone: OrderRowTone;
  sponsor: string;
  campaign: string;
  jobId: string;
  jobName: string;
  /** cents, what the invitation offered */
  offered: number;
  /** ISO — when the invitation was accepted (the order followed). */
  acceptedAt: string | null;
  /** What's the athlete's to do now, in a few words. */
  next: string;
  canAccept: boolean;
  canDecline: boolean;
};

const TONE: Record<string, OrderRowTone> = {
  DRAFT: "neutral",
  SENT: "primary",
  ACCEPTED: "accent",
  ACTIVE: "accent",
  COMPLETED: "neutral",
  REJECTED: "neutral",
  CANCELLED: "danger",
};

export const DRAFTING_LABEL = "Being drafted";
export const DRAFTING_NEXT = "BTG is drafting the order — you'll be told when it's ready to sign.";

export const NEXT_WORDS: Record<string, string> = {
  SENT: "Read the terms, then accept or decline.",
  ACCEPTED: "Signed — its deliverables are on your calendar.",
  ACTIVE: "Live — deliver what's due.",
  COMPLETED: "Done. The earning is on Earnings.",
  REJECTED: "You declined it.",
  CANCELLED: "BTG withdrew it.",
};

/** The athlete's moves on an order: both only while it is SENT. */
export function orderMoves(state: string | null | undefined): { accept: boolean; decline: boolean } {
  const sent = state === "SENT";
  return { accept: sent, decline: sent };
}

export function toOrderRow(inv: ApiInvitation): OrderRow {
  const o = inv.order ?? null;
  const state = o?.state ?? "DRAFT";
  const moves = orderMoves(o?.state);
  return {
    key: inv.id,
    orderId: o?.id ?? null,
    href: o ? `${ORDERS_PATH}/${encodeURIComponent(o.id)}?from=athlete-orders` : null,
    state,
    stateLabel: o ? (ORDER_STATE_COPY[state] ?? state) : DRAFTING_LABEL,
    tone: TONE[state] ?? "neutral",
    sponsor: inv.sponsorName ?? "BTG",
    campaign: inv.campaignName,
    jobId: inv.jobId,
    jobName: inv.jobName,
    offered: inv.offered,
    acceptedAt: inv.respondedAt,
    next: o ? (NEXT_WORDS[state] ?? "Nothing for you to do right now.") : DRAFTING_NEXT,
    canAccept: moves.accept,
    canDecline: moves.decline,
  };
}

/** Only accepted invitations reach this list; an API still answering a wider tab is filtered here. */
export function orderRows(invitations: ApiInvitation[]): OrderRow[] {
  return invitations.filter((i) => i.state === "ACCEPTED").map(toOrderRow);
}

/** The three KPI figures over the rows of this page. */
export function orderCounts(rows: OrderRow[]): { toSign: number; live: number; drafting: number } {
  return {
    toSign: rows.filter((r) => r.state === "SENT").length,
    live: rows.filter((r) => r.state === "ACCEPTED" || r.state === "ACTIVE").length,
    drafting: rows.filter((r) => r.orderId === null).length,
  };
}

/* ------------------------------------------------------------- declining */

export type DeclineResult = { ok: true; state: string } | { ok: false; message: string; reload?: boolean };

export const DECLINE_CONFIRM = "Decline this Campaign Order? It can't be reopened — BTG would have to send a new one.";

/** The API's refusal in the athlete's words. 409 is the state machine (already
 *  answered, withdrawn, or the deal is paused for documents); 403 is not theirs. */
export function declineRefusal(status: number, body: unknown, fallback: string): { message: string; reload: boolean } {
  const b = body as { error?: { code?: string; message?: string; issues?: Array<{ message: string }> } } | null;
  const said = b?.error?.issues?.[0]?.message ?? b?.error?.message;
  if (status === 409 && b?.error?.code === "deal_paused") {
    return { message: said ?? "This deal is paused while BTG looks into a concern — it can't be declined until BTG decides.", reload: false };
  }
  if (status === 409) return { message: said ?? "This order has already been answered or withdrawn.", reload: true };
  if (status === 403) return { message: "This order isn't yours to decline.", reload: false };
  return { message: said ?? fallback, reload: false };
}
