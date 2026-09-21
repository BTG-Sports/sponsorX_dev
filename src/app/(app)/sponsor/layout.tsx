import { auth } from "@clerk/nextjs/server";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { sponsor } from "@/lib/fixtures";

/* Sidebar matches the mockup's nine items. Those without a route yet are
   flagged `pending` and render as inert text rather than dead links. */
const NAV: NavItem[] = [
  { href: "/sponsor", label: "Dashboard", icon: "grid" },
  { href: "/sponsor/marketplace", label: "Marketplace", icon: "store" },
  { href: "/sponsor/campaigns", label: "Campaigns", icon: "megaphone" },
  { href: "#", label: "Analytics", icon: "chart", pending: true },
  { href: "#", label: "Rewards", icon: "gift", pending: true },
  { href: "#", label: "Leads", icon: "users", pending: true },
  { href: "#", label: "Billing", icon: "card", pending: true },
  { href: "#", label: "Messages", icon: "mail", pending: true },
  { href: "#", label: "Settings", icon: "gear", pending: true },
];

/* Authentication is checked here, in the layout, not by path matching in
   src/proxy.ts — Clerk deprecated `createRouteMatcher()` on the grounds that
   "middleware-based auth checks rely on path matching, which can diverge from
   how Next.js routes requests and leave protected resources reachable"
   (P2-INT-01). A layout wraps every page beneath it, so the check cannot be
   missed by adding a route.

   This proves only *authentication*. Which tenant's rows this portal may read
   is `requireActor()` plus the scope functions in §04 — P2-BE-04. */
export default async function SponsorLayout({ children }: LayoutProps<"/sponsor">) {
  await auth.protect();

  return (
    <PortalShell
      portal="sponsor"
      nav={NAV}
      rootHref="/sponsor"
      orgName={sponsor.name}
      userName={sponsor.contactName}
      userRole={sponsor.role}
    >
      {children}
    </PortalShell>
  );
}
