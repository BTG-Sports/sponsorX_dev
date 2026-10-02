"use server";

import { revalidatePath } from "next/cache";

import { REFUND_METHODS, refundRefusal, sentProblems, type RefundMethod } from "@/lib/refunds-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S4-FE-06 / 2S4-BE-13 — Finance marks a refund sent by hand:

     POST /refunds/:id/sent  { method, reference, sentOn }

   BTG admin and Finance (refundDue write); the API applies the matrix,
   refuses a second mark (409), a card-number reference or a future date
   (422), and emails the sponsor. These add no authority.
   -------------------------------------------------------------------------- */

export type RefundWrite = { ok: true } | { ok: false; message: string };

const PATH = "/admin/refunds";
const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";

export async function markRefundSentAction(id: string, input: { method: RefundMethod; reference: string; sentOn: string }): Promise<RefundWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown refund." };
  const method = (REFUND_METHODS as readonly string[]).includes(input?.method) ? input.method : null;
  const reference = typeof input?.reference === "string" ? input.reference.trim() : "";
  const sentOn = typeof input?.sentOn === "string" ? input.sentOn : "";
  const bad = sentProblems({ method, reference, sentOn });
  const first = bad.method ?? bad.reference ?? bad.sentOn;
  if (first) return { ok: false, message: first };
  let res: Response;
  let body: unknown = null;
  try {
    res = await apiFetch(`/refunds/${encodeURIComponent(id)}/sent`, { method: "POST", body: JSON.stringify({ method, reference, sentOn }) });
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
  } catch {
    return { ok: false, message: unreachable };
  }
  revalidatePath(PATH);
  return res.ok ? { ok: true } : { ok: false, message: refundRefusal(res.status, body, "It wasn't marked sent") };
}
