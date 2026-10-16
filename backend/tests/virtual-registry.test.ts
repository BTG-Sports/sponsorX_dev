import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   4S1-BE-01/02/03 — the virtual registry (documentation/SponsorX-Virtual-Registry.md).
   Done when:
     01  SponsorX can register a world and its zones against stable external IDs;
     02  a placement can be registered with specs, viewability rule and availability;
     03  a virtual placement maps to a sellable SponsorX inventory record.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/virtual-rules");

describe("4S1 · the vocabulary's rules (pure)", () => {
  const ok = { kind: "LED_SCREEN" as const, widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE", "VIDEO"] as Array<"IMAGE" | "VIDEO" | "LOGO">, maxBytes: 20_000_000, maxVideoSeconds: 30, rackPriceCents: 250_000 };

  it("a placement's spec: each kind takes its own creative; video needs its longest length; limits in plain words", () => {
    expect(R.placementProblems(ok)).toEqual([]);
    expect(R.placementProblems({ ...ok, kind: "BILLBOARD" })).toEqual(["A billboard takes IMAGE, not VIDEO."]);
    expect(R.placementProblems({ ...ok, maxVideoSeconds: null })).toEqual(["A placement that takes video says its longest video, 1 to 300 seconds."]);
    expect(R.placementProblems({ ...ok, creativeTypes: ["IMAGE"] })).toEqual(["Only a placement that takes video has a longest video."]);
    expect(R.placementProblems({ ...ok, viewabilityRule: "seen-somehow" })[0]).toMatch(/^No viewability rule "seen-somehow"/);
    expect(R.placementProblems({ ...ok, widthPx: 4, rackPriceCents: 0, capacity: 50 })).toHaveLength(3);
  });

  it("nesting: district under the world; venue under a district or the world; zone under any — never a higher level under a lower", () => {
    expect(R.nestingProblem("DISTRICT", null)).toBeNull();
    expect(R.nestingProblem("ZONE", "VENUE")).toBeNull();
    expect(R.nestingProblem("DISTRICT", "VENUE")).toBe("A district sits under the world, not a venue.");
    expect(R.nestingProblem("VENUE", "ZONE")).toBe("A venue sits under the world or a district, not a zone.");
  });

  it("on sale only from a draft, in an active production world whose owner is approved", () => {
    const fine = { state: "DRAFT", worldStatus: "ACTIVE", environment: "PRODUCTION", zoneStatus: "ACTIVE", propertyApproved: true };
    expect(R.publishProblems(fine)).toEqual([]);
    expect(R.publishProblems({ ...fine, environment: "STAGING", propertyApproved: false })).toEqual([
      "Only a production world's placements are sold; staging is for testing.", "The world's owner has not been approved to sell yet (onboarding).",
    ]);
  });
});

describe.skipIf(!hasDatabase)("4S1-BE-01/02/03 · the registry, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const V = await import("../src/domain/virtual-registry");
  const { updateInventoryItem, InventoryError } = await import("../src/domain/inventory");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "vr_t";
  const OTHER = "vr_o";
  const actor = (tenantId: string, role: string, extra: Record<string, unknown> = {}) =>
    ({ userId: `vr_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");

  async function clean() {
    for (const t of ["VirtualPlacement", "VirtualZone", "VirtualWorld", "InventoryItem", "AuditLog", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Virtual" }, { id: OTHER, name: "Another operator" }] });
    await prisma.property.createMany({ data: [
      { id: "vr_p", tenantId: T, slug: "vr-infinex", name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") },
      { id: "vr_p2", tenantId: T, slug: "vr-newworld", name: "New World Co", kind: "VIRTUAL" },
      { id: "vr_team", tenantId: T, slug: "vr-team", name: "Eastfield FC", kind: "TEAM" },
    ] });
  });
  afterAll(clean);

  let arena = "";
  let staging = "";

  it("01 · a world, per environment, under the owner's external ID — never twice; only a VIRTUAL property owns one; audited", async () => {
    const w = await V.createWorld(admin, { propertyId: "vr_p", externalId: "arena-1", name: "INFINEX Arena", environment: "PRODUCTION", runtime: "Unity 6" });
    expect(w.world).toMatchObject({ externalId: "arena-1", environment: "PRODUCTION", runtime: "Unity 6", status: "ACTIVE", propertyId: "vr_p" });
    arena = w.world.id;
    /* The same surface keeps its ID across environments. */
    staging = (await V.createWorld(admin, { propertyId: "vr_p", externalId: "arena-1", name: "INFINEX Arena (staging)", environment: "STAGING" })).world.id;
    await expect(V.createWorld(admin, { propertyId: "vr_p", externalId: "arena-1", name: "Again", environment: "PRODUCTION" })).rejects.toBeInstanceOf(V.VirtualConflictError);
    await expect(V.createWorld(admin, { propertyId: "vr_team", externalId: "pitch", name: "A team", environment: "PRODUCTION" })).rejects.toThrow(/kind VIRTUAL/);
    await expect(V.createWorld(admin, { propertyId: "vr_p", externalId: "has space", name: "Bad ID", environment: "PRODUCTION" })).rejects.toBeInstanceOf(V.VirtualInputError);
    await expect(V.createWorld(actor(T, "CAMPAIGN_MGR"), { propertyId: "vr_p", externalId: "x", name: "Not theirs", environment: "PRODUCTION" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.worldCreate" } })).toBe(2);
  });

  it("01 · zones upserted by external ID, all or nothing, under allowed parents; idempotent; level and parent never change", async () => {
    const map = [
      { externalId: "north", name: "North Plaza", level: "DISTRICT" as const },
      { externalId: "stadium", name: "Main Stadium", level: "VENUE" as const, parentExternalId: "north" },
      { externalId: "east-stand", name: "East Stand", level: "ZONE" as const, parentExternalId: "stadium" },
      { externalId: "gate", name: "Front Gate", level: "ZONE" as const },
    ];
    /* Children before parents in the call is fine: parents are made first. */
    expect((await V.upsertZones(admin, arena, [...map].reverse())).created.sort()).toEqual(["east-stand", "gate", "north", "stadium"]);
    expect(await V.upsertZones(admin, arena, map)).toMatchObject({ created: [], changed: [] });
    expect((await V.upsertZones(admin, arena, [{ ...map[3]!, name: "Main Gate" }])).changed).toEqual(["gate"]);
    /* Every problem, and nothing written. */
    await expect(V.upsertZones(admin, arena, [
      { externalId: "plaza-2", name: "Plaza", level: "DISTRICT", parentExternalId: "stadium" },
      { externalId: "east-stand", name: "East Stand", level: "ZONE", parentExternalId: "north" },
      { externalId: "lost", name: "Lost", level: "ZONE", parentExternalId: "nowhere" },
      { externalId: "fine", name: "Would be fine", level: "ZONE" },
    ])).rejects.toMatchObject({ problems: [
      '"plaza-2": A district sits under the world, not a venue.',
      '"east-stand" keeps its level and parent (zone under stadium); a zone somewhere else is a new zone with a new ID.',
      '"lost": no zone "nowhere" in this world or this call.',
    ] });
    expect(await prisma.virtualZone.count({ where: { worldId: arena, externalId: "fine" } })).toBe(0);
  });

  it("01 · the database holds the IDs: an external ID never changes, a zone never moves, nothing is deleted", async () => {
    await expect(prisma.virtualWorld.update({ where: { id: arena }, data: { externalId: "arena-2" } })).rejects.toThrow(/An external ID never changes/);
    const east = await prisma.virtualZone.findFirstOrThrow({ where: { worldId: arena, externalId: "east-stand" }, select: { id: true } });
    await expect(prisma.virtualZone.update({ where: { id: east.id }, data: { parentId: null } })).rejects.toThrow(/keeps its world, level and parent/);
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL sponsorx.audit_purge = 'off'");
      await tx.$executeRawUnsafe(`DELETE FROM "VirtualZone" WHERE id = $1`, east.id);
    })).rejects.toThrow(/retired, never deleted/);
  });

  let led = "";

  it("02 · a placement with its specs, viewability rule (a default per kind), capacity, price and availability — as a draft", async () => {
    const p = await V.createPlacement(admin, arena, {
      externalId: "east-led-1", name: "East Stand LED ribbon", kind: "LED_SCREEN", zoneExternalId: "east-stand",
      widthPx: 3840, heightPx: 216, creativeTypes: ["IMAGE", "VIDEO"], maxBytes: 50_000_000, maxVideoSeconds: 15, rackPriceCents: 250_000,
      availableFrom: new Date("2026-11-01T00:00:00Z"), availableUntil: new Date("2027-06-30T00:00:00Z"),
    });
    expect(p.placement).toMatchObject({
      state: "DRAFT", testStatus: "UNTESTED", viewabilityRule: "video-50pct-2s@1", capacity: 1, currency: "USD", inventoryItemId: null,
      availableFrom: "2026-11-01T00:00:00.000Z", availableUntil: "2027-06-30T00:00:00.000Z",
    });
    led = p.placement.id;
    await expect(V.createPlacement(admin, arena, { externalId: "board", name: "Board", kind: "BILLBOARD", widthPx: 800, heightPx: 400, creativeTypes: ["VIDEO"], maxBytes: 5_000_000, maxVideoSeconds: 10, rackPriceCents: 10_000 }))
      .rejects.toMatchObject({ problems: ["A billboard takes IMAGE, not VIDEO."] });
    await expect(V.createPlacement(admin, arena, { externalId: "east-led-1", name: "Again", kind: "BILLBOARD", widthPx: 800, heightPx: 400, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 10_000 }))
      .rejects.toBeInstanceOf(V.VirtualConflictError);
    /* A draft's specs may still change. */
    expect((await V.updatePlacement(admin, led, { maxVideoSeconds: 20 })).placement.maxVideoSeconds).toBe(20);
  });

  it("03 · on sale: one inventory item of kind VIRTUAL_PLACEMENT, owned by the world's property, at its price and dates, one buyer per period", async () => {
    const out = await V.publishPlacement(admin, led);
    expect(out.placement.state).toBe("AVAILABLE");
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { id: out.inventoryItemId }, select: { tenantId: true, propertyId: true, athleteId: true, kind: true, title: true, priceCents: true, availableFrom: true, packageRules: true, active: true, description: true } });
    expect(item).toMatchObject({ tenantId: T, propertyId: "vr_p", athleteId: null, kind: "VIRTUAL_PLACEMENT", title: "INFINEX Arena · East Stand LED ribbon", priceCents: 250_000, packageRules: { exclusive: true }, active: true });
    expect(item.availableFrom?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(item.description).toBe("led screen, 3840×216 px; takes image or video (video up to 20 s); one sponsor at a time; counted as seen: half of it on screen for 2 seconds.");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.placementPublish", entityId: led } })).toBe(1);
    await expect(V.publishPlacement(admin, led)).rejects.toThrow(/already on sale/);
  });

  it("03 · kept in step: a price change follows to the item; specs are fixed on sale; the owner cannot edit the item", async () => {
    await V.updatePlacement(admin, led, { rackPriceCents: 300_000 });
    const item = await prisma.virtualPlacement.findFirstOrThrow({ where: { id: led }, select: { inventoryItemId: true } });
    expect(await prisma.inventoryItem.findFirstOrThrow({ where: { id: item.inventoryItemId! }, select: { priceCents: true, version: true } })).toEqual({ priceCents: 300_000, version: 2 });
    await expect(V.updatePlacement(admin, led, { widthPx: 1920 })).rejects.toThrow(/specs are fixed/);
    await expect(updateInventoryItem(actor(T, "PROPERTY_MGR", { propertyId: "vr_p" }), item.inventoryItemId!, { priceCents: 1 })).rejects.toBeInstanceOf(InventoryError);
  });

  it("03 · never on sale from staging, nor for an owner not yet approved", async () => {
    const spec = { name: "Gate board", kind: "BILLBOARD" as const, widthPx: 1200, heightPx: 600, creativeTypes: ["IMAGE" as const], maxBytes: 5_000_000, rackPriceCents: 50_000 };
    const s = await V.createPlacement(admin, staging, { externalId: "gate-board", ...spec });
    await expect(V.publishPlacement(admin, s.placement.id)).rejects.toThrow(/staging is for testing/);
    const newWorld = (await V.createWorld(admin, { propertyId: "vr_p2", externalId: "nw", name: "New World", environment: "PRODUCTION" })).world.id;
    const n = await V.createPlacement(admin, newWorld, { externalId: "nw-board", ...spec });
    await expect(V.publishPlacement(admin, n.placement.id)).rejects.toThrow(/not been approved to sell/);
  });

  it("retiring: a placement goes off sale for good and its item is switched off; a retired world takes its zones and placements with it", async () => {
    const gate = await V.createPlacement(admin, arena, { externalId: "gate-kiosk", name: "Gate kiosk", kind: "KIOSK", zoneExternalId: "gate", widthPx: 1080, heightPx: 1920, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 40_000 });
    const { inventoryItemId } = await V.publishPlacement(admin, gate.placement.id);
    expect((await V.retirePlacement(admin, gate.placement.id)).placement.state).toBe("RETIRED");
    expect((await prisma.inventoryItem.findFirstOrThrow({ where: { id: inventoryItemId }, select: { active: true } })).active).toBe(false);
    await expect(prisma.virtualPlacement.update({ where: { id: gate.placement.id }, data: { state: "DRAFT" } })).rejects.toThrow(/stays retired/);
    /* Its ID is never reused. */
    await expect(V.createPlacement(admin, arena, { externalId: "gate-kiosk", name: "Gate kiosk again", kind: "KIOSK", widthPx: 1080, heightPx: 1920, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 40_000 }))
      .rejects.toBeInstanceOf(V.VirtualConflictError);

    await V.updateWorld(admin, arena, { status: "RETIRED" });
    expect(await prisma.virtualZone.count({ where: { worldId: arena, status: "ACTIVE" } })).toBe(0);
    const ledRow = await prisma.virtualPlacement.findFirstOrThrow({ where: { id: led }, select: { state: true, inventoryItemId: true } });
    expect(ledRow.state).toBe("RETIRED");
    expect((await prisma.inventoryItem.findFirstOrThrow({ where: { id: ledRow.inventoryItemId! }, select: { active: true } })).active).toBe(false);
    await expect(V.updateWorld(admin, arena, { name: "Back again" })).rejects.toThrow(/stays retired/);
  });

  it("who: BTG writes; campaign managers and Sales read; a world's owner reads only its own; a sponsor never; another tenant sees nothing", async () => {
    for (const role of ["CAMPAIGN_MGR", "SALES"]) expect((await V.listWorlds(actor(T, role))).worlds).toHaveLength(3);
    const own = await V.listWorlds(actor(T, "PROPERTY_MGR", { propertyId: "vr_p" }));
    expect(own.worlds.map((w) => w.externalId).sort()).toEqual(["arena-1", "arena-1"]);
    expect(own.worlds.find((w) => w.environment === "PRODUCTION")).toMatchObject({ zones: 4, placements: { DRAFT: 0, AVAILABLE: 0, RETIRED: 2 } });
    expect((await V.listWorlds(actor(T, "PROPERTY_MGR", { propertyId: "vr_team" }))).worlds).toEqual([]);
    await expect(V.getWorld(actor(T, "PROPERTY_MGR", { propertyId: "vr_p2" }), arena)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(V.listWorlds(actor(T, "SPONSOR_ADMIN", { sponsorId: "x" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(V.updatePlacement(actor(T, "CAMPAIGN_MGR"), led, { name: "Renamed" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await V.listWorlds(actor(OTHER, "BTG_ADMIN"))).worlds).toEqual([]);
    await expect(V.getWorld(actor(OTHER, "BTG_ADMIN"), arena)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(V.getPlacement(actor(OTHER, "BTG_ADMIN"), led)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
  });
});
