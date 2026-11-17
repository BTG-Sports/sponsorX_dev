import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-107 — the country a campaign brief targets.

   A brief names one country (ISO alpha-2, default US). Only athletes there are
   matched (the shortlist and the match engine), staffed (the catalogue's
   yes / no) or counted for automatic approval. US states narrow a US brief and
   are refused on any other (400). A brief needs no package — the sponsor's
   own campaign (POL-FE-107) — and still gets the country.

   The pure rules first; then, against a real database and through the API
   where a sponsor acts, create and edit, approval, the shortlist, the
   catalogue reads, the match engine, and nothing across tenants.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@b107-test.invalid` } : null;
  },
}));

const { BriefCountryError, assertCountryStates, briefCountry, isCountryCode } = await import("../src/domain/brief-country");
const { CampaignBriefInput, CampaignBriefPatch } = await import("../src/contracts/campaign");
const { athleteFit } = await import("../src/domain/matching");

describe("POL-BE-107 · the pure rules", () => {
  it("a country is an assigned two-letter code, upper-cased; absent is US", () => {
    expect(briefCountry(undefined)).toBe("US");
    expect(briefCountry(null)).toBe("US");
    expect(briefCountry("  ")).toBe("US");
    expect(briefCountry("ca")).toBe("CA");
    expect(briefCountry("GB")).toBe("GB");
    for (const bad of ["ZZ", "XX", "EU", "UN", "USA", "1A", "U"]) expect(() => briefCountry(bad), bad).toThrow(BriefCountryError);
    expect(isCountryCode("us")).toBe(false); // upper case only, after briefCountry
    expect(new BriefCountryError("x").status).toBe(400);
  });

  it("states are US states: allowed only on a US brief", () => {
    expect(() => assertCountryStates("US", ["TX", "CA"])).not.toThrow();
    expect(() => assertCountryStates("CA", [])).not.toThrow();
    expect(() => assertCountryStates("CA", [""])).not.toThrow();
    expect(() => assertCountryStates("CA", ["TX"])).toThrow(/only be chosen for the United States/);
  });

  it("the contract defaults the country to US and takes two letters in either case", () => {
    const base = { sponsorId: "s", objective: "o", budget: 1, startDate: "2026-12-01", endDate: "2026-12-20" };
    expect(CampaignBriefInput.parse(base).countryCode).toBe("US");
    expect(CampaignBriefInput.parse({ ...base, countryCode: "ca" }).countryCode).toBe("ca");
    expect(() => CampaignBriefInput.parse({ ...base, countryCode: "USA" })).toThrow();
    expect(CampaignBriefPatch.parse({}).countryCode).toBeUndefined();
  });

  it("athleteFit narrows to the country (upper case, as the athlete's is held); no country means any", () => {
    expect(athleteFit([], [], [], "CA")).toMatchObject({ countryCode: "CA" });
    expect(athleteFit([], [], [], "ca")).toMatchObject({ countryCode: "CA" });
    expect(athleteFit([], [], [])).not.toHaveProperty("countryCode");
    expect(athleteFit([], [], [], null)).not.toHaveProperty("countryCode");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-107 · a brief's country, end to end", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { eligibleForBrief } = await import("../src/domain/matching");
  const { listTargeting, packageStaffing } = await import("../src/domain/catalogue");
  const { gatherCandidates } = await import("../src/domain/match-engine");
  type Actor = import("../src/auth/actor").Actor;

  const T = "b107_tenant_a";
  const OTHER = "b107_tenant_b";
  const DAY = 86_400_000;
  const isoDay = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
  const p = (tenant: string, s: string) => `${tenant}_${s}`;
  const A = (s: string) => p(T, s);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  let seq = 0;
  async function athlete(tenant: string, countryCode: string, stateCode: string | null) {
    const id = p(tenant, `ath${seq++}`);
    await prisma.athlete.create({ data: {
      id, tenantId: tenant, slug: id, legalName: `B107 Sam ${id}`, displayName: `B107 Sam ${id}`,
      sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE", countryCode, stateCode,
    } });
    return id;
  }

  const us: string[] = [];
  const ca: string[] = [];
  let usItem = "";

  async function seed(tenant: string) {
    await prisma.tenant.create({ data: { id: tenant, name: `B107 ${tenant}` } });
    await prisma.sponsor.create({ data: { id: p(tenant, "good"), tenantId: tenant, name: `B107 good ${tenant}`, categories: [] } });
    await prisma.user.create({ data: {
      id: p(tenant, "sa"), tenantId: tenant, clerkId: p(tenant, "sa"), email: `${p(tenant, "sa")}@b107-test.invalid`,
      roles: ["SPONSOR_ADMIN"], sponsorId: p(tenant, "good"),
    } });
    await prisma.user.create({ data: {
      id: p(tenant, "an"), tenantId: tenant, clerkId: p(tenant, "an"), email: `${p(tenant, "an")}@b107-test.invalid`,
      roles: ["SPONSOR_ANALYST"], sponsorId: p(tenant, "good"),
    } });
    await prisma.user.create({ data: { id: p(tenant, "cm"), tenantId: tenant, clerkId: p(tenant, "cm"), email: `${p(tenant, "cm")}@b107-test.invalid`, roles: ["CAMPAIGN_MGR"] } });
    await prisma.nilJob.create({ data: {
      id: p(tenant, "SX-01"), tenantId: tenant, name: "Story Drop", baseLow: 25, baseHigh: 50, sellLow: 75, sellHigh: 125, sellFloorEmerging: 70, sellFloorCreator: 88, sellFloorPremium: 105,
    } });
    await prisma.sponsorPackage.create({ data: {
      id: p(tenant, "blitz"), tenantId: tenant, code: "LOCAL_BLITZ", name: "Local Blitz", priceLow: 1_500, priceHigh: 2_400,
      athleteCountMin: 5, athleteCountMax: 9, lineItems: [{ jobCode: "SX-01", quantityPerAthlete: 1 }],
    } });
  }

  beforeAll(async () => {
    await wipe();
    await seed(T);
    await seed(OTHER);
    /* Tenant A: five in the US, three in Canada. Tenant B: six in Canada — never A's. */
    for (const st of ["TX", "TX", "MD", "VA", "TX"]) us.push(await athlete(T, "US", st));
    for (let i = 0; i < 3; i++) ca.push(await athlete(T, "CA", "ON"));
    for (let i = 0; i < 6; i++) await athlete(OTHER, "CA", "ON");
    usItem = (await prisma.inventoryItem.create({ data: {
      tenantId: T, title: "B107 story", kind: "SOCIAL_POST", priceCents: 10_000, categories: [], athleteId: us[0]!, active: true,
    }, select: { id: true } })).id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const body = (extra: Record<string, unknown> = {}) => ({
    sponsorId: A("good"), objective: "Reach local soccer fans in the weeks before the new season starts", budget: 150_000, packageId: A("blitz"),
    startDate: isoDay(10), endDate: isoDay(38), sports: ["Soccer"], stateCodes: [], categories: [],
    ...extra,
  });
  const file = async (extra: Record<string, unknown> = {}, who = A("sa")) => call("POST", "/briefs", who, body(extra));
  const stored = (id: string) => prisma.campaignBrief.findUniqueOrThrow({ where: { id }, select: { countryCode: true, stateCodes: true, state: true, autoApproved: true, heldKeys: true, heldReasons: true } });
  const cm: Actor = { userId: A("cm"), tenantId: T, roles: ["CAMPAIGN_MGR"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  const sponsor: Actor = { userId: A("sa"), tenantId: T, roles: ["SPONSOR_ADMIN"], sponsorId: A("good"), athleteId: null, guardianId: null, propertyId: null };

  it("a brief with no package and no country is the sponsor's own campaign, in the US", async () => {
    const r = await file({ packageId: undefined });
    expect(r.status, r.text).toBe(201);
    expect(await stored(r.json.id)).toMatchObject({ countryCode: "US" });
  });

  it("stores the country upper-cased and returns it on the brief", async () => {
    const r = await file({ countryCode: "ca" });
    expect(r.status, r.text).toBe(201);
    expect((await stored(r.json.id)).countryCode).toBe("CA");
    const read = await call("GET", `/briefs/${r.json.id}`, A("sa"));
    expect(read.status, read.text).toBe(200);
    expect(read.json.countryCode ?? read.json.brief?.countryCode).toBe("CA");
  });

  it("refuses states outside the US, an invented country and a three-letter one — nothing is written", async () => {
    const before = await prisma.campaignBrief.count({ where: { tenantId: T } });
    const states = await file({ countryCode: "CA", stateCodes: ["TX"] });
    expect(states.status, states.text).toBe(400);
    expect(states.json.error.message).toMatch(/only be chosen for the United States/);
    expect((await file({ countryCode: "ZZ" })).status).toBe(400);
    expect((await file({ countryCode: "USA" })).status).toBe(400);
    expect(await prisma.campaignBrief.count({ where: { tenantId: T } })).toBe(before);
  });

  it("automatic approval counts only that country's athletes", async () => {
    /* Five in the US: the package's minimum, approved. */
    const usBrief = await file({ countryCode: "US" });
    expect(usBrief.status, usBrief.text).toBe(201);
    expect(usBrief.json.autoApproved, JSON.stringify(await stored(usBrief.json.id))).toBe(true);
    /* Three in Canada (tenant B's six don't count): held for athletes. */
    const caBrief = await file({ countryCode: "CA" });
    expect(caBrief.status, caBrief.text).toBe(201);
    expect(caBrief.json.autoApproved).toBe(false);
    expect((await stored(caBrief.json.id)).heldKeys).toContain("ATHLETES");
    expect(caBrief.json.waitingOn).toBe("ATHLETES");
  });

  it("the shortlist holds only the brief's country", async () => {
    const r = await file({ countryCode: "CA", packageId: undefined });
    const ids = (await eligibleForBrief(cm, r.json.id)).map((a) => a.id).sort();
    expect(ids).toEqual([...ca].sort());
    const usR = await file({ packageId: undefined });
    const usIds = (await eligibleForBrief(cm, usR.json.id)).map((a) => a.id).sort();
    expect(usIds).toEqual([...us].sort());
  });

  it("an edit keeps country and states consistent", async () => {
    const held = await file({ countryCode: "CA", packageId: undefined, budget: 0 });
    expect(held.status, held.text).toBe(201);
    expect((await stored(held.json.id)).state).toBe("DRAFT");
    const id = held.json.id as string;
    /* States on a Canadian brief: refused. */
    expect((await call("PATCH", `/briefs/${id}`, A("sa"), { stateCodes: ["TX"] })).status).toBe(400);
    /* To the US with states: fine. */
    const toUs = await call("PATCH", `/briefs/${id}`, A("sa"), { countryCode: "us", stateCodes: ["TX"] });
    expect(toUs.status, toUs.text).toBe(200);
    expect(await stored(id)).toMatchObject({ countryCode: "US", stateCodes: ["TX"] });
    /* Abroad again while keeping the states: refused; clearing them in the same edit: fine. */
    expect((await call("PATCH", `/briefs/${id}`, A("sa"), { countryCode: "GB" })).status).toBe(400);
    const toGb = await call("PATCH", `/briefs/${id}`, A("sa"), { countryCode: "GB", stateCodes: [] });
    expect(toGb.status, toGb.text).toBe(200);
    expect(await stored(id)).toMatchObject({ countryCode: "GB", stateCodes: [] });
  });

  it("a sponsor analyst and another tenant's sponsor cannot file one", async () => {
    expect((await file({ countryCode: "CA" }, A("an"))).status).toBe(403);
    expect((await file({ countryCode: "CA" }, p(OTHER, "sa"))).status).toBe(403);
  });

  it("the catalogue: countries offered, states of US athletes only, staffing by country", async () => {
    const t = await listTargeting(sponsor);
    expect(t.countryCodes).toEqual(["CA", "US"]);
    expect(t.stateCodes).toEqual(["MD", "TX", "VA"]); // never Ontario
    const staff = async (countryCode?: string) =>
      (await packageStaffing(sponsor, { sports: [], stateCodes: [], countryCode })).find((x) => x.id === A("blitz"))!.staffable;
    expect(await staff("US")).toBe(true);
    expect(await staff("CA")).toBe(false);
    expect(await staff(undefined)).toBe(true);
    const viaApi = await call("GET", "/catalogue/staffing?country=ca", A("sa"));
    expect(viaApi.status, viaApi.text).toBe(200);
    expect(viaApi.json.packages.find((x: { id: string }) => x.id === A("blitz")).staffable).toBe(false);
  });

  it("the match engine leaves out athletes abroad and the items they own", async () => {
    const brief = {
      sponsorId: A("good"), sports: [], countryCode: "CA", stateCodes: [], categories: [], excludedCategories: [], channels: [],
      audienceTiers: [], audienceMinFollowers: null, budget: 100_000, slots: 1, startDate: new Date(Date.now() + 10 * DAY), endDate: new Date(Date.now() + 38 * DAY),
    };
    const out = await gatherCandidates(T, brief, [], new Date());
    const athletes = out.filter((c) => c.kind === "athlete").map((c) => c.refId).sort();
    expect(athletes).toEqual([...ca].sort());
    expect(out.some((c) => c.kind === "inventory" && c.refId === usItem)).toBe(false);
    /* With no country, the US athlete's item is a candidate as before. */
    const any = await gatherCandidates(T, { ...brief, countryCode: null }, [], new Date());
    expect(any.some((c) => c.kind === "inventory" && c.refId === usItem)).toBe(true);
  });
});
