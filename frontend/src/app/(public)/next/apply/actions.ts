"use server";

/* --------------------------------------------------------------------------
   P9-FE-06 — submit the student application, as a server action (API_URL is
   server-side only, the /join precedent). POST /public/students/applications
   lands it SUBMITTED for the school's advisor, with a minor's guardian
   captured; the API refuses a minor without one (422), and that answer is
   returned as copy, not thrown.

   The applicant's own address is forwarded (edgeHeadersFrom), as every
   other public action does. Without it the API's 5-an-hour limit keys on
   this web server's address, so every student on the site shares ONE
   bucket and the sixth application in an hour — from anyone — is refused.
   -------------------------------------------------------------------------- */

import { headers } from "next/headers";

import { edgeHeadersFrom } from "@/server/edge";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type ApplyResult = { ok: true; guardianRequired: boolean } | { ok: false; message: string };

export async function submitNextApplication(body: unknown): Promise<ApplyResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/public/students/applications`, {
      method: "POST",
      headers: { "content-type": "application/json", ...edgeHeadersFrom(await headers()) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, message: "We couldn’t send your application. Nothing was lost — check your connection and tap Submit again." };
  }
  if (res.ok) {
    const d = (await res.json()) as { guardianRequired: boolean };
    return { ok: true, guardianRequired: d.guardianRequired };
  }
  if (res.status === 429) return { ok: false, message: "Too many applications from this connection. Try again in an hour." };
  let message: string | undefined;
  try {
    message = ((await res.json()) as { error?: { message?: string } }).error?.message;
  } catch {
    /* no body */
  }
  return { ok: false, message: message ?? "We couldn’t send your application. Your answers are saved — try again in a minute." };
}
