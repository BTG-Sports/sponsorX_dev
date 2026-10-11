/* eslint-disable @typescript-eslint/no-explicit-any -- mock Prisma args are inspected structurally */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   P1-ART-22 (2026-10-11) — the athlete arena's lists, SERVER-PAGED (memory:
   pagination-pattern): GET /inventory, /listings, /sales, /seller-approvals,
   /offers (the athlete's open | closed), /guardian-handoffs (waiting | past)
   and the two new reads GET /payouts/me/orders and /payouts/me/history.

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
/* Every model the reads touch (sales reach sponsors, contacts, refunds…): made on first use. */
vi.mock("../src/db/client", () => {
  const made: Record<string, unknown> = {};
  return { prisma: new Proxy({}, { get: (_t, name: string) => (made[name] ??= model(name)) }) };
});

const { inventory, listings, sales, sellerApprovals, offers } = await import("../src/routes/v1/marketplace");
const { listHandoffs } = await import("../src/domain/guardian-handoff");
const { myPayoutHistoryPage, myPayoutOrdersPage } = await import("../src/domain/payouts");
const { whereFor } = await import("../src/auth/scope");

const base = { userId: "u_ala1", tenantId: "t_ala1", athleteId: null, guardianId: null, propertyId: null, sponsorId: null, wards: [], actingFor: null };
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "ath_ala1" } as unknown as Actor;
const guardian = { ...base, roles: ["GUARDIAN"], guardianId: "gdn_ala1" } as unknown as Actor;

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

/* -------------------------------------------------------------- inventory */

describe("GET /inventory · paged", () => {
  it("without ?page the old whole list, no page, no counts", async () => {
    const body = await run(inventory, athlete);
    expect(body.page).toBeUndefined();
    expect(body.counts).toBeUndefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("scope first, then q, active and unlisted; counts over the whole scope", async () => {
    impl["inventoryItem.count"] = (a) => {
      const terms = a.where.AND ?? [];
      if (terms.length === 0) return 30; /* the bare scope (whereFor) */
      if (terms.some((t: Args) => t.active === true) && terms.length === 2) return 20;
      if (terms.some((t: Args) => t.listings) && terms.length === 2) return 6;
      return 25; /* the filtered list */
    };
    const body = await run(inventory, athlete, { ...PAGE, q: "clinic", active: "true", unlisted: "true" });
    const [read] = of("inventoryItem", "findMany");
    const scope = whereFor(athlete, "inventoryItem", "read");
    expect(read!.args.where.AND[0]).toEqual(scope);
    expect(read!.args.where.AND[1]).toEqual({ title: { contains: "clinic", mode: "insensitive" } });
    expect(read!.args.where.AND[2]).toEqual({ active: true });
    expect(read!.args.where.AND[3]).toEqual({ listings: { none: { state: { not: "ARCHIVED" } } } });
    expect([read!.args.skip, read!.args.take]).toEqual([12, 12]);
    expect(body.page).toEqual({ page: 2, size: 12, total: 25, pages: 3 });
    /* total and paused come from the scope, not the 25 the filter left. */
    expect(body.counts.paused).toBe(body.counts.total - body.counts.active);
    expect(of("inventoryItem", "count").some((c) => c.args.where === scope || JSON.stringify(c.args.where) === JSON.stringify(scope))).toBe(true);
  });
});

/* --------------------------------------------------------------- listings */

describe("GET /listings · paged", () => {
  it("scope=own narrows to the caller's athlete; counts are own / team / byState over the scope", async () => {
    impl["listing.count"] = () => 4;
    impl["listing.groupBy"] = () => [{ state: "LIVE", _count: { _all: 3 } }, { state: "DRAFT", _count: { _all: 2 } }];
    const body = await run(listings, athlete, { page: "1", size: "12", scope: "own", q: "camp" });
    const [read] = of("listing", "findMany");
    expect(read!.args.where.AND[0]).toEqual(whereFor(athlete, "listing", "read"));
    expect(read!.args.where.AND[1]).toEqual({ sellerAthleteId: "ath_ala1" });
    expect(read!.args.where.AND[2].OR).toHaveLength(2);
    expect(body.counts).toEqual({ own: 4, team: 4, byState: { LIVE: 3, DRAFT: 2 } });
    expect(of("listing", "groupBy")[0]!.args.where).toEqual(whereFor(athlete, "listing", "read"));
  });

  it("an unknown scope is ignored, not an error; no ?page keeps the old shape", async () => {
    impl["listing.count"] = () => 2;
    await run(listings, athlete, { page: "1", scope: "everyone" });
    expect(of("listing", "findMany")[0]!.args.where.AND).toHaveLength(1);
    calls = [];
    const body = await run(listings, athlete);
    expect(body.page).toBeUndefined();
    expect(body.counts).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ sales */

describe("GET /sales · paged", () => {
  it("one tab narrows the read; every tab's count is over the whole scope", async () => {
    impl["orderLineDelivery.count"] = () => 3;
    impl["orderLineDelivery.groupBy"] = () => [
      { state: "IN_DELIVERY", _count: { _all: 3 } },
      { state: "UNPAID", _count: { _all: 2 } },
      { state: "CANCELLED", _count: { _all: 1 } },
      { state: "REFUNDED", _count: { _all: 1 } },
    ];
    const body = await run(sales, athlete, { page: "1", size: "12", tab: "to_deliver" });
    const [read] = of("orderLineDelivery", "findMany");
    expect(read!.args.where.AND[0]).toEqual(whereFor(athlete, "orderDelivery", "read"));
    expect(read!.args.where.AND[1]).toEqual({ state: { in: ["IN_DELIVERY"] } });
    expect(read!.args.take).toBe(12);
    const tabs = Object.fromEntries(body.tabs.map((t: { key: string; count: number }) => [t.key, t.count]));
    expect(body.tabs[0]).toMatchObject({ key: "all", label: "All" });
    expect(tabs).toMatchObject({ all: 7, to_deliver: 3, awaiting_payment: 2, cancelled: 2, delivered: 0 });
    expect(body.page).toEqual({ page: 1, size: 12, total: 3, pages: 1 });
  });

  it("an unknown tab is all", async () => {
    impl["orderLineDelivery.count"] = () => 2;
    await run(sales, athlete, { page: "1", tab: "bogus" });
    expect(of("orderLineDelivery", "findMany")[0]!.args.where.AND).toHaveLength(1);
  });
});

/* ------------------------------------------------------- seller approvals */

describe("GET /seller-approvals · paged", () => {
  it("open-to-answer first (soonest due), then the answered; counts waiting / total", async () => {
    impl["orderSellerApproval.count"] = (a) => (JSON.stringify(a.where).includes("PENDING_SELLER") ? 2 : 5);
    const body = await run(sellerApprovals, athlete, { page: "1", size: "12" });
    const reads = of("orderSellerApproval", "findMany");
    expect(reads[0]!.args.where.AND[0]).toEqual(whereFor(athlete, "orderSellerApproval", "read"));
    expect(reads[0]!.args.where.AND[1]).toMatchObject({ state: "PENDING", order: { state: "PENDING_SELLER" } });
    expect(reads[0]!.args.orderBy).toEqual([{ dueAt: "asc" }, { id: "asc" }]);
    expect(reads[1]!.args.where.AND[1].NOT).toMatchObject({ state: "PENDING" });
    expect(body.counts).toEqual({ waiting: 2, total: 5 });
    expect(body.page).toEqual({ page: 1, size: 12, total: 5, pages: 1 });
  });
});

/* ----------------------------------------------------------------- offers */

describe("GET /offers · the athlete's open | closed", () => {
  it("open = SENT and unexpired, soonest expiry first; counts are { open, closed }", async () => {
    impl["offer.count"] = (a) => {
      const last = a.where.AND?.at(-1);
      if (last?.state === "SENT") return 3;
      if (last?.OR) return 8;
      return 3;
    };
    const body = await run(offers, athlete, { page: "1", size: "12", tab: "open" });
    const [read] = of("offer", "findMany");
    expect(read!.args.where.AND.at(-1)).toMatchObject({ state: "SENT", expiresAt: { gt: expect.any(Date) } });
    expect(read!.args.orderBy).toEqual([{ expiresAt: "asc" }, { id: "asc" }]);
    expect(body.counts).toEqual({ open: 3, closed: 8 });
    expect(body.byState).toBeDefined();
  });

  it("closed = not SENT, or lapsed; newest first", async () => {
    impl["offer.count"] = () => 2;
    await run(offers, athlete, { page: "1", tab: "closed" });
    const [read] = of("offer", "findMany");
    expect(read!.args.where.AND.at(-1).OR).toEqual([{ state: { not: "SENT" } }, { expiresAt: { lte: expect.any(Date) } }]);
    expect(read!.args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
});

/* ------------------------------------------------------ guardian handoffs */

describe("GET /guardian-handoffs · waiting | past for a guardian", () => {
  it("past is SWITCHED / DECLINED / CANCELLED; counts { waiting, past } over every request but REQUESTED", async () => {
    impl["guardianHandoff.count"] = () => 4;
    impl["guardianHandoff.groupBy"] = () => [
      { state: "WAITING", _count: { _all: 1 } },
      { state: "HANDED_OFF", _count: { _all: 1 } },
      { state: "SWITCHED", _count: { _all: 2 } },
      { state: "DECLINED", _count: { _all: 2 } },
    ];
    const body = await listHandoffs(guardian, { group: "past", page: { page: 1, size: 12, skip: 0, take: 12 } });
    const [read] = of("guardianHandoff", "findMany");
    expect(read!.args.where.state).toEqual({ in: ["SWITCHED", "DECLINED", "CANCELLED"] });
    expect(body).toMatchObject({ counts: { waiting: 2, past: 4 }, page: { page: 1, size: 12, total: 4, pages: 1 } });
    expect(of("guardianHandoff", "groupBy")[0]!.args.where.state).toEqual({ not: "REQUESTED" });
  });

  it("a guardian's waiting group never holds a request before it is sent", async () => {
    impl["guardianHandoff.count"] = () => 2;
    await listHandoffs(guardian, { group: "waiting", page: { page: 1, size: 60, skip: 0, take: 60 } });
    expect(of("guardianHandoff", "findMany")[0]!.args.where.state).toEqual({ in: ["WAITING", "HANDED_OFF"] });
  });

  it("unpaged, a guardian's answer is unchanged — no counts", async () => {
    const body = await listHandoffs(guardian, {});
    expect(body).not.toHaveProperty("counts");
    expect(body).not.toHaveProperty("page");
  });
});

/* ---------------------------------------------------------------- payouts */

describe("GET /payouts/me/history and /payouts/me/orders", () => {
  it("history: the payee's scope first, one state, newest request first; counts by state over every payout", async () => {
    impl["payout.count"] = () => 30;
    impl["payout.groupBy"] = () => [{ state: "PAID", _count: { _all: 25 } }, { state: "REQUESTED", _count: { _all: 5 } }];
    const body = await myPayoutHistoryPage(athlete, { page: 2, size: 12, skip: 12, take: 12 }, "PAID");
    const [read] = of("payout", "findMany");
    expect(read!.args.where.AND[0]).toEqual(whereFor(athlete, "payout", "read"));
    expect(read!.args.where.AND[1]).toEqual({ state: "PAID" });
    expect(read!.args.orderBy).toEqual([{ requestedAt: "desc" }, { id: "desc" }]);
    expect([read!.args.skip, read!.args.take]).toEqual([12, 12]);
    expect(body.counts).toMatchObject({ PAID: 25, REQUESTED: 5, FAILED: 0 });
    expect(body.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
  });

  it("orders: counted and paged by order in the database; no order read past the page", async () => {
    impl["ledgerEntry.groupBy"] = (a) => (a.skip === undefined ? [{ orderId: "o1" }, { orderId: "o2" }, { orderId: "o3" }] : [{ orderId: "o2" }]);
    const body = await myPayoutOrdersPage(athlete, { page: 2, size: 1, skip: 1, take: 1 });
    const [count, page] = of("ledgerEntry", "groupBy");
    expect(count!.args.by).toEqual(["orderId"]);
    expect([page!.args.skip, page!.args.take]).toEqual([1, 1]);
    /* only this page's order is balanced */
    expect(of("ledgerEntry", "findMany")[0]!.args.where.AND[1]).toEqual({ orderId: { in: ["o2"] } });
    expect(body.page).toEqual({ page: 2, size: 1, total: 3, pages: 3 });
  });
});
