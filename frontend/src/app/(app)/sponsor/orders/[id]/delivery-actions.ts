"use server";

import { revalidatePath } from "next/cache";

import { answerRefusal } from "@/lib/sponsor-delivery-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S4-FE-04 (sponsor half) — the sponsor's answer to a delivered line, as
   server actions:

     POST /deliveries/:lineId/confirm            the line is delivered
     POST /deliveries/:lineId/problem  { note }  within the 24 hours; BTG
                                                 decides, the payout is held
     GET  /deliveries/:lineId/proof              a 5-minute audited link
     POST /deliveries/:lineId/problem-answer     2S4-FE-05: accept the seller's
                                                 answer, or reject it (note) → BTG

   SPONSOR_ADMIN only (orderDelivery own-sponsor write); the API refuses
   anyone else and anything after the 24 hours.
   -------------------------------------------------------------------------- */

export type AnswerResult = { ok: true } | { ok: false; message: string };

const unreachable = "The API is unreachable — nothing was sent. Try again in a minute.";

async function call(path: string, init: RequestInit): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    return { res, body };
  } catch {
    return null;
  }
}

export async function confirmDeliveryAction(orderId: string, lineId: string): Promise<AnswerResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/confirm`, { method: "POST" });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(`/sponsor/orders/${orderId}`);
  return r.res.ok ? { ok: true } : { ok: false, message: answerRefusal(r.res.status, r.body, "It wasn't confirmed") };
}

export async function reportProblemAction(orderId: string, lineId: string, note: string): Promise<AnswerResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, message: "Say what went wrong — BTG and the seller read this." };
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/problem`, { method: "POST", body: JSON.stringify({ note: text.slice(0, 2000) }) });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(`/sponsor/orders/${orderId}`);
  return r.res.ok ? { ok: true } : { ok: false, message: answerRefusal(r.res.status, r.body, "The problem wasn't reported") };
}

/** 2S4-FE-05 — the seller's answer to a reported problem: ACCEPT settles it; REJECT, with a note, sends it to BTG. */
export async function answerSellerReplyAction(orderId: string, lineId: string, decision: "ACCEPT" | "REJECT", note?: string): Promise<AnswerResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  if (decision !== "ACCEPT" && decision !== "REJECT") return { ok: false, message: "Accept or reject." };
  const text = typeof note === "string" ? note.trim().slice(0, 2000) : "";
  if (decision === "REJECT" && !text) return { ok: false, message: "Write a note — BTG reads it when they decide." };
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/problem-answer`, {
    method: "POST",
    body: JSON.stringify(decision === "REJECT" ? { decision, note: text } : { decision }),
  });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(`/sponsor/orders/${orderId}`);
  return r.res.ok ? { ok: true } : { ok: false, message: answerRefusal(r.res.status, r.body, "Your answer wasn't sent") };
}

/* --------------------------------------------------------------------------
   2S4-FE-06 / 2S4-BE-12 — the sponsor cancels a paid line not yet delivered:

     POST /deliveries/:lineId/cancel  { reason? }
       → { outcome: REFUNDED, refundCents, refund }   free (until 3 days before
                                                      its first date): refunded
       → { outcome: ASKED_SELLER, issueId, sellerAnswerBy }   after the
                                                      cut-off: the seller is
                                                      asked (a reason required)
       409 when it can't be cancelled (the API's words are shown); 422 without
       the reason the cut-off needs. SPONSOR_ADMIN only.
   -------------------------------------------------------------------------- */

export type CancelResult =
  | { ok: true; outcome: "REFUNDED" | "ASKED_SELLER" }
  | { ok: false; message: string };

export async function cancelLineAction(orderId: string, lineId: string, reason: string, mode: "free" | "ask"): Promise<CancelResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const text = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (mode === "ask" && !text) return { ok: false, message: "Say why you want to cancel — the seller reads this, and BTG too if it comes to them." };
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/cancel`, { method: "POST", body: JSON.stringify(text ? { reason: text } : {}) });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(`/sponsor/orders/${orderId}`);
  if (!r.res.ok) {
    if (r.res.status === 403) return { ok: false, message: "Only a Sponsor Admin in your organisation can cancel a line." };
    return { ok: false, message: answerRefusal(r.res.status, r.body, "The line wasn't cancelled") };
  }
  const outcome = (r.body as { outcome?: unknown } | null)?.outcome;
  return { ok: true, outcome: outcome === "ASKED_SELLER" ? "ASKED_SELLER" : "REFUNDED" };
}

/** A seller's photo: the line's current one, or (with `issue`) a problem's answer photo or the delivery photo it disputed. */
export async function deliveryProofAction(lineId: string, opts: { issue?: string; photo?: "answer" | "marked" } = {}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const q = new URLSearchParams();
  if (typeof opts.issue === "string" && opts.issue) q.set("issue", opts.issue);
  if (opts.photo === "answer" || opts.photo === "marked") q.set("photo", opts.photo);
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/proof${q.size ? `?${q}` : ""}`, { method: "GET" });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: answerRefusal(r.res.status, r.body, "The photo couldn't be opened") };
  return { ok: true, url: String((r.body as { url?: unknown } | null)?.url ?? "") };
}
