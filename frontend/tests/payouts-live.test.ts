import { describe, expect, it } from "vitest";

import {
  PROVIDER_NOT_CONNECTED, STRIPE_ARIA_SUFFIX, TEST_PROVIDER_BADGE,
  accountPanel, athleteBanner, historyRows, payoutRefusal, payoutStatus, payoutTiles, providerUrl,
  requestButton, requestOrders, safeReturnPath, showChecklist, usd,
  type ApiMyPayouts, type ApiPayout, type ApiPayoutAccount, type ApiPayoutOrder,
} from "../src/lib/payouts-live";
import * as L from "../src/lib/payouts-live";

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
    /* 2S5-FE-06 — the payee reads that BTG is reviewing it, never why. */
    expect(payoutStatus(payout()).label).toBe("BTG is reviewing this payout");
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

describe("2S5-FE-03 / 2S5-FE-04 · the payout's road and BTG's queue", () => {
  const base = { requestedAt: "2026-09-30T10:40:00Z", decidedAt: null, sentAt: null, paidAt: null };
  it("tracks Requested → Approved by BTG → Sent → Paid from the payout's own times", () => {
    expect(L.payoutTracker({ ...base, state: "REQUESTED" })!.map((s) => [s.label, s.state, s.note])).toEqual([
      ["Requested", "done", "Sep 30, 10:40"], ["Approved by BTG", "current", "Waiting for BTG"], ["Sent", "todo", ""], ["Paid", "todo", ""],
    ]);
    const paid = L.payoutTracker({ ...base, state: "PAID", decidedAt: "2026-09-30T10:42:00Z", sentAt: "2026-09-30T10:42:30Z", paidAt: "2026-09-30T10:44:00Z" })!;
    expect(paid.every((s) => s.state === "done")).toBe(true);
    expect(paid[3]!.note).toBe("Sep 30, 10:44");
    expect(L.payoutTracker({ ...base, state: "SENDING", decidedAt: "2026-09-30T10:42:00Z", sentAt: "2026-09-30T10:42:30Z" })![3]).toMatchObject({ state: "current", note: "With the payment provider" });
    expect(L.payoutTracker({ ...base, state: "REJECTED" })).toBeNull();
    expect(L.payoutTracker({ ...base, state: "FAILED" })).toBeNull();
  });
  it("maps tabs to states and counts them from the API's per-state counts", () => {
    const counts = { REQUESTED: 2, APPROVED: 1, SENDING: 1, PAID: 5, FAILED: 1, REJECTED: 3 };
    expect(L.tabCount("waiting", counts)).toBe(2);
    expect(L.tabCount("sending", counts)).toBe(2);
    expect(L.tabCount("paid", counts)).toBe(5);
    expect(L.tabCount("problems", counts)).toBe(1);
    expect(L.approvalTab("nope")).toBe("waiting");
    expect(L.approvalTab("problems")).toBe("problems");
  });
  it("sums up the checks and how long a request has waited", () => {
    expect(L.checkSummary([{ key: "a", label: "Payout account ready", ok: true }])).toEqual({ ok: true, label: "All checks passed" });
    expect(L.checkSummary([{ key: "a", label: "Holding period passed", ok: false }])).toEqual({ ok: false, label: "Not met: Holding period passed" });
    const now = new Date("2026-09-30T12:00:00Z");
    expect(L.waitedFor("2026-09-30T11:56:00Z", now)).toBe("4 min");
    expect(L.waitedFor("2026-09-30T09:00:00Z", now)).toBe("3 h");
    expect(L.waitedFor("2026-09-27T12:00:00Z", now)).toBe("3 days");
  });
  it("takes the payee's part of the frozen split — the walkthrough's own figures", () => {
    const f = { grossCents: 100_000, availableCents: 67_822, reserveCents: 7_707, athleteId: "riley", teamAvailableCents: 13_564, teamReserveCents: 1_541 };
    expect(L.payeeShare(f, "ATHLETE")).toEqual({ saleCents: 100_000, shareCents: 60_424, availableCents: 54_258, reserveCents: 6_166 });
    expect(L.payeeShare(f, "PROPERTY")).toEqual({ saleCents: 100_000, shareCents: 15_105, availableCents: 13_564, reserveCents: 1_541 });
    expect(L.payeeShare({ ...f, athleteId: null, teamAvailableCents: null, teamReserveCents: null }, "PROPERTY").shareCents).toBe(75_529);
  });
  it("writes the audit trail from the payout's history", () => {
    const trail = L.auditTrail({ state: "REJECTED", payeeName: "Riley Carter", requestedAt: "2026-09-30T10:40:00Z", decidedAt: "2026-09-30T11:20:00Z", sentAt: null, paidAt: null, decisionNote: "Confirm the clinic date", failureReason: null });
    expect(trail).toEqual([
      { what: "Requested by Riley Carter", when: "Sep 30, 10:40" },
      { what: "Sent back by BTG: “Confirm the clinic date”", when: "Sep 30, 11:20" },
    ]);
  });
});

describe("2S5-FE-06 · approved automatically, the reasons, and the retry status", () => {
  const p = (over: Partial<L.ApiAdminPayout> = {}): L.ApiAdminPayout => ({
    id: "p1", amountCents: 27_118, state: "REQUESTED", requestedAt: "2026-10-02T15:00:00Z", decidedAt: null, decisionNote: null,
    providerRef: null, sentAt: null, paidAt: null, failureReason: null, lines: [], payeeType: "ATHLETE", payeeId: "a1", payeeName: "Riley Carter",
    approvedAutomatically: false, waitingOn: "BTG", reviewReasons: [], failureKind: null, retryCount: 0, nextRetryAt: null, ...over,
  });

  it("the payee's words: approved automatically, BTG reviewing, fix your payout account", () => {
    expect(payoutStatus(p({ state: "APPROVED", approvedAutomatically: true, waitingOn: null })).label).toBe("Approved automatically — sending soon");
    expect(payoutStatus(p({ state: "APPROVED", waitingOn: null })).label).toBe("Approved by BTG — sending soon");
    expect(payoutStatus(p({ reviewReasons: ["Over $2,000"] })).label).toBe("BTG is reviewing this payout");
    expect(payoutStatus(p({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" }))).toEqual({ label: "Your payout couldn't be sent — fix your payout account", tone: "warn" });
    expect(payoutStatus(p({ state: "FAILED", waitingOn: "SYSTEM_RETRY" })).label).toBe("Couldn't be sent yet — it will be tried again automatically");
    expect(payoutStatus(p({ state: "FAILED", waitingOn: "BTG" })).label).toBe("The payment provider couldn't send this — BTG is looking into it");
  });

  it("the fix-your-account link only for a payout waiting on the payee's account", () => {
    expect(L.payeeFixPrompt(p({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" }), "/athlete/money#payout-account")).toMatchObject({
      label: "Fix your payout account", href: "/athlete/money#payout-account",
    });
    expect(L.payeeFixPrompt(p({ state: "FAILED", waitingOn: "BTG" }), "/x")).toBeNull();
    expect(L.payeeFixPrompt(p({ state: "APPROVED", waitingOn: null }), "/x")).toBeNull();
  });

  it("the badge on the rule's approvals — never on a request or a send-back", () => {
    expect(L.approvalBadge(p({ state: "APPROVED", approvedAutomatically: true }))).toBe("Approved automatically");
    expect(L.approvalBadge(p({ state: "PAID", approvedAutomatically: true }))).toBe("Approved automatically");
    expect(L.approvalBadge(p({ state: "PAID" }))).toBeNull();
    expect(L.approvalBadge(p({ state: "REQUESTED", approvedAutomatically: true }))).toBeNull();
  });

  it("why a request waits for BTG", () => {
    expect(L.waitingReasons(p({ reviewReasons: ["Over $2,000", "Payout account changed on Oct 1"] }))).toBe("Waiting because: Over $2,000 · Payout account changed on Oct 1");
    expect(L.waitingReasons(p({ reviewReasons: [] }))).toBeNull();
    expect(L.waitingReasons(p({ state: "APPROVED", reviewReasons: ["Over $2,000"] }))).toBeNull();
  });

  it("the retry status, in words", () => {
    expect(L.retryWhen("2026-10-03T16:00:00Z")).toBe("Oct 3, 4:00 pm");
    expect(L.retryStatus(p({ state: "FAILED", waitingOn: "SYSTEM_RETRY", retryCount: 1, nextRetryAt: "2026-10-03T16:00:00Z" }))).toEqual({
      label: "Retrying automatically — next try Oct 3, 4:00 pm (2 of 3)", tone: "primary", needsBtg: false,
    });
    expect(L.retryStatus(p({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" }))).toMatchObject({ label: "Waiting for the payee to fix their payout account", needsBtg: false });
    expect(L.retryStatus(p({ state: "FAILED", waitingOn: "BTG", reviewReasons: ["Couldn't be sent after 3 tries"] }))).toMatchObject({ label: "Needs BTG — Couldn't be sent after 3 tries", needsBtg: true });
    expect(L.retryStatus(p({ state: "FAILED", waitingOn: "BTG", failureReason: "Refused." }))?.label).toBe("Needs BTG — Couldn't send: Refused.");
    expect(L.retryStatus(p({ state: "APPROVED" }))).toBeNull();
  });

  it("the Failed tab shows what needs BTG by default", () => {
    expect(L.failedFilter(undefined)).toBe("btg");
    expect(L.failedFilter("all")).toBe("all");
    expect(L.listQuery("problems")).toBe("state=FAILED&waitingOn=BTG");
    expect(L.listQuery("problems", "all")).toBe("state=FAILED");
    expect(L.listQuery("sending")).toBe("state=APPROVED,SENDING");
    const waiting = { BTG: 3, SYSTEM_RETRY: 2, PAYEE_ACCOUNT: 1, failed: { BTG: 1, SYSTEM_RETRY: 2, PAYEE_ACCOUNT: 1 } };
    expect(L.tabCount("problems", { FAILED: 4 }, waiting)).toBe(1);
    expect(L.tabCount("problems", { FAILED: 4 }, waiting, true)).toBe(4);
    expect(L.APPROVAL_TABS.find((t) => t.key === "problems")!.label).toBe("Failed");
  });

  it("the tracker and the trail name an automatic approval", () => {
    const auto = { state: "APPROVED" as const, requestedAt: "2026-10-02T15:00:00Z", decidedAt: "2026-10-02T15:00:00Z", sentAt: null, paidAt: null, approvedAutomatically: true };
    expect(L.payoutTracker(auto)![1]).toMatchObject({ label: "Approved automatically", state: "done" });
    expect(L.auditTrail({ ...auto, payeeName: "Riley Carter", decisionNote: null, failureReason: null })[1]!.what).toBe("Approved automatically — every check passed");
  });
});

/* 2S8-QA-05 — a refund after a payout leaves the order's figure negative. The
   money page used to round it up to $0, hiding what the payee owes back. */
describe("2S8-QA-05 · money owed back after a refund", () => {
  /* Paid out $542.58, then refunded: the reversal takes the payable to −$542.58. */
  const refunded = order({ state: "REFUNDED", availableCents: -54258, heldCents: 0, requestableCents: 0, balanceCents: -54258, owedBackCents: 54258 });

  it("an order's Available cell shows the real negative figure and says it is owed back", () => {
    expect(L.orderAvailable(refunded)).toEqual({ value: "−$542.58", owedBack: "You owe $542.58 back from a refund" });
    /* An older read without balanceCents: computed the same way, never clamped. */
    const older = { ...refunded, balanceCents: undefined, owedBackCents: undefined };
    expect(L.orderAvailable(older)).toEqual({ value: "−$542.58", owedBack: "You owe $542.58 back from a refund" });
  });

  it("an ordinary order is unchanged — available less what is already requested, nothing owed", () => {
    expect(L.orderAvailable(order({ availableCents: 45000, inFlightCents: 5000, balanceCents: 40000 }))).toEqual({ value: "$400.00", owedBack: null });
    expect(L.orderAvailable(order({ availableCents: 0, inFlightCents: 0, balanceCents: 0 }))).toEqual({ value: "$0.00", owedBack: null });
  });

  it("the page notice totals what is owed back, from the API's figure", () => {
    expect(L.owedBackNotice({ totals: totals({ owedBackCents: 54258 }), orders: [refunded, order()] })).toBe("You owe $542.58 back from a refund");
    expect(L.owedBackNotice({ totals: totals({ owedBackCents: 0 }), orders: [order()] })).toBeNull();
    /* Older read: summed over the orders. */
    expect(L.owedBackNotice({ totals: totals(), orders: [refunded, order({ availableCents: -1000, inFlightCents: 0, requestableCents: 0 })] }))
      .toBe("You owe $552.58 back from a refund");
  });

  it("owedBackLine is null for nothing owed, never \"You owe $0.00\"", () => {
    expect(L.owedBackLine(0)).toBeNull();
    expect(L.owedBackLine(-5)).toBeNull();
    expect(L.owedBackLine(1)).toBe("You owe $0.01 back from a refund");
  });
});
