import { describe, expect, it } from "vitest";

import {
  acceptLabel,
  billingComplete,
  billingDraftFrom,
  billingIssues,
  billingLines,
  gateHint,
  gateStatus,
  looksLikeCardNumber,
  placeOrderPayload,
  termsLabel,
  type ApiOrderTerms,
} from "@/lib/checkout-gate";

/* 2S4-FE-02 — the checkout's contract gate, its pure pieces. */

const terms: ApiOrderTerms = { id: "agr_1", kind: "MARKETPLACE_ORDER", version: 1, bodyHash: "sha256:abc", body: "DRAFT — terms" };
const good = { name: "Morgan Hale", email: "morgan@harbor.example", reference: "" };

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

describe("the record on a placed order", () => {
  it("names the terms and lists the billing contact; an order from before the gate has none", () => {
    expect(termsLabel({ kind: "MARKETPLACE_ORDER", version: 1 })).toBe("Marketplace order terms, version 1");
    const acceptance = null;
    expect(billingLines({ billingName: "AP", billingEmail: "ap@h.example", billingReference: "PO-7781", acceptance })).toEqual(["AP", "ap@h.example", "Reference PO-7781"]);
    expect(billingLines({ billingName: "AP", billingEmail: "ap@h.example", billingReference: null, acceptance })).toEqual(["AP", "ap@h.example"]);
    expect(billingLines({ billingName: null, billingEmail: null, billingReference: null, acceptance })).toBeNull();
  });
});
