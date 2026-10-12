import { describe, expect, it } from "vitest";

import { accessFor, isFinanceOnly, mayUse } from "../src/lib/admin-access";

/* Check pass C-1 — one map decides which staff roles each admin desk (and its
   nav link) is for; a missing route is open to every admin-portal role. */

describe("admin access map", () => {
  it("matches the longest prefix, so a desk's pages share its rule", () => {
    expect(accessFor("/admin/next/inventory/x")).toBe(accessFor("/admin/next/inventory"));
    expect(accessFor("/admin/next/prospects")?.roles).toContain("SALES");
    expect(accessFor("/admin/campaigns/match")?.roles).toContain("NETWORK_MGR");
    expect(accessFor("/admin/campaigns")).toBeNull();
  });

  it("keeps each role to its desks", () => {
    expect(mayUse("/admin/approvals", ["FINANCE"])).toBe(false);
    expect(mayUse("/admin/finance", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/applications", ["SALES"])).toBe(false);
    expect(mayUse("/admin/applications", ["NETWORK_MGR"])).toBe(true);
    expect(mayUse("/admin/next/editions", ["CAMPAIGN_MGR"])).toBe(false);
    expect(mayUse("/admin/rewards", ["CAMPAIGN_MGR"])).toBe(true);
    expect(mayUse("/admin/commission", ["FINANCE"])).toBe(false);
  });

  it("any one matching role is enough, and unmapped desks are open", () => {
    expect(mayUse("/admin/approvals", ["FINANCE", "CAMPAIGN_MGR"])).toBe(true);
    expect(mayUse("/admin/campaigns", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin", ["FINANCE"])).toBe(true);
  });

  it("BTG and super admins reach every desk", () => {
    for (const p of ["/admin/applications", "/admin/approvals", "/admin/finance", "/admin/rewards", "/admin/next/splits", "/admin/commission"]) {
      expect(mayUse(p, ["BTG_ADMIN"]), p).toBe(true);
      expect(mayUse(p, ["SUPER_ADMIN"]), p).toBe(true);
    }
  });
});

/* P1-ART-25 follow-up — desks the API refuses a role are mapped, so the nav
   hides them and the page says "not in your role" (backend auth/policy.ts). */
describe("desks pinned to what the API enforces", () => {
  it("keeps Finance off the desks it cannot read, and on the splits it locks", () => {
    for (const p of ["/admin/briefs", "/admin/network", "/admin/analytics", "/admin/audit", "/admin/integrations", "/admin/next/editions", "/admin/next/inventory", "/admin/next/rights"]) {
      expect(mayUse(p, ["FINANCE"]), p).toBe(false);
    }
    expect(mayUse("/admin/next/splits", ["FINANCE"])).toBe(true);
  });
  it("leaves each other role the desks its reads allow", () => {
    expect(mayUse("/admin/briefs", ["SALES"])).toBe(true);
    expect(mayUse("/admin/briefs", ["CAMPAIGN_MGR"])).toBe(true);
    expect(mayUse("/admin/briefs", ["NETWORK_MGR"])).toBe(false);
    for (const role of ["CAMPAIGN_MGR", "NETWORK_MGR"]) {
      expect(mayUse("/admin/network", [role]), role).toBe(true);
      expect(mayUse("/admin/analytics", [role]), role).toBe(true);
    }
    for (const role of ["SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE"]) {
      expect(mayUse("/admin/audit", [role]), role).toBe(false);
      expect(mayUse("/admin/integrations", [role]), role).toBe(false);
    }
  });
});

describe("isFinanceOnly", () => {
  it("only when FINANCE is the sole admin-portal role", () => {
    expect(isFinanceOnly(["FINANCE"])).toBe(true);
    expect(isFinanceOnly(["FINANCE", "BTG_ADMIN"])).toBe(false);
    expect(isFinanceOnly(["FINANCE", "SALES"])).toBe(false);
    expect(isFinanceOnly(["BTG_ADMIN"])).toBe(false);
    expect(isFinanceOnly([])).toBe(false);
  });
  it("ignores roles that are not admin-portal roles", () => expect(isFinanceOnly(["FINANCE", "ATHLETE"])).toBe(true));
});
