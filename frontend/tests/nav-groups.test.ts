import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { activeGroup, groupNav, isActiveHref } from "../src/lib/nav-groups";

/* P1-ART-21 — the sidebar's collapsible groups (owner: "too many …
   collapsable … sort them orderly"). */

describe("P1-ART-21 · sidebar groups", () => {
  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/applications", label: "Applications", group: "Intake" },
    { href: "/admin/onboarding", label: "Onboarding", group: "Intake" },
    { href: "/admin/finance", label: "Finance", group: "Money" },
    { href: "/admin/next/rights", label: "Rights", group: "NEXT", pending: true },
  ];

  it("keeps ungrouped items on top and folds the rest into groups in order of first appearance", () => {
    const g = groupNav(nav);
    expect(g.top.map((i) => i.label)).toEqual(["Dashboard"]);
    expect(g.groups.map((x) => [x.key, x.label, x.items.map((i) => i.label)])).toEqual([
      ["intake", "Intake", ["Applications", "Onboarding"]],
      ["money", "Money", ["Finance"]],
      ["next", "NEXT", ["Rights"]],
    ]);
    expect(groupNav([{ href: "/x", label: "X" }]).groups).toEqual([]);
  });

  it("opens the group holding the current page — the root exactly, a desk by prefix, never a pending item", () => {
    const { groups } = groupNav(nav);
    expect(activeGroup(groups, "/admin/onboarding/abc", "/admin")).toBe("intake");
    expect(activeGroup(groups, "/admin", "/admin")).toBeNull();
    expect(activeGroup(groups, "/admin/next/rights", "/admin")).toBeNull();
    expect(isActiveHref("/admin", "/admin/finance", "/admin")).toBe(false);
    expect(isActiveHref("/admin/finance", "/admin/finance/x", "/admin")).toBe(true);
  });

  it("the admin nav: Dashboard on top, every other desk in a group, each group sorted A → Z", () => {
    const src = readFileSync(new URL("../src/app/(app)/admin/layout.tsx", import.meta.url), "utf8");
    const items = [...src.matchAll(/\{ href: "([^"]+)", label: "([^"]+)", icon: "[a-z]+"(?:, group: "([^"]+)")? \}/g)].map((m) => ({ href: m[1]!, label: m[2]!, group: m[3] }));
    expect(items.length).toBeGreaterThan(25);
    const { top, groups } = groupNav(items);
    expect(top.map((i) => i.label)).toEqual(["Dashboard"]);
    expect(groups.map((g) => g.label)).toEqual(["Intake", "Campaigns", "Marketplace", "Money", "Accounts", "NEXT", "System"]);
    for (const g of groups) {
      const labels = g.items.map((i) => i.label);
      expect(labels, g.label).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    }
  });
});
