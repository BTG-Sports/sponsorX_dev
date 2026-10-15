import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S5 — make-goods (documentation/SponsorX-Make-Goods.md).

   3S5-BE-01 — recommendations respect the sponsor's target, availability,
               exclusivity and estimated value equivalence.
   3S5-BE-02 — a make-good approval is recorded, audited and reflected in the
               campaign; automatic when every safety check passes (user,
               2026-10-15), held for BTG with the reasons otherwise.

   Every number below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/makegood-rules");

const D = (s: string) => new Date(`${s}T00:00:00Z`);

const draft = (over: Partial<import("../src/domain/makegood-rules").OptionDraft> = {}) => ({
  inventoryItemId: "i", inventoryName: "Item", propertyName: "Owner", format: "Social post ×1", units: 1, estimatedDelivery: 15000,
  basis: "own_history" as const, verifiedEstimate: true, equivalencyScore: 1, costCents: 100000, costImpactCents: -200000,
  checks: { available: true, exclusivityClear: true, meetsTarget: true }, problems: [], youth: false, reason: "",
  ...over,
});

describe("3S5 · the make-good rules", () => {
  it("the make-good runs for 14 days from tomorrow, past the campaign's end if need be", () => {
    expect(R.makeGoodWindow(new Date("2026-11-27T20:00:00Z"))).toEqual({ startsOn: D("2026-11-28"), endsOn: D("2026-12-11") });
  });

  it("one unit's estimate: own verified history first, then the profile, then the benchmark; nothing for redemptions", () => {
    const athlete = { published: 4, verifiedViews: 20000, verifiedEngagements: 1200, profileAvgViews: 9000 };
    const benchmark = { cpmCents: 2500, sampleSize: 12 };
    /* 20,000 verified views over 4 posts = 5,000 a post. */
    expect(R.unitEstimate("impressions", { athlete, priceCents: 50000, benchmark })).toMatchObject({ perUnit: 5000, basis: "own_history", verified: true });
    expect(R.unitEstimate("engagements", { athlete, priceCents: 50000, benchmark })).toMatchObject({ perUnit: 300, basis: "own_history" });
    /* Two posts are too few: the profile's typed average, not verified. */
    expect(R.unitEstimate("impressions", { athlete: { ...athlete, published: 2 }, priceCents: 50000, benchmark })).toMatchObject({ perUnit: 9000, basis: "profile", verified: false });
    /* A venue's item: $500 at $25 per 1,000 = 20,000 impressions; 12 orders behind it is verified, 3 is not. */
    expect(R.unitEstimate("impressions", { priceCents: 50000, benchmark })).toMatchObject({ perUnit: 20000, basis: "benchmark", verified: true });
    expect(R.unitEstimate("impressions", { priceCents: 50000, benchmark: { cpmCents: 2500, sampleSize: 3 } })?.verified).toBe(false);
    expect(R.unitEstimate("engagements", { priceCents: 50000, benchmark })).toBeNull();
    expect(R.unitEstimate("redemptions", { athlete, priceCents: 50000, benchmark })).toBeNull();
    expect(R.unitEstimate("deliverables", { priceCents: 50000, benchmark: null })).toMatchObject({ perUnit: 1, basis: "count", verified: true });
  });

  it("units cover the shortfall, within 1–10, the stock and the package's rules", () => {
    expect(R.unitsFor(15000, 5000, { quantity: null })).toBe(3);
    expect(R.unitsFor(15000, 4000, { quantity: null })).toBe(4);
    expect(R.unitsFor(15000, 5000, { quantity: 2 })).toBe(2);
    expect(R.unitsFor(15000, 5000, { quantity: null, max: 1 })).toBe(1);
    expect(R.unitsFor(15000, 100, { quantity: null })).toBe(10);
    expect(R.unitsFor(15000, 50000, { quantity: null, min: 4 })).toBe(4);
  });

  it("equivalency is the smaller over the larger: 15,000 short, 16,000 offered = 93.75%", () => {
    expect(R.equivalency(15000, 16000)).toBe(0.9375);
    expect(R.equivalency(15000, 10000)).toBe(0.6667);
    expect(R.equivalency(15000, 0)).toBe(0);
  });

  it("the sponsor's target: states, sports, tiers, minimum audience, channels — sport, tier and audience only for an athlete", () => {
    const t = { stateCodes: ["MD"], sports: ["Soccer"], channels: ["INSTAGRAM"], audienceTiers: ["CREATOR"], audienceMinFollowers: 10000 };
    expect(R.targetMisses(t, { stateCode: "md", athlete: { sport: "soccer", tier: "CREATOR", maxFollowers: 12000 }, channels: ["INSTAGRAM", "IN_PERSON"] })).toEqual([]);
    expect(R.targetMisses(t, { stateCode: "VA", athlete: { sport: "Tennis", tier: "EMERGING", maxFollowers: 900 }, channels: ["TIKTOK"] })).toEqual([
      "outside the sponsor's states", "not one of the sponsor's sports", "outside the sponsor's audience tiers", "under the sponsor's minimum audience", "not on the sponsor's channels",
    ]);
    expect(R.targetMisses(t, { stateCode: "MD", athlete: null, channels: ["IN_PERSON"] })).toEqual(["not on the sponsor's channels"]);
    expect(R.targetMisses({ stateCodes: [], sports: [], channels: [], audienceTiers: [], audienceMinFollowers: null }, { stateCode: null, athlete: null, channels: [] })).toEqual([]);
  });

  it("shown: passing ones best first (closest, then cheapest), then up to two closer ones failing a check", () => {
    const fail = { available: true, exclusivityClear: false, meetsTarget: true };
    const shown = R.chooseOptions([
      draft({ inventoryItemId: "b", equivalencyScore: 0.9375, costImpactCents: 20000 }),
      draft({ inventoryItemId: "a", equivalencyScore: 0.9375, costImpactCents: -20000 }),
      draft({ inventoryItemId: "x", equivalencyScore: 1, checks: fail }),
      draft({ inventoryItemId: "y", equivalencyScore: 0.99, checks: fail }),
      draft({ inventoryItemId: "z", equivalencyScore: 0.98, checks: fail }),
      draft({ inventoryItemId: "w", equivalencyScore: 0.5, checks: fail }),
    ]);
    expect(shown.map((o) => o.inventoryItemId)).toEqual(["a", "b", "x", "y"]);
    expect(R.bestOption(shown)?.inventoryItemId).toBe("a");
    expect(R.bestOption([draft({ checks: fail })])).toBeNull();
  });

  it("automatic approval only when every safety check passes; otherwise held with every reason", () => {
    const facts = { shortfall: 15000, elapsed: 0.9, sensitive: false };
    expect(R.autoDecision([draft()], facts)).toMatchObject({ approve: true, option: { inventoryItemId: "i" } });
    expect(R.autoDecision([draft()], { ...facts, elapsed: 0.5 })).toEqual({ approve: false, held: [
      "Only 50% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain.",
    ] });
    expect(R.autoDecision([draft({ estimatedDelivery: 9000, costImpactCents: 5000, youth: true, verifiedEstimate: false })], { ...facts, sensitive: true })).toEqual({ approve: false, held: [
      "The sponsor's category is age-gated, so a person decides.",
      "The best substitute covers 60% of the shortfall; SponsorX approves on its own from 90%.",
      "The best substitute costs $50 more than the shortfall is worth.",
      "The best substitute involves a minor or a school, so a person decides.",
      "The best substitute's estimate rests on unverified or thin figures.",
    ] });
    expect(R.autoDecision([draft({ checks: { available: false, exclusivityClear: true, meetsTarget: true } })], facts)).toEqual({ approve: false, held: ["No substitute passes all three checks."] });
  });
});

describe.skipIf(!hasDatabase)("3S5 · shortfalls, substitutes and approvals, nightly, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact } = await import("../src/domain/facts");
  const { runForecasts, forecastDetail, setGuarantee } = await import("../src/domain/forecast-engine");
  const { runMakeGoods, makeGoodList, approveMakeGood, MakeGoodCheckError, MakeGoodDecidedError, MakeGoodNoteError, MakeGoodNotFoundError } = await import("../src/domain/makegood-engine");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "mgd_t";
  const OTHER = "mgd_o";
  const NOW = new Date("2026-11-27T20:00:00Z");
  const NEXT = new Date("2026-11-28T20:00:00Z");
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `mgd_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const views = (campaign: string, on: string, n: number) => prisma.$transaction((tx) => recordFact(tx, {
    tenantId: T, kind: "METRIC_RECORDED", key: `metric:${campaign}:${on}`, occurredOn: D(on), campaignId: campaign, athleteId: "mgd_ava",
    inventory: { kind: "NIL_JOB", id: "SX-04" }, channel: "SOCIAL_INSTAGRAM", market: { state: "MD" }, source: { type: "MetricDaily", id: `${campaign}:${on}` },
    measures: { views_verified_api: n },
  }));
  const shortfallOf = async (campaignId: string) => (await prisma.makeGoodShortfall.findFirst({ where: { tenantId: T, campaignId, status: { not: "CLOSED" } }, select: { id: true } }))!.id;

  async function clean() {
    for (const t of [
      "MakeGoodOption", "MakeGoodShortfall", "InventoryCommitment", "CampaignForecastAlert", "CampaignForecast", "CampaignPacing", "OutboxJob", "AuditLog",
      "CampaignDaySummary", "Fact", "FeatureSnapshot", "Benchmark", "BrandRestriction", "InventoryItem", "Campaign", "CampaignBrief", "Athlete", "Property", "Sponsor", "User",
    ]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Make-goods" }, { id: OTHER, name: "Another operator" }] });
    await prisma.sponsor.create({ data: { id: "mgd_sp", tenantId: T, name: "Fit Co", categories: ["FITNESS"] }, select: { id: true } });
    await prisma.user.createMany({ data: [
      { id: "mgd_BTG_ADMIN", tenantId: T, clerkId: "mgd_btg", email: "ana@mgd.invalid", roles: ["BTG_ADMIN"] },
      { id: "mgd_CAMPAIGN_MGR", tenantId: T, clerkId: "mgd_cm", email: "cam@mgd.invalid", roles: ["CAMPAIGN_MGR"] },
    ] });
    const athlete = (id: string, name: string, extra: Record<string, unknown> = {}) => prisma.athlete.create({ data: {
      id, tenantId: T, slug: id.replaceAll("_", "-"), legalName: name, displayName: name, email: `${id}@mgd.invalid`, sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", ...extra,
    }, select: { id: true } });
    await athlete("mgd_ava", "Ava Cruz");
    await athlete("mgd_ben", "Ben Ortiz", { ageBand: "16_17" });
    await athlete("mgd_cara", "Cara Diaz");
    await prisma.property.create({ data: { id: "mgd_gym", tenantId: T, slug: "mgd-gym", name: "Lakeside Gym", kind: "VENUE", stateCode: "VA" } });
    await prisma.inventoryItem.createMany({ data: [
      /* 4,000 verified a post → 4 units = 16,000 (93.75%), $2,800 — $200 under the $3,000 shortfall. */
      { id: "mgd_i_ava", tenantId: T, athleteId: "mgd_ava", title: "Ava story set", kind: "SOCIAL_POST", priceCents: 70000, categories: ["FITNESS"] },
      /* A minor, 2,000 a post → 8 units = 16,000 (93.75%), $3,200 — $200 over. One buyer per period. */
      { id: "mgd_i_ben", tenantId: T, athleteId: "mgd_ben", title: "Ben reel", kind: "VIDEO", priceCents: 40000, categories: ["FITNESS"], packageRules: { exclusive: true } },
      /* 5,000 a post → 3 units = 15,000 (100%), $3,000 — but another brand holds FITNESS exclusively. */
      { id: "mgd_i_cara", tenantId: T, athleteId: "mgd_cara", title: "Cara post", kind: "SOCIAL_POST", priceCents: 100000, categories: ["FITNESS"] },
      /* A venue in VA: $300 at the $20 benchmark = 15,000 (100%), $300 — but outside the sponsor's states (MD). */
      { id: "mgd_i_gym", tenantId: T, propertyId: "mgd_gym", title: "Gym banner", kind: "SIGNAGE", priceCents: 30000 },
    ] });
    await prisma.brandRestriction.create({ data: { tenantId: T, athleteId: "mgd_cara", category: "FITNESS", type: "EXCLUSIVITY", startsOn: D("2026-11-01"), endsOn: D("2027-01-31") }, select: { id: true } });
    await prisma.benchmark.create({ data: { tenantId: T, dimension: "ALL", segment: "", metric: "EFFECTIVE_CPM_CENTS", p25: 1500, median: 2000, p75: 2600, sampleSize: 12, windowDays: 365, refreshedAt: NOW } });
    const snap = (athleteId: string, published: number, verifiedViews: number) => ({
      tenantId: T, entityType: "ATHLETE", entityId: athleteId, day: D("2026-11-26"), version: "features@1",
      features: {
        audience: { platforms: [], totalFollowers: 0, totalAvgViews: 0, anyVerified: true },
        engagement: { verifiedViews, verifiedEngagements: 0, rate: null },
        delivery: { due: published, published, verified: published, revisionsRequested: 0, dueByToday: published, publishedOnTime: published, onTimeRate: 1, ordersCancelled: 0 },
      },
    });
    await prisma.featureSnapshot.createMany({ data: [snap("mgd_ava", 5, 20000), snap("mgd_ben", 3, 6000), snap("mgd_cara", 4, 20000)] });

    /* B — 30,000 impressions sold for $6,000 (20¢ each), 500 a day for 27 of 30 days: projected 15,000, 15,000 short ($3,000), 90% gone. */
    const brief = await prisma.campaignBrief.create({ data: {
      tenantId: T, sponsorId: "mgd_sp", objective: "Reach", budget: 600000, startDate: D("2026-11-01"), endDate: D("2026-11-30"), stateCodes: ["MD"], categories: ["FITNESS"],
    }, select: { id: true } });
    const campaign = (id: string, name: string, start: string, end: string, budget: number, briefId?: string) => prisma.campaign.create({
      data: { id, tenantId: T, sponsorId: "mgd_sp", name, budget, startDate: D(start), endDate: D(end), state: "ACTIVE", briefId }, select: { id: true },
    });
    await campaign("mgd_B", "Late and short", "2026-11-01", "2026-11-30", 600000, brief.id);
    for (let d = 1; d <= 27; d++) await views("mgd_B", `2026-11-${String(d).padStart(2, "0")}`, 500);
    /* E and F — the same pace, half way: 7,500 + 500 × 15 = 15,000 projected, 50% gone. E is worth 20¢ a unit, F 10¢. */
    await campaign("mgd_E", "Half way, short", "2026-11-13", "2026-12-12", 600000);
    await campaign("mgd_F", "Half way, recovers", "2026-11-13", "2026-12-12", 300000);
    for (let d = 13; d <= 27; d++) {
      await views("mgd_E", `2026-11-${d}`, 500);
      await views("mgd_F", `2026-11-${d}`, 500);
    }
    for (const id of ["mgd_B", "mgd_E", "mgd_F"]) await setGuarantee(actor(T, "BTG_ADMIN"), id, { metric: "impressions", value: 30000 });
    await runForecasts(prisma, NOW, { tenantId: T });
  });

  afterAll(clean);

  it("nightly: a shortfall for each at-risk campaign; the one 90% gone with a safe, close, affordable substitute is approved automatically", async () => {
    expect(await runMakeGoods(prisma, NOW, { tenantId: T })).toEqual({ tenants: 1, shortfalls: 3, opened: 3, closed: 0, autoApproved: 1, held: 2, skipped: [] });
    /* A second run the same night refreshes the two still open and opens nothing. */
    expect(await runMakeGoods(prisma, NOW, { tenantId: T })).toMatchObject({ shortfalls: 2, opened: 0, autoApproved: 0, held: 2 });
    expect(await prisma.makeGoodShortfall.count({ where: { tenantId: T } })).toBe(3);
  });

  it("B: the substitutes respect the target, availability, exclusivity and equivalence — and SponsorX approved Ava's", async () => {
    const [b] = (await makeGoodList(actor(T, "CAMPAIGN_MGR"), { status: "approved", page }, NOW)).shortfalls;
    expect(b).toMatchObject({
      campaign: { id: "mgd_B", name: "Late and short" }, sponsorName: "Fit Co", metric: "impressions",
      sold: 30000, projected: 15000, shortfall: 15000, shortfallValueCents: 300000, endsAt: "2026-11-30T00:00:00.000Z",
      stamp: { modelVersion: "makegood-rules@1.0.0" },
    });
    expect(b!.options.map((o) => [o.inventoryName, o.format, o.estimatedDelivery, o.equivalencyScore, o.costImpactCents, o.checks])).toEqual([
      ["Ava story set", "Social post ×4", 16000, 0.9375, -20000, { available: true, exclusivityClear: true, meetsTarget: true }],
      ["Ben reel", "Video ×8", 16000, 0.9375, 20000, { available: true, exclusivityClear: true, meetsTarget: true }],
      ["Gym banner", "Signage ×1", 15000, 1, -270000, { available: true, exclusivityClear: true, meetsTarget: false }],
      ["Cara post", "Social post ×3", 15000, 1, 0, { available: true, exclusivityClear: false, meetsTarget: true }],
    ]);
    expect(b!.options[0]!.reason).toBe("Their verified average of 4,000 impressions a post: about 16,000 impressions, 107% of the shortfall, $200 under the shortfall's value.");
    expect(b!.options[2]!.reason).toContain("Can't be used: outside the sponsor's states.");
    expect(b!.decision).toMatchObject({
      optionId: b!.options[0]!.id, by: "SponsorX (automatic)", at: NOW.toISOString(), automatic: true, runsFrom: "2026-11-28", runsUntil: "2026-12-11",
    });
    expect(b!.decision!.note).toContain("Approved automatically by SponsorX: Ava story set covers about 16,000 of the 15,000 impressions short");
    expect(b!.automatic).toEqual({ approved: true, heldBecause: [] });
    /* Reflected: Ava's units are committed for the make-good's days, and the approval is audited with no person behind it. */
    expect(await prisma.inventoryCommitment.findMany({ where: { tenantId: T, source: "MAKE_GOOD", sourceId: b!.id }, select: { inventoryItemId: true, quantity: true, startsOn: true, endsOn: true, contracted: true } }))
      .toEqual([{ inventoryItemId: "mgd_i_ava", quantity: 4, startsOn: D("2026-11-28"), endsOn: D("2026-12-11"), contracted: true }]);
    expect(await prisma.auditLog.findMany({ where: { tenantId: T, action: "makeGood.autoApprove" }, select: { entityId: true, actorId: true } })).toEqual([{ entityId: b!.id, actorId: null }]);
  });

  it("E and F, half way: held for a person, with the reason; open first by value at risk; counts over the tenant", async () => {
    const list = await makeGoodList(actor(T, "BTG_ADMIN"), { status: "open", page }, NOW);
    expect(list.counts).toEqual({ open: 2, approved: 1, openValueCents: 450000, approvedThisPeriod: 1, period: { from: "2026-11-01T00:00:00.000Z", to: "2026-11-30T00:00:00.000Z" } });
    expect(list.shortfalls.map((s) => [s.campaign.id, s.shortfallValueCents])).toEqual([["mgd_E", 300000], ["mgd_F", 150000]]);
    const e = list.shortfalls[0]!;
    expect(e.automatic).toEqual({ approved: false, heldBecause: ["Only 50% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain."] });
    /* No brief, so no target: the banner is on target here, and closest. */
    expect(e.options.map((o) => o.inventoryName)).toEqual(["Gym banner", "Ava story set", "Ben reel"]);
    expect((await makeGoodList(actor(T, "BTG_ADMIN"), { status: "open", campaignId: "mgd_F", page }, NOW)).counts).toMatchObject({ open: 1, approved: 0, openValueCents: 150000 });
  });

  it("a person approves: checked again, live — a substitute committed since is refused; a short note is refused; then it is recorded, committed and audited", async () => {
    const id = await shortfallOf("mgd_E");
    const e = (await makeGoodList(actor(T, "BTG_ADMIN"), { status: "open", page }, NOW)).shortfalls.find((s) => s.id === id)!;
    const ben = e.options.find((o) => o.inventoryName === "Ben reel")!;
    const ava = e.options.find((o) => o.inventoryName === "Ava story set")!;
    await expect(approveMakeGood(actor(T, "CAMPAIGN_MGR"), id, { optionId: ava.id, note: "ok" }, NOW)).rejects.toBeInstanceOf(MakeGoodNoteError);
    /* Ben's reel is one buyer per period, and an offer took it after last night's run. */
    await prisma.inventoryCommitment.create({ data: { tenantId: T, inventoryItemId: "mgd_i_ben", quantity: 1, startsOn: D("2026-11-29"), endsOn: D("2026-12-05"), source: "OFFER", sourceId: "mgd_offer" } });
    const refused = await approveMakeGood(actor(T, "CAMPAIGN_MGR"), id, { optionId: ben.id, note: "Sponsor agreed on the call" }, NOW).catch((x: unknown) => x);
    expect(refused).toBeInstanceOf(MakeGoodCheckError);
    expect((refused as InstanceType<typeof MakeGoodCheckError>).problems).toEqual(["already committed 2026-11-29 – 2026-12-05"]);

    const done = await approveMakeGood(actor(T, "CAMPAIGN_MGR"), id, { optionId: ava.id, note: "  Sponsor agreed on the call  " }, NOW);
    expect(done.decision).toMatchObject({ optionId: ava.id, by: "cam@mgd.invalid (Campaign manager)", note: "Sponsor agreed on the call", automatic: false, runsFrom: "2026-11-28" });
    expect(done.status).toBe("approved");
    expect(await prisma.inventoryCommitment.count({ where: { tenantId: T, source: "MAKE_GOOD", sourceId: id, inventoryItemId: "mgd_i_ava", quantity: 4 } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "makeGood.approve", entityId: id, actorId: "mgd_CAMPAIGN_MGR" } })).toBe(1);
    await expect(approveMakeGood(actor(T, "BTG_ADMIN"), id, { optionId: ava.id, note: "Second thoughts here" }, NOW)).rejects.toBeInstanceOf(MakeGoodDecidedError);
  });

  it("an option failing a check is never approved", async () => {
    const f = (await makeGoodList(actor(T, "BTG_ADMIN"), { status: "open", campaignId: "mgd_F", page }, NOW)).shortfalls[0]!;
    /* Mark F's banner as failing a check, as the night would if a restriction landed on its venue. */
    await prisma.makeGoodOption.updateMany({ where: { tenantId: T, shortfallId: f.id, inventoryItemId: "mgd_i_gym" }, data: { exclusivityClear: false, problems: ["held exclusively"] } });
    const gym = f.options.find((o) => o.inventoryName === "Gym banner")!;
    await expect(approveMakeGood(actor(T, "BTG_ADMIN"), f.id, { optionId: gym.id, note: "Try the banner anyway" }, NOW)).rejects.toBeInstanceOf(MakeGoodCheckError);
    await expect(approveMakeGood(actor(T, "BTG_ADMIN"), f.id, { optionId: "mgd_nope", note: "No such option here" }, NOW)).rejects.toBeInstanceOf(MakeGoodNotFoundError);
  });

  it("a decided make-good can never change — the database refuses", async () => {
    const id = await shortfallOf("mgd_B");
    await expect(prisma.makeGoodShortfall.update({ where: { id }, data: { note: "rewritten" } })).rejects.toThrow(/makegood_decided_is_final/);
    await expect(prisma.makeGoodOption.updateMany({ where: { shortfallId: id }, data: { costImpactCents: 0 } })).rejects.toThrow(/makegood_decided_is_final/);
  });

  it("the next night: a campaign back on track closes its shortfall; an approved one gets no second shortfall", async () => {
    await views("mgd_F", "2026-11-28", 30000);
    await views("mgd_B", "2026-11-28", 500);
    await runForecasts(prisma, NEXT, { tenantId: T });
    expect(await runMakeGoods(prisma, NEXT, { tenantId: T })).toEqual({ tenants: 1, shortfalls: 0, opened: 0, closed: 1, autoApproved: 0, held: 0, skipped: [] });
    expect(await prisma.makeGoodShortfall.findMany({ where: { tenantId: T }, select: { campaignId: true, status: true }, orderBy: { campaignId: "asc" } })).toEqual([
      { campaignId: "mgd_B", status: "APPROVED" }, { campaignId: "mgd_E", status: "APPROVED" }, { campaignId: "mgd_F", status: "CLOSED" },
    ]);
  });

  it("reflected in the campaign: its forecast lists its make-goods for BTG admins and campaign managers, not for Sales", async () => {
    const forCm = await forecastDetail(actor(T, "CAMPAIGN_MGR"), "mgd_B");
    expect((forCm as { makeGoods?: Array<{ status: string }> }).makeGoods?.map((m) => m.status)).toEqual(["approved"]);
    expect("makeGoods" in (await forecastDetail(actor(T, "SALES"), "mgd_B"))).toBe(false);
  });

  it("who: Sales, sponsors, athletes and Finance never see a make-good; another tenant's answers 404 and sees none", async () => {
    for (const a of [actor(T, "SALES"), actor(T, "SPONSOR_ADMIN", { sponsorId: "mgd_sp" }), actor(T, "ATHLETE", { athleteId: "mgd_ava" }), actor(T, "FINANCE")]) {
      await expect(makeGoodList(a, { status: "open", page }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(approveMakeGood(actor(T, "SALES"), "x", { optionId: "y", note: "Not my call to make" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    const id = await shortfallOf("mgd_B");
    await expect(approveMakeGood(actor(OTHER, "BTG_ADMIN"), id, { optionId: "y", note: "Reaching across" }, NOW)).rejects.toBeInstanceOf(MakeGoodNotFoundError);
    expect((await makeGoodList(actor(OTHER, "BTG_ADMIN"), { status: "approved", page }, NOW)).counts).toMatchObject({ open: 0, approved: 0 });
  });
});
