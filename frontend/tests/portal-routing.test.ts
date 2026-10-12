import { describe, expect, it, vi } from "vitest";

/* server/portal.ts also exports requirePortalAccess, which reaches
   @/server/api (a "server-only" import) — mock it so the routing table can
   be imported without a request context. */
vi.mock("@/server/api", () => ({ fetchActor: async () => ({ status: "anonymous" }) }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

import { canOpenPortal, portalFor } from "../src/server/portal";

/* P1-ART-25 restructure (2026-10-12, owner) — Finance is its own portal,
   /finance, the way athlete and sponsor are; admin no longer admits FINANCE,
   and BTG admins never open /finance. */
describe("P1-ART-25 · the Finance portal", () => {
  it("routes a Finance-only account to /finance", () => {
    expect(portalFor(["FINANCE"])).toBe("/finance");
  });

  it("keeps a Finance account that also holds an admin-portal role on /admin (seniority)", () => {
    for (const other of ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR"]) {
      expect(portalFor(["FINANCE", other]), other).toBe("/admin");
    }
  });

  it("admits FINANCE alone to /finance, and FINANCE no longer to /admin", () => {
    expect(canOpenPortal(["FINANCE"], "finance")).toBe(true);
    expect(canOpenPortal(["FINANCE"], "admin")).toBe(false);
    for (const role of ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "SPONSOR_ADMIN", "ATHLETE"]) {
      expect(canOpenPortal([role], "finance"), role).toBe(false);
    }
  });

  it("leaves every other portal's routing as it was", () => {
    expect(portalFor(["BTG_ADMIN"])).toBe("/admin");
    expect(portalFor(["SPONSOR_ADMIN"])).toBe("/sponsor");
    expect(portalFor(["PROPERTY_MGR"])).toBe("/property");
    expect(portalFor(["ATHLETE"])).toBe("/athlete");
    expect(portalFor(["SERVICE"])).toBeNull();
  });
});
