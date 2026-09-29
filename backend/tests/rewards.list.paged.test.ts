import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /rewards · offset mode, and GET /rewards/summary (2026-09-29,
   server-paged lists). `?page=` turns paging on; the tab, campaign and search
   are WHEREs after the caller's scope, never in place of it; the summary
   counts the tabs and the funnel in the database under that same scope.
   Without `?page=` the list answers exactly as before.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: unknown[] = [];
let total = 0;
let findArgs: Record<string, unknown> = {};
let countArgs: Record<string, unknown> = {};
let stateGroups: unknown[] = [];
let stateArgs: Record<string, unknown> = {};
let eventGroups: unknown[] = [];
let eventArgs: Record<string, unknown>[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    reward: {
      findMany: (a: Record<string, unknown>) => ((findArgs = a), Promise.resolve(rows)),
      count: (a: Record<string, unknown>) => ((countArgs = a), Promise.resolve(total)),
      groupBy: (a: Record<string, unknown>) => ((stateArgs = a), Promise.resolve(stateGroups)),
    },
    rewardEvent: {
      groupBy: (a: Record<string, unknown>) => (eventArgs.push(a), Promise.resolve(eventGroups)),
    },
    rewardToken: { groupBy: () => Promise.resolve([]) },
  },
}));

const { listRewards, rewardSummary } = await import("../src/routes/v1/rewards");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null };
const admin = { ...base, roles: ["BTG_ADMIN"], athleteId: null, sponsorId: null } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "a1", sponsorId: null } as unknown as Actor;

const REWARD = {
  id: "rw_1", offerText: "Free drink", terms: "One per fan", singleUse: true,
  expiresAt: new Date("2026-12-01T00:00:00Z"), state: "ACTIVE",
  eligibility: "ANYONE", eligibilityNote: null, redemptionCap: null,
  landingHeadline: null, landingSubhead: null, redemptionCount: 0, reserveMinutes: 60,
  campaign: { id: "cmp_1", name: "Fall", endDate: new Date("2026-11-30T00:00:00Z"), sponsor: { name: "Bowie" } },
  tokens: [{ id: "tk_1", token: "secret-a", qrKey: null, athlete: { id: "a1", displayName: "JORDAN" } }],
};

async function run(h: unknown, actor: Actor, query: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await (h as (q: unknown, r: unknown, n: unknown) => Promise<void>)(
    { actor, query, params: {} },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

const and = (a: Record<string, unknown>) => (a.where as { AND: Record<string, unknown>[] }).AND;

beforeEach(() => {
  rows = [REWARD];
  total = 1;
  findArgs = {};
  countArgs = {};
  stateGroups = [];
  stateArgs = {};
  eventGroups = [];
  eventArgs = [];
});

describe("GET /rewards · offset mode", () => {
  it("pages with the same WHERE it counts, scope first, newest expiry first with an id tiebreak", async () => {
    total = 30;
    const b = await run(listRewards, admin, { page: "2", size: "12" });
    expect(b.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(findArgs.where).toBe(countArgs.where);
    expect(findArgs.skip).toBe(12);
    expect(findArgs.take).toBe(12);
    expect(findArgs.orderBy).toEqual([{ expiresAt: "desc" }, { id: "desc" }]);
    expect(and(findArgs)[0]!.AND).toBeDefined(); /* whereFor's own AND */
    expect(and(findArgs)).toHaveLength(1);
  });

  it("keeps the row shape, the consent line, and never a token string", async () => {
    const b = await run(listRewards, admin, { page: "1" });
    const r = (b.rewards as Record<string, unknown>[])[0]!;
    expect(r).toMatchObject({ id: "rw_1", tokenCount: 1, athletes: 1, funnel: { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 } });
    expect((b.consent as { version: string }).version).toBeTruthy();
    expect(JSON.stringify(b)).not.toContain("secret-a");
  });

  it.each([
    ["live", ["ACTIVE"]],
    ["draft", ["DRAFT"]],
    ["paused", ["PAUSED"]],
    ["ended", ["EXPIRED", "ARCHIVED"]],
  ])("tab %s is the desk's state set", async (tab, states) => {
    await run(listRewards, admin, { page: "1", tab });
    expect(and(findArgs)).toContainEqual({ state: { in: states } });
  });

  it("tab all, or an unknown tab, adds no state filter", async () => {
    for (const tab of ["all", "bogus"]) {
      await run(listRewards, admin, { page: "1", tab });
      expect(and(findArgs).some((c) => "state" in c)).toBe(false);
    }
  });

  it("?campaignId narrows after the scope", async () => {
    await run(listRewards, admin, { page: "1", campaignId: "cmp_9" });
    expect(and(findArgs)[1]).toEqual({ campaignId: "cmp_9" });
  });

  it("?q searches offer, campaign name and sponsor name, case-insensitively", async () => {
    await run(listRewards, admin, { page: "1", q: "  bowie  " });
    const c = { contains: "bowie", mode: "insensitive" };
    expect(and(findArgs).at(-1)).toEqual({
      OR: [
        { offerText: c },
        { campaign: { is: { name: c } } },
        { campaign: { is: { sponsor: { is: { name: c } } } } },
      ],
    });
  });

  it("a hostile page or size degrades instead of erroring; past the end is the last page", async () => {
    total = 5;
    let b = await run(listRewards, admin, { page: "-3", size: "abc" });
    expect(b.page).toEqual({ page: 1, size: 12, total: 5, pages: 1 });
    b = await run(listRewards, admin, { page: "1", size: "100000" });
    expect((b.page as { size: number }).size).toBe(100);
    b = await run(listRewards, admin, { page: "99" });
    expect(b.page).toEqual({ page: 1, size: 12, total: 5, pages: 1 });
    expect(findArgs.skip).toBe(0);
  });

  it("an empty result reads nothing", async () => {
    total = 0;
    const b = await run(listRewards, admin, { page: "1" });
    expect(b.rewards).toEqual([]);
    expect(findArgs).toEqual({});
  });
});

describe("GET /rewards · unpaged, unchanged", () => {
  it("still takes 200 newest-expiry, no skip, no page key", async () => {
    const b = await run(listRewards, admin, { campaignId: "cmp_1" });
    expect(findArgs.take).toBe(200);
    expect(findArgs.skip).toBeUndefined();
    expect(findArgs.orderBy).toEqual({ expiresAt: "desc" });
    expect((findArgs.where as Record<string, unknown>).campaignId).toBe("cmp_1");
    expect("page" in b).toBe(false);
    expect(Object.keys(b)).toEqual(["rewards", "consent"]);
  });
});

describe("GET /rewards/summary", () => {
  it("counts every tab from one state groupBy under the scope", async () => {
    stateGroups = [
      { state: "ACTIVE", _count: { _all: 4 } },
      { state: "DRAFT", _count: { _all: 2 } },
      { state: "PAUSED", _count: { _all: 1 } },
      { state: "EXPIRED", _count: { _all: 3 } },
      { state: "ARCHIVED", _count: { _all: 5 } },
    ];
    eventGroups = [
      { type: "SCAN", _count: { _all: 40 } },
      { type: "CLAIM", _count: { _all: 12 } },
      { type: "REDEEM", _count: { _all: 7 } },
    ];
    const b = await run(rewardSummary, admin, { campaignId: "cmp_1" });
    expect(b.tabs).toEqual({ all: 15, live: 4, draft: 2, paused: 1, ended: 8 });
    expect(b.live).toBe(4);
    expect(b.funnel).toEqual({ SCAN: 40, CLAIM: 12, REDEEM: 7 });
    expect(stateArgs.by).toEqual(["state"]);
    expect(and(stateArgs)[0]!.AND).toBeDefined();
    expect(and(stateArgs)[1]).toEqual({ campaignId: "cmp_1" });
  });

  it("sums events in the caller's own event scope, over in-scope rewards' visible tokens", async () => {
    await run(rewardSummary, athlete);
    const w = and(eventArgs[0]!);
    expect(w[0]!.AND).toBeDefined(); /* whereFor(rewardEvent) */
    expect(w[1]).toEqual({ type: { in: ["SCAN", "CLAIM", "REDEEM"] } });
    const tokenAnd = (w[2] as { token: { is: { AND: Record<string, unknown>[] } } }).token.is.AND;
    expect(tokenAnd[0]).toEqual({ reward: { is: stateArgs.where } });
    /* An athlete reads a reward only through their own tokens (P6-BE-01). */
    expect(tokenAnd[1]).toEqual({ athleteId: "a1" });
  });

  it("an empty desk is all zeroes, not missing keys", async () => {
    const b = await run(rewardSummary, admin);
    expect(b).toEqual({ tabs: { all: 0, live: 0, draft: 0, paused: 0, ended: 0 }, live: 0, funnel: { SCAN: 0, CLAIM: 0, REDEEM: 0 } });
  });
});
