import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { BenchmarkView } from "../src/domain/benchmarks";
import type { AthleteFeatures } from "../src/domain/feature-snapshots";

/* --------------------------------------------------------------------------
   3S2-BE-02 — the dynamic CPM engine, v1 (documentation/SponsorX-Fact-Ledger.md §13).

   Done when: every recommended price exposes model version, confidence and
   factor breakdown. Each expected price below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { recommend, PRICING_MODEL_VERSION, MAX_TOTAL } = await import("../src/domain/pricing-engine");

const NOW = new Date("2026-10-14T20:00:00Z");
const bench = (dimension: string, segment: string, median: number, sampleSize: number, p25 = median - 500, p75 = median + 600): BenchmarkView => ({
  dimension: dimension as never, segment, metric: "EFFECTIVE_CPM_CENTS", p25, median, p75, sampleSize, smallSample: sampleSize < 10, windowDays: 365, refreshedAt: NOW.toISOString(),
});
function features(over: Partial<{ [K in keyof AthleteFeatures]: Partial<AthleteFeatures[K]> }> = {}): AthleteFeatures {
  const base: AthleteFeatures = {
    window: { days: 90, from: "2026-07-17", to: "2026-10-14" },
    audience: { platforms: [{ platform: "INSTAGRAM", followers: 10000, avgViews: 2000, source: "VERIFIED_API" }], totalFollowers: 10000, totalAvgViews: 2000, anyVerified: true },
    engagement: { verifiedViews: 0, verifiedEngagements: 0, rate: null },
    delivery: { due: 0, published: 0, verified: 0, revisionsRequested: 0, dueByToday: 0, publishedOnTime: 0, onTimeRate: null, ordersCancelled: 0 },
    demand: { ordersBooked: 0, bookedNetCents: 0, sameSportAndStateOrdersBooked: 0 },
    seasonality: { index: null, bookingsThisMonthLastYear: 0, averageMonthlyBookings: 0, reason: "less than 365 days of Soccer bookings" },
    geography: { state: "MD", city: "Baltimore", stateOrdersBooked: 0 },
    scarcity: { sameSportStateTier: 7 },
    benchmarks: { all: null, sport: null, market: null, audience: null },
  };
  for (const [k, v] of Object.entries(over)) Object.assign((base as Record<string, object>)[k]!, v);
  return base;
}
const input = (f: AthleteFeatures, benchmarks: BenchmarkView[], opts: { price?: number; floor?: number | null; median?: number | null; typical?: number } = {}) => ({
  item: { id: "it_1", priceCents: opts.price ?? 6000, jobId: "SX-04" },
  athlete: { sport: "Soccer", stateCode: "md", tier: "CREATOR" },
  snapshot: { day: "2026-10-14", features: f },
  benchmarks,
  floorPriceCents: opts.floor === undefined ? 5000 : opts.floor,
  peers: { medianEngagementRate: opts.median === undefined ? 0.04 : opts.median, ordersPerAthlete: new Map([["Soccer|MD", opts.typical ?? 2]]) },
  computedAt: NOW,
});
const sums = (r: { baseCpmCents: number; recommendedCpmCents: number; factors: Array<{ impactCents: number }> }) =>
  r.baseCpmCents + r.factors.reduce((t, f) => t + f.impactCents, 0) === r.recommendedCpmCents;

describe("3S2-BE-02 · the CPM engine's rules", () => {
  it("starts from the most specific benchmark with enough orders, adjusts by the snapshot, capped in total, and says why", () => {
    const f = features({
      engagement: { verifiedViews: 10000, verifiedEngagements: 600, rate: 0.06 },
      delivery: { due: 4, published: 4, dueByToday: 4, publishedOnTime: 4, onTimeRate: 1 },
      demand: { ordersBooked: 3 },
      seasonality: { index: 1.2, reason: null },
      scarcity: { sameSportStateTier: 2 },
    });
    /* The job's benchmark has 12 orders, so it wins over the sport's 30. */
    const r = recommend(input(f, [bench("FORMAT", "SX-04", 2000, 12, 1500, 2600), bench("SPORT", "Soccer", 1500, 30)]))!;
    /* Raw: engagement (0.06/0.04 − 1) × 0.5 = 0.25 → capped 0.20; delivery (1 − 0.8) × 0.5 = 0.10;
       demand (3/2 − 1) × 0.1 = 0.05; seasonality 0.2 × 0.25 = 0.05; scarcity (2 peers) 0.10.
       Sum 0.50 > 0.40 → each × 0.8: 0.16, 0.08, 0.04, 0.04, 0.08 → on a 2000 base: 320, 160, 80, 80, 160. */
    expect(r.factors.map((x) => [x.key, x.effect, x.impactCents])).toEqual([
      ["engagement", 0.16, 320], ["delivery", 0.08, 160], ["demand", 0.04, 80], ["seasonality", 0.04, 80], ["scarcity", 0.08, 160],
    ]);
    expect(r.factors.reduce((t, x) => t + x.effect, 0)).toBeCloseTo(MAX_TOTAL, 6);
    expect(r).toMatchObject({
      id: "computed:it_1:2026-10-14",
      baseCpmCents: 2000, recommendedCpmCents: 2800,
      /* $60 ÷ 2,000 projected impressions × 1,000; the $50 floor likewise. */
      currentCpmCents: 3000, floorCpmCents: 2500,
      range: { p25Cents: 1500, medianCents: 2000, p75Cents: 2600, sampleSize: 12, basis: "SX-04 orders, last 12 months" },
      /* 0.35 (12 orders) + 0.20 verified audience + 0.15 delivery record + 0.10 engagement + 0.05 seasonality + 0.05 demand. */
      stamp: { modelVersion: PRICING_MODEL_VERSION, confidence: 0.9, computedAt: NOW.toISOString() },
    });
    expect(sums(r)).toBe(true);
    for (const x of r.factors) expect(x.explanation.length).toBeGreaterThan(20);
  });

  it("never goes below the sell floor; the floor shows as its own factor, and the sum still adds up", () => {
    const f = features({ audience: { platforms: [{ platform: "INSTAGRAM", followers: 10000, avgViews: 2000, source: "SELF_REPORTED" }], anyVerified: false } });
    /* No group reaches 10 orders: the largest there is (all orders, 3) is used, and called small. */
    const r = recommend(input(f, [bench("ALL", "", 1000, 3), bench("SPORT", "Soccer", 900, 2)], { typical: 0 }))!;
    expect(r.factors.map((x) => [x.key, x.effect, x.impactCents])).toEqual([
      ["engagement", 0, 0], ["delivery", 0, 0], ["demand", 0, 0], ["seasonality", 0, 0], ["scarcity", 0, 0], ["floor", 1.5, 1500],
    ]);
    expect(r).toMatchObject({ baseCpmCents: 1000, recommendedCpmCents: 2500, floorCpmCents: 2500 });
    expect(r.range!.basis).toBe("all orders, last 12 months (small sample)");
    /* 0.15 (a small sample) + 0.05 (an audience, self-reported). */
    expect(r.stamp.confidence).toBe(0.2);
    expect(sums(r)).toBe(true);
  });

  it("with no benchmark at all, starts from the item's own current price, at the lowest confidence, with no range", () => {
    const r = recommend(input(features(), [], { floor: null, typical: 0 }))!;
    expect(r).toMatchObject({ baseCpmCents: 3000, recommendedCpmCents: 3000, currentCpmCents: 3000, floorCpmCents: null, range: null });
    expect(r.stamp.confidence).toBe(0.25);
  });

  it("with no benchmark and no audience to imply a price from, does not guess", () => {
    expect(recommend(input(features({ audience: { platforms: [], totalFollowers: 0, totalAvgViews: 0, anyVerified: false } }), []))).toBeNull();
  });

  it("fewer recent orders than comparable athletes lowers the price: none against a typical 2 is −10%", () => {
    const r = recommend(input(features(), [bench("ALL", "", 1000, 40)], { floor: null }))!;
    expect(r.factors.find((x) => x.key === "demand")).toMatchObject({ effect: -0.1, impactCents: -100 });
    expect(r.recommendedCpmCents).toBe(900);
  });

  it("an ANCHOR athlete (no derived floor) gets no floor factor", () => {
    const r = recommend(input(features(), [bench("ALL", "", 1000, 40)], { floor: null, typical: 0 }))!;
    expect(r.floorCpmCents).toBeNull();
    expect(r.factors.some((x) => x.key === "floor")).toBe(false);
    expect(r.recommendedCpmCents).toBe(1000);
  });
});

describe.skipIf(!hasDatabase)("3S2-BE-02 · the pricing reads", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { pricingDesk, pricingDetail, overridePrice, storePricingRecommendations, NotPricedError, OverrideReasonError, OverrideBelowFloorError } = await import("../src/domain/pricing-engine");
  const { takeFeatureSnapshots } = await import("../src/domain/feature-snapshots");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "pe_t";
  const OTHER = "pe_o";
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `pe_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const TODAY = new Date();
  const TOMORROW = new Date(TODAY.getTime() + 86_400_000);
  const recOf = async (tenantId: string, item: string) => (await pricingDetail(actor(tenantId, "BTG_ADMIN"), item)).recommendation;

  async function clean() {
    for (const t of ["PricingOverride", "PricingRecommendation", "FeatureSnapshot", "Benchmark", "InventoryItem", "AthleteSocial", "Athlete", "Property", "AuditLog", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Pricing" }, { id: OTHER, name: "Another operator" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    for (const [id, tenantId, displayName] of [["pe_a1", T, "Sam Lee"], ["pe_b1", OTHER, "Other Athlete"]] as const) {
      await prisma.athlete.create({ data: {
        id, tenantId, slug: id.replace("_", "-"), legalName: displayName, displayName, email: `${id}@pe.invalid`, sport: "Soccer",
        city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", tier: "CREATOR",
      }, select: { id: true } });
      await prisma.athleteSocial.create({ data: { tenantId, athleteId: id, platform: "INSTAGRAM", handle: id, followers: 10000, avgViews: 2000, source: "VERIFIED_API" }, select: { id: true } });
    }
    await prisma.property.create({ data: { id: "pe_p1", tenantId: T, slug: "pe-arena", name: "PE Arena", kind: "SCHOOL" }, select: { id: true } });
    await prisma.inventoryItem.createMany({ data: [
      { id: "pe_i1", tenantId: T, athleteId: "pe_a1", jobId: "SX-04", title: "Instagram post", kind: "SOCIAL_POST", priceCents: 60000 },
      { id: "pe_i2", tenantId: T, athleteId: "pe_a1", jobId: "SX-04", title: "Retired post", kind: "SOCIAL_POST", priceCents: 60000, active: false },
      /* A venue's item: not priced in v1. */
      { id: "pe_i3", tenantId: T, propertyId: "pe_p1", title: "Scoreboard sign", kind: "SIGNAGE", priceCents: 90000 },
      { id: "pe_j1", tenantId: OTHER, athleteId: "pe_b1", jobId: "SX-04", title: "Other post", kind: "SOCIAL_POST", priceCents: 60000 },
    ] });
    await prisma.user.createMany({ data: [
      { id: "pe_BTG_ADMIN", tenantId: T, clerkId: "pe_btg", email: "ana@pe.invalid", roles: ["BTG_ADMIN"] },
      { id: "pe_o_BTG_ADMIN", tenantId: OTHER, clerkId: "pe_obtg", email: "olly@pe.invalid", roles: ["BTG_ADMIN"] },
    ] });
    for (const t of [T, OTHER]) {
      await takeFeatureSnapshots(prisma, TODAY, { tenantId: t });
      await storePricingRecommendations(TODAY, { tenantId: t });
    }
  });

  afterAll(clean);

  it("lists the tenant's priced athlete items, each with its stamp, and a summary over all of them", async () => {
    const desk = await pricingDesk(actor(T, "BTG_ADMIN"), { page });
    expect(desk.items.map((i) => i.inventoryId)).toEqual(["pe_i1"]);
    expect(desk.items[0]).toMatchObject({
      title: "Instagram post", kind: "SOCIAL_POST", seller: { kind: "ATHLETE", id: "pe_a1", name: "Sam Lee" }, override: null,
      /* $600 ÷ 2,000 impressions × 1,000 = 30,000; no benchmarks yet, so it starts there.
         The only Soccer, Maryland, Creator athlete: scarcity +10% → 33,000. */
      currentCpmCents: 30000, recommendedCpmCents: 33000,
      stamp: { modelVersion: "cpm-rules@1.0.0" },
    });
    expect(desk.summary).toEqual({ priced: 1, above: 1, below: 0, atRate: 0, lowConfidence: 1 });
    expect(desk.page).toEqual({ page: 1, size: 25, total: 1, pages: 1 });
    expect((await pricingDesk(actor(T, "SALES"), { page, view: "above" })).items).toHaveLength(1);
    expect((await pricingDesk(actor(T, "SALES"), { page, view: "below" })).items).toEqual([]);
    expect((await pricingDesk(actor(T, "CAMPAIGN_MGR"), { page, search: "sam" })).items).toHaveLength(1);
  });

  it("one item's detail: base, factors that add up, floor, range and stamp; only BTG admins may override", async () => {
    const d = await pricingDetail(actor(T, "BTG_ADMIN"), "pe_i1");
    expect(d.inventory).toEqual({ id: "pe_i1", title: "Instagram post", kind: "SOCIAL_POST", seller: { kind: "ATHLETE", id: "pe_a1", name: "Sam Lee" }, priceCents: 60000 });
    const r = d.recommendation;
    expect(r.baseCpmCents + r.factors.reduce((t, f) => t + f.impactCents, 0)).toBe(r.recommendedCpmCents);
    expect(r.factors.map((f) => f.key)).toEqual(["engagement", "delivery", "demand", "seasonality", "scarcity"]);
    expect(r.floorCpmCents).toBe(Math.round((NIL_JOBS.find((j) => j.id === "SX-04")!.sellFloorCreator * 100 / 2000) * 1000));
    expect(d).toMatchObject({ overrides: [], canOverride: true });
    expect((await pricingDetail(actor(T, "SALES"), "pe_i1")).canOverride).toBe(false);
    expect((await pricingDetail(actor(T, "CAMPAIGN_MGR"), "pe_i1")).canOverride).toBe(false);
  });

  it("an item that is not priced, retired, or another tenant's answers 404 — never another tenant's figures", async () => {
    for (const id of ["pe_i2", "pe_i3", "pe_j1", "nope"]) {
      await expect(pricingDetail(actor(T, "BTG_ADMIN"), id)).rejects.toBeInstanceOf(NotPricedError);
    }
    expect((await pricingDesk(actor(OTHER, "BTG_ADMIN"), { page })).items.map((i) => i.inventoryId)).toEqual(["pe_j1"]);
  });

  it("sellers and sponsors never see the engine", async () => {
    for (const a of [actor(T, "ATHLETE", { athleteId: "pe_a1" }), actor(T, "SPONSOR_ADMIN"), actor(T, "FINANCE")]) {
      await expect(pricingDesk(a, { page })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(pricingDetail(a, "pe_i1")).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("stores one suggestion per item per day, as made: a second run the same day stores nothing", async () => {
    expect(await storePricingRecommendations(TODAY, { tenantId: T })).toEqual({ tenants: 1, items: 1, stored: 0, alreadyStored: 1, skipped: [] });
    expect(await prisma.pricingRecommendation.count({ where: { tenantId: T } })).toBe(1);
    expect((await recOf(T, "pe_i1")).id).not.toMatch(/^computed:/);
  });

  it("the database refuses any edit of a suggestion or an override — and any delete outside a purgeable database", async () => {
    const rec = await recOf(T, "pe_i1");
    await expect(prisma.pricingRecommendation.update({ where: { id: rec.id }, data: { recommendedCpmCents: 1 }, select: { id: true } })).rejects.toThrow(/pricing_append_only/);
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL sponsorx.audit_purge = 'off'`);
      await tx.$executeRawUnsafe(`DELETE FROM "PricingRecommendation" WHERE id = $1`, rec.id);
    })).rejects.toThrow(/pricing_append_only/);
  });

  it("an override: BTG admins only, with a reason of 10–500 characters, never below the floor (and the attempt is audited)", async () => {
    const rec = await recOf(T, "pe_i1");
    await expect(overridePrice(actor(T, "SALES"), rec.id, { cpmCents: 30000, reason: "Sales would like this" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(overridePrice(actor(T, "CAMPAIGN_MGR"), rec.id, { cpmCents: 30000, reason: "A manager would like this" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(overridePrice(actor(T, "BTG_ADMIN"), rec.id, { cpmCents: 30000, reason: "   too short   " })).rejects.toBeInstanceOf(OverrideReasonError);
    await expect(overridePrice(actor(T, "BTG_ADMIN"), rec.id, { cpmCents: 30000, reason: "x".repeat(501) })).rejects.toBeInstanceOf(OverrideReasonError);
    await expect(overridePrice(actor(T, "BTG_ADMIN"), rec.id, { cpmCents: rec.floorCpmCents! - 1, reason: "Undercut the competition" })).rejects.toBeInstanceOf(OverrideBelowFloorError);
    expect(await prisma.auditLog.findMany({ where: { tenantId: T, action: "pricing.floorOverrideAttempt" }, select: { entityId: true, actorId: true } }))
      .toEqual([{ entityId: rec.id, actorId: "pe_BTG_ADMIN" }]);
    expect(await prisma.pricingOverride.count({ where: { tenantId: T } })).toBe(0);
    /* Another tenant's admin cannot reach it. */
    await expect(overridePrice(actor(OTHER, "BTG_ADMIN", { userId: "pe_o_BTG_ADMIN" }), rec.id, { cpmCents: 30000, reason: "Not my tenant's item" })).rejects.toBeInstanceOf(NotPricedError);
  });

  it("an accepted override is its own record and an audit row; the suggestion and the listed price are untouched", async () => {
    const rec = await recOf(T, "pe_i1");
    const { override } = await overridePrice(actor(T, "BTG_ADMIN"), rec.id, { cpmCents: 31000, reason: "  Agreed with the sponsor at launch  " });
    expect(override).toMatchObject({ cpmCents: 31000, reason: "Agreed with the sponsor at launch", by: { name: "ana@pe.invalid" } });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "pricing.override", entityId: override.id } })).toBe(1);
    expect(await recOf(T, "pe_i1")).toEqual(rec);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: "pe_i1" }, select: { priceCents: true } })).priceCents).toBe(60000);
    expect((await pricingDesk(actor(T, "SALES"), { page })).items[0]!.override).toEqual({ cpmCents: 31000, at: override.at });
  });

  it("the newest override is in force, and stays in force when tomorrow's suggestion arrives; every override is listed, newest first", async () => {
    const first = await recOf(T, "pe_i1");
    const { override: second } = await overridePrice(actor(T, "BTG_ADMIN"), first.id, { cpmCents: 32000, reason: "Raised after the playoff run" });
    await takeFeatureSnapshots(prisma, TOMORROW, { tenantId: T });
    await storePricingRecommendations(TOMORROW, { tenantId: T });
    const tomorrow = await pricingDetail(actor(T, "BTG_ADMIN"), "pe_i1", TOMORROW);
    expect(tomorrow.recommendation.id).not.toBe(first.id);
    expect(tomorrow.overrides.map((o) => [o.cpmCents, o.reason])).toEqual([[32000, "Raised after the playoff run"], [31000, "Agreed with the sponsor at launch"]]);
    expect((await pricingDesk(actor(T, "BTG_ADMIN"), { page }, TOMORROW)).items[0]!.override).toEqual({ cpmCents: 32000, at: second.at });
    /* Today's view still shows today's suggestion. */
    expect((await pricingDetail(actor(T, "BTG_ADMIN"), "pe_i1", TODAY)).recommendation.id).toBe(first.id);
  });
});
