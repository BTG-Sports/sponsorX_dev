"use server";

import { revalidatePath } from "next/cache";

import { deskRefusal } from "@/lib/closed-accounts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG half) — the Closed accounts desk's one write (BTG admin; the
   API applies the matrix — accountClosure approve — and sends the email):

     POST /account-closures/:id/reactivation-decision  { decision: "DECLINE", note }

   "Decline" and "Tell them to apply again" both post it: the reason is
   emailed exactly as written and the account stays closed. Reinstate is not
   here — it is on the account's own page.
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
