import { describe, expect, it } from "vitest";

import { delta, toLiveStory, type ApiAnalytics } from "../src/lib/analytics-live";
import { funnelInsight, headlineInsight, locationInsight, offerInsight, athleteInsight } from "../src/lib/analytics-insights";

/* --------------------------------------------------------------------------
   P6-FE-03 / P7-FE-04 — the live analytics story, pinned. Deltas never
   invent a percentage without a previous period; series are cumulative;
   reach uses one provenance per athlete and engagement is computed inside
   it; empty data reads as words, never NaN.
   -------------------------------------------------------------------------- */

function api(over: Partial<ApiAnalytics> = {}): ApiAnalytics {
  return {
    days: 30, from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z",
    funnel: { SCAN: 100, LANDING: 80, CLAIM: 20, REDEEM: 10 },
    previous: { SCAN: 50, LANDING: 0, CLAIM: 0, REDEEM: 12 },
    series: [
      { day: "2026-10-29", CLAIM: 2, REDEEM: 1 },
      { day: "2026-10-30", CLAIM: 3, REDEEM: 0 },
    ],
    locations: [{ place: "Laurel, MD", scans: 60 }, { place: "Bowie, MD", scans: 30 }],
    offers: [
      { rewardId: "r1", offer: "Free drink", sponsor: "Bowie", redeemed: 9, claims: 15 },
      { rewardId: "r2", offer: "Dead offer", sponsor: "Bowie", redeemed: 0, claims: 0 },
    ],
    athletes: [
      {
        athleteId: "a1", name: "JORDAN", sport: "Basketball", school: "Bowie HS",
        scans: 70, claims: 15, redeemed: 9,
        views: { verified: 1000, selfReported: 9999, estimated: 0 },
        engagements: { verified: 50, selfReported: 999, estimated: 0 },
        clicks: 4, reliability: { onTime: 1, due: 2 }, revisionRate: { revisions: 3, submitted: 2 }, score: 84,
      },
      {
        athleteId: "a2", name: "SAM", sport: "Soccer", school: null,
        scans: 0, claims: 0, redeemed: 0,
        views: { verified: 0, selfReported: 200, estimated: 0 },
        engagements: { verified: 0, selfReported: 10, estimated: 0 },
        clicks: 0, reliability: null, revisionRate: null, score: null,
      },
    ],
    ...over,
  };
}

describe("delta", () => {
  it("compares to the previous window, never inventing one", () => {
    expect(delta(100, 50)).toBe("100%");
    expect(delta(10, 12)).toBe("−16.7%");
    expect(delta(20, 0)).toBe("new");
    expect(delta(0, 0)).toBe("0%");
  });
});

describe("toLiveStory", () => {
  const s = toLiveStory(api());
  it("builds the funnel and an honest revenue gap", () => {
    expect(s.dataset.funnel.map((f) => f.value)).toEqual([100, 80, 20, 10]);
    expect(s.dataset.revenue).toBeNull();
    expect(s.dataset.unredeemed).toBe(10);
    expect(s.dataset.deltas).toMatchObject({ scans: "100%", claims: "new", redeemed: "−16.7%" });
  });
  it("makes the series cumulative", () => {
    expect(s.dataset.series.map((p) => [p.a, p.b])).toEqual([[1, 2], [1, 5]]);
  });
  it("turns scans into location shares", () => {
    expect(s.locations).toEqual([{ place: "Laurel, MD", pct: 67 }, { place: "Bowie, MD", pct: 33 }]);
  });
  it("drops offers nobody touched", () => {
    expect(s.dataset.offers).toEqual([{ id: "r1", offer: "Free drink · Bowie", count: 9 }]);
  });
  it("reads one provenance per athlete, engagement inside it", () => {
    const [j, sam] = s.athletes;
    expect(j).toMatchObject({ views: 1000, source: "VERIFIED_MANUAL", engagement: 5, reliability: 50, revisionRate: 1.5, clicks: 4, score: 84 });
    expect(sam).toMatchObject({ views: 200, source: "SELF_REPORTED", engagement: 5, reliability: null, revisionRate: null, score: null });
  });
});

describe("insights on empty data read as words", () => {
  const empty = toLiveStory(api({
    funnel: { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 }, previous: { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 },
    series: [], locations: [], offers: [], athletes: [],
  }));
  it("never prints NaN", () => {
    const all = [
      headlineInsight(empty.dataset), funnelInsight(empty.dataset), locationInsight(empty.locations),
      offerInsight(empty.dataset), athleteInsight(empty.athletes),
    ];
    for (const i of all) expect(`${i.pre}${i.hot}${i.post}`).not.toMatch(/NaN|Infinity|undefined/);
    expect(headlineInsight(empty.dataset).hot).toMatch(/Nothing has been scanned/);
  });
});

describe("F-04 (QA pass 5) · redemptions without a claim never read as a negative gap", () => {
  it("the headline says every claim was used, not '−1 claimed rewards were never used'", () => {
    const s = toLiveStory(api({ funnel: { SCAN: 10, LANDING: 10, CLAIM: 1, REDEEM: 2 } }));
    const i = headlineInsight(s.dataset);
    expect(i.hot).not.toMatch(/-\d|−\d/);
    expect(i.hot).toBe("every claimed reward was used");
    expect(i.post).toMatch(/without a claim/);
    expect(s.dataset.unredeemed).toBe(0);
  });
  it("still counts the gap when claims cover the redemptions", () => {
    const i = headlineInsight(toLiveStory(api()).dataset);
    expect(i.hot).toBe("10 claimed rewards were never used");
  });
});

describe("the headline's trend words (QA pass 5 leftover)", () => {
  const withDelta = (redeemed: string) => ({
    funnel: [{ value: 100 }, { value: 80 }, { value: 40 }, { value: 30 }] as never,
    deltas: { scans: "0%", claims: "0%", redeemed, revenue: "0%" },
  });
  it("a fall reads as down, never 'up −83.3%'", () => {
    expect(headlineInsight(withDelta("−83.3%")).pre).toBe("Redemptions are down 83.3% — but ");
  });
  it("a rise reads as up", () => {
    expect(headlineInsight(withDelta("12.4%")).pre).toBe("Redemptions are up 12.4% — but ");
  });
  it("no change, and no previous period, read as words", () => {
    expect(headlineInsight(withDelta("0%")).pre).toBe("Redemptions are flat — but ");
    expect(headlineInsight(withDelta("new")).pre).toBe("Redemptions are new this period — but ");
  });
});

describe("P6-FE-05 · a funnel step is never a >100% 'conversion'", () => {
  it("a narrowing step is a percentage; a widening one is '+N' with the reason; an empty one is '—'", async () => {
    const { stepConversion } = await import("../src/components/charts");
    expect(stepConversion(100, 80)).toEqual({ text: "80%", hint: null });
    expect(stepConversion(100, 100)).toEqual({ text: "100%", hint: null });
    const up = stepConversion(14, 41);
    expect(up.text).toBe("+27");
    expect(up.hint).toMatch(/more than the step above/i);
    expect(stepConversion(0, 5)).toEqual({ text: "—", hint: null });
  });
});

describe("P6-FE-06 · offers carry the reward id, so two same-named rewards don't share a key", () => {
  it("keys each offer row by its reward", () => {
    const twin = toLiveStory(api({
      offers: [
        { rewardId: "r1", offer: "Free drink", sponsor: "Bowie", redeemed: 2, claims: 3 },
        { rewardId: "r9", offer: "Free drink", sponsor: "Bowie", redeemed: 1, claims: 1 },
      ],
    }));
    expect(twin.dataset.offers.map((o) => o.id)).toEqual(["r1", "r9"]);
  });
});

describe("P6-FE-05 · the funnel insight never names a >100% 'weak step'", () => {
  it("says no step loses fans when every step widens or holds", () => {
    const up = toLiveStory(api({ funnel: { SCAN: 14, LANDING: 14, CLAIM: 14, REDEEM: 41 } }));
    const i = funnelInsight(up.dataset);
    expect(`${i.pre}${i.hot}${i.post}`).not.toMatch(/\d{3,}%/);
    expect(i.hot).toBe("No step loses fans in this range");
  });
});
