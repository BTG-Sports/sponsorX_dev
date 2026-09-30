"use client";

/* --------------------------------------------------------------------------
   Public marketing nav — the link row in the SiteHeader (owner's brief,
   2026-09-30): Home, How It Works, For Sponsors, For Athletes, About, with
   the current page lit as a hologram (`.sx-holo` in globals.css: glow, a
   neon flicker and short RGB-split glitches, plus a glowing underline).

   "Current" follows the route *and* the fly-through. On the home page the
   drone's stop decides — Home while it hovers over the plaza, How It Works
   over the court, For Sponsors over the soccer field, For Athletes over the
   baseball field, nothing mid-leg (the overlays are hidden then too). Off
   the home page the pathname decides (For Athletes on /join). The store
   subscription selects the hovering stop id, so this re-renders only when
   the stop changes, never per scroll frame.

   Items marked `pending` have no route yet; they render as inert text so
   nothing on the page 404s.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { STOPS, stopWeight } from "@/lib/city/flight";
import { useFlight } from "@/lib/city/flight-store";

interface NavItem {
  label: string;
  href: string;
  /** Pathname prefix that makes this item current off the home page. */
  path?: string;
  /** Flight stop that makes this item current on the home page. */
  stop?: string;
  pending?: boolean;
}

const NAV: NavItem[] = [
  { label: "Home", href: "/", stop: "plaza" },
  { label: "How It Works", href: "#how-it-works", stop: "basketball" },
  { label: "For Sponsors", href: "#for-sponsors", stop: "soccer" },
  { label: "For Athletes", href: "/join", path: "/join", stop: "baseball" },
  { label: "About", href: "#", pending: true },
];

/** The stop the drone is hovering at (overlay more than half visible), or null mid-leg. */
function hoveringStop(progress: number): string | null {
  for (const s of STOPS) if (stopWeight(progress, s.progress) > 0.5) return s.id;
  return null;
}

export function SiteNav() {
  const pathname = usePathname();
  const stop = useFlight((s) => hoveringStop(s.progress));
  const onHome = pathname === "/";

  const isCurrent = (n: NavItem) => {
    if (n.pending) return false;
    if (onHome) return n.stop !== undefined && n.stop === stop;
    return n.path !== undefined && pathname.startsWith(n.path);
  };

  return (
    <nav className="hidden items-center gap-10 md:flex lg:absolute lg:left-1/2 lg:-translate-x-1/2">
      {NAV.map((n) => {
        if (n.pending) {
          return (
            <span
              key={n.label}
              className="cursor-default text-[15px] text-faint"
              title="Not built yet"
            >
              {n.label}
            </span>
          );
        }
        const current = isCurrent(n);
        return (
          <Link
            key={n.label}
            href={n.href}
            aria-current={current ? "page" : undefined}
            data-text={n.label}
            className={[
              "relative text-[15px] transition-colors",
              current ? "sx-holo text-primary-soft" : "text-text/90 hover:text-primary-soft",
            ].join(" ")}
          >
            {n.label}
            {current && <span aria-hidden="true" className="sx-holo-bar" />}
          </Link>
        );
      })}
    </nav>
  );
}
