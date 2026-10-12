import { currentUser } from "@clerk/nextjs/server";

import { requirePortalAccess } from "@/server/portal";
import { PortalShell } from "@/components/portal-shell";
import { SPONSOR_NAV } from "@/lib/sponsor-nav";

import "./stadium.css";
import "../../mobile-nav.css";

/* The sidebar takes the admin/athlete structure (P1-ART-23, lib/sponsor-nav.ts):
   Dashboard alone on top, every other desk in a collapsible group. */

/* P1-ART-24 — the phone dock's four destinations (the rest are behind its Menu). */
const DOCK = ["/sponsor", "/sponsor/campaigns", "/sponsor/shop", "/sponsor/orders"];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function SponsorLayout({ children }: LayoutProps<"/sponsor">) {
  const actor = await requirePortalAccess("sponsor");

  /* P7-QA-02 — the athlete layout's rule (P3-FE-03): the chrome greets the
     person who signed in, from Clerk, never the fixture "Under Armour / John
     Smith". The org line is left to the shell (it falls back to the user's
     name) until the sponsor's own name is resolved here; with no Clerk
     name set it falls back to the email, never to a fixture. */
  const user = await currentUser();
  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const role = actor.roles.includes("SPONSOR_ADMIN")
    ? "Sponsor Admin"
    : actor.roles.includes("SPONSOR_ANALYST")
      ? "Sponsor Analyst"
      : "BTG preview";

  return (
    <PortalShell
      portal="sponsor"
      nav={SPONSOR_NAV}
      rootHref="/sponsor"
      dock={DOCK}
      userName={clerkName || user?.primaryEmailAddress?.emailAddress || "Sponsor"}
      userRole={role}
      /* P1-ART-23 — the whole sponsor portal on the Stadium Board. */
      stage="stadium"
    >
      {children}
    </PortalShell>
  );
}
