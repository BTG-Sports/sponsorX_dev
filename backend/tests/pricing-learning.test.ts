/**
 * P7-DATA-03 — implied CPM — and P7-DATA-04 — delivered vs planned.
 *
 * Both rules are pure functions on purpose, so the arithmetic that decides
 * what our inventory is worth and whether a campaign is in trouble can be
 * checked without a database.
 */
import { describe, expect, it, vi } from "vitest";

/* `delivery-health` pulls in the Prisma client for its query; `assessDelivery`
   is pure and needs neither a database nor its config. */
vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/db/client", () => ({ prisma: {} }));

import {
  FOLLOWER_TO_IMPRESSION_RATE, impliedCpm, projectImpressions, projectLine,
} from "../src/domain/pricing-learning";

const { assessDelivery, REACH_SHORTFALL_THRESHOLD } =
  await import("../src/domain/delivery-health");

const social = (over: Partial<{ followers: number | null; avgViews: number | null; source: string }> = {}) =>
  ({ followers: null, avgViews: null, source: "SELF_REPORTED", ...over }) as never;

describe("P7-DATA-03 · projecting reach", () => {
  it("prefers average views — what people actually saw", () => {
    const p = projectImpressions([social({ followers: 100000, avgViews: 8000 })])!;
    expect(p.impressions).toBe(8000);
    expect(p.basis).toBe("avgViews");
  });

  /* Treating every follower as an impression overstates reach by an order of
     magnitude on most platforms. */
  it("discounts followers when that is all there is", () => {
    const p = projectImpressions([social({ followers: 100000 })])!;
    expect(p.impressions).toBe(100000 * FOLLOWER_TO_IMPRESSION_RATE);
    expect(p.basis).toBe("followers");
  });

  /* Posting one deliverable to two platforms does not reach the combined
     audience — summing is how a projection becomes fiction. */
  it("takes the strongest single account, never the sum", () => {
    const p = projectImpressions([
      social({ avgViews: 8000 }),
      social({ avgViews: 3000 }),
    ])!;
    expect(p.impressions).toBe(8000);
    expect(p.impressions).not.toBe(11000);
  });

  it("carries the provenance of the account it used", () => {
    const p = projectImpressions([
      social({ avgViews: 100, source: "SELF_REPORTED" }),
      social({ avgViews: 9000, source: "VERIFIED_API" }),
    ])!;
    expect(p.source).toBe("VERIFIED_API");
  });

  /* A null says "we do not know". A zero would claim the line reaches
     nobody, and would turn the CPM into a division by zero. */
  it("returns null rather than zero when there is nothing to go on", () => {
    expect(projectImpressions([])).toBeNull();
    expect(projectImpressions([social()])).toBeNull();
    expect(projectImpressions([social({ followers: 0, avgViews: 0 })])).toBeNull();
  });
});

describe("P7-DATA-03 · the implied CPM", () => {
  it("is cost per thousand, in cents", () => {
    /* $300 for 60,000 impressions = $5 per thousand = 500 cents. */
    expect(impliedCpm(30000, 60000)).toBe(500);
  });

  it("rounds to the cent", () => {
    expect(Number.isInteger(impliedCpm(12345, 7777)!)).toBe(true);
  });

  it("is null where there is no projection", () => {
    expect(impliedCpm(30000, null)).toBeNull();
    expect(impliedCpm(30000, 0)).toBeNull();
  });

  /* THE CLAUSE: "fixed-price jobs still compute it for learning". There is
     no branch that skips a line because its price came from a rate card —
     every line with a projection gets a CPM. */
  it("computes for a fixed-price line exactly as for any other", () => {
    const out = projectLine(30000, [social({ avgViews: 60000 })]);
    expect(out).toEqual({
      projectedImpressions: 60000,
      impliedCpm: 500,
      projectionSource: "SELF_REPORTED",
    });
  });

  it("stores three nulls together when the athlete has no audience figure", () => {
    expect(projectLine(30000, [])).toEqual({
      projectedImpressions: null,
      impliedCpm: null,
      projectionSource: null,
    });
  });

  it("never returns a CPM without the source that justifies it", () => {
    const out = projectLine(30000, [social({ avgViews: 60000 })]);
    expect(out.impliedCpm === null).toBe(out.projectionSource === null);
  });
});

describe("P7-DATA-04 · under-delivery", () => {
  const base = {
    deliverablesTotal: 4, deliverablesVerified: 4, deliverablesOverdue: 0,
    projectedImpressions: 100000, verifiedImpressions: 100000,
  };

  it("is quiet when everything is on track", () => {
    expect(assessDelivery(base)).toEqual({
      underDeliveringWork: false, underDeliveringReach: false,
    });
  });

  /* Unambiguous and actionable: someone chases the athlete. */
  it("flags overdue work", () => {
    expect(assessDelivery({ ...base, deliverablesOverdue: 1 }).underDeliveringWork).toBe(true);
  });

  it("flags reach below the threshold", () => {
    const short = Math.floor(100000 * REACH_SHORTFALL_THRESHOLD) - 1;
    expect(assessDelivery({ ...base, verifiedImpressions: short }).underDeliveringReach).toBe(true);
  });

  /* A dashboard that fires at 99% is ignored within a week. */
  it("does not flag a campaign that merely lands slightly under", () => {
    expect(assessDelivery({ ...base, verifiedImpressions: 95000 }).underDeliveringReach).toBe(false);
  });

  /* No projection means no promise to fall short of. */
  it("says nothing about reach when nothing was projected", () => {
    expect(
      assessDelivery({ ...base, projectedImpressions: null, verifiedImpressions: 0 })
        .underDeliveringReach,
    ).toBe(false);
  });

  it("keeps the two kinds of shortfall separate — they need different calls", () => {
    const out = assessDelivery({
      ...base, deliverablesOverdue: 2, verifiedImpressions: 100000,
    });
    expect(out.underDeliveringWork).toBe(true);
    expect(out.underDeliveringReach).toBe(false);
  });
});
