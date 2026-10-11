import { describe, expect, it } from "vitest";

import {
  canCancel,
  countdown,
  dayToIso,
  defaultQuantity,
  defaultWindow,
  demoShopSearch,
  lineSummary,
  orderCopy,
  orderRef,
  orderStateParam,
  refusalFrom,
  ruleNotes,
  shopSearchExtras,
  shopFilters,
  hasFilters,
  usd,
  validateLine,
  windowLabel,
  DEMO_CART,
  MIN_PRICE_BANDS,
  PRICE_BANDS,
  STATE_OPTIONS,
  shownFilters,
} from "../src/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — the shop, cart, checkout and order screens' pure pieces:
   the search query sent to GET /marketplace/search, the date-window check
   before a line is sent, refusal formatting (every 409 reason), state copy
   and the hold's countdown.
   -------------------------------------------------------------------------- */

describe("shopSearchExtras", () => {
  it("sends only what the contract accepts, the price band already in cents and days as midnight UTC", () => {
    const { extras, ignored } = shopSearchExtras({
      q: " jersey ",
      kind: "SOCIAL_POST",
      category: "RESTAURANT",
      sport: "Basketball",
      stateCode: "md",
      maxPrice: "100000",
      availableFrom: "2026-10-01",
      availableUntil: "2026-10-31",
    });
    expect(extras).toEqual({
      q: "jersey",
      kind: "SOCIAL_POST",
      category: "RESTAURANT",
      sport: "Basketball",
      stateCode: "MD",
      maxPrice: "100000",
      availableFrom: "2026-10-01T00:00:00.000Z",
      availableUntil: "2026-10-31T00:00:00.000Z",
    });
    expect(ignored).toEqual([]);
  });

  it("drops invalid values and names them instead of letting the API 400", () => {
    const { extras, ignored } = shopSearchExtras({
      kind: "BILLBOARD",
      category: "SNACKS",
      stateCode: "Maryland",
      maxPrice: "-3",
      availableFrom: "2026-02-30",
      q: ["a", "b"],
    });
    expect(extras).toEqual({});
    expect(ignored).toEqual(["type", "category", "state", "price", "available from"]);
  });

  it("knows when any filter is set", () => {
    expect(hasFilters(shopFilters({}))).toBe(false);
    expect(hasFilters(shopFilters({ sport: "Soccer" }))).toBe(true);
    expect(hasFilters(shopFilters({ sport: "  " }))).toBe(false);
  });
});

describe("demoShopSearch", () => {
  it("filters and pages the demo deck the same way the API does", () => {
    const all = demoShopSearch(shopFilters({}), { page: 1, size: 12 });
    expect(all.page.total).toBeGreaterThan(0);
    expect(all.results.length).toBe(all.page.total);

    const narrowed = demoShopSearch(shopFilters({ kind: "VIDEO" }), { page: 1, size: 12 });
    expect(narrowed.results.every((r) => r.item.kind === "VIDEO")).toBe(true);
    expect(narrowed.page.total).toBeLessThan(all.page.total);
  });

  it("clamps an out-of-range page to the last one, like the API", () => {
    const { page } = demoShopSearch(shopFilters({}), { page: 99, size: 1 });
    expect(page.page).toBe(page.pages);
  });

  it("applies the From price band and ignores a price that isn't a band", () => {
    const from = demoShopSearch(shopFilters({ minPrice: "100000" }), { page: 1, size: 60 });
    expect(from.page.total).toBeGreaterThan(0);
    expect(from.results.every((r) => r.item.priceCents >= 100_000)).toBe(true);
    const all = demoShopSearch(shopFilters({}), { page: 1, size: 60 });
    expect(demoShopSearch(shopFilters({ maxPrice: "500" }), { page: 1, size: 60 }).page.total).toBe(all.page.total);
  });

  it("prices the demo cart from the deck itself", () => {
    expect(DEMO_CART.lines).toBe(2);
    expect(DEMO_CART.totalCents).toBe(2 * 35_000 + 150_000);
  });
});

describe("price bands and states", () => {
  it("sends a From band as minPrice cents", () => {
    expect(shopSearchExtras({ minPrice: "50000", maxPrice: "500000" }).extras).toEqual({ minPrice: "50000", maxPrice: "500000" });
  });

  it("ignores an old dollars bookmark (?maxPrice=500) instead of filtering to $5", () => {
    const { extras, ignored } = shopSearchExtras({ maxPrice: "500", minPrice: "100" });
    expect(extras).toEqual({});
    expect(ignored).toEqual(["price from", "price"]);
    expect(shownFilters(shopFilters({ maxPrice: "500", minPrice: "100" }))).toMatchObject({ maxPrice: "", minPrice: "" });
  });

  it("accepts only US state codes, upper-cased", () => {
    expect(shopSearchExtras({ stateCode: "dc" }).extras).toEqual({ stateCode: "DC" });
    expect(shopSearchExtras({ stateCode: "ZZ" }).ignored).toEqual(["state"]);
    expect(shownFilters(shopFilters({ stateCode: "md" })).stateCode).toBe("MD");
    expect(STATE_OPTIONS.find((o) => o.value === "MD")?.label).toBe("Maryland (MD)");
    expect(MIN_PRICE_BANDS.map((b) => b.value)).toEqual(PRICE_BANDS.map((b) => b.value));
  });
});

describe("money and days", () => {
  it("formats cents as USD with cents", () => {
    expect(usd(123450)).toBe("$1,234.50");
    expect(usd(0)).toBe("$0.00");
  });
  it("accepts only real calendar days", () => {
    expect(dayToIso("2026-10-01")).toBe("2026-10-01T00:00:00.000Z");
    expect(dayToIso("2026-13-01")).toBeNull();
    expect(dayToIso("10/01/2026")).toBeNull();
  });
  it("labels an item's window", () => {
    expect(windowLabel("2026-10-01T00:00:00.000Z", "2026-10-31T00:00:00.000Z")).toBe("Oct 1, 2026 – Oct 31, 2026");
    expect(windowLabel("2026-10-01T00:00:00.000Z", null)).toBe("from Oct 1, 2026");
    expect(windowLabel(null, null)).toBe("any dates");
  });
});

describe("validateLine — the date window before a line is sent", () => {
  const item = {
    availableFrom: "2026-10-01T00:00:00.000Z",
    availableUntil: "2026-10-31T00:00:00.000Z",
    packageRules: { minQuantity: 2, maxQuantity: 5 },
  };

  it("passes a line inside the window", () => {
    expect(validateLine({ quantity: 2, startsOn: "2026-10-01", endsOn: "2026-10-31" }, item)).toEqual([]);
  });

  it("refuses dates outside the item's window, in the API's words", () => {
    expect(validateLine({ quantity: 2, startsOn: "2026-09-30", endsOn: "2026-11-01" }, item)).toEqual([
      "available from Oct 1, 2026",
      "available until Oct 31, 2026",
    ]);
  });

  it("refuses an end before the start, missing days and bad quantities", () => {
    expect(validateLine({ quantity: 2, startsOn: "2026-10-10", endsOn: "2026-10-05" }, item)).toContain(
      "the end date is before the start date",
    );
    expect(validateLine({ quantity: 1, startsOn: "", endsOn: "2026-10-05" })).toEqual(["pick a start date"]);
    expect(validateLine({ quantity: 0, startsOn: "2026-10-01", endsOn: "2026-10-02" })).toEqual(["quantity must be at least 1"]);
    expect(validateLine({ quantity: 6, startsOn: "2026-10-01", endsOn: "2026-10-02" }, item)).toEqual(["at most 5 per purchase"]);
    expect(validateLine({ quantity: 1, startsOn: "2026-10-01", endsOn: "2026-10-02" }, item)).toEqual(["at least 2 per purchase"]);
  });

  it("opens the add form inside the window", () => {
    expect(defaultWindow(item, "2026-09-29")).toEqual({ startsOn: "2026-10-01", endsOn: "2026-10-31" });
    expect(defaultWindow(item, "2026-10-10")).toEqual({ startsOn: "2026-10-10", endsOn: "2026-10-31" });
    expect(defaultWindow({ availableFrom: null, availableUntil: null }, "2026-12-15")).toEqual({
      startsOn: "2026-12-15",
      endsOn: "2027-01-14",
    });
    expect(defaultQuantity({ minQuantity: 3 })).toBe(3);
    expect(defaultQuantity(null)).toBe(1);
  });

  it("names package rules for the buyer", () => {
    expect(ruleNotes({ minQuantity: 2, maxQuantity: 5, requiresApproval: true })).toEqual([
      "2–5 per purchase",
      "the seller approves orders that include this, within 48 hours",
    ]);
    expect(ruleNotes(null)).toEqual([]);
  });
});

describe("refusalFrom", () => {
  it("lists every 409 availability reason", () => {
    const r = refusalFrom(409, {
      error: {
        code: "unavailable",
        message: "Not available: a; b.",
        reasons: [
          { code: "OUT_OF_WINDOW", message: "available until Oct 31, 2026" },
          { code: "DATE_OVERLAP", message: "already committed Oct 3, 2026 – Oct 9, 2026" },
        ],
      },
    });
    expect(r.message).toBe("Not available as asked:");
    expect(r.reasons).toEqual(["available until Oct 31, 2026", "already committed Oct 3, 2026 – Oct 9, 2026"]);
  });

  it("passes a plain 409 message (a frozen cart) through", () => {
    const msg = "This cart's stock is on hold — release the hold before changing it, or place the order.";
    expect(refusalFrom(409, { error: { code: "conflict", message: msg } })).toEqual({ message: msg, reasons: [] });
  });

  it("uses Zod issues, and says 403 plainly", () => {
    expect(refusalFrom(400, { error: { message: "Invalid", issues: [{ message: "Too big" }, { message: "Bad date" }] } })).toEqual({
      message: "Too big",
      reasons: ["Bad date"],
    });
    expect(refusalFrom(403, { error: { message: "forbidden" } }).message).toMatch(/Sponsor Admin/);
    expect(refusalFrom(500, null).message).toBe("The request was refused (HTTP 500).");
  });
});

describe("order states", () => {
  it("allows a sponsor to cancel only before payment", () => {
    expect(["PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT"].every(canCancel)).toBe(true);
    expect(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED"].some(canCancel)).toBe(false);
  });
  it("labels states and never sends an unknown ?state", () => {
    expect(orderCopy("PENDING_APPROVAL").label).toBe("Held for BTG");
    expect(orderCopy("WEIRD").label).toBe("WEIRD");
    expect(orderStateParam("PAID")).toBe("PAID");
    expect(orderStateParam("paid")).toBeNull();
    expect(orderStateParam(undefined)).toBeNull();
  });
  it("summarises lines and shortens ids", () => {
    expect(lineSummary([{ quantity: 2, propertyName: "Hawks" }, { quantity: 1, propertyName: "Riley" }])).toBe("3 items · 2 sellers");
    expect(orderRef("cmg1abcdef12345678")).toBe("SX-12345678");
  });
});

describe("countdown", () => {
  const exp = "2026-09-29T15:42:00.000Z";
  const at = (iso: string) => new Date(iso).getTime();
  it("shows minutes and seconds left", () => {
    expect(countdown(exp, at("2026-09-29T15:29:12.400Z"))).toEqual({ expired: false, seconds: 767, label: "12:47" });
    expect(countdown(exp, at("2026-09-29T15:41:59.000Z")).label).toBe("0:01");
  });
  it("is expired at and after expiresAt, never negative", () => {
    expect(countdown(exp, at(exp))).toEqual({ expired: true, seconds: 0, label: "0:00" });
    expect(countdown(exp, at("2026-09-29T16:00:00.000Z")).seconds).toBe(0);
  });
});
