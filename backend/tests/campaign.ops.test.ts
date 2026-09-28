import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /campaigns/:id/ops — §9 screen 9 (P5-FE-05).
   Pinned: overdue uses delivery-health's rule (past due and not VERIFIED);
   views are VERIFIED only; an athlete with several lines shows their
   least-settled order; an athlete only invited so far still appears; the
   campaign health is assessDelivery's verdict, not a second opinion.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let campaign: Record<string, unknown> | null = null;
vi.mock("../src/db/client", () => ({
  prisma: { campaign: { findFirst: () => Promise.resolve(campaign) } },
}));

const { campaignOps } = await import("../src/routes/v1/campaigns");

const admin = {
  userId: "u", tenantId: "t", roles: ["BTG_ADMIN"], athleteId: null,
  sponsorId: null, guardianId: null, propertyId: null,
} as unknown as Actor;

const PAST = new Date("2020-01-01T00:00:00Z");
const FUTURE = new Date("2099-01-01T00:00:00Z");
const A = { id: "a1", displayName: "JORDAN", slug: "jordan" };
const B = { id: "a2", displayName: "SAM", slug: "sam" };
const C = { id: "a3", displayName: "ALEX", slug: "alex" };

beforeEach(() => {
  campaign = {
    id: "cmp_1", name: "Fall", state: "ACTIVE",
    startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"),
    sponsor: { name: "Bowie" },
    orders: [
      {
        id: "o1", state: "ACTIVE", jobId: "SX-01", dueDate: FUTURE, projectedImpressions: 10_000, athlete: A,
        deliverables: [
          { state: "VERIFIED", dueDate: PAST, metrics: [{ source: "VERIFIED_API", views: 3000 }, { source: "SELF_REPORTED", views: 9999 }] },
          { state: "BTG_REVIEW", dueDate: PAST, metrics: [] },
        ],
      },
      {
        id: "o2", state: "SENT", jobId: "SX-02", dueDate: FUTURE, projectedImpressions: null, athlete: A,
        deliverables: [],
      },
      {
        id: "o3", state: "ACCEPTED", jobId: "SX-01", dueDate: FUTURE, projectedImpressions: 5_000, athlete: B,
        deliverables: [{ state: "PUBLISHED", dueDate: FUTURE, metrics: [] }, { state: "NOT_STARTED", dueDate: FUTURE, metrics: [] }],
      },
    ],
    invites: [
      { id: "i1", state: "VIEWED", jobId: "SX-01", offered: 30_000, athlete: C },
      { id: "i2", state: "ACCEPTED", jobId: "SX-01", offered: 30_000, athlete: B },
    ],
  };
});

async function call() {
  let body: Record<string, unknown> | undefined;
  await campaignOps({ actor: admin, params: { id: "cmp_1" } } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return body!;
}

describe("GET /campaigns/:id/ops", () => {
  it("folds an athlete's lines into one row showing the least-settled order", async () => {
    const roster = (await call()).roster as Array<Record<string, unknown>>;
    const jordan = roster.find((r) => r.athleteId === "a1")!;
    expect((jordan.order as { state: string }).state).toBe("SENT");
    expect((jordan.order as { jobIds: string[] }).jobIds.sort()).toEqual(["SX-01", "SX-02"]);
  });

  it("counts delivered, planned, overdue and in-review per athlete", async () => {
    const roster = (await call()).roster as Array<Record<string, unknown>>;
    expect(roster.find((r) => r.athleteId === "a1")).toMatchObject({ delivered: 1, planned: 2, overdue: 1, inReview: 1 });
    expect(roster.find((r) => r.athleteId === "a2")).toMatchObject({ delivered: 1, planned: 2, overdue: 0 });
  });

  it("counts VERIFIED views only", async () => {
    const roster = (await call()).roster as Array<Record<string, unknown>>;
    expect(roster.find((r) => r.athleteId === "a1")!.verifiedViews).toBe(3000);
  });

  it("an invited athlete without an order still appears, with the invite state", async () => {
    const roster = (await call()).roster as Array<Record<string, unknown>>;
    expect(roster.find((r) => r.athleteId === "a3")).toMatchObject({
      order: null, invite: { id: "i1", state: "VIEWED", jobId: "SX-01", offered: 30_000 }, planned: 0,
    });
    /* ...and an athlete who has an order isn't overwritten by their invite. */
    expect(roster.find((r) => r.athleteId === "a2")!.invite).toBeNull();
  });

  it("health is assessDelivery's verdict over the whole campaign", async () => {
    const h = (await call()).health as Record<string, unknown>;
    expect(h).toMatchObject({
      deliverablesTotal: 4, deliverablesVerified: 1, deliverablesOverdue: 1,
      projectedImpressions: 15_000, verifiedImpressions: 3000,
      underDeliveringWork: true, underDeliveringReach: true,
    });
  });

  it("never gives a sponsor the athlete's offer", async () => {
    const sponsor = { ...admin, roles: ["SPONSOR_ADMIN"], sponsorId: "spn" } as unknown as Actor;
    let body: Record<string, unknown> | undefined;
    await campaignOps({ actor: sponsor, params: { id: "cmp_1" } } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
    expect(JSON.stringify(body)).not.toContain("offered");
  });

  it("refuses a campaign outside scope", async () => {
    campaign = null;
    await expect(call()).rejects.toThrow();
  });
});
