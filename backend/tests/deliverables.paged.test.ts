import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /deliverables · offset mode, and GET /deliverables/summary
   (2026-09-29, server-paged lists).

   Pinned: `?page=` turns paging on and the scope stays the FIRST conjunct
   whatever else is asked; filters, search, tabs and sorts are WHEREs, not
   post-filters; hostile page/size degrade; the calendar's month range is a
   dueDate WHERE; the legacy unpaged call is byte-for-byte what it was; and
   the summary counts in the database under the same scope.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

type Args = Record<string, unknown>;
let rows: unknown[] = [];
let drafts: unknown[] = [];
let audits: unknown[] = [];
let total = 0;
let groups: unknown[] = [];
let stateGroups: unknown[] = [];
let orders: unknown[] = [];
const calls: { findMany: Args[]; count: Args[]; groupBy: Args[]; assetGroupBy: Args[]; orders: Args[] } = {
  findMany: [], count: [], groupBy: [], assetGroupBy: [], orders: [],
};
let counts: number[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    deliverable: {
      findMany: (a: Args) => {
        calls.findMany.push(a);
        const and = ((a.where as { AND?: Args[] }).AND ?? []) as Args[];
        const isDraftScan = and.some((c) => c.state === "DRAFT_SUBMITTED") && !("select" in a && (a.select as Args).title);
        return Promise.resolve(isDraftScan ? drafts : rows);
      },
      findFirst: () => Promise.resolve(rows[0] ?? null),
      count: (a: Args) => (calls.count.push(a), Promise.resolve(counts.length ? counts.shift()! : total)),
      groupBy: (a: Args) => (calls.groupBy.push(a), Promise.resolve(stateGroups)),
    },
    creativeAsset: {
      findFirst: () => Promise.resolve(null),
      groupBy: (a: Args) => (calls.assetGroupBy.push(a), Promise.resolve(groups)),
    },
    auditLog: { findMany: () => Promise.resolve(audits) },
    campaignOrder: { findMany: (a: Args) => (calls.orders.push(a), Promise.resolve(orders)) },
  },
}));
vi.mock("../src/lib/storage", () => ({ presignPrivateDownload: () => Promise.resolve("https://signed/x") }));

const { listDeliverables, summarizeDeliverables } = await import("../src/routes/v1/deliverables");

const base = { userId: "u_1", tenantId: "t_1", sponsorId: null, guardianId: null, propertyId: null };
const admin = { ...base, roles: ["BTG_ADMIN"], athleteId: null } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "ath_1" } as unknown as Actor;

function row(over: Record<string, unknown> = {}) {
  return {
    id: "dl_1", title: "Showroom post", dueDate: new Date("2026-10-10T00:00:00Z"), state: "BTG_REVIEW",
    publishedUrl: null, publishedAt: null,
    order: {
      id: "ord_1", jobId: "SX-03", job: { name: "Athlete Reel" },
      athlete: { id: "ath_1", displayName: "JORDAN" },
      campaign: { id: "cmp_1", name: "Fall", sponsor: { name: "Bowie" } },
    },
    assets: [{ version: 1, uploadedAt: new Date("2026-10-01T00:00:00Z") }],
    ...over,
  };
}

async function run(h: unknown, actor: Actor, query: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await (h as (q: unknown, r: unknown, n: unknown) => Promise<void>)(
    { actor, query, params: {} },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body as Record<string, unknown> & { deliverables: Record<string, unknown>[]; page: Record<string, number> };
}

/** The main list read — the last findMany that selected full rows. */
const listRead = () => [...calls.findMany].reverse().find((a) => (a.select as Args).title)!;
const andOf = (a: Args) => (a.where as { AND: Args[] }).AND;

beforeEach(() => {
  rows = [row()];
  drafts = [];
  audits = [];
  total = 1;
  counts = [];
  groups = [];
  stateGroups = [];
  orders = [];
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k] = [];
});

describe("GET /deliverables · unpaged (legacy) is unchanged", () => {
  it("no ?page → the old where, dueDate asc, take 300, no page key", async () => {
    const b = await run(listDeliverables, athlete, { state: "BTG_REVIEW,BOGUS", campaignId: "cmp_1" });
    const a = calls.findMany[0]!;
    expect(Object.keys(a.where as Args).sort()).toEqual(["AND", "order", "state"]);
    expect((a.where as Args).state).toEqual({ in: ["BTG_REVIEW"] });
    expect((a.where as Args).order).toEqual({ campaignId: "cmp_1" });
    expect(a.orderBy).toEqual({ dueDate: "asc" });
    expect(a.take).toBe(300);
    expect(a.skip).toBeUndefined();
    expect(calls.count).toHaveLength(0);
    expect("page" in b).toBe(false);
  });

  it("the calendar's month: ?from&to is a dueDate range, still capped", async () => {
    await run(listDeliverables, athlete, { from: "2026-09-29", to: "2026-11-09" });
    const a = calls.findMany[0]!;
    expect((a.where as Args).dueDate).toEqual({ gte: new Date("2026-09-29"), lt: new Date("2026-11-09") });
    expect(a.take).toBe(300);
    await run(listDeliverables, athlete, { from: "not-a-date", to: "2026-13-45" });
    expect((calls.findMany[1]!.where as Args).dueDate).toBeUndefined();
  });
});

describe("GET /deliverables · paged", () => {
  it("pages with its true total; the scope is the first AND", async () => {
    total = 30;
    const b = await run(listDeliverables, admin, { page: "2", size: "12" });
    const a = listRead();
    expect(andOf(a)[0]).toHaveProperty("AND");
    expect(a.skip).toBe(12);
    expect(a.take).toBe(12);
    expect(a.orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(b.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(b.deliverables[0]!.id).toBe("dl_1");
    /* the count uses the same where it pages */
    expect(calls.count[0]!.where).toBe(a.where);
  });

  it("hostile page/size degrade; past the end answers the last page", async () => {
    total = 5;
    const b = await run(listDeliverables, admin, { page: "999", size: "100000" });
    expect(b.page).toEqual({ page: 1, size: 100, total: 5, pages: 1 });
    const c = await run(listDeliverables, admin, { page: "-3", size: "abc" });
    expect(c.page).toMatchObject({ page: 1, size: 12 });
    total = 0;
    const d = await run(listDeliverables, admin, { page: "1" });
    expect(d.deliverables).toEqual([]);
  });

  it("filters: state, campaign, month range, format — all WHEREs", async () => {
    await run(listDeliverables, admin, {
      page: "1", state: "APPROVED,NOPE", campaignId: "cmp_9", from: "2026-10-01", to: "2026-11-01", kind: "video",
    });
    const and = andOf(listRead());
    expect(and).toContainEqual({ state: { in: ["APPROVED"] } });
    expect(and).toContainEqual({ order: { campaignId: "cmp_9" } });
    expect(and).toContainEqual({ dueDate: { gte: new Date("2026-10-01"), lt: new Date("2026-11-01") } });
    expect(and).toContainEqual({ order: { jobId: { in: ["SX-01", "SX-03", "SX-04"] } } });
    await run(listDeliverables, admin, { page: "1", kind: "image" });
    expect(andOf(listRead())).toContainEqual({ order: { jobId: { notIn: ["SX-01", "SX-03", "SX-04"] } } });
    await run(listDeliverables, admin, { page: "1", kind: "audio" });
    expect(andOf(listRead())).toHaveLength(1);
  });

  it("search is case-insensitive over title, athlete, campaign and sponsor", async () => {
    await run(listDeliverables, admin, { page: "1", q: "  bowie " });
    const has = { contains: "bowie", mode: "insensitive" };
    expect(andOf(listRead())).toContainEqual({
      OR: [
        { title: has },
        { order: { athlete: { displayName: has } } },
        { order: { campaign: { name: has } } },
        { order: { campaign: { sponsor: { name: has } } } },
      ],
    });
  });

  it("tabs by whose move — an open revision is the athlete's to do", async () => {
    drafts = [
      { id: "dl_open", dueDate: new Date("2026-10-01"), assets: [{ uploadedAt: new Date("2026-09-01") }] },
      { id: "dl_answered", dueDate: new Date("2026-10-01"), assets: [{ uploadedAt: new Date("2026-09-20") }] },
    ];
    audits = [
      { entityId: "dl_open", after: { reason: "x" }, at: new Date("2026-09-10") },
      { entityId: "dl_answered", after: { reason: "y" }, at: new Date("2026-09-10") },
    ];
    await run(listDeliverables, athlete, { page: "1", tab: "todo" });
    let and = andOf(listRead());
    expect(and[0]).toHaveProperty("AND");
    expect(and.at(-1)).toEqual({ OR: [{ state: { in: ["NOT_STARTED", "APPROVED"] } }, { id: { in: ["dl_open"] } }] });
    await run(listDeliverables, athlete, { page: "1", tab: "review" });
    and = andOf(listRead());
    expect(and.at(-1)).toEqual({
      OR: [{ state: { in: ["BTG_REVIEW", "SPONSOR_REVIEW"] } }, { state: "DRAFT_SUBMITTED", id: { notIn: ["dl_open"] } }],
    });
    await run(listDeliverables, athlete, { page: "1", tab: "done" });
    expect(andOf(listRead()).at(-1)).toEqual({ state: { in: ["PUBLISHED", "VERIFIED"] } });
    /* the draft scan is itself scoped */
    const scan = calls.findMany.find((a) => !(a.select as Args).title)!;
    expect((andOf(scan)[0] as { AND: Args[] }).AND[0]).toHaveProperty("AND");
  });

  it("waiting longest: ranked by latest upload in the DB, the rest by due date", async () => {
    total = 3;
    counts = [3, 2]; // total, then ranked
    groups = [{ deliverableId: "dl_b" }, { deliverableId: "dl_a" }];
    rows = [row({ id: "dl_a" }), row({ id: "dl_b" })];
    const b = await run(listDeliverables, admin, { page: "1", sort: "waiting" });
    const g = calls.assetGroupBy[0]!;
    expect(g.by).toEqual(["deliverableId"]);
    expect(g.orderBy).toEqual([{ _max: { uploadedAt: "asc" } }, { deliverableId: "asc" }]);
    expect((g.where as Args).tenantId).toBe("t_1");
    expect(((g.where as Args).deliverable as { AND: Args[] }).AND[0]).toHaveProperty("AND");
    expect(b.deliverables.slice(0, 2).map((d) => d.id)).toEqual(["dl_b", "dl_a"]);
    /* the tail (what isn't waiting) fills the page, by due date */
    const tail = calls.findMany.at(-1)!;
    expect(tail.orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(tail.take).toBe(10);
    expect(tail.skip).toBe(0);
    expect(andOf(tail)[1]).toHaveProperty("NOT");
  });

  it("newest: descending, and a page past the ranked set reads only the tail", async () => {
    total = 30;
    counts = [30, 5];
    await run(listDeliverables, admin, { page: "2", size: "12", sort: "newest" });
    expect(calls.assetGroupBy).toHaveLength(0);
    const tail = calls.findMany.at(-1)!;
    expect(tail.skip).toBe(7);
    expect(tail.take).toBe(12);
    counts = [30, 20];
    groups = [];
    await run(listDeliverables, admin, { page: "1", sort: "newest" });
    expect(calls.assetGroupBy[0]!.orderBy).toEqual([{ _max: { uploadedAt: "desc" } }, { deliverableId: "asc" }]);
  });

  it("an unknown sort falls back to due date", async () => {
    await run(listDeliverables, admin, { page: "1", sort: "random" });
    expect(listRead().orderBy).toEqual([{ dueDate: "asc" }, { id: "asc" }]);
    expect(calls.assetGroupBy).toHaveLength(0);
  });
});

describe("GET /deliverables/summary", () => {
  it("counts per state, open revisions, aging, overdue and campaigns — scoped", async () => {
    stateGroups = [
      { state: "DRAFT_SUBMITTED", _count: { _all: 3 } },
      { state: "BTG_REVIEW", _count: { _all: 2 } },
      { state: "APPROVED", _count: { _all: 1 } },
    ];
    const old = new Date(Date.now() - 48 * 3_600_000);
    const fresh = new Date(Date.now() - 3_600_000);
    drafts = [
      { id: "dl_open", dueDate: new Date("2000-01-01"), assets: [{ uploadedAt: old }] },
      { id: "dl_old", dueDate: new Date("2099-01-01"), assets: [{ uploadedAt: old }] },
      { id: "dl_new", dueDate: new Date("2099-01-01"), assets: [{ uploadedAt: fresh }] },
    ];
    audits = [{ entityId: "dl_open", after: { reason: "x" }, at: new Date(Date.now() - 24 * 3_600_000) }];
    counts = [4, 2]; // desk aging (BTG/SPONSOR), late own (NOT_STARTED/APPROVED)
    orders = [{ campaign: { id: "c2", name: "Zeta" } }, { campaign: { id: "c1", name: "Alpha" } }];

    const b = await run(summarizeDeliverables, admin, { state: "DRAFT_SUBMITTED,BTG_REVIEW,APPROVED" });
    expect(b.total).toBe(6);
    expect(b.states).toMatchObject({ NOT_STARTED: 0, DRAFT_SUBMITTED: 3, BTG_REVIEW: 2, APPROVED: 1 });
    expect(b.openRevisions).toBe(1);
    expect(b.aging).toBe(5); // 4 on BTG/sponsor desks + dl_old; the open revision is the athlete's
    expect(b.overdue).toBe(3); // 2 own + the open revision past due
    expect(b.campaigns).toEqual([{ id: "c1", name: "Alpha" }, { id: "c2", name: "Zeta" }]);

    const where = calls.groupBy[0]!.where as { AND: Args[] };
    expect(where.AND[0]).toHaveProperty("AND");
    expect(where.AND).toContainEqual({ state: { in: ["DRAFT_SUBMITTED", "BTG_REVIEW", "APPROVED"] } });
    for (const c of calls.count) expect((c.where as { AND: Args[] }).AND[0]).toBe(where);
    const o = calls.orders[0]!;
    expect((o.where as Args).tenantId).toBe("t_1");
    expect(((o.where as Args).deliverables as { some: unknown }).some).toBe(where);
  });

  it("an empty scope answers zeros, not a missing key", async () => {
    counts = [0, 0];
    const b = await run(summarizeDeliverables, athlete);
    expect(b).toMatchObject({ total: 0, openRevisions: 0, aging: 0, overdue: 0, campaigns: [] });
    expect(Object.values(b.states as Record<string, number>).every((n) => n === 0)).toBe(true);
  });
});
