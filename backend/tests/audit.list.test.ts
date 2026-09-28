import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /audit-log — P8-FE-02. Pinned: admin-only; filters by entity, record,
   actor ("system" = the null actor) and action prefix; keyset paging returns
   a cursor only when there is a next page; actors resolve to emails.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: unknown[] = [];
let lastWhere: Record<string, unknown> = {};
vi.mock("../src/db/client", () => ({
  prisma: {
    auditLog: {
      findMany: (a: { where: Record<string, unknown> }) => ((lastWhere = a.where), Promise.resolve(rows)),
      groupBy: (a: { by: string[] }) =>
        Promise.resolve(a.by[0] === "entity" ? [{ entity: "Deliverable", _count: { _all: 3 } }] : [{ actorId: "u1", _count: { _all: 2 } }, { actorId: null, _count: { _all: 1 } }]),
    },
    user: { findMany: () => Promise.resolve([{ id: "u1", email: "admin@x.test", roles: ["BTG_ADMIN"] }]) },
  },
}));

const { listAudit } = await import("../src/routes/v1/audit");

const base = { userId: "u1", tenantId: "t", guardianId: null, propertyId: null, sponsorId: null, athleteId: null };
const admin = { ...base, roles: ["BTG_ADMIN"] } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"] } as unknown as Actor;

function row(i: number, actorId: string | null = "u1") {
  return {
    id: `al_${i}`, at: new Date(Date.UTC(2026, 9, 10 - i)), action: "deliverable.approve", entity: "Deliverable",
    entityId: "dl_1", actorId, before: { state: "BTG_REVIEW" }, after: { state: "APPROVED" },
  };
}

async function call(actor: Actor, query: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await listAudit({ actor, query } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return body!;
}

beforeEach(() => {
  rows = [row(1), row(2, null)];
  lastWhere = {};
});

describe("GET /audit-log", () => {
  it("is refused to a role without auditLog read", async () => {
    await expect(call(finance)).rejects.toThrow();
  });

  it("filters by entity, record, action prefix and actor", async () => {
    await call(admin, { entity: "Deliverable", entityId: "dl_1", action: "deliverable.", actorId: "u1" });
    expect(lastWhere).toMatchObject({ entity: "Deliverable", entityId: "dl_1", actorId: "u1", action: { startsWith: "deliverable." } });
    expect(lastWhere.AND).toBeDefined();
  });

  it("'system' filters to the null actor", async () => {
    await call(admin, { actorId: "system" });
    expect(lastWhere.actorId).toBeNull();
  });

  it("resolves actors and keeps system rows actor-less", async () => {
    const b = await call(admin);
    const r = b.rows as Array<{ actor: unknown }>;
    expect(r[0].actor).toEqual({ id: "u1", email: "admin@x.test", roles: ["BTG_ADMIN"] });
    expect(r[1].actor).toBeNull();
    expect(b.nextCursor).toBeNull();
  });

  it("returns a keyset cursor only when there is more", async () => {
    rows = Array.from({ length: 3 }, (_, i) => row(i + 1));
    const b = await call(admin, { limit: "2" });
    expect((b.rows as unknown[]).length).toBe(2);
    expect(b.nextCursor).toBe(`${new Date(Date.UTC(2026, 9, 8)).toISOString()}|al_2`);
    await call(admin, { cursor: b.nextCursor as string });
    expect(lastWhere.OR).toBeDefined();
  });

  it("offers facets for the filter menus", async () => {
    const f = (await call(admin)).facets as { entities: unknown[]; actors: unknown[] };
    expect(f.entities).toEqual([{ entity: "Deliverable", count: 3 }]);
    expect(f.actors).toEqual([{ id: "u1", email: "admin@x.test", count: 2 }, { id: "system", email: null, count: 1 }]);
  });
});
