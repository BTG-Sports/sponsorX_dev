"use server";

import { redirect } from "next/navigation";

import { shopWrite } from "../../shop/shop-api";

/* --------------------------------------------------------------------------
   2S5-FE-05 — the sponsor pays an approved order by card.

   POST /marketplace-orders/:id/pay → { url }, the payment provider's own page
   (Stripe; the stand-in on staging). The browser is sent there, and the
   provider returns it to /sponsor/orders/<id>?payment=returned.

   SPONSOR_ADMIN of that order only — the API refuses anyone else (403). A 409
   says why in the API's words: not approved yet, not waiting for payment, a
   payment already being confirmed ("please don't pay again"), or the
   provider not connected. Those are shown as given.
   -------------------------------------------------------------------------- */

export type PayResult = { ok: false; message: string };

export async function payOrderAction(orderId: string): Promise<PayResult> {
  if (typeof orderId !== "string" || !orderId) return { ok: false, message: "Unknown order." };
  const r = await shopWrite<{ url?: unknown }>(`/marketplace-orders/${encodeURIComponent(orderId)}/pay`, "POST");
  if (!r.ok) {
    const message = r.status === 403 ? "Your role can't pay for orders — a Sponsor Admin pays for your organisation." : r.message;
    return { ok: false, message };
  }
  const url = r.data?.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return { ok: false, message: "The payment page couldn't be opened — nothing was charged. Try again in a minute." };
  }
  redirect(url);
}
