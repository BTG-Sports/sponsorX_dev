"use server";

import { headers } from "next/headers";

import type { ApiGuardianSetupLive, RelationshipCode } from "@/lib/guardian-live";
import { edgeHeadersFrom } from "@/server/edge";
import { fileArgs, publicCall, refusal, requestUpload, type Answer, type Refusal, type UploadGrant } from "@/server/id-upload-actions";

/* --------------------------------------------------------------------------
   2S1-FE-06 (guardian half) — the guardian's set-up page's writes. Public:
   the token from the guardian's email is the only key (2S1-BE-10).

     details  PATCH /public/guardian-setup/:token
     upload   POST  /public/guardian-setup/:token/documents(/:id/confirm)
     accept   POST  /public/guardian-setup/:token/accept

   Every export of a "use server" file is a callable endpoint, so the
   arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const base = (token: string) => `/public/guardian-setup/${encodeURIComponent(token)}`;
const BAD: { ok: false; status: number; message: string } = { ok: false, status: 400, message: "This link is not valid. Open the whole link from the email." };
const RELATIONSHIPS: readonly RelationshipCode[] = ["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"];
const okToken = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length < 500;

export async function saveGuardianDetailsAction(token: string, input: { legalName: string; relationship: RelationshipCode; phone: string }): Promise<Answer<ApiGuardianSetupLive>> {
  if (!okToken(token)) return BAD;
  if (!input || typeof input.legalName !== "string" || !input.legalName.trim()) return { ok: false, status: 422, message: "Enter your full name." };
  if (!RELATIONSHIPS.includes(input.relationship)) return { ok: false, status: 422, message: "Choose how you're related." };
  const phone = typeof input.phone === "string" && input.phone.trim() ? input.phone.trim().slice(0, 32) : null;
  if (phone && phone.length < 7) return { ok: false, status: 422, message: "Enter the whole phone number." };
  return publicCall<ApiGuardianSetupLive>(base(token), {
    method: "PATCH",
    body: JSON.stringify({ legalName: input.legalName.trim().slice(0, 120), relationship: input.relationship, phone }),
  });
}

export async function requestGuardianDocumentAction(
  token: string, kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF", proofKind: string | null, file: unknown,
): Promise<UploadGrant> {
  if (!okToken(token) || (kind !== "GUARDIAN_ID" && kind !== "GUARDIANSHIP_PROOF")) return BAD;
  const f = fileArgs(file);
  if (!f) return { ok: false, status: 422, message: "Upload a PDF, JPEG or PNG." };
  if (kind === "GUARDIANSHIP_PROOF" && !["BIRTH_CERTIFICATE", "COURT_ORDER", "SCHOOL_RECORD"].includes(proofKind ?? "")) {
    return { ok: false, status: 422, message: "Say which document it is." };
  }
  return requestUpload(`${base(token)}/documents`, { kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind } : {}), ...f });
}

export async function confirmGuardianDocumentAction(token: string, documentId: string): Promise<Answer<ApiGuardianSetupLive>> {
  if (!okToken(token) || typeof documentId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(documentId)) return BAD;
  return publicCall<ApiGuardianSetupLive>(`${base(token)}/documents/${encodeURIComponent(documentId)}/confirm`, { method: "POST" });
}

/** A refusal that also names the API's code, so the page can tell a
 *  moved-on rules wording (422 rules_attestation_stale) from a plain error. */
export type AcceptAnswer = { ok: true; data: ApiGuardianSetupLive } | (Refusal & { code?: string });

/**
 * The guardian agreement, accepted against the text shown — and, P8-FE-03,
 * the athlete's rules wording the guardian confirmed for them (its version;
 * omitted when the wording didn't load). The call is made here rather than
 * through publicCall because the wizard needs the refusal's code back: a
 * stale version is refused before anything is written, and the page must
 * reload the wording and ask again.
 */
export async function acceptGuardianAgreementAction(
  token: string,
  agreement: { agreementId: string; bodyHash: string; rulesVersion?: string | null },
): Promise<AcceptAnswer> {
  if (!okToken(token) || !agreement || typeof agreement.agreementId !== "string" || typeof agreement.bodyHash !== "string") return BAD;
  const rulesAttestationVersion =
    typeof agreement.rulesVersion === "string" && agreement.rulesVersion.trim() ? agreement.rulesVersion.trim().slice(0, 40) : undefined;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${base(token)}/accept`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      /* §12 — the acceptance records the signer's address and browser. */
      headers: { "content-type": "application/json", ...edgeHeadersFrom(await headers(), { signer: true }) },
      body: JSON.stringify({ agreementId: agreement.agreementId, bodyHashShown: agreement.bodyHash, ...(rulesAttestationVersion ? { rulesAttestationVersion } : {}) }),
    });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach SponsorX. Nothing was lost — check your connection and try again." };
  }
  if (res.ok) return { ok: true, data: (await res.json()) as ApiGuardianSetupLive };
  const body = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
  return { ...(await refusal(res)), ...(code ? { code } : {}) };
}
