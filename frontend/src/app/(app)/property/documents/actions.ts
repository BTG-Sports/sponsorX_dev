"use server";

import { revalidatePath } from "next/cache";

import { refusalMessage } from "@/lib/onboarding-live";
import type { ApiOrgDocuments } from "@/lib/org-documents-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-04 (documents half) — the Documents page's writes, on 2S1-BE-07.

     grant    POST   /property/documents {kind, stateCode?, replacesId?, filename, contentType, bytes, expiresOn?}
              → a private-bucket PUT URL; the browser sends the bytes there itself
     confirm  POST   /property/documents/:documentId/confirm   → the new list
     remove   DELETE /property/documents/:documentId           → the new list

   The API decides everything — only the organization's own manager, the
   size and type limits, a replacement of the same kind — and these turn
   its refusals into words. The bytes never pass through here.
   -------------------------------------------------------------------------- */

const PATH = "/property/documents";

export type DocsFailure = { ok: false; message: string };
export type GrantResult = { ok: true; documentId: string; uploadUrl: string; contentType: string } | DocsFailure;
export type ListResult = { ok: true; data: ApiOrgDocuments } | DocsFailure;

const UNREACHABLE: DocsFailure = { ok: false, message: "We couldn't reach SponsorX — nothing changed. Try again in a minute." };

async function failure(res: Response): Promise<DocsFailure> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  const said = refusalMessage(body);
  if (res.status === 403) return { ok: false, message: "Only your organization's manager can change its documents." };
  if (res.status >= 500) return { ok: false, message: "Something went wrong on our side — nothing changed. Try again in a minute." };
  return { ok: false, message: said ?? "That was refused. Reload the page and try again." };
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);

export async function requestOrgUploadAction(input: {
  kind: string; filename: string; contentType: string; bytes: number;
  stateCode?: string | null; replacesId?: string | null; expiresOn?: string | null;
}): Promise<GrantResult> {
  if (!input || typeof input.filename !== "string" || !input.filename.trim()) return { ok: false, message: "Pick a file first." };
  const stateCode = typeof input.stateCode === "string" && /^[A-Z]{2}$/.test(input.stateCode) ? input.stateCode : null;
  const expiresOn = typeof input.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) ? input.expiresOn : null;
  let res: Response;
  try {
    res = await apiFetch(PATH, {
      method: "POST",
      body: JSON.stringify({
        kind: input.kind, filename: input.filename.slice(0, 200), contentType: input.contentType, bytes: input.bytes,
        ...(stateCode ? { stateCode } : {}), ...(expiresOn ? { expiresOn } : {}), ...(isId(input.replacesId) ? { replacesId: input.replacesId } : {}),
      }),
    });
  } catch {
    return UNREACHABLE;
  }
  if (res.status !== 201) return failure(res);
  const g = (await res.json()) as { document: { id: string }; uploadUrl: string; contentType: string };
  return { ok: true, documentId: g.document.id, uploadUrl: g.uploadUrl, contentType: g.contentType };
}

export async function confirmOrgUploadAction(documentId: string): Promise<ListResult> {
  if (!isId(documentId)) return { ok: false, message: "Unknown document." };
  let res: Response;
  try {
    res = await apiFetch(`${PATH}/${encodeURIComponent(documentId)}/confirm`, { method: "POST" });
  } catch {
    return UNREACHABLE;
  }
  if (!res.ok) return failure(res);
  revalidatePath(PATH);
  return { ok: true, data: (await res.json()) as ApiOrgDocuments };
}

export async function removeOrgDocumentAction(documentId: string): Promise<ListResult> {
  if (!isId(documentId)) return { ok: false, message: "Unknown document." };
  let res: Response;
  try {
    res = await apiFetch(`${PATH}/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  } catch {
    return UNREACHABLE;
  }
  if (!res.ok) return failure(res);
  revalidatePath(PATH);
  return { ok: true, data: (await res.json()) as ApiOrgDocuments };
}
