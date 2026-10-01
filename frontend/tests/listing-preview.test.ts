import { describe, expect, it } from "vitest";

import { previewGaps, previewHeadline, previewNotes, shopResultFrom, type PreviewListing } from "../src/lib/listing-preview";
import { sellerLine } from "../src/lib/shop-live";

/* --------------------------------------------------------------------------
   2S3-FE-01 / -02 — "Preview as a sponsor sees it": the seller's own reads
   mapped onto the GET /marketplace/search row the shop card draws, the
   banner's words, and the gaps a failed best-effort read leaves.
   -------------------------------------------------------------------------- */

const listing: PreviewListing = {
  id: "lst_1",
  title: "Courtside banner — fall season",
  description: "A 10ft banner at every home game.",
  visibility: "PUBLIC",
  state: "DRAFT",
  publishAt: null,
  publishedAt: null,
  propertyName: "Westfield Hawks",
  seller: { type: "PROPERTY", id: "prop_1", name: "Westfield Hawks" },
  blockers: [],
  item: { id: "itm_1", kind: "SIGNAGE", priceCents: 125000, quantity: 4, availableUntil: "2026-12-31T00:00:00.000Z", active: true, athleteId: null },
};

const item = {
  kind: "SIGNAGE",
  priceCents: 125000,
  quantity: 4,
  availableFrom: "2026-10-01T00:00:00.000Z",
  availableUntil: "2026-12-31T00:00:00.000Z",
  categories: ["FOOD_BEVERAGE"],
  packageRules: { maxQuantity: 2, exclusive: true },
};

const property = { id: "prop_1", name: "Westfield Hawks", kind: "HIGH_SCHOOL", city: "Laurel", stateCode: "MD" };

describe("shopResultFrom", () => {
  it("builds the search row from the listing, the item and the property", () => {
    const { result } = shopResultFrom(listing, { item, property, athlete: null });
    expect(result).toEqual({
      id: "lst_1",
      title: "Courtside banner — fall season",
      description: "A 10ft banner at every home game.",
      publishedAt: null,
      property,
      seller: listing.seller,
      athlete: null,
      item: {
        id: "itm_1",
        kind: "SIGNAGE",
        priceCents: 125000,
        quantity: 4,
        availableFrom: "2026-10-01T00:00:00.000Z",
        availableUntil: "2026-12-31T00:00:00.000Z",
        categories: ["FOOD_BEVERAGE"],
        packageRules: { maxQuantity: 2, exclusive: true },
      },
    });
    expect(sellerLine(result)).toBe("Westfield Hawks · high school · Laurel, MD");
  });

  it("falls back to the listing's own fields when the item read failed — no invented start date or rules", () => {
    const { result } = shopResultFrom(listing, { item: null, property: null, athlete: null });
    expect(result.item).toMatchObject({ kind: "SIGNAGE", priceCents: 125000, availableFrom: null, availableUntil: "2026-12-31T00:00:00.000Z", categories: [], packageRules: null });
    expect(result.property).toEqual({ id: "prop_1", name: "Westfield Hawks", kind: "", city: null, stateCode: null });
    expect(sellerLine(result)).toBe("Westfield Hawks");
  });

  it("names a roster athlete only when the item is theirs", () => {
    const athlete = { displayName: "Riley Carter", sport: "Basketball", position: "Guard" };
    expect(shopResultFrom(listing, { item, property, athlete }).result.athlete).toBeNull();
    const rostered = { ...listing, item: { ...listing.item, athleteId: "ath_1" } };
    expect(shopResultFrom(rostered, { item, property, athlete }).result.athlete).toEqual(athlete);
  });

  it("an independent athlete's listing has no property — the shop names the athlete as seller", () => {
    const own: PreviewListing = { ...listing, propertyName: null, seller: { type: "ATHLETE", id: "ath_1", name: "Riley Carter" }, item: { ...listing.item, athleteId: "ath_1" } };
    const { result } = shopResultFrom(own, { item, property: null, athlete: { displayName: "Riley Carter", sport: "Basketball", position: null } });
    expect(result.property).toBeNull();
    expect(sellerLine(result)).toBe("Riley Carter · independent athlete");
  });
});

describe("previewHeadline / previewNotes", () => {
  const now = Date.parse("2026-10-01T12:00:00.000Z");

  it("says sponsors see it once BTG approves it, until it is on sale", () => {
    expect(previewHeadline("DRAFT")).toBe("Preview — sponsors see this once BTG approves it");
    expect(previewHeadline("PENDING_APPROVAL")).toBe("Preview — sponsors see this once BTG approves it");
    expect(previewHeadline("PUBLISHED")).toBe("Preview — this is how sponsors see it in the shop");
  });

  it("lists nothing for a live, public listing", () => {
    expect(previewNotes({ ...listing, state: "PUBLISHED" }, now)).toEqual([]);
  });

  it("lists every rule search applies that hides it", () => {
    const notes = previewNotes(
      { ...listing, visibility: "PRIVATE", publishAt: "2026-11-01T00:00:00.000Z", blockers: ["a", "b"], item: { ...listing.item, active: false } },
      now,
    );
    expect(notes).toEqual([
      "It's a draft — only you can see it until you submit it and BTG approves it.",
      "It's private — kept out of the shop's search.",
      "It's set to go on sale on Nov 1, 2026.",
      "Its item is switched off in inventory, so the shop hides it.",
      "2 points on BTG's checklist are still open — see the editor.",
    ]);
  });

  it("ignores a publish day already passed, and blockers on an archived listing", () => {
    expect(previewNotes({ ...listing, state: "ARCHIVED", publishAt: "2026-09-01T00:00:00.000Z", blockers: ["a"] }, now)).toEqual([
      "It's archived — sponsors won't see it again.",
    ]);
  });
});

describe("previewGaps", () => {
  it("names each part a failed read left out", () => {
    const rostered = { ...listing, item: { ...listing.item, athleteId: "ath_1" } };
    expect(previewGaps(rostered, { item: null, property: null, athlete: null }, true)).toEqual([
      "the item's dates and package rules",
      "the property's type and place",
      "the athlete's line",
    ]);
    expect(previewGaps(listing, { item, property, athlete: null }, true)).toEqual([]);
  });

  it("does not expect a property where it can't be read, or where there is none", () => {
    expect(previewGaps(listing, { item, property: null, athlete: null }, false)).toEqual([]);
    const own: PreviewListing = { ...listing, seller: { type: "ATHLETE", id: "ath_1", name: "Riley" } };
    expect(previewGaps(own, { item, property: null, athlete: null }, true)).toEqual([]);
  });
});
