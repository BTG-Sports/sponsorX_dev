import { auth } from "@clerk/nextjs/server";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { athlete } from "@/lib/fixtures";

const NAV: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: "grid" },
  { href: "/athlete/invitations", label: "Invitations", icon: "inbox" },
  { href: "/athlete/earnings", label: "Earnings", icon: "wallet" },
  { href: "/athlete/profile", label: "Public profile", icon: "user" },
];

/* Authentication is checked here, in the layout, not by path matching in
   src/proxy.ts — Clerk deprecated `createRouteMatcher()` on the grounds that
   "middleware-based auth checks rely on path matching, which can diverge from
   how Next.js routes requests and leave protected resources reachable"
   (P2-INT-01). A layout wraps every page beneath it, so the check cannot be
   missed by adding a route.

   This proves only *authentication*. Which tenant's rows this portal may read
   is `requireActor()` plus the scope functions in §04 — P2-BE-04. */
export default async function AthleteLayout({ children }: LayoutProps<"/athlete">) {
  await auth.protect();

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
