"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS, type NavIcon } from "./portal-nav";

/* --------------------------------------------------------------------------
   Bottom tab bar — student portal only (P1-FE-19). The first surface designed
   at 390px and widened: primary navigation sits under the thumb, not behind a
   hamburger. Desktop (md+) keeps the house sidebar; this bar simply leaves.
   The layout owns the matching bottom padding so content never hides under it.
   -------------------------------------------------------------------------- */

const TABS: ReadonlyArray<{ href: string; label: string; icon: NavIcon }> = [
  { href: "/next", label: "Home", icon: "grid" },
  { href: "/next/assignments", label: "Work", icon: "pen" },
  { href: "/next/sales", label: "Sales", icon: "store" },
  { href: "/next/code", label: "My code", icon: "card" },
];

function TabGlyph({ icon }: { icon: NavIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d={ICONS[icon]} />
    </svg>
  );
}

export function StudentTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Student portal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {/* accent hairline along the top edge, mirroring the header's */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-next/60 via-line to-transparent"
      />
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/next"
              ? pathname === "/next"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-next" : "text-muted hover:text-text",
              ].join(" ")}
            >
              <span className="relative">
                <TabGlyph icon={tab.icon} />
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-next"
                  />
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
        {/* Points ships with P1-FE-30 — visible and inert, not hidden. */}
        <span
          title="Points — arrives with P1-FE-30"
          className="flex cursor-not-allowed flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-faint/60"
        >
          <TabGlyph icon="trophy" />
          Points
        </span>
      </div>
    </nav>
  );
}
