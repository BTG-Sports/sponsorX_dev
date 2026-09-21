/* --------------------------------------------------------------------------
   The Clerk → Postgres identity mirror — P2-INT-01, Addendum A4.

   Clerk owns the credential. Postgres owns everything that decides what a
   person may do: which tenant they belong to and which of §8's twelve roles
   they hold. `User.clerkId` is the single thread between the two, and this
   file is the only place it is tied.

   **Nothing here writes to Clerk.** No tenant id, no role, no organization
   membership, no session claim. That is the whole point of A4: if the identity
   provider is ever swapped, this file changes and the authorization model does
   not.

   This module imports `db`, so it must only be reached from a server component
   or route handler that genuinely needs the database — `src/server/db.ts`
   throws at construction when `DATABASE_URL` is absent, and there is no local
   Postgres on a developer machine by design.
   -------------------------------------------------------------------------- */

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/server/db";

/** A mirrored user, or why there isn't one. */
export type MirrorResult =
  | { status: "anonymous" }
  | { status: "unprovisioned"; email: string | null }
  | { status: "linked"; user: { id: string; tenantId: string; roles: string[] } };

/**
 * Resolve the signed-in Clerk identity to its Postgres `User` row, linking the
 * two on first sign-in.
 *
 * The rule, and it matters: **this function never invents a tenant.** Phase 1
 * is a managed marketplace — BTG staff provision accounts, athletes are
 * approved rather than self-served into a tenant. So a Clerk identity with no
 * matching `User` row is authenticated but *unprovisioned*, and the caller is
 * expected to say so rather than to conjure access. Creating a tenant here
 * would be exactly the "authorization drifts into the identity provider"
 * failure A4 exists to prevent.
 *
 * Linking is by verified email: an administrator creates the `User` row with
 * the person's address ahead of time, and the first sign-in claims it by
 * writing the real `clerkId` over the placeholder.
 */
export async function mirrorCurrentUser(): Promise<MirrorResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { status: "anonymous" };

  const linked = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, tenantId: true, roles: true },
  });
  if (linked) return { status: "linked", user: { ...linked, roles: linked.roles } };

  /* First sign-in for this Clerk identity. Look for a row an admin prepared. */
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  if (!email) return { status: "unprovisioned", email: null };

  const provisioned = await db.user.findFirst({
    where: { email },
    select: { id: true, tenantId: true, roles: true, clerkId: true },
  });
  if (!provisioned) return { status: "unprovisioned", email };

  /* Claim it. `clerkId` is unique, so a second identity claiming the same
     address fails loudly at the database rather than silently sharing a row. */
  const claimed = await db.user.update({
    where: { id: provisioned.id },
    data: { clerkId },
    select: { id: true, tenantId: true, roles: true },
  });

  return { status: "linked", user: { ...claimed, roles: claimed.roles } };
}

/**
 * Role-aware routing — §9.2. The destination follows the actor's role, not the
 * page they signed in from. Order matters: a BTG staffer who also holds a
 * portal role lands in the workspace that carries the most authority.
 */
export function portalFor(roles: readonly string[]): string | null {
  const has = (r: string) => roles.includes(r);

  if (
    has("SUPER_ADMIN") ||
    has("BTG_ADMIN") ||
    has("SALES") ||
    has("CAMPAIGN_MGR") ||
    has("NETWORK_MGR") ||
    has("FINANCE")
  ) {
    return "/admin";
  }
  if (has("SPONSOR_ADMIN") || has("SPONSOR_ANALYST")) return "/sponsor";
  if (has("PROPERTY_MGR")) return "/property";
  if (has("ATHLETE") || has("GUARDIAN")) return "/athlete";

  /* SERVICE is the §8 API service account — it has no portal, by design. */
  return null;
}
