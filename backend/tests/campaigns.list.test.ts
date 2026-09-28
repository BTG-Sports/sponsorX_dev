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
    },
  },
}));

const { listCampaigns } = await import("../src/routes/v1/campaigns");

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

async function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  await listCampaigns({ actor } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return (body!.campaigns as Record<string, unknown>[])[0];
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
    expect(args.orderBy).toEqual({ startDate: "desc" });
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
