import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";

/* Property surface — §8 PROPERTY_MGR. A property manager sees only their own
   property's athletes, inventory and campaigns (scoped in guide §09). Only the
   dashboard has a route in Phase 1; the rest render as inert nav until B-work
   builds them. */
const NAV: NavItem[] = [
  { href: "/property", label: "Dashboard", icon: "grid" },
  { href: "/property/roster", label: "Roster", icon: "users", pending: true },
  { href: "/property/inventory", label: "Inventory", icon: "store", pending: true },
  { href: "/property/campaigns", label: "Campaigns", icon: "megaphone", pending: true },
  { href: "/property/analytics", label: "Analytics", icon: "chart", pending: true },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function PropertyLayout({ children }: LayoutProps<"/property">) {
  const actor = await requirePortalAccess("property");

  return (
    <PortalShell
      portal="property"
      nav={NAV}
      rootHref="/property"
      /* F-06 (QA pass 5): the signed-in person and their real roles, not
         the fixture property's name over every manager's header. */
      userName={await viewerName("Property manager")}
      userRole={roleLabel(actor.roles)}
    >
      {children}
    </PortalShell>
  );
}
