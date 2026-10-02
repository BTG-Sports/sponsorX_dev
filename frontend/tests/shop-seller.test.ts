import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/sponsor/cart/actions", () => ({ removeLineAction: async () => ({ ok: true }), updateLineAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/admin/marketplace/actions", () => ({ btgListingAction: async () => ({ ok: true }), decideListingAction: async () => ({ ok: true }) }));

import { lineSeller, lineSummary, type ApiCartLine, type ApiSearchResult, type ShopLine } from "../src/lib/shop-live";
import type { ApiListing } from "../src/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   2S3-FE-03 — an athlete as the seller in the shop, the cart, checkout, the
   sponsor's order and BTG's listing queue. Since 2S3-BE-05 an independent
   athlete's listing has no property: the search sends `property: null`, the
   cart and listings `propertyName: null`, and every one names its `seller`.
   Each screen is rendered with no property, and must name the athlete.
   -------------------------------------------------------------------------- */

const cartLine = (over: Partial<ApiCartLine> = {}): ApiCartLine => ({
  id: "cl_1", listingId: "lst_jordan", quantity: 2, startsOn: "2026-11-01T00:00:00.000Z", endsOn: "2026-11-02T00:00:00.000Z",
  unitPriceCents: 30_000, title: "Shooting session with Jordan Reed", propertyName: null, sellerName: "JORDAN.REED", lineTotalCents: 60_000, ...over,
});

describe("who sells a line, and how many sellers a cart has", () => {
  it("names the athlete when the line has no property, the team when it has one", () => {
    expect(lineSeller(cartLine())).toBe("JORDAN.REED");
    expect(lineSeller(cartLine({ propertyName: "Westfield Hawks", sellerName: "Westfield Hawks" }))).toBe("Westfield Hawks");
    expect(lineSeller({ propertyId: null, seller: { type: "ATHLETE", id: "a1", name: "RILEY.C" } })).toBe("RILEY.C");
    /* An older read with neither: never a blank, never "null". */
    expect(lineSeller({ propertyName: null })).toBe("Independent athlete");
    expect(lineSeller({ propertyId: "p1" })).toBe("The team");
  });

  it("counts each independent athlete as a seller of their own — they no longer collapse into one", () => {
    const jordan = cartLine();
    const quinn = cartLine({ id: "cl_2", listingId: "lst_quinn", quantity: 1, sellerName: "QUINN.AVERY" });
    const hawks = cartLine({ id: "cl_3", listingId: "lst_hawks", quantity: 3, propertyName: "Westfield Hawks", sellerName: "Westfield Hawks" });
    expect(lineSummary([jordan, quinn])).toBe("3 items · 2 sellers");
    expect(lineSummary([jordan, quinn, hawks])).toBe("6 items · 3 sellers");
    expect(lineSummary([jordan, cartLine({ id: "cl_4", quantity: 1 })])).toBe("3 items · 1 seller");
    /* Order lines: by the seller's id. */
    expect(lineSummary([
      { quantity: 1, propertyId: null, sellerAthleteId: "a1", seller: { type: "ATHLETE", id: "a1", name: "Same Name" } },
      { quantity: 1, propertyId: null, sellerAthleteId: "a2", seller: { type: "ATHLETE", id: "a2", name: "Same Name" } },
      { quantity: 1, propertyId: "p1", seller: { type: "PROPERTY", id: "p1", name: "Hawks" } },
    ])).toBe("3 items · 3 sellers");
    /* The team-only cart the shop launched with still reads the same. */
    expect(lineSummary([{ quantity: 2, propertyName: "Hawks" }, { quantity: 1, propertyName: "Riley" }])).toBe("3 items · 2 sellers");
  });
});

describe("each screen renders an athlete-sold line with no property", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  it("the shop's card", async () => {
    const { ShopListingCard } = await import("../src/components/shop-listing-card");
    const result: ApiSearchResult = {
      id: "lst_jordan", title: "Shooting session with Jordan Reed", description: null, publishedAt: "2026-10-01T00:00:00.000Z",
      property: null, seller: { type: "ATHLETE", id: "a1", name: "JORDAN.REED" },
      athlete: { displayName: "JORDAN.REED", sport: "Basketball", position: null },
      item: { id: "it_1", kind: "CAMP", priceCents: 30_000, quantity: 20, availableFrom: null, availableUntil: null, categories: [], packageRules: null },
    };
    const html = renderToStaticMarkup(createElement(ShopListingCard, { result }));
    expect(html).toContain("JORDAN.REED · independent athlete");
    expect(html).not.toContain("null");
  });

  it("the cart line", async () => {
    const { ShopCartLine } = await import("../src/components/shop-cart-line");
    const html = renderToStaticMarkup(createElement(ShopCartLine, { line: cartLine(), editable: true }));
    expect(html).toContain("JORDAN.REED · $300.00 each");
    expect(html).not.toMatch(/>\s*·/);
  });

  it("checkout's and the order page's line", async () => {
    const { ShopLineRow } = await import("../src/components/shop-bits");
    const checkout = renderToStaticMarkup(createElement(ShopLineRow, { line: cartLine() satisfies ShopLine }));
    expect(checkout).toContain("JORDAN.REED · 2 × $300.00");
    const orderLine: ShopLine = {
      id: "ol_1", title: "Shooting session with Jordan Reed", quantity: 2, unitPriceCents: 30_000, startsOn: "2026-11-01T00:00:00.000Z",
      endsOn: "2026-11-02T00:00:00.000Z", lineTotalCents: 60_000, propertyId: null, sellerAthleteId: "a1",
      seller: { type: "ATHLETE", id: "a1", name: "JORDAN.REED" },
    };
    expect(renderToStaticMarkup(createElement(ShopLineRow, { line: orderLine }))).toContain("JORDAN.REED · 2 × $300.00");
  });

  it("BTG's listing queue", async () => {
    const { MopsListingQueue } = await import("../src/components/mops-listing-queue");
    const listing: ApiListing = {
      id: "lst_jordan", propertyId: null, inventoryItemId: "it_1", title: "Shooting session with Jordan Reed", description: null,
      visibility: "PUBLIC", state: "PENDING_APPROVAL", publishAt: null, submittedAt: "2026-10-01T00:00:00.000Z", reviewNotes: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      item: { id: "it_1", title: "Shooting session", kind: "CAMP", priceCents: 30_000, quantity: 20, availableUntil: null, active: true, athleteId: "a1", propertyId: null },
      propertyName: null, blockers: [], seller: { type: "ATHLETE", id: "a1", name: "JORDAN.REED" }, reviewReasons: ["Restricted word: casino"],
    };
    const html = renderToStaticMarkup(createElement(MopsListingQueue, { listings: [listing], now: Date.parse("2026-10-02T00:00:00.000Z") }));
    expect(html).toContain("JORDAN.REED (athlete)");
    expect(html).not.toContain("null");
  });
});
