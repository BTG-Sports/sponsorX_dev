/**
 * P7-BE-05 — "Objective, roster, delivered assets, verified/estimated
 * metrics, QR funnel, redemption, media value and recommendations all
 * assembled with labels intact."
 *
 * Two things are worth testing here and one of them is unusual: that the
 * report contains what it should, and that it contains NOTHING ELSE. A
 * report is the artefact a renewal is argued over, so a plausible-looking
 * number with no row behind it is the failure mode — demographics, sentiment,
 * industry benchmarks. The assembler must not have invented any.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

/* The module pulls in the Prisma client for `assembleSponsorReport`; the pure
   functions under test here need neither a database nor its config. */
vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/db/client", () => ({ prisma: {} }));

const {
  mediaValueFor, observationsFor,
} = await import("../src/domain/sponsor-report");
type SponsorReport = Awaited<
  ReturnType<typeof import("../src/domain/sponsor-report").assembleSponsorReport>
>;
import { emptyTotals } from "../src/domain/metric-source";

const base = (over: Partial<Omit<SponsorReport, "observations">> = {}) => ({
  campaign: {
    id: "cmp_1", name: "Autumn", state: "ACTIVE",
    startDate: new Date("2026-09-01"), endDate: new Date("2026-10-01"), budget: 500000,
  },
  objective: "Drive foot traffic",
  roster: [],
  deliveredAssets: [],
  performance: {
    views: emptyTotals(), engagements: emptyTotals(),
    verifiedViews: 0, verifiedEngagements: 0,
  },
  funnel: { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 },
  redemption: { issued: 0, redeemed: 0, rate: 0 },
  mediaValue: { amount: 0, basis: "", source: "ESTIMATED" as const },
  ...over,
});

describe("media value is computed only from verified impressions", () => {
  it("is a CPM against verified impressions", () => {
    const mv = mediaValueFor({ spend: 500000, verifiedViews: 250000 });
    /* 500000 cents over 250000 impressions = 2000 cents per thousand. */
    expect(mv.amount).toBe(2000);
    expect(mv.source).toBe("ESTIMATED");
  });

  /* THE CLAUSE THAT PROTECTS THE NUMBER. Self-reported reach is usually the
     biggest figure available, and quietly including it would inflate the
     most-quoted box on the page. */
  it("excludes self-reported and estimated reach, and says so", () => {
    const mv = mediaValueFor({ spend: 500000, verifiedViews: 250000 });
    expect(mv.basis).toMatch(/VERIFIED/);
    expect(mv.basis).toMatch(/excluded/i);
  });

  it("claims nothing when nothing was verified", () => {
    const mv = mediaValueFor({ spend: 500000, verifiedViews: 0 });
    expect(mv.amount).toBe(0);
    expect(mv.basis).toMatch(/No verified impressions/);
  });

  it("always carries a basis — a media value without one is unfalsifiable", () => {
    for (const views of [0, 1, 1000, 250000]) {
      expect(mediaValueFor({ spend: 500000, verifiedViews: views }).basis.length)
        .toBeGreaterThan(20);
    }
  });

  it("is always labelled ESTIMATED — it is arithmetic, not an observation", () => {
    expect(mediaValueFor({ spend: 1, verifiedViews: 1 }).source).toBe("ESTIMATED");
  });
});

describe("observations follow mechanically from the counts", () => {
  it("names unverified deliverables with the actual numbers", () => {
    const out = observationsFor(base({
      roster: [
        { athleteId: "a1", athleteName: "A", jobId: "SX-01", orderState: "ACTIVE",
          deliverablesTotal: 4, deliverablesVerified: 1 },
        { athleteId: "a2", athleteName: "B", jobId: "SX-01", orderState: "ACTIVE",
          deliverablesTotal: 4, deliverablesVerified: 4 },
      ],
    }));
    expect(out.some((o) => o.includes("3 of 8 deliverables"))).toBe(true);
  });

  it("says nothing about verification when everything is verified", () => {
    const out = observationsFor(base({
      roster: [
        { athleteId: "a1", athleteName: "A", jobId: "SX-01", orderState: "ACTIVE",
          deliverablesTotal: 2, deliverablesVerified: 2 },
      ],
    }));
    expect(out.some((o) => o.includes("deliverables are not yet verified"))).toBe(false);
  });

  it("warns when unverified reach outweighs verified", () => {
    const views = { ...emptyTotals(), VERIFIED_API: 100, SELF_REPORTED: 900 };
    const out = observationsFor(base({
      performance: { views, engagements: emptyTotals(), verifiedViews: 100, verifiedEngagements: 0 },
    }));
    expect(out.some((o) => o.includes("self-reported or estimated than verified"))).toBe(true);
  });

  it("flags scans that produced no redemptions", () => {
    const out = observationsFor(base({ funnel: { SCAN: 40, LANDING: 30, CLAIM: 5, REDEEM: 0 } }));
    expect(out.some((o) => o.includes("40 QR scans produced no redemptions"))).toBe(true);
  });

  it("reports a weak redemption rate as a percentage", () => {
    const out = observationsFor(base({
      funnel: { SCAN: 100, LANDING: 80, CLAIM: 10, REDEEM: 2 },
      redemption: { issued: 100, redeemed: 2, rate: 0.02 },
    }));
    expect(out.some((o) => o.includes("2.0%"))).toBe(true);
  });

  it("says nothing at all about an empty campaign", () => {
    expect(observationsFor(base())).toEqual([]);
  });
});

/**
 * The absence test. Every field in the report must trace to a row; these are
 * the plausible-sounding things Phase 1 does not collect, and a report that
 * grew one would be asserting something no data supports.
 */
describe("nothing is invented", () => {
  const source = readFileSync(
    new URL("../src/domain/sponsor-report.ts", import.meta.url),
    "utf8",
  );

  it.each([
    "demographic", "sentiment", "ageRange", "gender",
    "benchmark", "industryAverage", "competitor", "brandLift",
  ])("assembles no %s figure", (field) => {
    /* Allowed in prose explaining WHY it is absent; never as a field name. */
    expect(source).not.toMatch(new RegExp(`${field}\\s*[:?]\\s*(number|string)`, "i"));
    expect(source).not.toMatch(new RegExp(`\\b${field}\\s*:`, "i"));
  });

  it("returns performance as a labelled breakdown, not a number", () => {
    expect(source).toMatch(/performance:\s*MetricBreakdown/);
  });

  it("returns the funnel as four counts, not one", () => {
    expect(source).toMatch(/funnel:\s*Record<RewardEventType, number>/);
  });
});
