# Sponsor Portal "Stadium Board" (P1-ART-23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every sponsor portal page as a statistics-first dashboard on a distinct "Stadium Board" stage (LED-orange, fixed dark). Back every number with a real read, and server-page every growing list.

**Architecture:** Three backend reads: a new `GET /sponsor/overview` aggregate, plus `?page` and summary on `/marketplace-orders`, plus `?page` on `/marketplace/search`. They feed a new stadium kit (`stadium-stage.tsx`, `stadium-hint.tsx`, `stadium-trend.tsx`, `stadium.css`) that mirrors the athlete arena kit's API. Each sponsor page is then rebuilt on that kit with one plain-language word map (`lib/sponsor-words.ts`).

**Tech Stack:** Express + Prisma 6 (Postgres) + vitest (backend); Next.js 16 app router + React server components + Tailwind v4 + vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-10-11-sponsor-stadium-design.md`. Read it first; section numbers below (§) point into it.

## Ground rules for every task

- **Branch:** `feature/P1-ART-23-sponsor-stadium`. The working tree carries **someone else's uncommitted work** (athlete settings, inventory components, `frontend/src/app/globals.css`, `frontend/src/components/filter-kit.tsx`, `e2e/marketplace-path.spec.ts`, `Memory/2026-10-11/tasks-completed.md`). **Never `git add -A` or `git add .`; always add explicit paths. Never edit those files** (the stadium CSS lives in its own file for this reason).
- Commit messages: `feat(P1-ART-23): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend tests: `cd backend && npx vitest run tests/<file>`. Backend lint: `npm run lint -w @sponsorx/backend` (from the repo root).
- Frontend tests: `cd frontend && npx vitest run tests/<file>`. Frontend lint: `cd frontend && npx eslint <files>`. Typecheck: `cd frontend && npx tsc --noEmit` (ignore pre-existing `.next/types` errors).
- **Every Prisma call** gets a `/* tenant-scope: … */` comment saying how it is scoped, as in the surrounding code.
- **Never print a raw enum** on a sponsor page: go through `lib/sponsor-words.ts`.
- **Every figure comes from an API read** (summary / counts / overview / page.total), never from summing visible rows. Money is in cents.
- Next.js 16 differs from your training data. Before using an unfamiliar Next API, read `frontend/node_modules/next/dist/docs/`. `searchParams` is a Promise in page props (see existing sponsor pages).
- Reference implementation for every pattern: the athlete arena, `frontend/src/components/arena-stage.tsx` and `frontend/src/app/(app)/athlete/page.tsx`, plus `frontend/src/app/(app)/athlete/sales/page.tsx` for a paged list with tabs.

---

## File map

**Backend**
- Create `backend/src/domain/sponsor-overview.ts`: the window maths, zero-fill and the overview read.
- Create `backend/src/routes/v1/sponsor-overview.ts`: `GET /sponsor/overview`.
- Modify `backend/src/routes/v1/index.ts`: mount it.
- Modify `backend/src/domain/marketplace-order.ts`: `ORDER_TABS`, `pageMarketplaceOrders`, `marketplaceOrderSummary`.
- Modify `backend/src/domain/marketplace-search.ts`: `searchMarketplacePage`.
- Modify `backend/src/routes/v1/marketplace.ts`: paged orders, the orders summary, paged search.
- Modify `backend/src/contracts/registry.ts`: document the new and changed reads.
- Create `backend/tests/sponsor-overview.test.ts`, `backend/tests/sponsor-lists.paged.test.ts`.

**Frontend**
- Create `frontend/src/lib/sponsor-words.ts` and `frontend/tests/sponsor-words.test.ts`.
- Create `frontend/src/app/(app)/sponsor/stadium.css`.
- Create `frontend/src/components/stadium-stage.tsx`, `stadium-hint.tsx`, `stadium-trend.tsx`.
- Modify `frontend/src/components/portal-shell.tsx`, `stage-portals.tsx` (doc comment only).
- Modify `frontend/src/app/(app)/sponsor/layout.tsx`, `loading.tsx`; `frontend/tests/nav-groups.test.ts`.
- Create `frontend/src/lib/sponsor-overview-live.ts` (types + pure helpers), `frontend/src/server/sponsor-overview.ts` (fetch), `frontend/src/lib/fixtures/sponsor-overview.ts` (demo), `frontend/tests/sponsor-overview-live.test.ts`.
- Rewrite every page under `frontend/src/app/(app)/sponsor/`; create `frontend/src/app/(app)/sponsor/requests/page.tsx`.

---

## Task 1: Backend — `GET /sponsor/overview`

**Files:**
- Create: `backend/src/domain/sponsor-overview.ts`
- Create: `backend/src/routes/v1/sponsor-overview.ts`
- Modify: `backend/src/routes/v1/index.ts` (mount beside `catalogueRouter`)
- Modify: `backend/src/contracts/registry.ts` (one entry next to `/campaigns/summary`)
- Test: `backend/tests/sponsor-overview.test.ts`

Before coding, confirm in `backend/prisma/schema.prisma`:
- `RewardEvent` has a relation field to `RewardToken`. The plan assumes it is named `token`; use the real name.
- `RewardToken.reward` exists.
- `DeliverableState` contains `SPONSOR_REVIEW`, `PUBLISHED` and `VERIFIED`.
- `CampaignInvoice` has `campaignId`, `status` and `amount`.

Also confirm `METRIC_SOURCES` is exported from `backend/src/domain/metric-source.ts`.

- [ ] **Step 1: Write the failing test** `backend/tests/sponsor-overview.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx vitest run tests/sponsor-overview.test.ts`
Expected: FAIL, "Cannot find module '../src/domain/sponsor-overview'".

- [ ] **Step 3: Implement `backend/src/domain/sponsor-overview.ts`**

```ts
/**
 * The sponsor's overview — P1-ART-23 (the Stadium Board dashboard and the
 * campaign results chart).
 *
 * One read for everything a sponsor's home page shows over a chosen window
 * (7 / 30 / 90 days, or all time): reach by day, clicks, the fan funnel, the
 * best athletes and cities, delivery, money and what is waiting on them.
 * Computed in the database over the sponsor's own campaigns — the campaign
 * list comes from whereFor(actor, "campaign", "read") and every later read is
 * keyed by those ids, so nothing outside the scope can be counted.
 *
 * NEVER BLENDED (metric.ts, §22): "people reached" is VERIFIED_API +
 * VERIFIED_MANUAL only; self-reported, estimated and attributed views are
 * returned beside it, by source, and are never added in. The cost per 1,000
 * is the report's own mediaValueFor over ALL-TIME spend and verified views, so
 * the dashboard and the report cannot disagree. No benchmark — Phase 1 holds
 * none (sponsor-report.ts).
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { canReadField } from "../auth/fields";
import { ForbiddenError } from "../auth/errors";
import { mediaValueFor } from "./sponsor-report";
import { METRIC_SOURCES, type MetricSource } from "./metric-source";

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];

const DAY = 86_400_000;
const VERIFIED: readonly string[] = ["VERIFIED_API", "VERIFIED_MANUAL"];
const DELIVERED = ["PUBLISHED", "VERIFIED"];
const LIVE_ORDER = { state: { notIn: ["CANCELLED", "REJECTED"] } } as const;
const PAID_OR_LATER = ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"];

export type Window = { key: RangeKey; from: Date; to: Date; days: number; bucket: "day" | "week"; prevFrom: Date | null };
export type DailyPoint = { day: string; views: number; clicks: number; redeems: number };

export type SponsorOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  reach: {
    verifiedViews: number;
    verifiedEngagements: number;
    otherViews: number;
    prev: { verifiedViews: number; verifiedEngagements: number } | null;
    bySource: Record<MetricSource, number>;
  };
  clicks: { total: number; prev: number | null };
  fans: { scan: number; landing: number; claim: number; redeem: number; prevRedeem: number | null };
  daily: DailyPoint[];
  today: { views: number; redeems: number };
  delivery: { due: number; delivered: number; late: number; nextDueAt: string | null };
  topAthletes: { athleteId: string; name: string; sport: string | null; views: number }[];
  topCities: { city: string; region: string | null; redeems: number }[];
  money?: { contractedCents: number; invoicedCents: number; paidCents: number };
  costPer1000Cents: number | null;
  needsYou: { postsToReview: number; ordersToPay: number; invoicesUnpaid?: number };
  campaigns: { total: number; running: number };
};

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The window a range covers: [from, to), `to` = tomorrow 00:00 UTC so today counts. */
export function windowFor(key: RangeKey, now: Date, earliest: Date | null): Window {
  const to = new Date(startOfDay(now).getTime() + DAY);
  if (key === "all") {
    const from = startOfDay(earliest && earliest < now ? earliest : now);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
    return { key, from, to, days, bucket: days > 120 ? "week" : "day", prevFrom: null };
  }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[key];
  const from = new Date(to.getTime() - days * DAY);
  return { key, from, to, days, bucket: "day", prevFrom: new Date(from.getTime() - days * DAY) };
}

/** Every bucket in the window, zero where nothing happened. Weeks start at `from`. */
export function zeroFill(w: Window, rows: { day: Date; views?: number; clicks?: number; redeems?: number }[]): DailyPoint[] {
  const step = w.bucket === "week" ? 7 : 1;
  const n = Math.ceil(w.days / step);
  const out: DailyPoint[] = Array.from({ length: n }, (_, i) => ({
    day: iso(new Date(w.from.getTime() + i * step * DAY)), views: 0, clicks: 0, redeems: 0,
  }));
  for (const r of rows) {
    const i = Math.floor((startOfDay(r.day).getTime() - w.from.getTime()) / (step * DAY));
    if (i < 0 || i >= n) continue;
    out[i]!.views += r.views ?? 0;
    out[i]!.clicks += r.clicks ?? 0;
    out[i]!.redeems += r.redeems ?? 0;
  }
  return out;
}

type DayCount = { day: Date; n: number };
type DayTypeCount = { day: Date; type: string; n: number };

export async function sponsorOverview(
  actor: Actor,
  opts: { range: RangeKey; campaignId?: string },
  now = new Date(),
): Promise<SponsorOverview> {
  assertAllowed(actor, "metricAggregate", "read");
  const campaigns = await prisma.campaign.findMany({
    /* tenant-scope: whereFor(actor, "campaign", "read") is the first AND term; campaignId only narrows it. */
    where: { AND: [whereFor(actor, "campaign", "read"), ...(opts.campaignId ? [{ id: opts.campaignId }] : [])] },
    select: { id: true, state: true, startDate: true },
  });
  if (opts.campaignId && campaigns.length === 0) throw new ForbiddenError("campaign", "read");

  const ids = campaigns.map((c) => c.id);
  const earliest = campaigns.reduce<Date | null>((m, c) => (!m || c.startDate < m ? c.startDate : m), null);
  const w = windowFor(opts.range, now, earliest);
  const since = w.prevFrom ?? w.from;
  const today = startOfDay(now);
  const has = ids.length > 0;

  const seeValue = canReadField(actor.roles, "campaign.value") && canReadField(actor.roles, "campaignOrder.sellPrice");
  const seeInvoices = seeValue && can(actor, "invoice", "read");
  const seeOrders = can(actor, "marketplaceOrder", "read");
  const inScope = { order: { campaignId: { in: ids } } };
  const liveScope = { order: { campaignId: { in: ids }, ...LIVE_ORDER } };

  const [metricRows, prevMetric, allVerified, clickRows, eventRows, athleteRows, cityRows, byState, late, nextDue, contracted, invoices, toReview, toPay] =
    await Promise.all([
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.metricDaily.groupBy({ by: ["day", "source"], where: { deliverable: inScope, day: { gte: w.from, lt: w.to } }, _sum: { views: true, engagements: true } }),
      w.prevFrom
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.metricDaily.groupBy({ by: ["source"], where: { deliverable: inScope, day: { gte: w.prevFrom, lt: w.from } }, _sum: { views: true, engagements: true } })
        : Promise.resolve(null),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.metricDaily.aggregate({ where: { deliverable: inScope, source: { in: VERIFIED as MetricSource[] } }, _sum: { views: true } }),
      has
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.$queryRaw<DayCount[]>`
            SELECT date_trunc('day', e."at") AS day, COUNT(*)::int AS n
            FROM "LinkEvent" e
            JOIN "TrackingLink" l ON l."id" = e."linkId"
            JOIN "Deliverable" d ON d."id" = l."deliverableId"
            JOIN "CampaignOrder" o ON o."id" = d."orderId"
            WHERE o."campaignId" = ANY(${ids}) AND e."at" >= ${since} AND e."at" < ${w.to}
            GROUP BY 1`
        : Promise.resolve([] as DayCount[]),
      has
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.$queryRaw<DayTypeCount[]>`
            SELECT date_trunc('day', e."at") AS day, e."type"::text AS type, COUNT(*)::int AS n
            FROM "RewardEvent" e
            JOIN "RewardToken" t ON t."id" = e."tokenId"
            JOIN "Reward" r ON r."id" = t."rewardId"
            WHERE r."campaignId" = ANY(${ids}) AND e."at" >= ${since} AND e."at" < ${w.to}
            GROUP BY 1, 2`
        : Promise.resolve([] as DayTypeCount[]),
      has
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.$queryRaw<{ id: string; views: number }[]>`
            SELECT o."athleteId" AS id, SUM(m."views")::int AS views
            FROM "MetricDaily" m
            JOIN "Deliverable" d ON d."id" = m."deliverableId"
            JOIN "CampaignOrder" o ON o."id" = d."orderId"
            WHERE o."campaignId" = ANY(${ids}) AND m."source"::text IN ('VERIFIED_API', 'VERIFIED_MANUAL')
              AND m."day" >= ${w.from} AND m."day" < ${w.to}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 5`
        : Promise.resolve([] as { id: string; views: number }[]),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.rewardEvent.groupBy({
        by: ["city", "region"],
        where: { type: "REDEEM", city: { not: null }, at: { gte: w.from, lt: w.to }, token: { reward: { campaignId: { in: ids } } } },
        _count: { _all: true },
        orderBy: { _count: { city: "desc" } },
        take: 5,
      }),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.deliverable.groupBy({ by: ["state"], where: liveScope, _count: { _all: true } }),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.deliverable.count({ where: { ...liveScope, state: { notIn: DELIVERED as never }, dueDate: { lt: now } } }),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.deliverable.findFirst({ where: { ...liveScope, state: { notIn: DELIVERED as never }, dueDate: { gte: now } }, orderBy: { dueDate: "asc" }, select: { dueDate: true } }),
      seeValue
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.campaignOrder.aggregate({ where: { campaignId: { in: ids }, ...LIVE_ORDER }, _sum: { sellPrice: true } })
        : Promise.resolve(null),
      seeInvoices
        ? /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
          prisma.campaignInvoice.groupBy({ by: ["status"], where: { campaignId: { in: ids } }, _sum: { amount: true }, _count: { _all: true } })
        : Promise.resolve(null),
      /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
      prisma.deliverable.count({ where: { ...inScope, state: "SPONSOR_REVIEW" } }),
      seeOrders
        ? /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
          prisma.marketplaceOrder.count({ where: { AND: [whereFor(actor, "marketplaceOrder", "read"), { state: "AWAITING_PAYMENT" }] } })
        : Promise.resolve(0),
    ]);

  /* reach — by source, verified kept apart */
  const bySource = Object.fromEntries(METRIC_SOURCES.map((s) => [s, 0])) as Record<MetricSource, number>;
  let verifiedViews = 0;
  let verifiedEngagements = 0;
  let otherViews = 0;
  let todayViews = 0;
  for (const r of metricRows) {
    const v = r._sum.views ?? 0;
    bySource[r.source as MetricSource] += v;
    if (VERIFIED.includes(r.source)) {
      verifiedViews += v;
      verifiedEngagements += r._sum.engagements ?? 0;
      if (startOfDay(r.day).getTime() === today.getTime()) todayViews += v;
    } else otherViews += v;
  }
  const prev = prevMetric
    ? prevMetric.filter((r) => VERIFIED.includes(r.source)).reduce(
        (a, r) => ({ verifiedViews: a.verifiedViews + (r._sum.views ?? 0), verifiedEngagements: a.verifiedEngagements + (r._sum.engagements ?? 0) }),
        { verifiedViews: 0, verifiedEngagements: 0 },
      )
    : null;

  /* clicks and the fan funnel — current window vs the one before it */
  const inWindow = (d: Date) => d >= w.from;
  const clicks = clickRows.filter((r) => inWindow(r.day)).reduce((n, r) => n + r.n, 0);
  const prevClicks = w.prevFrom ? clickRows.filter((r) => !inWindow(r.day)).reduce((n, r) => n + r.n, 0) : null;
  const fans = { scan: 0, landing: 0, claim: 0, redeem: 0 };
  let prevRedeem = 0;
  let todayRedeems = 0;
  for (const r of eventRows) {
    const key = r.type.toLowerCase() as keyof typeof fans;
    if (!(key in fans)) continue;
    if (inWindow(r.day)) {
      fans[key] += r.n;
      if (key === "redeem" && startOfDay(r.day).getTime() === today.getTime()) todayRedeems += r.n;
    } else if (key === "redeem") prevRedeem += r.n;
  }

  const daily = zeroFill(w, [
    ...metricRows.filter((r) => VERIFIED.includes(r.source)).map((r) => ({ day: r.day, views: r._sum.views ?? 0 })),
    ...clickRows.filter((r) => inWindow(r.day)).map((r) => ({ day: r.day, clicks: r.n })),
    ...eventRows.filter((r) => inWindow(r.day) && r.type === "REDEEM").map((r) => ({ day: r.day, redeems: r.n })),
  ]);

  /* names for the leaderboard */
  const athletes = athleteRows.length
    ? await prisma.athlete.findMany({
        /* tenant-scope: athletes named on the whereFor-scoped campaigns' own orders. */
        where: { id: { in: athleteRows.map((a) => a.id) } },
        select: { id: true, displayName: true, sport: true },
      })
    : [];
  const name = new Map(athletes.map((a) => [a.id, a]));

  /* delivery */
  const due = byState.reduce((n, r) => n + r._count._all, 0);
  const delivered = byState.filter((r) => DELIVERED.includes(r.state)).reduce((n, r) => n + r._count._all, 0);

  /* money — the /campaigns/summary gate: a figure the role can't read is absent */
  const live = (invoices ?? []).filter((i) => i.status.toLowerCase() !== "void");
  const contractedCents = contracted?._sum.sellPrice ?? 0;
  const allTimeVerified = allVerified._sum.views ?? 0;

  return {
    readAt: now.toISOString(),
    range: { key: w.key, from: iso(w.from), to: iso(new Date(w.to.getTime() - DAY)), days: w.days, bucket: w.bucket },
    reach: { verifiedViews, verifiedEngagements, otherViews, prev, bySource },
    clicks: { total: clicks, prev: prevClicks },
    fans: { ...fans, prevRedeem: w.prevFrom ? prevRedeem : null },
    daily,
    today: { views: todayViews, redeems: todayRedeems },
    delivery: { due, delivered, late, nextDueAt: nextDue?.dueDate.toISOString() ?? null },
    topAthletes: athleteRows.map((a) => ({ athleteId: a.id, name: name.get(a.id)?.displayName ?? "Athlete", sport: name.get(a.id)?.sport ?? null, views: a.views })),
    topCities: cityRows.map((c) => ({ city: c.city!, region: c.region, redeems: c._count._all })),
    ...(seeValue
      ? {
          money: {
            contractedCents,
            invoicedCents: live.reduce((n, i) => n + (i._sum.amount ?? 0), 0),
            paidCents: live.filter((i) => i.status.toLowerCase() === "paid").reduce((n, i) => n + (i._sum.amount ?? 0), 0),
          },
        }
      : {}),
    costPer1000Cents: seeValue && allTimeVerified > 0 ? mediaValueFor({ spend: contractedCents, verifiedViews: allTimeVerified }).amount : null,
    needsYou: {
      postsToReview: toReview,
      ordersToPay: toPay,
      ...(seeInvoices ? { invoicesUnpaid: live.filter((i) => i.status.toLowerCase() !== "paid").reduce((n, i) => n + i._count._all, 0) } : {}),
    },
    campaigns: { total: campaigns.length, running: campaigns.filter((c) => c.state === "ACTIVE").length },
  };
}
```

If TypeScript rejects `prisma.rewardEvent.groupBy`'s `orderBy`/`take` typing, keep the shape and cast the args object `as never` (a pattern the codebase already uses, e.g. `where: liveOrders as never`).

- [ ] **Step 4: Implement the route** `backend/src/routes/v1/sponsor-overview.ts`

```ts
/**
 * /api/v1/sponsor/overview — the sponsor's Stadium Board dashboard and the
 * campaign results chart (P1-ART-23). No business rule lives here; see
 * domain/sponsor-overview.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { RANGES, sponsorOverview, type RangeKey } from "../../domain/sponsor-overview";

export const sponsorOverviewRouter = Router();

/** GET /sponsor/overview?range=7d|30d|90d|all&campaignId= — default 30d. */
const overview: RequestHandler = async (req, res) => {
  const range = (RANGES as readonly string[]).includes(String(req.query.range)) ? (req.query.range as RangeKey) : "30d";
  const campaignId = typeof req.query.campaignId === "string" && req.query.campaignId ? req.query.campaignId.slice(0, 64) : undefined;
  res.json({ overview: await sponsorOverview(req.actor!, { range, campaignId }) });
};

sponsorOverviewRouter.get("/sponsor/overview", requireActor, overview);
```

In `backend/src/routes/v1/index.ts`, import `sponsorOverviewRouter` beside the other imports. Mount it the way `catalogueRouter` is mounted (look for `v1Router.use(... catalogueRouter)` and copy the form exactly).

In `backend/src/contracts/registry.ts`, add after the `/campaigns/summary` entry:

```ts
  { method: "get", path: "/sponsor/overview", tag: "Campaigns", summary: "The sponsor's dashboard over a window (?range=7d|30d|90d|all, default 30d; ?campaignId narrows to one campaign — 403 outside scope), computed in the database over the caller's campaign scope (P1-ART-23): verified reach and engagement kept apart from other sources, by source; clicks; the fan funnel; a zero-filled daily (weekly past 120 days) series; today's figures; delivery; top athletes and redeem cities; money only where §7.1 allows; cost per 1,000 verified views (the report's own rule); and what waits on the sponsor. Each windowed figure carries the previous equal window, null for all." , query: z.object({ range: z.enum(["7d", "30d", "90d", "all"]).optional(), campaignId: z.string().optional() }) },
```

If the registry has a test that every mounted route is registered, run it: `cd backend && npx vitest run tests/ -t registry`.

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd backend && npx vitest run tests/sponsor-overview.test.ts`
Expected: PASS (8 tests). Then run `npm run lint -w @sponsorx/backend` from the repo root. Expected: no errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/sponsor-overview.ts backend/src/routes/v1/sponsor-overview.ts backend/src/routes/v1/index.ts backend/src/contracts/registry.ts backend/tests/sponsor-overview.test.ts
git commit -m "feat(P1-ART-23): GET /sponsor/overview — the sponsor's dashboard in one scoped read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Backend — orders paged, with tab counts and a summary

**Files:**
- Modify: `backend/src/domain/marketplace-order.ts` (beside `listMarketplaceOrders`, ~L264)
- Modify: `backend/src/routes/v1/marketplace.ts` (~L241 `orders`, routes at ~L258)
- Modify: `backend/src/contracts/registry.ts` (`/marketplace-orders` entry + new summary entry)
- Test: `backend/tests/sponsor-lists.paged.test.ts`

- [ ] **Step 1: Write the failing test** `backend/tests/sponsor-lists.paged.test.ts`. Copy the mock-Prisma header exactly from `backend/tests/athlete-lists.paged.test.ts` (lines 1–62: `calls`, `impl`, `DEFAULTS`, `model`, `vi.mock("../src/db/client", …)`, `run`, `of`, `PAGE`, `beforeEach`), including its `vi.mock("../src/config/env", …)`. Then:

```ts
const { orders, ordersSummary } = await import("../src/routes/v1/marketplace");
const { whereFor } = await import("../src/auth/scope");

const base = { userId: "u_slp1", tenantId: "t_slp1", athleteId: null, guardianId: null, propertyId: null, wards: [], actingFor: null };
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "sp_slp1" } as unknown as Actor;

describe("GET /marketplace-orders · paged", () => {
  it("without ?page the old whole list: no page, no tabs, oldest first", async () => {
    const body = await run(orders, sponsor);
    expect(body.page).toBeUndefined();
    expect(body.tabs).toBeUndefined();
    expect(of("marketplaceOrder", "findMany")[0]!.args.orderBy).toEqual({ createdAt: "asc" });
  });

  it("scope first, then q, then the tab; tab counts over the scope under q; newest first", async () => {
    impl["marketplaceOrder.groupBy"] = () => [
      { state: "AWAITING_PAYMENT", _count: { _all: 2 } },
      { state: "PAID", _count: { _all: 1 } },
      { state: "FULFILLED", _count: { _all: 4 } },
    ];
    impl["marketplaceOrder.count"] = () => 2;
    const body = await run(orders, sponsor, { ...PAGE, tab: "to_pay", q: "board" });
    const scope = whereFor(sponsor, "marketplaceOrder", "read");
    const grouped = of("marketplaceOrder", "groupBy")[0]!.args.where;
    expect(grouped.AND[0]).toEqual(scope);
    expect(JSON.stringify(grouped.AND[1])).toContain("board");
    const listed = of("marketplaceOrder", "findMany")[0]!.args;
    expect(listed.where.AND[0]).toEqual(scope);
    expect(listed.where.AND.at(-1)).toEqual({ state: { in: ["APPROVED", "AWAITING_PAYMENT"] } });
    expect(listed.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(body.tabs.map((t: { key: string; count: number }) => [t.key, t.count])).toEqual([
      ["all", 7], ["waiting", 0], ["to_pay", 2], ["in_progress", 1], ["delivered", 4], ["cancelled", 0],
    ]);
    expect(body.page).toEqual({ page: 1, size: 12, total: 2, pages: 1 });
  });

  it("an unknown tab is All", async () => {
    await run(orders, sponsor, { ...PAGE, tab: "nope" });
    expect(of("marketplaceOrder", "findMany")[0]?.args.where.AND).toHaveLength(1);
  });
});

describe("GET /marketplace-orders/summary", () => {
  it("counts by tab and spend over paid-or-later, both over the whole scope", async () => {
    impl["marketplaceOrder.groupBy"] = () => [{ state: "PENDING_APPROVAL", _count: { _all: 1 } }, { state: "CLOSED", _count: { _all: 3 } }];
    impl["marketplaceOrder.aggregate"] = () => ({ _sum: { totalCents: 52000 } });
    const body = await run(ordersSummary, sponsor);
    const agg = of("marketplaceOrder", "aggregate")[0]!.args.where;
    expect(agg.AND[0]).toEqual(whereFor(sponsor, "marketplaceOrder", "read"));
    expect(agg.AND[1]).toEqual({ state: { in: ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"] } });
    expect(body.summary).toEqual({ byTab: { all: 4, waiting: 1, to_pay: 0, in_progress: 0, delivered: 3, cancelled: 0 }, spentCents: 52000 });
  });
});
```

Note: with `count: 2` and `?page=2`, the API clamps to page 1, which is why the expected `page` is 1.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx vitest run tests/sponsor-lists.paged.test.ts`
Expected: FAIL, because `orders` / `ordersSummary` are not exported.

- [ ] **Step 3: Implement in `backend/src/domain/marketplace-order.ts`** (add after `listMarketplaceOrders`; import `readPage, type PageRequest` from `../lib/paging`)

```ts
/* P1-ART-23 — the sponsor's Orders desk: tabs in plain words, each a group of
   states. `all` first; the counts are over the caller's scope under ?q. */
export const ORDER_TABS = [
  { key: "all", label: "All", states: null },
  { key: "waiting", label: "Waiting for approval", states: ["PENDING_SELLER", "PENDING_APPROVAL"] },
  { key: "to_pay", label: "To pay", states: ["APPROVED", "AWAITING_PAYMENT"] },
  { key: "in_progress", label: "In progress", states: ["PAID", "IN_DELIVERY"] },
  { key: "delivered", label: "Delivered", states: ["FULFILLED", "CLOSED"] },
  { key: "cancelled", label: "Cancelled", states: ["CANCELLED", "REFUNDED"] },
] as const satisfies readonly { key: string; label: string; states: readonly MarketplaceOrderState[] | null }[];
const SPENT_STATES: MarketplaceOrderState[] = ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"];

function tabCounts(byState: { state: string; _count: { _all: number } }[]) {
  return ORDER_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: byState.filter((r) => !t.states || (t.states as readonly string[]).includes(r.state)).reduce((n, r) => n + r._count._all, 0),
  }));
}

export async function pageMarketplaceOrders(actor: Actor, req: PageRequest, opts: { tab?: string; q?: string }) {
  const scope = whereFor(actor, "marketplaceOrder", "read");
  const search: Prisma.MarketplaceOrderWhereInput[] = opts.q
    ? [{ OR: [{ id: { contains: opts.q, mode: "insensitive" } }, { lines: { some: { title: { contains: opts.q, mode: "insensitive" } } } }] }]
    : [];
  const base: Prisma.MarketplaceOrderWhereInput[] = [scope, ...search];
  const byState = await prisma.marketplaceOrder.groupBy({
    /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
    by: ["state"], where: { AND: base }, _count: { _all: true },
  });
  const tab = ORDER_TABS.find((t) => t.key === opts.tab) ?? ORDER_TABS[0];
  const where: Prisma.MarketplaceOrderWhereInput = { AND: [...base, ...(tab.states ? [{ state: { in: [...tab.states] } }] : [])] };
  const { rows, page } = await readPage(
    req,
    /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
    () => prisma.marketplaceOrder.count({ where }),
    /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
    (skip, take) => prisma.marketplaceOrder.findMany({ where, select: SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
  );
  return { orders: await views(rows), page, tabs: tabCounts(byState) };
}

export async function marketplaceOrderSummary(actor: Actor) {
  const scope = whereFor(actor, "marketplaceOrder", "read");
  const [byState, spent] = await Promise.all([
    /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
    prisma.marketplaceOrder.groupBy({ by: ["state"], where: { AND: [scope] }, _count: { _all: true } }),
    /* tenant-scope: whereFor(actor, "marketplaceOrder", "read") is the first AND term. */
    prisma.marketplaceOrder.aggregate({ where: { AND: [scope, { state: { in: SPENT_STATES } }] }, _sum: { totalCents: true } }),
  ]);
  return { byTab: Object.fromEntries(tabCounts(byState).map((t) => [t.key, t.count])), spentCents: spent._sum.totalCents ?? 0 };
}
```

Use whatever name the file already gives the Prisma namespace import (it imports `Prisma` types from `../generated/prisma/client`).

- [ ] **Step 4: Wire the routes** in `backend/src/routes/v1/marketplace.ts`. Replace the `orders` handler and add `ordersSummary`, both **exported** for the test. Import `pageRequest, searchTerm` from `../../lib/paging` if they are not already imported, and import `pageMarketplaceOrders, marketplaceOrderSummary` from the domain.

```ts
export const orders: RequestHandler = async (req, res) => {
  const pg = pageRequest(req.query);
  if (pg) {
    res.json(await pageMarketplaceOrders(req.actor!, pg, { tab: typeof req.query.tab === "string" ? req.query.tab : undefined, q: searchTerm(req.query) }));
    return;
  }
  const state = typeof req.query.state === "string" ? (req.query.state as Parameters<typeof listMarketplaceOrders>[1]) : undefined;
  res.json({ orders: await listMarketplaceOrders(req.actor!, state) });
};
export const ordersSummary: RequestHandler = async (req, res) => { res.json({ summary: await marketplaceOrderSummary(req.actor!) }); };
```

Register `marketplaceRouter.get("/marketplace-orders/summary", requireActor, ordersSummary);` **before** the `/marketplace-orders/:id` line.

In the registry, extend the `/marketplace-orders` GET summary with: `Paged with ?page (P1-ART-23): ?size ?q (order id or a line title) ?tab=all|waiting|to_pay|in_progress|delivered|cancelled → newest first, \`page\`, and \`tabs: [{ key, label, count }]\` over the scope under q.` Add an entry for `/marketplace-orders/summary`: `{ byTab, spentCents }` over the caller's whole scope.

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd backend && npx vitest run tests/sponsor-lists.paged.test.ts`, then also the existing marketplace order tests: `npx vitest run tests/ -t "marketplace order"`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/marketplace-order.ts backend/src/routes/v1/marketplace.ts backend/src/contracts/registry.ts backend/tests/sponsor-lists.paged.test.ts
git commit -m "feat(P1-ART-23): marketplace orders server-paged, with tabs in plain words and a summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Backend — shop search server-paged

**Files:**
- Modify: `backend/src/domain/marketplace-search.ts`
- Modify: `backend/src/routes/v1/marketplace.ts` (~L219 `search`)
- Modify: `backend/src/contracts/registry.ts` (`/marketplace/search` entry)
- Test: append to `backend/tests/sponsor-lists.paged.test.ts`

The per-sponsor restriction filter (`hidden`) runs after the query, so a database `skip/take` alone would page the wrong rows. The paged mode therefore reads a **thin** candidate list (ids plus owner fields, same WHERE and ORDER), removes the hidden ones, counts what is left, slices one page of ids, and only then reads the full rows for that page.

- [ ] **Step 1: Add failing tests** to `backend/tests/sponsor-lists.paged.test.ts` (also import `search` from the marketplace routes):

```ts
describe("GET /marketplace/search · paged", () => {
  it("without ?page the old capped list, no page", async () => {
    const body = await run(search, sponsor);
    expect(body.page).toBeUndefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("pages the visible ids: total is after the sponsor's restrictions, the page reads only its ids, in order", async () => {
    impl["sponsor.findFirst"] = () => ({ categories: [] });
    impl["listing.findMany"] = (a) =>
      a.select?.item?.select?.priceCents
        ? a.where.id.in.map((id: string) => ({ id, title: id, description: "", publishedAt: null, tenantId: "t_slp1", property: null, sellerAthleteId: "ath1", item: { id: "i", kind: "SOCIAL", priceCents: 1, quantity: 1, availableFrom: null, availableUntil: null, categories: [], packageRules: null, athleteId: "ath1", propertyId: null, restrictedCategories: [], athlete: null } })).reverse()
        : Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, tenantId: "t_slp1", item: { athleteId: null, propertyId: null, athlete: null } }));
    const body = await run(search, sponsor, { page: "2", size: "12" });
    expect(body.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `l${12 + i}`));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx vitest run tests/sponsor-lists.paged.test.ts -t search`
Expected: the second test FAILs (no `page`).

- [ ] **Step 3: Refactor `marketplace-search.ts`.** Extract the shared parts of `searchMarketplace` into three helpers:
- `catalogueScope(actor)`: returns `{ categories, where }`, where `where` is the `AND` list it builds today, minus `filtersWhere`.
- `hiddenIds(rows, categories, now)`: the restriction block; takes rows with `{ id, tenantId, item: { athleteId, propertyId, athlete: { propertyId } | null } }`.
- `toResult(row)`: the final `.map`.

`searchMarketplace` keeps its exact behaviour and output, rebuilt on the helpers. Then add:

```ts
const THIN = { id: true, tenantId: true, item: { select: { athleteId: true, propertyId: true, athlete: { select: { propertyId: true } } } } } as const;

/** P1-ART-23 — the shop, server-paged: the visible ids are counted and sliced
 *  in order, then only the page's rows are read in full. */
export async function searchMarketplacePage(actor: Actor, f: SearchFilters, req: PageRequest) {
  const now = new Date();
  const { categories, where } = await catalogueScope(actor, now);
  const order = [{ publishedAt: "desc" as const }, { id: "asc" as const }];
  const thin = await prisma.listing.findMany({
    /* tenant-scope: whereFor(actor, "listing", "read") leads `where` (catalogueScope). */
    where: { AND: [...where, ...filtersWhere(f)] }, select: THIN, orderBy: order,
  });
  const hidden = await hiddenIds(thin, categories, now);
  const visible = thin.filter((r) => !hidden.has(r.id)).map((r) => r.id);
  const at = clampPage(req, visible.length);
  const ids = visible.slice(at.skip, at.skip + at.take);
  const rows = ids.length
    ? await prisma.listing.findMany({
        /* tenant-scope: ids admitted by the scoped read above. */
        where: { id: { in: ids } }, select: SELECT,
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { results: ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map(toResult), page: pageInfo(at, visible.length) };
}
```

Import `clampPage, pageInfo, type PageRequest` from `../lib/paging`.

- [ ] **Step 4: Route.** In `marketplace.ts`, export the `search` handler:

```ts
export const search: RequestHandler = async (req, res) => {
  const pg = pageRequest(req.query);
  const f = SearchQuery.parse(req.query);
  res.json(pg ? await searchMarketplacePage(req.actor!, f, pg) : { results: await searchMarketplace(req.actor!, f) });
};
```

If `SearchQuery` is strict (`.strict()`), add `page` / `size` as optional to it in `backend/src/contracts/`. Update the registry summary: `Paged with ?page (P1-ART-23): ?size → \`page\` with the total after the sponsor's restrictions; without ?page the old capped list.`

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd backend && npx vitest run tests/sponsor-lists.paged.test.ts`, plus the existing search tests: `npx vitest run tests/ -t search`.
Expected: PASS. Then run `npm run lint -w @sponsorx/backend` from the root.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/marketplace-search.ts backend/src/routes/v1/marketplace.ts backend/src/contracts/registry.ts backend/tests/sponsor-lists.paged.test.ts
git commit -m "feat(P1-ART-23): the shop's search server-paged after the sponsor's restrictions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — the plain-words map

**Files:**
- Create: `frontend/src/lib/sponsor-words.ts`
- Test: `frontend/tests/sponsor-words.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { briefWord, campaignWord, deliverableWord, orderWord, sourceWord, delta, compactNumber } from "@/lib/sponsor-words";

describe("sponsor words — plain language, never an enum", () => {
  it("campaign states", () => {
    expect(campaignWord("ACTIVE")).toEqual({ text: "Running", tone: "live" });
    expect(campaignWord("APPROVAL")).toEqual({ text: "Needs your OK", tone: "you" });
    expect(campaignWord("COMPLETED")).toEqual({ text: "Finished", tone: "done" });
    expect(campaignWord("SOMETHING_NEW").text).toBe("Something new");
  });
  it("orders, briefs, deliverables and sources", () => {
    expect(orderWord("AWAITING_PAYMENT")).toEqual({ text: "Ready to pay", tone: "you" });
    expect(orderWord("IN_DELIVERY").text).toBe("In progress");
    expect(briefWord("QUALIFIED").text).toBe("Being matched by BTG");
    expect(deliverableWord("SPONSOR_REVIEW")).toEqual({ text: "Waiting for your OK", tone: "you" });
    expect(sourceWord("VERIFIED_API", "Instagram")).toBe("Checked with Instagram");
    expect(sourceWord("SELF_REPORTED")).toBe("Reported by the athlete");
  });
  it("delta: a fraction of the previous figure, null when there is nothing to compare", () => {
    expect(delta(118, 100)).toBeCloseTo(0.18);
    expect(delta(5, 0)).toBeNull();
    expect(delta(5, null)).toBeNull();
  });
  it("compact numbers for tight tiles", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(54_100)).toBe("54.1k");
    expect(compactNumber(2_400_000)).toBe("2.4M");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run tests/sponsor-words.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `frontend/src/lib/sponsor-words.ts`**

```ts
/* --------------------------------------------------------------------------
   Sponsor words (P1-ART-23) — every status a sponsor page shows, in plain
   language. Pages never print a raw enum: a non-technical sponsor reads
   "Needs your OK", not APPROVAL. Each word carries the chip tone the
   Stadium Board paints it with (colour + word, never colour alone).
   -------------------------------------------------------------------------- */

export type WordTone = "live" | "you" | "late" | "done" | "info";
export type Word = { text: string; tone: WordTone };

/** An unknown enum still reads as words: "SOMETHING_NEW" → "Something new". */
const humanize = (s: string) => {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const pick = (map: Record<string, Word>, key: string): Word => map[key] ?? { text: humanize(key), tone: "info" };

const CAMPAIGN: Record<string, Word> = {
  DRAFT: { text: "Being set up", tone: "info" },
  STAFFING: { text: "Finding athletes", tone: "info" },
  APPROVAL: { text: "Needs your OK", tone: "you" },
  ACTIVE: { text: "Running", tone: "live" },
  REPORTING: { text: "Wrapping up", tone: "info" },
  COMPLETED: { text: "Finished", tone: "done" },
  CANCELLED: { text: "Cancelled", tone: "done" },
};
const BRIEF: Record<string, Word> = {
  DRAFT: { text: "Draft", tone: "info" },
  QUALIFIED: { text: "Being matched by BTG", tone: "info" },
  APPROVED: { text: "Ready for you", tone: "you" },
  CAMPAIGN_CREATED: { text: "Became a campaign", tone: "live" },
  CLOSED: { text: "Closed", tone: "done" },
};
const ORDER: Record<string, Word> = {
  PENDING_SELLER: { text: "Waiting for approval", tone: "info" },
  PENDING_APPROVAL: { text: "Waiting for approval", tone: "info" },
  APPROVED: { text: "Ready to pay", tone: "you" },
  AWAITING_PAYMENT: { text: "Ready to pay", tone: "you" },
  PAID: { text: "In progress", tone: "live" },
  IN_DELIVERY: { text: "In progress", tone: "live" },
  FULFILLED: { text: "Delivered", tone: "done" },
  CLOSED: { text: "Delivered", tone: "done" },
  CANCELLED: { text: "Cancelled", tone: "done" },
  REFUNDED: { text: "Refunded", tone: "done" },
};
const DELIVERABLE: Record<string, Word> = {
  NOT_STARTED: { text: "Not started", tone: "info" },
  IN_PROGRESS: { text: "Being made", tone: "info" },
  DRAFT_SUBMITTED: { text: "Being checked", tone: "info" },
  BTG_REVIEW: { text: "Being checked by BTG", tone: "info" },
  SPONSOR_REVIEW: { text: "Waiting for your OK", tone: "you" },
  REVISION_REQUESTED: { text: "Changes asked for", tone: "info" },
  APPROVED: { text: "Approved", tone: "live" },
  PUBLISHED: { text: "Posted", tone: "live" },
  VERIFIED: { text: "Posted & checked", tone: "done" },
};

export const campaignWord = (s: string) => pick(CAMPAIGN, s);
export const briefWord = (s: string) => pick(BRIEF, s);
export const orderWord = (s: string) => pick(ORDER, s);
export const deliverableWord = (s: string) => pick(DELIVERABLE, s);

/** Where a number came from, for the "How sure are we?" panel. */
export function sourceWord(source: string, platform?: string): string {
  switch (source) {
    case "VERIFIED_API": return `Checked with ${platform ?? "the platform"}`;
    case "VERIFIED_MANUAL": return "Checked by BTG";
    case "SELF_REPORTED": return "Reported by the athlete";
    case "ESTIMATED": return "Estimate";
    case "ATTRIBUTED": return "Linked to your campaign";
    default: return humanize(source);
  }
}

/** The fan journey's steps, in order. */
export const FUNNEL_WORDS = { scan: "Scanned QR", landing: "Opened offer", claim: "Claimed", redeem: "Redeemed" } as const;

/** Change against the previous window as a fraction (0.18 = +18%); null when there is nothing to compare. */
export function delta(now: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null;
  return (now - prev) / prev;
}

/** 54100 → "54.1k"; for tiles where the full figure is in the tooltip / sr text. */
export function compactNumber(n: number): string {
  const f = (v: number, s: string) => `${(Math.round(v * 10) / 10).toLocaleString("en-US")}${s}`;
  if (Math.abs(n) >= 1_000_000) return f(n / 1_000_000, "M");
  if (Math.abs(n) >= 10_000) return f(n / 1_000, "k");
  return Math.round(n).toLocaleString("en-US");
}
```

Before committing, check every `DeliverableState` value in `backend/prisma/schema.prisma` and give each one a word in `DELIVERABLE`. Add any states missing from the list above.

- [ ] **Step 4: Run the test and make sure it passes**

Run: `cd frontend && npx vitest run tests/sponsor-words.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sponsor-words.ts frontend/tests/sponsor-words.test.ts
git commit -m "feat(P1-ART-23): sponsor words — every status in plain language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — the Stadium Board skin (`stadium.css`)

**Files:**
- Create: `frontend/src/app/(app)/sponsor/stadium.css`

Model it on the `.sx-arena` block in `frontend/src/app/globals.css` (L2810–3208; read it first) and on the `.sx-ops` token pinning (L2254–2278). **Do not edit `globals.css`.** Its existing keyframes (`sx-row-sweep`) and classes (`sx-pop`, `sx-drawer-out`, `sx-table`, `sx-shell-aside`, `sx-nav-head`, `sx-nav-tile`, `sx-nav-track`) may be referenced.

- [ ] **Step 1: Write the file**

```css
/* --------------------------------------------------------------------------
   The Stadium Board — the sponsor portal's stage (P1-ART-23, 2026-10-11).

   Admin is Mission Control (steel HUD, chamfers), the athlete is the Arena
   (blue, rounded plates, speed bars). The sponsor's stage is the LED board
   round a stadium — where a sponsor's logo actually appears: fixed dark,
   sponsor orange as LIGHT, 6px LED panels with a hairline and faint
   scan-lines, glowing upright numerals, a scrolling ticker, a dot-matrix band
   along the bottom, and a "power on" entrance (a panel flicks on).
   Attention is a FILLED, pulsing badge — orange already means the brand.
   Never a chamfer, bracket, grid, speed bar or lane here.
   Reduced motion: the board is lit and still; the ticker stops and wraps.
   Kept out of globals.css on purpose (other work in flight there).
   -------------------------------------------------------------------------- */

.sx-stadium {
  /* pinned dark, like .sx-ops — a night stadium for every theme */
  --sx-bg: #0b0a09;
  --sx-surface: #15110e;
  --sx-surface-2: #1c1511;
  --sx-line: #33251b;
  --sx-line-soft: #241a13;
  --sx-text: #f7f2ed;
  --sx-text-muted: #aaa29a;
  --sx-text-faint: #8c847b;
  --sx-primary: #f97a1f;
  --sx-primary-soft: #ffb27a;
  --sx-accent: #f97a1f;
  --sx-accent-soft: #ffb27a;
  --sx-sponsor: #f97a1f;
  --sx-cta-ink: #1a0d03;
  --sx-danger: #ff5a5f;
  --sx-warn: #facc15;
  --sx-success: #3ddc97;
  color-scheme: dark;
  color: #f7f2ed;

  --st: #f97a1f;
  --st-hot: #ffb27a;
  --st-glow: color-mix(in srgb, #f97a1f 55%, transparent);
  --st-line: color-mix(in srgb, #f97a1f 24%, #33251b);
  --st-wash: color-mix(in srgb, #f97a1f 9%, transparent);
  --st-plate: linear-gradient(180deg, #18120d, #0f0c0a);
  --st-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ground ------------------------------------------------------------------ */
.sx-stadium-stage {
  background:
    radial-gradient(60% 42% at 10% 0%, color-mix(in srgb, #f97a1f 20%, transparent), transparent 62%),
    radial-gradient(40% 30% at 100% 100%, color-mix(in srgb, #f97a1f 9%, transparent), transparent 60%),
    var(--sx-bg);
}
.sx-stadium-light {
  background: radial-gradient(520px circle at var(--px, -999px) var(--py, -999px), color-mix(in srgb, #f97a1f 10%, transparent), transparent 70%);
  opacity: 0;
  transition: opacity 0.5s ease;
}
[data-sx-ops][data-lit] > .sx-stadium-ground .sx-stadium-light { opacity: 1; }
/* the dot-matrix band — an LED board's pixels along the bottom edge */
.sx-stadium-dots {
  position: absolute;
  inset: auto 0 0 0;
  height: 120px;
  background: radial-gradient(circle, color-mix(in srgb, #f97a1f 38%, transparent) 1.1px, transparent 1.6px) 0 0 / 9px 9px;
  mask-image: linear-gradient(180deg, transparent, #000 70%);
  opacity: 0.35;
}
.sx-stadium-hum {
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--st), transparent);
  box-shadow: 0 0 18px var(--st);
  opacity: 0.6;
}

/* the ticker -------------------------------------------------------------- */
.sx-stadium-ticker {
  position: relative;
  overflow: hidden;
  border-block: 1px solid color-mix(in srgb, #f97a1f 38%, transparent);
  background: repeating-linear-gradient(90deg, color-mix(in srgb, #f97a1f 8%, transparent) 0 2px, transparent 2px 4px), #120c07;
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
}
.sx-stadium-ticker-track {
  display: inline-flex;
  gap: 2.5rem;
  white-space: nowrap;
  padding: 0.55rem 0;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--st-hot);
  text-shadow: 0 0 8px color-mix(in srgb, #f97a1f 80%, transparent);
  animation: sx-stadium-tick var(--sx-tick, 32s) linear infinite;
}
.sx-stadium-ticker:hover .sx-stadium-ticker-track { animation-play-state: paused; }
.sx-stadium-ticker-track > span::before { content: "●"; margin-right: 0.6rem; color: var(--st); }
@keyframes sx-stadium-tick { to { transform: translate3d(-50%, 0, 0); } }

/* entrance: power on ------------------------------------------------------ */
@keyframes sx-stadium-on {
  0% { opacity: 0; filter: brightness(0.4); transform: translate3d(0, 6px, 0); }
  40% { opacity: 1; filter: brightness(1.6); }
  55% { filter: brightness(0.8); }
  70% { filter: brightness(1.25); }
  100% { opacity: 1; filter: none; transform: none; }
}
@keyframes sx-stadium-drop { from { opacity: 0; transform: translate3d(0, -6px, 0); } }
@keyframes sx-stadium-grow { from { transform: scaleX(0); } }
.sx-stadium-in { animation: sx-stadium-on 0.85s var(--st-ease) var(--sx-reveal-delay, 0s) backwards; }
.sx-stadium-row { animation: sx-stadium-drop 0.45s var(--st-ease) var(--sx-reveal-delay, 0s) backwards; }
.sx-stadium-grow { transform-origin: left; animation: sx-stadium-grow 1s var(--st-ease) var(--sx-reveal-delay, 0s) backwards; }

/* LED panels -------------------------------------------------------------- */
.sx-stadium-panel {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid var(--st-line);
  background: var(--st-plate);
  box-shadow: 0 1px 0 color-mix(in srgb, #fff 4%, transparent) inset, 0 18px 40px -24px rgba(0, 0, 0, 0.8);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s var(--st-ease);
}
.sx-stadium-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, color-mix(in srgb, #fff 2.5%, transparent) 0 1px, transparent 1px 3px);
}
.sx-stadium-panel[data-spot]::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(260px circle at var(--mx, -999px) var(--my, -999px), color-mix(in srgb, #f97a1f 14%, transparent), transparent 70%);
}
a.sx-stadium-panel:hover,
.sx-stadium-panel:has(> a.sx-stadium-cover:hover),
.sx-stadium-panel:has(> a.sx-stadium-cover:focus-visible) {
  border-color: color-mix(in srgb, #f97a1f 60%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #f97a1f 30%, transparent), 0 0 28px -6px var(--st-glow);
  transform: translate3d(0, -2px, 0);
}
.sx-stadium-panel[data-tone="you"] { border-color: color-mix(in srgb, #f97a1f 55%, transparent); }
.sx-stadium-panel[data-tone="late"] { border-color: color-mix(in srgb, #ff5a5f 45%, transparent); }
/* a link that covers a whole tile, so hints inside it stay real buttons */
.sx-stadium-cover { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.sx-stadium-cover:focus-visible { outline: 2px solid var(--st); outline-offset: 2px; }

/* numerals: lit */
.sx-stadium-num {
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: #fff4ea;
  text-shadow: 0 0 14px color-mix(in srgb, #f97a1f 55%, transparent), 0 0 2px color-mix(in srgb, #f97a1f 40%, transparent);
}

/* titles */
.sx-stadium .sx-page-title { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.01em; }
.sx-stadium .sx-section-title { display: inline-flex; align-items: center; gap: 0.55rem; font-size: 0.95rem; font-weight: 700; }
.sx-stadium .sx-section-title::before { content: ""; width: 6px; height: 6px; border-radius: 1px; background: var(--st); box-shadow: 0 0 10px var(--st); }

/* the "Updated" pill, with a live dot */
.sx-stadium-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, #f97a1f 40%, transparent);
  background: color-mix(in srgb, #f97a1f 12%, transparent);
  padding: 0.15rem 0.6rem;
  font-size: 11px;
  color: var(--st-hot);
}
.sx-stadium-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #3ddc97; box-shadow: 0 0 8px #3ddc97; animation: sx-stadium-blink 2.4s ease-in-out infinite; }
@keyframes sx-stadium-blink { 50% { opacity: 0.35; } }

/* the share bar */
.sx-stadium-bar { display: block; height: 6px; overflow: hidden; border-radius: 3px; background: #2a1a0e; }
.sx-stadium-bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f97a1f, #ffc98f); box-shadow: 0 0 10px #f97a1f; }
.sx-stadium-bar > span[data-tone="live"] { background: linear-gradient(90deg, #3ddc97, #a7f3d0); box-shadow: 0 0 10px #3ddc97; }
.sx-stadium-bar > span[data-tone="late"] { background: linear-gradient(90deg, #ff5a5f, #fca5a5); box-shadow: 0 0 10px #ff5a5f; }

/* attention: the filled, pulsing badge */
.sx-stadium-badge {
  display: inline-grid;
  min-width: 1.5rem;
  place-items: center;
  border-radius: 9999px;
  background: var(--st);
  padding: 0 0.45rem;
  font-size: 11.5px;
  font-weight: 800;
  color: #1a0d03;
  box-shadow: 0 0 12px var(--st-glow);
  animation: sx-stadium-pulse 2.2s ease-in-out infinite;
}
.sx-stadium-badge[data-zero] { background: color-mix(in srgb, #fff 8%, transparent); color: var(--sx-text-muted); box-shadow: none; animation: none; }
@keyframes sx-stadium-pulse { 50% { box-shadow: 0 0 22px var(--st), 0 0 2px var(--st); } }

/* the "?" explainer */
.sx-stadium-q {
  position: relative;
  z-index: 2;
  display: inline-grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, #fff 22%, transparent);
  font-size: 10px;
  font-weight: 700;
  color: var(--sx-text-muted);
  transition: border-color 0.2s ease, color 0.2s ease;
}
.sx-stadium-q:hover, .sx-stadium-q:focus-visible, .sx-stadium-q[aria-expanded="true"] { border-color: var(--st); color: #fff; outline: none; }
.sx-stadium-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 40;
  width: max-content;
  max-width: 15rem;
  transform: translateX(-50%);
  border-radius: 8px;
  border: 1px solid var(--st-line);
  background: #1c1511;
  padding: 0.5rem 0.65rem;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.4;
  text-transform: none;
  color: var(--sx-text);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55), 0 0 24px -8px var(--st-glow);
}

/* status steps */
.sx-stadium-steps { display: flex; gap: 0.35rem; }
.sx-stadium-steps > li { flex: 1; min-width: 0; font-size: 11px; color: var(--sx-text-faint); }
.sx-stadium-steps > li::before { content: ""; display: block; height: 5px; margin-bottom: 0.4rem; border-radius: 3px; background: #2a1a0e; }
.sx-stadium-steps > li[data-done]::before { background: var(--st); box-shadow: 0 0 8px var(--st); }
.sx-stadium-steps > li[data-now] { color: #fff; font-weight: 600; }
.sx-stadium-steps > li[data-now]::before { background: linear-gradient(90deg, var(--st), #ffc98f); box-shadow: 0 0 12px var(--st); animation: sx-stadium-blink 2.4s ease-in-out infinite; }

/* the trend chart */
.sx-stadium-trend-line { filter: drop-shadow(0 0 6px #f97a1f); }

/* shared components, re-skinned ------------------------------------------- */
.sx-stadium .sx-card { border-radius: 6px; border-color: var(--st-line); background: linear-gradient(180deg, #18120d, #0f0c0a); }
.sx-stadium .sx-stat { border-radius: 6px; border-color: var(--st-line); }
.sx-stadium .sx-table-wrap { border-radius: 6px; border-color: var(--st-line); background: linear-gradient(180deg, #18120d, #0f0c0a); }
.sx-stadium .sx-table th { color: var(--sx-text-muted); border-bottom-color: color-mix(in srgb, #f97a1f 28%, transparent); }
.sx-stadium .sx-table td { border-top-color: var(--sx-line-soft); }
.sx-stadium .sx-table tbody tr { animation: sx-stadium-drop 0.45s var(--st-ease) calc(var(--i, 0) * 35ms) backwards; }
.sx-stadium .sx-table tbody tr:hover { background: var(--st-wash); }
.sx-stadium a.bg-primary, .sx-stadium button.bg-primary {
  color: #1a0d03;
  font-weight: 700;
  box-shadow: 0 0 18px -2px var(--st-glow);
  transition: box-shadow 0.25s ease, transform 0.25s var(--st-ease), filter 0.25s ease;
}
.sx-stadium a.bg-primary:hover, .sx-stadium button.bg-primary:not(:disabled):hover { box-shadow: 0 0 28px var(--st-glow); transform: translate3d(0, -1px, 0); filter: brightness(1.06); }
.sx-stadium .rounded-lg.border.border-line.bg-surface.p-1 { border-color: var(--st-line); background: #120c07; }
.sx-stadium .rounded-lg.border.border-line.bg-surface.p-1 > a[aria-current="page"] { background: color-mix(in srgb, #f97a1f 20%, transparent); color: #fff; box-shadow: inset 0 0 0 1px color-mix(in srgb, #f97a1f 45%, transparent); }
.sx-stadium .sx-drawer-out, .sx-stadium [role="dialog"] > .sx-pop { border-color: var(--st-line); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 60px color-mix(in srgb, #f97a1f 12%, transparent); }
.sx-stadium .sx-shell-aside { border-right-color: var(--st-line); }
.sx-stadium .sx-shell-header { background: color-mix(in srgb, #15110e 78%, transparent); }
.sx-stadium .sx-nav-head[data-holds] .sx-nav-tile { box-shadow: 0 0 16px var(--st-glow); }
.sx-stadium .sx-nav-track { border-color: color-mix(in srgb, #f97a1f 30%, var(--sx-line)); }

/* loading */
.sx-stadium-ghost { position: relative; overflow: hidden; background: #15110e; }
.sx-stadium-ghost::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, #f97a1f 10%, transparent), transparent);
  animation: sx-stadium-sweep 1.4s ease-in-out infinite;
}
@keyframes sx-stadium-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

@media (prefers-reduced-motion: reduce) {
  .sx-stadium-in, .sx-stadium-row, .sx-stadium-grow, .sx-stadium .sx-table tbody tr { animation: none; }
  .sx-stadium-ticker-track { animation: none; flex-wrap: wrap; white-space: normal; row-gap: 0.25rem; }
  .sx-stadium-ticker-track > [data-dup] { display: none; }
  .sx-stadium-badge, .sx-stadium-pill::before, .sx-stadium-steps > li[data-now]::before, .sx-stadium-ghost::after { animation: none; }
  a.sx-stadium-panel:hover, .sx-stadium-panel:has(> a.sx-stadium-cover:hover) { transform: none; }
}
```

- [ ] **Step 2: Commit** (it is imported in Task 7)

```bash
git add "frontend/src/app/(app)/sponsor/stadium.css"
git commit -m "feat(P1-ART-23): the Stadium Board skin — LED panels, ticker, power-on entrance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — the stadium kit (components)

**Files:**
- Create: `frontend/src/components/stadium-stage.tsx`
- Create: `frontend/src/components/stadium-hint.tsx`
- Create: `frontend/src/components/stadium-trend.tsx`
- Test: `frontend/tests/stadium-trend.test.ts` (the pure path maths)

- [ ] **Step 1: Write the failing test** `frontend/tests/stadium-trend.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { trendPath } from "@/components/stadium-trend";

describe("trendPath", () => {
  it("maps values across the width and up from the floor, max at the top pad", () => {
    const { line, area, max } = trendPath([0, 5, 10], 200, 100, 10);
    expect(max).toBe(10);
    expect(line).toBe("M0,100 L100,55 L200,10");
    expect(area).toBe("M0,100 L100,55 L200,10 L200,100 L0,100 Z");
  });
  it("all zeros is a flat floor line, not NaN", () => {
    const { line } = trendPath([0, 0], 100, 50, 5);
    expect(line).toBe("M0,50 L100,50");
  });
  it("one point is centred", () => {
    expect(trendPath([4], 100, 50, 5).line).toBe("M50,5");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run tests/stadium-trend.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: `frontend/src/components/stadium-hint.tsx`**

```tsx
"use client";

/* The "?" explainer (P1-ART-23): one plain sentence about a number, on
   hover, focus or tap. A real button (never inside a link — tiles that link
   use a covering <a> beside it). Escape and a tap elsewhere close it. */

import { useEffect, useId, useRef, useState } from "react";

export function StadiumHint({ label, text }: { /** What the number is called ("People reached"). */ label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="sx-stadium-q"
        aria-label={`What is “${label}”?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="sx-pop sx-stadium-tip">
          {text}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: `frontend/src/components/stadium-trend.tsx`**

```tsx
"use client";

/* --------------------------------------------------------------------------
   The big chart (P1-ART-23): reach, clicks or redemptions over the chosen
   window, from the overview's zero-filled `daily` series. A glowing line
   over an orange wash; hover, touch or ←/→ move a crosshair with the day's
   figure in words. Hand-drawn SVG like charts.tsx — no chart library.
   -------------------------------------------------------------------------- */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

export type TrendPoint = { day: string; views: number; clicks: number; redeems: number };
type Metric = "views" | "clicks" | "redeems";
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "views", label: "People reached", unit: "people" },
  { key: "clicks", label: "Link clicks", unit: "clicks" },
  { key: "redeems", label: "Fans who redeemed", unit: "redeemed" },
];

/** Pure: the line and area paths for `values` in a w×h box, `pad` at the top. */
export function trendPath(values: number[], w: number, h: number, pad: number) {
  const max = Math.max(0, ...values);
  const x = (i: number) => (values.length === 1 ? w / 2 : Math.round((i / (values.length - 1)) * w));
  const y = (v: number) => (max === 0 ? h : Math.round(h - (v / max) * (h - pad)));
  const pts = values.map((v, i) => `${x(i)},${y(v)}`);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p}`).join(" ");
  const area = values.length > 1 ? `${line} L${x(values.length - 1)},${h} L0,${h} Z` : "";
  return { line, area, max, x, y };
}

const fmtDay = (iso: string, week: boolean) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const s = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return week ? `Week of ${s}` : s;
};

export function StadiumTrend({ points, bucket }: { points: TrendPoint[]; bucket: "day" | "week" }) {
  const [metric, setMetric] = useState<Metric>("views");
  const [at, setAt] = useState<number | null>(null);
  const gid = useId();
  const W = 600;
  const H = 190;
  const values = useMemo(() => points.map((p) => p[metric]), [points, metric]);
  const { line, area, max, x, y } = trendPath(values, W, H, 18);
  const m = METRICS.find((k) => k.key === metric)!;
  const total = values.reduce((n, v) => n + v, 0);

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    setAt(Math.max(0, Math.min(points.length - 1, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setAt((i) => {
      const cur = i ?? points.length - 1;
      return Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  };
  const p = at !== null ? points[at] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sx-section-title">Over time</h2>
        <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-[color:var(--st-line)] text-[12px]">
          {METRICS.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={metric === k.key}
              onClick={() => setMetric(k.key)}
              className={`px-2.5 py-1.5 transition-colors ${metric === k.key ? "bg-sponsor/20 text-text" : "text-muted hover:text-text"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {max === 0 ? (
        <p className="grid h-[190px] place-items-center text-sm text-muted">Nothing recorded in this period yet.</p>
      ) : (
        <div
          tabIndex={0}
          role="img"
          aria-label={`${m.label}: ${total.toLocaleString("en-US")} over ${points.length} ${bucket === "week" ? "weeks" : "days"}. Use the arrow keys to read each ${bucket}.`}
          onKeyDown={key}
          onBlur={() => setAt(null)}
          className="relative mt-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--st)]"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[190px] w-full touch-none" onPointerMove={move} onPointerLeave={() => setAt(null)}>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f97a1f" stopOpacity="0.42" />
                <stop offset="1" stopColor="#f97a1f" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.06)" />
            ))}
            {area && <path d={area} fill={`url(#${gid})`} />}
            <path d={line} fill="none" stroke="#f97a1f" strokeWidth="2.4" vectorEffect="non-scaling-stroke" className="sx-stadium-trend-line" />
            {p && at !== null && (
              <>
                <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="rgba(255,178,122,.45)" vectorEffect="non-scaling-stroke" />
                <circle cx={x(at)} cy={y(values[at]!)} r="5" fill="#fff" stroke="#f97a1f" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          {p && at !== null && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute top-1 rounded-md border border-[color:var(--st-line)] bg-[#1c1511] px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left: `clamp(0px, calc(${(x(at) / W) * 100}% - 60px), calc(100% - 130px))` }}
            >
              <span className="block text-muted">{fmtDay(p.day, bucket === "week")}</span>
              <span className="block text-[13px] font-bold text-text">
                {values[at]!.toLocaleString("en-US")} {m.unit}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `frontend/src/components/stadium-stage.tsx`.** These are server components that mirror `arena-stage.tsx`'s API. Reuse `ArenaCount` from `./arena-fx`.

```tsx
/* --------------------------------------------------------------------------
   The Stadium Board — the sponsor portal's stage (P1-ART-23, 2026-10-11).

   Same dashboard anatomy as the admin desks and the athlete arena (memory:
   admin-desks-are-dashboards): a small title with an "Updated" pill, a row
   of KPI panels, then the work. Drawn as the LED boards round a stadium
   (stadium.css). Every figure is one of the page's own reads (memory:
   stats-must-be-retrievable); every word is plain (lib/sponsor-words.ts).

   - StadiumGround   the glow, the dot-matrix band, the pointer light.
   - StadiumTicker   the scrolling LED strip of live facts (dashboard).
   - StadiumHead     title, pill, actions; the KPI row as children.
   - StadiumTiles / StadiumTile   KPI panels: count-up, change, sparkline,
                     share bar, "?" hint; a covering link when `href`.
   - StadiumPanel / StadiumSection   a panel; a section's title row.
   - StadiumChip     a status word in its tone.  StadiumBadge  a count that
                     waits on the sponsor (filled, pulsing).
   - StadiumSteps    where a thing stands, in plain steps.
   - StadiumBar      a share bar.  StadiumRow  a lined list row.
   - StadiumRange    the 7 / 30 / 90 days / All time switch (links).
   - StadiumGhost    the loading screen.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";
import { StadiumHint } from "./stadium-hint";
import type { WordTone } from "@/lib/sponsor-words";

export const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

export function StadiumGround() {
  return (
    <div aria-hidden="true" className="sx-stadium-ground pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sx-stadium-hum" />
      <div className="sx-stadium-dots" />
      <div className="sx-stadium-light absolute inset-0" />
    </div>
  );
}

/** The LED strip. `facts` already in plain words; empty → nothing rendered. */
export function StadiumTicker({ facts }: { facts: string[] }) {
  if (!facts.length) return null;
  const seconds = Math.max(18, facts.join(" ").length * 0.22);
  return (
    <section aria-label="Live now" className="sx-stadium-ticker -mx-5 -mt-8 mb-6 sm:-mx-8 lg:-mx-10 lg:-mt-10">
      <ul className="sr-only">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <div aria-hidden="true" className="sx-stadium-ticker-track" style={{ "--sx-tick": `${seconds}s` } as CSSProperties}>
        {facts.map((f, i) => (
          <span key={`a${i}`}>{f}</span>
        ))}
        {facts.map((f, i) => (
          <span key={`b${i}`} data-dup="">
            {f}
          </span>
        ))}
      </div>
    </section>
  );
}

/** "Updated 9:41 AM" from an ISO read time. */
export const updatedAt = (iso: string) => `Updated ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

export function StadiumHead({ title, pill, actions, children }: { title: string; pill?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header>
      <div className="sx-stadium-in flex flex-wrap items-center gap-3" style={at(0.04)}>
        <h1 className="sx-page-title">{title}</h1>
        {pill && <span className="sx-stadium-pill">{pill}</span>}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function StadiumTiles({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "lg:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5" }[cols];
  return <dl className={`mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${grid}`}>{children}</dl>;
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${Math.round((i / (values.length - 1)) * 100)},${Math.round(24 - (v / max) * 20)}`).join(" ");
  return (
    <svg aria-hidden="true" viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-2 h-6 w-full">
      <path d={d} fill="none" stroke="#f97a1f" strokeWidth="1.6" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 3px #f97a1f)" }} />
    </svg>
  );
}

/** A KPI panel. `delta` is a fraction (0.18 = ▲ 18%), null hides it; `spark` a
 *  short series; `share` 0..1 draws the bar; `hint` adds the "?". */
export function StadiumTile({
  label, value, format = "int", caption, delta, deltaLabel = "vs the period before", spark, share, href, hint, tone, delay = 0.1,
}: {
  label: string;
  value: number;
  format?: CountFormat;
  caption?: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  spark?: number[];
  share?: number;
  href?: string;
  hint?: string;
  tone?: "you" | "late";
  delay?: number;
}) {
  const up = delta !== undefined && delta !== null && delta >= 0;
  return (
    <div data-spot="" data-tone={tone} className="sx-stadium-panel sx-stadium-in group px-4 pb-3.5 pt-3.5" style={at(delay)}>
      {href && <Link href={href} className="sx-stadium-cover" aria-label={`${label} — open`} />}
      <dt className="flex items-center gap-1.5 text-[12px] text-muted">
        {label}
        {hint && <StadiumHint label={label} text={hint} />}
      </dt>
      <dd className="mt-1">
        <ArenaCount value={value} format={format} delay={delay} className="sx-stadium-num block text-[28px] leading-tight" />
        {delta !== undefined && delta !== null && (
          <span className="mt-1 block text-[11.5px] text-faint">
            <span className={up ? "text-success" : "text-danger"}>
              {up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
            </span>{" "}
            {deltaLabel}
          </span>
        )}
        {caption && <span className="mt-1 block text-[11.5px] text-faint">{caption}</span>}
        {share !== undefined && (
          <span className="mt-2.5 block">
            <StadiumBar value={share} delay={delay + 0.2} />
          </span>
        )}
        {spark && <Spark values={spark} />}
      </dd>
      {href && (
        <span aria-hidden="true" className="absolute right-3.5 top-3 text-sponsor opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
          →
        </span>
      )}
    </div>
  );
}

export function StadiumPanel({ children, flush = false, delay, tone, className = "" }: { children: ReactNode; flush?: boolean; delay?: number; tone?: "you" | "late"; className?: string }) {
  return (
    <div data-spot="" data-tone={tone} className={`sx-stadium-panel ${delay !== undefined ? "sx-stadium-in" : ""} ${flush ? "" : "p-5"} ${className}`} style={at(delay ?? 0)}>
      {children}
    </div>
  );
}

export function StadiumSection({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="sx-section-title min-w-0">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {action}
    </div>
  );
}

const CHIP: Record<WordTone, string> = {
  live: "border-success/35 bg-success/12 text-success",
  you: "border-sponsor bg-sponsor text-[#1a0d03] font-semibold",
  late: "border-danger/40 bg-danger/12 text-danger",
  done: "border-line bg-surface-2 text-muted",
  info: "border-sponsor/35 bg-sponsor/10 text-[color:var(--st-hot)]",
};
export function StadiumChip({ tone = "info", children }: { tone?: WordTone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>;
}

export function StadiumBadge({ count }: { count: number }) {
  return (
    <span className="sx-stadium-badge tabular-nums" data-zero={count === 0 ? "" : undefined}>
      {count}
    </span>
  );
}

export function StadiumBar({ value, tone, delay = 0 }: { value: number; tone?: "live" | "late"; delay?: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span aria-hidden="true" className="sx-stadium-bar">
      <span className="sx-stadium-grow" data-tone={tone} style={at(delay, { width: `${pct}%` })} />
    </span>
  );
}

/** Where something stands: `now` is the index of the current step (-1 = none
 *  yet, steps.length = all done). */
export function StadiumSteps({ steps, now, label }: { steps: string[]; now: number; label: string }) {
  return (
    <ol aria-label={label} className="sx-stadium-steps">
      {steps.map((s, i) => (
        <li key={s} data-done={i < now ? "" : undefined} data-now={i === now ? "" : undefined} aria-current={i === now ? "step" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function StadiumRow({ href, lead, title, sub, right, i = 0 }: { href?: string; lead?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; i?: number }) {
  const inner = (
    <>
      {lead && <span className="grid size-9 shrink-0 place-items-center rounded-md border border-sponsor/30 bg-sponsor/10 text-[12px] font-bold text-[color:var(--st-hot)]">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[11.5px] text-muted">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
      {href && <span aria-hidden="true" className="shrink-0 text-sponsor transition-transform duration-300 group-hover:translate-x-1">→</span>}
    </>
  );
  const cls = "sx-stadium-row flex items-center gap-3 border-b border-line-soft px-5 py-3 last:border-0";
  return href ? (
    <Link href={href} className={`${cls} group transition-colors hover:bg-sponsor/[0.06] focus-visible:bg-sponsor/[0.08] focus-visible:outline-none`} style={at(0.25 + i * 0.04)}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={at(0.25 + i * 0.04)}>
      {inner}
    </div>
  );
}

export const RANGE_OPTIONS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

/** The window switch — links that keep the other params, drop the pages, and omit the default. */
export function StadiumRange({ current, path, params }: { current: RangeKey; path: string; params: Record<string, string | string[] | undefined> }) {
  const href = (key: RangeKey) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "range" && !/page$/.test(k)) u.set(k, v);
    if (key !== "30d") u.set("range", key);
    const s = u.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <nav aria-label="Time period" className="flex overflow-hidden rounded-md border border-[color:var(--st-line)] text-[12px]">
      {RANGE_OPTIONS.map((r) => (
        <Link
          key={r.key}
          href={href(r.key)}
          scroll={false}
          aria-current={current === r.key ? "true" : undefined}
          className={`px-2.5 py-1.5 transition-colors ${current === r.key ? "bg-sponsor/20 text-text" : "text-muted hover:text-text"}`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

export function StadiumGhost({ label = "Loading", tiles = 4, rows = 2 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="sx-stadium-ghost h-7 w-56 rounded-md" />
          <div className="sx-stadium-ghost h-5 w-28 rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sx-stadium-panel sx-stadium-ghost min-h-[110px]" />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sx-stadium-panel sx-stadium-ghost min-h-[13rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests, the typecheck and the linter**

Run: `cd frontend && npx vitest run tests/stadium-trend.test.ts && npx eslint src/components/stadium-stage.tsx src/components/stadium-hint.tsx src/components/stadium-trend.tsx && npx tsc --noEmit`
Expected: the tests PASS; no lint errors; no type errors in the new files. If Tailwind lacks `bg-success/12` or `text-faint`, `arena-stage.tsx` already uses them, so they exist.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/stadium-stage.tsx frontend/src/components/stadium-hint.tsx frontend/src/components/stadium-trend.tsx frontend/tests/stadium-trend.test.ts
git commit -m "feat(P1-ART-23): the stadium kit — KPI panels, ticker, steps, range switch, hint, trend chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Frontend — shell stage, sidebar and loading

**Files:**
- Modify: `frontend/src/components/portal-shell.tsx` (the `stage` prop ~L144–151, toggle ~L270, the stage branch ~L296–313)
- Modify: `frontend/src/components/stage-portals.tsx` (doc comment: also `sx-stadium`)
- Modify: `frontend/src/app/(app)/sponsor/layout.tsx`
- Modify: `frontend/src/app/(app)/sponsor/loading.tsx`
- Modify: `frontend/tests/nav-groups.test.ts`

- [ ] **Step 1: Pin the sponsor nav in a failing test.** Open `frontend/tests/nav-groups.test.ts` and copy its athlete case (it imports the athlete NAV or replicates it; follow whichever it does). Then add:

```ts
describe("sponsor nav (P1-ART-23)", () => {
  it("Dashboard alone on top; Campaigns, Marketplace, Account in work order, desks A to Z", () => {
    const { top, groups } = groupNav(SPONSOR_NAV);
    expect(top.map((i) => i.label)).toEqual(["Dashboard"]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ["Campaigns", ["Campaigns", "Requests"]],
      ["Marketplace", ["Cart", "Orders", "Packages", "Shop"]],
      ["Account", ["Billing", "Messages", "Settings"]],
    ]);
  });
});
```

`SPONSOR_NAV` must be exported. Move the sponsor `NAV` array to `frontend/src/lib/sponsor-nav.ts` as `export const SPONSOR_NAV: NavItem[]` if the athlete test imports from a lib file; if it imports from the layout, export it from the layout instead and follow that precedent.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run tests/nav-groups.test.ts`
Expected: FAIL.

- [ ] **Step 3: The nav.** The order is the order of the work, desks A to Z, one glyph per group (`groupIcon` set on one item), as in `athlete/layout.tsx`:

```ts
export const SPONSOR_NAV: NavItem[] = [
  { href: "/sponsor", label: "Dashboard", icon: "grid" },
  { href: "/sponsor/campaigns", label: "Campaigns", icon: "megaphone", group: "Campaigns", groupIcon: "megaphone" },
  { href: "/sponsor/requests", label: "Requests", icon: "inbox", group: "Campaigns" },
  { href: "/sponsor/cart", label: "Cart", icon: "card", group: "Marketplace", groupIcon: "store" },
  { href: "/sponsor/orders", label: "Orders", icon: "file", group: "Marketplace" },
  { href: "/sponsor/marketplace", label: "Packages", icon: "box", group: "Marketplace" },
  { href: "/sponsor/shop", label: "Shop", icon: "store", group: "Marketplace" },
  { href: "#", label: "Billing", icon: "card", group: "Account", groupIcon: "gear", pending: true },
  { href: "#", label: "Messages", icon: "mail", group: "Account", pending: true },
  { href: "#", label: "Settings", icon: "gear", group: "Account", pending: true },
];
```

Check every `icon` against the icon set `portal-shell.tsx` supports (`inbox`, `box` are used by the athlete nav; if one is missing, pick an existing glyph). Check that `groupNav` places pending items in their group (it takes a `pending` field). If it groups by first appearance rather than the given order, make sure the array order above produces the expected test output.

- [ ] **Step 4: The shell.** In `portal-shell.tsx`:
- the `stage` prop type becomes `boolean | "ops" | "arena" | "stadium"`, with a doc line `P1-ART-23 — "stadium": the sponsor's fixed-dark Stadium Board.`;
- `const stageCls = kind === "ops" ? "sx-ops" : kind === "arena" ? "sx-arena" : kind === "stadium" ? "sx-stadium" : "";`
- the toggle becomes `{kind !== "ops" && kind !== "stadium" && <ThemeToggle />}` (both stages are fixed dark);
- add a branch before the final `: (` fallback:

```tsx
) : kind === "stadium" ? (
  /* The Stadium Board (P1-ART-23): the same root island for the pointer
     light, the sponsor ground, the same column. */
  <OpsStage className="sx-stadium-stage relative isolate flex min-w-0 flex-1 flex-col px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
    <StadiumGround />
    <main className="relative mx-auto w-full max-w-[1440px] min-w-0 flex-1">{children}</main>
  </OpsStage>
```

and import `StadiumGround` from `./stadium-stage`. In `stage-portals.tsx`, update the prop doc to mention `sx-stadium` (sponsor, P1-ART-23).

- [ ] **Step 5: The layout and the loader.** In `sponsor/layout.tsx`, add `import "./stadium.css";` at the top, use `SPONSOR_NAV`, and pass `stage="stadium"` to `PortalShell`. Replace the old comment about "nine items" with one line on the grouped nav. Replace the body of `sponsor/loading.tsx` with:

```tsx
import { StadiumGhost } from "@/components/stadium-stage";

export default function Loading() {
  return <StadiumGhost label="Loading your sponsorships" />;
}
```

- [ ] **Step 6: Run the tests, the linter and the typecheck**

Run: `cd frontend && npx vitest run tests/nav-groups.test.ts && npx eslint src/components/portal-shell.tsx "src/app/(app)/sponsor/layout.tsx" "src/app/(app)/sponsor/loading.tsx" && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 7: Commit** (include `frontend/src/lib/sponsor-nav.ts` if created)

```bash
git add frontend/src/components/portal-shell.tsx frontend/src/components/stage-portals.tsx "frontend/src/app/(app)/sponsor/layout.tsx" "frontend/src/app/(app)/sponsor/loading.tsx" frontend/tests/nav-groups.test.ts
git commit -m "feat(P1-ART-23): the sponsor portal on the Stadium Board — stage, grouped sidebar, loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend — overview read, demo fixture, and the Dashboard

**Files:**
- Create: `frontend/src/lib/sponsor-overview-live.ts`, `frontend/src/server/sponsor-overview.ts`, `frontend/src/lib/fixtures/sponsor-overview.ts`
- Rewrite: `frontend/src/app/(app)/sponsor/page.tsx`
- Test: `frontend/tests/sponsor-overview-live.test.ts`

- [ ] **Step 1: Write the failing test** for the pure helpers:

```ts
import { describe, expect, it } from "vitest";

import { rangeParam, tickerFacts } from "@/lib/sponsor-overview-live";
import { demoOverview } from "@/lib/fixtures/sponsor-overview";

describe("sponsor overview helpers", () => {
  it("rangeParam keeps the four keys, defaults to 30d", () => {
    expect(rangeParam({ range: "7d" })).toBe("7d");
    expect(rangeParam({ range: "bogus" })).toBe("30d");
    expect(rangeParam({})).toBe("30d");
  });
  it("ticker facts are plain words and drop zeros", () => {
    const o = { ...demoOverview(), today: { views: 0, redeems: 18 } };
    const facts = tickerFacts(o);
    expect(facts.some((f) => /people reached today/i.test(f))).toBe(false);
    expect(facts).toContain("18 fans redeemed today");
    expect(facts.every((f) => !/[A-Z]{2,}_[A-Z]/.test(f))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run tests/sponsor-overview-live.test.ts`
Expected: FAIL.

- [ ] **Step 3: `frontend/src/lib/sponsor-overview-live.ts`.** Copy the backend `SponsorOverview` type from Task 1 verbatim as `export type SponsorOverview` (with `MetricSource` as a string union of the five sources), plus:

```ts
import type { SearchParams } from "@/lib/list-query";

export const RANGE_KEYS = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export function rangeParam(sp: SearchParams): RangeKey {
  const v = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  return (RANGE_KEYS as readonly string[]).includes(v ?? "") ? (v as RangeKey) : "30d";
}

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** The LED ticker's facts, in plain words; any zero fact is left out. */
export function tickerFacts(o: SponsorOverview): string[] {
  const facts: string[] = [];
  if (o.campaigns.running) facts.push(`${plural(o.campaigns.running, "campaign", "campaigns")} running`);
  if (o.today.views) facts.push(`${n(o.today.views)} people reached today`);
  if (o.needsYou.postsToReview) facts.push(`${plural(o.needsYou.postsToReview, "post", "posts")} waiting for your OK`);
  if (o.today.redeems) facts.push(`${plural(o.today.redeems, "fan", "fans")} redeemed today`);
  if (o.topCities[0]) facts.push(`Top city: ${o.topCities[0].city}`);
  return facts;
}
```

- [ ] **Step 4: `frontend/src/server/sponsor-overview.ts`**

```ts
import { apiFetch } from "@/server/api";
import type { RangeKey, SponsorOverview } from "@/lib/sponsor-overview-live";

/** GET /sponsor/overview. Null on a 403 (a role without metric reads). No
 *  catch: an outage is an error page, never fixtures dressed as live data. */
export async function fetchSponsorOverview(range: RangeKey, campaignId?: string): Promise<SponsorOverview | null> {
  const q = new URLSearchParams({ range, ...(campaignId ? { campaignId } : {}) });
  const res = await apiFetch(`/sponsor/overview?${q}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Overview unavailable (${res.status}).`);
  return ((await res.json()) as { overview: SponsorOverview }).overview;
}
```

- [ ] **Step 5: `frontend/src/lib/fixtures/sponsor-overview.ts`.** Write `export function demoOverview(range: RangeKey = "30d"): SponsorOverview`. It returns a complete, plausible object: 5 running of 27 campaigns; verifiedViews 128400; engagements 9870; otherViews 6200; clicks 2315 (prev 2390); fans 1940/1203/736/412 (prevRedeem 314); `daily` = 30 points generated with a deterministic gentle upward curve (no `Math.random`, so server and client match); money 2,400,000 / 1,820,000 / 1,310,000 cents; costPer1000Cents 1420; needsYou 2/1/1; three top athletes; three Texas cities; delivery 50/34/2 with nextDueAt 3 days from a fixed date. Look at how other fixture files in `frontend/src/lib/fixtures/` are shaped and follow them.

- [ ] **Step 6: Rewrite `frontend/src/app/(app)/sponsor/page.tsx`.** Read the current file first. Keep its live/demo switch (`demoState`, `liveSponsorDashboard`): a non-sponsor sees the demo with a "Sample data" pill. Replace both bodies with one `Dashboard` component fed by either `{ overview: await fetchSponsorOverview(range), page: await fetchCampaignPage(sp) (+ summary) }` or `demoOverview(range)` plus the existing demo campaign fixtures. Structure (§7.1):

1. `<StadiumTicker facts={tickerFacts(o)} />`.
2. `<StadiumHead title="Your sponsorships" pill={updatedAt(o.readAt)} actions={<><StadiumRange current={range} path="/sponsor" params={sp} /><Link href="/sponsor/marketplace" className="rounded-md bg-primary px-3 py-1.5 text-xs">+ New request</Link></>}>`, with `StadiumTiles cols={5}` inside:
   - **People reached:** `o.reach.verifiedViews`, `delta(verifiedViews, prev?.verifiedViews)`, `spark` = last 14 points of `daily.views`, caption `+n more reported by athletes` when `otherViews` > 0, hint "People who saw your sponsored posts, counted by the platform or checked by BTG. Numbers the athletes reported themselves are shown separately."
   - **Likes, comments & shares:** `verifiedEngagements`, delta, caption `x% of people reached` (one decimal; omit when views = 0), hint "How many times people reacted to your posts."
   - **Link clicks:** `o.clicks.total`, `delta(total, prev)`, spark from `daily.clicks`, hint "Taps on your tracked links in the athletes' posts."
   - **Fans who redeemed:** `o.fans.redeem`, `delta(redeem, prevRedeem)`, spark from `daily.redeems`, hint "Fans who scanned your QR code and used your offer."
   - **Money spent:** only when `o.money`; `format="usd"` value `invoicedCents`, share `paid/invoiced`, caption `$x paid · $y still to pay`, hint "What you've been invoiced so far, and how much of it is paid." When `money` is absent, show **Posts delivered** here instead.
3. A grid `lg:grid-cols-3`:
   - `StadiumPanel` spanning 2 with `<StadiumTrend points={o.daily} bucket={o.range.bucket} />`;
   - `StadiumPanel` "Needs you", with rows "Posts waiting for your OK" → `/sponsor/campaigns?state=APPROVAL`, "Orders to pay" → `/sponsor/orders?tab=to_pay` and "Invoices to pay" (only when defined, no link). Each has a `StadiumBadge`. When all are zero, show "You're all caught up ✓".
4. A grid `md:grid-cols-3`:
   - "From scan to redeemed": reuse `FunnelSteps` from `@/components/charts`. Read its props first and pass the four counts with `FUNNEL_WORDS` labels.
   - "What you pay per 1,000 people reached": `costPer1000Cents` as usd. When null, show "Shows once checked reach is in". Hint: "What you've spent divided by the people your posts reached, times 1,000. Lower is better value." No benchmark.
   - "Posts delivered": `delivered of due`, `StadiumBar`, caption "`late` late · next one due {weekday}".
5. A grid `md:grid-cols-2`: "Your top athletes" (`StadiumRow` with rank and initials, value = views) and "Where fans redeemed" (`HBarList` from charts.tsx, or `StadiumBar` rows), each with an empty state in plain words.
6. "Your campaigns": `PagedTable tone="sponsor" noun="Campaigns"` over `fetchCampaignPage(sp)` with `ListSearch` and a status `ListFilter` (options from `campaignWord` over `CAMPAIGN_STATES`). Columns: Campaign (name + "n athletes"), Status (`StadiumChip` via `campaignWord`), Posts delivered (`StadiumBar` + "x/y"), Spent (when the row carries money), Ends. The row links to `/sponsor/campaigns/[id]`. The page needs one `<ServerList>` around the search, filter and table (`PagedTable bare`). Remove the old portfolio and duplicate report-links lists. Read `ApiCampaign` in `lib/sponsor-live.ts` for the row fields; do not invent fields such as per-campaign reach that the row doesn't carry.

Stagger entrance delays with `at()` / `delay` (0.1, 0.16, 0.22, …).

- [ ] **Step 7: Run the tests and the typecheck, then look at the page**

Run: `cd frontend && npx vitest run tests/sponsor-overview-live.test.ts && npx tsc --noEmit && npx eslint "src/app/(app)/sponsor/page.tsx" src/lib/sponsor-overview-live.ts src/server/sponsor-overview.ts src/lib/fixtures/sponsor-overview.ts`
Expected: clean. If a dev server is running (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sponsor?demo=1`), load `/sponsor?demo=1` and confirm a 200.

- [ ] **Step 8: Commit**

```bash
git add "frontend/src/app/(app)/sponsor/page.tsx" frontend/src/lib/sponsor-overview-live.ts frontend/src/server/sponsor-overview.ts frontend/src/lib/fixtures/sponsor-overview.ts frontend/tests/sponsor-overview-live.test.ts
git commit -m "feat(P1-ART-23): the sponsor dashboard — ticker, five stats, trend, needs-you, paged campaigns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tasks 9–15: Frontend — the other pages

Each page task uses the same steps:
1. Read the current page and every component it imports.
2. Rebuild it on the kit with the structure given below, keeping its data reads, actions, live/demo switch and every existing client island's behaviour.
3. Replace every raw enum with `sponsor-words`.
4. Every list that grows is server-paged per §4 (`PagedTable`/`ServerList`+`PagerRow`, `tone="sponsor"`).
5. Run `npx tsc --noEmit`, `npx eslint <changed files>`, and the related vitest files. Find them with `grep -rl "sponsor/<route>\|<ComponentName>" frontend/tests`; update any test that pins old markup to the new words or structure.
6. Commit with explicit paths, `feat(P1-ART-23): <page> on the Stadium Board`.

The pages may not use `ArenaHead`/`ArenaTile` (athlete look). Client components still in use (drawers, review actions, checkout steps) keep their logic and are restyled by `.sx-stadium` overrides. Only touch their class names where the result is clearly off-theme (e.g. hard-coded `text-athlete`/blue), and only in sponsor-only components; never in shared ones.

### Task 9: Campaigns + Requests
- **`/sponsor/campaigns`**:
  - Head: "Your campaigns" + Updated pill + "+ New request" (→ `/sponsor/marketplace`).
  - Tiles from `/campaigns/summary`: Running (`active`), Needs your OK (`byState.APPROVAL`), Behind schedule (`behind`, tone `late` when > 0), Total budget (when `budget` is present; share = contracted ÷ budget). Plus a link tile "Your requests" with the open count (from `/briefs` `counts`, open = DRAFT + QUALIFIED + APPROVED) → `/sponsor/requests`.
  - Tabs (`TabStrip`/`TabLink`, counts from `byState`): All / Running / Needs your OK / Finished (COMPLETED + CANCELLED). Each tab sets `?state=`.
  - `ListSearch` + sort `ListFilter` (Newest / Name / Ending soon), then the paged table with the dashboard's columns.
  - Remove the requests strip from this page.
- **`/sponsor/requests`** (new `page.tsx`):
  - Head "Your requests".
  - Tiles from `/briefs?page=1&size=1` `counts`: Being matched by BTG (QUALIFIED + DRAFT), Ready for you (APPROVED), Became campaigns (CAMPAIGN_CREATED).
  - Tabs by state, with counts.
  - Paged list (`apiListQuery(sp, { state, q, sort: "newest" })` against `/briefs`). Each row shows the objective or title, `briefWord` chip, created date, budget band, and a mini `StadiumSteps` (Sent → Matching athletes → Price agreed → Campaign live; DRAFT/QUALIFIED = 1, APPROVED = 2, CAMPAIGN_CREATED = 4).
  - Rows with a campaign link to it.
  - Add a fetch helper `liveSponsorRequestPage(sp)` in `server/sponsor.ts` beside `liveSponsorRequests` (a 403 returns null → demo, as the other helpers do). Check what `ApiSponsorRequest` (lib/brief-status.ts) carries.

### Task 10: One campaign — `/sponsor/campaigns/[id]`
Keep `liveSponsorCampaign` and the existing review / artwork islands.
- Head: name, `campaignWord` chip, "See results →" (→ `./report`).
- `StadiumSteps` (Planned → Athletes signed → Posting → Finished; DRAFT/STAFFING = 0/1, APPROVAL = 1, ACTIVE = 2, REPORTING = 3, COMPLETED = 4).
- Tiles: Posts delivered x/y (bar), Athletes, Spent of budget (when money is visible), Next post due.
- Then **Waiting for your OK**: the existing content-review island, in a `StadiumPanel tone="you"` with its count.
- Then Artwork (existing), the athlete roster as a `StageTable` (bounded, not paged), and the campaign's posts as a `PagedTable` over `/deliverables?campaignId=<id>&page&size` with `keys={{ page: "ppage", size: "psize" }}` and `deliverableWord` chips.
- Demo mode: the same structure from the existing fixtures.

### Task 11: Campaign results — `/sponsor/campaigns/[id]/report`
Keep the `/campaigns/:id/report` read. Add `fetchSponsorOverview(range, id)` for the chart.
- Head: "Results · {name}", Updated pill, `StadiumRange` (path = this page).
- Tiles: People reached (verified), Likes, comments & shares, Fans who redeemed, What you pay per 1,000 (`mediaValue.amount` when verified views > 0).
- A row with `StadiumTrend` (2/3) and **How sure are we?** (1/3): the report's `performance` by source, through `sourceWord`, ✓ for the verified sources and ○ for the rest, with each share of the total.
- A row with From scan to redeemed (report `funnel`) and Best athletes (overview `topAthletes`).
- Then: link clicks by post (`deliveredAssets`, with `deliverableWord` chips and "Open post ↗"), the observations as plain bullet points, the published posts as a card gallery, and edition placements when present.
- Remove jargon such as VERIFIED_API, CPM and "media value" from visible copy. The report's `mediaValue.basis` sentence goes behind a `StadiumHint`.

### Task 12: Packages + one job
- **`/sponsor/marketplace`** ("Packages"): bounded catalogue, client-paged as today with the house pager. Tiles from the catalogue arrays: Ready-made packages (count), Job types (count), From (lowest `priceLow`, whole dollars → cents for `format="usd"`). Restyle the catalogue cards into `sx-stadium-panel` cards (in `marketplace-catalog.tsx`, sponsor-only). Keep the brief drawer. Use plain words: "Request this".
- **`/sponsor/marketplace/[jobId]`**: restyle only (Head with "Request this", three tiles from the fixture, details panel). It stays on fixtures.

### Task 13: Shop — `/sponsor/shop`
- Delete the GET form, the native `<select>`s and the Apply button.
- Head "Shop" + a "Cart · n" button (→ `/sponsor/cart`).
- Tiles: Spots for sale (`page.total` of the search), In your cart (`/cart` line count), Cart total (cents).
- `<ServerList>` with `ListSearch` (q) and `ListFilter`s for Type (`kind`), Sport, Price (`maxPrice` bands: Under $500 / Under $1,000 / Under $5,000, in cents) and State (`stateCode`, if the current form offers it). Keep every filter the old form had; each maps to the same query key.
- A paged card grid from `/marketplace/search?page&size&…` (Task 3), with `PagerRow` above and below.
- Each card has title, seller, athlete (sport), price, dates and an **Add to cart** button. The button reuses the existing add-to-cart island or action; if there is none, build a small client island that POSTs through the existing `/api` proxy route the cart page already uses, then `router.refresh()` and shows a short "Added ✓".
- Empty state: "Nothing matches. Try clearing a filter."
- Update `e2e/marketplace-path.spec.ts` selectors **only if** you must and only after confirming with the controller (the file has someone else's uncommitted edits). Prefer keeping the accessible names the e2e uses (check them with `grep -n "getByRole\|getByLabel\|getByText" e2e/marketplace-path.spec.ts`).

### Task 14: Cart + Checkout
- **Cart:** Head "Your cart". Lines in a `StadiumPanel` as `StadiumRow`s (title, dates, quantity, line total, the existing remove/change controls). A sticky (`lg:sticky lg:top-24`) summary panel with Subtotal, Fees and Total (cents, from `/cart`) and "Checkout →". Bounded, not paged. Empty: "Your cart is empty. Browse the shop →".
- **Checkout:** keep all four steps' logic.
  - Add `StadiumSteps` across the steps (Hold your spots → Billing contact → Terms → Place order).
  - Add a hold countdown, "Spots held for mm:ss", from the reservation's expiry field (find its name in the `/reservations/:id` response the page already reads). It is a tiny client island ticking once a second and reading "Hold expired. Go back to your cart" at zero.
  - Restyle the summary as a stadium panel.

### Task 15: Orders + one order
- **`/sponsor/orders`**:
  - Head "Your orders".
  - Tiles from `/marketplace-orders/summary` (Task 2): Waiting for approval, In progress, Delivered, Total spent (`spentCents`).
  - `TabStrip` from the paged response's `tabs` (`?tab=`), `hot` on `to_pay`; `ListSearch`.
  - `PagedTable` (Order # · items · `orderWord` chip · placed date · total) over `/marketplace-orders?page&size&tab&q`. Rows link to `/sponsor/orders/[id]`.
  - Add the fetch to whichever `lib/*-live.ts` / `server/*.ts` the page already reads orders through.
- **`/sponsor/orders/[id]`**: keep the order, payment, deliveries and cancel logic.
  - Head "Order #…" + `orderWord` chip.
  - `StadiumSteps` (Placed → Approved → Paid → Delivered; PENDING_* = 0, APPROVED/AWAITING_PAYMENT = 1, PAID/IN_DELIVERY = 2, FULFILLED/CLOSED = 4; CANCELLED/REFUNDED shows a `late` chip instead of steps).
  - Tiles: Total, Payment (status word), Delivered x/y.
  - Lines as rows with each delivery state in words and the proof link. Cancel stays behind its confirm dialog.

---

## Task 16: Verify, review, record

- [ ] **Step 1: The full backend and frontend suites**

Run from the repo root: `npm test`. Expected: green. The four Windows-only static failures noted in memory `test-db-without-docker` are pre-existing; list any others and fix them.

- [ ] **Step 2: Build.** Check whether a dev server is live: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`.
- If it answers, build in a detached worktree per memory `build-in-detached-worktree`: create the worktree at HEAD, junction `node_modules`, set `turbopack.root` one level up, run `npm run build`, remove the junctions, then remove the worktree.
- If nothing answers, run `npm run build` at the root.

Expected: the build succeeds.

- [ ] **Step 3: The QA walk.** Sign in as the sponsor QA user (memory `local-qa-walk-setup`; restart the API per memory `dev-api-no-watch` so `/sponsor/overview` is mounted). Visit every sponsor route at 1440px and 390px:
- no horizontal page scroll;
- each tile's number equals its API field;
- the pager shows 12/24/60 above and below, and a filter change resets it to page 1;
- reduced motion stops the ticker and the flicker;
- no raw enum anywhere (`document.body.innerText` has no `[A-Z]+_[A-Z]+`).

Also check `?demo=1` for a non-sponsor.

- [ ] **Step 4: Code review.** Use superpowers:requesting-code-review on the branch diff (`main_development...HEAD` or the base it branched from). Fix confirmed findings.

- [ ] **Step 5: Bookkeeping.**
- Add **P1-ART-23** to `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`. Follow CLAUDE.md: back up first, use a throwaway venv in the scratchpad for openpyxl, put the row after P1-ART-22 with a fractional Order, and extend the Dashboard ranges, autofilter, conditional formatting and validation. Set Status Code review, Owner, Date Started and Date Done 2026-10-11.
- Append the day's work to `Memory/2026-10-11/`: a **new file** `sponsor-stadium.md`, since `tasks-completed.md` carries someone else's uncommitted edits.
- Commit both with explicit paths.
