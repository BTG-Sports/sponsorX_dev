import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/sponsor/cart/actions", () => ({ reserveAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/sponsor/checkout/actions", () => ({
  placeOrderAction: async () => ({ ok: true }),
  releaseHoldAction: async () => ({ ok: true }),
}));

import { quoteFor, type ApiCheckout } from "../src/lib/checkout-gate";
import { afterPlacing, reachable, stepProblem, WIZARD_STEPS, type WizardState } from "../src/lib/checkout-wizard";

/* --------------------------------------------------------------------------
   POL-FE-93 — checkout as a four-step wizard: what stops each step, how far
   the sponsor may jump, what placing the order leads to, and the wizard as
   it first renders.
   -------------------------------------------------------------------------- */

const terms = { id: "cow_ag1", kind: "MARKETPLACE_ORDER", version: 2, bodyHash: "sha256:x", body: "These are the order terms." };
const ready: WizardState = { terms, billing: { name: "Dana Brooks", email: "dana@example.com", reference: "" }, accepted: true };

describe("the wizard's steps", () => {
  it("are four, in plain words", () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual(["review", "billing", "terms", "place"]);
    /* "Place order" is kept for the one button that places it */
    expect(WIZARD_STEPS.map((s) => s.short)).toEqual(["Items", "Invoice", "Terms", "Confirm"]);
  });

  it("the items step never stops anyone", () => {
    expect(stepProblem("review", { ...ready, billing: { name: "", email: "", reference: "" }, accepted: false })).toBeNull();
  });

  it("the invoice step names what's missing", () => {
    expect(stepProblem("billing", { ...ready, billing: { name: "", email: "dana@example.com", reference: "" } })).toBe("Add the name invoices go to.");
    expect(stepProblem("billing", { ...ready, billing: { name: "Dana", email: "", reference: "" } })).toBe("Add the email invoices go to.");
    expect(stepProblem("billing", { ...ready, billing: { name: "", email: "nope", reference: "" } })).toBe("Add the name and email invoices go to.");
    expect(stepProblem("billing", { ...ready, billing: { name: "Dana", email: "dana@example.com", reference: "4111 1111 1111 1111" } })).toMatch(/card number/);
    expect(stepProblem("billing", ready)).toBeNull();
  });

  it("the terms step waits for the tick, or says the terms are missing", () => {
    expect(stepProblem("terms", { ...ready, accepted: false })).toBe("Tick the box to accept the order terms.");
    expect(stepProblem("terms", { ...ready, terms: null })).toMatch(/aren't available right now/);
    expect(stepProblem("terms", ready)).toBeNull();
  });

  it("the sponsor may jump back anywhere, and forward only past finished steps", () => {
    expect(reachable({ ...ready, billing: { name: "", email: "", reference: "" }, accepted: false })).toBe(1);
    expect(reachable({ ...ready, accepted: false })).toBe(2);
    expect(reachable(ready)).toBe(3);
  });
});

describe("what happens after placing", () => {
  it("within the limit, with card payment open", () => {
    const s = afterPlacing({ paymentsOpen: true, overLimit: false });
    expect(s.map((x) => x.title)).toEqual(["You place the order", "It's approved", "You pay by card"]);
    expect(s[0].text).toMatch(/Nothing is charged/);
    expect(s[2].text).toMatch(/within 3 days/);
  });

  it("above the limit, BTG checks it first", () => {
    expect(afterPlacing({ paymentsOpen: true, overLimit: true })[1]).toMatchObject({ title: "BTG checks it" });
  });

  it("with card payment closed, the order is held and the date emailed", () => {
    const pay = afterPlacing({ paymentsOpen: false, overLimit: null })[2];
    expect(pay.title).toBe("You pay by card once it opens");
    expect(pay.text).toMatch(/held for you/);
    expect(pay.text).not.toMatch(/within 3 days/);
  });
});

describe("the wizard as it first renders", () => {
  const checkout: ApiCheckout = { terms, sponsorName: "Harbor Apparel", billingContact: { name: "Dana Brooks", email: "dana@example.com" }, paymentsOpen: true };
  const props = (over: Record<string, unknown> = {}) => ({
    reservationId: "cow_res1",
    expiresAt: "2026-11-16T10:12:05.000Z",
    serverNow: Date.parse("2026-11-16T10:00:00.000Z"),
    lines: [
      {
        id: "cow_l1", listingId: "cow_lst1", quantity: 2, startsOn: "2026-11-20T00:00:00.000Z", endsOn: "2026-11-26T00:00:00.000Z",
        unitPriceCents: 25_000, title: "Game day social post", propertyName: "Westfield Hawks", sellerName: "Westfield Hawks", lineTotalCents: 50_000,
        kind: "SOCIAL_POST", kindLabel: "Social post",
      },
    ],
    sellers: "2 items · 1 seller",
    quote: quoteFor({ currency: "USD", subtotalCents: 50_000, feesCents: 2_500, totalCents: 52_500 }, 50_000),
    limit: null,
    checkout,
    viewer: null,
    ...over,
  });

  it("opens on the items, with the hold, the total and the four steps", async () => {
    const { CheckoutWizard } = await import("../src/components/sponsor-checkout/checkout-wizard");
    const html = renderToStaticMarkup(createElement(CheckoutWizard, props() as never));
    expect(html).toContain("12:05");
    expect(html).toContain("$525.00");
    expect(html).toContain("Game day social post");
    expect(html).toContain('aria-labelledby="checkout-review"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Continue");
    for (const s of ["Items", "Invoice", "Terms", "Confirm"]) expect(html).toContain(s);
    expect(html).not.toContain("Place order");
    /* the later steps aren't drawn until reached */
    expect(html).not.toContain('aria-labelledby="checkout-billing"');
  });

  it("a sample never places anything", async () => {
    const { CheckoutWizard } = await import("../src/components/sponsor-checkout/checkout-wizard");
    const html = renderToStaticMarkup(createElement(CheckoutWizard, props({ sample: true }) as never));
    expect(html).toContain("Sample checkout");
  });
});
