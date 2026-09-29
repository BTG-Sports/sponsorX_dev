import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";

const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox" },
  { href: "/athlete/offers", label: "Offers", icon: "mail" },
  { href: "/athlete/deliverables", label: "Deliverables", icon: "calendar" },
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet" },
  { href: "/athlete/inventory", label: "Inventory", icon: "store" },
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
     fixture leak left on a wired page (P3-FE-03). With no name set it falls
     back to the email, never to the fixture (F-06, QA pass 5), and BTG
     preview stays honest: an admin previewing this portal is greeted as
     themselves, with their own roles. */
  const isAthlete = actor.roles.includes("ATHLETE");

  return (
    <PortalShell
      portal="athlete"
      nav={NAV}
      rootHref="/athlete"
      userName={await viewerName("Athlete")}
      userRole={isAthlete ? "Content Partner" : `${roleLabel(actor.roles)} · preview`}
    >
      {children}
    </PortalShell>
  );
}
