/* --------------------------------------------------------------------------
   Who is asking — P2-BE-04, Addendum A4, Guide §04.

   `requireActor()` is the single answer to "who is making this request", and
   every protected read in the application is expected to start here. Clerk
   proves the identity; this function turns that identity into the Postgres
   facts that decide anything: the tenant, the roles, and the ids that make
   "own" and "ward" mean something.

   **Roles are read from Postgres on every request, never from a session
   claim.** That is Addendum A4's rule and it has a practical edge: revoking a
   role takes effect on the next request rather than whenever a token happens
   to expire.

   It builds on `identity.ts` rather than repeating it — that module owns the
   Clerk-to-Postgres link and the rule that a missing row is never invented.
   -------------------------------------------------------------------------- */

import { mirrorCurrentUser } from "@/server/identity";
import { UnauthenticatedError, UnprovisionedError } from "@/server/errors";
import type { Role } from "@/server/authz-policy";
import { ROLES } from "@/server/authz-policy";

export type Actor = {
  /** Postgres `User.id`, not the Clerk id. Audit entries reference this. */
  userId: string;
  tenantId: string;
  roles: Role[];
};

const ROLE_SET = new Set<string>(ROLES);

/** Drop anything the policy does not know about rather than trusting it.
 *  A role in the database that this build has never heard of must grant
 *  nothing — an unknown string should not survive into an authorisation
 *  decision. */
function knownRoles(values: readonly string[]): Role[] {
  return values.filter((value): value is Role => ROLE_SET.has(value));
}

/**
 * Resolve the current request to an actor, or throw.
 *
 * Throws `UnauthenticatedError` when nobody is signed in, and
 * `UnprovisionedError` when a real Clerk identity has no SponsorX account —
 * two different problems with two different remedies, so they stay separate
 * (see `errors.ts`).
 */
export async function requireActor(): Promise<Actor> {
  const result = await mirrorCurrentUser();

  if (result.status === "anonymous") throw new UnauthenticatedError();
  if (result.status === "unprovisioned") {
    throw new UnprovisionedError(result.email);
  }

  return {
    userId: result.user.id,
    tenantId: result.user.tenantId,
    roles: knownRoles(result.user.roles),
  };
}

/**
 * The actor, or `null` when there isn't one.
 *
 * For surfaces that legitimately render both ways — a marketing page showing
 * a "sign in" or a "go to your portal" link. Anything that reads protected
 * data uses `requireActor()` instead, so that forgetting a check fails closed.
 */
export async function optionalActor(): Promise<Actor | null> {
  try {
    return await requireActor();
  } catch {
    return null;
  }
}
