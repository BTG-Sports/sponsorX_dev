import { auth } from "@clerk/nextjs/server";
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

/* Authentication is checked here, in the layout, not by path matching in
   src/proxy.ts — Clerk deprecated `createRouteMatcher()` on the grounds that
   "middleware-based auth checks rely on path matching, which can diverge from
   how Next.js routes requests and leave protected resources reachable"
   (P2-INT-01). A layout wraps every page beneath it, so the check cannot be
   missed by adding a route.

   This proves only *authentication*. Which tenant's rows this portal may read
   is `requireActor()` plus the scope functions in §04 — P2-BE-04. */
export default async function PropertyLayout({ children }: LayoutProps<"/property">) {
  await auth.protect();

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
