import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   SponsorX NEXT — P9-QA-01, "E2E: edition sells once, a student code
   attributes the sale". The Stage 1 exit, run as a test rather than asserted
   in a document.

   Done when: "A school is a Property, an edition sells a back cover exactly
   once, a student's code attributes a sale, artwork clears the approval board
   with a ContentRight covering its use, QR_SCAN and LINK_CLICK report
   separately, and a split resolves to four payees without touching Earning."

   ONE story, walked in order over HTTP through the production auth, scope,
   route and domain code (only Clerk and the rate limiter are stubbed), over a
   real database. Each clause has its own step and its own assertion:

   1. School is a Property — the Property(kind SCHOOL) is what the public
      application (applyAsStudent), the masthead (POST /publications) and the
      public school list (GET /public/next/schools) all resolve to; a TEAM is
      refused as a student's school.
   2. Back cover sells once — POST /editions/:id/sales (sellCampaignSlots) wins
      it for the first buyer; a second back-cover row, a rival's sale, and a
      write that skips the domain (trigger adslot_guard_sale) are all refused.
   3. Code attributes the sale — POST /students/:id/code, GET /public/s/:code
      (resolveStudentCode, P9-BE-07), the sponsor's own POST /briefs carrying
      the code, then the sale writes SalesAttribution (attributeSale) in the
      sale's transaction; GET /students/:id/sales reads it back.
   4. Artwork clears — an AD_CREATIVE EditionAsset is refused by the
      production gate (rightsGap) and by campaign use until a ContentRight
      (POST /edition-assets/:id/rights) covers it; the clearance queue
      (GET /editions/:id/rights-ledger) flips with it.
   5. QR_SCAN and LINK_CLICK apart — POST /public/editions/:id/events, counted
      per type in EditionEvent and folded print vs digital in the sponsor's
      GET /campaigns/:id/report (foldEngagement).
   6. Four payees, no Earning — POST /editions/:id/transition CLOSED runs
      resolveSplit; GET /editions/:id/splits (editionSplits) answers four
      payees summing to the revenue; Earning's row count is unchanged.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@nxe2e-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-QA-01 · one edition, end to end: sold once, attributed, cleared, counted, split", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { createApp } = await import("../src/app");

  const T = "nxe2e_tenant";
  const STAFF = "nxe2e_staff";
  const SPONSOR_USER = "nxe2e_rosa_user";
  const RIVAL_USER = "nxe2e_kim_user";
  const DAY = 864e5;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  /* The story's state, carried step to step. */
  let studentId = "";
  let code = "";
  let publicationId = "";
  let editionId = "";
  let backSlotId = "";
  let campaignId = "";
  let rivalCampaignId = "";
  let artworkId = "";
  let earningsAtStart = -1;

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  /** Only this file's tenant, children before parents. SalesAttribution is
   *  append-only; the purge switch exists for this test database. */
  async function clean() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL sponsorx.attribution_purge = 'on'`),
      prisma.$executeRawUnsafe(`DELETE FROM "SalesAttribution" WHERE "tenantId" = $1`, T),
    ]);
    for (const t of ["EditionEvent", "ContentRight", "EditionAsset", "StudentPointAccrual", "RevenueSplit", "AdSlot",
      "Earning", "OutboxJob", "SyncTask", "AuditLog", "Campaign", "CampaignBrief", "Edition", "Publication",
      "StudentCode", "User", "Student", "Guardian", "SponsorPackage", "SponsorContact", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A sponsor's own brief on a NEXT package, qualified and approved by BTG,
   *  turned into a campaign — every step over HTTP. */
  async function sponsorCampaign(user: string, sponsorId: string, packageCode: string, studentCode: string | null, name: string) {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({ where: { tenantId: T, code: packageCode }, select: { id: true, priceLow: true } });
    const brief = await call("POST", "/briefs", user, {
      sponsorId, objective: `Back cover, ${name}`, budget: pkg.priceLow * 100, packageId: pkg.id, studentCode,
      startDate: "2026-10-01", endDate: "2026-11-30", sports: [], stateCodes: ["MD"], categories: [],
    });
    expect(brief.status, brief.text).toBe(201);
    expect(brief.json.state).toBe("DRAFT");
    for (const to of ["QUALIFIED", "APPROVED"]) {
      const moved = await call("POST", `/briefs/${brief.json.id}/transition`, STAFF, { to });
      expect(moved.status, moved.text).toBe(200);
    }
    const campaign = await call("POST", `/briefs/${brief.json.id}/campaign`, STAFF, { name });
    expect(campaign.status, campaign.text).toBe(201);
    return campaign.json.id as string;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT edition E2E tenant" } });
    await prisma.property.createMany({ data: [
      { id: "nxe2e_school", tenantId: T, slug: "nxe2e-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "nxe2e_team", tenantId: T, slug: "nxe2e-team", name: "Northside Travel Team", kind: "TEAM" },
    ] });
    await prisma.sponsor.createMany({ data: [
      { id: "nxe2e_rosa", tenantId: T, name: "Rosa's Bakery" },
      { id: "nxe2e_kim", tenantId: T, name: "Kim's Auto" },
    ] });
    await prisma.user.createMany({ data: [
      { id: STAFF, tenantId: T, clerkId: STAFF, email: "ops@nxe2e.invalid", roles: ["BTG_ADMIN"] },
      { id: SPONSOR_USER, tenantId: T, clerkId: SPONSOR_USER, email: "rosa@nxe2e.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "nxe2e_rosa" },
      { id: RIVAL_USER, tenantId: T, clerkId: RIVAL_USER, email: "kim@nxe2e.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "nxe2e_kim" },
    ] });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try { await seedPackages(client, T); } finally { client.release(); await pool.end(); }
    earningsAtStart = await prisma.earning.count({ where: { tenantId: T } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("1 · a school is a Property: the student, the masthead and the public school list all resolve to Property(kind SCHOOL)", async () => {
    const school = await prisma.property.findUniqueOrThrow({ where: { id: "nxe2e_school" }, select: { kind: true, tenantId: true } });
    expect(school).toEqual({ kind: "SCHOOL", tenantId: T });

    /* The student applies to the school by its Property slug; a TEAM is not a school. */
    const app = await call("POST", "/public/students/applications", null, {
      schoolSlug: "nxe2e-northside", legalName: "Jordan Legal", displayName: "Jordan R.", ageBand: "18_PLUS", masthead: ["SALES"],
    });
    expect(app.status, app.text).toBe(201);
    expect(app.json.state).toBe("SUBMITTED");
    studentId = app.json.id;
    expect(await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { propertyId: true } }))
      .toEqual({ propertyId: "nxe2e_school" });
    expect((await call("POST", "/public/students/applications", null, {
      schoolSlug: "nxe2e-team", legalName: "x", displayName: "x", ageBand: "18_PLUS", masthead: ["SALES"],
    })).status).toBe(422);

    /* BTG reviews the student to ACTIVE. P9-BE-20: the application was
       picked up on submit (UNDER_REVIEW — this school has no roster), and
       an adult's approval activates at once. */
    const r = await call("POST", `/students/${studentId}/transition`, STAFF, { to: "APPROVED" });
    expect(r.status, `APPROVED: ${r.text}`).toBe(200);
    expect(r.json.state).toBe("ACTIVE");

    /* The school's masthead is a Publication owned by that Property. */
    const pub = await call("POST", "/publications", STAFF, { name: "The Northside Record", propertyId: "nxe2e_school" });
    expect(pub.status, pub.text).toBe(201);
    publicationId = pub.json.id;
    expect(await prisma.publication.findUniqueOrThrow({ where: { id: publicationId }, select: { propertyId: true } }))
      .toEqual({ propertyId: "nxe2e_school" });

    /* And it is now a NEXT school on the public list — kind SCHOOL with a publication. */
    const schools = (await call("GET", "/public/next/schools", null)).json.schools as Array<{ slug: string }>;
    expect(schools.map((s) => s.slug)).toContain("nxe2e-northside");
    expect(schools.map((s) => s.slug)).not.toContain("nxe2e-team");
  });

  it("3a · the student's code resolves publicly at /s/[code] and the sponsor arrives with it on their own brief", async () => {
    const issued = await call("POST", `/students/${studentId}/code`, STAFF);
    expect(issued.status, issued.text).toBe(201);
    code = issued.json.code;

    const resolved = await call("GET", `/public/s/${code}`, null);
    expect(resolved.status).toBe(200);
    expect(resolved.json).toEqual({ code, studentName: "Jordan R.", school: "Northside High" });
    expect(resolved.text).not.toContain("Jordan Legal");

    campaignId = await sponsorCampaign(SPONSOR_USER, "nxe2e_rosa", "NEXT-AD-BACK-COVER", code, "Rosa back cover");
    rivalCampaignId = await sponsorCampaign(RIVAL_USER, "nxe2e_kim", "NEXT-AD-BACK-COVER", null, "Kim back cover");
    const brief = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { brief: { select: { studentCode: { select: { code: true } } } } } });
    expect(brief.brief?.studentCode?.code).toBe(code);
  });

  it("2 · the edition sells its back cover exactly once", async () => {
    const e = await call("POST", `/publications/${publicationId}/editions`, STAFF, {
      label: "Fall 2026", closeDate: new Date(Date.now() + 30 * DAY).toISOString(),
      publishTarget: new Date(Date.now() + 40 * DAY).toISOString(), thresholdCents: 100_000,
    });
    expect(e.status, e.text).toBe(201);
    editionId = e.json.id;
    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "SELLING" })).json.state).toBe("SELLING");

    const back = await call("POST", `/editions/${editionId}/slots`, STAFF, { slotCode: "BACK", kind: "BACK_COVER", priceCents: 100_000 });
    expect(back.status, back.text).toBe(201);
    backSlotId = back.json.id;
    /* An edition has one back cover: a second is not even creatable. */
    expect((await call("POST", `/editions/${editionId}/slots`, STAFF, { slotCode: "BACK2", kind: "BACK_COVER", priceCents: 100_000 })).status).toBe(409);

    /* The page map's menu (P9-FE-03): both buyers can still have it. */
    const before = (await call("GET", `/editions/${editionId}/sale-candidates`, STAFF)).json.candidates as Array<{ campaignId: string; unavailable: string[] }>;
    expect(before.filter((c) => [campaignId, rivalCampaignId].includes(c.campaignId)).map((c) => c.unavailable)).toEqual([[], []]);

    const sold = await call("POST", `/editions/${editionId}/sales`, STAFF, { campaignId });
    expect(sold.status, sold.text).toBe(201);
    expect(sold.json.slots).toEqual([{ id: backSlotId, slotCode: "BACK", kind: "BACK_COVER", soldCents: 100_000 }]);

    /* The second sale of the same exclusive slot is refused, and moves nothing. */
    const second = await call("POST", `/editions/${editionId}/sales`, STAFF, { campaignId: rivalCampaignId });
    expect(second.status, second.text).toBe(409);
    await expect(prisma.adSlot.update({ where: { id: backSlotId }, data: { campaignId: rivalCampaignId } })).rejects.toThrow(/adslot_already_sold/);

    const backs = await prisma.adSlot.findMany({ where: { tenantId: T, editionId, kind: "BACK_COVER" }, select: { id: true, campaignId: true, soldCents: true } });
    expect(backs).toEqual([{ id: backSlotId, campaignId, soldCents: 100_000 }]);
    expect(await prisma.adSlot.count({ where: { tenantId: T, campaignId: rivalCampaignId } })).toBe(0);

    const ledger = (await call("GET", `/editions/${editionId}/ledger`, STAFF)).json.slots;
    expect(ledger).toEqual([expect.objectContaining({ id: backSlotId, sold: true, buyer: expect.objectContaining({ campaignId, sponsor: "Rosa's Bakery" }) })]);
    const after = (await call("GET", `/editions/${editionId}/sale-candidates`, STAFF)).json.candidates as Array<{ campaignId: string; unavailable: string[] }>;
    expect(after.find((c) => c.campaignId === rivalCampaignId)?.unavailable).toEqual(["BACK_COVER"]);
  });

  it("3b · the student's code attributed that sale — and only that sale", async () => {
    const attributions = await prisma.salesAttribution.findMany({
      where: { tenantId: T }, select: { studentId: true, sponsorId: true, campaignId: true, editionId: true, value: true },
    });
    expect(attributions).toEqual([{ studentId, sponsorId: "nxe2e_rosa", campaignId, editionId, value: 100_000 }]);

    const sales = await call("GET", `/students/${studentId}/sales`, STAFF);
    expect(sales.status).toBe(200);
    expect(sales.json.totalCents).toBe(100_000);
    expect(sales.json.sales).toEqual([expect.objectContaining({ sponsorId: "nxe2e_rosa", campaignId, editionId, value: 100_000 })]);

    /* $1,000 credited crosses two $500 milestones; the account is now the student's school's. */
    expect((await call("GET", `/students/${studentId}/points`, STAFF)).json.balance).toBe(200);
    expect(await prisma.sponsor.findUniqueOrThrow({ where: { id: "nxe2e_rosa" }, select: { ownership: true, schoolPropertyId: true, assignedStudentId: true } }))
      .toEqual({ ownership: "STUDENT_ORIGINATED", schoolPropertyId: "nxe2e_school", assignedStudentId: studentId });
  });

  it("6 · closing resolves the split to four payees, and Earning is not touched", async () => {
    const earningsBefore = await prisma.earning.count({ where: { tenantId: T } });
    expect(earningsBefore).toBe(earningsAtStart);

    const closed = await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "CLOSED" });
    expect(closed.status, closed.text).toBe(200);
    expect(closed.json.state).toBe("CLOSED");

    const splits = (await call("GET", `/editions/${editionId}/splits`, STAFF)).json.splits as Array<{ payeeKind: string; bps: number; amountCents: number }>;
    expect(splits.map((s) => [s.payeeKind, s.bps, s.amountCents])).toEqual([
      ["SPONSORX", 4_000, 40_000], ["SCHOOL", 3_000, 30_000], ["STUDENT_POOL", 2_000, 20_000], ["EDITORIAL_FUND", 1_000, 10_000],
    ]);
    expect(new Set(splits.map((s) => s.payeeKind)).size).toBe(4);
    expect(splits.reduce((n, s) => n + s.amountCents, 0)).toBe(100_000);
    expect(await prisma.revenueSplit.count({ where: { tenantId: T, editionId } })).toBe(4);

    expect(await prisma.earning.count({ where: { tenantId: T } })).toBe(earningsBefore);
    expect(await prisma.auditLog.count({ where: { tenantId: T, entity: "Earning" } })).toBe(0);
    expect((await call("GET", `/editions/${editionId}`, STAFF)).json.revenueMet).toBe(true);
  });

  it("4 · the sponsor's artwork clears the board only with a ContentRight covering its use", async () => {
    const art = await call("POST", `/editions/${editionId}/assets`, STAFF, { kind: "AD_CREATIVE", title: "Rosa's back cover artwork", sourceKind: "THIRD_PARTY" });
    expect(art.status, art.text).toBe(201);
    artworkId = art.json.id;
    expect((await call("POST", `/editions/${editionId}/conditions`, STAFF, { contentReady: true })).status).toBe(200);

    const queued = (await call("GET", `/editions/${editionId}/rights-ledger`, STAFF)).json.assets as Array<{ id: string; clearedDigital: boolean; rights: unknown[] }>;
    expect(queued).toEqual([expect.objectContaining({ id: artworkId, clearedDigital: false, clearedPrint: false, rights: [] })]);

    /* Uncovered: the gate refuses production, and the campaign cannot use it. */
    const refused = await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "IN_PRODUCTION" });
    expect(refused.status).toBe(409);
    expect(refused.text).toMatch(/rightsCleared/);
    expect((await call("POST", `/edition-assets/${artworkId}/campaign`, STAFF, { campaignId })).status).toBe(409);

    /* The sponsor's licence for its own artwork: this edition, digital and print, in its own campaign. */
    const grant = await call("POST", `/edition-assets/${artworkId}/rights`, STAFF, {
      grantorKind: "THIRD_PARTY", grantorRef: "Rosa's Bakery", mayPublishDigital: true, mayPublishPrint: true,
      mayReuseCommercially: true, startsAt: new Date().toISOString(), licenseRef: "nxe2e-IO-0001",
    });
    expect(grant.status, grant.text).toBe(201);

    const cleared = (await call("GET", `/editions/${editionId}/rights-ledger`, STAFF)).json.assets;
    expect(cleared).toEqual([expect.objectContaining({
      id: artworkId, clearedDigital: true, clearedPrint: true,
      rights: [expect.objectContaining({ id: grant.json.id, grantorKind: "THIRD_PARTY", mayPublishDigital: true, licenseRef: "nxe2e-IO-0001" })],
    })]);
    expect((await call("POST", `/edition-assets/${artworkId}/campaign`, STAFF, { campaignId })).json).toEqual({ assetId: artworkId, campaignId });

    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "IN_PRODUCTION" })).json.state).toBe("IN_PRODUCTION");
    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "PUBLISHED_DIGITAL" })).json.state).toBe("PUBLISHED_DIGITAL");
    expect((await call("GET", `/editions/${editionId}`, STAFF)).json.rightsCleared).toBe(true);
  });

  it("5 · QR_SCAN and LINK_CLICK are recorded and reported separately", async () => {
    const event = (type: string) => call("POST", `/public/editions/${editionId}/events`, null, { type, targetKind: "AD_SLOT", targetRef: backSlotId });
    for (const type of ["QR_SCAN", "QR_SCAN", "LINK_CLICK", "LINK_CLICK", "LINK_CLICK"]) {
      const r = await event(type);
      expect(r.status, `${type}: ${r.text}`).toBe(201);
      expect(r.json.type).toBe(type);
    }

    const rows = await prisma.editionEvent.groupBy({ where: { tenantId: T, editionId }, by: ["type"], _count: true });
    expect(Object.fromEntries(rows.map((r) => [r.type, r._count]))).toEqual({ QR_SCAN: 2, LINK_CLICK: 3 });

    /* The sponsor's own report: print and digital, never pooled. */
    const report = await call("GET", `/campaigns/${campaignId}/report`, SPONSOR_USER);
    expect(report.status, report.text).toBe(200);
    expect(report.json.editionEngagement).toEqual({
      print: { QR_SCAN: 2 },
      digital: { LINK_CLICK: 3, PROFILE_VIEW: 0, CAMPAIGN_VIEW: 0, CTA_CLICK: 0 },
    });
    expect(report.json.adPlacements).toEqual([{ slotCode: "BACK", kind: "BACK_COVER", editionId, soldCents: 100_000 }]);
    /* The fan reward funnel is its own stream: none of this reached it. */
    expect(report.json.funnel).toEqual({ SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 });

    /* And at the end of the whole story, still not one Earning row. */
    expect(await prisma.earning.count({ where: { tenantId: T } })).toBe(earningsAtStart);
  });
});
