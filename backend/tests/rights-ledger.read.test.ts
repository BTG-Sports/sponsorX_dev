import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /editions/:id/rights-ledger — P9-FE-09. Pinned: clearance per asset is
   rightsGap's answer (the transition's own query), digital on the publish
   target and print on the print date; evidence comes back with each grant;
   a role with no contentRight read gets assets and clearance, never grants;
   an edition outside scope is refused.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

let edition: Record<string, unknown> | null;
const assetFind = vi.fn();
const gapCalls: Array<{ on: Date; format: string }> = [];
vi.mock("../src/db/client", () => ({
  prisma: {
    edition: { findFirst: async () => edition },
    editionAsset: { findMany: (...a: unknown[]) => assetFind(...a) },
  },
}));
vi.mock("../src/domain/content-rights", async (orig) => ({
  ...(await orig<typeof import("../src/domain/content-rights")>()),
  rightsGap: async (_tx: unknown, _t: string, _e: string, format: string, on: Date) => {
    gapCalls.push({ format, on });
    return format === "DIGITAL" ? [{ id: "a2", title: "Candids" }] : [{ id: "a1", title: "Feature" }, { id: "a2", title: "Candids" }];
  },
}));

const { rightsLedger } = await import("../src/routes/v1/rights");

const base = { userId: "u", tenantId: "t", guardianId: null, sponsorId: null, athleteId: null, studentId: null, propertyId: null };
const admin = { ...base, roles: ["BTG_ADMIN"] } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"] } as unknown as Actor;

const PUBLISH = new Date("2026-11-10T00:00:00Z");
const PRINT = new Date("2026-11-20T00:00:00Z");

beforeEach(() => {
  edition = { id: "ed", label: "Fall", state: "CLOSED", publishTarget: PUBLISH, printDate: PRINT };
  gapCalls.length = 0;
  assetFind.mockReset();
  assetFind.mockResolvedValue([
    {
      id: "a1", kind: "ARTICLE", title: "Feature", sourceKind: "STUDENT", studentId: "s1", athleteId: null, campaignId: null, createdAt: new Date(),
      rights: [{ id: "r1", grantorKind: "STUDENT", grantorRef: "Jordan", mayPublishDigital: true, mayPublishPrint: false, mayPromote: false, mayReuseCommercially: false, territory: null, startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: null, attribution: null, acceptanceId: "acc_1", licenseRef: null }],
    },
    { id: "a2", kind: "PHOTO", title: "Candids", sourceKind: "STUDENT", studentId: "s2", athleteId: null, campaignId: null, createdAt: new Date(), rights: [] },
  ]);
});

async function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  await (rightsLedger as unknown as (...a: unknown[]) => Promise<void>)(
    { actor, params: { id: "ed" } },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

describe("GET /editions/:id/rights-ledger", () => {
  it("clearance is rightsGap's: digital on the publish target, print on the print date", async () => {
    const assets = (await call(admin)).assets as Array<Record<string, unknown>>;
    expect(gapCalls).toEqual([{ format: "DIGITAL", on: PUBLISH }, { format: "PRINT", on: PRINT }]);
    expect(assets[0]).toMatchObject({ id: "a1", clearedDigital: true, clearedPrint: false });
    expect(assets[1]).toMatchObject({ id: "a2", clearedDigital: false, clearedPrint: false });
  });
  it("returns each grant with its evidence, dates as ISO", async () => {
    const [a1] = (await call(admin)).assets as Array<{ rights: Array<Record<string, unknown>> }>;
    expect(a1!.rights[0]).toMatchObject({ acceptanceId: "acc_1", licenseRef: null, startsAt: "2026-09-01T00:00:00.000Z", endsAt: null });
  });
  it("is refused outside the edition-asset matrix", async () => {
    await expect(call(finance)).rejects.toThrow();
  });
  it("an edition outside scope is refused", async () => {
    edition = null;
    await expect(call(admin)).rejects.toThrow();
  });
});
