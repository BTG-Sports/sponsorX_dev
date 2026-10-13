import { describe, expect, it } from "vitest";

import {
  PACING_BOX, SAMPLE_FORECAST_DETAILS, SAMPLE_FORECAST_LIST, alertLeadDays, alertWords, compareRisk, daysLeft, daysLeftWords, fmtCount, forecastTab,
  linearExpected, nearestStop, niceCeil, paceRatio, paceWords, pacingBar, pacingGeometry, projectedShare, sampleForecastDetail, sampleForecastList,
  sampleHref, tabCount, type ForecastDetail, type ForecastRow,
} from "@/lib/forecast-live";

/* 3S4-FE-01 — the forecast dashboard's pure logic: tabs, risk order, pacing words, the mini bar, the chart geometry and the sample. */

const row = (o: Partial<ForecastRow> & { campaignId: string }): ForecastRow => ({
  campaignName: "Fc test",
  sponsorName: "Fc sponsor",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-10-31T00:00:00.000Z",
  elapsed: 0.5,
  guarantee: { metric: "impressions", value: 100_000 },
  delivered: 40_000,
  deliveredSource: "VERIFIED_API",
  projectedFinal: { low: 70_000, mid: 80_000, high: 90_000 },
  probabilityOfGuarantee: 0.2,
  risk: "at_risk",
  stamp: { modelVersion: "fc-test@1", confidence: 0.7, computedAt: "2026-10-16T00:00:00.000Z" },
  ...o,
});

describe("tabs", () => {
  it("falls back to all for an unknown tab", () => {
    expect(forecastTab("nope").key).toBe("all");
    expect(forecastTab(["watch", "at_risk"]).key).toBe("watch");
  });
  it("counts the all tab from active", () => {
    const c = { active: 9, at_risk: 2, watch: 3, on_track: 4 };
    expect(tabCount(c, "all")).toBe(9);
    expect(tabCount(c, "watch")).toBe(3);
  });
});

describe("risk order", () => {
  it("puts at risk first, then lowest probability, then soonest end", () => {
    const rows = [
      row({ campaignId: "fct-a", risk: "on_track", probabilityOfGuarantee: 0.9 }),
      row({ campaignId: "fct-b", risk: "at_risk", probabilityOfGuarantee: 0.4 }),
      row({ campaignId: "fct-c", risk: "watch", probabilityOfGuarantee: 0.6 }),
      row({ campaignId: "fct-d", risk: "at_risk", probabilityOfGuarantee: 0.1 }),
      row({ campaignId: "fct-e", risk: "at_risk", probabilityOfGuarantee: 0.1, endsAt: "2026-10-20T00:00:00.000Z" }),
    ];
    expect(rows.sort(compareRisk).map((r) => r.campaignId)).toEqual(["fct-e", "fct-d", "fct-b", "fct-c", "fct-a"]);
  });
});

describe("pacing", () => {
  it("expects the straight-line share of the guarantee", () => {
    expect(linearExpected(row({ campaignId: "fct-p1" }))).toBe(50_000);
    expect(linearExpected(row({ campaignId: "fct-p2", elapsed: 1.4 }))).toBe(100_000);
  });
  it("says ahead, near or behind", () => {
    expect(paceRatio(row({ campaignId: "fct-p3" }))).toBeCloseTo(0.8);
    expect(paceWords(row({ campaignId: "fct-p4" }))).toBe("Behind pace · 80%");
    expect(paceWords(row({ campaignId: "fct-p5", delivered: 47_000 }))).toBe("Near pace · 94%");
    expect(paceWords(row({ campaignId: "fct-p6", delivered: 60_000 }))).toBe("Ahead of pace · 120%");
    expect(paceWords(row({ campaignId: "fct-p7", elapsed: 0 }))).toBe("Not started");
    expect(paceRatio(row({ campaignId: "fct-p8", elapsed: 0 }))).toBeNull();
  });
  it("draws the mini bar on the guarantee's scale, capped at 100", () => {
    expect(pacingBar(row({ campaignId: "fct-b1" }))).toEqual({ delivered: 40, expected: 50, projected: 80, over: false });
    const over = pacingBar(row({ campaignId: "fct-b2", projectedFinal: { low: 100_000, mid: 130_000, high: 150_000 } }));
    expect(over.projected).toBe(100);
    expect(over.over).toBe(true);
  });
  it("shares the projection against the guarantee", () => {
    expect(projectedShare(row({ campaignId: "fct-s1" }))).toBeCloseTo(0.8);
    expect(projectedShare(row({ campaignId: "fct-s2", guarantee: { metric: "impressions", value: 0 } }))).toBe(0);
  });
});

describe("days and alerts", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  it("counts whole days left, never negative", () => {
    expect(daysLeft("2026-10-31T00:00:00.000Z", now)).toBe(2);
    expect(daysLeft("2026-10-01T00:00:00.000Z", now)).toBe(0);
    expect(daysLeftWords("2026-10-30T00:00:00.000Z", now)).toBe("1 day left");
    expect(daysLeftWords("2026-10-20T00:00:00.000Z", now)).toBe("Ends today");
  });
  it("says how long before the end the alert fired", () => {
    const alert = { raisedAt: "2026-10-07T00:00:00.000Z", risk: "at_risk" as const, threshold: 0.5 };
    expect(alertLeadDays(alert, "2026-10-31T00:00:00.000Z")).toBe(24);
    expect(alertWords(alert, "2026-10-31T00:00:00.000Z")).toBe(
      "At risk alert raised Oct 7, 24 days before the campaign ends: the probability of the guarantee fell below 50%.",
    );
    expect(alertWords(alert, "2026-10-07T00:00:00.000Z")).toContain("on or after the end date");
  });
});

describe("words", () => {
  it("compacts counts the same on server and browser", () => {
    expect(fmtCount(1234)).toBe("1,234");
    expect(fmtCount(12_900)).toBe("12.9K");
    expect(fmtCount(500_000)).toBe("500K");
    expect(fmtCount(1_250_000)).toBe("1.3M");
    expect(fmtCount(-2_000)).toBe("−2,000");
  });
  it("carries the sample preview through links", () => {
    expect(sampleHref("/x", false)).toBe("/x");
    expect(sampleHref("/x", true)).toBe("/x?demo=sample");
    expect(sampleHref("/x?tab=watch", true)).toBe("/x?tab=watch&demo=sample");
  });
});

describe("chart geometry", () => {
  const d: Pick<ForecastDetail, "startsAt" | "endsAt" | "guarantee" | "pacing" | "projection"> = {
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-10-05T00:00:00.000Z",
    guarantee: { metric: "impressions", value: 1000 },
    pacing: [
      { date: "2026-10-01T00:00:00.000Z", delivered: 0, expected: 0 },
      { date: "2026-10-02T00:00:00.000Z", delivered: 200, expected: 250 },
      { date: "2026-10-03T00:00:00.000Z", delivered: 400, expected: 500 },
    ],
    projection: [
      { date: "2026-10-03T00:00:00.000Z", low: 400, mid: 400, high: 400 },
      { date: "2026-10-05T00:00:00.000Z", low: 700, mid: 800, high: 1100 },
    ],
  };
  const g = pacingGeometry(d);
  const { pad, w, h } = PACING_BOX;

  it("rounds the scale up to a clean number above the highest value", () => {
    expect(niceCeil(1155)).toBe(2000);
    expect(niceCeil(230)).toBe(250);
    expect(niceCeil(0)).toBe(1);
    expect(g.yMax).toBe(2000);
    expect(g.yTicks.map((t) => t.value)).toEqual([0, 500, 1000, 1500, 2000]);
  });
  it("spans the start to the end date and puts the guarantee on the same scale", () => {
    expect(g.xTicks[0]!.x).toBe(pad.left);
    expect(g.xTicks[4]!.x).toBe(w - pad.right);
    const plotH = h - pad.top - pad.bottom;
    expect(g.guaranteeY).toBeCloseTo(pad.top + plotH / 2, 0);
    expect(g.end!.x).toBe(w - pad.right);
  });
  it("marks the forecast day at the last pacing point", () => {
    expect(g.todayX).toBe(pad.left + (w - pad.left - pad.right) / 2);
  });
  it("merges a shared day into one hover stop", () => {
    expect(g.stops).toHaveLength(4);
    expect(g.stops[2]).toMatchObject({ delivered: 400, expected: 500, mid: 400 });
    expect(nearestStop(g.stops, g.stops[3]!.x - 1)).toBe(3);
    expect(nearestStop(g.stops, 0)).toBe(0);
  });
  it("draws closed shapes for the band and the delivered area", () => {
    expect(g.band.endsWith("Z")).toBe(true);
    expect(g.deliveredArea.endsWith("Z")).toBe(true);
    expect(g.delivered.startsWith("M")).toBe(true);
  });
  it("draws nothing for an empty series", () => {
    const empty = pacingGeometry({ ...d, pacing: [], projection: [] });
    expect(empty.delivered).toBe("");
    expect(empty.band).toBe("");
    expect(empty.todayX).toBeNull();
    expect(empty.end).toBeNull();
  });
});

describe("sample", () => {
  it("counts its own rows and orders them by risk", () => {
    const c = SAMPLE_FORECAST_LIST.counts;
    expect(c.active).toBe(SAMPLE_FORECAST_DETAILS.length);
    expect(c.at_risk + c.watch + c.on_track).toBe(c.active);
    expect(SAMPLE_FORECAST_LIST.campaigns[0]!.risk).toBe("at_risk");
  });
  it("filters a tab and finds a detail", () => {
    expect(sampleForecastList("on_track").campaigns.every((r) => r.risk === "on_track")).toBe(true);
    expect(sampleForecastList("all").page.total).toBe(SAMPLE_FORECAST_DETAILS.length);
    expect(sampleForecastDetail("sample-fc-river")?.campaignName).toBe("Riverside Fall Kickoff");
    expect(sampleForecastDetail("fct-missing")).toBeNull();
  });
  it("raises alerts before the end and only on campaigns at risk or on watch", () => {
    for (const d of SAMPLE_FORECAST_DETAILS) {
      if (d.risk === "on_track") expect(d.alert).toBeNull();
      else expect(alertLeadDays(d.alert!, d.endsAt)).toBeGreaterThan(0);
      expect(d.projection[0]!.date).toBe(d.pacing[d.pacing.length - 1]!.date);
      expect(d.history[0]!.forecastAt).toBe(d.stamp.computedAt);
    }
  });
});
