import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S7-BE-02 — the sponsor's and the property's intelligence hubs
   (documentation/SponsorX-Hub-Intelligence.md).

   Done when: both reads answer the shapes in SponsorX-Phase3-Screen-
   Contracts.md, cross-tenant and cross-org reads are refused, and the four
   attribution classes are returned separately.

   Every number below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const S = await import("../src/domain/sponsor-intelligence");
const P = await import("../src/domain/property-intelligence");

describe("3S7-BE-02 · the hubs' rules", () => {
  it("formats: NIL jobs, listed items and ad slots in one vocabulary", () => {
    const kinds = new Map([["itm_1", "SIGNAGE"]]);
    expect(["NIL_JOB:SX-01", "NIL_JOB:SX-03", "NIL_JOB:SX-05", "NIL_JOB:SX-07", "LISTING_ITEM:itm_1", "AD_SLOT:s1", "NIL_JOB:SX-99", ""].map((k) => S.formatOf(k, kinds)))
      .toEqual(["SOCIAL_POST", "VIDEO", "APPEARANCE", "PACKAGE", "SIGNAGE", "AD_SLOT", "OTHER", "OTHER"]);
  });

  it("renewal advice at the forecast's 80% and 50%", () => {
    expect([0.8, 0.79, 0.5, 0.49].map(S.renewalOf)).toEqual(["RENEW", "ADJUST", "ADJUST", "LET_END"]);
  });

  it("a partner's score averages delivery and reach, each capped at 1", () => {
    /* 1 of 2 published (0.5); 5,000 a post against a 5,000 average (1). */
    expect(S.partnerScore({ due: 2, published: 1, views: 5000 }, 5000)).toBe(0.75);
    /* Twice the average still counts as 1. */
    expect(S.partnerScore({ due: 2, published: 2, views: 20000 }, 5000)).toBe(1);
    expect(S.partnerScore({ due: 0, published: 0, views: 0 }, 5000)).toBeNull();
  });

  it("category fit: base, listed, sales; restricted and (for a school) age-gated fit 0 with the reason", () => {
    expect(P.categoryFit({ category: "FITNESS", school: true, restricted: false, listed: true, salesToCategory: 1 }))
      .toEqual({ fit: 0.8, reason: "You list items for it; 1 sale(s) to its brands in the last 12 months." });
    expect(P.categoryFit({ category: "APPAREL", school: false, restricted: false, listed: false, salesToCategory: 5 }).fit).toBe(0.7);
    expect(P.categoryFit({ category: "ALCOHOL", school: true, restricted: false, listed: true, salesToCategory: 9 })).toEqual({ fit: 0, reason: "Age-gated: never offered for a school." });
    expect(P.categoryFit({ category: "ALCOHOL", school: false, restricted: false, listed: false, salesToCategory: 0 }).fit).toBe(0.4);
    expect(P.categoryFit({ category: "FITNESS", school: false, restricted: true, listed: true, salesToCategory: 3 })).toEqual({ fit: 0, reason: "Restricted for this property." });
  });
});

describe.skipIf(!hasDatabase)("3S7-BE-02 · the hubs, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact } = await import("../src/domain/facts");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "hbi_t";
  const OTHER = "hbi_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `hbi_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const sponsor = (id: string, tenantId = T) => actor(tenantId, "SPONSOR_ADMIN", { sponsorId: id });
  const manager = (propertyId: string, tenantId = T) => actor(tenantId, "PROPERTY_MGR", { propertyId });
  let k = 0;
  const fact = (campaignId: string, athleteId: string, job: string, kind: string, on: string, measures: Record<string, number>) => prisma.$transaction((tx) => recordFact(tx, {
    tenantId: T, kind: kind as never, key: `hbi:${++k}`, occurredOn: D(on), campaignId, athleteId,
    inventory: { kind: "NIL_JOB", id: job }, channel: "SOCIAL_INSTAGRAM", market: { state: "MD" }, source: { type: "Test", id: `hbi_${k}` }, measures,
  }));

  async function clean() {
    for (const t of [
      "RewardEvent", "RewardToken", "Reward", "MarketplaceOrderLine", "MarketplaceOrder", "Reservation", "Listing", "PricingRecommendation", "InventoryItem",
      "CampaignForecast", "CampaignDaySummary", "Fact", "Benchmark", "Campaign", "Athlete", "Property", "Sponsor",
    ]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Hubs" }, { id: OTHER, name: "Another operator" }] });
    await prisma.sponsor.createMany({ data: [
      { id: "hbi_s1", tenantId: T, name: "Fit Co", categories: ["FITNESS"] },
      { id: "hbi_s2", tenantId: T, name: "Rival Co", categories: ["FITNESS"] },
    ] });
    await prisma.property.createMany({ data: [
      { id: "hbi_p", tenantId: T, slug: "hbi-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "hbi_p2", tenantId: T, slug: "hbi-eastfield", name: "Eastfield FC", kind: "TEAM" },
    ] });
    const athlete = (id: string, name: string, extra: Record<string, unknown> = {}) => prisma.athlete.create({ data: {
      id, tenantId: T, slug: id.replaceAll("_", "-"), legalName: name, displayName: name, email: `${id}@hbi.invalid`, sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", ...extra,
    }, select: { id: true } });
    await athlete("hbi_a1", "Ava Cruz");
    await athlete("hbi_a2", "Ben Ortiz");
    await athlete("hbi_a3", "Cara Diaz", { propertyId: "hbi_p" });
    await prisma.benchmark.create({ data: { tenantId: T, dimension: "ALL", segment: "", metric: "EFFECTIVE_CPM_CENTS", p25: 1500, median: 2000, p75: 2600, sampleSize: 12, windowDays: 365, refreshedAt: NOW } });

    const campaign = (id: string, sponsorId: string, name: string, start: string, end: string, state: string) => prisma.campaign.create({
      data: { id, tenantId: T, sponsorId, name, budget: 100000, startDate: D(start), endDate: D(end), state: state as never }, select: { id: true },
    });
    await campaign("hbi_c1", "hbi_s1", "Fall push", "2026-11-01", "2026-11-30", "ACTIVE");
    await campaign("hbi_c2", "hbi_s1", "October", "2026-10-01", "2026-10-31", "COMPLETED");
    await campaign("hbi_c3", "hbi_s2", "Rival's", "2026-11-01", "2026-11-30", "ACTIVE");
    await campaign("hbi_cd", "hbi_s1", "Draft", "2026-12-01", "2026-12-31", "DRAFT");

    /* C1 — Ava's Sponsored Post: $200 booked, 2 due, 2 published, 10,000 views (API).
            Ben's Athlete Reel: $300 booked, 2 due, 1 published, 5,000 views (manual). */
    await fact("hbi_c1", "hbi_a1", "SX-02", "ORDER_BOOKED", "2026-11-01", { booked_sell_cents: 20000 });
    await fact("hbi_c1", "hbi_a1", "SX-02", "DELIVERABLE_DUE", "2026-11-03", { deliverables_due: 2 });
    await fact("hbi_c1", "hbi_a1", "SX-02", "DELIVERABLE_PUBLISHED", "2026-11-04", { deliverables_published: 2 });
    await fact("hbi_c1", "hbi_a1", "SX-02", "METRIC_RECORDED", "2026-11-06", { views_verified_api: 10000 });
    await fact("hbi_c1", "hbi_a2", "SX-03", "ORDER_BOOKED", "2026-11-01", { booked_sell_cents: 30000 });
    await fact("hbi_c1", "hbi_a2", "SX-03", "DELIVERABLE_DUE", "2026-11-03", { deliverables_due: 2 });
    await fact("hbi_c1", "hbi_a2", "SX-03", "DELIVERABLE_PUBLISHED", "2026-11-04", { deliverables_published: 1 });
    await fact("hbi_c1", "hbi_a2", "SX-03", "METRIC_RECORDED", "2026-11-06", { views_verified_manual: 5000 });
    /* The rival's campaign: never in Fit Co's figures. */
    await fact("hbi_c3", "hbi_a1", "SX-02", "METRIC_RECORDED", "2026-11-06", { views_verified_api: 99999 });

    /* Four fans redeemed Ava's offer on C1; one redeemed on the rival's. */
    await prisma.reward.createMany({ data: [
      { id: "hbi_r1", tenantId: T, campaignId: "hbi_c1", offerText: "Free shake", terms: "One per fan", singleUse: false, expiresAt: D("2027-01-01"), state: "ACTIVE" },
      { id: "hbi_r3", tenantId: T, campaignId: "hbi_c3", offerText: "Rival shake", terms: "One per fan", expiresAt: D("2027-01-01"), state: "ACTIVE" },
    ] });
    await prisma.rewardToken.createMany({ data: [
      { id: "hbi_tk1", tenantId: T, rewardId: "hbi_r1", athleteId: "hbi_a1", token: "hbi-token-1" },
      { id: "hbi_tk3", tenantId: T, rewardId: "hbi_r3", athleteId: "hbi_a1", token: "hbi-token-3" },
    ] });
    await prisma.rewardEvent.createMany({ data: [
      /* A multi-use offer: one token, four redemptions. */
      ...[1, 2, 3, 4].map((i) => ({ id: `hbi_e${i}`, tenantId: T, tokenId: "hbi_tk1", type: "REDEEM" as const, singleUse: false, at: new Date(`2026-11-07T1${i}:00:00Z`) })),
      { id: "hbi_e9", tenantId: T, tokenId: "hbi_tk3", type: "REDEEM" as const, at: new Date("2026-11-07T10:00:00Z") },
    ] });

    /* Forecasts: C1 on course for 27,000 of 30,000 (90%); C2 ended at 8,000 of 20,000 (40%). */
    const forecast = (campaignId: string, day: string, guarantee: number, mid: number, elapsed: number) => prisma.campaignForecast.create({ data: {
      tenantId: T, campaignId, day: D(day), modelVersion: "forecast-rules@1.0.0", metric: "impressions", guarantee, delivered: mid, deliveredSource: "VERIFIED_API",
      elapsed, low: mid, mid, high: mid, probability: 0.9, risk: "on_track", riskFactors: [], actions: [], projection: [], forecastAt: new Date(`${day}T19:30:00Z`),
    }, select: { id: true } });
    await forecast("hbi_c1", "2026-11-10", 30000, 27000, 0.3333);
    await forecast("hbi_c2", "2026-10-31", 20000, 8000, 1);

    /* The school's inventory: its banner (sold to Fit Co, fulfilled), its tickets, and its roster athlete Cara's post (priced by the engine). */
    await prisma.inventoryItem.createMany({ data: [
      { id: "hbi_i1", tenantId: T, propertyId: "hbi_p", title: "Gym banner", kind: "SIGNAGE", priceCents: 30000, description: "Courtside banner", categories: ["FITNESS"] },
      { id: "hbi_i2", tenantId: T, propertyId: "hbi_p", title: "Season tickets", kind: "TICKETS", priceCents: 10000, categories: [] },
      { id: "hbi_i3", tenantId: T, athleteId: "hbi_a3", title: "Cara's post", kind: "SOCIAL_POST", priceCents: 20000, description: "One post", categories: ["APPAREL"] },
      { id: "hbi_i9", tenantId: T, propertyId: "hbi_p2", title: "Eastfield banner", kind: "SIGNAGE", priceCents: 99000, description: "Not Northside's", categories: ["FITNESS"] },
    ] });
    await prisma.listing.create({ data: { id: "hbi_l1", tenantId: T, propertyId: "hbi_p", inventoryItemId: "hbi_i1", title: "Gym banner", state: "PUBLISHED", publishedAt: D("2026-10-01") } });
    await prisma.pricingRecommendation.create({ data: {
      tenantId: T, inventoryId: "hbi_i3", athleteId: "hbi_a3", day: D("2026-11-10"), snapshotDay: D("2026-11-10"), modelVersion: "cpm-rules@1.0.0", confidence: 0.62,
      currentCpmCents: 2000, recommendedCpmCents: 1800, baseCpmCents: 2000, floorCpmCents: 1000, computedAt: NOW,
      factors: [
        { key: "demand", label: "Demand", effect: 0.1, impactCents: 200, explanation: "" },
        { key: "scarcity", label: "Scarcity", effect: -0.2, impactCents: -400, explanation: "" },
        { key: "season", label: "Seasonality", effect: 0.05, impactCents: 100, explanation: "" },
        { key: "floor", label: "Sell floor", effect: 0.01, impactCents: 20, explanation: "" },
      ],
    } });
    await prisma.reservation.create({ data: { id: "hbi_res1", tenantId: T, sponsorId: "hbi_s1", cartId: "hbi_cart1", expiresAt: D("2036-01-01") } });
    await prisma.marketplaceOrder.create({ data: {
      id: "hbi_mo1", tenantId: T, sponsorId: "hbi_s1", reservationId: "hbi_res1", state: "FULFILLED", subtotalCents: 30000, feesCents: 0, totalCents: 30000,
      requiresApproval: false, approvalReasons: [], paidAt: D("2026-10-05"), fulfilledAt: D("2026-10-20"),
    } });
    await prisma.marketplaceOrderLine.create({ data: {
      tenantId: T, orderId: "hbi_mo1", listingId: "hbi_l1", inventoryItemId: "hbi_i1", itemTenantId: T, propertyId: "hbi_p", title: "Gym banner",
      quantity: 1, startsOn: D("2026-10-10"), endsOn: D("2026-10-20"), unitPriceCents: 30000, lineTotalCents: 30000,
    } });
  });

  afterAll(clean);

  it("the sponsor's hub: four classes never added together, formats, partners, no unsourced segments, renewal advice", async () => {
    const h = await S.sponsorIntelligence(sponsor("hbi_s1"), "all", NOW);
    expect(h.campaigns).toEqual({ count: 2, active: 1 });
    expect(h.totals).toEqual({
      VERIFIED_REDEMPTION: { count: 4, amountCents: null },
      VERIFIED_TRANSACTION: { count: 0, amountCents: 0 },
      MODELLED: { count: 0, amountCents: 0 },
      /* 15,000 verified views × $20 per 1,000 = $300 — an estimate. */
      ESTIMATED_MEDIA_VALUE: { count: 15000, amountCents: 30000 },
    });
    expect(h.formats).toEqual([
      /* $200 booked ÷ 4 redemptions = $50 a fan. */
      { format: "SOCIAL_POST", campaigns: 1, deliveredImpressions: 10000, redemptions: 4, costPerResultCents: 5000, provenance: "VERIFIED_API" },
      { format: "VIDEO", campaigns: 1, deliveredImpressions: 5000, redemptions: 0, costPerResultCents: null, provenance: "VERIFIED_MANUAL" },
    ]);
    /* Average 15,000 views over 3 posts = 5,000. Ava: 2 of 2, 5,000 a post → 1. Ben: 1 of 2, 5,000 a post → 0.75. Northside: 1 of 1 lines fulfilled → 1. */
    expect(h.partners.map((p) => [p.kind, p.id, p.name, p.campaigns, p.score, p.provenance, p.stamp.confidence])).toEqual([
      ["athlete", "hbi_a1", "Ava Cruz", 1, 1, "VERIFIED_API", 0.4],
      ["property", "hbi_p", "Northside High", 1, 1, "VERIFIED_MANUAL", 0.2],
      ["athlete", "hbi_a2", "Ben Ortiz", 1, 0.75, "VERIFIED_MANUAL", 0.2],
    ]);
    expect(h.segments).toEqual([]);
    expect(h.renewals.map((r) => [r.campaignId, r.renewalScore, r.recommendation, r.stamp.modelVersion])).toEqual([
      ["hbi_c2", 0.4, "LET_END", "renewal-rules@1.0.0"],
      ["hbi_c1", 0.9, "RENEW", "renewal-rules@1.0.0"],
    ]);
    expect(h.renewals[0]!.reasons).toEqual(["Delivered 8,000 of the 20,000 impressions promised (40%).", "It fell well short of the promise."]);
    expect(h.renewals[1]!.reasons).toEqual([
      "On course to deliver 27,000 of the 30,000 impressions promised (90%).", "4 fans redeemed your offer.", "It delivered what was promised, so it is worth booking again.",
    ]);
  });

  it("the window narrows it: the last 7 days leave out the bookings filed on Nov 1", async () => {
    const h = await S.sponsorIntelligence(sponsor("hbi_s1"), "7d", NOW);
    expect(h.totals.VERIFIED_REDEMPTION.count).toBe(4);
    expect(h.formats.find((f) => f.format === "SOCIAL_POST")!.costPerResultCents).toBe(0);
  });

  it("another sponsor, in the same tenant or another, sees only its own; nobody else reads a sponsor hub", async () => {
    const rival = await S.sponsorIntelligence(sponsor("hbi_s2"), "all", NOW);
    expect(rival.totals.VERIFIED_REDEMPTION.count).toBe(1);
    expect(rival.totals.ESTIMATED_MEDIA_VALUE.count).toBe(99999);
    /* Ava's views on the rival's campaign, with no deliverables there, give no score. */
    expect(rival.partners).toEqual([]);
    const outside = await S.sponsorIntelligence(sponsor("hbi_s1", OTHER), "all", NOW);
    expect(outside.campaigns).toEqual({ count: 0, active: 0 });
    expect(outside.totals.ESTIMATED_MEDIA_VALUE.count).toBe(0);
    for (const a of [actor(T, "BTG_ADMIN"), actor(T, "SALES"), manager("hbi_p"), actor(T, "ATHLETE", { athleteId: "hbi_a1" }), actor(T, "SPONSOR_ADMIN")]) {
      await expect(S.sponsorIntelligence(a, "all", NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("the school's hub: its roster's suggested prices, opportunity, sell-through, category fit and quality", async () => {
    const h = await P.propertyIntelligence(manager("hbi_p"), NOW);
    expect(h.rates).toEqual([{
      inventoryId: "hbi_i3", name: "Cara's post", format: "SOCIAL_POST", currentCpmCents: 2000, recommendedCpmCents: 1800,
      stamp: { modelVersion: "cpm-rules@1.0.0", confidence: 0.62, computedAt: NOW.toISOString() },
      topFactors: [{ label: "Scarcity", effect: -0.2 }, { label: "Demand", effect: 0.1 }, { label: "Seasonality", effect: 0.05 }],
    }]);
    /* The tickets ($100) and Cara's post ($200) have not sold. */
    expect(h.opportunity).toEqual({ openValueCents: 30000, unsoldItems: 2, provenance: "ESTIMATED" });
    expect(h.sellThrough).toEqual([
      { format: "SIGNAGE", sold: 1, listed: 1, rate: 1 },
      { format: "SOCIAL_POST", sold: 0, listed: 1, rate: 0 },
      { format: "TICKETS", sold: 0, listed: 1, rate: 0 },
    ]);
    const fit = new Map(h.categoryFit.categories.map((c) => [c.category, c]));
    expect(h.categoryFit.categories[0]).toEqual({ category: "FITNESS", fit: 0.8, reason: "You list items for it; 1 sale(s) to its brands in the last 12 months." });
    expect(fit.get("APPAREL")!.fit).toBe(0.7);
    expect(fit.get("ALCOHOL")).toEqual({ category: "ALCOHOL", fit: 0, reason: "Age-gated: never offered for a school." });
    expect(fit.get("RESTAURANT")!.fit).toBe(0.4);
    /* Complete 2 of 3 (67), on sale 1 of 3 (33), fulfilled 1 of 1 (100) → 67. */
    expect(h.quality.components.map((c) => [c.label, c.score])).toEqual([["Listings complete", 67], ["On sale", 33], ["Orders fulfilled", 100]]);
    expect(h.quality.score).toBe(67);
  });

  it("another property sees only its own; nobody else reads a property hub", async () => {
    const east = await P.propertyIntelligence(manager("hbi_p2"), NOW);
    expect(east.sellThrough).toEqual([{ format: "SIGNAGE", sold: 0, listed: 1, rate: 0 }]);
    expect(east.opportunity.openValueCents).toBe(99000);
    expect(east.rates).toEqual([]);
    /* A manager whose property is in another tenant reaches nothing here. */
    await expect(P.propertyIntelligence(manager("hbi_p", OTHER), NOW)).rejects.toBeInstanceOf(ForbiddenError);
    for (const a of [actor(T, "BTG_ADMIN"), sponsor("hbi_s1"), actor(T, "ATHLETE", { athleteId: "hbi_a3" }), actor(T, "PROPERTY_MGR")]) {
      await expect(P.propertyIntelligence(a, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
