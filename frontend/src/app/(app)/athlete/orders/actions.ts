"use server";

import { revalidatePath } from "next/cache";

import { declineRefusal, type DeclineResult } from "@/lib/athlete-orders-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-24 — declining a Campaign Order, as a server action.

   POST /orders/:id/transition {to:"REJECTED"} is the athlete's own move
   (campaign-order.ts: assertAllowed campaignOrder write, SENT only, not
   while the deal is paused). The athlete's own Clerk token and own scope —
   this adds no authority. Accepting is NOT here: it needs the agreement
   fingerprint and the signer's evidence (orders/[id]/actions.ts).
   -------------------------------------------------------------------------- */

const ID = /^[A-Za-z0-9_-]{1,120}$/;

export async function declineOrderAction(orderId: string): Promise<DeclineResult> {
  if (typeof orderId !== "string" || !ID.test(orderId)) return { ok: false, message: "Nothing to decline." };

  let res: Response;
  try {
    res = await apiFetch(`/orders/${encodeURIComponent(orderId)}/transition`, {
      method: "POST",
      body: JSON.stringify({ to: "REJECTED" }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was declined. Try again in a minute." };
  }

  if (res.ok) {
    const d = (await res.json()) as { state: string };
    revalidatePath("/athlete/orders");
    revalidatePath("/athlete/orders/[id]", "page");
    revalidatePath("/athlete");
    return { ok: true, state: d.state };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* Non-JSON error body — the status-line message stands. */
  }
  const r = declineRefusal(res.status, body, `The decline was not recorded (HTTP ${res.status}).`);
  return { ok: false, message: r.message, reload: r.reload };
}
