import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ADMIN_DOCK, ADMIN_NAV, FINANCE_DOCK, dockFor, navFor, rootFor } from "@/lib/admin-nav";
import { resolveDock } from "@/lib/mobile-dock";
import { groupNav } from "@/lib/nav-groups";
import type { VaultMode } from "@/lib/vault-routes";

/* P1-ART-25 (spec §2) — Finance lands on the Treasury, and the admin shell
   switches to the Vault on a money desk, never on any other screen. */

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("P1-ART-25 · the admin nav per viewer", () => {
  it("relabels Finance's home Treasury, at the foot of Money", () => {
    const money = groupNav(ADMIN_NAV).groups.find((g) => g.label === "Money")!;
    expect(money.items.at(-1)).toMatchObject({ href: "/admin/finance", label: "Treasury" });
    expect(ADMIN_NAV.some((n) => n.label === "Finance")).toBe(false);
  });

  it("leaves a BTG admin's nav as it was: Dashboard on top, Treasury in Money, Commission theirs", () => {
    const nav = navFor(["BTG_ADMIN"]);
    expect(nav[0]).toMatchObject({ href: "/admin", label: "Dashboard" });
    expect(nav.filter((n) => n.href === "/admin/finance")).toEqual([expect.objectContaining({ label: "Treasury", group: "Money" })]);
    expect(nav.some((n) => n.href === "/admin/commission")).toBe(true);
    expect(rootFor(["BTG_ADMIN"])).toBe("/admin");
    expect(dockFor(["BTG_ADMIN"])).toBe(ADMIN_DOCK);
  });

  it("puts Treasury on top for a Finance-only viewer, in Dashboard's place, listed once", () => {
    const nav = navFor(["FINANCE"]);
    const { top, groups } = groupNav(nav);
    expect(top).toEqual([{ href: "/admin/finance", label: "Treasury", icon: "wallet" }]);
    expect(nav.filter((n) => n.href === "/admin/finance")).toHaveLength(1);
    expect(nav.some((n) => n.href === "/admin")).toBe(false);
    expect(nav.some((n) => n.href === "/admin/commission")).toBe(false);
    /* their Money group keeps its glyph without Commission */
    expect(groups.find((g) => g.label === "Money")).toMatchObject({ icon: "wallet" });
    expect(groups.find((g) => g.label === "Money")!.items.map((i) => i.label)).toEqual(["Disputes", "Payment events", "Payouts", "Refunds to send"]);
  });

  it("roots a Finance-only viewer at the Treasury and docks their four desks", () => {
    expect(rootFor(["FINANCE"])).toBe("/admin/finance");
    expect(dockFor(["FINANCE"])).toBe(FINANCE_DOCK);
    const nav = navFor(["FINANCE"]);
    expect(resolveDock(FINANCE_DOCK, nav, "/admin/finance", "/admin/finance").map((i) => [i.label, i.active])).toEqual([
      ["Treasury", true],
      ["Payouts", false],
      ["Refunds to send", false],
      ["Disputes", false],
    ]);
    /* the other desks still light by prefix under the Treasury root */
    expect(resolveDock(FINANCE_DOCK, nav, "/admin/payouts/po_1", "/admin/finance").map((i) => i.active)).toEqual([false, true, false, false]);
  });

  it("treats Finance with another staff role as staff: the board stays home", () => {
    expect(rootFor(["FINANCE", "SALES"])).toBe("/admin");
    expect(navFor(["FINANCE", "SALES"])[0]).toMatchObject({ href: "/admin", label: "Dashboard" });
  });

  /* Guard: if the layout stopped calling navFor/rootFor/dockFor, nothing
     above would fail — these pin the per-desk access map (lib/admin-access)
     and isCommissionAdmin through the actual roles staff sign in with. */
  it("hides both money desks from a campaign manager and from sales", () => {
    for (const role of ["CAMPAIGN_MGR", "SALES"]) {
      const nav = navFor([role]);
      expect(nav.some((n) => n.href === "/admin/commission"), role).toBe(false);
      expect(nav.some((n) => n.href === "/admin/finance"), role).toBe(false);
    }
  });

  it("hides the money desks from an athlete network manager too", () => {
    const nav = navFor(["NETWORK_MGR"]);
    for (const href of ["/admin/commission", "/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments/events", "/admin/payments/disputes"]) {
      expect(nav.some((n) => n.href === href), href).toBe(false);
    }
  });

  /* P1-ART-25 follow-up — a desk the API refuses a role is not in its nav
     (lib/admin-access), so nothing listed says "outside your role". */
  it("lists a Finance-only viewer exactly the desks the API lets Finance use", () => {
    expect(navFor(["FINANCE"]).map((n) => n.href)).toEqual([
      "/admin/finance",
      "/admin/campaigns",
      "/admin/payments/disputes",
      "/admin/payments/events",
      "/admin/payouts",
      "/admin/refunds",
      "/admin/next/splits",
    ]);
  });

  it("keeps every desk the other staff roles can use, and only those", () => {
    expect(navFor(["SALES"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/sponsor-requests", "/admin/briefs", "/admin/campaigns", "/admin/offers", "/admin/next/prospects",
    ]);
    expect(navFor(["CAMPAIGN_MGR"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/approvals", "/admin/briefs", "/admin/campaigns", "/admin/offers", "/admin/rewards", "/admin/network", "/admin/analytics",
    ]);
    expect(navFor(["NETWORK_MGR"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/applications", "/admin/campaigns", "/admin/network", "/admin/analytics",
    ]);
  });

  it("still lists every desk for a BTG admin", () => {
    expect(navFor(["BTG_ADMIN"]).map((n) => n.href)).toEqual(ADMIN_NAV.map((n) => n.href));
  });

  it("gives a super admin everything: Dashboard on top, Commission and Treasury both present", () => {
    const nav = navFor(["SUPER_ADMIN"]);
    expect(nav[0]).toMatchObject({ href: "/admin", label: "Dashboard" });
    expect(nav.some((n) => n.href === "/admin/commission")).toBe(true);
    expect(nav.some((n) => n.href === "/admin/finance" && n.label === "Treasury")).toBe(true);
  });
});

describe("P1-ART-25 · the shell root switches on money routes", async () => {
  const { StageRoot } = await import("@/components/stage-root");
  const render = (path: string, vault: VaultMode = "money") => {
    pathname = path;
    return renderToStaticMarkup(createElement(StageRoot, { className: "flex sx-ops", vault } as Parameters<typeof StageRoot>[0], "x"));
  };

  it("adds sx-vault and data-vault on a money desk", () => {
    for (const p of ["/admin/finance", "/admin/payouts", "/admin/payments/disputes/d_1", "/admin/commission"]) {
      expect(render(p), p).toBe('<div class="flex sx-ops sx-vault" data-vault="">x</div>');
    }
  });

  it("leaves Mission Control alone everywhere else, and when the shell is not asked to switch", () => {
    expect(render("/admin")).toBe('<div class="flex sx-ops">x</div>');
    expect(render("/admin/campaigns")).toBe('<div class="flex sx-ops">x</div>');
    expect(render("/admin/payouts", "off")).toBe('<div class="flex sx-ops">x</div>');
  });

  it("is the Vault on every page for a Finance-only viewer (mode all)", () => {
    for (const p of ["/admin/campaigns", "/admin/next/splits", "/admin/finance"]) {
      expect(render(p, "all"), p).toBe('<div class="flex sx-ops sx-vault" data-vault="">x</div>');
    }
  });
});
