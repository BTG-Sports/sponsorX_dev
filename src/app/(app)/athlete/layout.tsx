import { PortalShell, type NavItem } from "@/components/portal-shell";
import { athlete } from "@/lib/fixtures";

const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox" },
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet" },
  { href: "/athlete/profile", label: "Public profile", icon: "user" },
];

export default function AthleteLayout({ children }: LayoutProps<"/athlete">) {
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
