"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { apiFetch } from "@/server/api";
import { edgeHeadersFrom } from "@/server/edge";
import { canonicaliseAgreementBody } from "@/lib/order-live";
import {
  changeNoteProblem,
  explainOfferRefusal,
  latestChangeRequest,
  type ApiOffer,
  type RespondResult,
} from "@/lib/offer-live";

/* --------------------------------------------------------------------------
   2S2-FE-03 — accepting or declining a formal offer, as server actions.

   POST /offers/:id/respond. ACCEPT carries the terms hash the athlete was
   shown (offer.termsHash) and the Campaign Order agreement they read: its
   id and a fingerprint of the EXACT body rendered, hashed here with the
   backend's canonicalisation (the same as the Phase 1 order accept —
   ../../orders/[id]/actions.ts). The API checks both inside one
   transaction, plus the guardian gate, restrictions and availability,
   then creates the Campaign Order, its deliverables and the earning.

   Evidence (§12): the browser's address and user-agent are forwarded on
   the edge-keyed headers, so the acceptance records the signer, not this
   server. No authority is added — the athlete's own token, own scope.

   REQUEST_CHANGE carries the athlete's note. The offer stays SENT; the API
   records and audits the request and emails the campaign manager(s), and
   runs the same guardian gate as ACCEPT for a minor.
   -------------------------------------------------------------------------- */

async function respond(id: string, body: Record<string, unknown>, signer: boolean): Promise<RespondResult> {
  let res: Response;
  try {
    res = await apiFetch(`/offers/${encodeURIComponent(id)}/respond`, {
      method: "POST",
      body: JSON.stringify(body),
      ...(signer ? { headers: edgeHeadersFrom(await headers(), { signer: true }) } : {}),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was recorded. Try again in a minute." };
  }
  if (res.ok) {
    const o = (await res.json()) as Pick<ApiOffer, "state" | "orderId" | "changeRequests">;
    revalidatePath("/athlete/offers", "layout");
    return { ok: true, state: o.state, orderId: o.orderId ?? null, changeRequest: latestChangeRequest(o) };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* keep the status-line message */
  }
  return { ok: false, ...explainOfferRefusal(res.status, parsed) };
}

export async function acceptOfferAction(
  offerId: string,
  termsHashShown: string,
  agreementId: string,
  bodyShown: string,
): Promise<RespondResult> {
  if (![offerId, termsHashShown, agreementId, bodyShown].every((v) => typeof v === "string" && v.length > 0)) {
    return { ok: false, message: "Nothing to accept." };
  }
  const bodyHashShown =
    "sha256:" + createHash("sha256").update(canonicaliseAgreementBody(bodyShown), "utf8").digest("hex");
  return respond(offerId, { decision: "ACCEPT", termsHashShown, agreementId, bodyHashShown }, true);
}

export async function declineOfferAction(offerId: string): Promise<RespondResult> {
  if (typeof offerId !== "string" || !offerId) return { ok: false, message: "Unknown offer." };
  return respond(offerId, { decision: "DECLINE" }, false);
}

export async function requestOfferChangeAction(offerId: string, note: string): Promise<RespondResult> {
  if (typeof offerId !== "string" || !offerId) return { ok: false, message: "Unknown offer." };
  if (typeof note !== "string") return { ok: false, message: "Say what you'd like changed." };
  const problem = changeNoteProblem(note);
  if (problem) return { ok: false, message: problem };
  return respond(offerId, { decision: "REQUEST_CHANGE", note: note.trim() }, false);
}
