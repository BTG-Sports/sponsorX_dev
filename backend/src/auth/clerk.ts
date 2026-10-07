/**
 * The only file in the backend that knows Clerk exists — P2-INT-01, A4.
 *
 * Everything else takes an already-verified `clerkId` and email. That is not
 * tidiness for its own sake: `stack-decision.md` keeps a live revisit trigger
 * on Clerk, and nothing in the system depends on its organisation model, so a
 * swap to another provider should touch this file and no other.
 *
 * `@clerk/backend` rather than `@clerk/express`: the former is already in the
 * tree as a dependency of `@clerk/nextjs`, exposes exactly the one primitive
 * needed (`authenticateRequest`), and adds no middleware opinions of its own.
 * Declared explicitly in package.json all the same — relying on a transitive
 * dependency is how a build breaks on someone else's upgrade.
 */

import { createClerkClient } from "@clerk/backend";
import type { Request } from "express";

import { env } from "../config/env";

/** Verified primary address, lowercased. `null` when the identity has none,
 *  which is possible for machine or SSO identities. A function when it has
 *  not been fetched yet — called only if it is actually needed. */
export type EmailSource = string | null | (() => Promise<string | null>);

export type ClerkIdentity = {
  clerkId: string;
  email: EmailSource;
};

const clerk = createClerkClient({
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
});

/**
 * Verify whoever is calling, from either credential the API accepts:
 *
 *   - a **session token**, which is how the portals call — the Next server
 *     sends `Authorization: Bearer <token>` from `auth().getToken()`;
 *   - a **session cookie**, for a browser calling the API directly.
 *
 * Returns `null` when there is no valid credential. It does not throw, so a
 * public route can call it to find out whether anyone is signed in without
 * having to catch.
 */
export async function authenticateClerkRequest(
  req: Request,
): Promise<ClerkIdentity | null> {
  /* Clerk's helper wants a standard Request. Express 5 does not give one, so
     rebuild the parts it reads — the URL and the headers. */
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }

  /* 2S8-PMO-02, owner decision 3: only a session minted by one of our own
     web origins (the token's `azp`) is accepted — config/authorized-parties.ts. */
  const state = await clerk.authenticateRequest(new Request(url, { headers }), {
    authorizedParties: env.clerkAuthorizedParties,
    /* A developer's drifted clock makes every token "not active yet" (seen
       2026-10-07: a PC ten minutes behind). Only a set CLERK_CLOCK_SKEW_MS
       widens Clerk's default. */
    ...(env.CLERK_CLOCK_SKEW_MS !== undefined ? { clockSkewInMs: env.CLERK_CLOCK_SKEW_MS } : {}),
  });
  if (!state.isSignedIn) return null;

  const { userId } = state.toAuth();
  if (!userId) return null;

  /* The session token carries no email, so the address that links a Clerk
     identity to its provisioned Postgres row has to be fetched. Only needed
     on first sign-in — every later request matches on `clerkId` and never
     calls this. So it is handed over unfetched: a Backend API call on every
     request spent Clerk's rate limit on lookups whose answer was never read,
     and a page making a handful of API calls ran into Clerk's 429. */
  const email = async () => {
    const user = await clerk.users.getUser(userId);
    const address =
      user.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ?? null;
    return address ? address.toLowerCase() : null;
  };

  return { clerkId: userId, email };
}
