"use server";

import { revalidatePath } from "next/cache";

import { disputeRefusal } from "@/lib/disputes-live";
import { eventRefusal } from "@/lib/payment-events-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S5-FE-07 / 2S5-FE-08 — BTG's writes on the payment desks:

     POST /payment-events/:id/resolve { note }            BTG admin: a held or failed event dealt with, once
     POST /disputes/:id/review        { note }            BTG admin or Finance: OPEN → UNDER_REVIEW
     POST /disputes/:id/resolve       { note, lineIds? }  BTG admin: UNDER_REVIEW → the provider's outcome

   The API applies the matrix and refuses in its own words (409 wrong state
   or already done, 422 an empty note, a card number, or the lines of a
   part dispute); these add no authority and pass those words through.
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true } | { ok: false; message: string };

const EVENTS = "/admin/payments/events";
const DISPUTES = "/admin/payments/disputes";
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

export async function reviewDisputeAction(id: string, input: { note: string }): Promise<DeskWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown dispute." };
  const note = cleanNote(input?.note);
  if (!note) return { ok: false, message: "Say what was sent to the provider, or what you're gathering." };
  const out = await post(`/disputes/${encodeURIComponent(id)}/review`, { note });
  if (!out) return { ok: false, message: unreachable };
  revalidatePath(DISPUTES);
  revalidatePath(`${DISPUTES}/${id}`);
  return out.res.ok ? { ok: true } : { ok: false, message: disputeRefusal(out.res.status, out.body, "It wasn't taken for review") };
}

export async function resolveDisputeAction(id: string, input: { note: string; lineIds?: string[] }): Promise<DeskWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown dispute." };
  const note = cleanNote(input?.note);
  if (!note) return { ok: false, message: "Say how it was resolved — the next person reads this." };
  const lineIds = Array.isArray(input?.lineIds) ? input.lineIds.filter((l): l is string => typeof l === "string" && l.length > 0) : undefined;
  const out = await post(`/disputes/${encodeURIComponent(id)}/resolve`, { note, ...(lineIds?.length ? { lineIds } : {}) });
  if (!out) return { ok: false, message: unreachable };
  revalidatePath(DISPUTES);
  revalidatePath(`${DISPUTES}/${id}`);
  return out.res.ok ? { ok: true } : { ok: false, message: disputeRefusal(out.res.status, out.body, "It wasn't resolved") };
}
