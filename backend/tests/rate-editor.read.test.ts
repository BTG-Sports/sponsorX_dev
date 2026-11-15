import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   POL-BE-51 — GET /athletes/:id/rate-editor, BTG's rate card editor in one
   read. Walkthrough practice (2026-11-15) found no screen that wrote a rate,
   so a fresh brief could not be staffed by hand. The read is only for the
   people who may SET a rate; nobody gains a grant they did not hold.
   Prisma is stubbed: this pins who may ask, what is asked for, and the shape.
   -------------------------------------------------------------------------- */

const calls: { athlete: unknown[]; jobs: unknown[]; reach: unknown[]; rates: unknown[] } = { athlete: [], jobs: [], reach: [], rates: [] };
let athleteRow: unknown = null;

vi.mock("../src/db/client", () => ({
  prisma: {
    athlete: {
      findFirst: (args: unknown) => (calls.athlete.push(args), Promise.resolve(athleteRow)),
      count: (args: unknown) => (calls.reach.push(args), Promise.resolve(athleteRow ? 1 : 0)),
    },
    nilJob: {
      findMany: (args: unknown) => (
        calls.jobs.push(args),
        Promise.resolve([
          { id: "SX-01", name: "Story Drop", baseLow: 25, baseHigh: 50, sellLow: 75, sellHigh: 125 },
          { id: "SX-02", name: "Sponsored Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250 },
        ])
      ),
    },
    athleteRate: {
      findMany: (args: unknown) => (
        calls.rates.push(args),
        Promise.resolve([
          { jobId: "SX-02", amount: 9000, version: 2, job: { name: "Sponsored Post" } },
          { jobId: "SX-02", amount: 8000, version: 1, job: { name: "Sponsored Post" } },
        ])
      ),
    },
  },
}));

const { readRateEditor } = await import("../src/domain/athlete-rate");
const { ForbiddenError } = await import("../src/auth/errors");

const actor = (role: string, extra: Record<string, unknown> = {}) =>
  ({ userId: `u_${role}`, tenantId: "t_a", roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;

beforeEach(() => {
  calls.athlete = [];
  calls.jobs = [];
  calls.reach = [];
  calls.rates = [];
  athleteRow = { id: "ath_1", displayName: "Ava Cruz", sport: "Soccer", stateCode: "MD", tier: null, state: "ACTIVE" };
});

describe("POL-BE-51 · the rate card editor's read", () => {
  it("gives a BTG admin and a network manager the athlete, the catalogue in dollars and the current card in cents", async () => {
    for (const role of ["BTG_ADMIN", "NETWORK_MGR"]) {
      const out = await readRateEditor(actor(role), "ath_1");
      expect(out.athlete).toEqual({ id: "ath_1", displayName: "Ava Cruz", sport: "Soccer", stateCode: "MD", tier: null, state: "ACTIVE" });
      expect(out.jobs[0]).toEqual({ id: "SX-01", name: "Story Drop", baseLowDollars: 25, baseHighDollars: 50, sellLowDollars: 75, sellHighDollars: 125 });
      /* The newest version per job, as the athlete's own card reads it. */
      expect(out.rates).toEqual([{ jobId: "SX-02", jobName: "Sponsored Post", amount: 9000, version: 2 }]);
    }
  });

  it("reads the athlete and the catalogue inside the caller's own tenant", async () => {
    await readRateEditor(actor("NETWORK_MGR"), "ath_1");
    expect(JSON.stringify(calls.athlete[0])).toContain('"tenantId":"t_a"');
    expect(JSON.stringify(calls.jobs[0])).toContain('"tenantId":"t_a"');
  });

  it("refuses everyone who may not set a rate — a campaign manager reads rates but never sets them", async () => {
    for (const [role, extra] of [
      ["CAMPAIGN_MGR", {}],
      ["SALES", {}],
      ["FINANCE", {}],
      ["ATHLETE", { athleteId: "ath_1" }],
      ["GUARDIAN", { guardianId: "g_1" }],
      ["SPONSOR_ADMIN", { sponsorId: "s_1" }],
    ] as const) {
      await expect(readRateEditor(actor(role, extra), "ath_1"), role).rejects.toBeInstanceOf(ForbiddenError);
    }
    /* Refused before anything was read. */
    expect(calls.athlete).toHaveLength(0);
    expect(calls.jobs).toHaveLength(0);
  });

  it("answers an athlete outside the caller's reach as a refusal, never an empty editor", async () => {
    athleteRow = null;
    await expect(readRateEditor(actor("BTG_ADMIN"), "ath_other")).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.jobs).toHaveLength(0);
  });
});
