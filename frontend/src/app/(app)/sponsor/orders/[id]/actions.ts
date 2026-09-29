"use server";

import { revalidatePath } from "next/cache";

import { canCancel, type ApiOrder, type ShopResult } from "@/lib/shop-live";
import { shopWrite } from "../../shop/shop-api";

/* --------------------------------------------------------------------------
   2S4-FE-02 — cancelling an order, as a server action.

   POST /marketplace-orders/:id/transition {to:"CANCELLED"}. CANCELLED is the
   only transition a sponsor may send (the API refuses any other with 403),
   and only before payment — PENDING_APPROVAL, APPROVED or AWAITING_PAYMENT.
   The state check here only spares a round trip; the API's state machine
   decides, and a 409 (the order moved meanwhile) is passed through.
   -------------------------------------------------------------------------- */

export async function cancelOrderAction(orderId: string, currentState: string): Promise<ShopResult> {
  if (typeof orderId !== "string" || !orderId) return { ok: false, message: "Unknown order.", reasons: [] };
  if (!canCancel(currentState)) return { ok: false, message: "This order can no longer be cancelled — after payment the way out is a refund, through BTG.", reasons: [] };
  const r = await shopWrite<ApiOrder>(`/marketplace-orders/${encodeURIComponent(orderId)}/transition`, "POST", { to: "CANCELLED" });
  revalidatePath(`/sponsor/orders/${orderId}`);
  revalidatePath("/sponsor/orders");
  return r.ok ? { ok: true } : r;
}
