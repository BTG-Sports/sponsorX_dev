"use server";

import { revalidatePath } from "next/cache";

import { deskRefusal } from "@/lib/guardian-handoffs-desk-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-10 (BTG half) — the Guardian handoffs desk's acts (BTG admin; the
   API applies the matrix — guardianHandoff approve for the decision, a
   tenant-wide read for the documents — runs the switch and sends the
   emails):

     POST /guardian-handoffs/:id/staff-decision        { decision: CONFIRM } | { decision: DECLINE, note }
     GET  /guardian-handoffs/:id/documents/:documentId a 5-minute audited link

   Every export of a "use server" file is a callable endpoint, so the
   arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true } | { ok: false; message: string };
export type DocumentLink = { ok: true; url: string; expiresInSeconds: number } | { ok: false; message: string };

const PATH = "/admin/guardian-handoffs";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const unreachable = "The API is unreachable — nothing changed. Try again in a minute.";

async function call(path: string, init?: RequestInit): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    return { res, body };
  } catch {
    return null;
  }
}

/** Confirm the switch, or decline it with a reason the new guardian reads exactly as written. */
export async function staffDecisionAction(id: string, decision: "CONFIRM" | "DECLINE", note?: string): Promise<DeskWrite> {
  if (typeof id !== "string" || !ID.test(id)) return { ok: false, message: "Unknown request." };
  if (decision !== "CONFIRM" && decision !== "DECLINE") return { ok: false, message: "Choose confirm or decline." };
  const reason = typeof note === "string" ? note.trim() : "";
  if (decision === "DECLINE" && !reason) return { ok: false, message: "Write a reason — the new guardian reads it." };
  const r = await call(`/guardian-handoffs/${encodeURIComponent(id)}/staff-decision`, {
    method: "POST",
    body: JSON.stringify(decision === "DECLINE" ? { decision, note: reason.slice(0, 1000) } : { decision }),
  });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return r.res.ok ? { ok: true } : { ok: false, message: deskRefusal(r.res.status, r.body, "The decision wasn't saved") };
}

/** A five-minute link to one of the new guardian's documents. The API records the view. */
export async function handoffDocumentAction(id: string, documentId: string): Promise<DocumentLink> {
  if (typeof id !== "string" || !ID.test(id) || typeof documentId !== "string" || !ID.test(documentId)) return { ok: false, message: "Unknown document." };
  const r = await call(`/guardian-handoffs/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);
  if (!r) return { ok: false, message: "The API is unreachable. Try again in a minute." };
  if (!r.res.ok) return { ok: false, message: deskRefusal(r.res.status, r.body, "The document couldn't be opened") };
  const d = r.body as { url?: unknown; expiresInSeconds?: unknown } | null;
  return { ok: true, url: String(d?.url ?? ""), expiresInSeconds: Number(d?.expiresInSeconds ?? 300) };
}
