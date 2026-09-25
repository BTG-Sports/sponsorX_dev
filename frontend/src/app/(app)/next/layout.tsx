import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { StudentTabBar } from "@/components/student-tabbar";
import { student } from "@/lib/fixtures";

const NAV: NavItem[] = [
  { href: "/next", label: "Home", icon: "grid" },
  { href: "/next/assignments", label: "Assignments", icon: "pen" },
  { href: "/next/sales", label: "My sales", icon: "store" },
  { href: "/next/code", label: "My code", icon: "card" },
  { href: "/next/points", label: "Points", icon: "trophy" },
];

/* The student portal — SponsorX NEXT (P1-FE-19, spec §8, §9). Fixtures only:
   no route under /next reads the backend until Stage 9 wires it (P9-FE-01).
   Access today: STUDENT (Stage 9 role, matches nobody yet) plus the two BTG
   admin roles for preview — see PORTAL_ROLES in server/portal.ts.

   Mobile-first is structural here, not a media query: primary nav is a bottom
   tab bar under the thumb (390px design, per spec §9 "design at 390px and
   widen"); the sidebar takes over at md+ like every other portal. */
export default async function NextPortalLayout({
  children,
}: LayoutProps<"/next">) {
  await requirePortalAccess("next");

  return (
    <PortalShell
      portal="next"
      nav={NAV}
      rootHref="/next"
      userName={student.displayName}
      userRole={`${student.publication} · Class of ${student.gradYear}`}
    >
      {/* clear the fixed tab bar on phones; the bar leaves at md */}
      <div className="pb-16 md:pb-0">{children}</div>
      <StudentTabBar />
    </PortalShell>
  );
}
