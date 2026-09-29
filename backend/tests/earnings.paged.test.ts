import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /earnings?page= · /earnings/summary · /earnings/reconciliation ·
   /earnings/invoices — the server-paged Finance and athlete lists
   (2026-09-29). Pinned: the caller's scope is always the first conjunct;
   filters/search/sort land in the WHERE; hostile page/size degrade; the
   summary withholds money exactly as the list does (absent, never 0);
   reconciliation is per campaign from the database, not from a capped
   earnings list, and only for the roles that ever got it. Unpaged mode is
   unchanged (tests/earnings.list.test.ts pins its shape).
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

type Args = Record<string, unknown>;
const calls: Record<string, Args[]> = {};
const rec = (k: string, a: Args) => ((calls[k] ??= []).push(a), a);

let earningRows: unknown[] = [];
let earningTotal = 0;
let stateGroups: unknown[] = [];
let paidGroups: unknown[] = [];
let campaignRows: unknown[] = [];
let campaignTotal = 0;
let orderRows: unknown[] = [];
let invoiceGroups: unknown[] = [];
let invoiceRows: unknown[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    earning: {
      findMany: (a: Args) => (rec("earning.findMany", a), Promise.resolve(earningRows)),
      count: (a: Args) => (rec("earning.count", a), Promise.resolve(earningTotal)),
      groupBy: (a: Args) => (
        rec("earning.groupBy", a),
        Promise.resolve((a.by as string[])[0] === "state" ? stateGroups : paidGroups)
      ),
    },
    deliverable: {
      count: (a: Args) => (rec("deliverable.count", a), Promise.resolve((a.where as Args).state ? 3 : 7)),
    },
    nilJob: {
      findMany: (a: Args) => (rec("nilJob.findMany", a), Promise.resolve([{ name: "Story Drop" }, { name: "Reel" }, { name: "Reel" }])),
    },
    campaignOrder: {
      aggregate: (a: Args) => (rec("campaignOrder.aggregate", a), Promise.resolve({ _sum: { sellPrice: 100_000 } })),
      findMany: (a: Args) => (rec("campaignOrder.findMany", a), Promise.resolve(orderRows)),
    },
    campaign: {
      count: (a: Args) => (rec("campaign.count", a), Promise.resolve(campaignTotal)),
      findMany: (a: Args) => (rec("campaign.findMany", a), Promise.resolve(campaignRows)),
    },
    campaignInvoice: {
      groupBy: (a: Args) => (rec("campaignInvoice.groupBy", a), Promise.resolve(invoiceGroups)),
      aggregate: (a: Args) => (rec("campaignInvoice.aggregate", a), Promise.resolve({ _sum: { amount: 1_000 * (calls["campaignInvoice.aggregate"]!.length) } })),
      count: (a: Args) => (rec("campaignInvoice.count", a), Promise.resolve(invoiceRows.length)),
      findMany: (a: Args) => (rec("campaignInvoice.findMany", a), Promise.resolve(invoiceRows)),
    },
  },
}));

const { listEarnings, earningsSummary, listReconciliation, listInvoices } = await import("../src/routes/v1/earnings");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null, sponsorId: null };
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "a1" } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"], athleteId: null } as unknown as Actor;
const campaignMgr = { ...base, roles: ["CAMPAIGN_MGR"], athleteId: null } as unknown as Actor;
const admin = { ...base, roles: ["BTG_ADMIN"], athleteId: null } as unknown as Actor;

function earning(over: Record<string, unknown> = {}) {
  return {
    id: "e1", state: "PAID", gross: 40_000, adjustment: -1_000, taxYear: 2026,
    paidAt: new Date("2026-10-20T00:00:00Z"), reference: "PAY-001",
    athlete: { id: "a1", displayName: "JORDAN" },
    order: {
      id: "o1", jobId: "SX-01", acceptedAt: new Date("2026-10-01T00:00:00Z"), sellPrice: 60_000,
      job: { name: "Story Drop" },
      campaign: { id: "c1", name: "Fall", sponsor: { name: "Bowie" } },
      deliverables: [{ state: "VERIFIED" }, { state: "PUBLISHED" }],
    },
    ...over,
  };
}

async function run(handler: unknown, actor: Actor, query: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await (handler as (...a: unknown[]) => Promise<void>)(
    { actor, query } as never,
    { json: (b: Record<string, unknown>) => void (body = b) } as never,
    (() => {}) as never,
  );
  return body!;
}

const last = (k: string) => calls[k]!.at(-1)!;
const andOf = (a: Args) => (a.where as { AND: Args[] }).AND;

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  earningRows = [earning()];
  earningTotal = 1;
  stateGroups = [
    { state: "PAID", _count: { _all: 2 }, _sum: { gross: 50_000, adjustment: -1_000 } },
    { state: "APPROVED_FOR_PAYOUT", _count: { _all: 1 }, _sum: { gross: 10_000, adjustment: 0 } },
    { state: "DISPUTED", _count: { _all: 1 }, _sum: { gross: 5_000, adjustment: 0 } },
  ];
  paidGroups = [
    { paidAt: new Date("2026-03-04T10:00:00Z"), _sum: { gross: 20_000, adjustment: 0 } },
    { paidAt: new Date("2026-03-20T10:00:00Z"), _sum: { gross: 30_000, adjustment: -1_000 } },
  ];
  campaignRows = [];
  campaignTotal = 0;
  orderRows = [];
  invoiceGroups = [];
  invoiceRows = [];
});

describe("GET /earnings?page= (paged mode)", () => {
  it("answers one page with the database's total, scope first, same row gating", async () => {
    earningTotal = 30;
    const b = await run(listEarnings, athlete, { page: "2", size: "12" });
    expect(b.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(b.campaigns).toBeUndefined();
    const find = last("earning.findMany");
    expect(find.skip).toBe(12);
    expect(find.take).toBe(12);
    expect(find.where).toEqual(last("earning.count").where);
    const and = andOf(find);
    expect(and[0]).toEqual({ AND: [{ tenantId: "t", athleteId: "a1" }] });
    const e = (b.earnings as Record<string, unknown>[])[0];
    expect(e.amount).toBe(39_000);
    expect("sellPrice" in e).toBe(false);
    expect("commission" in e).toBe(false);
  });

  it("puts state list, type, jobId, date range and search in the WHERE", async () => {
    await run(listEarnings, finance, {
      page: "1", state: "PAID,HELD,BOGUS", type: "Story Drop", jobId: "SX-01",
      from: "2026-05-10", to: "2026-05-18", q: "  bowie ",
    });
    const and = andOf(last("earning.findMany"));
    expect(and[0]).toEqual({ AND: [{ tenantId: "t" }] });
    expect(and).toContainEqual({ state: { in: ["PAID", "HELD"] } });
    expect(and).toContainEqual({ order: { is: { jobId: "SX-01" } } });
    expect(and).toContainEqual({ order: { is: { job: { is: { name: "Story Drop" } } } } });
    const range = { gte: new Date("2026-05-10T00:00:00Z"), lt: new Date("2026-05-19T00:00:00Z") };
    expect(and).toContainEqual({ OR: [{ paidAt: range }, { paidAt: null, order: { is: { acceptedAt: range } } }] });
    const search = and.find((c) => Array.isArray(c.OR) && JSON.stringify(c).includes("bowie")) as { OR: Args[] };
    expect(search.OR).toContainEqual({ reference: { contains: "bowie", mode: "insensitive" } });
    expect(search.OR).toContainEqual({ order: { is: { campaign: { is: { sponsor: { is: { name: { contains: "bowie", mode: "insensitive" } } } } } } } });
    expect(last("earning.findMany").orderBy).toEqual([
      { paidAt: { sort: "desc", nulls: "first" } },
      { order: { acceptedAt: { sort: "desc", nulls: "last" } } },
      { id: "desc" },
    ]);
  });

  it("ignores malformed dates and never lets a filter replace the scope", async () => {
    await run(listEarnings, athlete, { page: "1", from: "2026-02-31", to: "yesterday", state: "" });
    const and = andOf(last("earning.findMany"));
    expect(and).toHaveLength(1);
    expect(and[0]).toEqual({ AND: [{ tenantId: "t", athleteId: "a1" }] });
  });

  it.each([
    [{ page: "-3", size: "100000" }, 1, 100],
    [{ page: "abc", size: "0" }, 1, 12],
    [{ page: "1.5", size: "24" }, 1, 24],
  ])("hostile paging %o degrades to page %i size %i", async (query, page, size) => {
    earningTotal = 500;
    const b = await run(listEarnings, finance, query as Record<string, string>);
    expect(b.page).toMatchObject({ page, size });
    expect(last("earning.findMany").take).toBe(size);
  });

  it("clamps a page past the end to the last page", async () => {
    earningTotal = 13;
    const b = await run(listEarnings, finance, { page: "99" });
    expect(b.page).toEqual({ page: 2, size: 12, total: 13, pages: 2 });
    expect(last("earning.findMany").skip).toBe(12);
  });

  it("a role denied earning.amount gets no money in paged mode either", async () => {
    const e = ((await run(listEarnings, campaignMgr, { page: "1" })).earnings as Record<string, unknown>[])[0];
    for (const k of ["amount", "gross", "adjustment", "sellPrice", "commission"]) expect(k in e).toBe(false);
  });
});

describe("GET /earnings (unpaged) is unchanged", () => {
  it("still takes 500, newest paid first, and admin still gets campaigns", async () => {
    invoiceRows = [];
    const b = await run(listEarnings, admin);
    const find = last("earning.findMany");
    expect(find.take).toBe(500);
    expect(find.skip).toBeUndefined();
    expect(find.orderBy).toEqual([{ paidAt: { sort: "desc", nulls: "first" } }, { id: "desc" }]);
    expect(b.page).toBeUndefined();
    expect(Array.isArray(b.campaigns)).toBe(true);
  });
});

describe("GET /earnings/summary", () => {
  it("aggregates in the database under the caller's scope", async () => {
    const b = await run(earningsSummary, finance, { year: "2026" });
    const g = calls["earning.groupBy"]!.find((a) => (a.by as string[])[0] === "state")!;
    expect(g.where).toEqual({ AND: [{ tenantId: "t" }] });
    expect(b.count).toBe(4);
    expect((b.byState as Record<string, unknown>).PAID).toEqual({ count: 2, amount: 49_000 });
    expect((b.byState as Record<string, unknown>).HELD).toEqual({ count: 0, amount: 0 });
    expect(b.career).toEqual({ raised: 59_000, paid: 49_000, onTheWay: 10_000 });
    expect(b.paidByMonth).toEqual({ year: 2026, months: [0, 0, 49_000, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(b.deliverables).toEqual({ verified: 3, total: 7 });
    expect(b.jobNames).toEqual(["Story Drop", "Reel"]);
    expect(b.sell).toEqual({ sellPrice: 100_000, commission: 100_000 - 64_000 });
    const paidWhere = calls["earning.groupBy"]!.find((a) => (a.by as string[])[0] === "paidAt")!.where as { AND: Args[] };
    expect(paidWhere.AND[0]).toEqual({ AND: [{ tenantId: "t" }] });
    expect(paidWhere.AND[1]).toEqual({
      state: "PAID",
      paidAt: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") },
    });
  });

  it("the athlete gets their own money but never sellPrice or commission", async () => {
    const b = await run(earningsSummary, athlete);
    expect(b.career).toBeDefined();
    expect(b.sell).toBeUndefined();
    expect(JSON.stringify(b)).not.toMatch(/sellPrice|commission/);
    expect(calls["campaignOrder.aggregate"]).toBeUndefined();
    const g = calls["earning.groupBy"]![0]!;
    expect(g.where).toEqual({ AND: [{ tenantId: "t", athleteId: "a1" }] });
  });

  it("a role denied earning.amount gets counts only — money keys absent, not 0", async () => {
    const b = await run(earningsSummary, campaignMgr);
    const g = calls["earning.groupBy"]![0]!;
    expect(g._sum).toBeUndefined();
    expect((b.byState as Record<string, unknown>).PAID).toEqual({ count: 2 });
    for (const k of ["career", "paidByMonth", "sell"]) expect(k in b).toBe(false);
    expect(calls["earning.groupBy"]).toHaveLength(1);
  });

  it("carries no bank or tax field", async () => {
    expect(JSON.stringify(await run(earningsSummary, admin))).not.toMatch(/bank|routing|iban|taxId|ssn|tin\b/i);
  });
});

describe("GET /earnings/reconciliation", () => {
  it("is refused to FINANCE, the athlete and campaign managers — as the block always was", async () => {
    for (const who of [finance, athlete, campaignMgr]) {
      await expect(run(listReconciliation, who)).rejects.toMatchObject({ status: 403 });
      await expect(run(listInvoices, who)).rejects.toMatchObject({ status: 403 });
    }
  });

  it("pages campaigns from the database — no earnings list, no cap", async () => {
    campaignTotal = 700;
    campaignRows = [{
      id: "c1", name: "Fall", sponsor: { name: "Bowie" },
      invoices: [
        { campaignId: "c1", number: "INV-1", status: "Paid", amount: 50_000, paidAt: null, zohoInvoiceId: "z1", issuedAt: null, dueAt: null },
        { campaignId: "c1", number: "INV-2", status: "sent", amount: 30_000, paidAt: null, zohoInvoiceId: "z2", issuedAt: null, dueAt: null },
        { campaignId: "c1", number: "INV-3", status: "VOID", amount: 99_000, paidAt: null, zohoInvoiceId: "z3", issuedAt: null, dueAt: null },
      ],
    }];
    orderRows = [
      { campaignId: "c1", sellPrice: 60_000, earning: { gross: 40_000, adjustment: -1_000, state: "PAID" } },
      { campaignId: "c1", sellPrice: 60_000, earning: { gross: 20_000, adjustment: 0, state: "PENDING" } },
    ];
    invoiceGroups = [
      { status: "Paid", _sum: { amount: 50_000 } },
      { status: "sent", _sum: { amount: 30_000 } },
      { status: "void", _sum: { amount: 99_000 } },
    ];
    const b = await run(listReconciliation, admin, { page: "59", size: "12" });
    expect(calls["earning.findMany"]).toBeUndefined();
    expect(b.page).toEqual({ page: 59, size: 12, total: 700, pages: 59 });
    const find = last("campaign.findMany");
    expect(find.skip).toBe(58 * 12);
    const set = andOf(find);
    expect(set[0]).toEqual({ AND: [{ tenantId: "t" }] });
    expect(set[1]).toEqual({ orders: { some: { earning: { is: { AND: [{ tenantId: "t" }] } } } } });
    expect(last("campaign.count").where).toEqual(find.where);
    expect(last("campaignOrder.findMany").where).toEqual({ campaignId: { in: ["c1"] }, earning: { is: { AND: [{ tenantId: "t" }] } } });
    expect((b.campaigns as Record<string, unknown>[])[0]).toMatchObject({
      campaignId: "c1", name: "Fall", sponsorName: "Bowie",
      contracted: 120_000, invoiced: 80_000, invoicePaid: 50_000,
      earningsRaised: 59_000, earningsPaid: 39_000,
    });
    expect(((b.campaigns as Record<string, unknown[]>[])[0]!.invoices)).toHaveLength(3);
    expect(b.totals).toEqual({ invoiced: 80_000, collected: 50_000, rate: 63, aging: [1_000, 2_000, 3_000, 4_000] });
  });

  it("ages outstanding invoices by days past due, paid and void excluded", async () => {
    await run(listReconciliation, admin);
    const cuts = calls["campaignInvoice.aggregate"]!.map((a) => (a.where as { AND: Args[] }).AND);
    expect(cuts).toHaveLength(4);
    for (const c of cuts) {
      expect(c[0]).toEqual({ campaign: { is: expect.objectContaining({ AND: expect.any(Array) }) } });
      expect(c[1]).toEqual({
        NOT: [{ status: { equals: "paid", mode: "insensitive" } }, { status: { equals: "void", mode: "insensitive" } }],
      });
    }
    expect(Object.keys(cuts[0]![2]!)).toEqual(["OR"]);
  });

  it("an empty set reads no page and answers zero totals", async () => {
    const b = await run(listReconciliation, admin);
    expect(b.campaigns).toEqual([]);
    expect(calls["campaign.findMany"]).toBeUndefined();
    expect(calls["campaignOrder.findMany"]).toBeUndefined();
    expect((b.totals as Record<string, unknown>).rate).toBeNull();
  });
});

describe("GET /earnings/invoices", () => {
  it("is a flat paged read through the reconciliation's campaign set", async () => {
    invoiceRows = [{
      campaignId: "c1", number: null, status: "sent", amount: 30_000, paidAt: null, zohoInvoiceId: "z2",
      issuedAt: new Date("2026-10-01T00:00:00Z"), dueAt: null, campaign: { name: "Fall", sponsor: { name: "Bowie" } },
    }];
    const b = await run(listInvoices, admin, { page: "1", size: "24" });
    expect(b.page).toEqual({ page: 1, size: 24, total: 1, pages: 1 });
    const find = last("campaignInvoice.findMany");
    expect((find.where as { campaign: { is: { AND: Args[] } } }).campaign.is.AND[0]).toEqual({ AND: [{ tenantId: "t" }] });
    expect(find.orderBy).toEqual([{ issuedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    expect(b.invoices).toEqual([{
      number: null, zohoInvoiceId: "z2", status: "sent", amount: 30_000, paidAt: null,
      issuedAt: "2026-10-01T00:00:00.000Z", dueAt: null, campaignId: "c1", campaign: "Fall", sponsor: "Bowie",
    }]);
  });
});
