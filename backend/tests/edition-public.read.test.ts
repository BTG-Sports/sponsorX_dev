import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /public/editions/:school/:id — P9-FE-07. Pinned: only a PUBLISHED
   edition answers (the query asks for published states; nothing else
   reaches the body); a wrong school slug is the same 404; contents require
   a digital right in force; bylines are display names; sponsors carry no
   price or sale value anywhere in the answer.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

let edition: Record<string, unknown> | null;
const editionWhere: unknown[] = [];
const assetWhere: unknown[] = [];
vi.mock("../src/db/client", () => ({
  prisma: {
    edition: { findFirst: async (a: { where: unknown }) => (editionWhere.push(a.where), edition) },
    editionAsset: {
      findMany: async (a: { where: unknown }) => (assetWhere.push(a.where), [
        { id: "as1", kind: "ARTICLE", title: "Friday lights", studentId: "st1" },
        { id: "as2", kind: "PHOTO", title: "Aerial", studentId: null },
      ]),
    },
    adSlot: {
      findMany: async () => [{ id: "s1", slotCode: "BACK", kind: "BACK_COVER", soldCents: 100000, priceCents: 100000, campaign: { sponsor: { name: "Bowie Auto" } } }],
    },
    student: { findMany: async () => [{ id: "st1", displayName: "Jordan R." }] },
  },
}));

const { readPublic } = await import("../src/routes/v1/editions");

beforeEach(() => {
  editionWhere.length = 0;
  assetWhere.length = 0;
  edition = {
    id: "ed", tenantId: "t", label: "Fall 2026", state: "PUBLISHED_DIGITAL",
    publishTarget: new Date("2026-11-03T00:00:00Z"), printDate: null,
    publication: { name: "The Current", property: { slug: "northside", name: "Northside High", city: "Bowie", stateCode: "MD" } },
  };
});

async function call(school: string) {
  let body: Record<string, unknown> | undefined;
  await (readPublic as unknown as (...a: unknown[]) => Promise<void>)(
    { params: { school, id: "ed" }, get: () => undefined, ip: "1.1.1.1", socket: {} },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

describe("GET /public/editions/:school/:id", () => {
  it("asks only for published states", async () => {
    await call("northside");
    expect(JSON.stringify(editionWhere[0])).toContain("PUBLISHED_DIGITAL");
    expect(JSON.stringify(editionWhere[0])).not.toContain("SELLING");
  });
  it("an unpublished or missing edition is a 404", async () => {
    edition = null;
    await expect(call("northside")).rejects.toMatchObject({ status: 404 });
  });
  it("the wrong school slug is the same 404", async () => {
    await expect(call("eastfield")).rejects.toMatchObject({ status: 404 });
  });
  it("contents need a digital right in force; bylines are display names", async () => {
    const b = await call("northside");
    expect(JSON.stringify(assetWhere[0])).toContain("mayPublishDigital");
    expect(b.contents).toEqual([
      { id: "as1", kind: "ARTICLE", title: "Friday lights", byline: "Jordan R." },
      { id: "as2", kind: "PHOTO", title: "Aerial", byline: null },
    ]);
  });
  it("sponsors are named, never priced", async () => {
    const b = await call("northside");
    expect(b.sponsors).toEqual([{ id: "s1", slotCode: "BACK", kind: "BACK_COVER", sponsor: "Bowie Auto" }]);
    expect(JSON.stringify(b)).not.toMatch(/Cents|price|legalName|email/);
  });
});
