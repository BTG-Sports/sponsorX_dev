/* --------------------------------------------------------------------------
   Which portal, and who may open it — P2-BE-04, §9.2.

   Two questions with one answer table:

     - after sign-in, where does this actor go?
     - may this actor open the portal they just asked for?

   Keeping both on one map is what stops them drifting apart. A role that can
   be routed *to* a portal is exactly a role that may open it, and expressing
   that twice is how you end up with a workspace nobody can reach or one
   anybody can.

   This closes the gap `P2-INT-01` deliberately left: the layouts proved
   authentication only, so any signed-in Clerk identity could open the admin
   workspace. Now the roles come from Postgres and decide.
   -------------------------------------------------------------------------- */

import { redirect } from "next/navigation";

import { requireActor, type Actor } from "@/server/actor";
import { UnauthenticatedError, UnprovisionedError } from "@/server/errors";
import type { Role } from "@/server/authz-policy";

export type Portal = "admin" | "athlete" | "sponsor" | "property";

/**
 * Roles admitted to each portal, in the order the post-sign-in router tries
 * them. Order is the seniority rule: a BTG staffer who also holds a sponsor
 * role lands in the workspace carrying the most authority, not whichever
 * happens to match first alphabetically.
 */
const PORTAL_ROLES: ReadonlyArray<readonly [Portal, readonly Role[]]> = [
  [
    "admin",
    [
      "SUPER_ADMIN",
      "BTG_ADMIN",
      "SALES",
      "CAMPAIGN_MGR",
      "NETWORK_MGR",
      "FINANCE",
    ],
  ],
  ["sponsor", ["SPONSOR_ADMIN", "SPONSOR_ANALYST"]],
  ["property", ["PROPERTY_MGR"]],
  ["athlete", ["ATHLETE", "GUARDIAN"]],
  /* SERVICE is §8's API service account. It appears in no list on purpose —
     it has credentials and no workspace, and must never be routed anywhere. */
];

/* Both take `readonly string[]` rather than `readonly Role[]`: the mirror
   hands back whatever strings the database holds, and an unrecognised role
   must simply match nothing rather than fail to type-check at the call site.
   The table above stays strongly typed, which is where it matters. */

/** Where this actor belongs, or `null` if no portal admits them. */
export function portalFor(roles: readonly string[]): string | null {
  for (const [portal, admitted] of PORTAL_ROLES) {
    if (roles.some((role) => (admitted as readonly string[]).includes(role))) {
      return `/${portal}`;
    }
  }
  return null;
}

/** May these roles open this particular portal? */
export function canOpenPortal(
  roles: readonly string[],
  portal: Portal,
): boolean {
  const entry = PORTAL_ROLES.find(([name]) => name === portal);
  if (!entry) return false;
  return roles.some((role) => (entry[1] as readonly string[]).includes(role));
}

/**
 * The one call a portal layout makes.
 *
 * Every failure ends in a redirect rather than an error page, because each
 * one has somewhere sensible to go:
 *
 *   - not signed in      → `/login`
 *   - no SponsorX account → `/portal`, which explains that access is granted
 *                           rather than self-served
 *   - wrong portal        → `/portal`, which forwards them to their own
 *
 * The last case matters for more than politeness: an athlete who follows a
 * stale link to `/admin` should arrive at their own dashboard, not at a dead
 * end that looks like the product is broken.
 */
export async function requirePortalAccess(portal: Portal): Promise<Actor> {
  const actor = await requireActor().catch((error: unknown) => {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof UnprovisionedError) redirect("/portal");

    /* Anything else is rethrown deliberately. A database outage must surface
       as an error, not as "your account isn't set up yet" — the two look
       identical to a user and only one of them is their problem. Catching
       broadly here would turn every infrastructure failure into a confident
       lie about their account. */
    throw error;
  });

  if (!canOpenPortal(actor.roles, portal)) redirect("/portal");

  return actor;
}
