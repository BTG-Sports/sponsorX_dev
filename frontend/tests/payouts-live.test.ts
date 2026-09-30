import { describe, expect, it } from "vitest";

import {
  PROVIDER_NOT_CONNECTED, STRIPE_ARIA_SUFFIX, TEST_PROVIDER_BADGE,
  accountPanel, athleteBanner, historyRows, payoutRefusal, payoutStatus, payoutTiles, providerUrl,
  requestButton, requestOrders, safeReturnPath, showChecklist, usd,
  type ApiMyPayouts, type ApiPayout, type ApiPayoutAccount, type ApiPayoutOrder,
} from "../src/lib/payouts-live";

/* --------------------------------------------------------------------------
   2S5-FE-02 / 2S5-FE-03 — the payee's payout screens' pure logic: the
   account panel per status (the Stripe CTA rule), payout status words, the
   request button and its reason, and refusals.
   -------------------------------------------------------------------------- */

const acct = (over: Partial<ApiPayoutAccount> = {}): ApiPayoutAccount => ({
  status: "NOT_SET_UP", provider: "standin", canSetUp: true, testProvider: false, updatedAt: null, ...over,
});

const payout = (over: Partial<ApiPayout> = {}): ApiPayout => ({
  id: "p1", amountCents: 100000, state: "REQUESTED", requestedAt: "2026-09-20T10:00:00Z", decidedAt: null, decisionNote: null,
  providerRef: null, sentAt: null, paidAt: null, failureReason: null,
  lines: [{ orderId: "o1", orderRef: "SX-AAAA0001", amountCents: 100000 }], ...over,
});

const order = (over: Partial<ApiPayoutOrder> = {}): ApiPayoutOrder => ({
  orderId: "o1", orderRef: "SX-AAAA0001", state: "FULFILLED", fulfilledAt: "2026-09-01T00:00:00Z", sponsorName: "Acme", title: "Jersey patch",
  shareCents: 50000, availableCents: 45000, heldCents: 5000, awaitingPaymentCents: 0, inFlightCents: 0, requestableCents: 45000, holdUntil: null, ...over,
});

const totals = (over: Partial<ApiMyPayouts["totals"]> = {}): ApiMyPayouts["totals"] => ({
  requestableCents: 0, heldCents: 0, awaitingPaymentCents: 0, notYetReleasableCents: 0, inFlightCents: 0, paidOutCents: 0, ...over,
});

const checks = (ok: Partial<Record<"payment" | "delivered" | "account" | "hold", boolean>> = {}) => [
  { key: "payment", label: "Sponsor's payment received", ok: ok.payment ?? true },
  { key: "delivered", label: "Order delivered (marked fulfilled)", ok: ok.delivered ?? true },
  { key: "account", label: "Payout account ready", ok: ok.account ?? true },
  { key: "hold", label: "Holding period ends 2026-10-05", ok: ok.hold ?? true },
];

describe("usd / helpers", () => {
  it("formats integer cents to two decimals", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(50461)).toBe("$504.61");
    expect(usd(123456789)).toBe("$1,234,567.89");
    expect(usd(-500)).toBe("−$5.00");
  });
  it("keeps return paths on this site", () => {
    expect(safeReturnPath("/property/earnings", "/x")).toBe("/property/earnings");
    expect(safeReturnPath("//evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("https://evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("/a\\b", "/x")).toBe("/x");
    expect(safeReturnPath(undefined, "/x")).toBe("/x");
  });
  it("accepts only http(s) provider urls", () => {
    expect(providerUrl("https://connect.stripe.com/setup/abc")).toBe("https://connect.stripe.com/setup/abc");
    expect(providerUrl("javascript:alert(1)")).toBeNull();
    expect(providerUrl("/relative")).toBeNull();
    expect(providerUrl(42)).toBeNull();
  });
});

describe("accountPanel", () => {
  it("NOT_SET_UP — primary set-up CTA naming Stripe, leaving SponsorX", () => {
    const v = accountPanel(acct(), "Westfield Hawks");
    expect(v.body).toBe("Set up where Westfield Hawks gets paid. It takes about 5 minutes on Stripe, then you come straight back here.");
    expect(v.cta).toMatchObject({ label: "Set up payouts with Stripe ↗", variant: "primary", disabled: false, disabledNote: null });
    expect(v.cta.ariaLabel.endsWith(STRIPE_ARIA_SUFFIX)).toBe(true);
    expect(v.chip.label).toBe("Not set up");
    expect(v.actionNeeded).toBe(true);
    expect(v.testBadge).toBeNull();
  });
  it("NEEDS_INFO — continue on Stripe", () => {
    const v = accountPanel(acct({ status: "NEEDS_INFO" }), "Westfield Hawks");
    expect(v.headline).toBe("Stripe needs a bit more information");
    expect(v.cta).toMatchObject({ label: "Continue on Stripe ↗", variant: "primary" });
    expect(v.actionNeeded).toBe(true);
  });
  it("READY — active chip and an outline manage CTA", () => {
    const v = accountPanel(acct({ status: "READY" }), "Westfield Hawks");
    expect(v.chip).toMatchObject({ label: "Active", mark: "✓", tone: "accent" });
    expect(v.body).toBe("Payouts go to the bank account you added on Stripe. To change it, update it on Stripe.");
    expect(v.cta).toMatchObject({ label: "Manage payouts on Stripe ↗", variant: "outline" });
    expect(v.cta.ariaLabel).toBe(`Manage payouts on Stripe. ${STRIPE_ARIA_SUFFIX}`);
    expect(v.actionNeeded).toBe(false);
  });
  it("provider not connected — CTA still shown, disabled, with the reason", () => {
    const v = accountPanel(acct({ canSetUp: false, provider: "none" }), "Westfield Hawks");
    expect(v.cta.label).toBe("Set up payouts with Stripe ↗");
    expect(v.cta.disabled).toBe(true);
    expect(v.cta.disabledNote).toBe(PROVIDER_NOT_CONNECTED);
  });
  it("stand-in provider — the staging badge", () => {
    expect(accountPanel(acct({ testProvider: true }), "X").testBadge).toBe(TEST_PROVIDER_BADGE);
  });
});

describe("athleteBanner", () => {
  it("shows while not set up, hides when READY", () => {
    const b = athleteBanner(acct());
    expect(b.show).toBe(true);
    if (b.show) {
      expect(b.title).toBe("Payout account not set up");
      expect(b.body).toBe("Payouts go through Stripe. Set it up now so your first payout isn't held up.");
      expect(b.cta.label).toBe("Set up payouts with Stripe ↗");
      expect(b.minorLine).toBeNull();
    }
    const r = athleteBanner(acct({ status: "READY" }));
    expect(r.show).toBe(false);
    expect(r.readyLine).toContain("managed by Stripe");
  });
  it("NEEDS_INFO title and CTA; minor line only when asked", () => {
    const b = athleteBanner(acct({ status: "NEEDS_INFO" }), { minor: true });
    expect(b.show && b.title).toBe("Stripe needs a bit more information");
    expect(b.show && b.cta.label).toBe("Continue on Stripe ↗");
    expect(b.show && b.minorLine).toBe("Because you're under 18, a parent or guardian finishes this on Stripe.");
  });
});

describe("payoutStatus", () => {
  it("names every state in words", () => {
    expect(payoutStatus(payout()).label).toBe("Requested — waiting for BTG");
    expect(payoutStatus(payout({ state: "APPROVED" })).label).toBe("Approved by BTG — sending soon");
    expect(payoutStatus(payout({ state: "SENDING" })).label).toBe("Sending — with the payment provider");
    expect(payoutStatus(payout({ state: "PAID", paidAt: "2026-09-22T15:00:00Z" }))).toEqual({
      label: "Paid · confirmed by the payment provider Sep 22, 2026", tone: "accent",
    });
    expect(payoutStatus(payout({ state: "REJECTED", decisionNote: "Order under dispute" })).label).toBe("Sent back by BTG: Order under dispute");
    expect(payoutStatus(payout({ state: "FAILED" }))).toEqual({
      label: "The payment provider couldn't send this — BTG is looking into it", tone: "danger",
    });
  });
  it("history rows carry date, amount and order refs", () => {
    const [r] = historyRows([payout({ lines: [{ orderId: "a", orderRef: "SX-1", amountCents: 1 }, { orderId: "b", orderRef: "SX-2", amountCents: 2 }] })]);
    expect(r).toMatchObject({ date: "Sep 20, 2026", amount: "$1,000.00", orders: ["SX-1", "SX-2"] });
  });
});

describe("requestButton", () => {
  it("enabled when the API says canRequest", () => {
    expect(requestButton({ canRequest: true, checks: checks(), totals: totals({ requestableCents: 50461 }) })).toEqual({
      label: "Request payout · $504.61", enabled: true, reason: null,
    });
  });
  it("disabled with the first unmet check as the reason", () => {
    const v = requestButton({ canRequest: false, checks: checks({ account: false, hold: false }), totals: totals({ requestableCents: 0 }) });
    expect(v).toEqual({ label: "Request payout · $0.00", enabled: false, reason: "Waiting on: Payout account ready" });
  });
  it("all checks met but nothing left — says it is already requested", () => {
    const v = requestButton({ canRequest: false, checks: checks(), totals: totals({ inFlightCents: 2500 }) });
    expect(v.reason).toBe("$25.00 is already requested — nothing more is ready yet.");
    expect(requestButton({ canRequest: false, checks: checks(), totals: totals() }).reason).toBe("Nothing is ready to pay out yet.");
  });
  it("includes only orders with something requestable", () => {
    const rows = requestOrders([order(), order({ orderId: "o2", orderRef: "SX-2", requestableCents: 0 }), order({ orderId: "o3", orderRef: "SX-3", sponsorName: null, title: null, requestableCents: 100 })]);
    expect(rows).toEqual([
      { orderId: "o1", orderRef: "SX-AAAA0001", title: "Acme · Jersey patch", amount: "$450.00" },
      { orderId: "o3", orderRef: "SX-3", title: "SX-3", amount: "$1.00" },
    ]);
  });
});

describe("checklist and tiles", () => {
  it("checklist only when a request isn't possible and money is on its way", () => {
    const unmet = [{ key: "account", label: "Payout account ready", ok: false }];
    const allMet = [{ key: "account", label: "Payout account ready", ok: true }];
    expect(showChecklist({ canRequest: true, totals: totals({ requestableCents: 1 }), checks: unmet })).toBe(false);
    expect(showChecklist({ canRequest: false, totals: totals(), checks: unmet })).toBe(false);
    expect(showChecklist({ canRequest: false, totals: totals({ heldCents: 1 }), checks: unmet })).toBe(true);
    expect(showChecklist({ canRequest: false, totals: totals({ requestableCents: 1 }), checks: unmet })).toBe(true);
    expect(showChecklist({ canRequest: false, totals: totals({ awaitingPaymentCents: 1 }), checks: unmet })).toBe(true);
    /* Money already requested and every rule met: no list of ticks. */
    expect(showChecklist({ canRequest: false, totals: totals({ heldCents: 1 }), checks: allMet })).toBe(false);
  });
  it("tiles come straight from totals", () => {
    const t = payoutTiles({ totals: totals({ requestableCents: 50461, heldCents: 26200, paidOutCents: 100000, inFlightCents: 500 }) });
    expect(t.map((x) => [x.label, x.value])).toEqual([
      ["Available to pay out", "$504.61"],
      ["Held in reserve", "$262.00"],
      ["Paid out", "$1,000.00"],
    ]);
    expect(t[0].sub).toBe("$5.00 already requested");
    expect(t[1].sub).toBe("Released when each order closes");
  });
});

describe("payoutRefusal", () => {
  it("passes a 409's message through, with string reasons", () => {
    expect(payoutRefusal(409, { error: { code: "bad_request", message: "Set up your payout account first — payouts are sent to it.", reasons: ["Payout account ready"] } })).toEqual({
      ok: false, status: 409, message: "Set up your payout account first — payouts are sent to it.", reasons: ["Payout account ready"],
    });
  });
  it("403 in words; no body falls back to the status", () => {
    expect(payoutRefusal(403, null).message).toContain("can't do this");
    expect(payoutRefusal(500, null).message).toBe("The request was refused (HTTP 500).");
  });
});
