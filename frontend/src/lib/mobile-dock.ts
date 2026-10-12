/* --------------------------------------------------------------------------
   The mobile dock — P1-ART-24 (2026-10-12; owner: "add a wow factor +
   awwwaaard on mobile view navigation"). Pure: the dock component, the menu
   sheet and tests/mobile-dock.test.ts.

   - `resolveDock`: each portal's layout names four hrefs; this turns them
     into items with the nav's own label and glyph and lights the current
     page the way the sidebar does (isActiveHref). An href the viewer's nav
     does not carry is skipped, not an error: the admin nav is filtered per
     role (lib/admin-access), so FINANCE has no Approvals to dock.
   - `sheetGroups`: the menu shows the group holding the current page first.
   - `dockScroll`: when the dock slides away and comes back.
   -------------------------------------------------------------------------- */

import { isActiveHref, type GroupedItem, type NavGroup } from "./nav-groups";

type DockSource = { href: string; label: string; icon: string; pending?: boolean };
export type DockItem<T extends DockSource = DockSource> = T & { active: boolean };

export function resolveDock<T extends DockSource>(hrefs: readonly string[], nav: readonly T[], pathname: string, rootHref: string): DockItem<T>[] {
  const out: DockItem<T>[] = [];
  for (const href of hrefs) {
    const item = nav.find((n) => n.href === href && !n.pending);
    if (item) out.push({ ...item, active: isActiveHref(item.href, pathname, rootHref) });
  }
  return out;
}

/** The menu's groups, the one holding the current page first, the rest in order. */
export function sheetGroups<T extends GroupedItem>(groups: readonly NavGroup<T>[], pathname: string, rootHref: string): NavGroup<T>[] {
  const here = groups.findIndex((g) => g.items.some((i) => !i.pending && isActiveHref(i.href, pathname, rootHref)));
  return here <= 0 ? [...groups] : [groups[here], ...groups.slice(0, here), ...groups.slice(here + 1)];
}

/* -------------------------------------------------------------- scrolling
   The dock hides on a decisive scroll down (more than the threshold from
   where it last settled — small steps add up) and comes back on any scroll
   up, at the top and at the end of the page. It never hides while focus is
   inside it, nor under reduced motion. `lastY` is the anchor; returning the
   same object when nothing changed lets a caller skip the update. */
export const DOCK_SCROLL_THRESHOLD = 8;
export type DockScroll = { hidden: boolean; lastY: number };
export type DockScrollInput = { y: number; maxY: number; focusWithin?: boolean; reducedMotion?: boolean };

export function dockScroll(state: DockScroll, { y, maxY, focusWithin = false, reducedMotion = false }: DockScrollInput): DockScroll {
  const T = DOCK_SCROLL_THRESHOLD;
  if (reducedMotion || focusWithin || y <= T || y >= maxY - T) {
    return !state.hidden && state.lastY === y ? state : { hidden: false, lastY: y };
  }
  const delta = y - state.lastY;
  if (delta < 0) return { hidden: false, lastY: y };
  if (state.hidden) return delta > 0 ? { hidden: true, lastY: y } : state;
  return delta > T ? { hidden: true, lastY: y } : state;
}
