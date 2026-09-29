"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import {
  BRAND_CATEGORIES,
  explainInventoryRefusal,
  refusalMessage,
  type InventoryBody,
} from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   2S2-FE-02 — creating, editing and pausing inventory, and the athlete's
   "won't promote" categories, as server actions.

   Shared by the athlete's /athlete/inventory and the team's
   /property/inventory: the API decides whose item is whose — the owner is
   always the caller (POST /inventory names no owner), and PATCH is
   inventoryItem write "own", so a manager can change the team's items and
   never a roster athlete's. This adds no authority; it forwards the
   caller's own Clerk token and turns refusals into sentences.

     POST   /inventory          create (409 until BTG approves the athlete)
     PATCH  /inventory/:id      edit; {active} pauses/resumes. Price or
                                quantity → 409 while a listing is PUBLISHED
     POST   /restrictions       a category the athlete won't promote
     DELETE /restrictions/:id   remove one (an offer's exclusivity: 409)
   -------------------------------------------------------------------------- */

export type InventoryActionResult = { ok: true; id: string } | { ok: false; message: string };
export type RestrictionActionResult = { ok: true } | { ok: false; message: string };

const UNREACHABLE = "The API is unreachable — nothing was saved. Try again in a minute.";

function refresh() {
  revalidatePath("/athlete/inventory", "layout");
  revalidatePath("/property/inventory", "layout");
}

async function bodyOf(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function createItemAction(body: InventoryBody): Promise<InventoryActionResult> {
  if (!body || typeof body.title !== "string" || !Number.isInteger(body.priceCents)) return { ok: false, message: "Nothing to save." };
  let res: Response;
  try {
    res = await apiFetch("/inventory", { method: "POST", body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (res.ok) {
    const item = (await res.json()) as { id: string };
    refresh();
    return { ok: true, id: item.id };
  }
  return { ok: false, message: explainInventoryRefusal("create", res.status, await bodyOf(res)) };
}

export async function updateItemAction(id: string, patch: Partial<InventoryBody>): Promise<InventoryActionResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown item." };
  if (!patch || Object.keys(patch).length === 0) return { ok: false, message: "Nothing changed." };
  /* A package's contents are fixed at creation; never forward them here. */
  const { components: _drop, ...rest } = patch;
  void _drop;
  let res: Response;
  try {
    res = await apiFetch(`/inventory/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(rest) });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (res.ok) {
    refresh();
    return { ok: true, id };
  }
  return { ok: false, message: explainInventoryRefusal("update", res.status, await bodyOf(res)) };
}

export async function setItemActiveAction(id: string, active: boolean): Promise<InventoryActionResult> {
  if (typeof id !== "string" || !id || typeof active !== "boolean") return { ok: false, message: "Unknown item." };
  let res: Response;
  try {
    res = await apiFetch(`/inventory/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ active }) });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (res.ok) {
    refresh();
    return { ok: true, id };
  }
  return { ok: false, message: explainInventoryRefusal("pause", res.status, await bodyOf(res)) };
}

/** The athlete's own "won't promote" category — PROHIBITED, open-ended. */
export async function addRestrictionAction(category: string, reason: string): Promise<RestrictionActionResult> {
  if (!(BRAND_CATEGORIES as readonly string[]).includes(category)) return { ok: false, message: "Pick a category." };
  const trimmed = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  let res: Response;
  try {
    res = await apiFetch("/restrictions", {
      method: "POST",
      body: JSON.stringify({ category, type: "PROHIBITED", ...(trimmed ? { reason: trimmed } : {}) }),
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (res.ok) {
    refresh();
    return { ok: true };
  }
  const said = refusalMessage(await bodyOf(res));
  return { ok: false, message: res.status === 403 ? "Only you can add restrictions to your own profile." : said ?? `Nothing was saved (HTTP ${res.status}).` };
}

export async function removeRestrictionAction(id: string): Promise<RestrictionActionResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown restriction." };
  let res: Response;
  try {
    res = await apiFetch(`/restrictions/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (res.ok) {
    refresh();
    return { ok: true };
  }
  const said = refusalMessage(await bodyOf(res));
  return { ok: false, message: said ?? `Nothing was removed (HTTP ${res.status}).` };
}
