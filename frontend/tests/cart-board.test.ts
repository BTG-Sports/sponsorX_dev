import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/sponsor/cart/actions", () => ({
  removeLineAction: async () => ({ ok: true }),
  updateLineAction: async () => ({ ok: true }),
  reserveAction: async () => ({ ok: true }),
}));

import { CART_STEPS, cartStep, clampQty, goneLines, itemCount, keptFor, maxQtyOf, runOf, type CartBoardLine } from "../src/lib/cart-board";
import { quoteFor } from "../src/lib/checkout-gate";

/* --------------------------------------------------------------------------
   POL-FE-92 — the sponsor cart, redrawn: its words and figures, and the
   board as each kind of viewer sees it.
   -------------------------------------------------------------------------- */

const line = (over: Partial<CartBoardLine> = {}): CartBoardLine => ({
  id: "ctb_l1", listingId: "ctb_lst1", quantity: 2, startsOn: "2026-11-01T00:00:00.000Z", endsOn: "2026-11-07T00:00:00.000Z",
  unitPriceCents: 25_000, title: "Game day social post", propertyName: "Westfield Hawks", sellerName: "Westfield Hawks", lineTotalCents: 50_000,
  info: { gone: false, kind: "SOCIAL_POST", kindLabel: "Social post", who: "Jordan Lee", initials: "JL", window: { availableFrom: null, availableUntil: null }, maxQty: 4 },
  ...over,
});

describe("the cart's words and figures", () => {
  it("says when a line runs, both ends counted", () => {
    expect(runOf("2026-11-01T00:00:00.000Z", "2026-11-07T00:00:00.000Z")).toEqual({ label: "Nov 1 – Nov 7, 2026", days: 7, daysLabel: "7 days" });
    expect(runOf("2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toEqual({ label: "Nov 1, 2026", days: 1, daysLabel: "1 day" });
    expect(runOf("2026-12-30", "2027-01-02").label).toBe("Dec 30, 2026 – Jan 2, 2027");
  });

  it("says how long the cart is kept, out of its 24 hours", () => {
    const now = Date.parse("2026-11-16T10:00:00.000Z");
    expect(keptFor("2026-11-17T08:30:00.000Z", now)).toMatchObject({ label: "22 h 30 min", expired: false });
    expect(keptFor("2026-11-16T12:00:00.000Z", now)).toMatchObject({ label: "2 h", share: 2 / 24 });
    expect(keptFor("2026-11-16T10:40:00.000Z", now).label).toBe("40 min");
    expect(keptFor("2026-11-16T10:00:20.000Z", now).label).toBe("under a minute");
    expect(keptFor("2026-11-16T09:00:00.000Z", now)).toEqual({ label: "0 min", share: 0, expired: true });
  });

  it("keeps a quantity whole, at least one, and within what the item has", () => {
    expect(clampQty(0, 4)).toBe(1);
    expect(clampQty(5, 4)).toBe(4);
    expect(clampQty(2.7, 4)).toBe(2);
    expect(clampQty(Number.NaN, 4)).toBe(1);
    expect(maxQtyOf(line().info)).toBe(4);
    expect(maxQtyOf(null)).toBe(1000);
    expect(maxQtyOf({ gone: true })).toBe(1000);
  });

  it("counts items by quantity, and finds the lines the shop no longer lists", () => {
    expect(itemCount([line(), line({ id: "ctb_l2", quantity: 1 })])).toBe("3 items");
    expect(itemCount([line({ quantity: 1 })])).toBe("1 item");
    const gone = line({ id: "ctb_l3", info: { gone: true } });
    expect(goneLines([line(), gone, line({ id: "ctb_l4", info: null })]).map((l) => l.id)).toEqual(["ctb_l3"]);
  });

  it("is at stop one while reviewing, stop two once the items are held", () => {
    expect(CART_STEPS.map((s) => s.title)).toEqual(["Review your cart", "Check out", "Place the order"]);
    expect(cartStep(false)).toBe(0);
    expect(cartStep(true)).toBe(1);
  });
});

describe("the board", () => {
  const props = (over: Record<string, unknown> = {}) => ({
    lines: [line()],
    quote: quoteFor({ currency: "USD", subtotalCents: 50_000, feesCents: 2_500, totalCents: 52_500 }, 50_000),
    sellers: "2 items · 1 seller",
    expiresAt: "2026-11-17T08:30:00.000Z",
    hold: null,
    mode: "edit",
    serverNow: Date.parse("2026-11-16T10:00:00.000Z"),
    today: "2026-11-16",
    ...over,
  });

  it("an admin's: the total, one Check out per place, a stepper, the dates as a button, and remove", async () => {
    const { CartBoard } = await import("../src/components/sponsor-cart/cart-board");
    const html = renderToStaticMarkup(createElement(CartBoard, props() as never));
    expect(html).toContain("Your cart total");
    expect(html).toContain("$525.00");
    expect(html).toContain("BTG&#x27;s fee included");
    expect(html).toContain("Check out");
    expect(html).toContain('aria-label="One more"');
    expect(html).toContain("Nov 1 – Nov 7, 2026");
    expect(html).toContain("Westfield Hawks · $250.00 each");
    expect(html).toContain('aria-label="Remove Game day social post"');
    expect(html).toContain("Changes save by themselves.");
    expect(html).toContain("Cart saved for <b>22 h 30 min</b> more");
    expect(html).not.toContain("Save changes");
  });

  it("a viewer's: no stepper, no remove, no Check out", async () => {
    const { CartBoard } = await import("../src/components/sponsor-cart/cart-board");
    const html = renderToStaticMarkup(createElement(CartBoard, props({ mode: "view" }) as never));
    expect(html).toContain("× 2");
    expect(html).not.toContain('aria-label="One more"');
    expect(html).not.toContain("Remove Game day social post");
    expect(html).not.toContain('class="sx-ct-go"');
    expect(html).not.toContain("Change anything here");
  });

  it("a held cart: locked, counting down, and Continue to checkout instead", async () => {
    const { CartBoard } = await import("../src/components/sponsor-cart/cart-board");
    const hold = { id: "ctb_res1", expiresAt: "2026-11-16T10:12:05.000Z" };
    const html = renderToStaticMarkup(createElement(CartBoard, props({ mode: "held", hold }) as never));
    expect(html).toContain("12:05");
    expect(html).toContain("Locked while held");
    expect(html).toContain("/sponsor/checkout?reservation=ctb_res1");
    expect(html).not.toContain('aria-label="One more"');
  });

  it("an item the shop no longer lists says so, and Check out waits for it to go", async () => {
    const { CartBoard } = await import("../src/components/sponsor-cart/cart-board");
    const html = renderToStaticMarkup(createElement(CartBoard, props({ lines: [line({ info: { gone: true } })] }) as never));
    expect(html).toContain("No longer in the shop");
    expect(html).toContain("Remove the item that&#x27;s no longer in the shop first.");
  });
});
