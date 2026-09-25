import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-SEC-02 — field-level authz on sponsor surfaces, proven on the wire.

   "Every sponsor-facing query uses explicit select; AthleteRate.amount is
   absent from all of them."

   Two halves:

   1. EXPLICIT SELECT. The project lint rule (P2-OPS-06) already fails the
      build on any bare Prisma read, in src, worker and tests. This file pins
      that the rule exists and covers the request path, so it cannot be
      quietly switched off.

   2. NO ATHLETE PAY ON THE WIRE. Every column that carries what an athlete
      is paid — AthleteRate.amount, NilJob.baseLow/baseHigh, the sell floors,
      CampaignOrder.compensation, Earning.gross — is seeded with a marker
      value no real price would have. Then every documented GET route is
      called as a signed-in SPONSOR_ADMIN and SPONSOR_ANALYST of the sponsor
      whose campaign those rows belong to, with their own ids, and the suite
      fails if any marker appears in any response. A positive control proves
      the sponsor really reached their data (so a pass cannot come from every
      call being refused).

   Skipped without a database, with a reason. CI has one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sponsor-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

/* Marker values: seven digits no price list would produce, each distinct, so
   a hit names the column that leaked. */
const PAY = {
  rateAmount: 9137241,
  baseLow: 9137242,
  baseHigh: 9137243,
  floorEmerging: 9137244,
  floorCreator: 9137245,
  floorPremium: 9137246,
  compensation: 9137247,
  earningGross: 9137248,
} as const;

const T = "fa_tenant";
const ID = {
  sponsor: "fa_sponsor", athlete: "fa_athlete", job: "fa_job", brief: "fa_brief",
  campaign: "fa_campaign", order: "fa_order", deliverable: "fa_deliv", reward: "fa_reward",
  link: "fa_link", earning: "fa_earning", pkg: "fa_pkg",
} as const;
const SPONSORS = [
  { id: "fa_sponsor_admin", roles: ["SPONSOR_ADMIN"] },
  { id: "fa_sponsor_analyst", roles: ["SPONSOR_ANALYST"] },
] as const;

const PARAM_FOR: Record<string, string> = {
  applications: ID.athlete, athletes: ID.athlete, campaigns: ID.campaign, orders: ID.order,
  briefs: ID.brief, invitations: "fa_none", deliverables: ID.deliverable, earnings: ID.earning,
  guardians: "fa_none", rewards: ID.reward, "tracking-links": ID.link,
  students: "fa_student_row",
};

describe("P4-SEC-02 · explicit select is enforced by the build", () => {
  it("the lint rule exists and covers the request path, the worker and the tests", () => {
    const config = readFileSync(new URL("../eslint.config.mjs", import.meta.url), "utf8");
    const rule = readFileSync(new URL("../../eslint.prisma-select.mjs", import.meta.url), "utf8");
    expect(rule).toContain("Prisma reads must name their fields");
    expect(config).toContain('prismaSelectFor(["src/**/*.ts", "worker/**/*.mts", "tests/**/*.ts"])');
  });
});

describe.skipIf(!hasDatabase)("P4-SEC-02 · athlete pay never reaches a sponsor", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { DOCUMENTED_PATHS } = await import("../src/contracts/registry");

  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "Field authz tenant" } });
    await prisma.sponsor.create({ data: { id: ID.sponsor, tenantId: T, name: "FA Sponsor" } });
    await prisma.athlete.create({ data: {
      id: ID.athlete, tenantId: T, slug: "fa-athlete", legalName: "FA Athlete", displayName: "FA",
      email: "fa@x.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", tier: "CREATOR",
    } });
    await prisma.nilJob.create({ data: {
      id: ID.job, tenantId: T, name: "FA Job", baseLow: PAY.baseLow, baseHigh: PAY.baseHigh,
      sellLow: 125, sellHigh: 250, sellFloorEmerging: PAY.floorEmerging,
      sellFloorCreator: PAY.floorCreator, sellFloorPremium: PAY.floorPremium,
    } });
    await prisma.athleteRate.create({ data: { tenantId: T, athleteId: ID.athlete, jobId: ID.job, amount: PAY.rateAmount } });
    await prisma.sponsorPackage.create({ data: {
      id: ID.pkg, tenantId: T, code: "FA_PKG", name: "FA Package", priceLow: 750, priceHigh: 750,
      athleteCountMin: 3, athleteCountMax: 3, lineItems: [{ jobCode: ID.job, quantityPerAthlete: 1 }],
    } });
    await prisma.campaignBrief.create({ data: {
      id: ID.brief, tenantId: T, sponsorId: ID.sponsor, objective: "FA objective", budget: 500000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: [], categories: [],
      state: "CAMPAIGN_CREATED",
    } });
    await prisma.campaign.create({ data: {
      id: ID.campaign, tenantId: T, sponsorId: ID.sponsor, briefId: ID.brief, name: "FA Campaign",
      budget: 500000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "ACTIVE",
    } });
    await prisma.campaignOrder.create({ data: {
      id: ID.order, tenantId: T, campaignId: ID.campaign, athleteId: ID.athlete, jobId: ID.job,
      compensation: PAY.compensation, sellPrice: 40000, usageRights: "90 days", dueDate: new Date("2026-11-15"), state: "ACTIVE",
    } });
    await prisma.deliverable.create({ data: { id: ID.deliverable, tenantId: T, orderId: ID.order, title: "FA post", dueDate: new Date("2026-11-15") } });
    await prisma.trackingLink.create({ data: { id: ID.link, tenantId: T, code: "faseca", deliverableId: ID.deliverable, destinationUrl: "https://x.invalid" } });
    await prisma.reward.create({ data: { id: ID.reward, tenantId: T, campaignId: ID.campaign, offerText: "FA offer", terms: "t", expiresAt: new Date("2026-12-31") } });
    await prisma.earning.create({ data: { id: ID.earning, tenantId: T, athleteId: ID.athlete, orderId: ID.order, gross: PAY.earningGross, taxYear: 2026 } });
    for (const u of SPONSORS) {
      await prisma.user.create({ data: { id: u.id, tenantId: T, clerkId: u.id, email: `${u.id}@x.invalid`, roles: [...u.roles], sponsorId: ID.sponsor } });
    }
    /* SponsorX NEXT (P9-BE-05, P9-SEC-01) — a student and their school's
       advisor in the same tenant, held to the same boundary. */
    await prisma.property.create({ data: { id: "fa_school", tenantId: T, slug: "fa-school", name: "FA School", kind: "SCHOOL" } });
    await prisma.student.create({ data: { id: "fa_student_row", tenantId: T, propertyId: "fa_school", legalName: "FA Student", displayName: "FAS", masthead: ["WRITER"], state: "ACTIVE" } });
    await prisma.user.create({ data: { id: "fa_student", tenantId: T, clerkId: "fa_student", email: "fa_student@x.invalid", roles: ["STUDENT"], studentId: "fa_student_row", propertyId: "fa_school" } });
    await prisma.user.create({ data: { id: "fa_advisor", tenantId: T, clerkId: "fa_advisor", email: "fa_advisor@x.invalid", roles: ["ADVISOR"], propertyId: "fa_school" } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const reads = () =>
    DOCUMENTED_PATHS.filter((r) => r.startsWith("GET "))
      .map((r) => r.slice(4))
      .filter((p) => !/^\/(public|openapi\.json)/.test(p) && p !== "/");

  const concrete = (path: string) =>
    path.replace(/\/([a-z-]+)\/\{(\w+)\}/g, (_m, noun: string) => `/${noun}/${PARAM_FOR[noun] ?? "fa_none"}`);

  async function get(path: string, clerk: string) {
    const res = await fetch(`${base}/api/v1${concrete(path)}`, { headers: { "x-test-clerk": clerk } });
    return { status: res.status, text: await res.text() };
  }

  it("covers every read a sponsor could call", () => {
    expect(reads().length).toBeGreaterThanOrEqual(20);
    expect(reads()).toContain("/catalogue/packages");
    expect(reads()).toContain("/campaigns/{id}/report");
  });

  it("positive control: the sponsor reaches their own campaign, report and catalogue", async () => {
    for (const path of ["/campaigns/{id}/report", "/catalogue/packages", "/catalogue/jobs", "/campaigns/{id}/metrics"]) {
      const { status, text } = await get(path, "fa_sponsor_admin");
      expect(status, `${path}: ${text.slice(0, 200)}`).toBe(200);
    }
    const { text } = await get("/catalogue/jobs", "fa_sponsor_admin");
    expect(text).toContain("FA Job");
    expect(text).toContain("125"); // the SELL price is there
  });

  it("no athlete-pay value appears in any response, for any sponsor role", async () => {
    const leaks: string[] = [];
    for (const sponsor of SPONSORS) {
      for (const path of reads()) {
        const { status, text } = await get(path, sponsor.id);
        for (const [column, marker] of Object.entries(PAY)) {
          if (text.includes(String(marker))) leaks.push(`${sponsor.id} GET ${path} (${status}) → ${column}`);
        }
        /* And the field names themselves never appear in a sponsor body. */
        for (const field of ['"baseLow"', '"baseHigh"', '"compensation"', '"sellFloor']) {
          if (status < 400 && text.includes(field)) leaks.push(`${sponsor.id} GET ${path} → field ${field}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 60_000);

  it("no athlete-pay value appears in any response for a STUDENT or ADVISOR either (P9-SEC-01)", async () => {
    const leaks: string[] = [];
    for (const who of ["fa_student", "fa_advisor"]) {
      for (const path of reads()) {
        const { status, text } = await get(path, who);
        for (const [column, marker] of Object.entries(PAY)) {
          if (text.includes(String(marker))) leaks.push(`${who} GET ${path} (${status}) → ${column}`);
        }
        for (const field of ['"baseLow"', '"baseHigh"', '"compensation"', '"sellFloor', '"amount"', '"gross"']) {
          if (status < 400 && text.includes(field)) leaks.push(`${who} GET ${path} → field ${field}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    /* Positive control: the student does reach their own record. */
    expect((await get("/students/{id}", "fa_student")).status).toBe(200);
  }, 60_000);

  it("a sponsor cannot read an athlete's rate card at all", async () => {
    const { status } = await get("/athletes/{id}/rates", "fa_sponsor_admin");
    expect(status).toBe(403);
  });
});
