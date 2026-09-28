import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   The matching desk's reads — P4-FE-02 / P4-FE-03.

   GET /briefs and GET /briefs/:id are scoped reads with one field rule that
   matters: a campaign's invitations carry `offered`, which is ATHLETE PAY,
   and it rides only for a role §7.1 lets read athleteRate.amount. And the
   eligible roster's score and rates are ABSENT (not null) for a caller §7
   denies — so "denied" and "not scored yet" can never look the same.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let briefs: unknown[] = [];
let invites: unknown[] = [];
let athletes: unknown[] = [];
let briefArgs: Record<string, unknown> = {};
let athleteArgs: Record<string, unknown> = {};

vi.mock("../src/db/client", () => ({
  prisma: {
    campaignBrief: {
      findMany: (a: Record<string, unknown>) => ((briefArgs = a), Promise.resolve(briefs)),
      findFirst: (a: Record<string, unknown>) => ((briefArgs = a), Promise.resolve(briefs[0] ?? null)),
    },
    campaignInvite: { findMany: () => Promise.resolve(invites) },
    nilJob: {
      findMany: () => Promise.resolve([
        { id: "SX-02", name: "Sponsored Post", sellLow: 50_000, sellHigh: 150_000, sellFloorEmerging: 50_000, sellFloorCreator: 80_000, sellFloorPremium: 120_000 },
      ]),
    },
    athlete: {
      findMany: (a: Record<string, unknown>) => ((athleteArgs = a), Promise.resolve(athletes)),
    },
  },
}));

const { listBriefs, readBrief } = await import("../src/routes/v1/campaigns");
const { eligibleAthletes } = await import("../src/domain/matching");

const base = { userId: "u_1", tenantId: "t_1", athleteId: null, guardianId: null, propertyId: null };
const admin = { ...base, roles: ["BTG_ADMIN"], sponsorId: null } as unknown as Actor;
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "spn_1" } as unknown as Actor;

const BRIEF = {
  id: "brf_1", objective: "Fall foot traffic", state: "APPROVED", budget: 500_000,
  startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"),
  sports: ["Basketball"], stateCodes: ["MD"], categories: ["automotive"],
  createdAt: new Date("2026-09-20T00:00:00Z"),
  sponsor: { name: "Bowie Auto Group" },
  package: { code: "LOCAL_BLITZ", name: "Local Blitz", lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }], athleteCountMin: 3, athleteCountMax: 5 },
  campaign: { id: "cmp_1", name: "Fall Push", state: "STAFFING" },
};

async function run(handler: unknown, req: Record<string, unknown>) {
  let body: Record<string, unknown> | undefined;
  const res = { json: (b: Record<string, unknown>) => void (body = b) };
  await (handler as (q: unknown, r: unknown, n: unknown) => Promise<void>)(req, res, () => {});
  return body!;
}

beforeEach(() => {
  briefs = [BRIEF];
  invites = [{ id: "inv_1", athleteId: "ath_1", jobId: "SX-02", state: "INVITED", offered: 40_000, expiresAt: new Date("2026-10-05T00:00:00Z") }];
  athletes = [];
  briefArgs = {};
  athleteArgs = {};
});

describe("GET /briefs", () => {
  it("is scoped and newest first, and flattens the sponsor name", async () => {
    const body = await run(listBriefs, { actor: admin, query: {} });
    expect((briefArgs.where as Record<string, unknown>).AND).toBeDefined();
    expect(briefArgs.orderBy).toEqual({ createdAt: "desc" });
    const b = (body.briefs as Record<string, unknown>[])[0];
    expect(b.sponsorName).toBe("Bowie Auto Group");
    expect(b.startDate).toBe("2026-10-01T00:00:00.000Z");
  });

  it("narrows by a real state and ignores an invented one", async () => {
    await run(listBriefs, { actor: admin, query: { state: "APPROVED" } });
    expect((briefArgs.where as Record<string, unknown>).state).toBe("APPROVED");
    await run(listBriefs, { actor: admin, query: { state: "NOPE" } });
    expect((briefArgs.where as Record<string, unknown>).state).toBeUndefined();
  });
});

describe("GET /briefs/:id", () => {
  it("gives BTG the campaign's invitations with the offer", async () => {
    const body = await run(readBrief, { actor: admin, params: { id: "brf_1" } });
    expect(body.invites).toEqual([
      { id: "inv_1", athleteId: "ath_1", jobId: "SX-02", state: "INVITED", offered: 40_000, expiresAt: "2026-10-05T00:00:00.000Z" },
    ]);
  });

  it("resolves the package lines to sell-side job prices, never base pay", async () => {
    const body = await run(readBrief, { actor: admin, params: { id: "brf_1" } });
    expect(body.jobs).toEqual([{
      jobId: "SX-02", name: "Sponsored Post", quantity: 1, sellLow: 50_000, sellHigh: 150_000,
      sellFloors: { EMERGING: 50_000, CREATOR: 80_000, PREMIUM: 120_000 },
    }]);
    expect(JSON.stringify(body.jobs)).not.toMatch(/base/i);
  });

  it("never gives a sponsor athlete pay — no invitations at all", async () => {
    const body = await run(readBrief, { actor: sponsor, params: { id: "brf_1" } });
    expect(body.invites).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("offered");
  });

  it("refuses an out-of-scope brief as forbidden, not as missing", async () => {
    briefs = [];
    await expect(run(readBrief, { actor: admin, params: { id: "nope" } })).rejects.toThrow();
  });
});

describe("eligibleAthletes — the desk's columns", () => {
  const ROW = {
    id: "ath_1", displayName: "Shammah", sport: "Basketball", stateCode: "MD", tier: "CREATOR", city: "Bowie",
    scores: [{ score: 81, factors: { engagement: 80 }, method: "rules-v1", scoredAt: new Date("2026-09-02T00:00:00Z") }],
    socials: [
      { followers: 10_000, source: "VERIFIED_API" },
      { followers: 2_000, source: "SELF_REPORTED" },
    ],
    rates: [
      { jobId: "SX-02", amount: 30_000, version: 1 },
      { jobId: "SX-02", amount: 35_000, version: 2 },
      { jobId: "SX-01", amount: 12_000, version: 1 },
    ],
  };

  it("BTG gets the latest score, summed reach and the CURRENT rate per job", async () => {
    athletes = [ROW];
    const [a] = await eligibleAthletes(admin, {});
    expect(a.score).toEqual({ value: 81, factors: { engagement: 80 }, method: "rules-v1", scoredAt: "2026-09-02T00:00:00.000Z" });
    expect(a.reach).toEqual({ followers: 12_000, verified: false });
    expect(a.rates).toEqual([{ jobId: "SX-01", amount: 12_000 }, { jobId: "SX-02", amount: 35_000 }]);
  });

  it("an unscored athlete is null — never zero", async () => {
    athletes = [{ ...ROW, scores: [] }];
    const [a] = await eligibleAthletes(admin, {});
    expect(a.score).toBeNull();
  });

  it("a sponsor-side caller never selects score or rates — the keys are absent", async () => {
    athletes = [{ ...ROW, scores: undefined, rates: undefined }];
    const [a] = await eligibleAthletes(sponsor, {});
    const select = athleteArgs.select as Record<string, unknown>;
    expect(select.scores).toBeUndefined();
    expect(select.rates).toBeUndefined();
    expect("score" in a).toBe(false);
    expect("rates" in a).toBe(false);
  });

  it("reach is null, not zero, when no account reports followers", async () => {
    athletes = [{ ...ROW, socials: [{ followers: null, source: "SELF_REPORTED" }] }];
    const [a] = await eligibleAthletes(admin, {});
    expect(a.reach).toEqual({ followers: null, verified: false });
  });
});
