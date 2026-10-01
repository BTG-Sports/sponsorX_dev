"use server";

import { revalidatePath } from "next/cache";

import { refusalWords } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-07 — BTG's acts on an athlete's or guardian's sign-up (2S1-BE-09 /
   -10). The API checks the role (BTG, tenant-wide), records who acted and
   sends the emails:

     POST /signups/athletes/:id/approve                 a held sign-up, approved by BTG
     POST /signups/{athletes|guardians}/:id/reject      {note} — emailed exactly as written
     POST /signups/{athletes|guardians}/:id/reinstate
     GET  /signups/{athletes|guardians}/:id/documents/:documentId   a 5-minute audited link

   Every export of a "use server" file is a callable endpoint, so the
   arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type SignupActionResult = { ok: true } | { ok: false; message: string };
export type DocumentLinkResult = { ok: true; url: string; expiresInSeconds: number } | { ok: false; message: string };

type Owner = "athletes" | "guardians";
const OWNERS: readonly Owner[] = ["athletes", "guardians"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function body(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function signupDecisionAction(owner: Owner, id: string, decision: "approve" | "reject" | "reinstate", note?: string): Promise<SignupActionResult> {
  if (!OWNERS.includes(owner) || !ID.test(id) || !["approve", "reject", "reinstate"].includes(decision)) return { ok: false, message: "Unknown sign-up." };
  if (decision === "approve" && owner !== "athletes") return { ok: false, message: "Only an athlete's sign-up is approved here." };
  if (decision === "reject" && !(typeof note === "string" && note.trim())) return { ok: false, message: "Write the reason — it's emailed to them." };
  let res: Response;
  try {
    res = await apiFetch(`/signups/${owner}/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      body: JSON.stringify(decision === "reject" ? { note: note!.trim().slice(0, 2000) } : {}),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  const b = await body(res);
  revalidatePath("/admin/new-signups");
  revalidatePath(`/admin/new-signups/${owner}/${id}`);
  return res.ok ? { ok: true } : { ok: false, message: refusalWords(b, res.status) };
}

/** A five-minute link to one document. The API records the view. */
export async function signupDocumentAction(owner: Owner, id: string, documentId: string): Promise<DocumentLinkResult> {
  if (!OWNERS.includes(owner) || !ID.test(id) || !ID.test(documentId)) return { ok: false, message: "Unknown document." };
  let res: Response;
  try {
    res = await apiFetch(`/signups/${owner}/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);
  } catch {
    return { ok: false, message: "The API is unreachable. Try again in a minute." };
  }
  const b = await body(res);
  if (!res.ok) return { ok: false, message: refusalWords(b, res.status) };
  const d = b as { url: string; expiresInSeconds: number };
  return { ok: true, url: d.url, expiresInSeconds: d.expiresInSeconds };
}
