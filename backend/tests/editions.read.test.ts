import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   The NEXT screen reads — GET /editions, /editions/:id/ledger and
   /editions/:id/sale-candidates (P9-FE-03, -04). Pinned: the list folds
   inventory to counts and committed revenue from SOLD slots only; a buyer is
   named only to a campaign reader (a student sees "taken", not who); the page
   comes from the slot code; a candidate whose package needs the sold back
   cover is listed as unavailable, so the page map cannot book a second
   campaign onto it; selling is refused to a student outright.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

let slots: Array<Record<string, unknown>> = [];
const campaignFind = vi.fn();
vi.mock("../src/db/client", () => ({
  prisma: {
    edition: {
      findMany: async () => [
        {
          id: "ed_1", label: "Fall 2026", state: "SELLING", closeDate: new Date("2026-10-20T00:00:00Z"),
          publishTarget: new Date("2026-11-10T00:00:00Z"), printDate: null, pageCount: 8, thresholdCents: 500_000,
          contentReady: false, rightsCleared: false, revenueMet: false,
          publication: { id: "pub_1", name: "The Falcon", propertyId: "prop_1" },
        },
      ],
      findFirst: async () => ({ id: "ed_1" }),
    },
    adSlot: {
      findMany: async () => slots,
    },
    editionAsset: { findMany: async () => [{ id: "as_1", title: "Cover shoot" }] },
    campaign: { findMany: (...a: unknown[]) => campaignFind(...a) },
  },
}));

const { listEditions, ledger, saleCandidates } = await import("../src/routes/v1/editions");

const base = { userId: "u", tenantId: "t", guardianId: null, sponsorId: null, athleteId: null, studentId: null };
const admin = { ...base, propertyId: null, roles: ["BTG_ADMIN"] } as unknown as Actor;
const student = { ...base, propertyId: "prop_1", studentId: "st_1", roles: ["STUDENT"] } as unknown as Actor;

beforeEach(() => {
  slots = [
    { id: "s1", editionId: "ed_1", slotCode: "P02-FULL", kind: "FULL", priceCents: 80_000, campaignId: "c_sold", soldCents: 75_000, soldAt: new Date("2026-10-01T00:00:00Z") },
    { id: "s2", editionId: "ed_1", slotCode: "P03-QTR-A", kind: "QUARTER", priceCents: 25_000, campaignId: null, soldCents: null, soldAt: null },
    { id: "s3", editionId: "ed_1", slotCode: "BACK", kind: "BACK_COVER", priceCents: 100_000, campaignId: "c_sold", soldCents: 100_000, soldAt: new Date("2026-10-01T00:00:00Z") },
  ];
  campaignFind.mockReset();
});

async function call(handler: unknown, actor: Actor, params: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await (handler as (...a: unknown[]) => Promise<void>)(
    { actor, params, query: {} },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

describe("GET /editions", () => {
  it("folds inventory to counts; committed is sold value, not rack", async () => {
    const [e] = (await call(listEditions, admin)).editions as Array<Record<string, unknown>>;
    expect(e!.inventory).toEqual({ total: 3, sold: 2, committedCents: 175_000, rackCents: 205_000 });
    expect(e!.publication).toMatchObject({ name: "The Falcon" });
    expect(e!.closeDate).toBe("2026-10-20T00:00:00.000Z");
  });
  it("counts the digital rights gap for a reader of edition assets", async () => {
    const [e] = (await call(listEditions, admin)).editions as Array<Record<string, unknown>>;
    expect(e!.rightsPending).toBe(1);
  });
});

describe("GET /editions/:id/ledger", () => {
  it("names the buyer to a campaign reader and reads the page from the code", async () => {
    campaignFind.mockResolvedValue([{ id: "c_sold", name: "Fall push", sponsor: { name: "Northside" } }]);
    const rows = (await call(ledger, admin, { id: "ed_1" })).slots as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ slotCode: "P02-FULL", page: 2, sold: true, soldCents: 75_000, buyer: { sponsor: "Northside" } });
    expect(rows[1]).toMatchObject({ page: 3, sold: false });
    expect(rows[1]).not.toHaveProperty("buyer");
    expect(rows[2]).toMatchObject({ kind: "BACK_COVER", page: null });
  });
  it("a student sees a slot is taken, never who took it", async () => {
    const rows = (await call(ledger, student, { id: "ed_1" })).slots as Array<Record<string, unknown>>;
    expect(campaignFind).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ sold: true });
    expect(rows[0]).not.toHaveProperty("buyer");
  });
});

describe("GET /editions/:id/sale-candidates", () => {
  const pkg = (code: string, includes: unknown[]) => ({ package: { code, name: code, priceLow: 1500, includes } });
  it("marks a package that needs the sold back cover as unavailable", async () => {
    campaignFind.mockResolvedValue([
      { id: "c_new", name: "Winter", sponsor: { name: "Bowie" }, brief: pkg("NEXT_BACK", [{ kind: "AD_SLOT", code: "BACK_COVER" }]) },
      { id: "c_q", name: "Quarter", sponsor: { name: "Deli" }, brief: pkg("NEXT_QTR", [{ kind: "AD_SLOT", code: "QUARTER" }]) },
      { id: "c_none", name: "Athletes only", sponsor: { name: "X" }, brief: pkg("NIL", [{ kind: "NIL_JOB", code: "SX-01" }]) },
    ]);
    const list = (await call(saleCandidates, admin, { id: "ed_1" })).candidates as Array<Record<string, unknown>>;
    expect(list.map((c) => c.campaignId)).toEqual(["c_new", "c_q"]);
    expect(list[0]).toMatchObject({ positions: ["BACK_COVER"], unavailable: ["BACK_COVER"], package: { priceCents: 150_000 } });
    expect(list[1]).toMatchObject({ unavailable: [], holdsPlacements: false });
  });
  it("is a seller's read — a student is refused", async () => {
    await expect(call(saleCandidates, student, { id: "ed_1" })).rejects.toThrow();
  });
});
