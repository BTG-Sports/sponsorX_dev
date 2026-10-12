import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_DOCK, ADMIN_NAV } from "../src/lib/admin-nav";
import { DOCK_SCROLL_THRESHOLD, dockScroll, resolveDock, sheetGroups, type DockScroll } from "../src/lib/mobile-dock";
import { groupNav } from "../src/lib/nav-groups";
import { SPONSOR_NAV } from "../src/lib/sponsor-nav";

/* P1-ART-24 — the mobile dock: which four destinations it carries, which one
   is lit, and when it slides away. */

const nav = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/approvals", label: "Approvals", icon: "inbox", group: "Campaigns" },
  { href: "/admin/campaigns", label: "Campaigns", icon: "megaphone", group: "Campaigns" },
  { href: "/admin/finance", label: "Finance", icon: "wallet", group: "Money" },
  { href: "/admin/audit", label: "Audit log", icon: "file", group: "System" },
  { href: "#", label: "Billing", icon: "card", group: "Account", pending: true },
];

describe("P1-ART-24 · dock items", () => {
  it("takes the hrefs in the order given, with the nav's label and glyph", () => {
    const items = resolveDock(["/admin", "/admin/campaigns", "/admin/approvals"], nav, "/admin", "/admin");
    expect(items.map((i) => [i.href, i.label, i.icon])).toEqual([
      ["/admin", "Dashboard", "grid"],
      ["/admin/campaigns", "Campaigns", "megaphone"],
      ["/admin/approvals", "Approvals", "inbox"],
    ]);
  });

  it("lights the current page — exactly for the root, by prefix for a detail page", () => {
    const dock = ["/admin", "/admin/campaigns", "/admin/finance"];
    expect(resolveDock(dock, nav, "/admin", "/admin").map((i) => i.active)).toEqual([true, false, false]);
    expect(resolveDock(dock, nav, "/admin/campaigns/c-42", "/admin").map((i) => i.active)).toEqual([false, true, false]);
    /* a page not on the dock lights nothing (the root never matches by prefix) */
    expect(resolveDock(dock, nav, "/admin/audit", "/admin").some((i) => i.active)).toBe(false);
  });

  it("skips an href the viewer's nav does not carry (a desk their role cannot use) and a pending one", () => {
    const items = resolveDock(["/admin", "/admin/approvals", "/admin/nope", "#"], nav, "/admin", "/admin");
    expect(items.map((i) => i.href)).toEqual(["/admin", "/admin/approvals"]);
  });

  it("each portal's layout docks four hrefs that its nav carries", () => {
    const root = path.resolve(__dirname, "../src");
    const read = (p: string) => readFileSync(path.join(root, p), "utf8");
    const docked = (src: string) => {
      const m = src.match(/const DOCK = \[([^\]]*)\]/);
      expect(m, "a `const DOCK = [...]` array").toBeTruthy();
      return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    };
    const cases: [string, string][] = [
      ["app/(app)/athlete/layout.tsx", read("app/(app)/athlete/layout.tsx")],
      ["app/(app)/sponsor/layout.tsx", read("lib/sponsor-nav.ts")],
    ];
    for (const [layout, navSrc] of cases) {
      const hrefs = docked(read(layout));
      expect(hrefs, layout).toHaveLength(4);
      for (const h of hrefs) expect(navSrc, `${layout} docks ${h}`).toContain(`href: "${h}"`);
    }
    /* P1-ART-25 — the admin's dock and nav are real arrays in lib/admin-nav.ts
       (the Finance-only dock is pinned in admin-nav.test.ts) */
    expect(ADMIN_DOCK).toHaveLength(4);
    expect(resolveDock(ADMIN_DOCK, ADMIN_NAV, "/admin", "/admin")).toHaveLength(4);
    /* the sponsor's resolves fully against the real array */
    expect(resolveDock(docked(read("app/(app)/sponsor/layout.tsx")), SPONSOR_NAV, "/sponsor", "/sponsor")).toHaveLength(4);
  });
});

describe("P1-ART-24 · the menu's groups", () => {
  it("puts the group holding the current page first and keeps the rest in order", () => {
    const { groups } = groupNav(nav);
    expect(sheetGroups(groups, "/admin/finance", "/admin").map((g) => g.label)).toEqual(["Money", "Campaigns", "System", "Account"]);
    expect(sheetGroups(groups, "/admin", "/admin").map((g) => g.label)).toEqual(["Campaigns", "Money", "System", "Account"]);
  });
});

describe("P1-ART-24 · dock scroll", () => {
  const T = DOCK_SCROLL_THRESHOLD;
  const at = (lastY: number, hidden = false): DockScroll => ({ hidden, lastY });
  const page = { maxY: 2000 };

  it("uses an 8px threshold", () => expect(T).toBe(8));

  it("hides on a decisive scroll down, not on a nudge", () => {
    expect(dockScroll(at(100), { y: 100 + T + 1, ...page }).hidden).toBe(true);
    const nudge = dockScroll(at(100), { y: 100 + T - 1, ...page });
    expect(nudge.hidden).toBe(false);
    /* a nudge keeps the anchor, so small steps add up to a decisive one */
    expect(nudge.lastY).toBe(100);
    expect(dockScroll(nudge, { y: 100 + T + 2, ...page }).hidden).toBe(true);
  });

  it("comes back on any scroll up", () => {
    expect(dockScroll(at(400, true), { y: 399, ...page }).hidden).toBe(false);
  });

  it("stays hidden while the scroll keeps going down, following it", () => {
    const s = dockScroll(at(400, true), { y: 403, ...page });
    expect(s).toEqual({ hidden: true, lastY: 403 });
    expect(dockScroll(s, { y: 402, ...page }).hidden).toBe(false);
  });

  it("shows at the top of the page and at its end", () => {
    expect(dockScroll(at(30, true), { y: 0, ...page }).hidden).toBe(false);
    expect(dockScroll(at(1980, true), { y: 1995, ...page }).hidden).toBe(false);
    /* a page that does not scroll at all */
    expect(dockScroll(at(0), { y: 40, maxY: 0 }).hidden).toBe(false);
  });

  it("never hides while focus is inside the dock, or with reduced motion", () => {
    expect(dockScroll(at(100), { y: 300, ...page, focusWithin: true }).hidden).toBe(false);
    expect(dockScroll(at(100, true), { y: 300, ...page, focusWithin: true }).hidden).toBe(false);
    expect(dockScroll(at(100), { y: 300, ...page, reducedMotion: true }).hidden).toBe(false);
  });

  it("returns the same state when nothing changes, so React can bail out", () => {
    const s = at(100);
    expect(dockScroll(s, { y: 103, ...page })).toBe(s);
  });
});
