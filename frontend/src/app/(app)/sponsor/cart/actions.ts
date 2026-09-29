"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dayToIso, validateLine, type ApiCart, type ApiReservation, type ShopResult } from "@/lib/shop-live";
import { shopWrite } from "../shop/shop-api";

/* --------------------------------------------------------------------------
   2S4-FE-01 — the cart's writes, as server actions.

     PATCH  /cart/lines/:id   quantity / startsOn / endsOn (re-checked, 409 reasons)
     DELETE /cart/lines/:id
     POST   /cart/reserve     15-minute hold on exactly these lines (201; the
                              live hold if there already is one) → checkout

   A held cart is frozen: the API refuses line edits with 409 and says why,
   which is passed through as-is. SPONSOR_ADMIN only — an analyst's 403 comes
   back as plain words. Every write slides the cart's 24-hour expiry.
   -------------------------------------------------------------------------- */

export async function updateLineAction(lineId: string, quantity: number, startsOn: string, endsOn: string): Promise<ShopResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown cart line.", reasons: [] };
  const problems = validateLine({ quantity, startsOn, endsOn });
  if (problems.length) return { ok: false, message: "Check the line:", reasons: problems };

  const r = await shopWrite<ApiCart>(`/cart/lines/${encodeURIComponent(lineId)}`, "PATCH", {
    quantity,
    startsOn: dayToIso(startsOn),
    endsOn: dayToIso(endsOn),
  });
  revalidatePath("/sponsor/cart");
  return r.ok ? { ok: true } : r;
}

export async function removeLineAction(lineId: string): Promise<ShopResult> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown cart line.", reasons: [] };
  const r = await shopWrite<ApiCart>(`/cart/lines/${encodeURIComponent(lineId)}`, "DELETE");
  revalidatePath("/sponsor/cart");
  return r.ok ? { ok: true } : r;
}

/** Hold the cart for 15 minutes and go to checkout — or say why it can't be held. */
export async function reserveAction(): Promise<ShopResult> {
  const r = await shopWrite<ApiReservation>("/cart/reserve", "POST");
  if (!r.ok) {
    revalidatePath("/sponsor/cart");
    return r;
  }
  revalidatePath("/sponsor/cart");
  redirect(`/sponsor/checkout?reservation=${encodeURIComponent(r.data.id)}`);
}
