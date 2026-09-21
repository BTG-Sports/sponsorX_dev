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
   workspace. Now the roles decide — read from Postgres by the API, which is
   the only thing that touches the database (Addendum B).
   -------------------------------------------------------------------------- */

import { redirect } from "next/navigation";

import { fetchActor, type Actor } from "@/server/api";

export type Portal = "admin" | "athlete" | "sponsor" | "property";

/**
 * Roles admitted to each portal, in the order the post-sign-in router tries
 * them. Order is the seniority rule: a BTG staffer who also holds a sponsor
 * role lands in the workspace carrying the most authority, not whichever
 * happens to match first alphabetically.
 */
const PORTAL_ROLES: ReadonlyArray<readonly [Portal, readonly string[]]> = [
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

/* Roles arrive from the API as plain strings. An unrecognised one must simply
   match nothing rather than fail to type-check at the call site — the strongly
   typed copy of the role union lives in backend/src/auth/policy.ts, where the
   authorisation decisions are actually made. This table only decides which
   workspace to render, which is a routing concern, not an authorisation one. */

/** Where this actor belongs, or `null` if no portal admits them. */
export function portalFor(roles: readonly string[]): string | null {
  for (const [portal, admitted] of PORTAL_ROLES) {
    if (roles.some((role) => admitted.includes(role))) return `/${portal}`;
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
  return roles.some((role) => entry[1].includes(role));
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
  /* `fetchActor()` throws only when the API itself is broken, and that throw
     is deliberately not caught: an outage must surface as an error, not as
     "your account isn't set up yet". The two look identical to a user and
     only one of them is their problem. */
  const result = await fetchActor();

  if (result.status === "anonymous") redirect("/login");
  if (result.status === "unprovisioned") redirect("/portal");

  if (!canOpenPortal(result.actor.roles, portal)) redirect("/portal");

  return result.actor;
}
