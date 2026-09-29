import { describe, expect, it } from "vitest";

import { accessFor, mayUse } from "../src/lib/admin-access";

/* Check pass C-1 — one map decides which staff roles each admin desk (and its
   nav link) is for; a missing route is open to every admin-portal role. */

describe("admin access map", () => {
  it("matches the longest prefix, so /admin/next/* shares one rule", () => {
    expect(accessFor("/admin/next/inventory")?.roles).toContain("SALES");
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
    expect(mayUse("/admin/audit", ["SALES"])).toBe(true);
    expect(mayUse("/admin", ["FINANCE"])).toBe(true);
  });

  it("BTG and super admins reach every desk", () => {
    for (const p of ["/admin/applications", "/admin/approvals", "/admin/finance", "/admin/rewards", "/admin/next/splits", "/admin/commission"]) {
      expect(mayUse(p, ["BTG_ADMIN"]), p).toBe(true);
      expect(mayUse(p, ["SUPER_ADMIN"]), p).toBe(true);
    }
  });
});
