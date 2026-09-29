import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   The property portal's server-paged reads (2026-09-29): /team/athletes and
   /team/inventory. Own-property scope first, filters in the database, counts
   computed by COUNT not by the browser.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

const calls: { model: string; op: string; args: Record<string, any> }[] = [];
let athletes: unknown[] = [];
let items: unknown[] = [];
const model = (name: string, rows: () => unknown[]) => ({
  findMany: (args: any) => (calls.push({ model: name, op: "findMany", args }), Promise.resolve(rows())),
  findFirst: (args: any) => (calls.push({ model: name, op: "findFirst", args }), Promise.resolve({ id: "prop_1", name: "North High", kind: "SCHOOL" })),
  count: (args: any) => (calls.push({ model: name, op: "count", args }), Promise.resolve(rows().length)),
});
vi.mock("../src/db/client", () => ({
  prisma: {
    property: model("property", () => []),
    athlete: model("athlete", () => athletes),
    inventoryItem: model("inventoryItem", () => items),
  },
}));

const { teamAthletesPage, teamInventoryPage } = await import("../src/domain/team");

const pm = { userId: "u", tenantId: "t1", roles: ["PROPERTY_MGR"], propertyId: "prop_1" } as unknown as Actor;
const req = { page: 1, size: 12, skip: 0, take: 12 };

beforeEach(() => {
  calls.length = 0;
  athletes = [{ id: "a1", displayName: "Ada" }];
  items = [{ id: "i1", title: "Banner", athlete: { displayName: "Ada" } }, { id: "i2", title: "Signage", athlete: null }];
});

describe("GET /team/athletes", () => {
  it("scopes first, filters in the DB, pages, and counts", async () => {
    const r = await teamAthletesPage(pm, req, { q: "ad", state: ["ACTIVE"] });
    const read = calls.find((c) => c.model === "athlete" && c.op === "findMany")!;
    expect(read.args.where.AND).toHaveLength(3);
    expect(read.args.where.AND[1]).toEqual({ displayName: { contains: "ad", mode: "insensitive" } });
    expect(read.args.where.AND[2]).toEqual({ state: { in: ["ACTIVE"] } });
    expect(read.args.take).toBe(12);
    /* No nested inventory on the paged read — the browser never gets it all. */
    expect(read.args.select.inventory).toBeUndefined();
    expect(r.page).toEqual({ page: 1, size: 12, total: 1, pages: 1 });
    expect(r.counts).toEqual({ athletes: 1, active: 1 });
  });

  it("refuses a caller who doesn't manage a property", async () => {
    await expect(teamAthletesPage({ ...pm, propertyId: null } as Actor, req, {})).rejects.toMatchObject({ status: 403 });
  });
});

describe("GET /team/inventory", () => {
  it("is the team's items and its athletes' items, scoped, with the owner named", async () => {
    const r = await teamInventoryPage(pm, req, { active: true, q: "ban" });
    const read = calls.find((c) => c.model === "inventoryItem" && c.op === "findMany")!;
    const mine = read.args.where.AND[0];
    expect(mine.AND[1]).toEqual({ OR: [{ propertyId: "prop_1" }, { athlete: { propertyId: "prop_1" } }] });
    expect(read.args.where.AND).toContainEqual({ active: true });
    expect(read.args.where.AND).toContainEqual({ title: { contains: "ban", mode: "insensitive" } });
    expect(r.inventory.map((i) => i.owner)).toEqual(["Ada", null]);
    expect(r.counts).toEqual({ items: 2, active: 2 });
  });
});
