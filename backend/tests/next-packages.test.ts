import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NEXT_PACKAGES, SPONSOR_PACKAGES } from "../src/domain/sponsor-packages";

/* --------------------------------------------------------------------------
   The SponsorX NEXT packages — P9-BE-01, spec §4 and §5.2.

   "NEXT-LOCAL-1500 and the ad-only slots exist as SponsorPackage rows with
   empty lineItems, flow through the marketplace and the Zoho Deal sync, and
   are never evaluated by the margin floor because they carry no athlete
   cost."

   Each clause is checked on the path it runs on: the worker's real seed SQL
   writes the rows, the sponsor catalogue read lists them, a brief on one is
   qualified and drained into a fake Zoho org as a Deal, and the margin floor
   is shown to be reachable only from CampaignOrder creation, which needs an
   athlete and a job a NEXT package does not have.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const byCode = (code: string) => NEXT_PACKAGES.find((p) => p.code === code)!;

describe("P9-BE-01 · the NEXT rate card as packages (rates: P9-PMO-01)", () => {
  it("has the Local Business Package and every ad-only slot, at single prices", () => {
    expect(NEXT_PACKAGES.map((p) => [p.code, p.priceLow])).toEqual([
      ["NEXT-AD-QUARTER", 250], ["NEXT-AD-HALF", 500], ["NEXT-AD-FULL", 800],
      ["NEXT-AD-BACK-COVER", 1000], ["NEXT-LOCAL-1500", 1500], ["NEXT-PRESENTING", 3000],
    ]);
    for (const p of NEXT_PACKAGES) expect(p.priceHigh, `${p.code} is a range`).toBe(p.priceLow);
  });

  it("carries no athlete: empty lineItems, zero athletes, everything in includes", () => {
    for (const p of NEXT_PACKAGES) {
      expect(p.lineItems, p.code).toEqual([]);
      expect([p.athleteCountMin, p.athleteCountMax], p.code).toEqual([0, 0]);
      expect(p.includes!.length, p.code).toBeGreaterThan(0);
    }
    /* The social posts are student-created (spec §0) — inventory, not NIL. */
    expect(byCode("NEXT-LOCAL-1500").includes).toContainEqual(
      { kind: "STUDENT_CONTENT", code: "STUDENT_SOCIAL_POST", quantity: 4 });
  });

  it("records the back cover and the presenting sponsor as quantity one", () => {
    expect(byCode("NEXT-AD-BACK-COVER").includes).toEqual([{ kind: "AD_SLOT", code: "BACK_COVER", quantity: 1 }]);
    expect(byCode("NEXT-PRESENTING").includes).toEqual(
      [{ kind: "PRESENTING", code: "NEXT_PRESENTING_SPONSOR", quantity: 1 }]);
  });

  it("is in the list the worker seeds on boot", () => {
    for (const p of NEXT_PACKAGES) expect(SPONSOR_PACKAGES).toContain(p);
  });
});

describe("P9-BE-01 · the margin floor never evaluates a NEXT package", () => {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (p.includes("generated")) return [];
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });

  it("the floor runs only where a CampaignOrder line is created — and that needs an athlete and a job", () => {
    /* Every call of either floor rule, outside the file that defines them. */
    const callers = files(src)
      .filter((f) => !f.endsWith("margin-floor.ts"))
      .filter((f) => /\bassert(Line)?ClearsFloor\(|\bassertBudgetCarriesLine\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f).replaceAll("\\", "/"));
    /* 2S2-BE-03 — a formal offer becomes a CampaignOrder line on acceptance,
       so it prices one too: same athlete, job and pay, and the same rule. */
    expect(callers.sort()).toEqual(["domain/campaign-order.ts", "domain/offer.ts"]);
    expect(readFileSync(join(src, "domain/offer.ts"), "utf8")).toMatch(/assertLineClearsFloor\(input\.jobId, athlete\.tier \?\? null, input\.compensation/);
    /* The one path takes an athlete, a job and the athlete's pay — none of
       which a package with empty lineItems can supply. A NEXT sale is a
       Campaign with no CampaignOrder (spec §5.2), so it never gets here. */
    const order = readFileSync(join(src, "domain/campaign-order.ts"), "utf8");
    expect(order).toMatch(/assertLineClearsFloor\(\s*input\.jobId, athlete\?\.tier \?\? null, input\.compensation/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-01 · seeded, listed in the marketplace, synced to Zoho as a Deal", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { listPackages } = await import("../src/domain/catalogue");
  const { createBrief, transitionBrief } = await import("../src/domain/brief");
  const jobs = await import("../worker/jobs/zoho-sync.mts");
  const { FakeZoho } = await import("./support/fake-zoho");

  const T = "nx_tenant";
  const staff = {
    userId: "nx_staff", tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
  const sponsor = { ...staff, userId: "nx_sponsor", roles: ["SPONSOR_ADMIN" as const], sponsorId: "nx_business" };

  async function clean() {
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.syncTask.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.campaignBrief.deleteMany({ where: { tenantId: T } });
    await prisma.sponsorPackage.deleteMany({ where: { tenantId: T } });
    await prisma.sponsorContact.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT package test tenant" } });
    await prisma.user.create({
      data: { id: "nx_staff", tenantId: T, clerkId: "clerk_nx_staff", email: "ops@btg.test", roles: ["BTG_ADMIN"] },
    });
    await prisma.sponsor.create({ data: { id: "nx_business", tenantId: T, name: "Kim's Auto Care" } });
    /* The worker's own seed SQL, not a hand-written insert. */
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await seedPackages(client, T);
    } finally {
      client.release();
      await pool.end();
    }
  });

  afterAll(clean);

  it("exist as SponsorPackage rows with empty lineItems", async () => {
    const rows = await prisma.sponsorPackage.findMany({
      where: { tenantId: T, code: { startsWith: "NEXT-" } },
      select: { code: true, lineItems: true, athleteCountMax: true },
    });
    expect(rows.map((r) => r.code).sort()).toEqual(NEXT_PACKAGES.map((p) => p.code).sort());
    for (const r of rows) {
      expect(r.lineItems, r.code).toEqual([]);
      expect(r.athleteCountMax, r.code).toBe(0);
    }
  });

  it("a sponsor browsing the marketplace sees them, at their prices", async () => {
    const listed = await listPackages(sponsor);
    const local = listed.find((p) => p.code === "NEXT-LOCAL-1500");
    expect(local).toMatchObject({ name: "NEXT Local Business Package", priceLow: 1500, priceHigh: 1500, lineItems: [] });
    for (const p of NEXT_PACKAGES) expect(listed.map((l) => l.code)).toContain(p.code);
  });

  it("a brief on NEXT-LOCAL-1500 becomes a Zoho Deal when BTG qualifies it", async () => {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({
      where: { tenantId: T, code: "NEXT-LOCAL-1500" }, select: { id: true },
    });
    const brief = await createBrief(sponsor, {
      sponsorId: "nx_business", objective: "Fall edition feature", budget: 150_000, packageId: pkg.id,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"),
      sports: [], stateCodes: ["MD"], categories: [],
    });
    await transitionBrief(staff, brief.id, "QUALIFIED");

    /* Drained the way the worker drains the outbox. */
    const zoho = new FakeZoho();
    const rows = await prisma.outboxJob.findMany({
      where: { tenantId: T, name: "zoho.pushDeal" }, select: { payload: true },
    });
    expect(rows).toHaveLength(1);
    await jobs.handlePushDeal(
      { db: prisma, zoho: () => zoho as never },
      { ...(rows[0]!.payload as object), tenantId: T } as never,
    );

    const [deal] = zoho.all("Deals");
    expect(deal).toMatchObject({ SponsorX_ID: `brief:${brief.id}`, Stage: "Qualification", Amount: 1500 });
    expect(String(deal!.Deal_Name)).toBe("Kim's Auto Care — NEXT Local Business Package — Oct 2026");
  });
});
