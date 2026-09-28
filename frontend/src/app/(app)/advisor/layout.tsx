import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";

const NAV: NavItem[] = [
  { href: "/advisor", label: "Applications", icon: "users" },
  { href: "/advisor/review", label: "Content review", icon: "inbox" },
  /* The roster (active students, masthead, standing) has no Stage 1 row —
     visible and inert rather than hidden. */
  { href: "/advisor/roster", label: "Roster", icon: "book", pending: true },
];

/* The advisor desk — SponsorX NEXT (P1-FE-20, spec §3, §7, §8). One school's
   view: student applications reviewed the way a network manager reviews
   athlete ones, and the editorial queue in the reused ApprovalsDesk. Fixtures
   only; advisor decisions are wired by P9-FE-02.

   Access today: ADVISOR (Stage 9 role, matches nobody yet) plus the two BTG
   admin roles for preview — see PORTAL_ROLES in server/portal.ts. */
export default async function AdvisorLayout({
  children,
}: LayoutProps<"/advisor">) {
  const actor = await requirePortalAccess("advisor");

  return (
    <PortalShell
      portal="advisor"
      nav={NAV}
      rootHref="/advisor"
      /* F-06 (QA pass 5): the signed-in person and their real roles — BTG
         staff previewing this portal were greeted as the fixture advisor. */
      userName={await viewerName("Advisor")}
      userRole={roleLabel(actor.roles)}
    >
      {children}
    </PortalShell>
  );
}
