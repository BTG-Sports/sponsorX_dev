import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   SponsorX NEXT, Stage 9 Batch C — P9-BE-10, -11, -14.

   Each acceptance clause on the path a real request takes — HTTP through the
   production auth and scope code where a role matters, the domain functions
   the routes call otherwise — over a real database, with the Postgres shape
   rules attacked directly.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@rights-test.invalid` } : null;
  },
}));

const SCHEMA = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

const { allocateByWeight, CONTRIBUTION_UNITS } = await import("../src/domain/dmv-pools");

describe("P9-BE-14 · the allocation formula (pure)", () => {
  it("units ÷ total units × pool, in whole cents that sum to the pool; zero weight gets nothing", () => {
    expect(CONTRIBUTION_UNITS).toEqual({ FEATURE: 5, PHOTO_PACKAGE: 3, INTERVIEW: 3, VIDEO: 5 });
    const out = allocateByWeight(10_001, new Map([["a", 5], ["b", 6], ["c", 0]]));
    expect([...out.keys()].sort()).toEqual(["a", "b"]);
    expect(out.get("a")! + out.get("b")!).toBe(10_001);
    expect(out.get("a")).toBe(4546);
    expect(allocateByWeight(500, new Map([["a", 0]])).size).toBe(0);
  });
});

describe("P9-BE-11 · GPA is absent", () => {
  it("no column anywhere in the schema holds a grade point average", () => {
    expect(SCHEMA).not.toMatch(/\bgpa\b/i);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("SponsorX NEXT rights, featured athletes and the DMV pool", async () => {
  const { prisma } = await import("../src/db/client");
  const ed = await import("../src/domain/edition");
  const rights = await import("../src/domain/content-rights");
  const artwork = await import("../src/domain/edition-artwork");
  const featured = await import("../src/domain/featured");
  const dmv = await import("../src/domain/dmv-pools");
  const { verifyGuardian, linkGuardian } = await import("../src/domain/guardian");
  const { reviewApplication } = await import("../src/domain/application-review");
  const { transitionAthlete } = await import("../src/domain/athlete");
  const { setAthleteRate } = await import("../src/domain/athlete-rate");
  const { inviteAthlete } = await import("../src/domain/invitation");
  const { eligibleAthletes } = await import("../src/domain/matching");
  const { createApp } = await import("../src/app");

  const T = "nx4_tenant";
  const DAY = 864e5;
  const HASH = "h".repeat(64);
  const staff = {
    userId: "nx4_staff", tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
  /* The buying sponsor — signs off its own ad artwork (P9-BE-16). */
  const rosa = { ...staff, userId: "nx4_rosa", roles: ["SPONSOR_ADMIN" as const], sponsorId: "nx4_sponsor" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let n = 0;

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL sponsorx.attribution_purge = 'on'`),
      prisma.$executeRawUnsafe(`DELETE FROM "SalesAttribution" WHERE "tenantId" = $1`, T),
    ]);
    for (const t of ["SchoolPoolAllocation", "ContentContribution", "ContentRight", "EditionAsset", "AgreementAcceptance",
      "Agreement", "AthleteClaim", "RosterEntry", "StudentPointAccrual", "OutboxJob", "SyncTask", "AuditLog", "AdSlot",
      "RevenueSplit", "Edition", "Publication", "CampaignInvite", "Campaign", "CampaignBrief", "StudentCode", "User",
      "Student", "AthleteRate", "NilJob", "Athlete", "Guardian", "SponsorPackage", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  async function edition(propertyId: string | null, threshold = 0): Promise<string> {
    const pub = await ed.createPublication(staff, { name: `Masthead ${++n}`, propertyId });
    const e = await ed.createEdition(staff, pub.id, {
      label: `Edition ${n}`, closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 40 * DAY),
      printDate: new Date(Date.now() + 45 * DAY), thresholdCents: threshold,
    });
    await ed.transitionEdition(staff, e.id, "SELLING");
    return e.id;
  }

  async function toProduction(id: string) {
    await ed.transitionEdition(staff, id, "CLOSED");
    await ed.setEditionConditions(staff, id, { contentReady: true });
    return ed.transitionEdition(staff, id, "IN_PRODUCTION");
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT rights test tenant" } });
    await prisma.property.createMany({ data: [
      { id: "nx4_school", tenantId: T, slug: "nx4-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "nx4_school_b", tenantId: T, slug: "nx4-eastside", name: "Eastside High", kind: "SCHOOL" },
      { id: "nx4_school_c", tenantId: T, slug: "nx4-westside", name: "Westside High", kind: "SCHOOL" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "nx4_staff", tenantId: T, clerkId: "nx4_staff", email: "ops@nx4.invalid", roles: ["BTG_ADMIN"] },
      { id: "nx4_rosa", tenantId: T, clerkId: "nx4_rosa", email: "rosa@nx4.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "nx4_sponsor" },
      { id: "nx4_advisor", tenantId: T, clerkId: "nx4_advisor", email: "adv@nx4.invalid", roles: ["ADVISOR"], propertyId: "nx4_school" },
      { id: "nx4_advisor_b", tenantId: T, clerkId: "nx4_advisor_b", email: "advb@nx4.invalid", roles: ["ADVISOR"], propertyId: "nx4_school_b" },
    ] });
    await prisma.agreement.createMany({ data: [
      { id: "nx4_ag_release", tenantId: T, kind: "RELEASE", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
      { id: "nx4_ag_feature", tenantId: T, kind: "FEATURE", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
      { id: "nx4_ag_commercial", tenantId: T, kind: "COMMERCIAL", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
    ] });
    await prisma.sponsor.create({ data: { id: "nx4_sponsor", tenantId: T, name: "Rosa's Bakery" } });
    await prisma.campaign.create({ data: { id: "nx4_campaign", tenantId: T, sponsorId: "nx4_sponsor", name: "Sponsored feature", budget: 150_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30") } });
    await prisma.nilJob.create({ data: { id: "nx4_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.rosterEntry.createMany({ data: [
      { tenantId: T, propertyId: "nx4_school", legalName: "Maya Thompson", gradYear: 2028 },
      { tenantId: T, propertyId: "nx4_school", legalName: "Andre Wallace", gradYear: 2027 },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── P9-BE-10 ────────────────────────────────────────────────────────── */

  describe("P9-BE-10 · one rights ledger, one gate", () => {
    let student = "";
    let consentId = "";
    beforeAll(async () => {
      student = (await prisma.student.create({ data: { tenantId: T, propertyId: "nx4_school", legalName: "Adult Writer", displayName: "AW", masthead: ["WRITER"], ageBand: "18_PLUS", state: "ACTIVE" }, select: { id: true } })).id;
      consentId = (await rights.recordSubjectConsent(staff, { agreementId: "nx4_ag_release", subjectKind: "STUDENT", subjectId: student, bodyHashShown: HASH, ip: "t", userAgent: "t" })).id;
    });

    it("every asset needs a right covering the use — production is refused until the last one has it", async () => {
      const id = await edition("nx4_school");
      const article = await rights.addEditionAsset(staff, id, { kind: "ARTICLE", title: "Friday Lights", sourceKind: "STUDENT", studentId: student });
      const photo = await rights.addEditionAsset(staff, id, { kind: "PHOTO", title: "BTG sideline set", sourceKind: "BTG" });
      await rights.grantRight(staff, article.id, { grantorKind: "STUDENT", grantorRef: student, mayPublishDigital: true, startsAt: new Date(), acceptanceId: consentId });

      await expect(toProduction(id)).rejects.toThrow(/rightsCleared/);
      expect((await ed.getEdition(staff, id)).rightsCleared).toBe(false);

      await rights.grantRight(staff, photo.id, { grantorKind: "BTG", grantorRef: "BTG Sports", mayPublishDigital: true, startsAt: new Date(), licenseRef: "BTG-ED-2026-01" });
      expect((await ed.transitionEdition(staff, id, "IN_PRODUCTION")).state).toBe("IN_PRODUCTION");
      expect((await ed.getEdition(staff, id)).rightsCleared).toBe(true);
    });

    it("the gate answers in ONE query", async () => {
      const id = await edition("nx4_school");
      await rights.addEditionAsset(staff, id, { kind: "ARTICLE", title: "Unclear", sourceKind: "BTG" });
      const calls: string[] = [];
      const counting = new Proxy(prisma, {
        get: (target, model: string) => new Proxy((target as unknown as Record<string, object>)[model]!, {
          get: (m, op: string) => (...args: unknown[]) => { calls.push(`${model}.${op}`); return (m as Record<string, (...a: unknown[]) => unknown>)[op]!(...args); },
        }),
      });
      const gap = await rights.rightsGap(counting as never, T, id, "DIGITAL", new Date());
      expect(gap.map((g) => g.title)).toEqual(["Unclear"]);
      expect(calls).toEqual(["editionAsset.findMany"]);
    });

    it("print and digital are separate: a digital-first edition publishes while print is outstanding", async () => {
      const id = await edition("nx4_school");
      const a = await rights.addEditionAsset(staff, id, { kind: "PHOTO_PACKAGE", title: "Senior night", sourceKind: "BTG" });
      await rights.grantRight(staff, a.id, { grantorKind: "BTG", grantorRef: "BTG Sports", mayPublishDigital: true, startsAt: new Date(), licenseRef: "L-2" });
      await toProduction(id);
      expect((await ed.transitionEdition(staff, id, "PUBLISHED_DIGITAL")).state).toBe("PUBLISHED_DIGITAL");
      await expect(ed.transitionEdition(staff, id, "PRINTED")).rejects.toThrow(/No print right covers: Senior night/);
      await rights.grantRight(staff, a.id, { grantorKind: "BTG", grantorRef: "BTG Sports", mayPublishPrint: true, startsAt: new Date(), licenseRef: "L-2-print" });
      expect((await ed.transitionEdition(staff, id, "PRINTED")).state).toBe("PRINTED");
    });

    it("a BTG asset cannot enter a sponsor campaign without an explicit commercial grant", async () => {
      const id = await edition("nx4_school");
      const a = await rights.addEditionAsset(staff, id, { kind: "ARTICLE", title: "Coach Q&A", sourceKind: "BTG" });
      const r = await rights.grantRight(staff, a.id, { grantorKind: "BTG", grantorRef: "BTG Sports", mayPublishDigital: true, mayPublishPrint: true, mayPromote: true, startsAt: new Date(), licenseRef: "L-3" });
      expect((await prisma.contentRight.findUniqueOrThrow({ where: { id: r.id }, select: { mayReuseCommercially: true } })).mayReuseCommercially).toBe(false);
      await expect(rights.useAssetInCampaign(staff, a.id, "nx4_campaign")).rejects.toMatchObject({ status: 409 });
      await rights.grantRight(staff, a.id, { grantorKind: "BTG", grantorRef: "BTG Sports", mayReuseCommercially: true, startsAt: new Date(), licenseRef: "L-3-commercial" });
      expect(await rights.useAssetInCampaign(staff, a.id, "nx4_campaign")).toEqual({ assetId: a.id, campaignId: "nx4_campaign" });
    });

    it("rightsCleared cannot be typed in, and Postgres enforces the ledger's shape", async () => {
      const id = await edition("nx4_school");
      expect((await call("POST", `/editions/${id}/conditions`, "nx4_staff", { rightsCleared: true })).status).toBe(400);
      const a = await rights.addEditionAsset(staff, id, { kind: "ARTICLE", title: "x", sourceKind: "BTG" });
      await expect(prisma.contentRight.create({ data: { tenantId: T, assetId: a.id, grantorKind: "BTG", grantorRef: "x", startsAt: new Date() } })).rejects.toThrow();
      await expect(prisma.contentRight.create({ data: { tenantId: T, assetId: a.id, grantorKind: "BTG", grantorRef: "x", startsAt: new Date(), acceptanceId: consentId } })).rejects.toThrow();
      /* And a consent that is someone else's does not cover this asset. */
      const other = await rights.addEditionAsset(staff, id, { kind: "ARTICLE", title: "y", sourceKind: "BTG" });
      await expect(rights.grantRight(staff, other.id, { grantorKind: "STUDENT", grantorRef: "s", mayPublishDigital: true, startsAt: new Date(), acceptanceId: consentId })).rejects.toThrow(/not from the person/);
    });
  });

  /* ── P9-BE-11 ────────────────────────────────────────────────────────── */

  describe("P9-BE-11 · featured is not represented", () => {
    let athleteId = "";
    let slug = "";
    beforeAll(async () => {
      ({ id: athleteId, slug } = await featured.createFeaturedAthlete(staff, { displayName: "Maya T.", sport: "Basketball", propertyId: "nx4_school", stateCode: "MD" }));
    });

    it("has a public profile — and nothing a stranger should not read", async () => {
      const r = await call("GET", `/public/athletes/${slug}`, null);
      expect(r.status).toBe(200);
      /* P3-FE-08 widened the public shape to the §11 public sections; still no legal name, contact, age or pay. */
      expect(Object.keys(r.json).sort()).toEqual(["achievements", "brandInterests", "city", "claimable", "contentCapabilities", "displayName", "featured", "level", "position", "school", "slug", "socials", "sport", "stateCode"]);
      expect(r.json).toMatchObject({ displayName: "Maya T.", school: "Northside High", featured: true, claimable: true });
    });

    it("can receive no invitation, holds no rates, and appears in no matching query", async () => {
      await expect(inviteAthlete(staff, { campaignId: "nx4_campaign", athleteId, jobId: "nx4_job", offered: 20_000 })).rejects.toMatchObject({ status: 409 });
      await prisma.athlete.update({ where: { id: athleteId }, data: { tier: "EMERGING" } });
      await expect(setAthleteRate(staff, athleteId, "nx4_job", 15_000)).rejects.toThrow(/featured athlete holds no rates/);
      const matched = await eligibleAthletes(staff, { sports: ["Basketball"] });
      expect(matched.map((a) => a.id)).not.toContain(athleteId);
    });

    it("consent is recorded for a subject with no login — and Postgres insists on exactly one subject", async () => {
      const c = await rights.recordSubjectConsent(staff, { agreementId: "nx4_ag_feature", subjectKind: "ATHLETE", subjectId: athleteId, bodyHashShown: HASH, ip: "t", userAgent: "t" });
      const row = await prisma.agreementAcceptance.findUniqueOrThrow({ where: { id: c.id }, select: { userId: true, athleteId: true } });
      expect(row).toEqual({ userId: null, athleteId });
      await expect(prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: "nx4_ag_feature", bodyHash: HASH, ip: "t", userAgent: "t" } })).rejects.toThrow();
    });

    it("the claim needs all three assertions, and a minor's commercial activation is impossible without the guardian", async () => {
      /* 1. The athlete: "that's me". Not on the roster → the school cannot verify. */
      const stranger = await call("POST", `/public/athletes/${slug}/claim`, null, { claimantName: "Someone Else", claimantEmail: "x@x.invalid", birthDate: "2010-02-02" });
      expect(Object.keys(stranger.json).sort()).toEqual(["id", "state"]); // the roster answer is never returned
      expect((await call("POST", `/claims/${stranger.json.id}/verify`, "nx4_advisor")).status).toBe(409);

      const mine = await call("POST", `/public/athletes/${slug}/claim`, null, { claimantName: "Maya Thompson", claimantEmail: "maya@family.invalid", birthDate: "2010-02-02" });
      /* 2. The school: only THIS school's advisor verifies. */
      expect((await call("POST", `/claims/${mine.json.id}/verify`, "nx4_advisor_b")).status).toBe(403);
      expect((await call("POST", `/claims/${mine.json.id}/verify`, "nx4_advisor")).json).toEqual({ athleteId, state: "UNDER_REVIEW" });
      const claimed = await prisma.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { state: true, legalName: true, email: true } });
      expect(claimed).toEqual({ state: "UNDER_REVIEW", legalName: "Maya Thompson", email: "maya@family.invalid" });

      /* 3. The guardian — linked, verified, and still not enough on its own. */
      const { guardianId } = await linkGuardian(staff, athleteId, { legalName: "Dana Thompson", email: "dana@family.invalid", relationship: "PARENT" });
      await verifyGuardian(staff, guardianId);
      await reviewApplication(staff, athleteId, "APPROVED");
      await expect(transitionAthlete(staff, athleteId, "ACTIVE")).rejects.toThrow(/COMMERCIAL authorisation/);

      /* A consent without the guardian, for a minor, is refused… */
      await expect(rights.recordSubjectConsent(staff, { agreementId: "nx4_ag_commercial", subjectKind: "ATHLETE", subjectId: athleteId, bodyHashShown: HASH, ip: "t", userAgent: "t" })).rejects.toThrow(/verified guardian/);
      /* …the guardian's own is what activates. */
      await rights.recordSubjectConsent(staff, { agreementId: "nx4_ag_commercial", subjectKind: "ATHLETE", subjectId: athleteId, guardianId, bodyHashShown: HASH, ip: "t", userAgent: "t" });
      expect((await transitionAthlete(staff, athleteId, "ACTIVE")).state).toBe("ACTIVE");
    });
  });

  /* ── P9-BE-14 ────────────────────────────────────────────────────────── */

  describe("P9-BE-14 · the DMV edition's two pools, by formula", () => {
    it("draws from several schools and resolves both pools with no manual adjudication", async () => {
      const mk = async (id: string, school: string) => (await prisma.student.create({ data: { id, tenantId: T, propertyId: school, legalName: id, displayName: id, masthead: ["SALES"], ageBand: "18_PLUS", state: "ACTIVE" }, select: { id: true } })).id;
      const [a, b, c] = [await mk("nx4_sa", "nx4_school"), await mk("nx4_sb", "nx4_school_b"), await mk("nx4_sc", "nx4_school_c")];

      const id = await edition(null); // the regional DMV edition: no school
      await ed.addSlot(staff, id, { slotCode: "F1", kind: "FULL", priceCents: 80_000 });
      /* Revenue: $1,000 sold; the schools' 30% share is $300 → $150 SALES + $150 CONTENT. */
      await prisma.adSlot.updateMany({ where: { editionId: id, slotCode: "F1" }, data: { campaignId: "nx4_campaign", soldCents: 100_000, soldAt: new Date() } });
      /* Sales credit: school A $600, school C $200 (school B sold nothing). */
      await prisma.salesAttribution.createMany({ data: [
        { tenantId: T, studentId: a, sponsorId: "nx4_sponsor", editionId: id, value: 60_000 },
        { tenantId: T, studentId: c, sponsorId: "nx4_sponsor", editionId: id, value: 20_000 },
      ] });
      /* Content: A a FEATURE (5), B an INTERVIEW and a PHOTO_PACKAGE (6); C nothing. */
      await dmv.recordContribution(staff, id, { studentId: a, kind: "FEATURE" });
      await dmv.recordContribution(staff, id, { studentId: b, kind: "INTERVIEW" });
      await dmv.recordContribution(staff, id, { studentId: b, kind: "PHOTO_PACKAGE" });

      /* The sold page's artwork: through BTG's review to its sponsor's sign-off, licensed (P9-BE-16, -10). */
      const f1 = await prisma.adSlot.findFirstOrThrow({ where: { editionId: id, slotCode: "F1" }, select: { id: true } });
      const { key } = await artwork.presignArtworkUpload(rosa, f1.id, "image/png");
      const art = await artwork.registerArtwork(rosa, f1.id, { r2Key: key });
      await artwork.startArtworkReview(staff, art.id);
      await artwork.sendArtworkToSponsor(staff, art.id);
      await artwork.approveArtwork(rosa, art.id);
      await rights.grantRight(staff, art.id, { grantorKind: "THIRD_PARTY", grantorRef: "Rosa's Bakery", mayPublishDigital: true, startsAt: new Date(), licenseRef: "nx4-IO-1" });

      await toProduction(id);
      await ed.transitionEdition(staff, id, "PUBLISHED_DIGITAL");

      const pools = await dmv.schoolPools(staff, id);
      const got = Object.fromEntries(pools.map((p) => [`${p.pool}:${p.propertyId}`, p.amountCents]));
      expect(got).toEqual({
        /* SALES $150 by 600:200 */
        "SALES:nx4_school": 11_250, "SALES:nx4_school_c": 3_750,
        /* CONTENT $150 by 5:6 — largest remainder, sums exactly */
        "CONTENT:nx4_school": 6_818, "CONTENT:nx4_school_b": 8_182,
      });
      /* A school contributing no content gets nothing from the content pool. */
      expect(pools.some((p) => p.pool === "CONTENT" && p.propertyId === "nx4_school_c")).toBe(false);
      /* And no route lets anyone type a pool in. */
      const { DOCUMENTED_PATHS } = await import("../src/contracts/registry");
      expect(DOCUMENTED_PATHS.filter((p) => /school-pools/.test(p) && !p.startsWith("GET "))).toEqual([]);
    });

    it("a school's own edition has no pools — its share is simply the school's", async () => {
      const id = await edition("nx4_school");
      await toProduction(id);
      await ed.transitionEdition(staff, id, "PUBLISHED_DIGITAL");
      expect(await dmv.schoolPools(staff, id)).toEqual([]);
    });
  });
});
