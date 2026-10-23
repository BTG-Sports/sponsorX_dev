import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FINANCE_DOCK, FINANCE_NAV } from "../src/lib/finance-nav";
import { resolveDock } from "../src/lib/mobile-dock";
import { groupNav } from "../src/lib/nav-groups";

/* P1-ART-25 restructure (2026-10-12, owner) — Finance's own portal,
   /finance: the Treasury on top, the money desks and NEXT Splits in groups,
   every link inside the portal (memory portal-views-stay-in-portal). */

const page = (href: string) => {
  const rest = href.replace(/^\/finance/, "");
  const dir = rest ? `../src/app/(app)/finance${rest}` : "../src/app/(app)/finance/(treasury)";
  return new URL(`${dir}/page.tsx`, import.meta.url);
};

describe("P1-ART-25 · the Finance portal's nav", () => {
  it("Treasury alone on top; Money and NEXT grouped, desks A to Z, each group with a glyph", () => {
    const { top, groups } = groupNav(FINANCE_NAV);
    expect(top.map((i) => [i.label, i.href])).toEqual([["Treasury", "/finance"]]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ["Money", ["Deal disputes", "Disputes", "Payment events", "Payouts", "Refunds to send"]],
      ["NEXT", ["Splits"]],
    ]);
    expect(groups.every((g) => g.icon)).toBe(true);
  });

  it("every link stays inside /finance and has a page", () => {
    for (const n of FINANCE_NAV) {
      expect(n.href, n.label).toMatch(/^\/finance(\/|$)/);
      expect(existsSync(page(n.href)), `${n.href} has a page`).toBe(true);
    }
  });

  it("no Commission and no admin desk here — those stay BTG admin's", () => {
    expect(FINANCE_NAV.map((n) => n.label)).not.toContain("Commission");
    expect(FINANCE_NAV.some((n) => n.href.startsWith("/admin"))).toBe(false);
  });

  it("the dock: Treasury, Payouts, Refunds, Disputes — all four resolve against the nav", () => {
    expect(FINANCE_DOCK).toEqual(["/finance", "/finance/payouts", "/finance/refunds", "/finance/disputes"]);
    expect(resolveDock(FINANCE_DOCK, FINANCE_NAV, "/finance", "/finance").map((d) => d.label)).toEqual([
      "Treasury", "Payouts", "Refunds to send", "Disputes",
    ]);
  });

  it("no page in the portal links, revalidates or redirects into /admin (except the marketplace cache key)", () => {
    const files = [
      "(treasury)/page.tsx", "(treasury)/books.tsx", "payouts/page.tsx", "payouts/[id]/page.tsx", "payouts/actions.ts",
      "refunds/page.tsx", "refunds/actions.ts", "payment-events/page.tsx", "payment-events/actions.ts",
      "disputes/page.tsx", "disputes/[id]/page.tsx", "disputes/actions.ts", "splits/page.tsx", "splits/live-splits.tsx", "splits/actions.ts",
      /* P8-FE-05 — the read-only deal-dispute twin and the held-earning "why" note stay inside /finance too. */
      "deal-disputes/page.tsx", "deal-disputes/[id]/page.tsx",
    ];
    for (const f of files) {
      const code = readFileSync(new URL(`../src/app/(app)/finance/${f}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const hits = [...code.matchAll(/["'`]\/admin[^"'`]*["'`]/g)].map((m) => m[0]).filter((h) => h !== '"/admin/marketplace"');
      expect(hits, f).toEqual([]);
    }
  });
});
