"use server";

import type { UploadDone, UploadGrant } from "@/components/private-file-upload";
import type { ApiHandoffRequest } from "@/lib/guardian-live";
import { refusalMessage } from "@/lib/onboarding-live";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S1-FE-10 / 2S1-BE-15 — the new guardian's request page, its writes.
   Public: no login. The request token the API hands back (and the one in
   the confirmation email) is the only key. These forward and turn refusals
   into words; the files themselves never pass through here — the browser
   PUTs them straight to the private bucket (private-file-upload.tsx).
   Every export of a "use server" file is a callable endpoint, so arguments
   are checked, not trusted.

     lookupAction     GET  /public/guardian-handoffs/lookup?athleteEmail=
     startAction      POST /public/guardian-handoffs
     requestDocAction POST /public/guardian-handoffs/:t/documents
     confirmDocAction POST /public/guardian-handoffs/:t/documents/:id/confirm
     submitAction     POST /public/guardian-handoffs/:t/submit {acceptAgreement: true}
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string };
const UNREACHABLE: Fail = { ok: false, message: "We couldn’t reach SponsorX. Nothing was lost — check your connection and try again." };

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await publicApi(path, init);
  } catch {
    return null;
  }
}

async function refusal(res: Response, fallback: string): Promise<Fail> {
  let said: string | undefined;
  try {
    said = refusalMessage(await res.json());
  } catch {
    /* no body */
  }
  if (res.status === 429) return { ok: false, message: "That’s a lot of tries from this connection. Wait a few minutes, then try again." };
  if (res.status >= 500) return { ok: false, message: "Something went wrong on our side. Try again in a minute." };
  return { ok: false, message: said ?? fallback };
}

const path = (token: string, rest = "") => `/public/guardian-handoffs/${encodeURIComponent(token)}${rest}`;

export type Lookup = { ok: true; found: false } | { ok: true; found: true; athlete: { firstName: string; sport: string }; current: { firstName: string } } | Fail;

export async function lookupAction(athleteEmail: string): Promise<Lookup> {
  if (typeof athleteEmail !== "string" || !athleteEmail.includes("@")) return { ok: false, message: "Enter the athlete’s email." };
  const res = await call(`/public/guardian-handoffs/lookup?athleteEmail=${encodeURIComponent(athleteEmail.trim())}`);
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res, "That email wasn’t accepted.");
  return { ok: true, ...((await res.json()) as { found: boolean }) } as Lookup;
}

export type StartInput = { athleteEmail: string; name: string; email: string; phone?: string; relationship: "PARENT" | "LEGAL_GUARDIAN" | "AUTHORIZED_REP" };

export async function startAction(input: StartInput): Promise<{ ok: true; token: string } | Fail> {
  if (!input || typeof input !== "object") return { ok: false, message: "Fill in the form first." };
  const body = {
    athleteEmail: String(input.athleteEmail ?? "").trim(), name: String(input.name ?? "").trim(), email: String(input.email ?? "").trim(),
    relationship: input.relationship, ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
  };
  const res = await call("/public/guardian-handoffs", { method: "POST", body: JSON.stringify(body) });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) return refusal(res, "The request wasn’t accepted. Check each field and try again.");
  return { ok: true, token: ((await res.json()) as { token: string }).token };
}

export async function requestDocAction(
  token: string,
  kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF",
  proofKind: string | null,
  file: { filename: string; contentType: string; bytes: number },
): Promise<UploadGrant> {
  if (typeof token !== "string" || !token || !file || typeof file !== "object") return { ok: false, message: "Choose a file first." };
  const res = await call(path(token, "/documents"), {
    method: "POST",
    body: JSON.stringify({ kind, ...(kind === "GUARDIANSHIP_PROOF" && proofKind ? { proofKind } : {}), filename: file.filename, contentType: file.contentType, bytes: file.bytes }),
  });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) return refusal(res, "The upload wasn’t accepted. Try the file again.");
  const d = (await res.json()) as { document: { id: string }; uploadUrl: string; contentType: string };
  return { ok: true, id: d.document.id, uploadUrl: d.uploadUrl, contentType: d.contentType };
}

export async function confirmDocAction(token: string, documentId: string): Promise<UploadDone> {
  if (typeof token !== "string" || !token || typeof documentId !== "string" || !documentId) return { ok: false, message: "Unknown file." };
  const res = await call(path(token, `/documents/${encodeURIComponent(documentId)}/confirm`), { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res, "That file hasn’t arrived yet.");
  return { ok: true };
}

export async function submitAction(token: string): Promise<{ ok: true; request: ApiHandoffRequest } | Fail> {
  if (typeof token !== "string" || !token) return { ok: false, message: "This link isn’t valid. Start the request again." };
  const res = await call(path(token, "/submit"), { method: "POST", body: JSON.stringify({ acceptAgreement: true }) });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res, "The request couldn’t be sent yet.");
  return { ok: true, request: (await res.json()) as ApiHandoffRequest };
}
