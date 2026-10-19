import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   4S7-BE-01 — one campaign holds athlete work, an edition ad and an INFINEX
   placement together. Each is a money fact on the campaign, counted once:
   the ledger, the nightly fact check, the sponsor's spend and the report
   all agree. A campaign holding only INFINEX placements has nothing to
   staff, as an ad-only one has not; one with athlete work still has.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S7-BE-01 · a cross-channel campaign: virtual and other inventory together", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const V = await import("../src/domain/virtual-registry");
  const B = await import("../src/domain/virtual-bookings");
  const { factAdSlotSold, factOrderBooked } = await import("../src/domain/fact-writers");
  const { checkFactsAgainstApp } = await import("../src/domain/fact-check");
  const { sponsorSpendFor, assembleSponsorReport } = await import("../src/domain/sponsor-report");
  const { transitionCampaign } = await import("../src/domain/campaign");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = `xc_t_${randomBytes(3).toString("hex")}`;
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const actor = (role: string) =>
    ({ userId: `xc_${role}`, tenantId: T, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const admin = actor("BTG_ADMIN");
  const cm = actor("CAMPAIGN_MGR");
  const MIXED = `${T}_mixed`, VIRTUAL = `${T}_virtual`;
  const SELL = 20_000, SLOT = 35_000;

  async function clean() {
    for (const t of ["Fact", "CampaignDaySummary", "CreativeDeployment", "VirtualAsset", "PlacementWindow", "VirtualPlacement", "VirtualZone", "VirtualWorld",
      "InventoryItem", "AdSlot", "Edition", "Publication", "Deliverable", "CampaignOrder", "OutboxJob", "AuditLog", "Campaign", "Athlete", "NilJob", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  let placement = "";
  let window1 = { id: "", priceCents: 0 };
  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Cross-channel" } });
    await prisma.sponsor.create({ data: { id: `${T}_sp`, tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.createMany({ data: [MIXED, VIRTUAL].map((id) => ({
      id, tenantId: T, sponsorId: `${T}_sp`, name: id === MIXED ? "Fall push" : "Arena only", budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "DRAFT" as const,
    })) });
    /* Athlete work: an accepted order, booked the way acceptOrder books it. */
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04").map((j) => ({ ...j, tenantId: T })) });
    await prisma.athlete.create({ data: {
      id: `${T}_ath`, tenantId: T, slug: `${T}-ath`, legalName: "Sam Lee", displayName: "Sam", email: `sam@${T}.invalid`, sport: "Soccer", city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    }, select: { id: true } });
    await prisma.campaignOrder.create({ data: {
      id: `${T}_o1`, tenantId: T, campaignId: MIXED, athleteId: `${T}_ath`, jobId: "SX-04", compensation: 10_000, sellPrice: SELL,
      usageRights: "90 days", dueDate: D("2026-11-20"), state: "ACCEPTED", acceptedAt: D("2026-10-19"),
    }, select: { id: true } });
    await prisma.$transaction((tx) => factOrderBooked(tx, `${T}_o1`));
    /* An edition ad: a slot sold to the campaign. */
    await prisma.publication.create({ data: { id: `${T}_pub`, tenantId: T, name: "Regional Record" }, select: { id: true } });
    await prisma.edition.create({ data: { id: `${T}_ed`, tenantId: T, publicationId: `${T}_pub`, label: "Fall", closeDate: D("2026-11-01"), publishTarget: D("2026-11-10"), thresholdCents: 1, state: "SELLING" }, select: { id: true } });
    await prisma.adSlot.create({ data: { id: `${T}_slot`, tenantId: T, editionId: `${T}_ed`, slotCode: "BACK", kind: "BACK_COVER", priceCents: SLOT, campaignId: MIXED, soldCents: SLOT, soldAt: D("2026-10-19") }, select: { id: true } });
    await prisma.$transaction((tx) => factAdSlotSold(tx, `${T}_slot`));
    /* An INFINEX placement on sale. */
    await prisma.property.create({ data: { id: `${T}_p`, tenantId: T, slug: `${T}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: D("2026-10-01") }, select: { id: true } });
    const world = (await V.createWorld(admin, { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    placement = (await V.createPlacement(admin, world, {
      externalId: "east-led", name: "East LED", kind: "LED_SCREEN", widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 70_000, capacity: 2,
    })).placement.id;
    await V.publishPlacement(admin, placement);
  });
  afterAll(clean);

  it("booking the placement into the campaign is a money fact beside its order and its ad slot — each counted once", async () => {
    window1 = (await B.bookPlacement(cm, placement, { campaignId: MIXED, startsAt: D("2026-11-02"), endsAt: D("2026-11-09") })).window;
    expect(window1.priceCents).toBe(70_000);
    const facts = await prisma.fact.findMany({ where: { tenantId: T, campaignId: MIXED }, select: { kind: true, channel: true, inventoryKind: true, inventoryId: true, measures: true, sourceType: true, sourceId: true } });
    expect(facts.filter((f) => f.kind === "ORDER_BOOKED")).toHaveLength(1);
    expect(facts.filter((f) => f.kind === "AD_SLOT_SOLD")).toHaveLength(1);
    expect(facts.filter((f) => f.kind === "PLACEMENT_WINDOW_BOOKED")).toEqual([{
      kind: "PLACEMENT_WINDOW_BOOKED", channel: "INFINEX", inventoryKind: "VIRTUAL_PLACEMENT", inventoryId: placement,
      measures: { virtual_booked_cents: 70_000 }, sourceType: "PlacementWindow", sourceId: window1.id,
    }]);
    const day = await prisma.campaignDaySummary.aggregate({ where: { tenantId: T, campaignId: MIXED }, _sum: { bookedSellCents: true, adSlotSoldCents: true, virtualBookedCents: true } });
    expect(day._sum).toEqual({ bookedSellCents: BigInt(SELL), adSlotSoldCents: BigInt(SLOT), virtualBookedCents: 70_000n });
  });

  it("the nightly fact check agrees, and the sponsor's spend and report add the three once", async () => {
    expect(await checkFactsAgainstApp(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    expect(await sponsorSpendFor([MIXED])).toEqual({ ordersCents: SELL, adSlotCents: SLOT, virtualCents: 70_000, spendCents: SELL + SLOT + 70_000 });
    const report = await assembleSponsorReport(admin, MIXED);
    expect(report.virtualPlacements).toEqual([{ placementId: "east-led", placementName: "East LED", worldId: "arena", startsAt: "2026-11-02T00:00:00.000Z", endsAt: "2026-11-09T00:00:00.000Z", priceCents: 70_000 }]);
    expect(report.adPlacements).toHaveLength(1);
  });

  it("a campaign holding only INFINEX placements has nothing to staff: DRAFT → APPROVAL; one with athlete work does not skip", async () => {
    await B.bookPlacement(cm, placement, { campaignId: VIRTUAL, startsAt: D("2026-11-02"), endsAt: D("2026-11-09") });
    expect(await transitionCampaign(admin, VIRTUAL, "APPROVAL")).toMatchObject({ state: "APPROVAL" });
    await expect(transitionCampaign(admin, MIXED, "APPROVAL")).rejects.toThrow(/cannot go from DRAFT to APPROVAL/);
  });

  it("giving the days back reverses the booking on the release day; the figures still agree", async () => {
    await B.releaseWindow(cm, window1.id, { reason: "The sponsor moved the dates" }, D("2026-10-25"));
    const reversal = await prisma.fact.findFirst({ where: { tenantId: T, campaignId: MIXED, kind: "REVERSAL" }, select: { measures: true, occurredOn: true } });
    expect(reversal).toMatchObject({ measures: { virtual_booked_cents: -70_000 } });
    expect(await checkFactsAgainstApp(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    expect((await sponsorSpendFor([MIXED])).virtualCents).toBe(0);
    expect((await assembleSponsorReport(admin, MIXED)).virtualPlacements).toEqual([]);
  });
});
