import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S7-BE-01 — the scenario planner (documentation/SponsorX-Scenarios.md).
   Done when: a scenario can be created, calculated and compared against
   another. Every number below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/scenario-rules");

const inputs = (over: Partial<import("../src/domain/scenario-rules").ScenarioInputs> = {}) => ({
  budgetCents: 10_000_00, cpmCents: 20_00, audience: {}, mix: [{ format: "SOCIAL_POST", share: 1 }], ...over,
});

describe("3S7-BE-01 · the planner's rules", () => {
  it("percentiles interpolate", () => {
    expect([0.25, 0.5, 0.75].map((p) => R.percentile([1, 2, 3, 4], p))).toEqual([1.75, 2.5, 3.25]);
  });

  it("inputs the planner can't take are refused in words", () => {
    expect(R.inputProblems(inputs())).toEqual([]);
    expect(R.inputProblems(inputs({ budgetCents: 0, mix: [{ format: "SIGNAGE", share: 0.9 }], audience: { stateCodes: ["md"] } }))).toEqual([
      "Set a budget above zero.", "The planner can't price SIGNAGE.", "The mix must add up to 100%.", "State codes are two capital letters.",
    ]);
  });

  it("$10,000 at $20 per 1,000 sells 500,000 views; 100 posts at 3,000 / 5,000 / 7,000 a post deliver 300,000 / 500,000 / 700,000", () => {
    const facts = { prices: { SOCIAL_POST: { cents: 100_00, basis: "booked" as const } }, views: { p25: 3000, median: 5000, p75: 7000, athletes: 4, basis: "segment" as const } };
    const on = R.calculate(inputs(), facts, "2026-11-10T00:00:00.000Z");
    expect(on).toMatchObject({ expectedImpressions: { low: 300000, mid: 500000, high: 700000 }, deliveryProbability: 0.5, expectedRevenueCents: 10_000_00, stamp: { confidence: 0.8 } });
    /* At $10 per 1,000 it sells 1,000,000: likely delivery is half, so revenue is half; the chance is Φ(−500,000 ÷ (400,000 ÷ 1.349)) ≈ 4.6%. */
    const cheap = R.calculate(inputs({ cpmCents: 10_00 }), facts, "2026-11-10T00:00:00.000Z");
    expect(cheap.expectedRevenueCents).toBe(5_000_00);
    expect(cheap.deliveryProbability).toBeCloseTo(0.0459, 3);
    expect(cheap.notes).toContain("Likely delivery is 500,000 views short of what is sold: revenue is reduced by what a make-good would cost.");
  });

  it("with no delivery history, views are assumed to match the price and the chance is unknown", () => {
    const r = R.calculate(inputs(), { prices: { SOCIAL_POST: { cents: 100_00, basis: "catalogue" } }, views: { p25: 0, median: 0, p75: 0, athletes: 0, basis: "none" } }, "x");
    expect(r).toMatchObject({ expectedImpressions: { low: 500000, mid: 500000, high: 500000 }, deliveryProbability: 0.5, stamp: { confidence: 0.2 } });
    expect(r.notes.some((x) => x.startsWith("No verified delivery history yet"))).toBe(true);
    expect(r.notes).toContain("No social posts booked yet: priced at the catalogue's $100 a post.");
  });
});

describe.skipIf(!hasDatabase)("3S7-BE-01 · the planner, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { scenarioDesk, calculateScenario, saveScenario, ScenarioInputError } = await import("../src/domain/scenario-engine");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "scn_t";
  const OTHER = "scn_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `scn_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };

  async function clean() {
    for (const t of ["Scenario", "FeatureSnapshot", "CampaignOrder", "Campaign", "Athlete", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Scenarios" }, { id: OTHER, name: "Another operator" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.user.create({ data: { id: "scn_SALES", tenantId: T, clerkId: "scn_sales", email: "sal@scn.invalid", roles: ["SALES"] } });
    await prisma.sponsor.create({ data: { id: "scn_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.create({ data: { id: "scn_c", tenantId: T, sponsorId: "scn_sp", name: "C", budget: 1, startDate: new Date("2026-10-01"), endDate: new Date("2026-10-31"), state: "COMPLETED" }, select: { id: true } });
    /* Four soccer players in MD at 3,000 / 5,000 / 7,000 / 10,000 verified views a post; one tennis player in VA at 50,000. */
    const people: Array<[string, string, string, number]> = [["scn_a1", "Soccer", "MD", 6000], ["scn_a2", "Soccer", "MD", 10000], ["scn_a3", "Soccer", "MD", 14000], ["scn_a4", "Soccer", "MD", 20000], ["scn_a5", "Tennis", "VA", 50000]];
    for (const [id, sport, st, views] of people) {
      await prisma.athlete.create({ data: {
        id, tenantId: T, slug: id.replaceAll("_", "-"), legalName: id, displayName: id, email: `${id}@scn.invalid`, sport, city: "X", stateCode: st, ageBand: "18_PLUS", state: "ACTIVE",
      }, select: { id: true } });
      await prisma.featureSnapshot.create({ data: {
        tenantId: T, entityType: "ATHLETE", entityId: id, day: new Date("2026-11-09"), version: "features@1",
        features: { engagement: { verifiedViews: id === "scn_a5" ? views : views, verifiedEngagements: 0, rate: null }, delivery: { published: id === "scn_a5" ? 1 : 2 } },
      } });
    }
    /* Social posts booked at $100 each in the last year; no video booked. */
    for (const [i, a] of ["scn_a1", "scn_a2"].entries()) {
      await prisma.campaignOrder.create({ data: {
        id: `scn_o${i}`, tenantId: T, campaignId: "scn_c", athleteId: a, jobId: "SX-02", compensation: 5000, sellPrice: 10000, usageRights: "90 days",
        dueDate: new Date("2026-10-20"), state: "COMPLETED", acceptedAt: new Date("2026-10-02"),
      }, select: { id: true } });
    }
  });

  afterAll(clean);

  it("the desk: starting inputs and only what it can calculate for", async () => {
    const d = await scenarioDesk(actor(T, "CAMPAIGN_MGR"), page);
    expect(d.options).toEqual({
      formats: [{ key: "SOCIAL_POST", label: "Social post" }, { key: "VIDEO", label: "Video" }],
      sports: ["Soccer", "Tennis"], stateCodes: ["MD", "VA"], ageBands: ["18_PLUS"],
    });
    expect(d.defaults).toMatchObject({ budgetCents: 10_000_00, cpmCents: 20_00, mix: [{ format: "SOCIAL_POST", share: 0.6 }, { format: "VIDEO", share: 0.4 }] });
  });

  it("calculate: soccer in MD, all posts — 100 posts at the four players' 4,500 / 6,000 / 7,750 a post; nothing stored", async () => {
    const r = await calculateScenario(actor(T, "SALES"), inputs({ audience: { sport: "soccer", stateCodes: ["MD"] } }), NOW);
    expect(r.expectedImpressions).toEqual({ low: 450000, mid: 600000, high: 775000 });
    expect(r.expectedRevenueCents).toBe(10_000_00);
    /* Φ(100,000 ÷ (325,000 ÷ 1.349)) ≈ 66%. */
    expect(r.deliveryProbability).toBeCloseTo(0.661, 2);
    expect(r.notes).toContain("Based on 4 matching athletes' verified views per post.");
    expect(await prisma.scenario.count({ where: { tenantId: T } })).toBe(0);
  });

  it("a thin audience falls back to the whole network; an unbooked format to the catalogue", async () => {
    const r = await calculateScenario(actor(T, "SALES"), inputs({ audience: { sport: "Tennis" }, mix: [{ format: "VIDEO", share: 1 }] }), NOW);
    expect(r.notes).toContain("Fewer than 3 athletes with a delivery record match this audience: every athlete's history is used instead.");
    expect(r.notes).toContain("No videos booked yet: priced at the catalogue's $500 a post.");
    /* $10,000 ÷ $500 = 20 videos × the network's median 7,000 a post = 140,000. */
    expect(r.expectedImpressions.mid).toBe(140000);
    await expect(calculateScenario(actor(T, "SALES"), inputs({ mix: [{ format: "SOCIAL_POST", share: 0.5 }] }), NOW)).rejects.toBeInstanceOf(ScenarioInputError);
  });

  it("save two and compare them as they were made; another tenant sees neither; sponsors never plan", async () => {
    const a = await saveScenario(actor(T, "SALES"), { name: "All posts", inputs: inputs({ audience: { sport: "Soccer", stateCodes: ["MD"] } }) }, NOW);
    const b = await saveScenario(actor(T, "SALES"), { name: "Cheaper CPM", inputs: inputs({ cpmCents: 10_00, audience: { sport: "Soccer", stateCodes: ["MD"] } }) }, new Date(NOW.getTime() + 1000));
    expect(a).toMatchObject({ name: "All posts", savedBy: "sal@scn.invalid", result: { expectedImpressions: { mid: 600000 }, stamp: { modelVersion: "scenario-rules@1.0.0" } } });
    expect(b.result.expectedRevenueCents).toBe(6_000_00);
    const d = await scenarioDesk(actor(T, "BTG_ADMIN"), page);
    expect(d.scenarios.map((s) => s.name)).toEqual(["Cheaper CPM", "All posts"]);
    expect(d.page.total).toBe(2);
    expect((await scenarioDesk(actor(OTHER, "BTG_ADMIN"), page)).scenarios).toEqual([]);
    for (const x of [actor(T, "SPONSOR_ADMIN", { sponsorId: "scn_sp" }), actor(T, "FINANCE"), actor(T, "ATHLETE", { athleteId: "scn_a1" })]) {
      await expect(scenarioDesk(x, page)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
