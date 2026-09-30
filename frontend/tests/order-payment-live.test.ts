import { describe, expect, it } from "vitest";

import {
  NOT_CONNECTED_NOTE,
  PAY_NOTE,
  accountStatusLabel,
  orderTracker,
  parseStandinDetails,
  paymentHint,
  paymentView,
  safeReturnPath,
  stripeCta,
  type ApiOrderPayment,
  type ApiPaymentAttempt,
} from "../src/lib/order-payment-live";

/* --------------------------------------------------------------------------
   2S5-FE-05 — the order page's Payment card (E1 due / E2 confirming /
   E3 paid / E4 failed), the order-progress tracker, and the stand-in
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

const order = (state: string) => ({
  state,
  createdAt: "2026-09-28T09:00:00.000Z",
  decidedAt: "2026-09-29T09:00:00.000Z",
  contractedAt: null,
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

  it("E1 — provider not connected: CTA still there, with the not-connected line", () => {
    const v = paymentView("APPROVED", pay(null, { canPay: false, provider: "none", testProvider: false }));
    expect(v.cta?.label).toBe("Pay $1,000.00 by card");
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
    expect(v.banner?.title).toBe("Paid ✓ · confirmed by the payment provider Sep 30, 10:14 AM UTC");
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

  it("E4 — FAILED and still due: try again on Stripe, with the reason", () => {
    const v = paymentView("AWAITING_PAYMENT", pay(attempt("FAILED", { failureReason: "The card was declined (test payment provider)." })));
    expect(v.kind).toBe("failed");
    expect(v.status).toBe("Not paid");
    expect(v.cta).toEqual(stripeCta("Try again on Stripe"));
    expect(v.cta?.ariaLabel.endsWith("Leaves SponsorX and opens Stripe.")).toBe(true);
    expect(v.banner?.detail).toBe("Reason: The card was declined (test payment provider).");
    expect(v.banner?.role).toBe("alert");
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

describe("orderTracker", () => {
  const steps = (state: string, p: ApiOrderPayment | null) => orderTracker(order(state), paymentView(state, p), p);

  it("awaiting approval: placed done, approval current, the rest to do", () => {
    const s = steps("PENDING_APPROVAL", pay(null))!;
    expect(s.map((x) => x.state)).toEqual(["done", "current", "todo", "todo", "todo"]);
    expect(s[0].note).toBe("Sep 28, 2026");
  });

  it("due: payment is the current step, noted by the card's state", () => {
    expect(steps("APPROVED", pay(null))![2]).toMatchObject({ label: "Payment", state: "current", note: "Due now" });
    expect(steps("AWAITING_PAYMENT", pay(attempt("PROCESSING")))![2].note).toBe("Confirming…");
    expect(steps("AWAITING_PAYMENT", pay(attempt("FAILED")))![2]).toMatchObject({ note: "Failed · try again", tone: "danger" });
    expect(steps("APPROVED", pay(null))![1].note).toBe("Sep 29, 2026");
  });

  it("paid: payment done (dated by the provider), in delivery current", () => {
    const s = steps("PAID", pay(attempt("SUCCEEDED")))!;
    expect(s.map((x) => x.state)).toEqual(["done", "done", "done", "current", "todo"]);
    expect(s[2].note).toBe("Sep 30, 2026");
  });

  it("fulfilled / closed: every step done", () => {
    expect(steps("FULFILLED", pay(null))!.every((x) => x.state === "done")).toBe(true);
    expect(steps("CLOSED", pay(null))!.every((x) => x.state === "done")).toBe(true);
  });

  it("cancelled or refunded: no tracker", () => {
    expect(steps("CANCELLED", pay(null))).toBeNull();
    expect(steps("REFUNDED", pay(null))).toBeNull();
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
