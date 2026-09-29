"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import {
  explainApplicantRefusal,
  isOrgType,
  refusalMessage,
  type ApiOnboarding,
  type ApiOnboardingDocument,
} from "@/lib/onboarding-live";
import { publicApi } from "./public-api";

/* --------------------------------------------------------------------------
   2S1-FE-01 — the property onboarding wizard's server actions. Public: no
   login, the resume token is the key.

     start      POST  /public/onboarding                     → redirect to /onboarding/<token>
     saveStep   PATCH /public/onboarding/:token              (one step of the union)
     accept     PATCH /public/onboarding/:token  step "agreements", hashing the words shown
     document   POST  /public/onboarding/:token/documents    → a private-bucket PUT URL
     confirm    POST  /public/onboarding/:token/documents/:documentId/confirm
     submit     POST  /public/onboarding/:token/submit       (422 carries error.missing[])

   The API decides everything; these forward and turn refusals into copy.
   -------------------------------------------------------------------------- */

export type Refusal = { ok: false; message: string; status: number; missing?: string[] };
export type ViewResult = { ok: true; view: ApiOnboarding } | Refusal;

const UNREACHABLE: Refusal = {
  ok: false,
  status: 0,
  message: "We couldn't reach SponsorX. Nothing was lost — check your connection and try again.",
};

const tokenPath = (token: string) => `/public/onboarding/${encodeURIComponent(token)}`;

async function refusal(res: Response): Promise<Refusal> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  const missing = (body as { error?: { missing?: unknown } } | null)?.error?.missing;
  return {
    ok: false,
    status: res.status,
    message: explainApplicantRefusal(res.status, refusalMessage(body)),
    ...(Array.isArray(missing) ? { missing: missing.filter((m): m is string => typeof m === "string") } : {}),
  };
}

async function call(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await publicApi(path, init);
  } catch {
    return null;
  }
}

/** Start an application; on success the browser goes to its resume page. */
export async function startOnboardingAction(orgType: string, orgName: string): Promise<Refusal> {
  const name = typeof orgName === "string" ? orgName.trim() : "";
  if (!isOrgType(orgType)) return { ok: false, status: 400, message: "Pick what kind of organisation you are." };
  if (!name || name.length > 200) return { ok: false, status: 400, message: "Give your organisation's name (under 200 characters)." };

  const res = await call("/public/onboarding", { method: "POST", body: JSON.stringify({ orgType, orgName: name }) });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) {
    if (res.status === 429) {
      return { ok: false, status: 429, message: "Too many applications started from this connection. Try again in an hour — or continue one you've already started." };
    }
    return refusal(res);
  }
  const { resumeToken } = (await res.json()) as { resumeToken: string };
  /* Outside any try: redirect() works by throwing. */
  redirect(`/onboarding/${encodeURIComponent(resumeToken)}`);
}

type StepBody =
  | { step: "organisation"; orgName?: string; stateCode?: string }
  | { step: "contacts"; contacts: unknown[] }
  | { step: "business"; details: Record<string, unknown> }
  | { step: "payout"; acknowledged: true };

const STEPS = new Set(["organisation", "contacts", "business", "payout"]);

/** Save one step. The agreements step has its own action (it hashes the words). */
export async function saveStepAction(token: string, body: StepBody): Promise<ViewResult> {
  if (typeof token !== "string" || !token || !body || !STEPS.has(body.step)) {
    return { ok: false, status: 400, message: "Unknown step." };
  }
  const res = await call(tokenPath(token), { method: "PATCH", body: JSON.stringify(body) });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true, view: (await res.json()) as ApiOnboarding };
}

/**
 * Accept the property terms. The fingerprint sent is of the words the page
 * showed — sha256 of `body`, the plain hex the API compares with the stored
 * bodyHash — so a text changed underneath the applicant is refused (409),
 * never silently accepted.
 */
export async function acceptTermsAction(token: string, agreementId: string, body: string): Promise<ViewResult> {
  if (typeof token !== "string" || !token || typeof agreementId !== "string" || !agreementId || typeof body !== "string" || !body) {
    return { ok: false, status: 400, message: "The terms weren't shown, so they can't be accepted." };
  }
  const bodyHashShown = createHash("sha256").update(body).digest("hex");
  const res = await call(tokenPath(token), {
    method: "PATCH",
    body: JSON.stringify({ step: "agreements", agreementId, bodyHashShown }),
  });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true, view: (await res.json()) as ApiOnboarding };
}

export type UploadGrant = { ok: true; document: ApiOnboardingDocument; uploadUrl: string; contentType: string } | Refusal;

/** Step one of a document: the API records it and hands back a PUT URL. */
export async function requestDocumentAction(
  token: string,
  input: { kind: string; filename: string; contentType: string; bytes: number },
): Promise<UploadGrant> {
  if (typeof token !== "string" || !token || !input) return { ok: false, status: 400, message: "Pick a file first." };
  const res = await call(`${tokenPath(token)}/documents`, {
    method: "POST",
    body: JSON.stringify({ kind: input.kind, filename: input.filename, contentType: input.contentType, bytes: input.bytes }),
  });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) return refusal(res);
  const d = (await res.json()) as { document: ApiOnboardingDocument; uploadUrl: string; contentType: string };
  return { ok: true, document: d.document, uploadUrl: d.uploadUrl, contentType: d.contentType };
}

export type DocumentResult = { ok: true; document: ApiOnboardingDocument } | Refusal;

/** Step two: the file is in the bucket — the API checks, then counts it. */
export async function confirmDocumentAction(token: string, documentId: string): Promise<DocumentResult> {
  if (typeof token !== "string" || !token || typeof documentId !== "string" || !documentId) {
    return { ok: false, status: 400, message: "Unknown document." };
  }
  const res = await call(`${tokenPath(token)}/documents/${encodeURIComponent(documentId)}/confirm`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true, document: (await res.json()) as ApiOnboardingDocument };
}

/** Submit for BTG's review. While incomplete the API answers 422 with the list. */
export async function submitOnboardingAction(token: string): Promise<ViewResult> {
  if (typeof token !== "string" || !token) return { ok: false, status: 400, message: "Unknown application." };
  const res = await call(`${tokenPath(token)}/submit`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) {
    const r = await refusal(res);
    if (res.status === 422 && r.missing?.length) return { ...r, message: "A few answers are still missing — they're listed below." };
    return r;
  }
  return { ok: true, view: (await res.json()) as ApiOnboarding };
}
