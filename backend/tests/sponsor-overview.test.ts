/* eslint-disable @typescript-eslint/no-explicit-any -- mock Prisma args are inspected structurally */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* P1-ART-23 — the sponsor's overview: scoped to the sponsor's campaigns, sources never blended,
   every bucket present, money gated like /campaigns/summary. */

type Args = Record<string, any>;
type Call = { model: string; op: string; args: Args };
let calls: Call[] = [];
let raws: { sql: string; values: unknown[] }[] = [];
let impl: Record<string, (a: Args) => unknown> = {};
let rawImpl: (sql: string) => unknown[] = () => [];

/* sponsor-overview.ts pulls in sponsor-report.ts for mediaValueFor, which
   pulls in earning.ts -> payout-auto.ts -> config/env: the same chain
   sponsor-report.test.ts already mocks around, for the same reason — the
   pure arithmetic under test here needs neither a database nor its config. */
vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

const DEFAULTS: Record<string, unknown> = { findMany: [], findFirst: null, count: 0, groupBy: [], aggregate: { _sum: {} } };
const model = (name: string) =>
  Object.fromEntries(
    Object.keys(DEFAULTS).map((op) => [
      op,
      (a: Args) => {
        calls.push({ model: name, op, args: a });
        const f = impl[`${name}.${op}`];
        return Promise.resolve(f ? f(a) : DEFAULTS[op]);
      },
    ]),
  );
vi.mock("../src/db/client", () => {
  const made: Record<string, unknown> = {};
  const $queryRaw = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    raws.push({ sql, values });
    return Promise.resolve(rawImpl(sql));
  };
  return { prisma: new Proxy({}, { get: (_t, name: string) => (name === "$queryRaw" ? $queryRaw : (made[name] ??= model(name))) }) };
});

const { windowFor, zeroFill, sponsorOverview } = await import("../src/domain/sponsor-overview");
const { whereFor } = await import("../src/auth/scope");
const { canReadField } = await import("../src/auth/fields");
const { ForbiddenError } = await import("../src/auth/errors");

const base = { userId: "u_spo1", tenantId: "t_spo1", athleteId: null, guardianId: null, propertyId: null, wards: [], actingFor: null };
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "sp_spo1" } as unknown as Actor;
const NOW = new Date("2026-10-11T15:00:00Z");
const of = (m: string, op: string) => calls.filter((c) => c.model === m && c.op === op);

beforeEach(() => {
  calls = [];
  raws = [];
  impl = {};
  rawImpl = () => [];
});

describe("windowFor", () => {
  it("30d ends at tomorrow 00:00 UTC, starts 30 days before, compares with the 30 before that", () => {
    const w = windowFor("30d", NOW, null);
    expect(w.to.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(w.prevFrom!.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(w.days).toBe(30);
    expect(w.bucket).toBe("day");
  });
  it("all starts at the earliest campaign, has no comparison, and goes weekly past 120 days", () => {
    const w = windowFor("all", NOW, new Date("2026-01-03T09:00:00Z"));
    expect(w.from.toISOString()).toBe("2026-01-03T00:00:00.000Z");
    expect(w.prevFrom).toBeNull();
    expect(w.bucket).toBe("week");
  });
});

describe("zeroFill", () => {
  it("one point per day, zeros where nothing happened, out-of-range rows dropped", () => {
    const w = windowFor("7d", NOW, null);
    const pts = zeroFill(w, [
      { day: new Date("2026-10-11T00:00:00Z"), views: 5 },
      { day: new Date("2026-10-11T13:00:00Z"), redeems: 2 },
      { day: new Date("2026-09-01T00:00:00Z"), views: 99 },
    ]);
    expect(pts).toHaveLength(7);
    expect(pts[0]!.day).toBe("2026-10-05");
    expect(pts[6]).toEqual({ day: "2026-10-11", views: 5, clicks: 0, redeems: 2 });
    expect(pts.reduce((n, p) => n + p.views, 0)).toBe(5);
  });
});

describe("sponsorOverview", () => {
  it("scopes campaigns through whereFor first; every later read uses only those ids", async () => {
    impl["campaign.findMany"] = () => [{ id: "c_spo1", state: "ACTIVE", startDate: new Date("2026-09-01") }];
    await sponsorOverview(sponsor, { range: "30d" }, NOW);
    const find = of("campaign", "findMany")[0]!;
    expect(find.args.where.AND[0]).toEqual(whereFor(sponsor, "campaign", "read"));
    for (const r of raws) expect(r.values).toContainEqual(["c_spo1"]);
    for (const g of of("metricDaily", "groupBy")) expect(g.args.where.deliverable.order.campaignId.in).toEqual(["c_spo1"]);
  });

  it("a campaignId outside the scope is refused", async () => {
    impl["campaign.findMany"] = () => [];
    await expect(sponsorOverview(sponsor, { range: "30d", campaignId: "c_other" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("people reached is verified only; the rest is kept apart, never blended", async () => {
    impl["campaign.findMany"] = () => [{ id: "c_spo1", state: "ACTIVE", startDate: new Date("2026-09-01") }];
    impl["metricDaily.groupBy"] = (a) =>
      a.by.includes("day")
        ? [
            { day: new Date("2026-10-10"), source: "VERIFIED_API", _sum: { views: 100, engagements: 10 } },
            { day: new Date("2026-10-10"), source: "SELF_REPORTED", _sum: { views: 900, engagements: 90 } },
          ]
        : [{ source: "VERIFIED_MANUAL", _sum: { views: 40, engagements: 4 } }];
    const o = await sponsorOverview(sponsor, { range: "30d" }, NOW);
    expect(o.reach.verifiedViews).toBe(100);
    expect(o.reach.verifiedEngagements).toBe(10);
    expect(o.reach.otherViews).toBe(900);
    expect(o.reach.bySource.SELF_REPORTED).toBe(900);
    expect(o.reach.prev).toEqual({ verifiedViews: 40, verifiedEngagements: 4 });
    expect(o.daily).toHaveLength(30);
    expect(o.daily.find((d) => d.day === "2026-10-10")!.views).toBe(100);
  });

  it("splits events into the window and the comparison window; funnel by type", async () => {
    impl["campaign.findMany"] = () => [{ id: "c_spo1", state: "ACTIVE", startDate: new Date("2026-08-01") }];
    rawImpl = (sql) =>
      sql.includes('"RewardEvent"')
        ? [
            { day: new Date("2026-10-11"), type: "SCAN", n: 8 },
            { day: new Date("2026-10-11"), type: "REDEEM", n: 3 },
            { day: new Date("2026-08-20"), type: "REDEEM", n: 2 },
          ]
        : sql.includes('"LinkEvent"')
          ? [{ day: new Date("2026-10-09"), n: 4 }, { day: new Date("2026-08-20"), n: 1 }]
          : [];
    const o = await sponsorOverview(sponsor, { range: "30d" }, NOW);
    expect(o.fans).toMatchObject({ scan: 8, redeem: 3, prevRedeem: 2 });
    expect(o.clicks).toEqual({ total: 4, prev: 1 });
    expect(o.today.redeems).toBe(3);
  });

  it("money follows the field matrix: absent, never 0, when the role can't read it", async () => {
    impl["campaign.findMany"] = () => [{ id: "c_spo1", state: "ACTIVE", startDate: new Date("2026-09-01") }];
    const o = await sponsorOverview(sponsor, { range: "7d" }, NOW);
    const sees = canReadField(sponsor.roles, "campaign.value") && canReadField(sponsor.roles, "campaignOrder.sellPrice");
    expect("money" in o).toBe(sees);
  });

  it("no campaigns: zeros and an empty series, no raw reads with an empty list", async () => {
    const o = await sponsorOverview(sponsor, { range: "7d" }, NOW);
    expect(o.reach.verifiedViews).toBe(0);
    expect(o.daily).toHaveLength(7);
    expect(raws).toHaveLength(0);
  });
});
