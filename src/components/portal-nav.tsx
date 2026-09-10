"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Nav highlighting needs the current path, so this is the one client island in
   the portal chrome. Items flagged `pending` have no route yet and render as
   inert text, so the sidebar can match the mockup without anything 404ing. */

const ICONS = {
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  store: "M3 9h18l-1.5-5H4.5L3 9Zm1 0v11h16V9M9 20v-6h6v6",
  megaphone: "M3 11v2l14 5V6L3 11Zm0 0H2v2h1m14-1h4M9 19v2",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  gift: "M3 11h18v9H3v-9Zm0-4h18v4H3V7Zm9 0v13M8.5 7a2.5 2.5 0 1 1 3.5-3.2A2.5 2.5 0 1 1 15.5 7",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0m2.5-9a3 3 0 0 0 0-6m3.5 15a6 6 0 0 0-4-5.6",
  card: "M3 7h18v12H3V7Zm0 4h18M16 15h2",
  mail: "M3 6h18v12H3V6Zm0 0 9 7 9-7",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5-.1-1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15.4 3h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.4h4l.4-2.4a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6.1-1Z",
  inbox: "M3 12h5l1 3h6l1-3h5M5 5h14l2 7v7H3v-7l2-7Z",
  calendar: "M4 5h16v16H4V5Zm0 5h16M9 3v4m6-4v4",
  wallet: "M3 7h18v12H3V7Zm0 4h18M16 15h2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  file: "M6 3h8l4 4v14H6V3Zm8 0v4h4",
} as const;

export type NavIcon = keyof typeof ICONS;
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
  rootHref,
}: {
  nav: NavItem[];
  accentBg: string;
  accentText: string;
  /** The portal's index route, which must match exactly rather than by prefix. */
  rootHref: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-2 py-2">
      {nav.map((item) => {
        if (item.pending) {
          return (
            <span
              key={item.label}
              title="Not built yet"
              className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-faint"
            >
              <Glyph icon={item.icon} />
              {item.label}
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
            className={[
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              active
                ? `${accentBg} ${accentText}`
                : "text-muted hover:bg-surface-2 hover:text-text",
            ].join(" ")}
          >
            <Glyph icon={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
