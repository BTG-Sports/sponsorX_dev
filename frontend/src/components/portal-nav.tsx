"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Nav highlighting needs the current path, so this is the one client island in
   the portal chrome. Items flagged `pending` have no route yet and render as
   inert text, so the sidebar can match the mockup without anything 404ing. */

/* Path data lives in ./icons (no "use client") so server components can read
   it too — importing it from THIS module hands them client-reference proxies
   instead of strings. Re-exported here for the existing client consumers. */
import { ICONS, type NavIcon } from "./icons";

export { ICONS, type NavIcon };
export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** No route yet — renders as inert text instead of a link. */
  pending?: boolean;
};

function Glyph({ icon }: { icon: NavIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <path d={ICONS[icon]} />
    </svg>
  );
}

export function PortalNav({
  nav,
  accentBg,
  accentText,
  accentDot,
  accentWash,
  rootHref,
}: {
  nav: NavItem[];
  accentBg: string;
  accentText: string;
  /** Solid accent, e.g. "bg-sponsor" — the active item's left rail and dot. */
  accentDot: string;
  /** Gradient start, e.g. "from-sponsor/15" — the active item's wash. */
  accentWash: string;
  /** The portal's index route, which must match exactly rather than by prefix. */
  rootHref: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-3 py-2">
      {nav.map((item, i) => {
        const delay = { animationDelay: `${80 + i * 40}ms` };

        if (item.pending) {
          return (
            <span
              key={item.label}
              title="Not built yet"
              style={delay}
              className="sx-animate flex cursor-default items-center gap-3 rounded-xl px-2.5 py-1.5 text-xs font-medium text-faint"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg text-faint/80">
                <Glyph icon={item.icon} />
              </span>
              {item.label}
              <span className="ml-auto rounded-full border border-line px-1.5 py-px text-[8px] font-medium uppercase tracking-wider text-faint">
                soon
              </span>
            </span>
          );
        }

        const active =
          pathname === item.href ||
          (item.href !== rootHref && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            style={delay}
            className={[
              "sx-animate group relative flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all duration-300",
              active
                ? `bg-gradient-to-r ${accentWash} to-transparent ${accentText}`
                : "text-muted hover:bg-surface-2/70 hover:text-text",
            ].join(" ")}
          >
            {/* accent rail — scales in when the item becomes active */}
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${accentDot} transition-all duration-300 ${
                active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
              }`}
            />
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-lg transition-all duration-300 ${
                active
                  ? `${accentBg} ${accentText}`
                  : "text-faint group-hover:bg-surface-2 group-hover:text-text"
              }`}
            >
              <Glyph icon={item.icon} />
            </span>
            <span className="transition-transform duration-300 group-hover:translate-x-0.5">
              {item.label}
            </span>
            {active && (
              <span
                aria-hidden="true"
                className={`ml-auto size-1 rounded-full ${accentDot}`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
