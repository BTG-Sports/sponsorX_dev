"use server";

import { revalidatePath } from "next/cache";

import { dayToIso, validateLine, type ApiCart, type ShopResult } from "@/lib/shop-live";
import { shopWrite } from "./shop-api";

/* --------------------------------------------------------------------------
   2S4-FE-01 — "Add to cart", as a server action.

   Two writes, in order: POST /cart opens the sponsor's cart or returns the
   one already open (201 either way), then POST /cart/lines adds the listing
   for the chosen quantity and days. The API checks availability, category
   conflict and price on the line write and answers 409 with every reason —
   all of them are handed back for the card to list. The window check here
   is only the shape (a real day, end after start); the item's own window was
   checked in the card, and the API checks it again regardless.
   -------------------------------------------------------------------------- */

export async function addToCartAction(listingId: string, quantity: number, startsOn: string, endsOn: string): Promise<ShopResult> {
  if (typeof listingId !== "string" || !listingId) return { ok: false, message: "Unknown listing.", reasons: [] };
  const problems = validateLine({ quantity, startsOn, endsOn });
  if (problems.length) return { ok: false, message: "Check the line:", reasons: problems };

  const cart = await shopWrite<ApiCart>("/cart", "POST");
  if (!cart.ok) return cart;

  const line = await shopWrite<ApiCart>("/cart/lines", "POST", {
    listingId,
    quantity,
    startsOn: dayToIso(startsOn),
    endsOn: dayToIso(endsOn),
  });
  if (!line.ok) return line;

  revalidatePath("/sponsor/cart");
  return { ok: true };
}
