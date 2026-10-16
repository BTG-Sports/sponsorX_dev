import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   4S1-BE-04 — placement availability windows (documentation/SponsorX-Virtual-Registry.md §4).
   Done when: overlapping purchases of the same placement are rejected.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/virtual-rules");

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("4S1-BE-04 · the booking rules (pure)", () => {
  const placement = { state: "AVAILABLE", availableFrom: D("2026-11-01"), availableUntil: D("2027-01-01") };
  const campaign = { state: "DRAFT", startDate: D("2026-11-01"), endDate: D("2026-11-30") };

  it("whole days, inside the placement's availability and the campaign's dates (its last day counts), a draft campaign, a placement on sale", () => {
    expect(R.bookingProblems({ startsAt: D("2026-11-24"), endsAt: D("2026-12-01"), placement, campaign })).toEqual([]);
    expect(R.bookingProblems({ startsAt: new Date("2026-11-02T09:00:00Z"), endsAt: D("2026-11-09"), placement, campaign })).toEqual(["A window is whole days: it starts and ends at midnight UTC."]);
    expect(R.bookingProblems({ startsAt: D("2026-11-24"), endsAt: D("2026-12-02"), placement, campaign })).toEqual(["The window falls outside the campaign's dates."]);
    expect(R.bookingProblems({ startsAt: D("2026-11-02"), endsAt: D("2026-11-09"), placement: { ...placement, state: "DRAFT" }, campaign: { ...campaign, state: "ACTIVE" } })).toEqual([
      "The placement is not on sale yet.", "A campaign that is ACTIVE cannot buy more placements.",
    ]);
  });

  it("the price is per week, pro rata to the cent; the first slot free for every day", () => {
    expect(R.windowPrice(70_000, 7)).toBe(70_000);
    expect(R.windowPrice(70_000, 3)).toBe(30_000);
    expect(R.windowPrice(100_000, 1)).toBe(14_286);
    expect(R.freeSlot(1, [])).toBe(1);
    expect(R.freeSlot(2, [{ slot: 1 }])).toBe(2);
    expect(R.freeSlot(2, [{ slot: 1 }, { slot: 2 }])).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("4S1-BE-04 · booking windows, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const V = await import("../src/domain/virtual-registry");
  const B = await import("../src/domain/virtual-bookings");
  const { transitionCampaign } = await import("../src/domain/campaign");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "vb_t";
  const OTHER = "vb_o";
  const actor = (tenantId: string, role: string, extra: Record<string, unknown> = {}) =>
    ({ userId: `vb_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");
  const cm = actor(T, "CAMPAIGN_MGR");
  const NOW = new Date("2026-10-20T12:00:00Z");

  async function clean() {
    for (const t of ["PlacementWindow", "VirtualPlacement", "VirtualZone", "VirtualWorld", "InventoryItem", "OutboxJob", "AuditLog", "Campaign", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  let led = "";
  let screen = "";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Bookings" }, { id: OTHER, name: "Another operator" }] });
    await prisma.property.create({ data: { id: "vb_p", tenantId: T, slug: "vb-infinex", name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    await prisma.sponsor.create({ data: { id: "vb_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.createMany({ data: ["c1", "c2", "c3", "c4"].map((c) => ({
      id: `vb_${c}`, tenantId: T, sponsorId: "vb_sp", name: `Campaign ${c}`, budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "DRAFT" as const,
    })) });
    const world = (await V.createWorld(admin, { propertyId: "vb_p", externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    const spec = { widthPx: 3840, heightPx: 216, creativeTypes: ["IMAGE" as const], maxBytes: 5_000_000, rackPriceCents: 70_000 };
    led = (await V.createPlacement(admin, world, { externalId: "east-led", name: "East LED", kind: "LED_SCREEN", ...spec })).placement.id;
    screen = (await V.createPlacement(admin, world, { externalId: "big-screen", name: "Big screen", kind: "LED_SCREEN", capacity: 2, ...spec })).placement.id;
    await V.publishPlacement(admin, led);
    await V.publishPlacement(admin, screen);
  });
  afterAll(clean);

  it("books whole days inside a draft campaign, at the weekly price pro rata; audited", async () => {
    const w = await B.bookPlacement(cm, led, { campaignId: "vb_c1", startsAt: D("2026-11-02"), endsAt: D("2026-11-09") });
    expect(w.window).toMatchObject({ slot: 1, priceCents: 70_000, days: 7, state: "BOOKED", campaignId: "vb_c1", startsAt: "2026-11-02T00:00:00.000Z" });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.windowBook" } })).toBe(1);
  });

  it("the same billboard for an overlapping week is refused; the week after is fine; a campaign cannot double-book itself", async () => {
    await expect(B.bookPlacement(cm, led, { campaignId: "vb_c2", startsAt: D("2026-11-05"), endsAt: D("2026-11-12") })).rejects.toThrow(/fully booked/);
    /* Half-open: a week ending as the next begins does not overlap. */
    expect((await B.bookPlacement(cm, led, { campaignId: "vb_c2", startsAt: D("2026-11-09"), endsAt: D("2026-11-16") })).window.slot).toBe(1);
    await expect(B.bookPlacement(cm, led, { campaignId: "vb_c1", startsAt: D("2026-11-08"), endsAt: D("2026-11-10") })).rejects.toThrow(/already holds/);
  });

  it("the database itself refuses an overlap, whatever the code does", async () => {
    await expect(prisma.placementWindow.create({ data: {
      tenantId: T, placementId: led, campaignId: "vb_c3", slot: 1, startsAt: D("2026-11-03"), endsAt: D("2026-11-04"), priceCents: 10_000,
    } })).rejects.toThrow(/PlacementWindow_no_overlap/);
  });

  it("capacity: a two-sponsor screen takes two campaigns the same week, not three; two racing for the last slot — one wins", async () => {
    expect((await B.bookPlacement(cm, screen, { campaignId: "vb_c1", startsAt: D("2026-11-16"), endsAt: D("2026-11-23") })).window.slot).toBe(1);
    const race = await Promise.allSettled(["vb_c2", "vb_c3"].map((c) => B.bookPlacement(cm, screen, { campaignId: c, startsAt: D("2026-11-16"), endsAt: D("2026-11-23") })));
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = race.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(V.VirtualConflictError);
    expect(await prisma.placementWindow.count({ where: { placementId: screen, state: "BOOKED" } })).toBe(2);
  });

  it("refused with the reasons: part days, outside the campaign, a campaign no longer a draft", async () => {
    await expect(B.bookPlacement(cm, led, { campaignId: "vb_c3", startsAt: new Date("2026-11-20T10:00:00Z"), endsAt: D("2026-11-23") })).rejects.toMatchObject({ problems: ["A window is whole days: it starts and ends at midnight UTC."] });
    await expect(B.bookPlacement(cm, led, { campaignId: "vb_c3", startsAt: D("2026-11-28"), endsAt: D("2026-12-05") })).rejects.toMatchObject({ problems: ["The window falls outside the campaign's dates."] });
    await prisma.campaign.update({ where: { id: "vb_c4" }, data: { state: "APPROVAL" } });
    await expect(B.bookPlacement(cm, led, { campaignId: "vb_c4", startsAt: D("2026-11-20"), endsAt: D("2026-11-23") })).rejects.toMatchObject({ problems: ["A campaign that is APPROVAL cannot buy more placements."] });
  });

  it("releasing gives the days back, the window stays marked; a campaign past draft keeps them; cancelling a campaign releases them all", async () => {
    const mine = (await B.placementWindows(cm, led)).windows.find((w) => w.campaignId === "vb_c1" && w.state === "BOOKED")!;
    await expect(B.releaseWindow(cm, mine.id, { reason: "x" })).rejects.toBeInstanceOf(V.VirtualInputError);
    expect((await B.releaseWindow(cm, mine.id, { reason: "The sponsor moved the dates" }, NOW)).window).toMatchObject({ state: "RELEASED", releaseReason: "The sponsor moved the dates" });
    expect((await B.bookPlacement(cm, led, { campaignId: "vb_c3", startsAt: D("2026-11-02"), endsAt: D("2026-11-09") })).window.slot).toBe(1);

    /* c2 holds the LED's second week and a screen slot; it is cancelled through the real stage move. */
    await transitionCampaign(admin, "vb_c2", "CANCELLED");
    expect(await prisma.placementWindow.count({ where: { campaignId: "vb_c2", state: "BOOKED" } })).toBe(0);
    expect(await prisma.placementWindow.count({ where: { campaignId: "vb_c2", state: "RELEASED", releaseReason: "The campaign was cancelled." } })).toBeGreaterThanOrEqual(1);

    await prisma.campaign.update({ where: { id: "vb_c3" }, data: { state: "APPROVAL" } });
    const held = (await B.placementWindows(cm, led)).windows.find((w) => w.campaignId === "vb_c3")!;
    await expect(B.releaseWindow(cm, held.id, { reason: "Changed our minds" })).rejects.toThrow(/keeps its placements/);
  });

  it("a placement or world with bookings still to come cannot be retired", async () => {
    await expect(V.retirePlacement(admin, led, NOW)).rejects.toThrow(/booked window\(s\) still to come/);
    const worldId = (await prisma.virtualPlacement.findFirstOrThrow({ where: { id: led }, select: { worldId: true } })).worldId;
    await expect(V.updateWorld(admin, worldId, { status: "RETIRED" }, NOW)).rejects.toThrow(/still to come/);
  });

  it("who: campaign managers and BTG admins book; Sales and sponsors cannot; another tenant sees no windows", async () => {
    await expect(B.bookPlacement(actor(T, "SALES"), led, { campaignId: "vb_c1", startsAt: D("2026-11-23"), endsAt: D("2026-11-30") })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(B.bookPlacement(actor(T, "SPONSOR_ADMIN", { sponsorId: "vb_sp" }), led, { campaignId: "vb_c1", startsAt: D("2026-11-23"), endsAt: D("2026-11-30") })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await B.placementWindows(actor(T, "SALES"), led)).windows.length).toBeGreaterThan(0);
    await expect(B.placementWindows(actor(OTHER, "BTG_ADMIN"), led)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(B.bookPlacement(actor(OTHER, "BTG_ADMIN"), led, { campaignId: "vb_c1", startsAt: D("2026-11-23"), endsAt: D("2026-11-30") })).rejects.toBeInstanceOf(V.VirtualNotFoundError);
  });
});
