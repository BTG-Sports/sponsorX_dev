import { describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   analyticsWindow — P6-FE-03 / P7-FE-04. Every number recomputed from rows.
   Pinned: the window and the previous window are separate; empty days are
   kept in the series; views/engagements never mix provenance; reliability
   counts only deliverables due in the window; the revision rate is per
   deliverable with submitted work; an unscored athlete is null; a role
   without tenant-wide reach is refused.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

const NOW = new Date("2026-10-31T12:00:00Z");

const groupBy = vi.fn(async (args: { by: string[]; where: { at?: { lt?: Date }; type?: string } }) => {
  const by = args.by.join(",");
  if (by === "type" && args.where.at?.lt) return [{ type: "SCAN", _count: { _all: 50 } }, { type: "REDEEM", _count: { _all: 4 } }];
  if (by === "type") return [
    { type: "SCAN", _count: { _all: 100 } }, { type: "LANDING", _count: { _all: 80 } },
    { type: "CLAIM", _count: { _all: 20 } }, { type: "REDEEM", _count: { _all: 10 } },
  ];
  if (by === "city,region") return [
    { city: "Bowie", region: "MD", _count: { _all: 30 } }, { city: "Laurel", region: "MD", _count: { _all: 60 } },
  ];
  if (by === "tokenId,type") return [
    { tokenId: "tk_a", type: "SCAN", _count: { _all: 70 } }, { tokenId: "tk_a", type: "CLAIM", _count: { _all: 15 } },
    { tokenId: "tk_a", type: "REDEEM", _count: { _all: 9 } }, { tokenId: "tk_b", type: "REDEEM", _count: { _all: 1 } },
  ];
  return [];
});

vi.mock("../src/db/client", () => ({
  prisma: {
    rewardEvent: {
      groupBy: (a: never) => groupBy(a),
      findMany: async () => [
        { type: "CLAIM", at: new Date("2026-10-30T10:00:00Z") },
        { type: "REDEEM", at: new Date("2026-10-30T11:00:00Z") },
        { type: "REDEEM", at: new Date("2026-10-31T09:00:00Z") },
      ],
    },
    rewardToken: {
      findMany: async () => [
        { id: "tk_a", athleteId: "a1", reward: { id: "rw_1", offerText: "Free drink", campaign: { sponsor: { name: "Bowie" } } } },
        { id: "tk_b", athleteId: "a2", reward: { id: "rw_2", offerText: "10% off", campaign: { sponsor: { name: "Bowie" } } } },
      ],
    },
    metricDaily: {
      findMany: async () => [
        { source: "VERIFIED_API", views: 1000, engagements: 50, deliverable: { order: { athleteId: "a1" } } },
        { source: "SELF_REPORTED", views: 9999, engagements: 999, deliverable: { order: { athleteId: "a1" } } },
        { source: "ESTIMATED", views: 400, engagements: 10, deliverable: { order: { athleteId: "a2" } } },
      ],
    },
    linkEvent: {
      findMany: async () => [
        { link: { deliverable: { order: { athleteId: "a1" } } } },
        { link: { deliverable: { order: { athleteId: "a1" } } } },
      ],
    },
    deliverable: {
      findMany: async () => [
        /* due in window, published on its due day → on time */
        { id: "d1", dueDate: new Date("2026-10-20T00:00:00Z"), publishedAt: new Date("2026-10-20T20:00:00Z"), order: { athleteId: "a1" }, _count: { assets: 1 } },
        /* due in window, published late */
        { id: "d2", dueDate: new Date("2026-10-21T00:00:00Z"), publishedAt: new Date("2026-10-23T00:00:00Z"), order: { athleteId: "a1" }, _count: { assets: 2 } },
        /* due after the window — not counted for reliability */
        { id: "d3", dueDate: new Date("2026-12-01T00:00:00Z"), publishedAt: null, order: { athleteId: "a1" }, _count: { assets: 0 } },
        { id: "d4", dueDate: new Date("2026-12-01T00:00:00Z"), publishedAt: null, order: { athleteId: "a3" }, _count: { assets: 0 } },
      ],
    },
    auditLog: { findMany: async () => [{ entityId: "d2" }, { entityId: "d2" }] },
    athlete: {
      findMany: async () => [
        { id: "a1", displayName: "JORDAN", sport: "Basketball", school: "Bowie HS", scores: [{ score: 84 }] },
        { id: "a2", displayName: "SAM", sport: "Soccer", school: null, scores: [] },
        { id: "a3", displayName: "ALEX", sport: "Track", school: null, scores: [] },
      ],
    },
  },
}));

const { analyticsWindow } = await import("../src/domain/reward-analytics");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null, sponsorId: null, athleteId: null };
const admin = { ...base, roles: ["BTG_ADMIN"] } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "a1" } as unknown as Actor;

describe("analyticsWindow", async () => {
  const w = await analyticsWindow(admin, 30, NOW);

  it("counts the window and the previous window separately", () => {
    expect(w.funnel).toEqual({ SCAN: 100, LANDING: 80, CLAIM: 20, REDEEM: 10 });
    expect(w.previous).toEqual({ SCAN: 50, LANDING: 0, CLAIM: 0, REDEEM: 4 });
  });

  it("keeps a row for every day, empty ones included", () => {
    expect(w.series).toHaveLength(31);
    expect(w.series.at(-2)).toEqual({ day: "2026-10-30", CLAIM: 1, REDEEM: 1 });
    expect(w.series[0]).toMatchObject({ CLAIM: 0, REDEEM: 0 });
  });

  it("ranks scan locations", () => {
    expect(w.locations).toEqual([{ place: "Laurel, MD", scans: 60 }, { place: "Bowie, MD", scans: 30 }]);
  });

  it("ranks offers by redemptions", () => {
    expect(w.offers.map((o) => [o.offer, o.redeemed, o.claims])).toEqual([["Free drink", 9, 15], ["10% off", 1, 0]]);
  });

  it("never mixes provenance in reach", () => {
    const a1 = w.athletes.find((a) => a.athleteId === "a1")!;
    expect(a1.views).toEqual({ verified: 1000, selfReported: 9999, estimated: 0 });
    expect(a1.engagements.verified).toBe(50);
    expect(a1.clicks).toBe(2);
  });

  it("reliability counts only deliverables due in the window", () => {
    expect(w.athletes.find((a) => a.athleteId === "a1")!.reliability).toEqual({ onTime: 1, due: 2 });
    expect(w.athletes.find((a) => a.athleteId === "a3")!.reliability).toBeNull();
  });

  it("revision rate is per deliverable with submitted work", () => {
    expect(w.athletes.find((a) => a.athleteId === "a1")!.revisionRate).toEqual({ revisions: 2, submitted: 2 });
    expect(w.athletes.find((a) => a.athleteId === "a3")!.revisionRate).toBeNull();
  });

  it("an unscored athlete is null, never zero; the roster includes contracted athletes with no events", () => {
    expect(w.athletes.find((a) => a.athleteId === "a2")!.score).toBeNull();
    expect(w.athletes.map((a) => a.athleteId)).toContain("a3");
    expect(w.athletes[0].athleteId).toBe("a1");
  });

  it("refuses a role without tenant-wide reach", async () => {
    await expect(analyticsWindow(athlete, 30, NOW)).rejects.toThrow();
  });
});
