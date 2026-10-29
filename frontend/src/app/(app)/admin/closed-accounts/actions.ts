"use server";

import { revalidatePath } from "next/cache";

import { deskRefusal, requestRefusal } from "@/lib/closed-accounts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG half) — the Closed accounts desk's writes (BTG admin; the
   API applies the matrix — accountClosure approve — and sends the email):

     POST /account-closures/:id/reactivation-decision  { decision: "DECLINE", note }

   "Decline" and "Tell them to apply again" both post it: the reason is
   emailed exactly as written and the account stays closed. Reinstate is not
   here — it is on the account's own page.

   POL-FE-11 (POL-BE-11) — a closure held for BTG:

     POST /account-closure-requests/:id/close     closes it once nothing is left; 409 lists what is still open
     POST /account-closure-requests/:id/decline   { note } — the account stays open; the owner reads the note
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true } | { ok: false; message: string };

const PATH = "/admin/closed-accounts";
const unreachable = "The API is unreachable — nothing changed. Try again in a minute.";

export async function declineReturnAction(closureId: string, note: string): Promise<DeskWrite> {
  if (typeof closureId !== "string" || !closureId) return { ok: false, message: "Unknown closed account." };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, message: "Write a reason — they read it exactly as written." };
  let res: Response;
  let body: unknown = null;
  try {
    res = await apiFetch(`/account-closures/${encodeURIComponent(closureId)}/reactivation-decision`, {
      method: "POST", body: JSON.stringify({ decision: "DECLINE", note: text.slice(0, 2000) }),
    });
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
  } catch {
    return { ok: false, message: unreachable };
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${closureId}`);
  return res.ok ? { ok: true } : { ok: false, message: deskRefusal(res.status, body, "The answer wasn't sent") };
}

async function requestWrite(requestId: string, verb: "close" | "decline", payload: object | null, fallback: string): Promise<DeskWrite> {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) return { ok: false, message: "Unknown closure request." };
  let res: Response;
  let body: unknown = null;
  try {
    res = await apiFetch(`/account-closure-requests/${encodeURIComponent(requestId)}/${verb}`, {
      method: "POST", body: JSON.stringify(payload ?? {}),
    });
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
  } catch {
    return { ok: false, message: unreachable };
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/requests/${requestId}`);
  return res.ok ? { ok: true } : { ok: false, message: requestRefusal(res.status, body, fallback) };
}

/** Close now — refused (409) with what is still open until nothing is. */
export async function closeHeldRequestAction(requestId: string): Promise<DeskWrite> {
  return requestWrite(requestId, "close", null, "It wasn't closed");
}

/** Decline — the account stays open; the note is emailed to the owner as written. */
export async function declineHeldRequestAction(requestId: string, note: string): Promise<DeskWrite> {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, message: "Write a reason — the owner reads it exactly as written." };
  return requestWrite(requestId, "decline", { note: text.slice(0, 1000) }, "The answer wasn't sent");
}
