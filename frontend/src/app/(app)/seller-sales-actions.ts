"use server";

import { revalidatePath } from "next/cache";

import { apiRefusal, linkProblem, PROOF_MAX_BYTES, PROOF_TYPES } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S4-FE-04 (seller half) — marking a sold line delivered, as server
   actions, for the athlete's and the team's Orders pages alike:

     POST /sales/:lineId/proof      { contentType, bytes } → a presigned PUT;
                                    the browser sends the photo straight to
                                    the private bucket, never through here
     POST /sales/:lineId/delivered  { note, proofKey?, proofLink? }

   The API decides (orderDelivery: the team's manager or the athlete whose
   item it is, only while the line is in delivery); these add no authority.
   -------------------------------------------------------------------------- */

export type SaleWrite = { ok: true } | { ok: false; message: string };
export type ProofGrant = { ok: true; uploadUrl: string; key: string; contentType: string } | { ok: false; message: string };

const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";

async function post(path: string, body: unknown): Promise<{ res: Response; json: unknown } | null> {
  try {
    const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    return { res, json };
  } catch {
    return null;
  }
}

export async function requestProofUploadAction(lineId: string, file: { contentType: string; bytes: number }): Promise<ProofGrant> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  if (!(PROOF_TYPES as readonly string[]).includes(file.contentType)) return { ok: false, message: "A photo (JPEG or PNG) or a PDF." };
  if (!(file.bytes > 0 && file.bytes <= PROOF_MAX_BYTES)) return { ok: false, message: "Up to 10 MB." };
  const r = await post(`/sales/${encodeURIComponent(lineId)}/proof`, file);
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "The photo couldn't be prepared") };
  const g = r.json as { uploadUrl: string; key: string; contentType: string };
  return { ok: true, uploadUrl: g.uploadUrl, key: g.key, contentType: g.contentType };
}

export async function markDeliveredAction(lineId: string, input: { note: string; proofKey?: string | null; proofLink?: string | null }): Promise<SaleWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if (!note) return { ok: false, message: "Say what was delivered — the sponsor reads this note." };
  const link = typeof input.proofLink === "string" ? input.proofLink.trim() : "";
  const bad = linkProblem(link);
  if (bad) return { ok: false, message: bad };
  const r = await post(`/sales/${encodeURIComponent(lineId)}/delivered`, {
    note: note.slice(0, 2000),
    ...(input.proofKey ? { proofKey: input.proofKey } : {}),
    ...(link ? { proofLink: link } : {}),
  });
  if (!r) return { ok: false, message: unreachable };
  for (const base of ["/athlete/sales", "/property/sales"]) {
    revalidatePath(base);
    revalidatePath(`${base}/${lineId}`);
  }
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "It wasn't marked delivered") };
  return { ok: true };
}
