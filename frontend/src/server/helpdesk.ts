import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";

import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   POL-FE-43 — the help desk's way to the API. Signed in, it carries the
   person's session (server to server, never to the browser), so the API
   lists their role's cases and links the message to their account; a
   visitor goes without, like every public page. The visitor's address is
   forwarded either way (P8-SEC-03), so the per-IP limits count them.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function sessionToken(): Promise<string | null> {
  try {
    const { userId, getToken } = await auth();
    return userId ? await getToken() : null;
  } catch {
    return null;
  }
}

export async function helpdeskApi(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await sessionToken();
  return fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...edgeHeadersFrom(await headers()),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Who is filling in the form, to fill in their name and email: null for a visitor. */
export async function helpdeskViewer(): Promise<{ name: string; email: string } | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return {
      name: [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      email: user?.primaryEmailAddress?.emailAddress ?? "",
    };
  } catch {
    return null;
  }
}
