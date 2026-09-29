import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /campaigns — the sponsor dashboard's portfolio (P4-FE-05, §9 screen 3).
   Counts for anyone who reads the campaign; money only for the roles §7.1
   gives it, and absent — not zero — for the rest.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: unknown[] = [];
let args: Record<string, unknown> = {};
vi.mock("../src/db/client", () => ({
  prisma: {
    campaign: {
      findMany: (a: Record<string, unknown>) => ((args = a), Promise.resolve(rows)),
      findFirst: (a: Record<string, unknown>) => ((args = a), Promise.resolve(rows[0] ?? null)),
    },
  },
}));

const { listCampaigns, readCampaign } = await import("../src/routes/v1/campaigns");

const base = { userId: "u_1", tenantId: "t_1", guardianId: null, propertyId: null };
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "spn_1", athleteId: null } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], sponsorId: null, athleteId: "ath_1" } as unknown as Actor;

const ROW = {
  id: "cmp_1", name: "Fall Push", state: "ACTIVE", budget: 500_000,
  startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"),
  sponsor: { name: "Bowie Auto Group" },
  brief: { package: { code: "LOCAL_BLITZ", name: "Local Blitz" } },
  orders: [
    { athleteId: "a1", sellPrice: 20_000, deliverables: [{ state: "PUBLISHED" }, { state: "BTG_REVIEW" }] },
    { athleteId: "a1", sellPrice: 15_000, deliverables: [{ state: "VERIFIED" }] },
    { athleteId: "a2", sellPrice: 25_000, deliverables: [{ state: "NOT_STARTED" }] },
  ],
  invoices: [
    { status: "paid", amount: 30_000 },
    { status: "overdue", amount: 10_000 },
    { status: "void", amount: 99_000 },
  ],
};

async function list(actor: Actor, query: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await listCampaigns({ actor, query } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return body as { campaigns: Record<string, unknown>[]; page: { hasMore: boolean; nextCursor: string | null } };
}
async function call(actor: Actor) {
  return (await list(actor)).campaigns[0];
}

beforeEach(() => {
  rows = [ROW];
  args = {};
});

describe("GET /campaigns", () => {
  it("is scoped, excludes cancelled/rejected orders, newest first", async () => {
    await call(sponsor);
    expect((args.where as Record<string, unknown>).AND).toBeDefined();
    const orders = (args.select as Record<string, { where: unknown }>).orders;
    expect(orders.where).toEqual({ state: { notIn: ["CANCELLED", "REJECTED"] } });
    expect(args.orderBy).toEqual([{ startDate: "desc" }, { id: "desc" }]);
  });

  it("counts distinct athletes and delivered deliverables", async () => {
    const c = await call(sponsor);
    expect(c.athletes).toBe(2);
    expect(c.deliverables).toEqual({ done: 2, total: 4 });
    expect(c.package).toEqual({ code: "LOCAL_BLITZ", name: "Local Blitz" });
  });

  it("gives the sponsor contracted, budget, invoiced and paid — void excluded", async () => {
    const c = await call(sponsor);
    expect(c.contracted).toBe(60_000);
    expect(c.budget).toBe(500_000);
    expect(c.invoiced).toBe(40_000);
    expect(c.paid).toBe(30_000);
  });

  it("never gives the athlete side a money key — and doesn't select invoices", async () => {
    rows = [{ ...ROW, invoices: undefined }];
    const c = await call(athlete);
    expect((args.select as Record<string, unknown>).invoices).toBeUndefined();
    for (const k of ["contracted", "budget", "invoiced", "paid"]) expect(k in c).toBe(false);
    expect(c.athletes).toBe(2);
  });
});

describe("GET /campaigns · paging (QA pass 8, F-9)", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...ROW, id: `cmp_${i}` }));
  const cursorOf = (startDate: Date, id: string) => Buffer.from(`${startDate.toISOString()}|${id}`).toString("base64url");

  it("defaults to 100 and says when there is more", async () => {
    rows = many(101);
    const b = await list(sponsor);
    expect(args.take).toBe(101);
    expect(b.campaigns).toHaveLength(100);
    /* Opaque keyset: the LAST row's (startDate, id), never a bare id. */
    expect(b.page).toEqual({ hasMore: true, nextCursor: cursorOf(ROW.startDate, "cmp_99") });
  });

  it("the last page says there is no more", async () => {
    rows = many(3);
    const b = await list(sponsor, { limit: "5" });
    expect(args.take).toBe(6);
    expect(b.page).toEqual({ hasMore: false, nextCursor: null });
  });

  it("continues strictly after the keyset — a WHERE, never a row lookup", async () => {
    rows = many(1);
    await list(sponsor, { cursor: cursorOf(ROW.startDate, "cmp_99"), limit: "100000" });
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
    expect(args.take).toBe(101);
    const and = (args.where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(2);
    expect(and[1]).toEqual({
      OR: [{ startDate: { lt: ROW.startDate } }, { startDate: ROW.startDate, id: { lt: "cmp_99" } }],
    });
    await list(sponsor, { limit: "-4" });
    expect(args.take).toBe(101);
  });

  it("QA pass 9: a cursor naming a deleted or foreign row still pages — nothing is looked up", async () => {
    rows = many(2);
    const b = await list(sponsor, { cursor: cursorOf(new Date("2026-10-01T00:00:00Z"), "someone_elses_cmp") });
    expect(b.campaigns).toHaveLength(2);
    /* The scope is always the first condition: a cursor can only narrow it. */
    expect(((args.where as { AND: Record<string, unknown>[] }).AND[0]).AND).toBeDefined();
  });

  it.each(["garbage", Buffer.from("not-a-date|x").toString("base64url"), Buffer.from("2026-01-01T00:00:00.000Z|").toString("base64url")])(
    "a tampered cursor %s is a 400 bad_cursor", async (cursor) => {
      await expect(list(sponsor, { cursor })).rejects.toMatchObject({ status: 400, code: "bad_cursor" });
    },
  );
});

describe("GET /campaigns/:id (QA pass 7, F-5)", () => {
  async function one(actor: Actor, id: string) {
    let body: Record<string, unknown> | undefined;
    await readCampaign({ actor, params: { id } } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
    return body!.campaign as Record<string, unknown>;
  }

  it("is scoped by id and returns the list's row shape and money gating", async () => {
    const c = await one(sponsor, "cmp_1");
    expect((args.where as Record<string, unknown>).id).toBe("cmp_1");
    expect((args.where as Record<string, unknown>).AND).toBeDefined();
    expect(c.contracted).toBe(60_000);
    rows = [{ ...ROW, invoices: undefined }];
    const a = await one(athlete, "cmp_1");
    for (const k of ["contracted", "budget", "invoiced", "paid"]) expect(k in a).toBe(false);
  });

  it("a campaign outside the caller's scope is a 403, not an empty body", async () => {
    rows = [];
    await expect(one(sponsor, "cmp_other")).rejects.toMatchObject({ status: 403 });
  });
});
