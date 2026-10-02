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

/* --------------------------------------------------------------------------
   2S4-FE-05 — the seller's answers, for the athlete's and the team's pages:

     POST /seller-approvals/:id/decision  { decision: ACCEPT | DECLINE, reason? }
                                          within 48 hours; a decline's reason
                                          is read by the sponsor (2S4-BE-09)
     POST /sales/:lineId/problem-answer   { answer: DELIVER_AGAIN, newDate, note }
                                          | { answer: REFUND, note? }
                                          | { answer: DISAGREE, note, proofKey?, proofLink? }
                                          within 72 hours of the problem (2S4-BE-11)
   -------------------------------------------------------------------------- */

function revalidateSales(lineId?: string) {
  for (const base of ["/athlete/sales", "/property/sales"]) {
    revalidatePath(base);
    if (lineId) revalidatePath(`${base}/${lineId}`);
  }
}

export async function decideSellerApprovalAction(id: string, decision: "ACCEPT" | "DECLINE", reason?: string): Promise<SaleWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown order." };
  if (decision !== "ACCEPT" && decision !== "DECLINE") return { ok: false, message: "Accept or decline." };
  const why = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (decision === "DECLINE" && !why) return { ok: false, message: "Write a reason — the sponsor reads it." };
  const r = await post(`/seller-approvals/${encodeURIComponent(id)}/decision`, decision === "DECLINE" ? { decision, reason: why } : { decision });
  if (!r) return { ok: false, message: unreachable };
  revalidateSales();
  for (const base of ["/athlete/sales", "/property/sales"]) revalidatePath(`${base}/approvals/${id}`);
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "Your answer wasn't saved") };
  return { ok: true };
}

/* --------------------------------------------------------------------------
   2S4-FE-06 / 2S4-BE-12 — cancelling a sold line, the seller's side:

     POST /sales/:lineId/cancel               { reason } — a line the seller
                                              can't deliver; the sponsor is
                                              refunded at once
     POST /sales/:lineId/cancellation-answer  { decision: ACCEPT, reason? }
                                              | { decision: DECLINE, reason }
                                              — the sponsor's request to cancel,
                                              before its deadline; a no goes to BTG
   -------------------------------------------------------------------------- */

export async function sellerCancelAction(lineId: string, reason: string): Promise<SaleWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const text = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (!text) return { ok: false, message: "Say why you can't deliver it — the sponsor reads this." };
  const r = await post(`/sales/${encodeURIComponent(lineId)}/cancel`, { reason: text });
  if (!r) return { ok: false, message: unreachable };
  revalidateSales(lineId);
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "The line wasn't cancelled") };
  return { ok: true };
}

export async function answerCancellationAction(lineId: string, decision: "ACCEPT" | "DECLINE", reason?: string): Promise<SaleWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  if (decision !== "ACCEPT" && decision !== "DECLINE") return { ok: false, message: "Agree to cancel, or keep it." };
  const text = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (decision === "DECLINE" && !text) return { ok: false, message: "Say why you can't cancel it — the sponsor reads this, and BTG decides." };
  const r = await post(`/sales/${encodeURIComponent(lineId)}/cancellation-answer`, text ? { decision, reason: text } : { decision });
  if (!r) return { ok: false, message: unreachable };
  revalidateSales(lineId);
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "Your answer wasn't sent") };
  return { ok: true };
}

export type ProblemAnswer =
  | { answer: "DELIVER_AGAIN"; newDate: string; note: string }
  | { answer: "REFUND"; note?: string | null }
  | { answer: "DISAGREE"; note: string; proofKey?: string | null; proofLink?: string | null };

export async function answerProblemAction(lineId: string, input: ProblemAnswer): Promise<SaleWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const note = typeof input?.note === "string" ? input.note.trim().slice(0, 2000) : "";
  let body: Record<string, unknown>;
  if (input?.answer === "DELIVER_AGAIN") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDate ?? "")) return { ok: false, message: "Pick the new date you'll deliver on." };
    if (!note) return { ok: false, message: "Add a note — say what you'll do this time." };
    body = { answer: "DELIVER_AGAIN", newDate: input.newDate, note };
  } else if (input?.answer === "REFUND") {
    body = { answer: "REFUND", ...(note ? { note } : {}) };
  } else if (input?.answer === "DISAGREE") {
    if (!note) return { ok: false, message: "Say what happened — the sponsor reads it, and BTG if it comes to them." };
    const link = typeof input.proofLink === "string" ? input.proofLink.trim() : "";
    const bad = linkProblem(link);
    if (bad) return { ok: false, message: bad };
    body = { answer: "DISAGREE", note, ...(input.proofKey ? { proofKey: input.proofKey } : {}), ...(link ? { proofLink: link } : {}) };
  } else {
    return { ok: false, message: "Choose how to answer." };
  }
  const r = await post(`/sales/${encodeURIComponent(lineId)}/problem-answer`, body);
  if (!r) return { ok: false, message: unreachable };
  revalidateSales(lineId);
  if (!r.res.ok) return { ok: false, message: apiRefusal(r.res.status, r.json, "Your answer wasn't sent") };
  return { ok: true };
}
