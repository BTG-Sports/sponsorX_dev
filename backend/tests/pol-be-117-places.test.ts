/* POL-BE-117 — where someone is from is picked from the place catalogue
   (US + East Africa, region, city), and the API holds every write to it. */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pl-test.invalid` } : null;
  },
}));

const { catalogueCity, catalogueRegion, checkPlace, isCatalogueCountry, placeCatalogue, PlaceError } = await import("../src/domain/places");
const { assertCountryStates } = await import("../src/domain/brief-country");
const { CampaignBriefInput } = await import("../src/contracts/campaign");
const { ProfileChangeInput } = await import("../src/contracts/profile-change");

const EAST_AFRICA = ["BI", "CD", "ET", "KE", "RW", "SO", "SS", "TZ", "UG"];

describe("POL-BE-117 · the catalogue", () => {
  it("is the United States and the nine East African countries, grouped, every one with regions", () => {
    const c = placeCatalogue();
    expect(c.groups.map((g) => g.label)).toEqual(["United States", "East Africa"]);
    expect(c.groups[0]!.countries).toEqual(["US"]);
    expect([...c.groups[1]!.countries].sort()).toEqual(EAST_AFRICA);
    for (const cc of ["US", ...EAST_AFRICA]) {
      expect(c.countries[cc]!.regions.length, cc).toBeGreaterThan(0);
      expect(c.countries[cc]!.sources.length, `${cc} names its sources`).toBeGreaterThan(0);
    }
  });

  it("the US is every state and DC, and every incorporated place — about 19,500", () => {
    const us = placeCatalogue().countries.US!;
    expect(us.regions).toHaveLength(51);
    const places = us.regions.reduce((n, r) => n + r.cities.length, 0);
    expect(places).toBeGreaterThan(19_000);
    expect(us.regions.every((r) => r.cities.length > 0)).toBe(true); // Hawaii too (its communities)
    expect(catalogueCity("US", "TX", "Austin")).toBe("Austin");
    expect(catalogueCity("US", "DC", "Washington")).toBe("Washington");
    expect(catalogueCity("US", "HI", "urban honolulu")).toBe("Urban Honolulu");
  });

  it("Tanzania has its 31 regions and Uganda its four, with their cities", () => {
    const tz = placeCatalogue().countries.TZ!;
    expect(tz.regions).toHaveLength(31);
    const dar = tz.regions.find((r) => r.name === "Dar es Salaam")!;
    expect(dar.cities).toContain("Dar es Salaam");
    const ug = placeCatalogue().countries.UG!;
    expect(ug.regions.map((r) => r.name).sort()).toEqual(["Central", "Eastern", "Northern", "Western"]);
    expect(ug.regions.flatMap((r) => r.cities)).toEqual(expect.arrayContaining(["Kampala", "Gulu", "Jinja", "Mbarara"]));
  });

  it("looks up regions and cities in any case and spells the city as the list does", () => {
    expect(isCatalogueCountry("tz")).toBe(true);
    expect(isCatalogueCountry("CA")).toBe(false);
    expect(catalogueRegion("us", "tx")?.name).toBe("Texas");
    expect(catalogueCity("US", "TX", "  aUSTIN ")).toBe("Austin");
    expect(catalogueCity("US", "TX", "Atlantis")).toBeNull();
    expect(catalogueCity("US", "ZZ", "Austin")).toBeNull();
  });
});

describe("POL-BE-117 · checkPlace", () => {
  const move = { countryChanged: false, regionChanged: true, checkCity: true };

  it("takes a listed place and returns the list's spelling", () => {
    expect(checkPlace({ countryCode: "US", regionCode: "TX", city: "austin", ...move })).toEqual({ city: "Austin" });
    expect(checkPlace({ countryCode: "US", regionCode: "TX", city: null, ...move })).toEqual({ city: null });
    expect(checkPlace({ countryCode: "US", regionCode: "TX", city: "  ", ...move })).toEqual({ city: null });
  });

  it("refuses a country, region or city that isn't on the list — in words", () => {
    expect(() => checkPlace({ countryCode: "CA", regionCode: "ON", city: null, ...move, countryChanged: true })).toThrow(/Choose your country from the list/);
    expect(() => checkPlace({ countryCode: "US", regionCode: "ZZ", city: null, ...move })).toThrow(/Choose your state from the list for United States/);
    expect(() => checkPlace({ countryCode: "US", regionCode: null, city: null, ...move })).toThrow(/Choose your state in United States/);
    expect(() => checkPlace({ countryCode: "US", regionCode: "TX", city: "Atlantis", ...move })).toThrow(/Choose your city from the list for Texas, United States/);
    expect(() => checkPlace({ countryCode: "US", regionCode: "TX", city: "Atlantis", ...move })).toThrow(PlaceError);
  });

  it("leaves what didn't change alone, and keeps a country outside the list on its old rules", () => {
    /* A city typed before the list existed, not touched by this write. */
    expect(checkPlace({ countryCode: "US", regionCode: "MD", city: "Silver Spring", countryChanged: false, regionChanged: false, checkCity: false })).toEqual({ city: "Silver Spring" });
    /* Already in Canada: no region or city list there — but nobody moves INTO Canada (above). */
    expect(checkPlace({ countryCode: "CA", regionCode: "ON", city: "Toronto", countryChanged: false, regionChanged: true, checkCity: true })).toEqual({ city: "Toronto" });
  });
});

describe("POL-BE-117 · campaign regions outside the US", () => {
  it("an East African brief may narrow to that country's regions — only real ones", () => {
    const dar = placeCatalogue().countries.TZ!.regions.find((r) => r.name === "Dar es Salaam")!.code;
    expect(() => assertCountryStates("TZ", [dar])).not.toThrow();
    expect(() => assertCountryStates("TZ", ["TX"])).toThrow(/Not a region of Tanzania: TX/);
    expect(() => assertCountryStates("UG", ["C", "W"])).not.toThrow();
    /* Elsewhere, still the whole country (POL-BE-107). */
    expect(() => assertCountryStates("CA", ["ON"])).toThrow(/only be chosen for the United States/);
    expect(() => assertCountryStates("US", ["TX"])).not.toThrow();
  });

  it("the contracts take one- to three-character region codes", () => {
    const base = { sponsorId: "s", objective: "o", budget: 1, startDate: "2026-12-01", endDate: "2026-12-20" };
    expect(CampaignBriefInput.parse({ ...base, countryCode: "UG", stateCodes: ["C"] }).stateCodes).toEqual(["C"]);
    expect(() => CampaignBriefInput.parse({ ...base, stateCodes: ["TEXAS"] })).toThrow();
    expect(ProfileChangeInput.parse({ identity: { countryCode: "tz", stateCode: "02", city: "Dar es Salaam" } }).identity).toMatchObject({ countryCode: "tz", stateCode: "02" });
    expect(() => ProfileChangeInput.parse({ identity: { countryCode: "Tanzania" } })).toThrow();
  });
});

/* ── through the API ─────────────────────────────────────────────────────── */

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-117 · an athlete's place, through the API", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "pl117_t";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const dar = () => placeCatalogue().countries.TZ!.regions.find((r) => r.name === "Dar es Salaam")!;

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const place = (id: string) => prisma.athlete.findUniqueOrThrow({ where: { id }, select: { countryCode: true, stateCode: true, city: true, majorityAge: true, majorityKnown: true, displayName: true } });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Places" } });
    await prisma.guardian.create({ data: { id: "pl117_g", tenantId: T, legalName: "Amani Mosha", email: "pl117_g@pl-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      { id: "pl117_neema", tenantId: T, slug: "pl117-neema", legalName: "Neema Mosha", displayName: "Neema", email: "pl117_neema@pl-test.invalid", sport: "Athletics", birthDate: new Date("2000-03-04"), state: "ACTIVE", stateCode: "MD", city: "Silver Spring" },
      { id: "pl117_baraka", tenantId: T, slug: "pl117-baraka", legalName: "Baraka Mosha", displayName: "Baraka", email: "pl117_baraka@pl-test.invalid", sport: "Football", birthDate: new Date("2012-05-06"), state: "ACTIVE", stateCode: "MD", guardianId: "pl117_g" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "pl117_u_admin", tenantId: T, clerkId: "pl117_admin", email: "pl117_admin@pl-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "pl117_u_neema", tenantId: T, clerkId: "pl117_neema", email: "pl117_neema@pl-test.invalid", roles: ["ATHLETE"], athleteId: "pl117_neema" },
      { id: "pl117_u_baraka", tenantId: T, clerkId: "pl117_baraka", email: "pl117_baraka@pl-test.invalid", roles: ["ATHLETE"], athleteId: "pl117_baraka" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("a city typed before the list existed doesn't block an unrelated edit", async () => {
    const r = await call("POST", "/athletes/pl117_neema/profile-changes", "pl117_neema", { identity: { displayName: "Neema M.", countryCode: "US", stateCode: "MD", city: "Silver Spring" } });
    expect(r.status, r.text).toBe(201);
    expect(await place("pl117_neema")).toMatchObject({ displayName: "Neema M.", city: "Silver Spring", stateCode: "MD" });
  });

  it("a city or region that isn't on the list is refused, saying which", async () => {
    const city = await call("POST", "/athletes/pl117_neema/profile-changes", "pl117_neema", { identity: { stateCode: "TX", city: "Atlantis" } });
    expect(city.status).toBe(400);
    expect(city.json.error).toMatchObject({ code: "unknown_place", message: expect.stringMatching(/city from the list for Texas/) });
    const country = await call("POST", "/athletes/pl117_neema/profile-changes", "pl117_neema", { identity: { countryCode: "CA", stateCode: "ON" } });
    expect(country.status).toBe(400);
    expect(country.json.error.message).toMatch(/country from the list/);
    /* Kenya without a Kenyan region: MD is not one. */
    const region = await call("POST", "/athletes/pl117_neema/profile-changes", "pl117_neema", { identity: { countryCode: "KE" } });
    expect(region.status).toBe(400);
    expect(region.json.error.message).toMatch(/county from the list for Kenya|region from the list for Kenya/i);
    expect(await place("pl117_neema")).toMatchObject({ countryCode: "US", stateCode: "MD", city: "Silver Spring" });
  });

  it("an adult moves to Dar es Salaam: country, region and city change, and the new country's age is worked out (flagged when the table has none)", async () => {
    const r = await call("POST", "/athletes/pl117_neema/profile-changes", "pl117_neema", { identity: { countryCode: "tz", stateCode: dar().code, city: "dar es salaam" } });
    expect(r.status, r.text).toBe(201);
    expect(await place("pl117_neema")).toMatchObject({ countryCode: "TZ", stateCode: dar().code, city: "Dar es Salaam" });
    const table = await prisma.ageOfMajority.findFirst({ where: { tenantId: T, countryCode: "TZ" } });
    expect((await place("pl117_neema")).majorityKnown).toBe(table !== null);
    const me = await call("GET", "/athletes/me", "pl117_neema");
    expect(me.json).toMatchObject({ countryCode: "TZ", stateCode: dar().code, city: "Dar es Salaam" });
  });

  it("a minor's move to a country that makes them an adult waits for BTG — country, region and city together — and BTG applies it whole", async () => {
    await prisma.ageOfMajority.create({ data: { tenantId: T, countryCode: "TZ", regionCode: "", age: 14 } }); // the table's floor; Baraka is 14
    const r = await call("POST", "/athletes/pl117_baraka/profile-changes", "pl117_baraka", { identity: { countryCode: "TZ", stateCode: dar().code, city: "Dar es Salaam" } });
    expect(r.status, r.text).toBe(201);
    expect(r.json.changes).toEqual([expect.objectContaining({ state: "PENDING", fields: { countryCode: "TZ", stateCode: dar().code, city: "Dar es Salaam" } })]);
    expect(await place("pl117_baraka")).toMatchObject({ countryCode: "US", stateCode: "MD", city: null });
    const ok = await call("POST", `/profile-changes/${r.json.id}/decision`, "pl117_admin", { decision: "APPLY" });
    expect(ok.status, ok.text).toBe(200);
    expect(await place("pl117_baraka")).toMatchObject({ countryCode: "TZ", stateCode: dar().code, city: "Dar es Salaam", majorityAge: 14, majorityKnown: true });
  });
});
