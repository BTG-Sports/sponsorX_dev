import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { canTransition as canTransitionAthlete, type AthleteState } from "../src/domain/athlete-state";
import { canTransitionStudent, STUDENT_STATES } from "../src/domain/student-state";
import { POINT_VALUES, pointsFor, salesMilestonesCrossed } from "../src/domain/student-points";
import { ROLES } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   SponsorX NEXT, Stage 9 Batch B — P9-BE-04, -05, -07, -13, -15, P9-SEC-01.

   Every acceptance clause on the path a real request takes: HTTP through the
   production auth, scope and route code (only Clerk is stubbed), over a real
   database, with the Postgres rules attacked directly where the acceptance
   says the database enforces them.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@students-test.invalid` } : null;
  },
}));

const SCHEMA = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
/* Every column, named — the snapshots below must see ANY change, and the
   lint rule (no bare find*) is right that the list should be explicit. */
const ATTRIBUTION_COLS = { id: true, tenantId: true, studentId: true, sponsorId: true, campaignId: true, editionId: true, value: true, originatedAt: true } as const;
const ACCRUAL_COLS = { id: true, tenantId: true, studentId: true, reason: true, points: true, editionId: true, accruedAt: true } as const;
const SPONSOR_COLS = { id: true, tenantId: true, name: true, zohoAccountId: true, lastSyncOrigin: true, lastSyncHash: true, lastSyncAt: true, updatedAt: true, ownership: true, schoolPropertyId: true, assignedStudentId: true } as const;
const model = (name: string) => SCHEMA.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))![1]!;

describe("P9-BE-04 · a student is not an athlete (pure + schema)", () => {
  const ATHLETE: AthleteState[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "SUSPENDED"];

  it("StudentState mirrors AthleteState — every state and every edge — plus INACTIVE", () => {
    for (const s of ATHLETE) expect(STUDENT_STATES).toContain(s);
    expect(STUDENT_STATES.filter((s) => !(ATHLETE as string[]).includes(s))).toEqual(["INACTIVE"]);
    for (const from of ATHLETE) for (const to of ATHLETE) {
      expect(canTransitionStudent(from, to), `${from} → ${to}`).toBe(canTransitionAthlete(from, to));
    }
    expect(canTransitionStudent("ACTIVE", "INACTIVE")).toBe(true);
    for (const to of STUDENT_STATES) expect(canTransitionStudent("INACTIVE", to)).toBe(false);
  });

  it("no nullable half of Athlete anywhere: Student is its own model, Athlete gains no student column", () => {
    /* Athlete's only change is the back-relation line; no student column
       (masthead, leftAt, a student state) was added to it. */
    const athlete = model("Athlete");
    for (const col of ["masthead", "leftAt", "StudentState"]) expect(athlete).not.toContain(col);
    expect(athlete).toMatch(/student\s+Student\?/);
    expect(model("Student")).toMatch(/athleteId\s+String\?\s+@unique/);
  });
});

describe("P9-BE-15 · points are not money (pure + schema)", () => {
  it("has the vocabulary and values, VIEWS_BONUS variable", () => {
    expect(POINT_VALUES).toEqual({ ARTICLE: 50, INTERVIEW: 25, PHOTO: 25, APPOINTMENT: 25, SALES_500: 100 });
    expect(pointsFor("VIEWS_BONUS", 40)).toBe(40);
    expect(() => pointsFor("VIEWS_BONUS")).toThrow();
    expect(salesMilestonesCrossed(40_000, 110_000)).toBe(2);
  });

  it("no cents column and no Earning relation exist on the accrual", () => {
    const accrual = model("StudentPointAccrual");
    expect(accrual).not.toMatch(/cents|Cents|amount|Earning|EarningState/);
    expect(model("Earning")).not.toMatch(/Student|Point/);
  });
});

describe("P9-BE-07 · no other attribution column was relaxed to fit", () => {
  it("TrackingLink.deliverableId is still unique and required; RewardToken gains nothing", () => {
    expect(model("TrackingLink")).toMatch(/deliverableId\s+String\s+@unique/);
    expect(model("RewardToken")).not.toMatch(/student/i);
    expect(model("TrackingLink")).not.toMatch(/student/i);
  });
});

describe("P9-BE-05 · the two roles", () => {
  it("are in the policy and in the matrix document", () => {
    expect(ROLES).toContain("STUDENT");
    expect(ROLES).toContain("ADVISOR");
    const matrix = readFileSync(new URL("../../documentation/SponsorX-RBAC-Matrix.md", import.meta.url), "utf8");
    expect(matrix).toMatch(/§15\.1–15\.2 transcribed/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("SponsorX NEXT students, on the path a request takes", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { createBrief, transitionBrief } = await import("../src/domain/brief");
  const { createCampaignFromBrief } = await import("../src/domain/campaign");
  const { verifyGuardian } = await import("../src/domain/guardian");
  const ed = await import("../src/domain/edition");
  const { createApp } = await import("../src/app");

  const T = "nx3_tenant";
  const DAY = 864e5;
  const staff = {
    userId: "nx3_staff", tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let n = 0;

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
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
    for (const t of ["StudentPointAccrual", "StudentProspect", "OutboxJob", "SyncTask", "AuditLog", "AdSlot", "RevenueSplit",
      "Edition", "Publication", "Campaign", "CampaignBrief", "StudentCode", "User", "Student", "Guardian",
      "AthleteRate", "NilJob", "Athlete", "SponsorPackage", "SponsorContact", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A student, taken to ACTIVE the real way: added, submitted, reviewed. */
  async function activeStudent(id: string, school = "nx3_school"): Promise<string> {
    await prisma.student.create({ data: { id, tenantId: T, propertyId: school, legalName: `Legal ${id}`, displayName: `Display ${id}`, masthead: ["SALES"], ageBand: "18_PLUS", state: "APPROVED" } });
    await call("POST", `/students/${id}/transition`, "nx3_staff", { to: "ACTIVE" });
    return id;
  }

  async function campaignWithCode(code: string | null, packageCode = "NEXT-AD-HALF", sponsorId = "nx3_sponsor"): Promise<string> {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({ where: { tenantId: T, code: packageCode }, select: { id: true, priceLow: true } });
    const brief = await createBrief(staff, {
      sponsorId, objective: "NEXT sale", budget: pkg.priceLow * 100, packageId: pkg.id, studentCode: code,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: ["MD"], categories: ["RESTAURANT"],
    });
    await transitionBrief(staff, brief.id, "QUALIFIED");
    await transitionBrief(staff, brief.id, "APPROVED");
    return (await createCampaignFromBrief(staff, brief.id, `NEXT ${++n}`)).id;
  }

  async function sellingEdition(): Promise<string> {
    const pub = await ed.createPublication(staff, { name: `Record ${++n}`, propertyId: "nx3_school" });
    const e = await ed.createEdition(staff, pub.id, { label: `Ed ${n}`, closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 60 * DAY), thresholdCents: 1 });
    await ed.transitionEdition(staff, e.id, "SELLING");
    for (const [code, kind] of [["H1", "HALF"], ["H2", "HALF"], ["H3", "HALF"], ["PR", "PRESENTING"]] as const) {
      await ed.addSlot(staff, e.id, { slotCode: code, kind, priceCents: kind === "HALF" ? 50_000 : 300_000 });
    }
    return e.id;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT students test tenant" } });
    await prisma.property.createMany({ data: [
      { id: "nx3_school", tenantId: T, slug: "nx3-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "nx3_other", tenantId: T, slug: "nx3-southside", name: "Southside High", kind: "SCHOOL" },
      { id: "nx3_team", tenantId: T, slug: "nx3-team", name: "A Team", kind: "TEAM" },
    ] });
    await prisma.sponsor.createMany({ data: [
      { id: "nx3_sponsor", tenantId: T, name: "Rosa's Bakery" },
      { id: "nx3_sponsor2", tenantId: T, name: "Kim's Auto" },
      { id: "nx3_old_account", tenantId: T, name: "Old Account", ownership: "SCHOOL", schoolPropertyId: "nx3_school" },
    ] });
    await prisma.athlete.create({ data: { id: "nx3_ath", tenantId: T, slug: "nx3-ath", legalName: "Ath", displayName: "ATH", email: "ath@nx3.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.nilJob.create({ data: { id: "nx3_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.athleteRate.create({ data: { tenantId: T, athleteId: "nx3_ath", jobId: "nx3_job", amount: 17_171 } });
    await prisma.user.createMany({ data: [
      { id: "nx3_staff", tenantId: T, clerkId: "nx3_staff", email: "ops@nx3.invalid", roles: ["BTG_ADMIN"] },
      { id: "nx3_advisor", tenantId: T, clerkId: "nx3_advisor", email: "adv@nx3.invalid", roles: ["ADVISOR"], propertyId: "nx3_school" },
      { id: "nx3_advisor_other", tenantId: T, clerkId: "nx3_advisor_other", email: "adv2@nx3.invalid", roles: ["ADVISOR"], propertyId: "nx3_other" },
    ] });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try { await seedPackages(client, T); } finally { client.release(); await pool.end(); }
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("P9-BE-04 · the student, advisor-reviewed, guardian-gated", () => {
    it("the public application lands SUBMITTED at the school and echoes nothing back", async () => {
      const r = await call("POST", "/public/students/applications", null, {
        schoolSlug: "nx3-northside", legalName: "Jordan Legal", displayName: "Jordan", email: "jordan@school.invalid",
        gradYear: 2028, birthDate: "2010-05-01", masthead: ["WRITER", "SALES"],
        /* P9-FE-06 — a minor applies with their guardian (the minor rule). */
        guardian: { legalName: "Jordan's Parent", email: "parent@school.invalid", relationship: "PARENT" },
      });
      expect(r.status).toBe(201);
      /* Nothing personal echoes back; guardianRequired is the wizard's own answer. */
      expect(Object.keys(r.json).sort()).toEqual(["guardianRequired", "id", "state"]);
      expect(r.json.state).toBe("SUBMITTED");
      const row = await prisma.student.findUniqueOrThrow({ where: { id: r.json.id }, select: { tenantId: true, propertyId: true } });
      expect(row).toEqual({ tenantId: T, propertyId: "nx3_school" });
      // A team is not a school (422). The age band is here so this asserts the
      // school rule, not the separate "birthDate or ageBand" one (a 400).
      expect((await call("POST", "/public/students/applications", null, { schoolSlug: "nx3-team", legalName: "x", displayName: "x", ageBand: "18_PLUS", masthead: ["WRITER"] })).status).toBe(422);
    });

    it("the school's advisor reviews it; the student cannot approve themselves; another school's advisor cannot touch it", async () => {
      const app = await call("POST", "/public/students/applications", null, { schoolSlug: "nx3-northside", legalName: "Casey L", displayName: "Casey", ageBand: "18_PLUS", masthead: ["PHOTOGRAPHER"] });
      const id = app.json.id as string;
      await prisma.user.create({ data: { id: "nx3_casey", tenantId: T, clerkId: "nx3_casey", email: "casey@nx3.invalid", roles: ["STUDENT"], studentId: id, propertyId: "nx3_school" } });

      expect((await call("POST", `/students/${id}/transition`, "nx3_advisor_other", { to: "UNDER_REVIEW" })).status).toBe(403);
      expect((await call("POST", `/students/${id}/transition`, "nx3_casey", { to: "UNDER_REVIEW" })).status).toBe(403);
      expect((await call("POST", `/students/${id}/transition`, "nx3_advisor", { to: "UNDER_REVIEW" })).status).toBe(200);
      expect((await call("POST", `/students/${id}/transition`, "nx3_casey", { to: "APPROVED" })).status).toBe(403);
      expect((await call("POST", `/students/${id}/transition`, "nx3_advisor", { to: "APPROVED" })).status).toBe(200);
      expect((await call("POST", `/students/${id}/transition`, "nx3_advisor", { to: "ACTIVE" })).json.state).toBe("ACTIVE");
    });

    it("a minor student needs a VERIFIED guardian to go ACTIVE — the athlete's rule", async () => {
      await prisma.student.create({ data: { id: "nx3_minor", tenantId: T, propertyId: "nx3_school", legalName: "Minor L", displayName: "Minor", masthead: ["WRITER"], birthDate: new Date("2011-03-03"), state: "APPROVED" } });
      const noGuardian = await call("POST", "/students/nx3_minor/transition", "nx3_advisor", { to: "ACTIVE" });
      expect(noGuardian.status).toBe(409);
      expect(noGuardian.text).toMatch(/guardian/);

      const link = await call("POST", "/students/nx3_minor/guardian", "nx3_advisor", { legalName: "Parent", email: "p@nx3.invalid", relationship: "PARENT" });
      expect(link.status).toBe(201);
      expect((await call("POST", "/students/nx3_minor/transition", "nx3_advisor", { to: "ACTIVE" })).status).toBe(409);

      await verifyGuardian(staff, link.json.guardianId);
      expect((await call("POST", "/students/nx3_minor/transition", "nx3_advisor", { to: "ACTIVE" })).json.state).toBe("ACTIVE");
    });
  });

  describe("P9-BE-05 / P9-SEC-01 · roles, isolation and the money boundary", () => {
    beforeAll(async () => {
      await activeStudent("nx3_ann");
      await activeStudent("nx3_ben");
      await activeStudent("nx3_sam", "nx3_other");
      await prisma.user.createMany({ data: [
        { id: "nx3_ann_user", tenantId: T, clerkId: "nx3_ann_user", email: "ann@nx3.invalid", roles: ["STUDENT"], studentId: "nx3_ann", propertyId: "nx3_school" },
        { id: "nx3_ben_user", tenantId: T, clerkId: "nx3_ben_user", email: "ben@nx3.invalid", roles: ["STUDENT"], studentId: "nx3_ben", propertyId: "nx3_school" },
      ] });
    });

    it("a student reaches their own record, sales and points — and never a schoolmate's", async () => {
      for (const p of ["", "/sales", "/points", "/code"]) {
        expect((await call("GET", `/students/nx3_ann${p}`, "nx3_ann_user")).status, `own ${p}`).toBe(200);
        expect((await call("GET", `/students/nx3_ben${p}`, "nx3_ann_user")).status, `schoolmate ${p}`).toBe(403);
      }
      const list = await call("GET", "/students", "nx3_ann_user");
      expect(list.json.students.map((s: { id: string }) => s.id)).toEqual(["nx3_ann"]);
    });

    it("an advisor reaches their own school only", async () => {
      expect((await call("GET", "/students/nx3_ann", "nx3_advisor")).status).toBe(200);
      expect((await call("GET", "/students/nx3_sam", "nx3_advisor")).status).toBe(403);
      expect((await call("GET", "/students/nx3_sam/sales", "nx3_advisor")).status).toBe(403);
      const ids = (await call("GET", "/students", "nx3_advisor")).json.students.map((s: { id: string }) => s.id);
      expect(ids).toContain("nx3_ann");
      expect(ids).not.toContain("nx3_sam");
      /* And an advisor adds students to their own school, never another. */
      expect((await call("POST", "/students", "nx3_advisor", { propertyId: "nx3_other", legalName: "x", displayName: "x", masthead: ["WRITER"] })).status).toBe(403);
      expect((await call("POST", "/students", "nx3_advisor", { propertyId: "nx3_school", legalName: "x", displayName: "x", masthead: ["WRITER"] })).status).toBe(201);
    });

    it("AthleteRate.amount is denied to STUDENT and ADVISOR", async () => {
      for (const who of ["nx3_ann_user", "nx3_advisor"]) {
        const r = await call("GET", "/athletes/nx3_ath/rates", who);
        expect(r.status, who).toBe(403);
        expect(r.text, who).not.toContain("17171");
      }
    });

    it("a student cannot write their own sales, code or points", async () => {
      expect((await call("POST", "/students/nx3_ann/code", "nx3_ann_user")).status).toBe(403);
      expect((await call("POST", "/students/nx3_ann/points", "nx3_ann_user", { reason: "ARTICLE" })).status).toBe(403);
    });

    it("the public code resolver publishes the display name and school only", async () => {
      const code = (await call("POST", "/students/nx3_ann/code", "nx3_staff")).json.code as string;
      const r = await call("GET", `/public/s/${code}`, null);
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ code, studentName: "Display nx3_ann", school: "Northside High" });
      expect(r.text).not.toContain("Legal nx3_ann");
      expect((await call("GET", "/public/s/not-a-code", null)).status).toBe(404);
    });
  });

  describe("P9-BE-07 · the code attributes a sale, across many sales", () => {
    it("a sale on a brief carrying the code is credited to the student — and so is the next one, on the same code", async () => {
      await activeStudent("nx3_jordan");
      const code = (await call("POST", "/students/nx3_jordan/code", "nx3_staff")).json.code as string;
      expect((await call("POST", "/students/nx3_jordan/code", "nx3_staff")).json.code).toBe(code); // one code per person
      expect((await call("GET", `/public/s/${code}`, null)).status).toBe(200);

      const edition = await sellingEdition();
      await ed.sellCampaignSlots(staff, edition, await campaignWithCode(code, "NEXT-AD-HALF", "nx3_sponsor"));
      await ed.sellCampaignSlots(staff, edition, await campaignWithCode(code, "NEXT-AD-HALF", "nx3_sponsor2"));
      /* A sale with no code credits nobody. */
      await ed.sellCampaignSlots(staff, edition, await campaignWithCode(null, "NEXT-AD-HALF", "nx3_old_account"));

      const sales = (await call("GET", "/students/nx3_jordan/sales", "nx3_staff")).json;
      expect(sales.sales).toHaveLength(2);
      expect(sales.totalCents).toBe(100_000);
      expect(new Set(sales.sales.map((s: { sponsorId: string }) => s.sponsorId))).toEqual(new Set(["nx3_sponsor", "nx3_sponsor2"]));
      expect(await prisma.salesAttribution.count({ where: { tenantId: T, sponsorId: "nx3_old_account" } })).toBe(0);

      /* $1,000 credited → two SALES_500 accruals, written by the system. */
      const pts = (await call("GET", "/students/nx3_jordan/points", "nx3_staff")).json;
      expect(pts.accruals.filter((a: { reason: string }) => a.reason === "SALES_500")).toHaveLength(2);
      expect(pts.balance).toBe(200);
    });

    it("a departed student's code attributes nothing new", async () => {
      await activeStudent("nx3_gone");
      const code = (await call("POST", "/students/nx3_gone/code", "nx3_staff")).json.code as string;
      await call("POST", "/students/nx3_gone/transition", "nx3_advisor", { to: "INACTIVE" });
      expect((await call("GET", `/public/s/${code}`, null)).status).toBe(404);
      await expect(campaignWithCode(code)).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("P9-BE-13 · attribution is permanent; representation is not", () => {
    it("first student-originated sale sets the account's ownership; graduating changes no attribution row; Postgres refuses edits", async () => {
      const sponsor = await prisma.sponsor.findUniqueOrThrow({ where: { id: "nx3_sponsor" }, select: { ownership: true, schoolPropertyId: true, assignedStudentId: true } });
      expect(sponsor).toEqual({ ownership: "STUDENT_ORIGINATED", schoolPropertyId: "nx3_school", assignedStudentId: "nx3_jordan" });

      const before = JSON.stringify(await prisma.salesAttribution.findMany({ where: { studentId: "nx3_jordan" }, select: ATTRIBUTION_COLS, orderBy: { id: "asc" } }));
      expect((await call("POST", "/students/nx3_jordan/transition", "nx3_advisor", { to: "INACTIVE" })).json.state).toBe("INACTIVE");
      const after = JSON.stringify(await prisma.salesAttribution.findMany({ where: { studentId: "nx3_jordan" }, select: ATTRIBUTION_COLS, orderBy: { id: "asc" } }));
      expect(after).toBe(before);

      const one = await prisma.salesAttribution.findFirstOrThrow({ where: { studentId: "nx3_jordan" }, select: { id: true } });
      await expect(prisma.salesAttribution.update({ where: { id: one.id }, data: { value: 1 } })).rejects.toThrow(/sales_attribution_immutable/);
      await expect(prisma.salesAttribution.delete({ where: { id: one.id } })).rejects.toThrow(/sales_attribution_immutable/);
      /* And the student's record stays readable to staff after they leave. */
      expect((await call("GET", "/students/nx3_jordan/sales", "nx3_staff")).json.sales).toHaveLength(2);
    });

    it("reassigning an account touches only assignedStudentId", async () => {
      await activeStudent("nx3_riley");
      const snap = async () => ({
        sponsor: await prisma.sponsor.findUniqueOrThrow({ where: { id: "nx3_sponsor" }, select: SPONSOR_COLS }),
        attributions: JSON.stringify(await prisma.salesAttribution.findMany({ where: { sponsorId: "nx3_sponsor" }, select: ATTRIBUTION_COLS, orderBy: { id: "asc" } })),
      });
      const before = await snap();
      expect((await call("POST", "/sponsors/nx3_sponsor/assigned-student", "nx3_staff", { studentId: "nx3_riley" })).status).toBe(200);
      const after = await snap();
      expect(after.attributions).toBe(before.attributions);
      const changed = Object.keys(after.sponsor).filter((k) =>
        JSON.stringify((after.sponsor as Record<string, unknown>)[k]) !== JSON.stringify((before.sponsor as Record<string, unknown>)[k]));
      expect(changed.filter((k) => k !== "updatedAt")).toEqual(["assignedStudentId"]);
      expect(after.sponsor.ownership).toBe("STUDENT_ORIGINATED");
    });

    it("a rejected prospect carries a reason, notifies the student, costs no credit, and redirects to an open category", async () => {
      await activeStudent("nx3_taylor");
      await prisma.student.update({ where: { id: "nx3_taylor" }, data: { email: "taylor@nx3.invalid" } });
      await prisma.user.create({ data: { id: "nx3_taylor_user", tenantId: T, clerkId: "nx3_taylor_user", email: "t@nx3.invalid", roles: ["STUDENT"], studentId: "nx3_taylor", propertyId: "nx3_school" } });
      /* Someone already holds RESTAURANT at this school: the presenting sponsor. */
      const edition = await sellingEdition();
      await ed.sellCampaignSlots(staff, edition, await campaignWithCode(null, "NEXT-PRESENTING", "nx3_sponsor2"));
      /* Taylor has credit and points to lose — and must not lose them. */
      await call("POST", "/students/nx3_taylor/points", "nx3_staff", { reason: "ARTICLE" });
      const standing = async () => JSON.stringify([
        await prisma.salesAttribution.findMany({ where: { studentId: "nx3_taylor" }, select: ATTRIBUTION_COLS, orderBy: { id: "asc" } }),
        await prisma.studentPointAccrual.findMany({ where: { studentId: "nx3_taylor" }, select: ACCRUAL_COLS, orderBy: { id: "asc" } }),
      ]);
      const before = await standing();

      expect((await call("POST", "/students/nx3_taylor/prospects", "nx3_taylor_user", { businessName: "Corner Bar", category: "ALCOHOL" })).status).toBe(422);
      const p = await call("POST", "/students/nx3_taylor/prospects", "nx3_taylor_user", { businessName: "Luigi's", category: "RESTAURANT" });
      expect(p.status).toBe(201);
      expect((await call("POST", `/prospects/${p.json.id}/decision`, "nx3_taylor_user", { decision: "REJECT", reasonCode: "OTHER" })).status).toBe(403);
      expect((await call("POST", `/prospects/${p.json.id}/decision`, "nx3_staff", { decision: "REJECT" })).status).toBe(422);

      const d = await call("POST", `/prospects/${p.json.id}/decision`, "nx3_staff", { decision: "REJECT", reasonCode: "CATEGORY_EXCLUSIVE" });
      expect(d.status).toBe(200);
      expect(d.json.state).toBe("REJECTED");
      expect(d.json.redirectCategories.length).toBeGreaterThan(0);
      expect(d.json.redirectCategories).not.toContain("RESTAURANT");
      for (const bad of ["ALCOHOL", "GAMBLING", "CANNABIS"]) expect(d.json.redirectCategories).not.toContain(bad);

      expect(await standing()).toBe(before);
      const mail = await prisma.outboxJob.findFirstOrThrow({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "desc" } });
      expect(mail.payload).toMatchObject({ template: "student.prospectDeclined", to: "taylor@nx3.invalid", data: { reason: "CATEGORY_EXCLUSIVE" } });
      const seen = (await call("GET", "/students/nx3_taylor/prospects", "nx3_taylor_user")).json.prospects[0];
      expect(seen).toMatchObject({ state: "REJECTED", reasonCode: "CATEGORY_EXCLUSIVE" });
    });
  });

  describe("P9-BE-15 · accruals, and no redemption", () => {
    it("records against a student and optionally an edition; SALES_500 cannot be typed in", async () => {
      await activeStudent("nx3_pat");
      const edition = await sellingEdition();
      expect((await call("POST", "/students/nx3_pat/points", "nx3_staff", { reason: "INTERVIEW", editionId: edition })).json.points).toBe(25);
      expect((await call("POST", "/students/nx3_pat/points", "nx3_staff", { reason: "VIEWS_BONUS", points: 40 })).json.points).toBe(40);
      expect((await call("POST", "/students/nx3_pat/points", "nx3_staff", { reason: "SALES_500" })).status).toBe(400);
      const pts = (await call("GET", "/students/nx3_pat/points", "nx3_staff")).json;
      expect(pts.balance).toBe(65);
      expect(pts.accruals.find((a: { reason: string }) => a.reason === "INTERVIEW").editionId).toBe(edition);
    });

    it("redemption is absent by design — no route converts points into anything", async () => {
      const { DOCUMENTED_PATHS } = await import("../src/contracts/registry");
      expect(DOCUMENTED_PATHS.filter((p) => /points/.test(p) && /redeem|payout|convert|cash/i.test(p))).toEqual([]);
    });
  });
});
