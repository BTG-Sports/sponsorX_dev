/* --------------------------------------------------------------------------
   Sidebar groups — P1-ART-21 (2026-10-07; owner: "restructure the
   navigation buttons in the side, its too many, if its possible to have a
   collapsable please do so … and sort them orderly").

   A nav item may name a `group`. Items without one stay at the top
   (Dashboard); the rest fold into collapsible sections, in the order the
   groups first appear, with the items in the order given — the admin nav
   sorts each group alphabetically. A nav with no groups renders as before,
   so the other portals are untouched.

   Pure: used by the sidebar, the phone drawer and the tests.
   -------------------------------------------------------------------------- */

export type GroupedItem = { href: string; label: string; group?: string; pending?: boolean; /** The group's glyph — set on one item of the group. */ groupIcon?: string };

export type NavGroup<T extends GroupedItem> = { key: string; label: string; items: T[]; icon?: string };

export function groupNav<T extends GroupedItem>(nav: readonly T[]): { top: T[]; groups: NavGroup<T>[] } {
  const top: T[] = [];
  const groups: NavGroup<T>[] = [];
  for (const item of nav) {
    if (!item.group) {
      top.push(item);
      continue;
    }
    let g = groups.find((x) => x.label === item.group);
    if (!g) {
      g = { key: item.group.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: item.group, items: [] };
      groups.push(g);
    }
    if (item.groupIcon && !g.icon) g.icon = item.groupIcon;
    g.items.push(item);
  }
  return { top, groups };
}

/** Is `href` the page at `pathname`? The portal's root matches exactly; anything else by prefix. */
export function isActiveHref(href: string, pathname: string, rootHref: string): boolean {
  return pathname === href || (href !== rootHref && pathname.startsWith(`${href}/`));
}

/** The group holding the current page, if any — it opens on arrival. */
export function activeGroup<T extends GroupedItem>(groups: readonly NavGroup<T>[], pathname: string, rootHref: string): string | null {
  return groups.find((g) => g.items.some((i) => !i.pending && isActiveHref(i.href, pathname, rootHref)))?.key ?? null;
}

/** P1-ART-25 review — a role's nav is `full` filtered down to what it may
 *  use; a group's glyph lived on exactly one item (`groupIcon`), so if that
 *  item was filtered out, `groupNav`'s per-item scan never saw it and the
 *  whole group rendered without a glyph (Campaigns and NEXT, for a
 *  Finance-only viewer, lost "megaphone" and "book").
 *
 *  The glyph is really a property of the GROUP, not of whichever item
 *  happens to carry it, so build the group → icon map from the full,
 *  unfiltered list first, then stamp it onto the first surviving item of
 *  each group that doesn't already carry one — `groupNav` needs no change,
 *  it still just reads `groupIcon` off whatever reaches it. */
export function stampGroupIcons<T extends GroupedItem>(kept: readonly T[], full: readonly T[]): T[] {
  const icons = new Map<string, T["groupIcon"]>();
  for (const item of full) {
    if (item.group && item.groupIcon && !icons.has(item.group)) icons.set(item.group, item.groupIcon);
  }
  const stamped = new Set<string>();
  return kept.map((item) => {
    if (!item.group || item.groupIcon || stamped.has(item.group)) return item;
    const icon = icons.get(item.group);
    if (!icon) return item;
    stamped.add(item.group);
    return { ...item, groupIcon: icon };
  });
}

/** Which groups a viewer left open — their own browser's convenience, never
 *  shared. Read through useSyncExternalStore (the sidebar), so the server
 *  and the hydrating client agree on "none" and the browser's memory joins
 *  right after, with no state set in an effect. */
export const NAV_OPEN_KEY = (portal: string) => `sx-nav-open:${portal}`;
const listeners = new Set<() => void>();
export function subscribeOpenGroups(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
/** The stored value as written (a stable string, for useSyncExternalStore); "" when none or blocked. */
export function openGroupsSnapshot(portal: string): string {
  try {
    return window.localStorage.getItem(NAV_OPEN_KEY(portal)) ?? "";
  } catch {
    return "";
  }
}
export function parseOpenGroups(raw: string): string[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function readOpenGroups(portal: string): string[] {
  return parseOpenGroups(openGroupsSnapshot(portal));
}
export function writeOpenGroups(portal: string, open: readonly string[]): void {
  try {
    window.localStorage.setItem(NAV_OPEN_KEY(portal), JSON.stringify(open));
  } catch {
    /* private window, blocked storage — the groups just open fresh next time */
  }
  for (const cb of listeners) cb();
}
