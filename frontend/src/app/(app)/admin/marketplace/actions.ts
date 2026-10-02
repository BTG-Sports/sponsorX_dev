"use server";

import { revalidatePath } from "next/cache";

import { refusalMessage } from "@/lib/onboarding-live";
import {
  btgListingActions,
  explainStaffRefusal,
  manualPaymentProblem,
  needsReason,
  orderDecisions,
  orderMoves,
  type BtgListingAction,
  type ListingDecision,
  type ListingState,
  type ManualPayment,
  type MarketplaceOrderState,
  type OrderDecision,
} from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S7-FE-02 — the marketplace console's decisions, as server actions.

     listing  POST /listings/:id/decision            {decision: APPROVE|REQUEST_CHANGES|REJECT, notes}
              POST /listings/:id/btg-action          {action: PAUSE|END|RESUME, reason} (2S3-BE-06) —
                                                     a RESUME the checks hold answers with `notice`
     order    POST /marketplace-orders/:id/decision  {decision: APPROVE|REJECT, notes}
     move     POST /marketplace-orders/:id/transition {to, payment?} — PAID by hand carries
                                                     {method, reference, receivedOn} (2S4-BE-10)

   The API decides — the approve scopes, the state machines (409), notes on
   REQUEST_CHANGES and REJECT (422), a listing's governance blockers (422
   with problems[]). These add no authority; they forward the reviewer's own
   token, refuse moves the order's state can't take before asking, and turn
   refusals into copy.
   -------------------------------------------------------------------------- */

/** `notice`: what the API said came of it instead (BTG's "Put back live" held for restricted words). */
export type OpsResult = { ok: true; state: string; notice?: string } | { ok: false; message: string };

async function post(path: string, body: unknown, revalidate: string[]): Promise<OpsResult> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  if (res.ok) {
    const d = (await res.json()) as { state: string; notice?: unknown };
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, state: d.state, ...(typeof d.notice === "string" ? { notice: d.notice } : {}) };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* no body */
  }
  if (res.status === 409) for (const p of revalidate) revalidatePath(p);
  return { ok: false, message: explainStaffRefusal(res.status, refusalMessage(payload)) };
}

const LISTING_DECISIONS: readonly ListingDecision[] = ["APPROVE", "REQUEST_CHANGES", "REJECT"];

export async function decideListingAction(id: string, decision: ListingDecision, notes: string): Promise<OpsResult> {
  if (typeof id !== "string" || !id || !LISTING_DECISIONS.includes(decision)) return { ok: false, message: "Unknown listing decision." };
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  if (decision !== "APPROVE" && !trimmed) return { ok: false, message: "Write a note — the seller is emailed it." };
  return post(`/listings/${encodeURIComponent(id)}/decision`, { decision, notes: trimmed || null }, ["/admin/marketplace"]);
}

/** 2S3-BE-06 — pause or end a live listing with a reason the seller is emailed, or put back one BTG paused. */
export async function btgListingAction(id: string, from: { state: ListingState; btgAction: "PAUSED" | "ENDED" | null }, action: BtgListingAction, reason: string): Promise<OpsResult> {
  if (typeof id !== "string" || !id || !btgListingActions(from).includes(action)) return { ok: false, message: "That isn't available for this listing." };
  const trimmed = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (needsReason(action) && !trimmed) return { ok: false, message: "Write a reason — the seller is emailed it." };
  return post(`/listings/${encodeURIComponent(id)}/btg-action`, { action, reason: trimmed || null }, ["/admin/marketplace"]);
}

export async function decideOrderAction(id: string, from: MarketplaceOrderState, decision: OrderDecision, notes: string): Promise<OpsResult> {
  if (typeof id !== "string" || !id || !orderDecisions(from).includes(decision)) return { ok: false, message: "That decision isn't available for this order." };
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  if (decision === "REJECT" && !trimmed) return { ok: false, message: "Write a note — the sponsor is told why." };
  return post(`/marketplace-orders/${encodeURIComponent(id)}/decision`, { decision, notes: trimmed || null }, [
    "/admin/marketplace",
    `/admin/marketplace/orders/${id}`,
  ]);
}

export async function moveOrderAction(id: string, from: MarketplaceOrderState, to: MarketplaceOrderState, payment?: ManualPayment): Promise<OpsResult> {
  if (typeof id !== "string" || !id || !orderMoves(from).includes(to)) return { ok: false, message: `An order that is ${from} can't move to ${to}.` };
  if (to === "PAID") {
    const problem = manualPaymentProblem(payment ?? {}, new Date().toISOString().slice(0, 10));
    if (problem) return { ok: false, message: problem };
    const p = payment!;
    return post(`/marketplace-orders/${encodeURIComponent(id)}/transition`, { to, payment: { method: p.method, reference: p.reference.trim(), receivedOn: p.receivedOn } }, [
      "/admin/marketplace",
      `/admin/marketplace/orders/${id}`,
    ]);
  }
  return post(`/marketplace-orders/${encodeURIComponent(id)}/transition`, { to }, ["/admin/marketplace", `/admin/marketplace/orders/${id}`]);
}
