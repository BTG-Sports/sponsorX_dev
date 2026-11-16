import { describe, expect, it } from "vitest";

import type { ApiInventoryItem } from "@/lib/inventory-live";
import { blurbOf, listingFor, marketBadge, shopCard, shopTab, shopTabs, stockOf, tabPatch, tabQuery, whenOf } from "@/lib/inventory-shop";
import type { ApiAthleteListing } from "@/lib/athlete-listings-live";

/* POL-FE-83 — the words on the athlete's inventory cards and its tabs. */

const NOW = Date.parse("2026-11-16T15:00:00.000Z");

const item = (over: Partial<ApiInventoryItem> = {}): ApiInventoryItem => ({
  id: "pol83_i1",
  athleteId: "pol83_a1",
  propertyId: null,
  jobId: null,
  title: "Basketball clinic",
  description: null,
  kind: "CAMP",
  priceCents: 25_000,
  quantity: 5,
  availableFrom: null,
  availableUntil: null,
  categories: [],
  restrictedCategories: [],
  packageRules: null,
  active: true,
  version: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  components: [],
  ...over,
});

describe("stockOf", () => {
  it("says what's left in plain words", () => {
    expect(stockOf(null)).toEqual({ label: "No limit", tone: "open" });
    expect(stockOf(0)).toEqual({ label: "Sold out", tone: "out" });
    expect(stockOf(1)).toEqual({ label: "Only 1 left", tone: "low" });
    expect(stockOf(3)).toEqual({ label: "Only 3 left", tone: "low" });
    expect(stockOf(4)).toEqual({ label: "4 in stock", tone: "ok" });
  });
});

describe("whenOf", () => {
  it("reads the window against today, as UTC days", () => {
    expect(whenOf(null, null, NOW)).toEqual({ label: "Any time", tone: "any" });
    expect(whenOf("2026-12-03T00:00:00.000Z", null, NOW)).toEqual({ label: "Opens Dec 3, 2026", tone: "soon" });
    expect(whenOf(null, "2026-12-20T00:00:00.000Z", NOW)).toEqual({ label: "Until Dec 20, 2026", tone: "now" });
    expect(whenOf(null, "2026-11-01T00:00:00.000Z", NOW)).toEqual({ label: "Ended Nov 1, 2026", tone: "ended" });
  });
  it("still says Until on the last day and Opens only from tomorrow", () => {
    expect(whenOf(null, "2026-11-16T00:00:00.000Z", NOW).tone).toBe("now");
    expect(whenOf("2026-11-16T00:00:00.000Z", null, NOW).tone).toBe("any");
  });
});

describe("blurbOf", () => {
  it("collapses space and trims a long description", () => {
    expect(blurbOf(null)).toBeNull();
    expect(blurbOf("   ")).toBeNull();
    expect(blurbOf("One  hour\n on court")).toBe("One hour on court");
    const long = blurbOf("x".repeat(300))!;
    expect(long.length).toBe(120);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("shopCard", () => {
  it("shapes a single item", () => {
    expect(shopCard(item(), NOW)).toEqual({
      id: "pol83_i1",
      title: "Basketball clinic",
      kind: "CAMP",
      kindLabel: "Camp or clinic",
      price: "$250.00",
      stock: { label: "5 in stock", tone: "ok" },
      when: { label: "Any time", tone: "any" },
      blurb: null,
      bundle: null,
      active: true,
      listing: null,
    });
  });
  it("carries its listing's state for the badge", () => {
    expect(shopCard(item(), NOW, { state: "DRAFT", visibility: "PUBLIC" }).listing).toEqual({ state: "DRAFT", visibility: "PUBLIC" });
  });
  it("lists what a package holds", () => {
    const pkg = shopCard(
      item({
        kind: "PACKAGE",
        components: [
          { quantity: 1, component: { id: "pol83_c1", title: "Post", kind: "SOCIAL_POST", priceCents: 5_000 } },
          { quantity: 1, component: { id: "pol83_c2", title: "Clinic", kind: "CAMP", priceCents: 20_000 } },
        ],
      }),
      NOW,
    );
    expect(pkg.bundle).toEqual({ count: 2, names: ["Post", "Clinic"] });
    expect(pkg.kindLabel).toBe("Package");
  });
});

describe("marketBadge", () => {
  /* The switch is not the shop: an Available item with no listing is "Not listed" (owner, 2026-11-16). */
  it("says where the item stands on the marketplace", () => {
    expect(marketBadge(true, null)).toEqual({ label: "Not listed", tone: "none" });
    expect(marketBadge(false, null)).toEqual({ label: "Not listed", tone: "none" });
    expect(marketBadge(true, { state: "PUBLISHED", visibility: "PUBLIC" })).toEqual({ label: "On the marketplace", tone: "live" });
    expect(marketBadge(true, { state: "PUBLISHED", visibility: "PRIVATE" })).toEqual({ label: "Live, private link", tone: "live" });
    expect(marketBadge(true, { state: "PENDING_APPROVAL", visibility: "PUBLIC" })).toEqual({ label: "Listing in review", tone: "wait" });
    expect(marketBadge(true, { state: "PAUSED", visibility: "PUBLIC" })).toEqual({ label: "Listing paused", tone: "off" });
    expect(marketBadge(true, { state: "DRAFT", visibility: "PUBLIC" })).toEqual({ label: "Draft listing", tone: "off" });
  });
  it("a live listing hides while its item is paused, as the shop's search does", () => {
    expect(marketBadge(false, { state: "PUBLISHED", visibility: "PUBLIC" })).toEqual({ label: "Hidden while paused", tone: "off" });
  });
  it("finds the item's listing, skipping an ended one", () => {
    const ls = [
      { id: "a", inventoryItemId: "pol83_i1", state: "ARCHIVED" },
      { id: "b", inventoryItemId: "pol83_i1", state: "DRAFT" },
      { id: "c", inventoryItemId: "other", state: "PUBLISHED" },
    ] as unknown as ApiAthleteListing[];
    expect(listingFor("pol83_i1", ls)?.id).toBe("b");
    expect(listingFor("none", ls)).toBeNull();
  });
});

describe("tabs", () => {
  it("reads the tab from the URL", () => {
    expect(shopTab({})).toBe("all");
    expect(shopTab({ active: "true" })).toBe("on");
    expect(shopTab({ active: "false" })).toBe("paused");
    expect(shopTab({ unlisted: "true" })).toBe("unlisted");
    expect(shopTab({ unlisted: "true", active: "true" })).toBe("unlisted");
    expect(shopTab({ active: "maybe" })).toBe("all");
  });
  it("asks the API for one filter at a time and clears the other in the URL", () => {
    expect(tabQuery("on")).toEqual({ active: "true", unlisted: "" });
    expect(tabQuery("unlisted")).toEqual({ active: "", unlisted: "true" });
    expect(tabPatch("paused")).toEqual({ active: "false", unlisted: null });
    expect(tabPatch("all")).toEqual({ active: null, unlisted: null });
  });
  it("counts from the API's counts, and leaves out Not listed yet when it isn't counted", () => {
    expect(shopTabs({ total: 5, active: 3, paused: 2, unlisted: 1 }).map((t) => [t.key, t.count])).toEqual([
      ["all", 5],
      ["on", 3],
      ["paused", 2],
      ["unlisted", 1],
    ]);
    expect(shopTabs({ total: 5, active: 3, paused: 2, unlisted: null }).map((t) => t.key)).toEqual(["all", "on", "paused"]);
  });
});
