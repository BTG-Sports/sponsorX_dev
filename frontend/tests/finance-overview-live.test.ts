import { describe, expect, it } from "vitest";

import { delta, needsYouTotal, PAY_STEPS, rangeParam, splitRows, waitedFor } from "@/lib/finance-overview-live";

/* P1-ART-25 — the Treasury's pure helpers: GET /finance/overview's shape
   plus the small reads the page draws with. No network here. */

describe("finance overview helpers", () => {
  it("delta is a fraction, null without a previous window or from zero", () => {
    expect(delta(120, 100)).toBeCloseTo(0.2);
    expect(delta(5, null)).toBeNull();
    expect(delta(5, 0)).toBeNull();
  });
  it("rangeParam keeps known ranges and defaults to 30d", () => {
    expect(rangeParam({ range: "7d" })).toBe("7d");
    expect(rangeParam({ range: "x" })).toBe("30d");
    expect(rangeParam({})).toBe("30d");
  });
  it("needsYouTotal adds the four desks", () => {
    expect(needsYouTotal({ payouts: { count: 7, cents: 1, oldestAt: null }, refunds: { count: 3, cents: 1, oldestAt: null }, disputes: { count: 2, cents: 1 }, events: { count: 1 } })).toBe(13);
  });
  it("splitRows drops empty accounts, sorts by size and gives shares", () => {
    const rows = splitRows({ athletes: 600, properties: 0, platform: 200, management: 0, processing: 100, referral: 0, reserve: 100 });
    expect(rows.map((r) => r.key)).toEqual(["athletes", "platform", "processing", "reserve"]);
    expect(rows[0]).toMatchObject({ label: "Athletes", cents: 600, share: 0.6 });
  });
  it("waitedFor reads in plain words", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(waitedFor("2026-10-10T11:00:00Z", now)).toBe("waited 2 days");
    expect(waitedFor("2026-10-12T09:00:00Z", now)).toBe("waited 3 hours");
    expect(waitedFor(null, now)).toBe("");
  });
  it("PAY_STEPS carries the house's plain words for earning states, in order", () => {
    expect(PAY_STEPS.map((s) => s.state)).toEqual(["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"]);
    expect(PAY_STEPS.find((s) => s.state === "APPROVED_FOR_PAYOUT")?.label).toBe("Approved for payout");
    expect(PAY_STEPS.filter((s) => s.off).map((s) => s.state)).toEqual(["HELD", "DISPUTED"]);
  });
});
