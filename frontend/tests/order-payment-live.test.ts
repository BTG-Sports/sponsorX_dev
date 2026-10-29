import { describe, expect, it } from "vitest";

import {
  HELD_TITLE,
  NOT_CONNECTED_NOTE,
  PAY_NOTE,
  PAYMENT_BUSY,
  PAY_NOT_ALLOWED,
  accountStatusLabel,
  failedPaymentWords,
  parseStandinDetails,
  plainFailure,
  payRefusal,
  paymentHint,
  paymentView,
  safeReturnPath,
  stripeCta,
  type ApiOrderPayment,
  type ApiPaymentAttempt,
} from "../src/lib/order-payment-live";

/* --------------------------------------------------------------------------
   2S5-FE-05 — the order page's Payment card (E1 due / E2 confirming /
   E3 paid / E4 failed), and the stand-in
   provider's return-path guard and details parsing.
   -------------------------------------------------------------------------- */

const attempt = (state: ApiPaymentAttempt["state"], extra: Partial<ApiPaymentAttempt> = {}): ApiPaymentAttempt => ({
  id: "att1",
  state,
  amountCents: 100000,
  failureReason: null,
  providerRef: null,
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:14:00.000Z",
  ...extra,
});

const pay = (latest: ApiPaymentAttempt | null, extra: Partial<ApiOrderPayment> = {}): ApiOrderPayment => ({
  orderId: "o1",
  amountCents: 100000,
  due: true,
  provider: "standin",
  canPay: true,
  testProvider: true,
  latest,
  ...extra,
});

describe("paymentView", () => {
  it("E1 — approved, nothing tried yet: pay by card, on Stripe", () => {
    const v = paymentView("APPROVED", pay(null));
    expect(v.kind).toBe("due");
    expect(v.status).toBe("Due now");
    expect(v.cta).toEqual({ label: "Pay $1,000.00 by card", ariaLabel: "Pay $1,000.00 by card. Leaves SponsorX and opens Stripe." });
    expect(v.note).toBe(PAY_NOTE);
    expect(v.poll).toBe(false);
  });

  it("E1 — a started but unanswered attempt (PENDING) is still due", () => {
    expect(paymentView("AWAITING_PAYMENT", pay(attempt("PENDING"))).kind).toBe("due");
  });

  it("POL-FE-04 — card payment closed: held for you, no countdown, no pay-by date, no button", () => {
    const v = paymentView("APPROVED", pay(null, { canPay: false, provider: "none", testProvider: false }));
    expect(v.kind).toBe("held");
    expect(v.status).toBe("Held for you");
    expect(v.cta).toBeNull();
    expect(v.poll).toBe(false);
    expect(v.banner?.title).toBe(HELD_TITLE);
    expect(v.banner?.title).toBe("Held for you — card payment opens soon; we’ll email your pay-by date");
    expect(v.banner?.text).not.toMatch(/3 days|within/);
    expect(v.banner?.role).toBe("status");
    expect(paymentHint("held")).toMatch(/held for you/i);
    /* The side card's line and the status card's share the same words. */
    expect(NOT_CONNECTED_NOTE).toBe(`${HELD_TITLE}.`);
    /* A walked-away (PENDING) attempt while closed is held too — not due. */
    expect(paymentView("AWAITING_PAYMENT", pay(attempt("PENDING"), { canPay: false })).kind).toBe("held");
  });

  it("POL-FE-04 — a failed attempt while closed keeps its own banner, and the retry says held", () => {
    const v = paymentView("AWAITING_PAYMENT", pay(attempt("FAILED"), { canPay: false }));
    expect(v.kind).toBe("failed");
    expect(v.note).toBe(NOT_CONNECTED_NOTE);
  });

  it("E2 — PROCESSING: confirming, no CTA, polls, says don't pay again", () => {
    const v = paymentView("AWAITING_PAYMENT", pay(attempt("PROCESSING")));
    expect(v.kind).toBe("processing");
    expect(v.status).toBe("Confirming…");
    expect(v.banner?.title).toBe("Payment received — confirming…");
    expect(v.cta).toBeNull();
    expect(v.note).toMatch(/^Please don’t pay again/);
    expect(v.poll).toBe(true);
  });

  it("E3 — PAID with a succeeded attempt: confirmed by the payment provider, with the time", () => {
    const v = paymentView("PAID", pay(attempt("SUCCEEDED"), { due: false }));
    expect(v.kind).toBe("paid");
    expect(v.status).toBe("Paid $1,000.00");
    expect(v.banner?.title).toBe("Paid ✓ · confirmed by the payment provider Sep 30, 10:14 am UTC");
    expect(v.cta).toBeNull();
    expect(v.poll).toBe(false);
  });

  it("E3 — every state after PAID is paid, whatever the latest attempt says", () => {
    for (const s of ["IN_DELIVERY", "FULFILLED", "CLOSED"]) expect(paymentView(s, pay(attempt("SUCCEEDED"))).kind).toBe("paid");
    expect(paymentView("PAID", pay(attempt("PROCESSING"))).kind).toBe("paid");
  });

  it("E3 — paid without a provider confirmation says BTG recorded it, not the provider", () => {
    expect(paymentView("PAID", pay(null)).banner?.title).toBe("Paid ✓ · payment recorded by BTG");
  });

  it("E4 — FAILED and still due: try again on Stripe, in plain words (POL-FE-31)", () => {
    const v = paymentView("AWAITING_PAYMENT", pay(attempt("FAILED", { failureReason: "The card was declined (test payment provider).", providerRef: "pi_3Q1abc" })), { supportEmail: "support@sponsorx.net" });
    expect(v.kind).toBe("failed");
    expect(v.status).toBe("Not paid");
    expect(v.cta).toEqual(stripeCta("Try again on Stripe"));
    expect(v.cta?.ariaLabel.endsWith("Leaves SponsorX and opens Stripe.")).toBe(true);
    expect(v.banner?.role).toBe("alert");
    /* The headline and text say what to do and who to write to — never the raw code. */
    expect(v.banner?.title).toBe("Your card payment didn’t go through");
    expect(v.banner?.text).toMatch(/Nothing was charged/);
    expect(v.banner?.text).toMatch(/Try again on Stripe’s page/);
    expect(v.banner?.text).toMatch(/write to support@sponsorx.net/);
    expect(v.banner?.text).not.toMatch(/pi_/);
    /* The reference is kept, small, for support; an untranslatable reason travels with it. */
    expect(v.banner?.detail).toBe("Reference for support: pi_3Q1abc · Stripe’s code: The card was declined (test payment provider).");
  });

  it("POL-FE-31 — Stripe's decline codes read as plain words; no support address falls back to BTG", () => {
    expect(plainFailure("card_declined")).toBe("your bank declined the card");
    expect(plainFailure("insufficient_funds")).toBe("the card didn’t have enough funds");
    expect(plainFailure("something_else")).toBeNull();
    expect(plainFailure(null)).toBeNull();
    const w = failedPaymentWords({ failureReason: "expired_card", providerRef: "pi_9" }, null);
    expect(w.text).toMatch(/^Nothing was charged — the card has expired\./);
    expect(w.text).toMatch(/contact BTG/);
    expect(w.reference).toBe("Reference for support: pi_9");
    expect(failedPaymentWords(null, "support@sponsorx.net").reference).toBeNull();
    expect(failedPaymentWords({ failureReason: null, providerRef: null }, undefined).text).toMatch(/^Nothing was charged\. Your order is still approved/);
  });

  it("before approval there is no CTA; cancelled and refunded show no card", () => {
    const p = paymentView("PENDING_APPROVAL", pay(null, { due: false }));
    expect(p.kind).toBe("not-open");
    expect(p.cta).toBeNull();
    expect(paymentView("CANCELLED", pay(null)).kind).toBe("none");
    expect(paymentView("REFUNDED", pay(attempt("SUCCEEDED"))).kind).toBe("none");
  });

  it("a failed payment read degrades to 'unavailable', offering no button", () => {
    const v = paymentView("APPROVED", null);
    expect(v.cta).toBeNull();
    expect(v.status).toBe("Unavailable");
  });

  it("the invoicing hint is replaced while payment is by card", () => {
    expect(paymentHint("due")).toMatch(/by card/);
    expect(paymentHint("paid")).toBeNull();
  });
});

describe("payRefusal", () => {
  const apiMessage = "Something went wrong on our side. Nothing was charged. Try again in a minute, or quote ref ABC to BTG.";

  it("a 503 with code busy says the payment service is busy, try again", () => {
    expect(payRefusal({ status: 503, code: "busy", message: apiMessage })).toBe(PAYMENT_BUSY);
    expect(PAYMENT_BUSY).toBe("The payment service is busy. Try again in a minute.");
  });

  it("a 503 without the busy code, and a 409 (provider not connected), keep the API's own words", () => {
    expect(payRefusal({ status: 503, message: apiMessage })).toBe(apiMessage);
    expect(payRefusal({ status: 503, code: "other", message: apiMessage })).toBe(apiMessage);
    expect(payRefusal({ status: 409, code: "busy", message: "The payment provider isn't connected yet." })).toBe("The payment provider isn't connected yet.");
    expect(payRefusal({ status: 409, message: "This order isn't waiting for payment." })).toBe("This order isn't waiting for payment.");
  });

  it("a 403 is the role rule in words", () => {
    expect(payRefusal({ status: 403, message: "x" })).toBe(PAY_NOT_ALLOWED);
  });
});

describe("the stand-in provider", () => {
  it("only ever sends the browser back to a path on SponsorX", () => {
    expect(safeReturnPath("/sponsor/orders/o1?payment=returned")).toBe("/sponsor/orders/o1?payment=returned");
    expect(safeReturnPath("//evil.example/x")).toBe("/");
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });

  it("parses both kinds of details and rejects anything else", () => {
    expect(parseStandinDetails({ kind: "account", payeeName: "Westfield Hawks", status: "NOT_SET_UP", returnPath: "/property/earnings" })).toEqual({
      kind: "account",
      payeeName: "Westfield Hawks",
      status: "NOT_SET_UP",
      returnPath: "/property/earnings",
    });
    expect(
      parseStandinDetails({ kind: "checkout", orderRef: "SX-1", amountCents: 100000, sponsorName: "Harbor Coffee", state: "PENDING", returnPath: "//x" }),
    ).toMatchObject({ kind: "checkout", amountCents: 100000, returnPath: "/" });
    expect(parseStandinDetails({ kind: "checkout", amountCents: "1000" })).toBeNull();
    expect(parseStandinDetails(null)).toBeNull();
    expect(parseStandinDetails({ error: { message: "x" } })).toBeNull();
  });

  it("labels the account status plainly", () => {
    expect(accountStatusLabel("READY")).toMatch(/Set up/);
    expect(accountStatusLabel("NEEDS_INFO")).toBe("More information needed");
    expect(accountStatusLabel("NOT_SET_UP")).toBe("Not set up yet");
  });
});
