import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  usePathname: () => "/sponsor/orders",
  useSearchParams: () => new URLSearchParams(),
}));

import { OrdersHelp, OrdersRoad, OrdersShop, PayStrip } from "../src/components/sponsor-orders/orders-board";
import { ServerList } from "../src/components/server-pager";
import { emptyWords, orderCard, orderStations, orderStops, orderTabPatch, orderTabs } from "../src/lib/orders-board";
import type { ApiOrder } from "../src/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-98 — the sponsor's Orders list: what each order says, whose move
   it is, the four stops, the scoreboard's stations, the tabs, and the
   list as it first renders.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-11-16T12:00:00Z");

function order(over: Partial<ApiOrder> = {}): ApiOrder {
  return {
    id: "ord-pol98-7f3a9c21",
    sponsorId: "sp-pol98",
    reservationId: "res-pol98",
    state: "PENDING_SELLER",
    currency: "USD",
    subtotalCents: 100_000,
    feesCents: 5_000,
    totalCents: 105_000,
    requiresApproval: false,
    approvalReasons: [],
    decidedAt: null,
    decidedBy: null,
    decisionNotes: null,
    contractedAt: null,
    createdAt: "2026-11-14T09:00:00Z",
    billingName: null,
    billingEmail: null,
    billingReference: null,
    acceptanceId: null,
    acceptance: null,
    lines: [
      {
        id: "line-pol98-1",
        listingId: "lst-pol98-1",
        inventoryItemId: "inv-pol98-1",
        propertyId: "prop-pol98",
        seller: { type: "PROPERTY", id: "prop-pol98", name: "Coastal FC" },
        title: "Sponsored Instagram post",
        quantity: 2,
        startsOn: "2026-11-20",
        endsOn: "2026-11-22",
        unitPriceCents: 50_000,
        lineTotalCents: 100_000,
      },
    ],
    ...over,
  };
}

describe("what an order says", () => {
  it("waiting for the seller: who decides, by when, nothing charged", () => {
    const c = orderCard(order({ deadlineAt: "2026-11-18T09:00:00Z", waitingOn: "SELLER" }), NOW);
    expect(c.stage).toBe("wait");
    expect(c.move).toBe(false);
    expect(c.next.title).toBe("Coastal FC is deciding");
    expect(c.next.hint).toContain("Nothing is charged yet");
    expect(c.due?.text).toBe("Answer due in 2 days");
    expect(c.from).toBe("From Coastal FC");
    expect(c.initials).toBe("CF");
    expect(c.dates).toBe("Nov 20 – Nov 22");
    expect(c.ref).toBe("SX-7F3A9C21");
  });

  it("held for BTG", () => {
    const c = orderCard(order({ state: "PENDING_APPROVAL", waitingOn: "BTG" }), NOW);
    expect(c.label).toBe("BTG is checking");
    expect(c.next.hint).toContain("spending limit");
  });

  it("approved with a pay-by date: your move, the total and the day", () => {
    const c = orderCard(order({ state: "AWAITING_PAYMENT", paymentDueAt: "2026-11-17T06:00:00Z", waitingOn: "PAYMENT" }), NOW);
    expect(c.stage).toBe("pay");
    expect(c.move).toBe(true);
    expect(c.cta).toBe("Pay now");
    expect(c.next.title).toBe("Pay $1,050.00 by Nov 17");
    expect(c.due).toEqual({ text: "Pay in 18 hours", urgent: true });
  });

  it("approved while card payment is closed, or with no pay-by date: nothing asked of the sponsor", () => {
    const closed = orderCard(order({ state: "AWAITING_PAYMENT", paymentDueAt: "2026-11-19T12:00:00Z" }), NOW, false);
    const held = orderCard(order({ state: "APPROVED", paymentDueAt: null }), NOW, true);
    for (const c of [closed, held]) {
      expect(c.move).toBe(false);
      expect(c.label).toBe("Approved");
      expect(c.due).toBeNull();
    }
  });

  it("a passed pay-by date says so, urgently", () => {
    const c = orderCard(order({ state: "AWAITING_PAYMENT", paymentDueAt: "2026-11-15T12:00:00Z" }), NOW);
    expect(c.due).toEqual({ text: "Pay-by date passed", urgent: true });
  });

  it("paid: the seller delivers on the order's dates", () => {
    const c = orderCard(order({ state: "IN_DELIVERY", paidAt: "2026-11-15T10:00:00Z" }), NOW);
    expect(c.stage).toBe("deliver");
    expect(c.next.title).toBe("Coastal FC is delivering");
    expect(c.next.hint).toContain("On Nov 20 – Nov 22");
  });

  it("several sellers and items", () => {
    const two = order();
    two.lines.push({ ...two.lines[0]!, id: "line-pol98-2", title: "Youth clinic", quantity: 1, seller: { type: "ATHLETE", id: "ath-pol98", name: "Maya Ortiz" }, startsOn: "2026-12-01", endsOn: "2026-12-01" });
    const c = orderCard(two, NOW);
    expect(c.from).toBe("From Coastal FC and 1 other");
    expect(c.initials).toBe("CF");
    expect(c.more).toBe(1);
    expect(c.all).toBe("Sponsored Instagram post × 2, Youth clinic");
    expect(c.dates).toBe("Nov 20 – Dec 1");
    expect(c.next.title).toBe("The sellers are deciding");
  });

  it("cancelled: why, and whether anything was charged", () => {
    expect(orderCard(order({ state: "CANCELLED", cancelReason: "SELLER_DECLINED" }), NOW).next).toEqual({
      title: "The seller declined this order",
      hint: "Nothing was charged. Its items went back on sale.",
    });
    expect(orderCard(order({ state: "CANCELLED", cancelReason: "SPONSOR", paidAt: "2026-11-15T10:00:00Z" }), NOW).next.hint).toContain("goes back the way you paid");
  });
});

describe("the four stops", () => {
  it("lights each stop it has passed, and the one it's on", () => {
    expect(orderStops(order()).stops.map((s) => s.state)).toEqual(["done", "now", "todo", "todo"]);
    expect(orderStops(order({ state: "AWAITING_PAYMENT" })).progress).toBe(2);
    expect(orderStops(order({ state: "CLOSED" })).stops.every((s) => s.state === "done")).toBe(true);
    expect(orderStops(order({ state: "CLOSED" })).progress).toBe(3);
  });

  it("marks where an order that ended stopped", () => {
    const s = orderStops(order({ state: "CANCELLED", decidedAt: "2026-11-15T00:00:00Z" })).stops;
    expect(s.map((x) => x.state)).toEqual(["done", "done", "ended", "todo"]);
  });
});

describe("the scoreboard and the tabs", () => {
  const byTab = { all: 9, waiting: 2, to_pay: 3, in_progress: 1, delivered: 2, cancelled: 1 };

  it("four stations with the API's counts; To pay reads Approved while payment is closed", () => {
    expect(orderStations(byTab).map((s) => [s.label, s.count])).toEqual([["Waiting", 2], ["To pay", 3], ["In progress", 1], ["Delivered", 2]]);
    expect(orderStations(byTab, false)[1]).toMatchObject({ label: "Approved", stage: "wait" });
  });

  it("tabs keep the API's order and counts; Cancelled only when it holds one; To pay glows while due", () => {
    const api = [
      { key: "all", label: "All", count: 9 },
      { key: "waiting", label: "Waiting for approval", count: 2 },
      { key: "to_pay", label: "To pay", count: 3 },
      { key: "cancelled", label: "Cancelled", count: 0 },
    ];
    expect(orderTabs(api, "all").map((t) => t.label)).toEqual(["All", "Waiting", "To pay"]);
    expect(orderTabs(api, "cancelled").map((t) => t.key)).toContain("cancelled");
    expect(orderTabs(api, "all").find((t) => t.key === "to_pay")!.hot).toBe(true);
    expect(orderTabs(api, "all", false).find((t) => t.key === "to_pay")).toMatchObject({ label: "Approved", hot: false });
    expect(orderTabPatch("all")).toEqual({ tab: null });
    expect(orderTabPatch("to_pay")).toEqual({ tab: "to_pay" });
  });

  it("an empty tab says what would be there", () => {
    expect(emptyWords("to_pay", "", false).title).toBe("Nothing to pay");
    expect(emptyWords("all", "clinic", false).title).toBe("No orders match your search");
    expect(emptyWords("all", "", true).title).toBe("Nothing on this page");
  });
});

describe("the page as it first renders", () => {
  it("draws the board, the pay strip and each order with its next step and a link to it", () => {
    const cards = [
      orderCard(order({ state: "AWAITING_PAYMENT", paymentDueAt: "2026-11-18T12:00:00Z" }), NOW),
      orderCard(order({ id: "ord-pol98-b", state: "FULFILLED" }), NOW),
    ];
    const html = renderToStaticMarkup(
      createElement(
        ServerList,
        null,
        createElement(OrdersRoad, { stations: orderStations({ waiting: 0, to_pay: 1, in_progress: 0, delivered: 1 }), cancelled: 0, spentCents: 105_000, tab: "all" }),
        createElement(PayStrip, { count: 1, tab: "all" }),
        createElement(OrdersShop, {
          cards,
          tabs: orderTabs([{ key: "all", label: "All", count: 2 }, { key: "to_pay", label: "To pay", count: 1 }], "all"),
          tab: "all",
          q: "",
          filtered: false,
          page: { page: 1, size: 12, total: 2, pages: 1 },
          empty: emptyWords("all", "", false),
        }),
      ),
    );
    expect(html).toContain("How an order moves");
    expect(html).toContain("$1,050.00");
    expect(html).toContain("Your move: 1 order is approved and ready to pay");
    expect(html).toContain("Pay $1,050.00 by Nov 18");
    expect(html).toContain("Everything is delivered ✓");
    expect(html).toContain('href="/sponsor/orders/ord-pol98-7f3a9c21"');
    expect(html).toContain("Pay now");
  });

  it("the scoreboard waits behind a help button, closed until it's pressed", () => {
    const html = renderToStaticMarkup(
      createElement(ServerList, null, createElement(OrdersHelp, { stations: orderStations({ waiting: 1 }), cancelled: 0, spentCents: 0, tab: "all" })),
    );
    expect(html).toContain("How orders work");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("How an order moves");
  });
});
