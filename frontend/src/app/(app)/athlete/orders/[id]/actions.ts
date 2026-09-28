"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { apiFetch } from "@/server/api";
import { edgeHeadersFrom } from "@/server/edge";
import { canonicaliseAgreementBody, type AcceptResult } from "@/lib/order-live";

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
   -------------------------------------------------------------------------- */

export async function acceptOrderAction(
  orderId: string,
  agreementId: string,
  bodyShown: string,
): Promise<AcceptResult> {
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
  let message = `Your acceptance was not recorded (HTTP ${res.status}).`;
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    message = e.error?.issues?.[0]?.message ?? e.error?.message ?? message;
  } catch {
    /* keep the status-line message */
  }
  /* 409 is either "the text changed since you read it" or "already
     answered" — both are cured by reloading what's true now. */
  return { ok: false, message, reload: res.status === 409 };
}
