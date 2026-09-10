import { PortalShell, type NavItem } from "@/components/portal-shell";

/* BTG admin surface — §10's four workspaces plus the command center (§23). */
const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/applications", label: "Applications", icon: "users" },
  { href: "/admin/campaigns/c1", label: "Campaigns", icon: "megaphone" },
  { href: "/admin/campaigns/new", label: "New campaign", icon: "file" },
  { href: "/admin/approvals", label: "Approvals", icon: "inbox" },
  { href: "/admin/rewards/new", label: "Rewards", icon: "gift" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/finance", label: "Finance", icon: "wallet" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
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
