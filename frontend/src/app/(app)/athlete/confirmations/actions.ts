"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { CONFIRMATIONS_PATH } from "@/lib/confirmations-live";
import { refusalResult, type ConfirmResult } from "@/lib/athlete-confirmations";
import { apiFetch } from "@/server/api";
import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   P8-FE-04 / P8-FE-07 — confirming from the portal, as server actions.

     POST /me/rules-attestation { version }                   P8-BE-02
     POST /agreements/accept { agreementId, bodyHashShown }   P8-BE-04

   The athlete's own token, own scope; a guardian's ward header rides along
   in apiFetch. The browser's address and user-agent are forwarded on the
   edge-keyed headers (§12), so the record names the signer, not this
   server. Every refusal comes back as a value the form can show; the page
   is re-read after any answer the API gave.
   -------------------------------------------------------------------------- */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function post(path: string, body: Record<string, string>): Promise<Response | null> {
  try {
    return await apiFetch(path, { method: "POST", body: JSON.stringify(body), headers: edgeHeadersFrom(await headers(), { signer: true }) });
  } catch {
    return null;
  }
}

async function errorBody(res: Response): Promise<{ error?: { code?: string; message?: string } } | null> {
  try {
    return (await res.json()) as { error?: { code?: string; message?: string } };
  } catch {
    return null;
  }
}

function reread() {
  revalidatePath("/athlete");
  revalidatePath(CONFIRMATIONS_PATH);
}

export async function confirmRulesAction(version: string): Promise<ConfirmResult> {
  if (typeof version !== "string" || version.trim().length === 0 || version.length > 64) {
    return { ok: false, message: "Nothing to confirm." };
  }
  const res = await post("/me/rules-attestation", { version: version.trim() });
  if (!res) return { ok: false, message: "The API is unreachable — nothing was recorded. Try again in a minute." };
  reread();
  if (res.ok) return { ok: true };
  return refusalResult("rules", res.status, await errorBody(res), `Your confirmation was not recorded (HTTP ${res.status}).`);
}

export async function acceptCollabAction(agreementId: string, bodyHash: string): Promise<ConfirmResult> {
  if (typeof agreementId !== "string" || !ID.test(agreementId) || typeof bodyHash !== "string" || bodyHash.length === 0 || bodyHash.length > 128) {
    return { ok: false, message: "Nothing to accept." };
  }
  const res = await post("/agreements/accept", { agreementId, bodyHashShown: bodyHash });
  if (!res) return { ok: false, message: "The API is unreachable — nothing was recorded. Try again in a minute." };
  reread();
  if (res.ok) return { ok: true };
  return refusalResult("collab", res.status, await errorBody(res), `Your acceptance was not recorded (HTTP ${res.status}).`);
}
