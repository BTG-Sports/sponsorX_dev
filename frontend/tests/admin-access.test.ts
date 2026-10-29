import { describe, expect, it } from "vitest";

import { accessFor, mayUse } from "../src/lib/admin-access";

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

  /* Review follow-up — a Campaigns sub-page (a single order, unmapped like
     its parent) stays open to every admin-portal role, Finance and network
     managers included — the money-only-roles bug (§5) is about the Vault
     switch, never about Campaigns access itself. */
  it("keeps an unmapped desk's sub-pages open too", () => {
    expect(mayUse("/admin/campaigns/c_1", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/campaigns/c_1", ["NETWORK_MGR"])).toBe(true);
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

/* P8-FE-05 — the deal dispute desk (P8-BE-03): BTG admin decides, campaign
   managers read; Finance has its own twin under /finance, Sales and network
   managers have no read. The detail page shares the list's rule. */
describe("the deal dispute desk", () => {
  it("is BTG admin's and campaign managers', detail included", () => {
    for (const role of ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"]) {
      expect(mayUse("/admin/deal-disputes", [role]), role).toBe(true);
      expect(mayUse("/admin/deal-disputes/dd_1", [role]), role).toBe(true);
    }
    for (const role of ["FINANCE", "SALES", "NETWORK_MGR"]) {
      expect(mayUse("/admin/deal-disputes", [role]), role).toBe(false);
    }
    expect(accessFor("/admin/deal-disputes/dd_1")).toBe(accessFor("/admin/deal-disputes"));
    /* The card-payment Disputes desk keeps its own, different rule. */
    expect(mayUse("/admin/payments/disputes", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/payments/disputes", ["CAMPAIGN_MGR"])).toBe(false);
  });
});

/* P8-FE-12 — held cancel / change requests (P8-BE-12): BTG admins and
   campaign managers approve or decline; nobody else sees the desk. */
describe("the campaign requests desk", () => {
  it("is BTG admin's and campaign managers'", () => {
    for (const role of ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"]) {
      expect(mayUse("/admin/campaign-requests", [role]), role).toBe(true);
    }
    for (const role of ["FINANCE", "SALES", "NETWORK_MGR"]) {
      expect(mayUse("/admin/campaign-requests", [role]), role).toBe(false);
    }
  });
});

/* Review follow-up — "/admin/next" governs no page of its own (every real
   desk below it — editions, inventory, prospects, rights, splits — has its
   own, narrower entry); it is only the fallback for a future desk with none
   yet, so it no longer opens to Sales or Finance by default. */
describe("the /admin/next fallback", () => {
  it("is BTG-admin only, and never shadows a desk's own entry", () => {
    expect(mayUse("/admin/next", ["SALES"])).toBe(false);
    expect(mayUse("/admin/next", ["FINANCE"])).toBe(false);
    expect(mayUse("/admin/next", ["BTG_ADMIN"])).toBe(true);
    expect(mayUse("/admin/next/prospects", ["SALES"])).toBe(true);
    expect(mayUse("/admin/next/splits", ["FINANCE"])).toBe(true);
  });
});
