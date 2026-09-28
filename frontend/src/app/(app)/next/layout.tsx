import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { StudentTabBar } from "@/components/student-tabbar";
import { student as previewStudent } from "@/lib/fixtures";
import { liveStudent } from "./live";

const NAV: NavItem[] = [
  { href: "/next", label: "Home", icon: "grid" },
  { href: "/next/assignments", label: "Assignments", icon: "pen" },
  { href: "/next/sales", label: "My sales", icon: "store" },
  { href: "/next/code", label: "My code", icon: "card" },
  { href: "/next/points", label: "Points", icon: "trophy" },
];

/* The student portal — SponsorX NEXT (P1-FE-19, spec §8, §9; wired P9-FE-01).
   A signed-in STUDENT sees their own name and class here and their own
   records on every page. BTG admins previewing the portal (PORTAL_ROLES in
   server/portal.ts) are not a student, so they see the fixture student.

   Mobile-first is structural here, not a media query: primary nav is a bottom
   tab bar under the thumb (390px design, per spec §9 "design at 390px and
   widen"); the sidebar takes over at md+ like every other portal. */
export default async function NextPortalLayout({
  children,
}: LayoutProps<"/next">) {
  await requirePortalAccess("next");
  const live = await liveStudent();
  const me = live?.kind === "student" ? live.student : null;

  return (
    <PortalShell
      portal="next"
      nav={NAV}
      rootHref="/next"
      userName={me ? me.displayName : live ? "Student" : previewStudent.displayName}
      userRole={
        me
          ? `SponsorX NEXT${me.gradYear ? ` · Class of ${me.gradYear}` : ""}`
          : live
            ? "SponsorX NEXT"
            : `${previewStudent.publication} · Class of ${previewStudent.gradYear}`
      }
    >
      {/* clear the fixed tab bar on phones; the bar leaves at md */}
      <div className="pb-16 md:pb-0">{children}</div>
      <StudentTabBar />
    </PortalShell>
  );
}
