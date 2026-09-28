import { currentUser } from "@clerk/nextjs/server";

import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";

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

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function SponsorLayout({ children }: LayoutProps<"/sponsor">) {
  const actor = await requirePortalAccess("sponsor");

  /* P7-QA-02 — the athlete layout's rule (P3-FE-03): the chrome greets the
     person who signed in, from Clerk, never the fixture "Under Armour / John
     Smith". The org line is left to the shell (it falls back to the user's
     name) until the sponsor's own name is resolved here; with no Clerk
     name set it falls back to the email, never to a fixture. */
  const user = await currentUser();
  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const role = actor.roles.includes("SPONSOR_ADMIN")
    ? "Sponsor Admin"
    : actor.roles.includes("SPONSOR_ANALYST")
      ? "Sponsor Analyst"
      : "BTG preview";

  return (
    <PortalShell
      portal="sponsor"
      nav={NAV}
      rootHref="/sponsor"
      userName={clerkName || user?.primaryEmailAddress?.emailAddress || "Sponsor"}
      userRole={role}
    >
      {children}
    </PortalShell>
  );
}
