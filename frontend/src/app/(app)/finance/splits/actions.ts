"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   P9-BE-19 — Finance locks an edition's revenue split, from the Finance
   portal (P1-ART-25 restructure; admin's copy is splitLockAction in
   admin/next/actions.ts). The same endpoint:

     POST /editions/:id/splits/lock   { note }     Finance (revenueSplit.approve)
     POST /editions/:id/splits/unlock { reason }   BTG admin (edition.approve)

   The API's matrix decides and its refusal is shown in its own words; this
   adds no authority. It revalidates /finance/splits, not admin's desk.
   -------------------------------------------------------------------------- */

export type SplitLockResult = { ok: true; message: string } | { ok: false; message: string };

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function lockSplitAction(editionId: string, lock: boolean, text: string): Promise<SplitLockResult> {
  const words = typeof text === "string" ? text.trim() : "";
  if (!editionId) return { ok: false, message: "Nothing to change." };
  if (!words) return { ok: false, message: lock ? "Say what you checked." : "Say why it is being unlocked." };
  if (words.length > 500) return { ok: false, message: "Keep it to 500 characters." };
  try {
    const res = await apiFetch(`/editions/${encodeURIComponent(editionId)}/splits/${lock ? "lock" : "unlock"}`, {
      method: "POST",
      body: JSON.stringify(lock ? { note: words } : { reason: words }),
    });
    if (!res.ok) return { ok: false, message: await reason(res, `Not saved (HTTP ${res.status}).`) };
    revalidatePath("/finance/splits");
    return { ok: true, message: lock ? "Split locked." : "Split unlocked." };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
