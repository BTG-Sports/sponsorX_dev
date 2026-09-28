import { currentUser } from "@clerk/nextjs/server";

import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { athlete } from "@/lib/fixtures";

const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox" },
  { href: "/athlete/deliverables", label: "Deliverables", icon: "calendar" },
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet" },
  { href: "/athlete/profile", label: "Public profile", icon: "user" },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function AthleteLayout({ children }: LayoutProps<"/athlete">) {
  const actor = await requirePortalAccess("athlete");

  /* The chrome greets the person who signed in, from Clerk — identity is
     Clerk's job, and the fixture athlete greeting a REAL athlete was the one
     fixture leak left on a wired page (P3-FE-03). The fixture name remains
     only for identities with no name set (and BTG preview stays honest: an
     admin previewing this portal is greeted as themselves). */
  const user = await currentUser();
  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const isAthlete = actor.roles.includes("ATHLETE");

  return (
    <PortalShell
      portal="athlete"
      nav={NAV}
      rootHref="/athlete"
      userName={clerkName || athlete.displayName}
      userRole={isAthlete ? "Content Partner" : `${athlete.tier} · Content Partner`}
    >
      {children}
    </PortalShell>
  );
}
