import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /public/catalogue/packages — P3-FE-05, §7.

   Two properties only this read can break: the public select must be the
   SAME field list the sponsor read uses (athlete pay absent by construction
   — baseLow/baseHigh never selected), and the rows must be pinned to the
   configured public tenant, active only. Everything else is P4-FE-01's.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({
  env: { APP_URL: "https://sponsorx.example", PUBLIC_INTAKE_TENANT_ID: "tenant_btg" },
}));

let lastArgs: { where: Record<string, unknown>; select: Record<string, unknown> } | null = null;

vi.mock("../src/db/client", () => ({
  prisma: {
    sponsorPackage: {
      findMany: (args: typeof lastArgs) => {
        lastArgs = args;
        return Promise.resolve([
          {
            id: "pkg_1", code: "SP-01", name: "Test Drive", priceLow: 750, priceHigh: 750,
            athleteCountMin: 1, athleteCountMax: 1,
            lineItems: [{ jobCode: "SX-01", quantityPerAthlete: 2 }],
            includes: null, exclusivity: false, durationWeeks: 2,
          },
        ]);
      },
    },
  },
}));

const { listPublicPackages } = await import("../src/domain/catalogue");

beforeEach(() => {
  lastArgs = null;
});

describe("the public §7 read", () => {
  it("selects no pay column — baseLow/baseHigh are not even named", async () => {
    await listPublicPackages("tenant_btg");
    const selected = Object.keys(lastArgs!.select);
    expect(selected).not.toContain("baseLow");
    expect(selected).not.toContain("baseHigh");
    expect(selected).toEqual(
      expect.arrayContaining(["code", "name", "priceLow", "priceHigh", "lineItems"]),
    );
  });

  it("pins the rows to the given tenant, active only", async () => {
    await listPublicPackages("tenant_btg");
    expect(lastArgs!.where).toEqual({ tenantId: "tenant_btg", active: true });
  });

  it("normalises stored JSON so line items always arrive as a list", async () => {
    const [pkg] = await listPublicPackages("tenant_btg");
    expect(pkg.lineItems).toEqual([{ jobCode: "SX-01", quantityPerAthlete: 2 }]);
    expect(pkg.includes).toEqual([]);
  });
});
