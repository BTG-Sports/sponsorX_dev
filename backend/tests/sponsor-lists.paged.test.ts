/* eslint-disable @typescript-eslint/no-explicit-any -- mock Prisma args are inspected structurally */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   P1-ART-23 (2026-10-11) — the sponsor portal's Orders desk, SERVER-PAGED
   (memory: pagination-pattern): GET /marketplace-orders and the new
   GET /marketplace-orders/summary.

   Pinned for every one, the desk-lists.paged rules: the caller's scope is
   the first AND term (a filter only narrows it), the filters reach the
   database, the counts are over the WHOLE scope (never the page, the tab or
   the search), the page is the house PageInfo, and without `?page=` the old
   read is unchanged.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example", PAYOUT_HOLD_DAYS: 7 } }));

type Args = Record<string, any>;
type Call = { model: string; op: string; args: Args };
let calls: Call[] = [];
let impl: Record<string, (a: Args) => unknown> = {};

const DEFAULTS: Record<string, unknown> = { findMany: [], findFirst: null, findUnique: null, count: 0, groupBy: [], aggregate: { _sum: {} } };
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
/* Every model the reads touch: made on first use. */
vi.mock("../src/db/client", () => {
  const made: Record<string, unknown> = {};
  return { prisma: new Proxy({}, { get: (_t, name: string) => (made[name] ??= model(name)) }) };
});

const { orders, ordersSummary, search } = await import("../src/routes/v1/marketplace");
const { whereFor } = await import("../src/auth/scope");

async function run(handler: unknown, actor: Actor, query: Record<string, string> = {}) {
  let body: any;
  await (handler as (...a: unknown[]) => Promise<void>)(
    { actor, query, params: {} } as never,
    { json: (b: unknown) => void (body = b) } as never,
    (() => {}) as never,
  );
  return body;
}
const of = (m: string, op: string) => calls.filter((c) => c.model === m && c.op === op);
const PAGE = { page: "2", size: "12" };

beforeEach(() => {
  calls = [];
  impl = {};
});

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
    impl["marketplaceOrder.count"] = () => 2;
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
