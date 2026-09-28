import { describe, expect, it } from "vitest";

import {
  factorsOf,
  sendBlockedFor,
  toMatchAthlete,
  toMatchData,
  type ApiBrief,
  type ApiBriefJob,
  type ApiEligibleAthlete,
} from "../src/lib/matching-live";
import { canShortlist, statusFor } from "../src/lib/matching";

/* --------------------------------------------------------------------------
   P4-FE-02 / -03 — the live Studio's arithmetic and honesty, pinned.
   Cost is the athlete's own rate × quantity (cents); sell is the tier's
   catalogue floor (whole dollars, converted once); a missing rate blocks the pick instead of pricing it at zero; an
   unscored athlete is null, never zero; an open invite blocks a re-send.
   -------------------------------------------------------------------------- */

const SX02: ApiBriefJob = {
  jobId: "SX-02", name: "Sponsored Post", quantity: 2,
  /* whole dollars, as the catalogue stores them */
  sellLow: 500, sellHigh: 1_500,
  sellFloors: { EMERGING: 500, CREATOR: 800, PREMIUM: 1_200 },
};

function athlete(over: Partial<ApiEligibleAthlete> = {}): ApiEligibleAthlete {
  return {
    id: "ath_1", displayName: "Shammah", sport: "Basketball", stateCode: "MD", tier: "CREATOR",
    matched: { sport: true, geography: true }, city: "Bowie",
    score: {
      value: 81, method: "rules-v1", scoredAt: "2026-09-02T00:00:00.000Z",
      factors: { factors: [{ factor: "engagement", value: 80 }, { factor: "audience", value: null }] },
    },
    reach: { followers: 12_000, verified: true },
    rates: [{ jobId: "SX-02", amount: 30_000 }],
    ...over,
  };
}

function brief(over: Partial<ApiBrief> = {}): ApiBrief {
  return {
    id: "brf_1", objective: "Fall foot traffic", state: "APPROVED", budget: 500_000,
    startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-11-30T00:00:00.000Z",
    sports: ["Basketball"], stateCodes: ["MD"], categories: ["automotive"],
    createdAt: "2026-09-20T00:00:00.000Z", sponsorName: "Bowie Auto Group",
    package: { code: "LOCAL_BLITZ", name: "Local Blitz", lineItems: [], athleteCountMin: 3, athleteCountMax: 5 },
    campaign: null, jobs: [SX02], invites: [],
    ...over,
  };
}

describe("toMatchAthlete", () => {
  it("prices cost from the rate and sell from the tier floor, per quantity", () => {
    const a = toMatchAthlete(athlete(), [SX02], "LOCAL_BLITZ", null);
    expect(a.cost).toBe(60_000);
    expect(a.sell).toBe(160_000);
    expect(a.lines).toEqual([{ jobId: "SX-02", quantity: 2, offered: 60_000 }]);
    expect(a.jobId).toBe("LOCAL_BLITZ");
  });

  it("an untiered athlete prices at the bottom floor, and reads Untiered", () => {
    const a = toMatchAthlete(athlete({ tier: null }), [SX02], "P", null);
    expect(a.tier).toBe("Untiered");
    expect(a.sell).toBe(100_000);
  });

  it("anchor prices at the premium floor", () => {
    expect(toMatchAthlete(athlete({ tier: "ANCHOR" }), [SX02], "P", null).sell).toBe(240_000);
  });

  it("a missing rate blocks the pick rather than pricing it at zero", () => {
    const a = toMatchAthlete(athlete({ rates: [] }), [SX02], "P", null);
    expect(a.noRate).toBe("SX-02");
    expect(a.lines).toEqual([]);
    expect(canShortlist(a)).toBe(false);
    expect(statusFor(a).label).toBe("No rate on file");
  });

  it("unscored is null, never zero, and all factors are unassessed", () => {
    const a = toMatchAthlete(athlete({ score: null }), [SX02], "P", null);
    expect(a.score).toBeNull();
    expect(a.factors.every((f) => f === null)).toBe(true);
  });

  it("self-reported reach is marked, missing reach is null", () => {
    expect(toMatchAthlete(athlete({ reach: { followers: 5, verified: false } }), [SX02], "P", null).reachSource).toBe("SELF_REPORTED");
    expect(toMatchAthlete(athlete({ reach: undefined }), [SX02], "P", null).reach).toBeNull();
  });

  it("an open invite blocks a re-send; an expired one does not", () => {
    const open = toMatchAthlete(athlete(), [SX02], "P", "INVITED");
    expect(canShortlist(open)).toBe(false);
    expect(statusFor(open).kind).toBe("invited");
    expect(canShortlist(toMatchAthlete(athlete(), [SX02], "P", "EXPIRED"))).toBe(true);
  });
});

describe("factorsOf", () => {
  it("reads the stored breakdown in comparison order, null where unassessed", () => {
    expect(factorsOf({ factors: [{ factor: "engagement", value: 80 }, { factor: "sportBrandFit", value: 70 }] }))
      .toEqual([80, null, null, null, null, 70]);
    expect(factorsOf(null)).toEqual([null, null, null, null, null, null]);
  });
});

describe("toMatchData", () => {
  it("one package job with athleteCountMax slots", () => {
    const d = toMatchData(brief(), [athlete()]);
    expect(d.live).toBe(true);
    expect(d.jobs).toHaveLength(1);
    expect(d.jobs[0]).toMatchObject({ id: "LOCAL_BLITZ", label: "Local Blitz", slots: 5 });
    expect(d.brief.needed).toBe(5);
    expect(d.brief.sponsor).toBe("Bowie Auto Group");
    expect(d.defaultShortlist).toEqual([]);
    expect(d.sendBlocked).toBeNull();
  });

  it("carries the latest invite state per athlete onto the roster", () => {
    const d = toMatchData(
      brief({ invites: [
        { id: "i1", athleteId: "ath_1", jobId: "SX-02", state: "EXPIRED", expiresAt: "x" },
        { id: "i2", athleteId: "ath_1", jobId: "SX-02", state: "INVITED", expiresAt: "y" },
      ] }),
      [athlete()],
    );
    expect(d.roster[0].invite).toBe("INVITED");
  });
});

describe("sendBlockedFor", () => {
  it("blocks an unapproved brief and a brief without priced jobs", () => {
    expect(sendBlockedFor(brief({ state: "QUALIFIED" }))).toMatch(/qualified.*approved/);
    expect(sendBlockedFor(brief({ jobs: [] }))).toMatch(/no package/);
    expect(sendBlockedFor(brief({ state: "CAMPAIGN_CREATED" }))).toBeNull();
  });
});
