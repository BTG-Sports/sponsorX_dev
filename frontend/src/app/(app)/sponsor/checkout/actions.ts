"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { billingComplete, placeOrderPayload, type BillingDraft } from "@/lib/checkout-gate";
import { canonicaliseAgreementBody } from "@/lib/order-live";
import type { ApiOrder, ApiReservation, ShopResult } from "@/lib/shop-live";
import { edgeHeadersFrom } from "@/server/edge";
import { shopWrite } from "../shop/shop-api";

/* --------------------------------------------------------------------------
   2S4-FE-02 — checkout's two writes, as server actions.

     POST /marketplace-orders {reservationId, agreementId, bodyHashShown, billing}
                                               the live hold → an order (201),
                                               through the contract gate.
                                               Policy may hold it for BTG
                                               approval; the order says why.
     POST /reservations/:id/release            give the stock back; the cart
                                               is editable again.

   The contract gate (2S4-FE-02). Place order carries the MARKETPLACE_ORDER
   agreement the page showed: its id and a fingerprint of the EXACT body
   rendered, hashed here with the backend's canonicalisation (as the offer
   and Campaign Order accepts do). The API re-reads and re-hashes the terms in
   force inside the order's transaction and refuses a mismatch (409) or a
   missing acceptance / billing contact (422). Evidence (§12): the browser's
   address and user-agent go on the edge-keyed headers, so the acceptance
   records the signer, not this server. Payment is not taken here — it is
   the order page's card step, after BTG approves. SPONSOR_ADMIN only.
   -------------------------------------------------------------------------- */

export async function placeOrderAction(
  reservationId: string,
  terms: { id: string; body: string },
  billing: BillingDraft,
  accepted: boolean,
): Promise<ShopResult> {
  if (typeof reservationId !== "string" || !reservationId) return { ok: false, message: "Unknown hold.", reasons: [] };
  if (!terms || typeof terms.id !== "string" || !terms.id || typeof terms.body !== "string" || !terms.body) {
    return { ok: false, message: "The order terms aren't on this page — reload checkout and read them before placing the order.", reasons: [] };
  }
  if (accepted !== true) return { ok: false, message: "Tick the box to accept the order terms first.", reasons: [] };
  if (!billing || ![billing.name, billing.email, billing.reference].every((v) => typeof v === "string") || !billingComplete(billing)) {
    return { ok: false, message: "Complete the billing contact first.", reasons: [] };
  }
  const bodyHashShown = "sha256:" + createHash("sha256").update(canonicaliseAgreementBody(terms.body), "utf8").digest("hex");
  const r = await shopWrite<ApiOrder>(
    "/marketplace-orders",
    "POST",
    { ...placeOrderPayload({ reservationId, agreementId: terms.id, billing }), bodyHashShown },
    edgeHeadersFrom(await headers(), { signer: true }),
  );
  if (!r.ok) {
    revalidatePath("/sponsor/checkout");
    return r;
  }
  revalidatePath("/sponsor/orders");
  revalidatePath("/sponsor/cart");
  redirect(`/sponsor/orders/${encodeURIComponent(r.data.id)}?placed=1`);
}

export async function releaseHoldAction(reservationId: string): Promise<ShopResult> {
  if (typeof reservationId !== "string" || !reservationId) return { ok: false, message: "Unknown hold.", reasons: [] };
  const r = await shopWrite<ApiReservation>(`/reservations/${encodeURIComponent(reservationId)}/release`, "POST");
  if (!r.ok) {
    revalidatePath("/sponsor/checkout");
    return r;
  }
  revalidatePath("/sponsor/cart");
  redirect("/sponsor/cart");
}
