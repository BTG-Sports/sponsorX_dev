"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ApiOrder, ApiReservation, ShopResult } from "@/lib/shop-live";
import { shopWrite } from "../shop/shop-api";

/* --------------------------------------------------------------------------
   2S4-FE-02 — checkout's two writes, as server actions.

     POST /marketplace-orders {reservationId}  the live hold → an order (201).
                                               Policy may hold it for BTG
                                               approval; the order says why.
     POST /reservations/:id/release            give the stock back; the cart
                                               is editable again.

   There is no agreement and no payment in placeOrder — the API has neither
   (see the checkout page's header). SPONSOR_ADMIN only.
   -------------------------------------------------------------------------- */

export async function placeOrderAction(reservationId: string): Promise<ShopResult> {
  if (typeof reservationId !== "string" || !reservationId) return { ok: false, message: "Unknown hold.", reasons: [] };
  const r = await shopWrite<ApiOrder>("/marketplace-orders", "POST", { reservationId });
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
