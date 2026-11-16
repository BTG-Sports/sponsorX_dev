import { describe, expect, it } from "vitest";

import type { ApiAthleteListing } from "@/lib/athlete-listings-live";
import type { ApiInventoryItem } from "@/lib/inventory-live";
import { marketStatus, rulesLines, showcaseOf } from "@/lib/inventory-showcase";

/* POL-FE-83 — one inventory item as its showcase: the words, and where a sponsor buys it. */

const NOW = Date.parse("2026-11-16T15:00:00.000Z");

const item = (over: Partial<ApiInventoryItem> = {}): ApiInventoryItem => ({
  id: "pol83s_i1",
  athleteId: "pol83s_a1",
  propertyId: null,
  jobId: null,
  title: "Holiday youth clinic",
  description: "  Two hours on court.  ",
  kind: "CAMP",
  priceCents: 120_000,
  quantity: 2,
  availableFrom: "2026-12-03T00:00:00.000Z",
  availableUntil: null,
  categories: ["SPORTING_GOODS"],
  restrictedCategories: ["ALCOHOL"],
  packageRules: null,
  active: true,
  version: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  components: [],
  ...over,
});

const listing = (over: Partial<ApiAthleteListing> & { sellerType?: "ATHLETE" | "PROPERTY"; sellerName?: string }): ApiAthleteListing =>
  ({
    id: "pol83s_l1",
    inventoryItemId: "pol83s_i1",
    state: "PUBLISHED",
    seller: { type: over.sellerType ?? "ATHLETE", name: over.sellerName ?? "Me" },
    blockers: [],
    ...over,
  }) as unknown as ApiAthleteListing;

describe("rulesLines", () => {
  it("says each rule a sponsor should know, in order", () => {
    expect(rulesLines(null)).toEqual([]);
    expect(rulesLines({ minQuantity: 2, maxQuantity: 2 })).toEqual(["2 per order"]);
    expect(rulesLines({ minQuantity: 1, maxQuantity: 3, exclusive: true, requiresApproval: true, bundleOnly: true })).toEqual([
      "1 to 3 per order",
      "Exclusive: one sponsor for any given dates",
      "Each order is approved by the athlete first",
      "Sold only as part of a package",
    ]);
    expect(rulesLines({ maxQuantity: 4 })).toEqual(["Up to 4 per order"]);
    expect(rulesLines({ minQuantity: 0, maxQuantity: "x" })).toEqual([]);
  });
});

describe("showcaseOf", () => {
  it("keeps what sponsors never see apart", () => {
    const s = showcaseOf(item(), NOW);
    expect(s.description).toBe("Two hours on court.");
    expect(s.price).toBe("$1,200.00");
    expect(s.stock).toEqual({ label: "Only 2 left", tone: "low" });
    expect(s.when).toEqual({ label: "Opens Dec 3, 2026", tone: "soon" });
    expect(s.fits).toEqual(["Sporting goods"]);
    expect(s.private).toEqual({ wontSellTo: ["Alcohol"], version: 3, updatedAt: "2026-11-10T00:00:00.000Z" });
  });
  it("lists a package's contents with their counts", () => {
    const s = showcaseOf(
      item({ kind: "PACKAGE", components: [{ quantity: 2, component: { id: "c", title: "Reel", kind: "VIDEO", priceCents: 1 } }] }),
      NOW,
    );
    expect(s.bundle).toEqual([{ title: "Reel", kind: "VIDEO", kindLabel: "Video", quantity: 2 }]);
  });
});

describe("marketStatus", () => {
  it("names a live listing and links the athlete's own", () => {
    expect(marketStatus("pol83s_i1", [listing({})], false)).toEqual({
      tone: "live",
      label: "Live on the marketplace",
      action: { label: "Open the listing", href: "/athlete/listings/pol83s_l1" },
    });
  });
  it("names the team that lists it and links nothing the athlete can't open", () => {
    expect(marketStatus("pol83s_i1", [listing({ sellerType: "PROPERTY", sellerName: "Hawks" })], true)).toEqual({
      tone: "live",
      label: "Live on the marketplace, listed by Hawks",
      action: null,
    });
  });
  it("ignores an ended listing and offers List it, or says the team lists it", () => {
    const ended = [listing({ state: "ARCHIVED" })];
    expect(marketStatus("pol83s_i1", ended, false).action).toEqual({ label: "List it", href: "/athlete/listings/new?item=pol83s_i1" });
    expect(marketStatus("pol83s_i1", ended, true)).toEqual({ tone: "team", label: "Not on the marketplace yet. Your team lists your items.", action: null });
  });
  it("says a listing under review or paused", () => {
    expect(marketStatus("pol83s_i1", [listing({ state: "PENDING_APPROVAL" })], false).tone).toBe("wait");
    expect(marketStatus("pol83s_i1", [listing({ state: "PAUSED" })], false).label).toBe("Listed, but the listing is paused");
  });
});
