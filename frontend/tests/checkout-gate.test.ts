import { describe, expect, it } from "vitest";

import {
  acceptLabel,
  billingComplete,
  billingDraftFrom,
  billingIssues,
  billingLines,
  checkoutPaymentWords,
  gateHint,
  gateStatus,
  looksLikeCardNumber,
  placeOrderPayload,
  quoteFor,
  termsLabel,
  totalChanged,
  TOTAL_CHANGED,
  type ApiOrderTerms,
} from "@/lib/checkout-gate";
import { feeText } from "@/lib/shop-live";

/* 2S4-FE-02 — the checkout's contract gate, its pure pieces. */

const terms: ApiOrderTerms = { id: "agr_1", kind: "MARKETPLACE_ORDER", version: 1, bodyHash: "sha256:abc", body: "DRAFT — terms" };
const good = { name: "Morgan Hale", email: "morgan@harbor.example", reference: "" };

describe("payment at checkout (POL-FE-04)", () => {
  it("with card payment closed, checkout says the order is held and a pay-by date is emailed — no countdown", () => {
    const w = checkoutPaymentWords(false);
    expect(w.held).toBe(true);
    expect(w.title).toMatch(/card payment opens soon/);
    expect(w.text).toMatch(/held for you/);
    expect(w.text).toMatch(/email your pay-by date/);
    expect(w.text).toMatch(/no countdown runs/);
    expect(w.text).not.toMatch(/within 3 days/);
  });
  it("open: the three-day rule; unknown: the rule for both cases, never a promise either way", () => {
    expect(checkoutPaymentWords(true)).toMatchObject({ held: false, title: "Approval, then payment" });
    expect(checkoutPaymentWords(true).text).toMatch(/within 3 days\./);
    const unknown = checkoutPaymentWords(undefined);
    expect(unknown.held).toBe(false);
    expect(unknown.text).toMatch(/if it isn’t open yet when your order is approved, the order is held for you/);
  });
});

describe("billing contact", () => {
  it("prefills from the sponsor's primary contact, or starts empty", () => {
    expect(billingDraftFrom({ name: "Morgan Hale", email: "morgan@harbor.example" })).toEqual(good);
    expect(billingDraftFrom(null)).toEqual({ name: "", email: "", reference: "" });
  });

  it("needs a name and a real-looking email; the reference is optional", () => {
    expect(billingIssues(good)).toEqual({});
    expect(billingComplete({ ...good, reference: "PO-7781" })).toBe(true);
    expect(Object.keys(billingIssues({ name: "  ", email: "", reference: "" })).sort()).toEqual(["email", "name"]);
    expect(billingIssues({ ...good, email: "not-an-email" }).email).toMatch(/name@company\.com/);
    expect(billingIssues({ ...good, reference: "x".repeat(101) }).reference).toMatch(/100 characters/);
  });

  it("refuses a card number in the reference box — SponsorX never takes one", () => {
    expect(looksLikeCardNumber("4242 4242 4242 4242")).toBe(true);
    expect(looksLikeCardNumber("4111-1111-1111-1111")).toBe(true);
    expect(looksLikeCardNumber("4242 4242 4242 4241")).toBe(false); // fails Luhn
    expect(looksLikeCardNumber("PO-2026-0042")).toBe(false);
    expect(looksLikeCardNumber("123456")).toBe(false);
    expect(billingIssues({ ...good, reference: "4242424242424242" }).reference).toMatch(/never takes card or bank numbers/);
  });
});

describe("the gate", () => {
  it("Place order stays disabled until the billing contact is complete and the terms are accepted", () => {
    expect(gateStatus({ terms, billing: good, accepted: true })).toEqual({ ready: true, missing: [] });
    expect(gateStatus({ terms, billing: good, accepted: false })).toEqual({ ready: false, missing: ["your acceptance of the order terms"] });
    expect(gateStatus({ terms, billing: { ...good, email: "" }, accepted: true }).missing).toEqual(["the billing contact"]);
    expect(gateStatus({ terms, billing: { ...good, name: "" }, accepted: false }).missing).toEqual(["the billing contact", "your acceptance of the order terms"]);
  });

  it("with no servable terms there is nothing to accept, so the order cannot be placed", () => {
    const s = gateStatus({ terms: null, billing: good, accepted: true });
    expect(s.ready).toBe(false);
    expect(s.missing[0]).toMatch(/aren't available/);
  });

  it("says what is missing, in step order", () => {
    expect(gateHint([])).toBeNull();
    expect(gateHint(["the billing contact"])).toBe("To place the order, complete the billing contact.");
    expect(gateHint(["the billing contact", "your acceptance of the order terms"])).toBe(
      "To place the order, complete the billing contact and your acceptance of the order terms.",
    );
  });

  it("the checkbox names the sponsor", () => {
    expect(acceptLabel("Harbor Apparel")).toBe("I accept the order terms on behalf of Harbor Apparel");
    expect(acceptLabel(null)).toBe("I accept the order terms on behalf of my organisation");
  });

  it("sends the hold, the terms shown and the trimmed contact — the reference only when given", () => {
    expect(placeOrderPayload({ reservationId: "res_1", agreementId: "agr_1", billing: { name: " Morgan ", email: " m@h.example ", reference: "  " } })).toEqual({
      reservationId: "res_1",
      agreementId: "agr_1",
      billing: { name: "Morgan", email: "m@h.example" },
    });
    expect(placeOrderPayload({ reservationId: "res_1", agreementId: "agr_1", billing: { ...good, reference: " PO-1 " } }).billing).toEqual({ ...good, reference: "PO-1" });
  });
});

/* POL-FE-05 — the full total before committing: the API's quote is what the
   cart and checkout show, and what Place order sends back as totalCentsShown. */
describe("the total before placing (POL-FE-05)", () => {
  const quote = { currency: "USD", subtotalCents: 150_000, feesCents: 4_500, totalCents: 154_500 };

  it("shows the quote's subtotal, fee and total — not the lines' sum", () => {
    expect(quoteFor(quote, 150_000)).toEqual({ subtotalCents: 150_000, feesCents: 4_500, totalCents: 154_500, quoted: true });
    expect(feeText(quoteFor(quote, 150_000))).toBe("$45.00");
    expect(feeText(quoteFor({ ...quote, feesCents: 0, totalCents: 150_000 }, 150_000))).toBe("None");
  });

  it("without a quote (an older API) gives the lines' sum, the fee unknown — never guessed at zero", () => {
    const q = quoteFor(undefined, 150_000);
    expect(q).toEqual({ subtotalCents: 150_000, feesCents: null, totalCents: 150_000, quoted: false });
    expect(feeText(q)).toBe("Not quoted");
    expect(quoteFor({ currency: "USD", subtotalCents: 1, feesCents: Number.NaN, totalCents: 1 }, 150_000).quoted).toBe(false);
    expect(quoteFor({ currency: "USD", subtotalCents: 1, feesCents: -1, totalCents: 0 }, 150_000).quoted).toBe(false);
  });

  it("Place order carries the total shown, and only when there was one", () => {
    expect(placeOrderPayload({ reservationId: "res_1", agreementId: "agr_1", billing: good, totalCentsShown: 154_500 })).toMatchObject({ totalCentsShown: 154_500 });
    expect(placeOrderPayload({ reservationId: "res_1", agreementId: "agr_1", billing: good })).not.toHaveProperty("totalCentsShown");
  });

  it("a 409 total_changed is the one refusal that re-reads the quote", () => {
    expect(TOTAL_CHANGED).toBe("total_changed");
    expect(totalChanged({ ok: false, code: "total_changed" })).toBe(true);
    expect(totalChanged({ ok: false, code: "conflict" })).toBe(false);
    expect(totalChanged({ ok: false })).toBe(false);
    expect(totalChanged({ ok: true })).toBe(false);
  });
});

describe("the record on a placed order", () => {
  it("names the terms and lists the billing contact; an order from before the gate has none", () => {
    expect(termsLabel({ kind: "MARKETPLACE_ORDER", version: 1 })).toBe("Marketplace order terms, version 1");
    const acceptance = null;
    expect(billingLines({ billingName: "AP", billingEmail: "ap@h.example", billingReference: "PO-7781", acceptance })).toEqual(["AP", "ap@h.example", "Reference PO-7781"]);
    expect(billingLines({ billingName: "AP", billingEmail: "ap@h.example", billingReference: null, acceptance })).toEqual(["AP", "ap@h.example"]);
    expect(billingLines({ billingName: null, billingEmail: null, billingReference: null, acceptance })).toBeNull();
  });
});
