import { describe, expect, it } from "vitest";

import {
  elapsedShare,
  isBehind,
  monogramOf,
  portfolioTotals,
  toPortfolioRow,
  windowLabel,
  type ApiCampaign,
} from "../src/lib/sponsor-live";

/* --------------------------------------------------------------------------
   P4-FE-05 — the sponsor dashboard's live arithmetic. The rules that matter:
   views are never invented on a live row; a withheld money column is null,
   never summed as zero; pacing only flags an ACTIVE campaign that actually
   has something to deliver.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-31T00:00:00Z");

function c(over: Partial<ApiCampaign> = {}): ApiCampaign {
  return {
    id: "cmp_1", name: "Fall Showroom Push", state: "ACTIVE",
    startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-11-30T00:00:00.000Z",
    sponsorName: "Bowie Auto Group", package: { code: "LOCAL_BLITZ", name: "Local Blitz" },
    athletes: 3, deliverables: { done: 1, total: 4 },
    budget: 500_000, contracted: 240_000, invoiced: 120_000, paid: 60_000,
    ...over,
  };
}

describe("pacing", () => {
  it("measures elapsed time across the window", () => {
    expect(elapsedShare("2026-10-01T00:00:00Z", "2026-11-30T00:00:00Z", NOW)).toBeCloseTo(0.5, 1);
  });
  it("flags an active campaign well behind the calendar", () => {
    expect(isBehind(c(), NOW)).toBe(true); // 25% done at ~50% elapsed
    expect(isBehind(c({ deliverables: { done: 2, total: 4 } }), NOW)).toBe(false);
  });
  it("never flags a campaign with nothing to deliver, or one not ACTIVE", () => {
    expect(isBehind(c({ deliverables: { done: 0, total: 0 } }), NOW)).toBe(false);
    expect(isBehind(c({ state: "STAFFING" }), NOW)).toBe(false);
  });
});

describe("windowLabel", () => {
  it("reads before, during and after", () => {
    expect(windowLabel(c({ startDate: "2026-11-03T00:00:00Z" }), NOW)).toBe("starts in 3 days");
    expect(windowLabel(c(), NOW)).toBe("ends in 30 days");
    expect(windowLabel(c({ endDate: "2026-10-20T00:00:00Z" }), NOW)).toBe("ended Oct 20");
  });
});

describe("toPortfolioRow", () => {
  it("invents no views and carries contracted as spend", () => {
    const r = toPortfolioRow(c(), NOW);
    expect(r.views).toBeNull();
    expect(r.spend).toBe(240_000);
    expect(r.pkg).toBe("Local Blitz");
    expect(r.monogram).toBe("FS");
  });
  it("a withheld money column stays null", () => {
    expect(toPortfolioRow(c({ contracted: undefined }), NOW).spend).toBeNull();
  });
});

describe("portfolioTotals", () => {
  it("sums what the API answered", () => {
    const t = portfolioTotals([c(), c({ id: "cmp_2", state: "COMPLETED", athletes: 2 })]);
    expect(t).toMatchObject({ campaigns: 2, active: 1, athletes: 5, contracted: 480_000, invoiced: 240_000, paid: 120_000 });
  });
  it("won't sum a column any row withheld", () => {
    const t = portfolioTotals([c(), c({ id: "cmp_2", invoiced: undefined })]);
    expect(t.invoiced).toBeNull();
    expect(t.contracted).toBe(480_000);
  });
});

describe("monogramOf", () => {
  it("takes two initials, ignoring punctuation", () => {
    expect(monogramOf("Bowie Auto Group — Fall")).toBe("BA");
    expect(monogramOf("")).toBe("?");
  });
});
