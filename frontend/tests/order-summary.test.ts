import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/sponsor/orders/[id]/payment-actions", () => ({ payOrderAction: async () => ({ ok: false, message: "no" }) }));
vi.mock("@/app/(app)/sponsor/orders/[id]/actions", () => ({ cancelOrderAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/sponsor/cart/actions", () => ({ reserveAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/sponsor/checkout/actions", () => ({ placeOrderAction: async () => ({ ok: true }), releaseHoldAction: async () => ({ ok: true }) }));

import { OrderBoard, OrderFacts, OrderNextCard, OrderSummary } from "../src/components/sponsor-order/order-summary";
import { sponsorStatus } from "../src/lib/order-automation-live";
import { paymentView } from "../src/lib/order-payment-live";
import { orderHero, orderJourney, sampleAs, sampleOrder, SAMPLE_AS, whatNext } from "../src/lib/order-summary";

/* --------------------------------------------------------------------------
   POL-FE-94 — the sponsor's order page as the payment wizard's summary: the
   headline for each state, the four stops, what happens next, and the
   pieces as they render (one pay button, the e2e banner titles kept).
   -------------------------------------------------------------------------- */

const NOW = Date.parse("2026-11-16T15:00:00.000Z");
const view = (as: (typeof SAMPLE_AS)[number]) => {
  const s = sampleOrder(as, NOW);
  const pay = paymentView(s.order.state, s.payment, { supportEmail: "help@btg.test" });
  return { ...s, pay };
};

describe("the headline", () => {
  it("celebrates a just-placed order and says nothing was charged", () => {
    const { order, pay } = view("placed");
    const h = orderHero(order, pay.kind, true);
    expect(h.mood).toBe("placed");
    expect(h.kicker).toBe("Order placed ✓");
    expect(h.text).toContain("Nothing was charged");
  });

  it("asks for payment while it's due, and only then", () => {
    expect(orderHero(view("due").order, view("due").pay.kind, false).mood).toBe("pay");
    expect(orderHero(view("held").order, view("held").pay.kind, false)).toMatchObject({ mood: "wait", title: "Approved and held for you" });
    expect(orderHero(view("confirming").order, view("confirming").pay.kind, false).mood).toBe("confirming");
    expect(orderHero(view("failed").order, view("failed").pay.kind, false).mood).toBe("failed");
  });

  it("names who decides while it waits, and how it ended", () => {
    expect(orderHero({ state: "PENDING_SELLER" }, "not-open", false).title).toBe("The seller is deciding");
    expect(orderHero({ state: "PENDING_APPROVAL" }, "not-open", false).title).toBe("BTG is checking your order");
    expect(orderHero({ state: "IN_DELIVERY" }, "paid", false).mood).toBe("paid");
    expect(orderHero({ state: "FULFILLED" }, "paid", false).mood).toBe("done");
    expect(orderHero({ state: "CANCELLED" }, "none", true).mood).toBe("ended");
  });
});

describe("the four stops", () => {
  const base = { createdAt: "2026-11-16T10:00:00.000Z", decidedAt: null, contractedAt: null, awaitingPaymentAt: null, paidAt: null };

  it("light the stop the order waits on, with dates behind it", () => {
    const j = orderJourney({ ...base, state: "AWAITING_PAYMENT", decidedAt: "2026-11-16T10:05:00.000Z" }, "due", null);
    expect(j.stops.map((s) => s.state)).toEqual(["done", "done", "now", "todo"]);
    expect(j.stops[0]?.note).toBe("Nov 16");
    expect(j.stops[2]?.note).toBe("Due now");
    expect(j.fill).toBeCloseTo(2 / 3);
  });

  it("count deliveries on the last stop, and fill completely once delivered", () => {
    expect(orderJourney({ ...base, state: "IN_DELIVERY", paidAt: "2026-11-17T00:00:00.000Z" }, "paid", { done: 1, total: 3 }).stops[3]?.note).toBe("1 of 3");
    const done = orderJourney({ ...base, state: "FULFILLED" }, "paid", null);
    expect(done.stops.every((s) => s.state === "done")).toBe(true);
    expect(done.fill).toBe(1);
  });

  it("show where a cancelled order stopped", () => {
    const j = orderJourney({ ...base, state: "CANCELLED", decidedAt: "2026-11-16T10:05:00.000Z" }, "none", null);
    expect(j.stops.map((s) => s.state)).toEqual(["done", "done", "ended", "todo"]);
    expect(j.stops[2]?.note).toBe("Cancelled");
  });
});

describe("what happens next", () => {
  it("starts with the step the order is on, and is empty once it has ended", () => {
    expect(whatNext({ state: "PENDING_SELLER" }, "not-open")[0]?.title).toBe("The seller accepts");
    expect(whatNext({ state: "AWAITING_PAYMENT" }, "due")[0]?.title).toBe("You pay by card — now");
    expect(whatNext({ state: "AWAITING_PAYMENT" }, "processing")[0]?.text).toContain("don't pay again");
    expect(whatNext({ state: "CANCELLED" }, "none")).toEqual([]);
  });
});

describe("the sample", () => {
  it("draws every state and falls back to placed", () => {
    expect(sampleAs("nope")).toBe("placed");
    for (const as of SAMPLE_AS) expect(sampleOrder(as, NOW).order.lines.length).toBeGreaterThan(0);
    const s = sampleOrder("due", NOW).order;
    expect(s.totalCents).toBe(s.subtotalCents + s.feesCents);
  });
});

describe("the pieces", () => {
  const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

  it("puts exactly one pay button on a due order, by its e2e name", () => {
    const { order, payment, pay } = view("due");
    const status = sponsorStatus(order, pay.kind, new Date(NOW));
    const html = render(createElement(OrderNextCard, { order, status, pay, payment, steps: whatNext(order, pay.kind), canWrite: true, sample: false }));
    expect(html.match(/aria-label="Pay \$[\d,.]+ by card\. Leaves SponsorX and opens Stripe\."/g)?.length).toBe(1);
    expect(html).toContain("Your next step");
    expect(html).toContain("What happens next");
  });

  it("keeps the payment banners' titles e2e waits for", () => {
    const c = view("confirming");
    expect(render(createElement(OrderNextCard, { order: c.order, status: null, pay: c.pay, payment: c.payment, steps: [], canWrite: true, sample: false }))).toContain("Payment received — confirming…");
    const p = view("paid");
    expect(render(createElement(OrderNextCard, { order: p.order, status: null, pay: p.pay, payment: p.payment, steps: [], canWrite: true, sample: false }))).toContain("Paid ✓ · confirmed by the payment provider");
  });

  it("tells a Sponsor Analyst who pays instead of offering the button", () => {
    const { order, payment, pay } = view("due");
    const html = render(createElement(OrderNextCard, { order, status: sponsorStatus(order, pay.kind, new Date(NOW)), pay, payment, steps: [], canWrite: false, sample: false }));
    expect(html).not.toContain("Leaves SponsorX");
    expect(html).toContain("A Sponsor Admin in your organisation pays this order by card");
  });

  it("draws the board, the facts and the summary from the order's own figures", () => {
    const { order, pay } = view("due");
    const j = orderJourney(order, pay.kind, null);
    const board = render(createElement(OrderBoard, { hero: orderHero(order, pay.kind, false), order, stops: j.stops, fill: j.fill, payStatus: pay.status, payTone: pay.tone, badge: null }));
    expect(board).toContain('aria-label="Order progress"');
    expect(board).toContain('aria-current="step"');
    const facts = render(createElement(OrderFacts, { order, pay }));
    expect(facts).toContain("Dana Brooks");
    expect(facts).toContain("Marketplace order terms, version 2");
    const sum = render(createElement(OrderSummary, { order, pay, cancellable: true, sample: false }));
    expect(sum).toContain("Order summary");
    expect(sum).toContain("Cancel order");
  });
});
