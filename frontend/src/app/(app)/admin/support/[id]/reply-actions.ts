"use server";

import { revalidatePath } from "next/cache";

import { replyProblem, supportWriteRefusal } from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-41 — BTG answers and closes a support message (BTG admin; the API
   applies the matrix, keeps the reply and emails it from noreply@):

     POST /support-messages/:id/replies {body}   → ANSWERED (a closed one reopens)
     POST /support-messages/:id/close            → CLOSED ("Mark closed")

   The inbox, the message and the menu's New count all re-read afterwards.
   -------------------------------------------------------------------------- */

export type SupportWriteResult = { ok: true } | { ok: false; message: string };

const okId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);

async function write(path: string, body?: unknown): Promise<SupportWriteResult> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was sent. Try again in a minute." };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  /* The menu's count lives in the admin layout; the inbox and the message under it. */
  revalidatePath("/admin", "layout");
  if (!res.ok) return { ok: false, message: supportWriteRefusal(res.status, parsed) };
  return { ok: true };
}

export async function replyToSupportAction(id: string, body: string): Promise<SupportWriteResult> {
  if (!okId(id)) return { ok: false, message: "Unknown message." };
  const problem = replyProblem(typeof body === "string" ? body : "");
  if (problem) return { ok: false, message: problem };
  return write(`/support-messages/${encodeURIComponent(id)}/replies`, { body: body.trim() });
}

export async function closeSupportAction(id: string): Promise<SupportWriteResult> {
  if (!okId(id)) return { ok: false, message: "Unknown message." };
  return write(`/support-messages/${encodeURIComponent(id)}/close`);
}
