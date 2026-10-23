import { describe, expect, it } from "vitest";

import { ADMIN_DOCK, ADMIN_NAV, navFor } from "@/lib/admin-nav";
import { resolveDock } from "@/lib/mobile-dock";
import { groupNav } from "@/lib/nav-groups";

/* The admin nav per viewer. The array is the admin layout's as it was
   (P1-ART-21 groups, P1-ART-24 dock); navFor applies the per-desk access map
   (lib/admin-access) and the commission rule to the roles staff sign in
   with. Finance has its own portal (/finance, P1-ART-25 §11) — nothing here
   is Finance-only any more. */

describe("the admin nav per viewer", () => {
  it("keeps Finance's desk under its own name, inside Money", () => {
    const money = groupNav(ADMIN_NAV).groups.find((g) => g.label === "Money")!;
    expect(money.items.map((i) => i.label)).toEqual(["Commission", "Disputes", "Finance", "Payment events", "Payouts", "Refunds to send"]);
    expect(ADMIN_NAV.some((n) => n.label === "Treasury")).toBe(false);
  });

  /* P8-FE-05 — "Deal disputes" sits with the campaign work, A to Z, and never
     under the card-payment "Disputes" name in Money. */
  it("keeps Deal disputes in Campaigns, apart from the card-payment Disputes", () => {
    const campaigns = groupNav(ADMIN_NAV).groups.find((g) => g.label === "Campaigns")!;
    expect(campaigns.items.map((i) => i.label)).toEqual(["Approvals", "Briefs", "Campaigns", "Deal disputes", "Offers", "Rewards"]);
    expect(ADMIN_NAV.filter((n) => n.label === "Disputes").map((n) => n.href)).toEqual(["/admin/payments/disputes"]);
    for (const role of ["SALES", "NETWORK_MGR", "FINANCE"]) {
      expect(navFor([role]).some((n) => n.href === "/admin/deal-disputes"), role).toBe(false);
    }
  });

  it("gives a BTG admin the whole nav: Dashboard on top, Commission theirs, the dock resolving in full", () => {
    const nav = navFor(["BTG_ADMIN"]);
    expect(nav.map((n) => n.href)).toEqual(ADMIN_NAV.map((n) => n.href));
    expect(nav[0]).toMatchObject({ href: "/admin", label: "Dashboard" });
    expect(nav.some((n) => n.href === "/admin/commission")).toBe(true);
    expect(resolveDock(ADMIN_DOCK, nav, "/admin", "/admin").map((i) => i.label)).toEqual(["Dashboard", "Approvals", "Campaigns", "Finance"]);
  });

  it("gives a super admin everything too", () => {
    const nav = navFor(["SUPER_ADMIN"]);
    expect(nav[0]).toMatchObject({ href: "/admin", label: "Dashboard" });
    expect(nav.some((n) => n.href === "/admin/commission")).toBe(true);
    expect(nav.some((n) => n.href === "/admin/finance" && n.label === "Finance")).toBe(true);
  });

  /* Guard: these pin the per-desk access map (lib/admin-access) and
     isCommissionAdmin through the actual roles staff sign in with. */
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
  it("keeps every desk the other staff roles can use, and only those", () => {
    expect(navFor(["SALES"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/sponsor-requests", "/admin/briefs", "/admin/campaigns", "/admin/offers", "/admin/next/prospects",
      "/admin/intelligence/attribution", "/admin/intelligence/forecasts", "/admin/intelligence/matching", "/admin/intelligence/pricing", "/admin/intelligence/scenarios",
    ]);
    expect(navFor(["CAMPAIGN_MGR"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/approvals", "/admin/briefs", "/admin/campaigns", "/admin/deal-disputes", "/admin/offers", "/admin/rewards", "/admin/network",
      "/admin/intelligence/anomalies", "/admin/intelligence/attribution", "/admin/intelligence/forecasts", "/admin/intelligence/make-goods",
      "/admin/intelligence/matching", "/admin/intelligence/pricing", "/admin/intelligence/scenarios", "/admin/analytics",
    ]);
    expect(navFor(["NETWORK_MGR"]).map((n) => n.href)).toEqual([
      "/admin", "/admin/applications", "/admin/campaigns", "/admin/network", "/admin/intelligence/matching", "/admin/analytics",
    ]);
  });

  /* Review follow-up — a group's glyph is built from the FULL admin nav, not
     from whichever filtered item happens to carry it: Intake's sits on
     Applications, Campaigns' on Approvals and NEXT's on Editions, all hidden
     from Sales, so a per-item scan would leave those groups glyph-less. */
  it("keeps every group's glyph when the desk that carries it is filtered out", () => {
    const { groups } = groupNav(navFor(["SALES"]));
    expect(groups.find((g) => g.label === "Intake")).toMatchObject({ icon: "inbox" });
    expect(groups.find((g) => g.label === "Campaigns")).toMatchObject({ icon: "megaphone" });
    expect(groups.find((g) => g.label === "NEXT")).toMatchObject({ icon: "book" });
  });
});
