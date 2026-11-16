import { describe, expect, it } from "vitest";

import { approvalCard, saleCard, salesShopTabs, salesSidings, salesStations, salesTabPatch } from "@/lib/athlete-sales-shop";
import type { ApiSellerApproval } from "@/lib/order-automation-live";
import type { ApiSalesTab, ApiSellerOrder } from "@/lib/seller-orders-live";

/* POL-FE-95 — the athlete's Sales: what each sale says, from GET /sales. */

const NOW = new Date("2026-10-12T12:00:00.000Z");

const base: ApiSellerOrder = {
  id: "sl95-line-1", orderId: "sl95-ord-1", ref: "SX-SL95AAAA", state: "IN_DELIVERY", orderState: "PAID",
  sponsor: { name: "Harbor Coffee", contact: null },
  line: {
    title: "Youth basketball clinic", quantity: 2, unit: "session", unitPriceCents: 50_000,
    startsOn: "2026-10-10T12:00:00.000Z", endsOn: "2026-10-17T12:00:00.000Z", dates: ["2026-10-10", "2026-10-17"],
    soldBy: "Riley Carter", athlete: "Riley Carter",
  },
  shareCents: 60_424, placedAt: "2026-10-01T14:05:00.000Z", paidAt: "2026-10-01T14:06:00.000Z",
  markedAt: null, markedBy: null, deliveryNote: null, proof: { photo: false, link: null }, confirmDueAt: null,
  confirmedAt: null, confirmedBy: null, problem: null, resolution: null, overdue: false, canMarkDelivered: true,
};

describe("one sale, in plain words", () => {
  it("a paid sale is the athlete's move: deliver by the last date, then mark it delivered", () => {
    const c = saleCard(base, NOW);
    expect(c).toMatchObject({ stage: "deliver", label: "To deliver", move: true, cta: "Mark delivered", share: "$604.24", units: "2 sessions", dates: "Oct 10 and Oct 17", progress: 1 });
    expect(c.next.title).toBe("Deliver it by Oct 17");
    expect(c.track.map((t) => t.state)).toEqual(["done", "current", "todo", "todo"]);
  });
  it("one day says 'on', not 'by'", () => {
    const c = saleCard({ ...base, line: { ...base.line, dates: ["2026-10-17"], startsOn: base.line.endsOn } }, NOW);
    expect(c.next.title).toBe("Deliver it on Oct 17");
    expect(c.units).toBe("2 sessions");
    expect(saleCard({ ...base, line: { ...base.line, quantity: 1 } }, NOW).units).toBe("1 session");
  });
  it("overdue says so and stays the athlete's move", () => {
    const c = saleCard({ ...base, overdue: true }, NOW);
    expect(c).toMatchObject({ label: "Overdue", late: true, move: true });
    expect(c.next.title).toMatch(/^Overdue/);
  });
  it("unpaid: nothing to do yet", () => {
    const c = saleCard({ ...base, state: "UNPAID", paidAt: null }, NOW);
    expect(c).toMatchObject({ stage: "pay", label: "Not paid yet", move: false, progress: 0 });
    expect(c.next.title).toBe("Waiting for Harbor Coffee to pay");
  });
  it("marked delivered: waiting for the sponsor, with when silence counts", () => {
    const c = saleCard({ ...base, state: "DELIVERED", markedAt: "2026-10-12T00:00:00.000Z", confirmDueAt: "2026-10-13T00:00:00.000Z" }, NOW);
    expect(c).toMatchObject({ stage: "confirm", move: false, progress: 2 });
    expect(c.next.hint).toBe("If they don’t answer, it counts as confirmed in 12 hours.");
  });
  it("confirmed: done, every step ticked", () => {
    const c = saleCard({ ...base, state: "CONFIRMED", confirmedAt: "2026-10-12T00:00:00.000Z" }, NOW);
    expect(c).toMatchObject({ stage: "done", label: "Confirmed", progress: 3 });
    expect(c.track.every((t) => t.state === "done")).toBe(true);
  });
  it("a problem it's the athlete's turn to answer asks for an answer", () => {
    const issue = { id: "i", kind: "PROBLEM", stage: "SELLER_TO_ANSWER", open: true, problem: { text: "No-show", at: "2026-10-11T00:00:00.000Z" }, sellerDueAt: "2026-10-14T00:00:00.000Z", sellerCanAnswer: true, sellerAnswer: null, sponsorDueAt: null, sponsorCanAnswer: false, sponsorAnswer: null, escalation: null, outcome: null } as const;
    const c = saleCard({ ...base, state: "PROBLEM", issue }, NOW);
    expect(c).toMatchObject({ stage: "problem", move: true, cta: "Answer" });
    expect(c.next.title).toBe("Harbor Coffee reported a problem");
    expect(saleCard({ ...base, state: "PROBLEM", issue: { ...issue, stage: "ESCALATED" } }, NOW)).toMatchObject({ move: false, label: "BTG is deciding" });
  });
  it("a cancelled sale is ended, its track struck", () => {
    const c = saleCard({ ...base, state: "CANCELLED", cancellation: { canCancel: false, cancellationsLast90Days: 0, limit: 2, windowDays: 90, warning: "", cancelled: { at: "2026-10-11T00:00:00.000Z", by: "SPONSOR", note: null } } }, NOW);
    expect(c).toMatchObject({ stage: "ended", ended: true, move: false, label: "Cancelled by Harbor Coffee" });
    expect(c.next.title).toBe("Harbor Coffee cancelled this sale");
    expect(c.track.some((t) => t.state === "current")).toBe(false);
  });
  it("a refund says there's no share", () => {
    expect(saleCard({ ...base, state: "REFUNDED" }, NOW).next.hint).toMatch(/no share/);
  });
});

const TABS: ApiSalesTab[] = [
  { key: "all", label: "All", count: 9 },
  { key: "to_deliver", label: "To deliver", count: 0 },
  { key: "awaiting_payment", label: "Awaiting payment", count: 2 },
  { key: "delivered", label: "Delivered", count: 1 },
  { key: "problems", label: "Problems", count: 1 },
  { key: "confirmed", label: "Confirmed", count: 5 },
  { key: "cancelled", label: "Cancelled", count: 0 },
];

describe("the tabs and the road", () => {
  it("All and To deliver always, the rest when they have a sale, in the order a sale moves, in plainer words", () => {
    expect(salesShopTabs(TABS, "all").map((t) => `${t.key}:${t.label}:${t.count}`)).toEqual([
      "all:All:9", "to_deliver:To deliver:0", "problems:Problems:1", "awaiting_payment:Not paid yet:2", "delivered:Waiting to confirm:1", "confirmed:Done:5",
    ]);
    expect(salesShopTabs(TABS, "cancelled").map((t) => t.key)).toContain("cancelled");
  });
  it("a tab sets ?tab=, All clears it", () => {
    expect(salesTabPatch("all")).toEqual({ tab: null });
    expect(salesTabPatch("problems")).toEqual({ tab: "problems" });
  });
  it("four stations with the API's counts; problems and cancellations off the road only when any", () => {
    expect(salesStations(TABS).map((s) => [s.key, s.count])).toEqual([["awaiting_payment", 2], ["to_deliver", 0], ["delivered", 1], ["confirmed", 5]]);
    expect(salesSidings(TABS).map((s) => s.key)).toEqual(["problems"]);
    expect(salesStations([])).toHaveLength(4);
  });
});

describe("a sponsor waiting for a yes or no", () => {
  it("says the ask, the deadline and the total", () => {
    const a: ApiSellerApproval = {
      id: "sl95-ap-1", orderRef: "SX-SL95BBBB", state: "PENDING", canAnswer: true, dueAt: "2026-10-12T20:00:00.000Z", hoursLeft: 8, decidedAt: null, reason: null, orderOutcome: "WAITING",
      sponsorName: "Harbor Coffee", seller: { type: "ATHLETE", id: "a", name: "Riley Carter" },
      lines: [{ id: "l", title: "Youth basketball clinic", quantity: 1, unitPriceCents: 50_000, startsOn: "2026-10-20T12:00:00.000Z", endsOn: "2026-10-20T12:00:00.000Z" } as ApiSellerApproval["lines"][number]],
      totalCents: 50_000, createdAt: "2026-10-11T20:00:00.000Z",
    };
    const c = approvalCard(a, NOW);
    expect(c).toMatchObject({ waiting: true, urgent: true, total: "$500.00", sponsor: "Harbor Coffee" });
    expect(c.ask).toMatch(/Harbor Coffee wants to book Youth basketball clinic/);
    expect(c.due).toMatch(/^Answer by Oct 12, 8:00 pm UTC · in 8 hours$/);
    expect(approvalCard({ ...a, canAnswer: false, state: "DECLINED" }, NOW)).toMatchObject({ waiting: false, due: null, label: "Declined by you" });
  });
});
