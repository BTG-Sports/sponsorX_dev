import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S3 — sponsor matching (documentation/SponsorX-Match-Engine.md).

   3S3-BE-01 — a sponsor brief captures every matching input, exclusions too.
   3S3-BE-02 — a brief produces ranked recommendations with explanation
               factors within the agreed response time (2 s for ~1,000
               candidates; user, 2026-10-14).
   3S3-BE-03 — the explorer never returns unavailable or
               category-conflicted inventory.

   Scores below are worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { filterCandidate, scoreCandidate, MATCH_FACTORS } = await import("../src/domain/match-rules");
type Brief = Parameters<typeof scoreCandidate>[1];
type Facts = Parameters<typeof filterCandidate>[0];

const BRIEF: Brief = {
  sponsorId: "sp", sports: [], stateCodes: ["MD"], categories: ["FITNESS"], excludedCategories: ["ENERGY_DRINK"], channels: ["INSTAGRAM"],
  audienceTiers: ["CREATOR"], audienceMinFollowers: 10000, budget: 500000, slots: 1,
  startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"),
};
const clear: Facts = { bookable: true, restrictions: [], profileRestricted: [], itemRestricted: [], youth: false, tiedCategories: [] };
const contributions = (s: { factors: Array<{ key: string; contribution: number }> }) => Object.fromEntries(s.factors.map((f) => [f.key, f.contribution]));

describe("3S3-BE-02 · the score", () => {
  it("an athlete: eight factors out of 100, contributions summing to the score exactly", () => {
    const s = scoreCandidate({
      stateCode: "MD", audience: { tier: "CREATOR", maxFollowers: 12000 }, channels: ["INSTAGRAM", "IN_PERSON"],
      category: { pastInCategories: 2 },
      history: { dueByToday: 10, onTimeRate: 0.9, engagementRate: 0.05, medianEngagementRate: 0.05 },
      priceCents: 400000, priceBasis: "Rate", withSponsor: 0,
      quality: [{ met: true, yes: "verified audience", no: "x" }, { met: true, yes: "rates and socials on file", no: "x" }],
    }, BRIEF);
    /* Exact: 15, 15, 10, 15 × 0.7 = 10.5, 15 × (0.7 × 0.9 + 0.3 × 1) = 13.95, 15, 0, 5 → 84.45 → 84.
       Whole points by largest remainder: history's .95 takes the one left over. */
    expect(contributions(s)).toEqual({ audience: 15, geography: 15, format: 10, category: 10, history: 14, budget: 15, sponsorHistory: 0, quality: 5 });
    expect(s.score).toBe(84);
    expect(s.factors.reduce((t, f) => t + f.contribution, 0)).toBe(s.score);
    expect(s.factors.map((f) => f.weight)).toEqual(MATCH_FACTORS.map((m) => m.points / 100));
    expect(s.confidence).toBe(1);
    expect(s.reasons[0]).toMatch(/Creator tier, 12,000 followers; the brief asks creator, 10,000\+ followers\./);
    expect(s.factors.find((f) => f.key === "sponsorHistory")!.reason).toBe("Not worked with this sponsor yet.");
  });

  it("a venue: a factor that does not apply weighs nothing, and the others fill the 100", () => {
    const s = scoreCandidate({
      stateCode: "VA", channels: ["IN_PERSON"], category: { listedFor: ["FITNESS"] },
      priceCents: 300000, priceBasis: "Its cheapest available item:", withSponsor: 1,
      quality: [{ met: true, yes: "a published listing", no: "x" }, { met: false, yes: "x", no: "items not described" }],
    }, BRIEF);
    /* Applicable: geography 15, format 10, category 15, budget 15, sponsor history 10, quality 5 = 70 points.
       Exact: 0, 0, 15/70 × 100 = 21.43, 21.43, 14.29, 5/70 × 100 × 0.6 = 4.29 → 61.43 → 61; category takes the spare point. */
    expect(contributions(s)).toEqual({ audience: 0, geography: 0, format: 0, category: 22, history: 0, budget: 21, sponsorHistory: 14, quality: 4 });
    expect(s.score).toBe(61);
    expect(s.factors.find((f) => f.key === "audience")).toMatchObject({ weight: 0, reason: "Not applicable: no audience of its own." });
    expect(s.factors.find((f) => f.key === "category")!.weight).toBe(0.2143);
    expect(s.confidence).toBe(0.7);
  });

  it("over budget scores less, linearly to nothing at twice the share; no price on file scores nothing and says so", () => {
    const base = { stateCode: "MD", channels: [], category: { listedFor: [] as string[] }, priceBasis: "Listed at", withSponsor: 0,
      quality: [{ met: false, yes: "", no: "a" }, { met: false, yes: "", no: "b" }] as [never, never] };
    const at = (price: number | null) => scoreCandidate({ ...base, priceCents: price }, BRIEF).factors.find((f) => f.key === "budget")!;
    expect(at(750000).contribution).toBe(Math.round((15 / 70) * 100 * 0.5));
    expect(at(1000000).contribution).toBe(0);
    expect(at(null)).toMatchObject({ contribution: 0, reason: "No price on file, so the fit cannot be judged." });
  });
});

describe("3S3-BE-03 · the filter, before any score", () => {
  const inWindow = { startsOn: new Date("2026-10-01"), endsOn: null };
  it("removes the unavailable, the category-conflicted and the brand-unsafe, each counted once, in that order", () => {
    expect(filterCandidate({ ...clear, bookable: false }, BRIEF)).toEqual({ eligible: false, reason: "unavailable" });
    expect(filterCandidate({ ...clear, window: { from: new Date("2026-12-01"), until: null } }, BRIEF)).toEqual({ eligible: false, reason: "unavailable" });
    expect(filterCandidate({ ...clear, restrictions: [{ category: "FITNESS", type: "EXCLUSIVITY", ...inWindow }] }, BRIEF)).toEqual({ eligible: false, reason: "categoryConflict" });
    expect(filterCandidate({ ...clear, tiedCategories: ["ENERGY_DRINK"] }, BRIEF)).toEqual({ eligible: false, reason: "categoryConflict" });
    expect(filterCandidate({ ...clear, restrictions: [{ category: "FITNESS", type: "LEAGUE_RULE", ...inWindow }] }, BRIEF)).toEqual({ eligible: false, reason: "brandSafety" });
    expect(filterCandidate({ ...clear, profileRestricted: ["FITNESS"] }, BRIEF)).toEqual({ eligible: false, reason: "brandSafety" });
    expect(filterCandidate({ ...clear, itemRestricted: ["FITNESS"] }, BRIEF)).toEqual({ eligible: false, reason: "brandSafety" });
    /* Unavailable wins over a conflict. */
    expect(filterCandidate({ ...clear, bookable: false, tiedCategories: ["ENERGY_DRINK"] }, BRIEF)).toEqual({ eligible: false, reason: "unavailable" });
  });

  it("a restriction outside the brief's dates, or on another category, does not remove anyone", () => {
    expect(filterCandidate({ ...clear, restrictions: [{ category: "FITNESS", type: "EXCLUSIVITY", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-10-31") }] }, BRIEF).eligible).toBe(true);
    expect(filterCandidate({ ...clear, restrictions: [{ category: "ALCOHOL", type: "PROHIBITED", ...inWindow }] }, BRIEF).eligible).toBe(true);
  });

  it("a minor or a school is never matched to a sensitive category — and is matched to any other", () => {
    expect(filterCandidate({ ...clear, youth: true }, { ...BRIEF, categories: ["ALCOHOL"] })).toEqual({ eligible: false, reason: "brandSafety" });
    expect(filterCandidate({ ...clear, youth: true }, BRIEF).eligible).toBe(true);
  });

  it("an item available for only part of the brief is matched, marked LIMITED with what it is", () => {
    expect(filterCandidate({ ...clear, window: { from: null, until: new Date("2026-11-15T00:00:00Z") } }, BRIEF))
      .toEqual({ eligible: true, availability: { state: "LIMITED", note: "Available until 2026-11-15, before the brief ends" } });
    expect(filterCandidate({ ...clear, window: { from: null, until: null } }, BRIEF)).toEqual({ eligible: true, availability: { state: "AVAILABLE" } });
  });
});

describe.skipIf(!hasDatabase)("3S3 · briefs, the ranking, and shortlists, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { matchPage, saveShortlist, BriefNotFoundError, ShortlistEntryError, RUN_REUSE_MS } = await import("../src/domain/match-engine");
  const { createBrief, updateBrief } = await import("../src/domain/brief");
  const { CategoryWantedAndExcludedError } = await import("../src/domain/match-vocabulary");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "me_t";
  const OTHER = "me_o";
  const PERF = "me_perf";
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `me_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const NOW = new Date("2026-10-14T12:00:00Z");
  let briefId = "";

  async function clean() {
    for (const t of ["BriefShortlist", "MatchScore", "MatchRun", "AuditLog", "CampaignOrder", "Campaign", "BrandRestriction", "Listing", "InventoryItem", "AthleteRate", "AthleteSocial", "Athlete", "Property", "CampaignBrief", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER, PERF]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER, PERF]);
  }
  const athlete = (id: string, tenantId: string, over: Record<string, unknown> = {}) => ({
    id, tenantId, slug: id.replace(/_/g, "-"), legalName: id, displayName: id, email: `${id}@me.invalid`, sport: "Soccer",
    city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", tier: "CREATOR", ...over,
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Matching" }, { id: OTHER, name: "Another operator" }, { id: PERF, name: "A thousand athletes" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.sponsor.createMany({ data: [
      { id: "me_sp", tenantId: T, name: "Fit Co", categories: ["FITNESS"] },
      { id: "me_sp2", tenantId: T, name: "Buzz Energy", categories: ["ENERGY_DRINK"] },
      { id: "me_osp", tenantId: OTHER, name: "Other", categories: [] },
      { id: "me_psp", tenantId: PERF, name: "Perf", categories: ["FITNESS"] },
    ] });
    await prisma.user.createMany({ data: [
      { id: "me_CAMPAIGN_MGR", tenantId: T, clerkId: "me_cm", email: "cam@me.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "me_BTG_ADMIN", tenantId: T, clerkId: "me_btg", email: "ana@me.invalid", roles: ["BTG_ADMIN"] },
    ] });
    await prisma.athlete.createMany({ data: [
      athlete("me_a1", T),
      athlete("me_a2", T, { stateCode: "VA", tier: "EMERGING" }),
      athlete("me_a3", T, { state: "SUSPENDED" }),
      athlete("me_a4", T, { restrictedCategories: ["FITNESS"] }),
      athlete("me_a5", T),
      athlete("me_a6", T),
      athlete("me_a7", T, { ageBand: "16_17" }),
      athlete("me_a8", T, { state: "UNDER_REVIEW" }),
    ] as never });
    await prisma.athleteSocial.createMany({ data: [
      { tenantId: T, athleteId: "me_a1", platform: "INSTAGRAM", handle: "a1", followers: 12000, avgViews: 2000, source: "VERIFIED_API" },
      { tenantId: T, athleteId: "me_a7", platform: "TIKTOK", handle: "a7", followers: 3000, source: "SELF_REPORTED" },
    ] });
    await prisma.athleteRate.createMany({ data: [{ tenantId: T, athleteId: "me_a1", jobId: "SX-04", amount: 20000 }] });
    /* me_a5 is held exclusively in Fitness through the brief's month; me_a6 promoted an energy drink (excluded) last month. */
    await prisma.brandRestriction.create({ data: { tenantId: T, athleteId: "me_a5", category: "FITNESS", type: "EXCLUSIVITY", startsOn: new Date("2026-10-01"), endsOn: new Date("2027-01-31") }, select: { id: true } });
    await prisma.campaign.create({ data: { id: "me_c2", tenantId: T, sponsorId: "me_sp2", name: "Buzz", budget: 100000, startDate: new Date("2026-09-01"), endDate: new Date("2026-09-30"), state: "ACTIVE" }, select: { id: true } });
    await prisma.campaignOrder.create({ data: {
      id: "me_o6", tenantId: T, campaignId: "me_c2", athleteId: "me_a6", jobId: "SX-04", compensation: 10000, sellPrice: 20000, usageRights: "90 days",
      dueDate: new Date("2026-09-30"), state: "ACCEPTED", acceptedAt: new Date("2026-09-05"),
    }, select: { id: true } });
    await prisma.property.createMany({ data: [
      { id: "me_p1", tenantId: T, slug: "me-arena", name: "Arena FC", kind: "TEAM", city: "Baltimore", stateCode: "MD" },
      { id: "me_p2", tenantId: T, slug: "me-empty", name: "Empty Hall", kind: "TEAM", stateCode: "MD" },
    ] });
    await prisma.inventoryItem.createMany({ data: [
      { id: "me_i1", tenantId: T, athleteId: "me_a1", title: "Instagram post", kind: "SOCIAL_POST", priceCents: 300000, categories: ["FITNESS"], description: "One post" },
      { id: "me_i2", tenantId: T, propertyId: "me_p1", title: "Halftime sign", kind: "SIGNAGE", priceCents: 200000, availableUntil: new Date("2026-11-15") },
      { id: "me_i3", tenantId: T, athleteId: "me_a1", title: "Story", kind: "SOCIAL_POST", priceCents: 100000, restrictedCategories: ["FITNESS"] },
      { id: "me_i4", tenantId: T, propertyId: "me_p1", title: "Spring sign", kind: "SIGNAGE", priceCents: 100000, availableFrom: new Date("2027-03-01") },
      { id: "me_i5", tenantId: T, athleteId: "me_a1", title: "Energy post", kind: "SOCIAL_POST", priceCents: 100000, categories: ["ENERGY_DRINK"] },
    ] });
    await prisma.listing.create({ data: { tenantId: T, sellerAthleteId: "me_a1", inventoryItemId: "me_i1", title: "Instagram post", state: "PUBLISHED", publishedAt: new Date() }, select: { id: true } });
  });

  afterAll(clean);

  it("3S3-BE-01 · a brief captures every matching input, exclusions too, and refuses a category both wanted and excluded", async () => {
    const btg = actor(T, "BTG_ADMIN");
    const created = await createBrief(btg, {
      sponsorId: "me_sp", objective: "Fitness push in Maryland", budget: 500000, startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"),
      sports: [], stateCodes: ["MD"], categories: ["FITNESS"], excludedCategories: ["ENERGY_DRINK"], channels: ["INSTAGRAM"],
      audienceTiers: ["CREATOR"], audienceMinFollowers: 10000,
    }, NOW);
    briefId = created.id;
    expect(await prisma.campaignBrief.findUniqueOrThrow({ where: { id: briefId }, select: { excludedCategories: true, channels: true, audienceTiers: true, audienceMinFollowers: true } }))
      .toEqual({ excludedCategories: ["ENERGY_DRINK"], channels: ["INSTAGRAM"], audienceTiers: ["CREATOR"], audienceMinFollowers: 10000 });
    /* A list sent with repeats is stored as a set (QA 2026-10-15). */
    await updateBrief(btg, briefId, { channels: ["TIKTOK", "TIKTOK", "INSTAGRAM"], audienceTiers: ["CREATOR", "CREATOR"], excludedCategories: ["ENERGY_DRINK", "ENERGY_DRINK"] }, NOW);
    expect(await prisma.campaignBrief.findUniqueOrThrow({ where: { id: briefId }, select: { excludedCategories: true, channels: true, audienceTiers: true } }))
      .toEqual({ excludedCategories: ["ENERGY_DRINK"], channels: ["TIKTOK", "INSTAGRAM"], audienceTiers: ["CREATOR"] });
    await updateBrief(btg, briefId, { channels: ["INSTAGRAM"] }, NOW);
    await expect(createBrief(btg, {
      sponsorId: "me_sp", objective: "Both", budget: 1000, startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"),
      sports: [], stateCodes: [], categories: ["FITNESS"], excludedCategories: ["FITNESS"],
    }, NOW)).rejects.toBeInstanceOf(CategoryWantedAndExcludedError);
    await expect(updateBrief(btg, briefId, { excludedCategories: ["FITNESS"] }, NOW)).rejects.toBeInstanceOf(CategoryWantedAndExcludedError);
  });

  it("ranks athletes best first, removing the unavailable, the conflicted and the unsafe — only counted, never shown", async () => {
    const p = await matchPage(actor(T, "SALES"), briefId, "athlete", page, NOW);
    expect(p.counts).toEqual({ athlete: 3, property: 1, inventory: 2 });
    /* me_a3 suspended; me_a5 exclusive, me_a6 tied to an excluded category; me_a4 refuses Fitness. me_a8 (in review) is no candidate at all. */
    expect(p.filteredOut).toEqual({ unavailable: 1, categoryConflict: 2, brandSafety: 1 });
    expect(p.matches.map((m) => m.refId)).toEqual(["me_a1", "me_a7", "me_a2"]);
    for (const m of p.matches) {
      expect(m.factors.reduce((t, f) => t + f.contribution, 0)).toBe(m.score);
      expect(m).toMatchObject({ id: `athlete:${m.refId}`, kind: "athlete", availability: { state: "AVAILABLE" }, stamp: { modelVersion: "match-rules@2.0.0" } });
    }
    expect(p.matches[0]).toMatchObject({ rank: 1, name: "me_a1", sub: "Soccer · MD" });
    expect(p.matches[0]!.reasons[0]).toMatch(/Creator tier, 12,000 followers/);
    expect(p.page).toEqual({ page: 1, size: 25, total: 3, pages: 1 });
    expect(p.shortlist).toBeNull();
  });

  it("ranks properties and items too: an item free for part of the brief is LIMITED; none outside it, restricted or excluded appears", async () => {
    const props = await matchPage(actor(T, "BTG_ADMIN"), briefId, "property", page, NOW);
    expect(props.matches.map((m) => m.refId)).toEqual(["me_p1"]);
    expect(props.filteredOut).toEqual({ unavailable: 1, categoryConflict: 0, brandSafety: 0 });
    const inv = await matchPage(actor(T, "BTG_ADMIN"), briefId, "inventory", page, NOW);
    expect(inv.matches.map((m) => m.refId).sort()).toEqual(["me_i1", "me_i2"]);
    expect(inv.filteredOut).toEqual({ unavailable: 1, categoryConflict: 1, brandSafety: 1 });
    expect(inv.matches.find((m) => m.refId === "me_i2")!.availability).toEqual({ state: "LIMITED", note: "Available until 2026-11-15, before the brief ends" });
    /* All three pages come from one ranking. */
    expect(new Set([props.run.computedAt, inv.run.computedAt]).size).toBe(1);
  });

  it("a ranking is stored and reused while fresh; ranked again once stale or once the brief changes", async () => {
    const runs = () => prisma.matchRun.count({ where: { tenantId: T, briefId } });
    const before = await runs();
    expect(before).toBe(3);
    await matchPage(actor(T, "SALES"), briefId, "athlete", page, NOW);
    expect(await runs()).toBe(3);
    /* Older than RUN_REUSE_MS: ranked again, all three kinds. */
    await prisma.$executeRawUnsafe(`UPDATE "MatchRun" SET "computedAt" = "computedAt" - interval '${RUN_REUSE_MS / 1000 + 60} seconds' WHERE "tenantId" = $1 AND "briefId" = $2`, T, briefId);
    await matchPage(actor(T, "SALES"), briefId, "athlete", page, NOW);
    expect(await runs()).toBe(6);
    /* The brief edited since: ranked again. */
    await updateBrief(actor(T, "BTG_ADMIN"), briefId, { audienceMinFollowers: 5000 }, NOW);
    await matchPage(actor(T, "SALES"), briefId, "athlete", page, NOW);
    expect(await runs()).toBe(9);
  });

  it("a shortlist: saved by the desk, replaced on save, cleared with none; only ranked ids; Sales may not save", async () => {
    const at = NOW;
    await expect(saveShortlist(actor(T, "SALES"), briefId, ["athlete:me_a1"], at)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveShortlist(actor(T, "CAMPAIGN_MGR"), briefId, ["athlete:me_a4"], at)).rejects.toBeInstanceOf(ShortlistEntryError);
    const s = await saveShortlist(actor(T, "CAMPAIGN_MGR"), briefId, ["athlete:me_a1", "inventory:me_i1", "athlete:me_a1"], at);
    expect(s).toMatchObject({ briefId, savedBy: "cam@me.invalid" });
    expect(s.entries.map((e) => [e.matchId, e.kind])).toEqual([["athlete:me_a1", "athlete"], ["inventory:me_i1", "inventory"]]);
    expect((await matchPage(actor(T, "SALES"), briefId, "athlete", page, at)).shortlist!.entries).toHaveLength(2);
    expect((await saveShortlist(actor(T, "BTG_ADMIN"), briefId, [], at)).entries).toEqual([]);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "match.shortlistSave" } })).toBe(2);
  });

  it("another tenant's brief answers 404; a sponsor or an athlete never sees a score", async () => {
    await expect(matchPage(actor(OTHER, "BTG_ADMIN"), briefId, "athlete", page, NOW)).rejects.toBeInstanceOf(BriefNotFoundError);
    await expect(saveShortlist(actor(OTHER, "BTG_ADMIN"), briefId, [], NOW)).rejects.toBeInstanceOf(BriefNotFoundError);
    for (const a of [actor(T, "SPONSOR_ADMIN", { sponsorId: "me_sp" }), actor(T, "ATHLETE", { athleteId: "me_a1" }), actor(T, "FINANCE")]) {
      await expect(matchPage(a, briefId, "athlete", page, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("answers within the agreed time: a thousand athletes ranked in under 2 seconds", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `me_pa${i}`);
    await prisma.athlete.createMany({ data: ids.map((id, i) => athlete(id, PERF, { stateCode: i % 2 ? "MD" : "VA", tier: i % 3 ? "CREATOR" : "EMERGING" })) as never });
    await prisma.athleteSocial.createMany({ data: ids.map((id, i) => ({ tenantId: PERF, athleteId: id, platform: "INSTAGRAM", handle: id, followers: 1000 + i * 37, source: "SELF_REPORTED" })) });
    const brief = await prisma.campaignBrief.create({ data: {
      tenantId: PERF, sponsorId: "me_psp", objective: "Perf", budget: 500000, startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"),
      sports: ["Soccer"], stateCodes: ["MD"], categories: ["FITNESS"], channels: ["INSTAGRAM"], audienceTiers: ["CREATOR"], audienceMinFollowers: 10000,
    }, select: { id: true } });
    const started = Date.now();
    const p = await matchPage(actor(PERF, "BTG_ADMIN"), brief.id, "athlete", page, NOW);
    const ms = Date.now() - started;
    expect(p.counts.athlete).toBe(1000);
    expect(p.matches).toHaveLength(25);
    expect(ms).toBeLessThan(2000);
  });
});
