"use server";

import { revalidatePath } from "next/cache";

import { openDisputeBody, openDisputeRefusal, resolveNoteProblem, type OpenDisputeForm } from "@/lib/deal-dispute-desk";
import { dealDisputeRefusal, type ApiDealDispute, type ApiDealDisputeLink } from "@/lib/deal-disputes-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   P8-FE-05 — BTG's writes on the deal dispute desk (P8-BE-03). The API
   applies the matrix (BTG admin and SUPER_ADMIN write; campaign managers
   and Finance read) and refuses in its own words; these add no authority.

     POST /orders/:id/disputes { source, sourceName?, reason, documentsRequested }   201 the view
     POST /deal-disputes/:id/resolve { outcome: RESUME|CANCEL, note }                200 the view
     GET  /deal-disputes/:id/documents/:documentId                                   { url, expiresInSeconds }

   Every export of a "use server" file is a callable endpoint, so the
   arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type OpenResult = { ok: true; id: string } | { ok: false; message: string };
export type DeskWrite = { ok: true } | { ok: false; message: string };
export type DocumentLink =
  | { ok: true; url: string; expiresInSeconds: number; contentType: string; filename: string }
  | { ok: false; message: string };

const LIST = "/admin/deal-disputes";
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

/** Every page that joins the dispute list: the desk, the campaign board's roster, and the two earnings views. */
function revalidateJoins(id?: string) {
  revalidatePath(LIST);
  if (id) revalidatePath(`${LIST}/${id}`);
  revalidatePath("/admin/campaigns/[id]", "page");
  revalidatePath("/admin/finance");
  revalidatePath("/finance");
}

/** Pause an order over a concern: who raised it, what it is, what to send. */
export async function openDealDisputeAction(orderId: string, form: OpenDisputeForm): Promise<OpenResult> {
  if (typeof orderId !== "string" || !ID.test(orderId.trim())) return { ok: false, message: "That doesn't look like an order id." };
  const checked = openDisputeBody(form);
  if (!checked.ok) return checked;
  const r = await call(`/orders/${encodeURIComponent(orderId.trim())}/disputes`, { method: "POST", body: JSON.stringify(checked.body) });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) {
    return { ok: false, message: openDisputeRefusal(r.res.status, r.body as Parameters<typeof dealDisputeRefusal>[1], "The dispute wasn't opened") };
  }
  const view = r.body as Partial<ApiDealDispute> | null;
  const id = typeof view?.id === "string" ? view.id : "";
  revalidateJoins(id || undefined);
  return id ? { ok: true, id } : { ok: false, message: "The dispute was opened, but the API sent no id back. Find it in the list." };
}

/** Resume or cancel the deal, with the note the athlete reads. */
export async function resolveDealDisputeAction(id: string, outcome: "RESUME" | "CANCEL", note: string): Promise<DeskWrite> {
  if (typeof id !== "string" || !ID.test(id)) return { ok: false, message: "Unknown dispute." };
  if (outcome !== "RESUME" && outcome !== "CANCEL") return { ok: false, message: "Choose resume or cancel." };
  const problem = resolveNoteProblem(note);
  if (problem) return { ok: false, message: problem };
  const r = await call(`/deal-disputes/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify({ outcome, note: note.trim() }) });
  if (!r) return { ok: false, message: unreachable };
  revalidateJoins(id);
  return r.res.ok
    ? { ok: true }
    : { ok: false, message: dealDisputeRefusal(r.res.status, r.body as Parameters<typeof dealDisputeRefusal>[1], "It wasn't decided") };
}

/** A five-minute link to one of the documents. The API records the view; BTG admin only. */
export async function getDealDisputeDocumentAction(id: string, documentId: string): Promise<DocumentLink> {
  if (typeof id !== "string" || !ID.test(id) || typeof documentId !== "string" || !ID.test(documentId)) return { ok: false, message: "Unknown document." };
  const r = await call(`/deal-disputes/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);
  if (!r) return { ok: false, message: "The API is unreachable. Try again in a minute." };
  if (!r.res.ok) {
    if (r.res.status === 403) return { ok: false, message: "Only a BTG admin can open these documents." };
    return { ok: false, message: dealDisputeRefusal(r.res.status, r.body as Parameters<typeof dealDisputeRefusal>[1], "The document couldn't be opened") };
  }
  const link = r.body as Partial<ApiDealDisputeLink> | null;
  const url = typeof link?.url === "string" ? link.url : "";
  if (!url) return { ok: false, message: "The API sent no link back. Try again." };
  return {
    ok: true,
    url,
    expiresInSeconds: typeof link?.expiresInSeconds === "number" ? link.expiresInSeconds : 300,
    contentType: typeof link?.contentType === "string" ? link.contentType : "",
    filename: typeof link?.filename === "string" ? link.filename : "",
  };
}
