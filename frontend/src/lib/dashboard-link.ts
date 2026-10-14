/* --------------------------------------------------------------------------
   "Athlete Dashboard" — what the public site's Login / Get Started buttons
   become for someone already signed in (2026-10-14, P1-ART-27).

   The portal itself is decided where it always is — server/portal.ts
   portalFor(), from the Postgres roles — and this only names it for the
   button. Pure, so it is tested on its own.
   -------------------------------------------------------------------------- */

export type DashboardLink = { href: string; label: string };

const NAMES: Record<string, string> = {
  "/admin": "Admin",
  "/finance": "Finance",
  "/sponsor": "Sponsor",
  "/property": "Property",
  "/athlete": "Athlete",
  "/next": "Student",
  "/advisor": "Advisor",
};

/** The button for a signed-in visitor, or null (no portal → keep Login / Get Started). */
export function dashboardLink(portal: string | null, roles: readonly string[]): DashboardLink | null {
  if (!portal) return null;
  let who = NAMES[portal];
  if (!who) return null;
  /* A guardian opens the athlete portal on their ward's behalf — name it for them. */
  if (portal === "/athlete" && roles.includes("GUARDIAN") && !roles.includes("ATHLETE")) who = "Guardian";
  return { href: portal, label: `${who} Dashboard` };
}
