/* POL-FE-105 — the admin dashboard's pure pieces (lib/ops-dash.ts). */
import { describe, expect, it } from "vitest";

import { activityPoints, athleteSplit, change, deliverySummary, dollars, niceMax, parsePeriod, periodWords, todoRows } from "@/lib/ops-dash";
import { queueCards } from "@/lib/ops-board-live";

describe("POL-FE-105 · the admin dashboard", () => {
  it("the period is 7, 30 or 90 days; anything else is 30", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod(["90", "7"])).toBe(90);
    expect(parsePeriod("14")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod("abc")).toBe(30);
  });

  it("says the period in words", () => {
    expect(periodWords(30, "2026-10-18T09:00:00.000Z", "2026-11-17T09:00:00.000Z")).toBe("Last 30 days (Oct 18 – Nov 17)");
  });

  it("a change has no percent when the previous window was empty", () => {
    expect(change(12, 8)).toBeCloseTo(0.5);
    expect(change(4, 8)).toBeCloseTo(-0.5);
    expect(change(0, 0)).toBe(0);
    expect(change(5, 0)).toBeNull();
  });

  it("up to 31 days is day by day; longer is grouped into weeks, newest week whole", () => {
    const series = (n: number) => Array.from({ length: n }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, CLAIM: 1, REDEEM: i % 2 }));
    const daily = activityPoints(series(31));
    expect(daily.bucket).toBe("day");
    expect(daily.points).toHaveLength(31);
    expect(daily.points[1]).toEqual({ day: "2026-08-02", claims: 1, redeems: 1 });

    const long = Array.from({ length: 91 }, (_, i) => ({ day: `d${i}`, CLAIM: 1, REDEEM: 0 }));
    const weekly = activityPoints(long);
    expect(weekly.bucket).toBe("week");
    expect(weekly.points).toHaveLength(13);
    expect(weekly.points.at(-1)).toEqual({ day: "d84", claims: 7, redeems: 0 });
    /* nothing lost in the grouping */
    expect(weekly.points.reduce((n, p) => n + p.claims, 0)).toBe(91);
  });

  it("the chart's axis top splits into four whole-number steps that reach the peak", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(9)).toBe(12);
    expect(niceMax(38)).toBe(40);
    expect(niceMax(41)).toBe(80);
    expect(niceMax(1234)).toBe(2000);
    for (const m of [1, 7, 13, 99, 250, 5001]) {
      const top = niceMax(m);
      expect(top).toBeGreaterThanOrEqual(m);
      expect(Number.isInteger(top / 4)).toBe(true);
    }
  });

  it("delivery adds up done, due and overdue, and counts the campaigns behind", () => {
    const s = deliverySummary([
      { campaignId: "a", campaignName: "A", endDate: "2026-11-30T00:00:00Z", deliverablesTotal: 10, deliverablesVerified: 4, deliverablesOverdue: 0 },
      { campaignId: "b", campaignName: "B", endDate: "2026-11-30T00:00:00Z", deliverablesTotal: 6, deliverablesVerified: 2, deliverablesOverdue: 3 },
    ]);
    expect(s).toMatchObject({ campaigns: 2, due: 16, done: 6, overdue: 3, behind: 1 });
    expect(s.share).toBeCloseTo(6 / 16);
    expect(deliverySummary([]).share).toBeNull();
  });

  it("active athletes split into three parts that add up", () => {
    const n = { totalEarnings: 0, totalPaid: 0 };
    expect(athleteSplit({ ...n, activeAthletes: 40, participatingAthletes: 25, participationRate: 0.625, utilisationRate: 0.25 })).toEqual({
      active: 40, working: 10, bookedBefore: 15, notBooked: 15,
    });
    /* a rounded rate never pushes "working" past the athletes booked */
    expect(athleteSplit({ ...n, activeAthletes: 3, participatingAthletes: 1, participationRate: 0.3333, utilisationRate: 0.6667 })).toEqual({
      active: 3, working: 1, bookedBefore: 0, notBooked: 2,
    });
    expect(athleteSplit({ ...n, activeAthletes: 0, participatingAthletes: 0, participationRate: 0, utilisationRate: 0 })).toEqual({
      active: 0, working: 0, bookedBefore: 0, notBooked: 0,
    });
  });

  it("the to-do list is only the queues with something waiting, in the cards' order", () => {
    const cards = queueCards({
      applications: { waiting: 0, over48h: 0 }, approvals: { waiting: 3 },
      briefs: { toQualify: 0, toMatch: 0 }, finance: { held: 1, disputed: 0 },
    });
    expect(todoRows(cards).map((c) => c.key)).toEqual(["approvals", "finance"]);
  });

  it("money from cents, short past a million", () => {
    expect(dollars(1_245_000)).toBe("$12,450");
    expect(dollars(0)).toBe("$0");
    expect(dollars(123_400_000)).toBe("$1.2M");
    expect(dollars(200_000_000)).toBe("$2M");
  });
});
