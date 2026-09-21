/* --------------------------------------------------------------------------
   Talking to the API — P2-BE-04 / Addendum B.

   The frontend does not read Postgres. Authorisation lives with the data, in
   `backend/src/auth`, because `/api/v1` is reached by the portals, by §8's API
   service account and by INFINEX on equal terms — a check enforced in the Next
   app would have covered exactly one of the three.

   So the identity mirror is now an HTTP call like any other read. Clerk still
   authenticates here: `auth().getToken()` mints the session token that the API
   verifies. Note the consequence — the browser never sees this call, it is
   server-to-server between the Next server and the API, which is why the token
   can be forwarded at all.
   -------------------------------------------------------------------------- */

import { auth } from "@clerk/nextjs/server";

export type Actor = {
  userId: string;
  tenantId: string;
  roles: string[];
};

/** Why there is no actor, when there isn't one. Three states, because
 *  "sign in", "ask BTG for access" and "signed in fine" are three different
 *  things to show someone. */
export type ActorResult =
  | { status: "anonymous" }
  | { status: "unprovisioned" }
  | { status: "linked"; actor: Actor };

/** Server-side only. The API is reached over Railway's private network in
 *  production, so this is deliberately not a NEXT_PUBLIC_ variable — the
 *  browser has no business knowing the address. */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Ask the API who the caller is.
 *
 * `GET /api/v1/me` also *completes* a new user's link: the claim of a
 * provisioned row happens inside the API's `resolveActor()`, so a first
 * sign-in is finished by this call rather than by anything here.
 */
export async function fetchActor(): Promise<ActorResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { status: "anonymous" };

  const token = await getToken();
  if (!token) return { status: "anonymous" };

  const response = await fetch(`${API_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
    /* Roles are an authorisation input; a cached answer would keep a revoked
       role alive for as long as the cache lasts. */
    cache: "no-store",
  });

  if (response.status === 401) return { status: "anonymous" };
  if (response.status === 403) return { status: "unprovisioned" };

  if (!response.ok) {
    /* Anything else is the API being broken, and must not be reported to the
       user as "your account isn't set up" — that is a confident lie about
       their account when the truth is an outage. */
    throw new Error(
      `GET /api/v1/me failed with ${response.status}. The API may be down; ` +
        `this is not an authorisation result.`,
    );
  }

  return { status: "linked", actor: (await response.json()) as Actor };
}
