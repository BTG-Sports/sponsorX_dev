"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { apiFetch } from "@/server/api";
import { edgeHeadersFrom } from "@/server/edge";
import { canonicaliseAgreementBody } from "@/lib/order-live";
import { acceptRefusal, type AcceptOutcome } from "@/lib/athlete-order-pause";
import { dealDisputeRefusal, type ApiDealDisputeGrant, type ApiErrorBody } from "@/lib/deal-disputes-live";

/* --------------------------------------------------------------------------
   P5-FE-01 — accepting a Campaign Order, as a server action.

   The client hands back the EXACT agreement body it rendered; this hashes it
   (the backend's canonicalisation, pinned by test) and sends the fingerprint
   as `bodyHashShown`. The API compares it with the issued version inside the
   acceptance transaction, checks §37's guardian gate, writes the acceptance,
   moves the order to ACCEPTED and creates its deliverables and earning — all
   or nothing. This adds no authority: the athlete's own token, own scope.

   Evidence (§12): the browser's address and user-agent are forwarded on the
   edge-keyed headers, so the acceptance records the signer, not this server.

   P8-FE-06 — a 409 is no longer always "reload": a paused deal (deal_paused)
   has nothing to retry, and an owed confirmation (rules_attestation_required,
   collab_agreement_required) has a page to go to. The two document actions
   below are the athlete's (or the guardian's, acting for a minor) answer to
   a pause: ask the API for a private PUT, the browser sends the file, then
   confirm it arrived.
   -------------------------------------------------------------------------- */

export async function acceptOrderAction(
  orderId: string,
  agreementId: string,
  bodyShown: string,
): Promise<AcceptOutcome> {
  if (![orderId, agreementId, bodyShown].every((v) => typeof v === "string" && v.length > 0)) {
    return { ok: false, message: "Nothing to accept." };
  }
  const bodyHashShown =
    "sha256:" + createHash("sha256").update(canonicaliseAgreementBody(bodyShown), "utf8").digest("hex");

  let res: Response;
  try {
    res = await apiFetch(`/orders/${encodeURIComponent(orderId)}/accept`, {
      method: "POST",
      body: JSON.stringify({ agreementId, bodyHashShown }),
      headers: edgeHeadersFrom(await headers(), { signer: true }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was accepted. Try again in a minute." };
  }

  if (res.ok) {
    const d = (await res.json()) as { state: string };
    return { ok: true, state: d.state };
  }
  const fallback = `Your acceptance was not recorded (HTTP ${res.status}).`;
  const body = await errorBody(res);
  /* The API's validation issues read better than its summary line. */
  const issue = body?.error?.issues?.[0]?.message;
  return acceptRefusal(res.status, issue ? { error: { ...body?.error, message: issue } } : body, orderId, fallback);
}

/* ------------------------------------------------------ dispute documents */

type Grant = { ok: true; id: string; uploadUrl: string; contentType: string } | { ok: false; message: string };
type Done = { ok: true } | { ok: false; message: string };

const ID = /^[A-Za-z0-9_-]{1,120}$/;
const validId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

type ErrorBody = (ApiErrorBody & { error?: { issues?: Array<{ message: string }> } }) | null;

async function errorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return null;
  }
}

/** Step one: tell the API what is about to be sent; it answers with a private-bucket PUT for exactly that file. */
export async function requestDisputeUploadAction(
  disputeId: string,
  file: { filename: string; contentType: string; bytes: number },
): Promise<Grant> {
  if (!validId(disputeId)) return { ok: false, message: "Nothing to send this for." };
  const filename = typeof file?.filename === "string" ? file.filename.trim().slice(0, 200) : "";
  const contentType = typeof file?.contentType === "string" ? file.contentType : "";
  const bytes = file?.bytes;
  if (!filename || !contentType || !Number.isInteger(bytes) || bytes < 1) {
    return { ok: false, message: "That file can't be sent. Choose a PDF, JPEG, PNG or WebP." };
  }
  let res: Response;
  try {
    res = await apiFetch(`/deal-disputes/${encodeURIComponent(disputeId)}/documents`, {
      method: "POST",
      body: JSON.stringify({ filename, contentType, bytes }),
    });
  } catch {
    return { ok: false, message: "Couldn't reach SponsorX just now. Nothing was sent — try again." };
  }
  if (!res.ok) {
    return { ok: false, message: dealDisputeRefusal(res.status, await errorBody(res), `Couldn't start the upload (HTTP ${res.status}).`) };
  }
  const g = (await res.json()) as ApiDealDisputeGrant;
  return { ok: true, id: g.document.id, uploadUrl: g.uploadUrl, contentType: g.contentType };
}

/** Step two: it counts only once it is really in the bucket. */
export async function confirmDisputeUploadAction(disputeId: string, documentId: string): Promise<Done> {
  if (!validId(disputeId) || !validId(documentId)) return { ok: false, message: "Nothing to confirm." };
  let res: Response;
  try {
    res = await apiFetch(
      `/deal-disputes/${encodeURIComponent(disputeId)}/documents/${encodeURIComponent(documentId)}/confirm`,
      { method: "POST" },
    );
  } catch {
    return { ok: false, message: "Couldn't reach SponsorX just now. Use Check again in a moment." };
  }
  if (!res.ok) {
    return { ok: false, message: dealDisputeRefusal(res.status, await errorBody(res), `The upload isn't confirmed yet (HTTP ${res.status}).`) };
  }
  revalidatePath("/athlete/orders/[id]", "page");
  return { ok: true };
}
