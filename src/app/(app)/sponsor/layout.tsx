import { PortalShell, type NavItem } from "@/components/portal-shell";
import { sponsor } from "@/lib/fixtures";

/* Sidebar matches the mockup's nine items. Those without a route yet are
   flagged `pending` and render as inert text rather than dead links. */
const NAV: NavItem[] = [
  { href: "/sponsor", label: "Dashboard", icon: "grid" },
  { href: "/sponsor/marketplace", label: "Marketplace", icon: "store" },
  { href: "/sponsor/campaigns/c1/report", label: "Campaigns", icon: "megaphone" },
  { href: "#", label: "Analytics", icon: "chart", pending: true },
  { href: "#", label: "Rewards", icon: "gift", pending: true },
  { href: "#", label: "Leads", icon: "users", pending: true },
  { href: "#", label: "Billing", icon: "card", pending: true },
  { href: "#", label: "Messages", icon: "mail", pending: true },
  { href: "#", label: "Settings", icon: "gear", pending: true },
];

export default function SponsorLayout({ children }: LayoutProps<"/sponsor">) {
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
