import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FirstMoneyHero } from "@/components/athlete-money/money-hero";
import {
  cashBoard, moneySidings, moneyStations, orderMoneyCard, payoutCard, payoutTabPatch, payoutTabs, sampleMoney,
} from "@/lib/athlete-money-shop";
import { FROZEN_LINE, type ApiMyPayouts, type ApiPayout, type ApiPayoutOrder } from "@/lib/payouts-live";

/* POL-FE-97 — the athlete's Payouts: what the page says, from GET /payouts/me. */

const NOW = new Date("2026-11-16T12:00:00.000Z");

const order = (o: Partial<ApiPayoutOrder> = {}): ApiPayoutOrder => ({
  orderId: "my97-ord-1", orderRef: "SX-MY97AAAA", state: "CLOSED", fulfilledAt: null, sponsorName: "Harbor Coffee", title: "Instagram post",
  shareCents: 60_424, availableCents: 0, heldCents: 0, awaitingPaymentCents: 0, inFlightCents: 0, requestableCents: 0, holdUntil: null, ...o,
});

const me = (o: Partial<ApiMyPayouts> = {}, totals: Partial<ApiMyPayouts["totals"]> = {}): ApiMyPayouts => ({
  currency: "USD",
  payee: { payeeType: "ATHLETE", name: "you" },
  account: { status: "READY", provider: "stripe", canSetUp: true, testProvider: false, updatedAt: null },
  totals: { requestableCents: 0, heldCents: 0, awaitingPaymentCents: 0, notYetReleasableCents: 0, inFlightCents: 0, paidOutCents: 0, ...totals },
  canRequest: false,
  checks: [],
  orders: [],
  payouts: [],
  ...o,
});

const payout = (o: Partial<ApiPayout> = {}): ApiPayout => ({
  id: "my97-p-1", amountCents: 54_258, state: "REQUESTED", requestedAt: "2026-11-10T10:00:00.000Z", decidedAt: null, decisionNote: null,
  providerRef: null, sentAt: null, paidAt: null, failureReason: null, lines: [{ orderId: "my97-ord-1", orderRef: "SX-MY97AAAA", amountCents: 54_258 }], ...o,
});

describe("cashBoard — the first thing the page says", () => {
  it("leads with what can be cashed out, and the button the e2e walk presses", () => {
    const b = cashBoard(me({ canRequest: true }, { requestableCents: 54_258 }));
    expect(b).toMatchObject({ cents: 54_258, mood: "ready", headline: "$542.58 is yours to cash out", reason: null });
    expect(b.button).toEqual({ label: "Request payout · $542.58", enabled: true });
  });

  it("money ready but no payout account: says to set it up first, points at the checklist", () => {
    const b = cashBoard(me({
      account: { status: "NOT_SET_UP", provider: "stripe", canSetUp: true, testProvider: false, updatedAt: null },
      checks: [{ key: "account", label: "Payout account ready", ok: false }],
    }, { requestableCents: 10_000 }));
    expect(b.headline).toBe("$100.00 is ready. Set up your payout account to cash out");
    expect(b).toMatchObject({ mood: "wait", checklist: true, reason: "Waiting on: Payout account ready" });
    expect(b.button.enabled).toBe(false);
  });

  it("nothing ready, a payout on its way: leads with that", () => {
    const b = cashBoard(me({}, { inFlightCents: 30_000, awaitingPaymentCents: 12_000 }));
    expect(b).toMatchObject({ cents: 30_000, eyebrow: "On its way to you", headline: "$300.00 is on its way to your bank" });
    expect(b.body).toContain("Another $120.00 is on its way in");
  });

  it("nothing ready, money coming in: the sum of the API's awaiting and locked totals", () => {
    const b = cashBoard(me({}, { awaitingPaymentCents: 12_000, notYetReleasableCents: 25_000 }));
    expect(b).toMatchObject({ cents: 37_000, eyebrow: "Coming in", headline: "$370.00 is on its way in", mood: "wait" });
  });

  it("all paid up, or nothing at all", () => {
    expect(cashBoard(me({}, { paidOutCents: 88_000 })).headline).toBe("You're all paid up");
    expect(cashBoard(me()).headline).toBe("Nothing to cash out yet");
    expect(cashBoard(me()).mood).toBe("none");
  });
});

describe("moneyStations / moneySidings — the road", () => {
  it("five stops in order, each the API's own total", () => {
    const s = moneyStations(me({}, { awaitingPaymentCents: 1, notYetReleasableCents: 2, requestableCents: 3, inFlightCents: 4, paidOutCents: 5 }));
    expect(s.map((x) => [x.key, x.label, x.cents])).toEqual([
      ["pay", "Sponsor pays", 1], ["locked", "Unlocking", 2], ["ready", "Ready", 3], ["moving", "On its way", 4], ["paid", "Paid", 5],
    ]);
  });

  it("reserve, frozen and owed back sit off the road, only when there is any", () => {
    expect(moneySidings(me())).toEqual([]);
    const s = moneySidings(me({ orders: [order({ frozen: true, availableCents: 15_000 })] }, { heldCents: 6_166, owedBackCents: 2_000 }));
    expect(s.map((x) => [x.key, x.cents])).toEqual([["reserve", 6_166], ["frozen", 15_000], ["owed", 2_000]]);
    expect(s[1]!.hint).toBe(`${FROZEN_LINE}.`);
  });
});

describe("orderMoneyCard — where one sale's money is", () => {
  it("ready: the amount, a way to cash out, labelled parts", () => {
    const c = orderMoneyCard(order({ availableCents: 54_258, requestableCents: 54_258, heldCents: 6_166 }), NOW);
    expect(c).toMatchObject({ stage: "ready", label: "Ready", share: "$604.24", go: { label: "Cash out", href: "#cash-out" } });
    expect(c.next.title).toBe("$542.58 ready to cash out");
    expect(c.parts).toEqual([
      { key: "ready", label: "Ready", amount: "$542.58" },
      { key: "reserve", label: "In reserve", amount: "$61.66" },
    ]);
  });

  it("frozen: says Frozen once and BTG's sentence; its amount isn't labelled Frozen again", () => {
    const c = orderMoneyCard(order({ frozen: true, availableCents: 15_000, state: "IN_DELIVERY" }), NOW);
    expect(c).toMatchObject({ stage: "frozen", label: "Frozen", frozen: true });
    expect(c.next.hint).toContain(FROZEN_LINE);
    expect(c.parts.map((p) => p.label)).toEqual(["Held for review"]);
  });

  it("owed back after a refund comes before anything else", () => {
    const c = orderMoneyCard(order({ availableCents: -2_000, balanceCents: -2_000 }), NOW);
    expect(c).toMatchObject({ stage: "owed", owedBack: "You owe $20.00 back from a refund" });
  });

  it("locked: the holding period's date, or what unlocks it — with the way to Sales", () => {
    const held = orderMoneyCard(order({ state: "FULFILLED", availableCents: 25_000, holdUntil: "2026-11-20T12:00:00.000Z" }), NOW);
    expect(held).toMatchObject({ stage: "locked", go: null });
    expect(held.next.title).toBe("$250.00 unlocks Nov 20, 2026");
    const deliver = orderMoneyCard(order({ state: "IN_DELIVERY", availableCents: 25_000 }), NOW);
    expect(deliver.next.title).toBe("$250.00 unlocks once you deliver");
    expect(deliver.go).toEqual({ label: "Deliver it", href: "/athlete/sales?tab=to_deliver" });
    const confirm = orderMoneyCard(order({ state: "FULFILLED", availableCents: 25_000 }), NOW);
    expect(confirm.next.title).toBe("$250.00 unlocks once the sponsor confirms");
    const problem = orderMoneyCard(order({ state: "FULFILLED", availableCents: 25_000, problemLines: 1 }), NOW);
    expect(problem.next.title).toBe("$250.00 on hold");
  });

  it("waiting for payment, on its way, in reserve, paid, ended", () => {
    expect(orderMoneyCard(order({ state: "AWAITING_PAYMENT", awaitingPaymentCents: 12_000 }), NOW).stage).toBe("pay");
    expect(orderMoneyCard(order({ availableCents: 30_000, inFlightCents: 30_000, balanceCents: 0 }), NOW)).toMatchObject({ stage: "moving", go: { href: "#your-payouts" } });
    expect(orderMoneyCard(order({ heldCents: 6_166 }), NOW).stage).toBe("reserve");
    expect(orderMoneyCard(order(), NOW)).toMatchObject({ stage: "paid", label: "Paid out", parts: [] });
    expect(orderMoneyCard(order({ state: "REFUNDED" }), NOW)).toMatchObject({ stage: "ended", label: "Refunded" });
  });
});

describe("payoutCard / payoutTabs — the payouts", () => {
  it("a payout in the payee's words, with its track and orders", () => {
    const p = payoutCard(payout());
    expect(p).toMatchObject({ stage: "review", amount: "$542.58", date: "Nov 10, 2026", orders: "Order SX-MY97AAAA", status: "BTG is reviewing this payout", auto: null, fix: null });
    expect(p.track?.map((t) => t.state)).toEqual(["done", "current", "todo", "todo"]);
  });

  it("paid automatically keeps the badge; a payout waiting on the account carries the fix", () => {
    expect(payoutCard(payout({ state: "PAID", paidAt: "2026-11-12T10:00:00.000Z", approvedAutomatically: true })).auto).toBe("Approved automatically");
    const f = payoutCard(payout({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" }));
    expect(f).toMatchObject({ stage: "problem", track: null, fix: { label: "Fix your payout account", href: "/athlete/money#payout-account" } });
  });

  it("tabs: All, then each state with a payout (or the one picked); a tab resets only the history's page", () => {
    expect(payoutTabs({ PAID: 2, SENDING: 1 }, "")).toEqual([
      { key: "all", label: "All", count: 3 },
      { key: "SENDING", label: "Sending", count: 1 },
      { key: "PAID", label: "Paid", count: 2 },
    ]);
    expect(payoutTabs({ PAID: 2 }, "REQUESTED").map((t) => t.label)).toEqual(["All", "In review", "Paid"]);
    expect(payoutTabPatch("all")).toEqual({ hstate: null, hpage: null, list: "payouts" });
    expect(payoutTabPatch("PAID")).toEqual({ hstate: "PAID", hpage: null, list: "payouts" });
  });
});

describe("sampleMoney / the hero", () => {
  it("the sample's totals are its orders' own sums, as the API would count them", () => {
    const s = sampleMoney(NOW);
    const sum = (f: (o: ApiPayoutOrder) => number) => s.orders.reduce((n, o) => n + f(o), 0);
    expect(s.totals.requestableCents).toBe(sum((o) => o.requestableCents));
    expect(s.totals.heldCents).toBe(sum((o) => o.heldCents));
    expect(s.totals.awaitingPaymentCents).toBe(sum((o) => o.awaitingPaymentCents));
    expect(s.totals.inFlightCents).toBe(sum((o) => o.inFlightCents));
    expect(s.totals.notYetReleasableCents).toBe(sum((o) => Math.max(0, o.availableCents - o.inFlightCents) - o.requestableCents));
    expect(sampleMoney(NOW, "setup")).toMatchObject({ canRequest: false, account: { status: "NOT_SET_UP" } });
  });

  it("the hero says to set the account up only when it needs it", () => {
    const html = (setUp: boolean) => renderToStaticMarkup(createElement(FirstMoneyHero, { setUp }));
    expect(html(false)).toContain("No money yet.");
    expect(html(false)).not.toContain("Set up your payout account");
    expect(html(true)).toContain("Set up your payout account below now");
  });
});
