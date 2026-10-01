"use server";

import { revalidatePath } from "next/cache";

import type { BrandCategory } from "@/lib/brand-categories";
import { requestRefusal, type RequestWriteFailure } from "@/lib/sponsor-requests-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-03 — BTG's decision on a sponsor request (BTG admin and Sales; the
   API applies the matrix, records the reviewer and sends the email):

     POST /sponsor-requests/:id/decision
       APPROVE {categories, linkSponsorId?, newSponsor?} — opens the account
       DECLINE {note}                                    — emails the note
       REJECT {note}      — an approved account: its logins off, the reason emailed
       REINSTATE          — a rejected account: its logins back on, emailed
     GET  /sponsor-requests/:id/documents/:documentId — a five-minute,
       audited link to one proof of business
   -------------------------------------------------------------------------- */

export type DecisionInput =
  | { decision: "APPROVE"; categories: BrandCategory[]; linkSponsorId?: string | null; newSponsor?: boolean }
  | { decision: "DECLINE"; note: string }
  | { decision: "REJECT"; note: string }
  | { decision: "REINSTATE" };

export async function decideSponsorRequestAction(id: string, input: DecisionInput): Promise<{ ok: true; state: string } | RequestWriteFailure> {
  let res: Response;
  try {
    res = await apiFetch(`/sponsor-requests/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(input) });
  } catch {
    return { ok: false, status: 0, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  revalidatePath("/admin/sponsor-requests");
  revalidatePath(`/admin/sponsor-requests/${id}`);
  /* A Reject or Reinstate opens or ends the sponsor's closure on the Closed accounts desk. */
  if (input.decision === "REJECT" || input.decision === "REINSTATE") revalidatePath("/admin/closed-accounts", "layout");
  if (!res.ok) return requestRefusal(res.status, body);
  return { ok: true, state: String((body as { state?: unknown } | null)?.state ?? "") };
}

export type ViewDocumentResult = { ok: true; url: string; expiresInSeconds: number } | RequestWriteFailure;

/**
 * Open one proof of business: the API signs a five-minute read of the
 * private bucket and records the view against this reviewer. Asked for only
 * when BTG clicks, so no page load mints links nobody opens.
 */
export async function viewSponsorDocumentAction(id: string, documentId: string): Promise<ViewDocumentResult> {
  const ok = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);
  if (!ok(id) || !ok(documentId)) return { ok: false, status: 400, message: "Unknown document." };
  let res: Response;
  try {
    res = await apiFetch(`/sponsor-requests/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);
  } catch {
    return { ok: false, status: 0, message: "The API is unreachable — try again in a minute." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) return requestRefusal(res.status, body);
  return { ok: true, ...(body as { url: string; expiresInSeconds: number }) };
}
