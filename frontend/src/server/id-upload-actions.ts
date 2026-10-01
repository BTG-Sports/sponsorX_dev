import { headers } from "next/headers";

import { refusalMessage } from "@/lib/onboarding-live";
import { publicApi } from "@/app/(public)/onboarding/public-api";
import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   The server half of every public ID upload — 2S1-FE-06 / -08 (the athlete's
   ID at /join, the guardian's ID and proof at /guardian/setup, the
   government ID on the coming-of-age page). Not itself a "use server" file:
   each page's own actions.ts wraps these with its token and path, so every
   endpoint checks its own arguments.

     request  POST <base>/documents{query}                  → a private-bucket PUT URL
     confirm  POST <base>/documents/:documentId/confirm{query} → the page's status

   The file never comes through here: the browser PUTs it straight to the
   URL the API signed (sponsor-proof-upload.tsx's pattern).
   -------------------------------------------------------------------------- */

export type Refusal = { ok: false; status: number; message: string };
export type UploadGrant = { ok: true; documentId: string; filename: string; uploadUrl: string; contentType: string } | Refusal;
export type Answer<T> = { ok: true; data: T } | Refusal;

const UNREACHABLE: Refusal = { ok: false, status: 0, message: "We couldn't reach SponsorX. Nothing was lost — check your connection and try again." };

export async function refusal(res: Response, badLink = "This link is not valid. Open the whole link from the email."): Promise<Refusal> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  const said = refusalMessage(body);
  const message =
    res.status === 429
      ? "That's a lot of requests from this connection. Wait a few minutes, then try again."
      : res.status === 400 && !said
        ? badLink
        : res.status >= 500
          ? "Something went wrong on our side. Try again in a minute."
          : said ?? "That wasn't accepted. Try again.";
  return { ok: false, status: res.status, message };
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * A public call. `signer` also forwards the visitor's user agent (edge.ts),
 * for an acceptance whose evidence is the signer's IP and browser (§12).
 */
export async function publicCall<T>(path: string, init: RequestInit = {}, opts: { signer?: boolean } = {}): Promise<Answer<T>> {
  let res: Response;
  try {
    res = opts.signer
      ? await fetch(`${API_URL}/api/v1${path}`, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
          headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...edgeHeadersFrom(await headers(), { signer: true }) },
        })
      : await publicApi(path, init);
  } catch {
    return UNREACHABLE;
  }
  if (!res.ok) return refusal(res);
  return { ok: true, data: (await res.json()) as T };
}

const TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Checked here as well as by the API: these arguments come from a browser. */
export function fileArgs(input: unknown): { filename: string; contentType: string; bytes: number } | null {
  const f = input as { filename?: unknown; contentType?: unknown; bytes?: unknown } | null;
  if (!f || typeof f.filename !== "string" || typeof f.contentType !== "string" || typeof f.bytes !== "number") return null;
  if (!TYPES.has(f.contentType) || !Number.isInteger(f.bytes) || f.bytes < 1) return null;
  return { filename: f.filename.slice(0, 200), contentType: f.contentType, bytes: f.bytes };
}

export async function requestUpload(path: string, body: Record<string, unknown>): Promise<UploadGrant> {
  const r = await publicCall<{ document: { id: string; filename: string }; uploadUrl: string; contentType: string }>(path, { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) return r;
  return { ok: true, documentId: r.data.document.id, filename: r.data.document.filename, uploadUrl: r.data.uploadUrl, contentType: r.data.contentType };
}
