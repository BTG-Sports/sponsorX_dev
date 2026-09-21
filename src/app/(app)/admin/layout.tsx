import { auth } from "@clerk/nextjs/server";
import { PortalShell, type NavItem } from "@/components/portal-shell";

/* BTG admin surface — §10's four workspaces plus the command center (§23). */
const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/applications", label: "Applications", icon: "users" },
  { href: "/admin/campaigns", label: "Campaigns", icon: "megaphone" },
  { href: "/admin/approvals", label: "Approvals", icon: "inbox" },
  { href: "/admin/rewards", label: "Rewards", icon: "gift" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/finance", label: "Finance", icon: "wallet" },
];

/* Authentication is checked here, in the layout, not by path matching in
   src/proxy.ts — Clerk deprecated `createRouteMatcher()` on the grounds that
   "middleware-based auth checks rely on path matching, which can diverge from
   how Next.js routes requests and leave protected resources reachable"
   (P2-INT-01). A layout wraps every page beneath it, so the check cannot be
   missed by adding a route.

   This proves only *authentication*. Which tenant's rows this portal may read
   is `requireActor()` plus the scope functions in §04 — P2-BE-04. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await auth.protect();

  return (
    <PortalShell
      portal="admin"
      nav={NAV}
      rootHref="/admin"
      orgName="BTG Sports Group"
      userName="BTG Operations"
      userRole="BTG_ADMIN"
    >
      {children}
    </PortalShell>
  );
}
