import { headers } from "next/headers";

import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   2S1-FE-01 — the wizard's one way to the API. Server-side only (API_URL is
   not a NEXT_PUBLIC_ variable), with no Clerk token: the applicant has no
   login, the resume token in the path is the only key. The visitor's address
   is forwarded (P8-SEC-03) so the API's per-IP limits count the applicant,
   not this server.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function publicApi(path: string, init: RequestInit = {}): Promise<Response> {
  const forward = edgeHeadersFrom(await headers());
  return fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...forward,
    },
  });
}
