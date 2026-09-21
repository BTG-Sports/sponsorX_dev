import { PortalShell, type NavItem } from "@/components/portal-shell";
import { property } from "@/lib/fixtures";

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

export default function PropertyLayout({ children }: LayoutProps<"/property">) {
  return (
    <PortalShell
      portal="property"
      nav={NAV}
      rootHref="/property"
      orgName={property.name}
      userName="Property Manager"
      userRole="PROPERTY_MGR"
    >
      {children}
    </PortalShell>
  );
}
