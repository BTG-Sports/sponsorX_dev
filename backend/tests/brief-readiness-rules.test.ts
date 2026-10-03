import { describe, expect, it } from "vitest";

import {
  briefReadiness,
  isReady,
  lowestJobFloor,
  MIN_CAMPAIGN_DAYS,
  OBJECTIVE_MIN_WORDS,
  sponsorStanding,
  type ReadinessInput,
} from "../src/domain/brief-readiness-rules";
import { NIL_JOBS } from "../src/domain/nil-jobs";

/* --------------------------------------------------------------------------
   P4-BE-07 — the brief readiness checklist, pure: each check passing and
   failing, the price floor with and without a package, the conflict count
   as information only, and "ready" meaning DRAFT with checks 1–5 passing.
   -------------------------------------------------------------------------- */

const now = new Date("2026-10-03T12:00:00Z");
const good: ReadinessInput = {
  objective: "Drive foot traffic to our new Bethesda store during back to school",
  startDate: new Date("2026-10-20T00:00:00Z"),
  endDate: new Date("2026-11-17T00:00:00Z"),
  budget: 250_000,
  package: null,
  lowestJobFloor: lowestJobFloor(NIL_JOBS),
  sponsor: { ok: true },
  eligibleCount: 12,
  conflictCount: 3,
  now,
};
const check = (i: Partial<ReadinessInput>, key: string) => briefReadiness({ ...good, ...i }).find((c) => c.key === key)!;

describe("P4-BE-07 · briefReadiness", () => {
  it("1. objective written — at least eight words", () => {
    expect(OBJECTIVE_MIN_WORDS).toBe(8);
    expect(check({}, "objective")).toEqual({ key: "objective", ok: true, text: "Objective written (12 words)" });
    expect(check({ objective: "More sales this fall please" }, "objective")).toEqual({
      key: "objective", ok: false, text: "Objective is too short — 5 words, at least 8 needed",
    });
    expect(check({ objective: "   " }, "objective")).toMatchObject({ ok: false, text: "No objective written" });
  });

  it("2. dates — future start, end after start, at least a week", () => {
    expect(MIN_CAMPAIGN_DAYS).toBe(7);
    expect(check({}, "dates")).toEqual({ key: "dates", ok: true, text: "Runs Oct 20, 2026 – Nov 17, 2026 (28 days)" });
    expect(check({ startDate: new Date("2026-10-01T00:00:00Z") }, "dates")).toMatchObject({
      ok: false, text: "Dates: the start date (Oct 1, 2026) isn't in the future",
    });
    expect(check({ endDate: new Date("2026-10-19T00:00:00Z") }, "dates")).toMatchObject({
      ok: false, text: "Dates: the end date isn't after the start date",
    });
    expect(check({ endDate: new Date("2026-10-25T00:00:00Z") }, "dates")).toMatchObject({
      ok: false, text: "Dates: it runs 5 days — at least 7 are needed",
    });
    expect(check({ endDate: new Date("2026-10-27T00:00:00Z") }, "dates").ok).toBe(true);
  });

  it("3. the price floor WITHOUT a package is the lowest NIL job sell floor ($70, SX-01 at Emerging)", () => {
    expect(lowestJobFloor(NIL_JOBS)).toEqual({ dollars: 70, jobId: "SX-01", jobName: "Story Drop", tier: "EMERGING" });
    expect(check({ budget: 7_000 }, "budget")).toEqual({
      key: "budget", ok: true, text: "Budget $70 is at or above the lowest NIL job sell floor ($70 — SX-01 Story Drop, emerging)",
    });
    expect(check({ budget: 6_999 }, "budget")).toMatchObject({ ok: false, text: expect.stringMatching(/^Budget \$69\.99 is below the lowest NIL job sell floor/) });
    expect(check({ lowestJobFloor: null }, "budget")).toMatchObject({ ok: false, text: "No NIL job prices to check the budget against" });
  });

  it("3. the price floor WITH a package is the package price (its lowest, in whole dollars against a cents budget)", () => {
    const pkg = { name: "Local Blitz", priceLow: 1_500 };
    expect(check({ package: pkg, budget: 150_000 }, "budget")).toEqual({
      key: "budget", ok: true, text: "Budget $1,500 covers the Local Blitz price ($1,500)",
    });
    /* Above the NIL floor but below the package: the package is the floor. */
    expect(check({ package: pkg, budget: 149_999 }, "budget")).toEqual({
      key: "budget", ok: false, text: "Budget $1,499.99 is below the Local Blitz price ($1,500)",
    });
  });

  it("4. the sponsor approved and in good standing", () => {
    expect(check({}, "sponsor")).toEqual({ key: "sponsor", ok: true, text: "Sponsor approved and in good standing" });
    expect(check({ sponsor: { ok: false, reason: "Sponsor's account is closed" } }, "sponsor")).toEqual({
      key: "sponsor", ok: false, text: "Sponsor's account is closed",
    });
  });

  it("5. eligible athletes exist after conflicts — the count shown", () => {
    expect(check({}, "eligible")).toEqual({ key: "eligible", ok: true, count: 12, text: "12 athletes eligible after conflicts" });
    expect(check({ eligibleCount: 1 }, "eligible").text).toBe("1 athlete eligible after conflicts");
    expect(check({ eligibleCount: 0 }, "eligible")).toEqual({ key: "eligible", ok: false, count: 0, text: "No athletes eligible after conflicts" });
  });

  it("6. category conflicts are counted — information, never a failure", () => {
    expect(check({}, "conflicts")).toEqual({
      key: "conflicts", ok: true, count: 3, text: "3 otherwise-eligible athletes excluded — they refused a category on this brief",
    });
    expect(check({ conflictCount: 0 }, "conflicts")).toEqual({ key: "conflicts", ok: true, count: 0, text: "No category conflicts" });
  });

  it("ready for review: a DRAFT brief with checks 1–5 passing; any failure or any other state is not", () => {
    expect(isReady("DRAFT", briefReadiness(good))).toBe(true);
    expect(isReady("QUALIFIED", briefReadiness(good))).toBe(false);
    expect(isReady("DRAFT", briefReadiness({ ...good, eligibleCount: 0 }))).toBe(false);
    expect(isReady("DRAFT", briefReadiness({ ...good, budget: 1 }))).toBe(false);
    /* Conflicts never block. */
    expect(isReady("DRAFT", briefReadiness({ ...good, conflictCount: 40 }))).toBe(true);
  });
});

describe("P4-BE-07 · sponsorStanding", () => {
  it("a sponsor BTG opened itself (no request) is approved; a rejected or closed one is not", () => {
    expect(sponsorStanding({ latestRequestState: null, closed: false })).toEqual({ ok: true });
    expect(sponsorStanding({ latestRequestState: "APPROVED", closed: false })).toEqual({ ok: true });
    expect(sponsorStanding({ latestRequestState: "REJECTED", closed: false })).toEqual({ ok: false, reason: "Sponsor's account was rejected by BTG" });
    expect(sponsorStanding({ latestRequestState: "APPROVED", closed: true })).toEqual({ ok: false, reason: "Sponsor's account is closed" });
  });
});
