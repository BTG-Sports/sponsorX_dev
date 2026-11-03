"use server";

import { refusalMessage } from "@/lib/onboarding-live";
import {
  emailFixRefusal,
  looksLikeEmail,
  SPONSORX_UNREACHABLE,
  type ApiEmailSent,
  type ApiSponsorDocument,
  type ApiSponsorRequestStatus,
} from "@/lib/sponsor-request-live";
import { publicApi } from "../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — the proof-of-business upload's server actions.
   Public: no login, the requestToken POST /public/inquiries handed this
   browser is the only key (2S1-BE-17).

     request  POST /public/sponsor-requests/:token/documents                 → a private-bucket PUT URL
     confirm  POST /public/sponsor-requests/:token/documents/:documentId/confirm → the request's status

   POL-FE-18 — the status page's "Resend email" and "Change email"
   (sponsor-email-fix.tsx), against POL-BE-18:

     resend   POST /public/sponsor-requests/:token/resend-confirmation       → 202 { sent, email }
     change   POST /public/sponsor-requests/:token/email {email}             → 200 { sent, email }

   The file itself never comes through here: the browser PUTs it straight to
   the URL the API signed (onboarding-wizard.tsx's pattern). These only
   forward, and turn refusals into copy. Every export of a "use server" file
   is a callable endpoint, so the arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type Refusal = { ok: false; status: number; message: string };
export type ProofGrant = { ok: true; document: ApiSponsorDocument; uploadUrl: string; contentType: string } | Refusal;
export type StatusResult = { ok: true; status: ApiSponsorRequestStatus } | Refusal;
export type EmailSentResult = { ok: true; email: string } | Refusal;

const UNREACHABLE: Refusal = { ok: false, status: 0, message: SPONSORX_UNREACHABLE };

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

/* ── POL-FE-18: the confirmation email ────────────────────────────────── */

/** A refused resend or change, in the island's words (emailFixRefusal); the API's own 409 message is kept. */
async function emailRefusal(res: Response): Promise<Refusal> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { ok: false, status: res.status, message: emailFixRefusal(res.status, refusalMessage(body)) };
}

/** "Resend email": a fresh confirmation link to the address on file. 3 an hour per request, and per network address. */
export async function resendConfirmationAction(token: string): Promise<EmailSentResult> {
  if (typeof token !== "string" || !token) return { ok: false, status: 400, message: emailFixRefusal(404) };
  const res = await call(`${tokenPath(token)}/resend-confirmation`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (res.status !== 202) return emailRefusal(res);
  const d = (await res.json()) as ApiEmailSent;
  return { ok: true, email: d.email };
}

/** "Change email": the corrected address gets the confirmation link; links sent to the old one stop working. */
export async function changeRequestEmailAction(token: string, email: string): Promise<EmailSentResult> {
  if (typeof token !== "string" || !token) return { ok: false, status: 400, message: emailFixRefusal(404) };
  if (typeof email !== "string" || !looksLikeEmail(email)) return { ok: false, status: 400, message: emailFixRefusal(400) };
  const res = await call(`${tokenPath(token)}/email`, { method: "POST", body: JSON.stringify({ email: email.trim() }) });
  if (!res) return UNREACHABLE;
  if (!res.ok) return emailRefusal(res);
  const d = (await res.json()) as ApiEmailSent;
  return { ok: true, email: d.email };
}
