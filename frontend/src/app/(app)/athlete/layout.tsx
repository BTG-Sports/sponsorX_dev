import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";

/* The athlete portal's sidebar — P1-ART-22 (2026-10-11): the desks fold
   into the same collapsible groups the admin sidebar got in P1-ART-21
   (lib/nav-groups.ts), in the order an athlete's week runs rather than
   alphabetically: the work BTG sends, the money it earns, the shop they
   run, their account. Dashboard stays on top; the group holding the open
   page is open on arrival. A desk's own notes stay with it. */
const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },

  /* What BTG sends and what the athlete owes back. */
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox", group: "Campaigns", groupIcon: "megaphone" },
  { href: "/athlete/offers", label: "Offers", icon: "mail", group: "Campaigns" },
  { href: "/athlete/deliverables", label: "Deliverables", icon: "calendar", group: "Campaigns" },

  /* Earned, paid and where it lands. */
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet", group: "Money", groupIcon: "wallet" },
  { href: "/athlete/money", label: "Payouts", icon: "card", group: "Money" },

  /* Phase 2 seller screens (2026-10-01): a no-team athlete lists their own
     items (2S3-FE-02); every seller's sold lines (2S4-FE-03); the team they
     sell through (2S2-FE-05). */
  { href: "/athlete/inventory", label: "Inventory", icon: "box", group: "Shop", groupIcon: "store" },
  { href: "/athlete/listings", label: "Listings", icon: "megaphone", group: "Shop" },
  { href: "/athlete/sales", label: "Orders", icon: "store", group: "Shop" },
  { href: "/athlete/team", label: "Team", icon: "users", group: "Shop" },

  { href: "/athlete/profile", label: "Public profile", icon: "user", group: "Account", groupIcon: "user" },
  /* 2S1-FE-10 — requests to take over as guardian; GUARDIAN only (below). */
  { href: "/athlete/guardian-requests", label: "Guardian requests", icon: "shield", group: "Account" },
  /* 2S1-FE-08 — sign-in, payouts, closing and reactivating the account. */
  { href: "/athlete/settings", label: "Settings", icon: "gear", group: "Account" },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function AthleteLayout({ children }: LayoutProps<"/athlete">) {
  const actor = await requirePortalAccess("athlete");

  /* The chrome greets the person who signed in, from Clerk — identity is
     Clerk's job, and the fixture athlete greeting a REAL athlete was the one
     fixture leak left on a wired page (P3-FE-03). With no name set it falls
     back to the email, never to the fixture (F-06, QA pass 5), and BTG
     preview stays honest: an admin previewing this portal is greeted as
     themselves, with their own roles. */
  const isAthlete = actor.roles.includes("ATHLETE");

  return (
    <PortalShell
      portal="athlete"
      /* Only the current guardian answers a handoff request — the minor never does. */
      nav={NAV.filter((n) => n.href !== "/athlete/guardian-requests" || actor.roles.includes("GUARDIAN"))}
      rootHref="/athlete"
      userName={await viewerName("Athlete")}
      userRole={isAthlete ? "Content Partner" : `${roleLabel(actor.roles)} · preview`}
      /* P1-ART-22 — the whole athlete portal on the Arena. */
      stage="arena"
    >
      {children}
    </PortalShell>
  );
}
