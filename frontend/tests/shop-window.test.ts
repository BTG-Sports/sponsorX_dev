import { describe, expect, it } from "vitest";

import { DEMO_LISTINGS, shopFilters, type ApiSearchResult } from "@/lib/shop-live";
import { filterChips, initialsOf, rulesOf, shopItem, whenOf } from "@/lib/shop-window";

/* POL-FE-91 — the sponsor shop window's words, worked out from one search row. */

const row = (over: Partial<ApiSearchResult> = {}, item: Partial<ApiSearchResult["item"]> = {}): ApiSearchResult => ({
  ...DEMO_LISTINGS[0],
  ...over,
  item: { ...DEMO_LISTINGS[0].item, ...item },
});

describe("whenOf", () => {
  it("says any dates when the item has no window", () => {
    expect(whenOf(null, null, "2026-11-16")).toEqual({ label: "Any dates", tone: "open", flag: null });
  });
  it("flags a window that ends within two weeks", () => {
    const w = whenOf("2026-11-01T00:00:00.000Z", "2026-11-21T00:00:00.000Z", "2026-11-16");
    expect(w.label).toBe("Nov 1 – Nov 21, 2026");
    expect(w).toMatchObject({ tone: "ending", flag: "Ends in 5 days" });
  });
  it("says the last day is today", () => {
    expect(whenOf(null, "2026-11-16T00:00:00.000Z", "2026-11-16").flag).toBe("Last day today");
  });
  it("flags a window that hasn't started", () => {
    expect(whenOf("2026-12-01T00:00:00.000Z", null, "2026-11-16")).toMatchObject({ label: "From Dec 1, 2026", tone: "later", flag: "Starts Dec 1" });
  });
  it("keeps both years when the window crosses one", () => {
    expect(whenOf("2026-12-20T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2026-11-16").label).toBe("Dec 20, 2026 – Mar 1, 2027");
  });
});

describe("rulesOf", () => {
  it("is empty without rules", () => {
    expect(rulesOf(null)).toEqual([]);
  });
  it("says each rule plainly", () => {
    expect(rulesOf({ minQuantity: 2, maxQuantity: 5, exclusive: true, requiresApproval: true })).toEqual([
      "Buy 2–5 at a time",
      "Exclusive: one sponsor per date range",
      "The seller says yes to your order first (within 48 hours)",
    ]);
    expect(rulesOf({ maxQuantity: 3 })).toEqual(["Buy up to 3 at a time"]);
  });
});

describe("shopItem", () => {
  it("draws a team's item around its athlete", () => {
    const it = shopItem(row(), "2026-11-16");
    expect(it).toMatchObject({
      title: "Game day social post",
      kindLabel: "Social post",
      price: "$350.00",
      per: "each",
      who: "Jordan Lee",
      whoSub: "Basketball · Guard",
      initials: "JL",
      stock: "4 available",
      seller: { name: "Westfield Hawks", team: true },
    });
    expect(it.maxQty).toBe(4);
  });
  it("names an independent athlete as the seller", () => {
    const it = shopItem(DEMO_LISTINGS.find((r) => r.property === null)!, "2026-11-16");
    expect(it.seller).toMatchObject({ name: "Marcus Reed", team: false });
  });
  it("opens the quantity on the package minimum, capped by stock and rules", () => {
    const it = shopItem(row({}, { quantity: null, kind: "PACKAGE", packageRules: { minQuantity: 3, maxQuantity: 6 } }), "2026-11-16");
    expect(it).toMatchObject({ minQty: 3, maxQty: 6, stock: null, per: "for the package" });
  });
});

describe("filterChips", () => {
  it("is one removable chip per filter in force, never the type or the search", () => {
    const chips = filterChips(shopFilters({ q: "post", kind: "VIDEO", category: "FITNESS", stateCode: "MD", maxPrice: "100000", availableFrom: "2026-12-01", availableUntil: "2026-12-01" }));
    expect(chips.map((c) => c.label)).toEqual(["For fitness brands", "In Maryland", "Price under $1,000", "Free on Dec 1, 2026"]);
    expect(chips.find((c) => c.key === "dates")?.clear).toEqual({ availableFrom: null, availableUntil: null });
  });
  it("shows no chip for a value the page didn't apply", () => {
    expect(filterChips(shopFilters({ category: "NOPE", availableFrom: "not-a-day" }))).toEqual([]);
  });
});

describe("initialsOf", () => {
  it("takes the first and last names", () => {
    expect(initialsOf("Amara Ngozi Okafor")).toBe("AO");
    expect(initialsOf("Cher")).toBe("C");
  });
});
