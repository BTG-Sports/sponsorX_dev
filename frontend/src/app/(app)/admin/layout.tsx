import { requirePortalAccess } from "@/server/portal";
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
  { href: "/admin/network", label: "Network", icon: "users" },
  { href: "/admin/integrations", label: "Integrations", icon: "gear" },
  { href: "/admin/audit", label: "Audit log", icon: "file" },
  /* SponsorX NEXT workspaces (spec §8) — editions first (P1-FE-21); the
     inventory ledger, rights queue and splits screens join as they're built. */
  { href: "/admin/next/editions", label: "NEXT editions", icon: "book" },
  { href: "/admin/next/inventory", label: "NEXT inventory", icon: "card" },
  { href: "/admin/next/splits", label: "NEXT splits", icon: "file" },
  { href: "/admin/next/rights", label: "NEXT rights", icon: "camera" },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePortalAccess("admin");

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
