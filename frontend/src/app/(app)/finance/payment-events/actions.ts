"use server";

import { revalidatePath } from "next/cache";

import { eventRefusal } from "@/lib/payment-events-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S5-FE-07 — the payment-event write, from the Finance portal (P1-ART-25
   restructure; admin keeps its own in admin/payments/actions.ts). The same
   endpoint — BTG admin only, so a Finance-only viewer never gets the button:

     POST /payment-events/:id/resolve { note }            BTG admin: a held or failed event dealt with, once

   The API applies the matrix and refuses in its own words (409 wrong state
   or already done, 422 an empty note or a card number); this adds no
   authority and passes those words through.
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true } | { ok: false; message: string };

const EVENTS = "/finance/payment-events";
const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";

async function post(path: string, body: unknown): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* no body */
    }
    return { res, body: parsed };
  } catch {
    return null;
  }
}

const cleanNote = (note: unknown) => (typeof note === "string" ? note.trim() : "");

export async function resolveEventAction(id: string, input: { note: string }): Promise<DeskWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown event." };
  const note = cleanNote(input?.note);
  if (!note) return { ok: false, message: "Say what you did about it — the next person reads this." };
  const out = await post(`/payment-events/${encodeURIComponent(id)}/resolve`, { note });
  if (!out) return { ok: false, message: unreachable };
  revalidatePath(EVENTS);
  return out.res.ok ? { ok: true } : { ok: false, message: eventRefusal(out.res.status, out.body, "It wasn't marked dealt with") };
}
