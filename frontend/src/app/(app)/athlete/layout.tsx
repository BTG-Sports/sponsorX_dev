import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { athlete } from "@/lib/fixtures";

const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox" },
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet" },
  { href: "/athlete/profile", label: "Public profile", icon: "user" },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function AthleteLayout({ children }: LayoutProps<"/athlete">) {
  await requirePortalAccess("athlete");

  return (
    <PortalShell
      portal="athlete"
      nav={NAV}
      rootHref="/athlete"
      userName={athlete.displayName}
      userRole={`${athlete.tier} · Content Partner`}
    >
      {children}
    </PortalShell>
  );
}
