import { describe, expect, it } from "vitest";

import { deliveredShare, engagementRate, reachLayers } from "../src/lib/report-live";

/* --------------------------------------------------------------------------
   P7-FE-03 — §22's layers stay apart on the sponsor report. Verified is
   always shown (even at zero, so its absence is visible); the others appear
   only when they hold something; nothing is ever summed across layers.
   -------------------------------------------------------------------------- */

const perf = (over: Partial<Record<"sr" | "est", number>> = {}) => ({
  views: { VERIFIED_API: 7000, VERIFIED_MANUAL: 300, SELF_REPORTED: over.sr ?? 0, ESTIMATED: over.est ?? 0, ATTRIBUTED: 0 },
  engagements: { VERIFIED_API: 400, VERIFIED_MANUAL: 10, SELF_REPORTED: 0, ESTIMATED: 0, ATTRIBUTED: 0 },
  verifiedViews: 7300,
  verifiedEngagements: 410,
});

describe("reachLayers", () => {
  it("shows verified alone when that's all there is", () => {
    expect(reachLayers(perf()).map((l) => [l.key, l.views])).toEqual([["verified", 7300]]);
  });
  it("adds self-reported and estimated as their own layers, never into verified", () => {
    const l = reachLayers(perf({ sr: 9999, est: 500 }));
    expect(l.map((x) => [x.key, x.views])).toEqual([["verified", 7300], ["self", 9999], ["estimated", 500]]);
  });
  it("keeps verified visible at zero", () => {
    expect(reachLayers({ ...perf(), verifiedViews: 0, verifiedEngagements: 0 })[0]).toMatchObject({ key: "verified", views: 0 });
  });
});

describe("engagementRate", () => {
  it("is within one layer, null with no views", () => {
    expect(engagementRate(7300, 410)).toBe(5.6);
    expect(engagementRate(0, 10)).toBeNull();
  });
});

describe("deliveredShare", () => {
  it("sums verified of total across the roster", () => {
    expect(deliveredShare([
      { athleteId: "a", athleteName: "A", jobId: "SX-01", orderState: "ACTIVE", deliverablesTotal: 2, deliverablesVerified: 1 },
      { athleteId: "b", athleteName: "B", jobId: "SX-02", orderState: "ACTIVE", deliverablesTotal: 3, deliverablesVerified: 3 },
    ])).toEqual({ verified: 4, total: 5 });
  });
});
