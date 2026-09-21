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

export type ClerkIdentity = {
  clerkId: string;
  /** Verified primary address, lowercased. `null` when the identity has none,
   *  which is possible for machine or SSO identities. */
  email: string | null;
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

  const state = await clerk.authenticateRequest(new Request(url, { headers }));
  if (!state.isSignedIn) return null;

  const { userId } = state.toAuth();
  if (!userId) return null;

  /* The session token carries no email, so the address that links a Clerk
     identity to its provisioned Postgres row has to be fetched. Only needed
     on first sign-in — every later request matches on `clerkId` and never
     reaches this call. */
  const user = await clerk.users.getUser(userId);
  const email =
    user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
      ?.emailAddress ?? null;

  return { clerkId: userId, email: email ? email.toLowerCase() : null };
}
