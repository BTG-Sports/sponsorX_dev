import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   Deliverable reads — P5-FE-02 / -03 / -04.

   The rule worth pinning is the derived revision: requestRevision puts a
   deliverable back to DRAFT_SUBMITTED with the reason on its audit row, so
   "a revision is waiting on the athlete" must be the latest revision request
   newer than the latest upload — answered the moment a new version lands.
   And the private creative is only ever reached through an audited grant.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rows: unknown[] = [];
let audits: unknown[] = [];
let asset: unknown = null;
let listArgs: Record<string, unknown> = {};
const grants: string[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    deliverable: {
      findMany: (a: Record<string, unknown>) => ((listArgs = a), Promise.resolve(rows)),
      findFirst: () => Promise.resolve(rows[0] ?? null),
    },
    auditLog: { findMany: () => Promise.resolve(audits) },
    creativeAsset: { findFirst: () => Promise.resolve(asset) },
  },
}));
vi.mock("../src/lib/storage", () => ({
  presignPrivateDownload: (_a: unknown, key: string) => (grants.push(key), Promise.resolve(`https://signed/${key}`)),
}));

const { listDeliverables, readDeliverable, assetUrl } = await import("../src/routes/v1/deliverables");

const athlete = {
  userId: "u_1", tenantId: "t_1", roles: ["ATHLETE"], athleteId: "ath_1",
  sponsorId: null, guardianId: null, propertyId: null,
} as unknown as Actor;

function row(over: Record<string, unknown> = {}) {
  return {
    id: "dl_1", title: "Showroom post", dueDate: new Date("2026-10-10T00:00:00Z"), state: "DRAFT_SUBMITTED",
    publishedUrl: null, publishedAt: null,
    order: {
      id: "ord_1", jobId: "SX-05", job: { name: "Local Appearance" },
      athlete: { id: "ath_1", displayName: "JORDAN" },
      campaign: { id: "cmp_1", name: "Fall", sponsor: { name: "Bowie" } },
    },
    assets: [{ version: 1, uploadedAt: new Date("2026-10-01T00:00:00Z") }],
    ...over,
  };
}

async function run(h: unknown, req: Record<string, unknown>) {
  let body: Record<string, unknown> | undefined;
  await (h as (q: unknown, r: unknown, n: unknown) => Promise<void>)(
    { actor: athlete, query: {}, params: {}, ...req },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

beforeEach(() => {
  rows = [row()];
  audits = [];
  asset = null;
  listArgs = {};
  grants.length = 0;
});

describe("GET /deliverables", () => {
  it("is scoped, soonest due first, and narrows by real states only", async () => {
    await run(listDeliverables, { query: { state: "BTG_REVIEW,BOGUS" } });
    const where = listArgs.where as Record<string, unknown>;
    expect(where.AND).toBeDefined();
    expect(where.state).toEqual({ in: ["BTG_REVIEW"] });
    expect(listArgs.orderBy).toEqual({ dueDate: "asc" });
  });

  it("flags an appearance job and flattens the campaign", async () => {
    const d = ((await run(listDeliverables, {})).deliverables as Record<string, unknown>[])[0];
    expect(d.appearance).toBe(true);
    expect(d.campaign).toEqual({ id: "cmp_1", name: "Fall", sponsorName: "Bowie" });
    expect(d.latestAsset).toEqual({ version: 1, uploadedAt: "2026-10-01T00:00:00.000Z" });
  });

  it("an open revision: requested after the latest upload, and back with the athlete", async () => {
    audits = [{ entityId: "dl_1", after: { reason: "Show the logo", }, at: new Date("2026-10-02T00:00:00Z") }];
    const d = ((await run(listDeliverables, {})).deliverables as Record<string, unknown>[])[0];
    /* P5-BE-09 — `by` says who sent it back: a person, not the automatic checks. */
    expect(d.revision).toEqual({ reason: "Show the logo", at: "2026-10-02T00:00:00.000Z", by: "REVIEWER" });
  });

  it("a newer upload answers the revision", async () => {
    audits = [{ entityId: "dl_1", after: { reason: "Show the logo" }, at: new Date("2026-10-02T00:00:00Z") }];
    rows = [row({ assets: [{ version: 2, uploadedAt: new Date("2026-10-03T00:00:00Z") }, { version: 1, uploadedAt: new Date("2026-10-01T00:00:00Z") }] })];
    const d = ((await run(listDeliverables, {})).deliverables as Record<string, unknown>[])[0];
    expect(d.revision).toBeNull();
  });

  it("a revision on a deliverable that has moved on is not open", async () => {
    audits = [{ entityId: "dl_1", after: { reason: "x" }, at: new Date("2026-10-02T00:00:00Z") }];
    rows = [row({ state: "APPROVED" })];
    const d = ((await run(listDeliverables, {})).deliverables as Record<string, unknown>[])[0];
    expect(d.revision).toBeNull();
  });
});

describe("GET /deliverables/:id", () => {
  it("returns asset versions, never keys", async () => {
    const d = await run(readDeliverable, { params: { id: "dl_1" } });
    expect(d.assets).toEqual([{ version: 1, uploadedAt: "2026-10-01T00:00:00.000Z" }]);
    expect(JSON.stringify(d)).not.toMatch(/r2Key|t\//);
  });
  it("refuses a deliverable outside scope", async () => {
    rows = [];
    await expect(run(readDeliverable, { params: { id: "x" } })).rejects.toThrow();
  });
});

describe("GET /deliverables/:id/assets/:version/url", () => {
  it("issues an audited grant for a reachable version", async () => {
    asset = { r2Key: "t/t_1/deliverable/dl_1/abc", deliverableId: "dl_1" };
    const b = await run(assetUrl, { params: { id: "dl_1", version: "1" } });
    expect(b.url).toBe("https://signed/t/t_1/deliverable/dl_1/abc");
    expect(grants).toEqual(["t/t_1/deliverable/dl_1/abc"]);
  });
  it("issues nothing for an unreachable or malformed version", async () => {
    await expect(run(assetUrl, { params: { id: "dl_1", version: "1" } })).rejects.toThrow();
    await expect(run(assetUrl, { params: { id: "dl_1", version: "one" } })).rejects.toThrow();
    expect(grants).toEqual([]);
  });
});
