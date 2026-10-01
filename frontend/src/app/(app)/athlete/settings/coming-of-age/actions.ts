"use server";

import { refusalWords } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the guardian's "Send <athlete> the link" (2S1-BE-12):
     POST /coming-of-age/send-link   emails the athlete their coming-of-age page,
                                     where a government ID takes over the account
   The API checks it is the guardian acting for that athlete.
   -------------------------------------------------------------------------- */

export async function sendComingOfAgeLinkAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await apiFetch("/coming-of-age/send-link", { method: "POST" });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was sent. Try again in a minute." };
  }
  if (res.ok) return { ok: true };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { ok: false, message: refusalWords(body, res.status) };
}
