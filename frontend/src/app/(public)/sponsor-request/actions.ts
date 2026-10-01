"use server";

import { refusalMessage } from "@/lib/onboarding-live";
import type { ApiSponsorDocument, ApiSponsorRequestStatus } from "@/lib/sponsor-request-live";
import { publicApi } from "../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — the proof-of-business upload's server actions.
   Public: no login, the requestToken POST /public/inquiries handed this
   browser is the only key (2S1-BE-17).

     request  POST /public/sponsor-requests/:token/documents                 → a private-bucket PUT URL
     confirm  POST /public/sponsor-requests/:token/documents/:documentId/confirm → the request's status

   The file itself never comes through here: the browser PUTs it straight to
   the URL the API signed (onboarding-wizard.tsx's pattern). These only
   forward, and turn refusals into copy. Every export of a "use server" file
   is a callable endpoint, so the arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type Refusal = { ok: false; status: number; message: string };
export type ProofGrant = { ok: true; document: ApiSponsorDocument; uploadUrl: string; contentType: string } | Refusal;
export type StatusResult = { ok: true; status: ApiSponsorRequestStatus } | Refusal;

const UNREACHABLE: Refusal = {
  ok: false,
  status: 0,
  message: "We couldn't reach SponsorX. Nothing was lost — check your connection and try again.",
};

const tokenPath = (token: string) => `/public/sponsor-requests/${encodeURIComponent(token)}`;

async function refusal(res: Response): Promise<Refusal> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  const said = refusalMessage(body);
  const message =
    res.status === 429
      ? "That's a lot of uploads from this connection. Wait a few minutes, then try again."
      : res.status === 400 && !said
        ? "This link is not valid. Send the form again to start over."
        : res.status >= 500
          ? "Something went wrong on our side. Try again in a minute."
          : said ?? "The upload wasn't accepted. Try the file again.";
  return { ok: false, status: res.status, message };
}

async function call(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await publicApi(path, init);
  } catch {
    return null;
  }
}

/** Step one: the API records the document and hands back a PUT URL for exactly this file. */
export async function requestProofUploadAction(
  token: string,
  input: { filename: string; contentType: string; bytes: number },
): Promise<ProofGrant> {
  if (typeof token !== "string" || !token || !input || typeof input !== "object") {
    return { ok: false, status: 400, message: "Pick a file first." };
  }
  const res = await call(`${tokenPath(token)}/documents`, {
    method: "POST",
    body: JSON.stringify({ filename: input.filename, contentType: input.contentType, bytes: input.bytes }),
  });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) return refusal(res);
  const d = (await res.json()) as { document: ApiSponsorDocument; uploadUrl: string; contentType: string };
  return { ok: true, document: d.document, uploadUrl: d.uploadUrl, contentType: d.contentType };
}

/** Step two: the file is in the bucket — the API checks it, counts it, and runs the approval checks. */
export async function confirmProofUploadAction(token: string, documentId: string): Promise<StatusResult> {
  if (typeof token !== "string" || !token || typeof documentId !== "string" || !documentId) {
    return { ok: false, status: 400, message: "Unknown document." };
  }
  const res = await call(`${tokenPath(token)}/documents/${encodeURIComponent(documentId)}/confirm`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true, status: (await res.json()) as ApiSponsorRequestStatus };
}
