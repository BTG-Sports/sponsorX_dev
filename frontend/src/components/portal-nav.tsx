"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type CSSProperties } from "react";

import { activeGroup, groupNav, isActiveHref, openGroupsSnapshot, parseOpenGroups, subscribeOpenGroups, writeOpenGroups, type NavGroup } from "@/lib/nav-groups";

/* Nav highlighting needs the current path, so this is the one client island in
   the portal chrome. Items flagged `pending` have no route yet and render as
   inert text, so the sidebar can match the mockup without anything 404ing.

   P1-ART-21 — items may carry a `group`: those fold into collapsible
   sections (lib/nav-groups.ts). The section holding the current page is
   open on arrival; the others remember, per browser, whether the viewer
   left them open. A nav with no groups renders flat, as before. */

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
  /** P1-ART-21 — the collapsible section this item sits in (none: at the top). */
  group?: string;
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

type Accent = { accentBg: string; accentText: string; accentDot: string; accentWash: string };

export function PortalNav({
  nav,
  accentBg,
  accentText,
  accentDot,
  accentWash,
  rootHref,
  portal = "portal",
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
  /** Keys the remembered open groups per portal. */
  portal?: string;
}) {
  const pathname = usePathname();
  const { top, groups } = groupNav(nav);
  const accent = { accentBg, accentText, accentDot, accentWash };

  if (groups.length === 0) {
    return (
      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item, i) => <Item key={item.pending ? item.label : item.href} item={item} i={i} pathname={pathname} rootHref={rootHref} {...accent} />)}
      </nav>
    );
  }
  return <GroupedNav top={top} groups={groups} pathname={pathname} rootHref={rootHref} portal={portal} {...accent} />;
}

function GroupedNav({
  top, groups, pathname, rootHref, portal, ...accent
}: { top: NavItem[]; groups: NavGroup<NavItem>[]; pathname: string; rootHref: string; portal: string } & Accent) {
  const here = activeGroup(groups, pathname, rootHref);
  /* The viewer's remembered groups (their browser's), through an external
     store: the server and the hydrating client both see none, the browser's
     memory joins right after. The current page's group is open on top of
     that — unless the viewer closed it on this visit. */
  const remembered = parseOpenGroups(useSyncExternalStore(subscribeOpenGroups, () => openGroupsSnapshot(portal), () => ""));
  const [closedHere, setClosedHere] = useState<string | null>(null);
  const open = new Set([...remembered.filter((k) => groups.some((g) => g.key === k)), ...(here && closedHere !== here ? [here] : [])]);

  const toggle = (key: string) => {
    if (open.has(key)) {
      writeOpenGroups(portal, remembered.filter((k) => k !== key));
      if (key === here) setClosedHere(key);
    } else {
      writeOpenGroups(portal, [...new Set([...remembered, key])]);
      if (key === here) setClosedHere(null);
    }
  };

  let i = 0;
  return (
    <nav className="flex-1 px-3 py-2">
      <div className="space-y-1">
        {top.map((item) => <Item key={item.href} item={item} i={i++} pathname={pathname} rootHref={rootHref} {...accent} />)}
      </div>
      {groups.map((g) => {
        const isOpen = open.has(g.key);
        const holds = g.key === here;
        const id = `nav-group-${g.key}`;
        const headIndex = i++;
        return (
          <section key={g.key} className="mt-1.5">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              aria-controls={id}
              style={{ animationDelay: `${80 + headIndex * 40}ms` } as CSSProperties}
              className={`sx-animate group/head flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                holds ? accent.accentText : "text-faint hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={`size-3 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`}>
                <path d="m9 6 6 6-6 6" />
              </svg>
              <span className="truncate">{g.label}</span>
              <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-medium tabular-nums tracking-normal ${holds && !isOpen ? `${accent.accentBg} ${accent.accentText}` : "bg-surface-2/70 text-faint"}`}>
                {g.items.length}
              </span>
            </button>
            <div id={id} hidden={!isOpen} className="space-y-1 pb-1">
              {g.items.map((item) => <Item key={item.pending ? item.label : item.href} item={item} i={i++} pathname={pathname} rootHref={rootHref} {...accent} />)}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

function Item({
  item, i, pathname, rootHref, accentBg, accentText, accentDot, accentWash,
}: { item: NavItem; i: number; pathname: string; rootHref: string } & Accent) {
  const delay = { animationDelay: `${80 + i * 40}ms` };

  if (item.pending) {
    return (
      <span
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

  const active = isActiveHref(item.href, pathname, rootHref);

  return (
    <Link
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
}
