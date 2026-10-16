/**
 * The virtual registry — 4S1-BE-01 (worlds and zones), 4S1-BE-02 (placements),
 * 4S1-BE-03 (placements as sellable inventory).
 * documentation/SponsorX-Virtual-Registry.md; the vocabulary is
 * SponsorX-Virtual-Taxonomy.md, the rules any world follows are
 * SponsorX-INFINEX-World-Contract.md.
 *
 *   WORLDS belong to a property of kind VIRTUAL, one row per environment
 *   (STAGING / PRODUCTION), under the owner's external ID.
 *   ZONES (districts, venues, zones) are upserted in one call by external ID
 *   — how a world's map is imported — each under an allowed parent.
 *   PLACEMENTS are surfaces with specs, a viewability rule, a capacity, a
 *   list price per week and availability. Created as DRAFT; put on sale (AVAILABLE) only in
 *   a production world whose owner BTG has approved; retired for good.
 *
 *   ON SALE = SELLABLE INVENTORY (4S1-BE-03). Going AVAILABLE creates one
 *   InventoryItem of kind VIRTUAL_PLACEMENT, owned by the world's property,
 *   with the placement's price, dates and specs, one buyer per period when
 *   its capacity is 1. SponsorX keeps it in step: a price or date change
 *   updates it, retiring switches it off. Owners cannot edit it or list it
 *   (inventory.ts, listing.ts): a placement is booked by the week, inside a
 *   campaign (4S1-BE-04).
 *
 * IDs never change and nothing is deleted (trigger "virtual_ids_are_fixed").
 * A placement or world with booked days still to come (4S1-BE-04) cannot be retired.
 * BTG writes (`virtualWorld`, RBAC matrix §37); campaign managers and Sales
 * read; a world's owner reads its own worlds. Every write is audited.
 */
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { futureBookings } from "./virtual-bookings";
import { VirtualConflictError, VirtualInputError, VirtualNotFoundError } from "./virtual-errors";
import {
  DEFAULT_RULE, EXTERNAL_ID, nestingProblem, placementProblems, publishProblems, specLine, VIRTUAL_PLACEMENT_KIND,
  type CreativeType, type Environment, type PlacementKind, type PlacementSpec, type ZoneLevel,
} from "./virtual-rules";

type Tx = Prisma.TransactionClient;

export { VirtualConflictError, VirtualInputError, VirtualNotFoundError };

const WORLD = { id: true, propertyId: true, externalId: true, name: true, environment: true, runtime: true, runtimeVersion: true, status: true, createdAt: true } as const;
const ZONE = { id: true, parentId: true, level: true, externalId: true, name: true, status: true } as const;
const PLACEMENT = {
  id: true, worldId: true, zoneId: true, externalId: true, name: true, kind: true, widthPx: true, heightPx: true, creativeTypes: true, maxBytes: true,
  maxVideoSeconds: true, capacity: true, viewabilityRule: true, rackPriceCents: true, currency: true, availableFrom: true, availableUntil: true,
  testStatus: true, state: true, inventoryItemId: true,
} as const;

const iso = (d: Date | null) => d?.toISOString() ?? null;
const viewWorld = (w: Prisma.VirtualWorldGetPayload<{ select: typeof WORLD }>) => ({ ...w, createdAt: w.createdAt.toISOString() });
const viewPlacement = (p: Prisma.VirtualPlacementGetPayload<{ select: typeof PLACEMENT }>) => ({ ...p, availableFrom: iso(p.availableFrom), availableUntil: iso(p.availableUntil) });

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** The world the actor may read (or write), or 404. */
async function worldFor(db: Tx | typeof prisma, actor: Actor, worldId: string, action: "read" | "write") {
  const w = await db.virtualWorld.findFirst({ where: { ...whereFor(actor, "virtualWorld", action), id: worldId }, select: { ...WORLD, tenantId: true } });
  if (!w) throw new VirtualNotFoundError();
  return w;
}

/* ───────────────────────────── worlds (4S1-BE-01) ───────────────────────────── */

/** GET /virtual/worlds — the worlds the caller may see, with their zone and placement counts. */
export async function listWorlds(actor: Actor) {
  assertAllowed(actor, "virtualWorld", "read");
  const worlds = await prisma.virtualWorld.findMany({ where: whereFor(actor, "virtualWorld", "read"), orderBy: [{ name: "asc" }, { environment: "asc" }], select: WORLD });
  const ids = worlds.map((w) => w.id);
  const [zones, placements] = ids.length ? await Promise.all([
    prisma.virtualZone.groupBy({ /* tenant-scope: the worlds listed above through whereFor. */ where: { worldId: { in: ids } }, by: ["worldId"], _count: { _all: true } }),
    prisma.virtualPlacement.groupBy({ /* tenant-scope: the worlds listed above through whereFor. */ where: { worldId: { in: ids } }, by: ["worldId", "state"], _count: { _all: true } }),
  ]) : [[], []];
  return {
    worlds: worlds.map((w) => ({
      ...viewWorld(w),
      zones: zones.find((z) => z.worldId === w.id)?._count._all ?? 0,
      placements: Object.fromEntries(["DRAFT", "AVAILABLE", "RETIRED"].map((s) => [s, placements.find((p) => p.worldId === w.id && p.state === s)?._count._all ?? 0])),
    })),
  };
}

/** GET /virtual/worlds/:worldId — the world, its zones and its placements. */
export async function getWorld(actor: Actor, worldId: string) {
  assertAllowed(actor, "virtualWorld", "read");
  const w = await worldFor(prisma, actor, worldId, "read");
  const [zones, placements] = await Promise.all([
    prisma.virtualZone.findMany({ where: { tenantId: w.tenantId, worldId: w.id }, orderBy: [{ level: "asc" }, { externalId: "asc" }], select: ZONE }),
    prisma.virtualPlacement.findMany({ where: { tenantId: w.tenantId, worldId: w.id }, orderBy: { externalId: "asc" }, select: PLACEMENT }),
  ]);
  const { tenantId: _t, ...world } = w;
  return { world: viewWorld(world), zones, placements: placements.map(viewPlacement) };
}

/** POST /virtual/worlds — register a world, in one environment, for a VIRTUAL property. */
export async function createWorld(actor: Actor, input: { propertyId: string; externalId: string; name: string; environment: Environment; runtime?: string | null; runtimeVersion?: string | null }) {
  assertTenantWide(actor, "virtualWorld", "write");
  const problems: string[] = [];
  if (!EXTERNAL_ID.test(input.externalId)) problems.push("An external ID is 1–64 letters, digits, '.', '_' or '-'.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) problems.push("Name the world (2 to 120 characters).");
  if (problems.length) throw new VirtualInputError(problems);
  const property = await prisma.property.findFirst({ where: { tenantId: actor.tenantId, id: input.propertyId }, select: { id: true, kind: true } });
  if (!property) throw new VirtualNotFoundError("property");
  if (property.kind !== "VIRTUAL") throw new VirtualInputError(["A world belongs to a property of kind VIRTUAL (a world operator)."]);
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await tx.virtualWorld.create({
        data: {
          tenantId: actor.tenantId, propertyId: property.id, externalId: input.externalId, name, environment: input.environment,
          runtime: input.runtime?.trim() || null, runtimeVersion: input.runtimeVersion?.trim() || null, createdBy: actor.userId,
        },
        select: WORLD,
      });
      await audit(tx, actor, AUDIT_ACTIONS.virtual.worldCreate, "VirtualWorld", w.id, { after: { propertyId: w.propertyId, externalId: w.externalId, environment: w.environment, name } });
      return { world: viewWorld(w) };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new VirtualConflictError(`A ${input.environment.toLowerCase()} world "${input.externalId}" is already registered — an external ID is never reused.`);
    throw e;
  }
}

/** PATCH /virtual/worlds/:worldId — rename, record its runtime, or retire it (for good; its placements go off sale). */
export async function updateWorld(actor: Actor, worldId: string, patch: { name?: string; runtime?: string | null; runtimeVersion?: string | null; status?: "RETIRED" }, now = new Date()) {
  assertTenantWide(actor, "virtualWorld", "write");
  return prisma.$transaction(async (tx) => {
    const w = await worldFor(tx, actor, worldId, "write");
    if (w.status === "RETIRED") throw new VirtualConflictError("A retired world stays retired.");
    const name = patch.name?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 120)) throw new VirtualInputError(["Name the world (2 to 120 characters)."]);
    const next = await tx.virtualWorld.update({
      /* tenant-scope: the world found above through whereFor. */
      where: { id: w.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(patch.runtime !== undefined ? { runtime: patch.runtime?.trim() || null } : {}),
        ...(patch.runtimeVersion !== undefined ? { runtimeVersion: patch.runtimeVersion?.trim() || null } : {}),
        ...(patch.status ? { status: "RETIRED" } : {}),
      },
      select: WORLD,
    });
    if (patch.status === "RETIRED") {
      /* tenant-scope: keyed by the world found above through whereFor. */
      const ids = (await tx.virtualPlacement.findMany({ where: { tenantId: w.tenantId, worldId: w.id }, select: { id: true } })).map((x) => x.id);
      const ahead = await futureBookings(tx, w.tenantId, ids, now);
      if (ahead) throw new VirtualConflictError(`Its placements have ${ahead} booked window(s) still to come — release them, or cancel their campaigns, first.`);
      await tx.virtualZone.updateMany({ where: { tenantId: w.tenantId, worldId: w.id, status: "ACTIVE" }, data: { status: "RETIRED" } });
      const open = await tx.virtualPlacement.findMany({ where: { tenantId: w.tenantId, worldId: w.id, state: { not: "RETIRED" } }, select: { id: true, inventoryItemId: true } });
      for (const p of open) await retireInside(tx, p, now);
    }
    await audit(tx, actor, AUDIT_ACTIONS.virtual.worldUpdate, "VirtualWorld", w.id, {
      before: { name: w.name, runtime: w.runtime, runtimeVersion: w.runtimeVersion, status: w.status },
      after: { name: next.name, runtime: next.runtime, runtimeVersion: next.runtimeVersion, status: next.status },
    });
    return { world: viewWorld(next) };
  });
}

/* ───────────────────────────── zones (4S1-BE-01) ───────────────────────────── */

export type ZoneInput = { externalId: string; name: string; level: ZoneLevel; parentExternalId?: string | null; status?: "ACTIVE" | "RETIRED" };

/**
 * PUT /virtual/worlds/:worldId/zones — upsert a world's districts, venues and
 * zones by external ID, in one call (how a world's map is imported). New ones
 * are created under their parent (in this call or already registered); known
 * ones may be renamed or retired. A zone's level and parent never change.
 * All or nothing: one problem refuses the whole call, with every problem.
 */
export async function upsertZones(actor: Actor, worldId: string, zones: ZoneInput[]) {
  assertTenantWide(actor, "virtualWorld", "write");
  return prisma.$transaction(async (tx) => {
    const w = await worldFor(tx, actor, worldId, "write");
    if (w.status === "RETIRED") throw new VirtualConflictError("A retired world's zones cannot change.");
    const known = new Map((await tx.virtualZone.findMany({ where: { tenantId: w.tenantId, worldId: w.id }, select: { ...ZONE } })).map((z) => [z.externalId, z]));
    const asked = new Map<string, ZoneInput>();
    const problems: string[] = [];
    for (const z of zones) {
      if (!EXTERNAL_ID.test(z.externalId)) { problems.push(`"${z.externalId}": an external ID is 1–64 letters, digits, '.', '_' or '-'.`); continue; }
      if (asked.has(z.externalId)) problems.push(`"${z.externalId}" is given twice.`);
      const name = z.name.trim();
      if (name.length < 1 || name.length > 120) problems.push(`"${z.externalId}": name it (1 to 120 characters).`);
      asked.set(z.externalId, { ...z, name });
    }
    const levelOf = (ext: string | null | undefined): ZoneLevel | null | undefined =>
      ext == null ? null : (known.get(ext)?.level as ZoneLevel | undefined) ?? asked.get(ext)?.level;
    for (const z of asked.values()) {
      const parent = z.parentExternalId ?? null;
      const was = known.get(z.externalId);
      if (was) {
        const wasParent = was.parentId ? [...known.values()].find((k) => k.id === was.parentId)?.externalId ?? null : null;
        if (was.level !== z.level || wasParent !== parent) problems.push(`"${z.externalId}" keeps its level and parent (${was.level.toLowerCase()} under ${wasParent ?? "the world"}); a zone somewhere else is a new zone with a new ID.`);
        if (was.status === "RETIRED" && z.status !== "RETIRED") problems.push(`"${z.externalId}" is retired and stays retired.`);
        continue;
      }
      if (parent === z.externalId) { problems.push(`"${z.externalId}" cannot be its own parent.`); continue; }
      const pl = levelOf(parent);
      if (pl === undefined) { problems.push(`"${z.externalId}": no zone "${parent}" in this world or this call.`); continue; }
      const nest = nestingProblem(z.level, pl);
      if (nest) problems.push(`"${z.externalId}": ${nest}`);
      if (parent && (known.get(parent)?.status === "RETIRED" || asked.get(parent)?.status === "RETIRED")) problems.push(`"${z.externalId}": its parent "${parent}" is retired.`);
    }
    if (problems.length) throw new VirtualInputError(problems);
    /* Parents before children: the allowed nesting is world → district → venue → zone. */
    const order: Record<ZoneLevel, number> = { DISTRICT: 0, VENUE: 1, ZONE: 2 };
    const created: string[] = [];
    const changed: string[] = [];
    for (const z of [...asked.values()].sort((a, b) => order[a.level] - order[b.level])) {
      const was = known.get(z.externalId);
      if (was) {
        if (was.name !== z.name || (z.status === "RETIRED" && was.status !== "RETIRED")) {
          await tx.virtualZone.update({ /* tenant-scope: a zone of the world found above through whereFor. */ where: { id: was.id }, data: { name: z.name, ...(z.status === "RETIRED" ? { status: "RETIRED" } : {}) } });
          changed.push(z.externalId);
        }
        continue;
      }
      const parentId = z.parentExternalId ? known.get(z.parentExternalId)!.id : null;
      const row = await tx.virtualZone.create({
        data: { tenantId: w.tenantId, worldId: w.id, parentId, level: z.level, externalId: z.externalId, name: z.name, status: z.status ?? "ACTIVE" },
        select: ZONE,
      });
      known.set(z.externalId, row);
      created.push(z.externalId);
    }
    if (created.length || changed.length) await audit(tx, actor, AUDIT_ACTIONS.virtual.zonesUpsert, "VirtualWorld", w.id, { after: { created, changed } });
    const all = await tx.virtualZone.findMany({ where: { tenantId: w.tenantId, worldId: w.id }, orderBy: [{ level: "asc" }, { externalId: "asc" }], select: ZONE });
    return { created, changed, zones: all };
  });
}

/* ───────────────────────────── placements (4S1-BE-02) ───────────────────────────── */

export type PlacementInput = {
  externalId: string; name: string; kind: PlacementKind; zoneExternalId?: string | null;
  widthPx: number; heightPx: number; creativeTypes: CreativeType[]; maxBytes: number; maxVideoSeconds?: number | null;
  capacity?: number; viewabilityRule?: string; rackPriceCents: number; availableFrom?: Date | null; availableUntil?: Date | null;
};

/** POST /virtual/worlds/:worldId/placements — register a surface, as a DRAFT. */
export async function createPlacement(actor: Actor, worldId: string, input: PlacementInput) {
  assertTenantWide(actor, "virtualWorld", "write");
  const problems = placementProblems(input as PlacementSpec);
  if (!EXTERNAL_ID.test(input.externalId)) problems.unshift("An external ID is 1–64 letters, digits, '.', '_' or '-'.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) problems.push("Name the placement (2 to 120 characters).");
  if (problems.length) throw new VirtualInputError(problems);
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await worldFor(tx, actor, worldId, "write");
      if (w.status === "RETIRED") throw new VirtualConflictError("A retired world takes no new placements.");
      let zoneId: string | null = null;
      if (input.zoneExternalId) {
        const z = await tx.virtualZone.findFirst({ where: { tenantId: w.tenantId, worldId: w.id, externalId: input.zoneExternalId }, select: { id: true, status: true } });
        if (!z) throw new VirtualInputError([`No zone "${input.zoneExternalId}" in this world.`]);
        if (z.status !== "ACTIVE") throw new VirtualInputError([`Zone "${input.zoneExternalId}" is retired.`]);
        zoneId = z.id;
      }
      const p = await tx.virtualPlacement.create({
        data: {
          tenantId: w.tenantId, worldId: w.id, zoneId, externalId: input.externalId, name, kind: input.kind,
          widthPx: input.widthPx, heightPx: input.heightPx, creativeTypes: input.creativeTypes, maxBytes: input.maxBytes,
          maxVideoSeconds: input.creativeTypes.includes("VIDEO") ? input.maxVideoSeconds ?? null : null,
          capacity: input.capacity ?? 1, viewabilityRule: input.viewabilityRule ?? DEFAULT_RULE[input.kind], rackPriceCents: input.rackPriceCents,
          availableFrom: input.availableFrom ?? null, availableUntil: input.availableUntil ?? null, createdBy: actor.userId,
        },
        select: PLACEMENT,
      });
      await audit(tx, actor, AUDIT_ACTIONS.virtual.placementCreate, "VirtualPlacement", p.id, { after: { worldId: w.id, externalId: p.externalId, kind: p.kind, rackPriceCents: p.rackPriceCents } });
      return { placement: viewPlacement(p) };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new VirtualConflictError(`A placement "${input.externalId}" is already registered in this world — an external ID is never reused.`);
    throw e;
  }
}

async function placementFor(tx: Tx, actor: Actor, placementId: string, action: "read" | "write") {
  /* tenant-scope: the placement is read only through a world the actor may reach (whereFor on the world). */
  const p = await tx.virtualPlacement.findFirst({ where: { id: placementId }, select: { ...PLACEMENT, tenantId: true } });
  if (!p) throw new VirtualNotFoundError("placement");
  const w = await tx.virtualWorld.findFirst({ where: { ...whereFor(actor, "virtualWorld", action), id: p.worldId }, select: { ...WORLD, tenantId: true } });
  if (!w) throw new VirtualNotFoundError("placement");
  return { p, w };
}

/** GET /virtual/placements/:placementId */
export async function getPlacement(actor: Actor, placementId: string) {
  assertAllowed(actor, "virtualWorld", "read");
  const { p } = await placementFor(prisma as unknown as Tx, actor, placementId, "read");
  const { tenantId: _t, ...rest } = p;
  return { placement: viewPlacement(rest) };
}

const SPEC_FIELDS = ["widthPx", "heightPx", "creativeTypes", "maxBytes", "maxVideoSeconds", "viewabilityRule"] as const;

/**
 * PATCH /virtual/placements/:placementId — the name, price, capacity and dates
 * at any time before it is retired; the specs (size, creative, limits, rule)
 * only while a DRAFT, because a sponsor buys against them. On sale, the
 * inventory item follows (4S1-BE-03).
 */
export async function updatePlacement(actor: Actor, placementId: string, patch: Partial<Omit<PlacementInput, "externalId" | "kind" | "zoneExternalId">>) {
  assertTenantWide(actor, "virtualWorld", "write");
  return prisma.$transaction(async (tx) => {
    const { p, w } = await placementFor(tx, actor, placementId, "write");
    if (p.state === "RETIRED") throw new VirtualConflictError("A retired placement cannot change.");
    const specChange = SPEC_FIELDS.filter((f) => patch[f] !== undefined);
    if (specChange.length && p.state !== "DRAFT") throw new VirtualConflictError(`On sale, its specs are fixed (${specChange.join(", ")}): sponsors buy against them. Retire it and register a new placement.`);
    const merged = {
      kind: p.kind as PlacementKind, widthPx: patch.widthPx ?? p.widthPx, heightPx: patch.heightPx ?? p.heightPx,
      creativeTypes: (patch.creativeTypes ?? p.creativeTypes) as CreativeType[], maxBytes: patch.maxBytes ?? p.maxBytes,
      maxVideoSeconds: patch.maxVideoSeconds !== undefined ? patch.maxVideoSeconds : p.maxVideoSeconds,
      capacity: patch.capacity ?? p.capacity, viewabilityRule: patch.viewabilityRule ?? p.viewabilityRule, rackPriceCents: patch.rackPriceCents ?? p.rackPriceCents,
      availableFrom: patch.availableFrom !== undefined ? patch.availableFrom : p.availableFrom,
      availableUntil: patch.availableUntil !== undefined ? patch.availableUntil : p.availableUntil,
    };
    if (!merged.creativeTypes.includes("VIDEO")) merged.maxVideoSeconds = null;
    const name = patch.name?.trim() ?? p.name;
    const problems = placementProblems(merged);
    if (name.length < 2 || name.length > 120) problems.push("Name the placement (2 to 120 characters).");
    if (problems.length) throw new VirtualInputError(problems);
    const next = await tx.virtualPlacement.update({ /* tenant-scope: the placement found above through its world. */ where: { id: p.id }, data: { ...merged, name, kind: undefined }, select: PLACEMENT });
    if (next.state === "AVAILABLE" && next.inventoryItemId) await syncItem(tx, next, w);
    await audit(tx, actor, AUDIT_ACTIONS.virtual.placementUpdate, "VirtualPlacement", p.id, {
      before: { name: p.name, rackPriceCents: p.rackPriceCents, capacity: p.capacity, availableFrom: iso(p.availableFrom), availableUntil: iso(p.availableUntil), ...Object.fromEntries(specChange.map((f) => [f, p[f]])) },
      after: { name: next.name, rackPriceCents: next.rackPriceCents, capacity: next.capacity, availableFrom: iso(next.availableFrom), availableUntil: iso(next.availableUntil), ...Object.fromEntries(specChange.map((f) => [f, next[f]])) },
    });
    return { placement: viewPlacement(next) };
  });
}

/* ───────────────────────────── on sale (4S1-BE-03) ───────────────────────────── */

const itemFields = (p: Prisma.VirtualPlacementGetPayload<{ select: typeof PLACEMENT }>, w: { name: string }) => ({
  title: `${w.name} · ${p.name}`.slice(0, 200),
  description: specLine(p),
  priceCents: p.rackPriceCents,
  availableFrom: p.availableFrom,
  availableUntil: p.availableUntil,
  /* One buyer per period when only one sponsor fits at a time (inventory.ts PackageRules.exclusive). */
  packageRules: { exclusive: p.capacity === 1 } as Prisma.InputJsonValue,
});

async function syncItem(tx: Tx, p: Prisma.VirtualPlacementGetPayload<{ select: typeof PLACEMENT }>, w: { name: string }) {
  /* tenant-scope: the placement's own item, linked by its unique id. */
  await tx.inventoryItem.update({ where: { id: p.inventoryItemId! }, data: { ...itemFields(p, w), version: { increment: 1 } } });
}

/**
 * POST /virtual/placements/:placementId/publish — put it on sale. Only a
 * DRAFT, in an active production world whose owner BTG has approved to sell
 * (onboarding), in an active zone. Creates its InventoryItem and marks it
 * AVAILABLE in one transaction; refused with every reason otherwise. Its
 * staging test (Phase 5, 5S1-QA-01) is not yet required: until then it says
 * UNTESTED.
 */
export async function publishPlacement(actor: Actor, placementId: string) {
  assertTenantWide(actor, "virtualWorld", "write");
  return prisma.$transaction(async (tx) => {
    const { p, w } = await placementFor(tx, actor, placementId, "write");
    const [zone, property] = await Promise.all([
      p.zoneId ? tx.virtualZone.findFirst({ where: { tenantId: w.tenantId, id: p.zoneId, worldId: w.id }, select: { status: true } }) : Promise.resolve(null),
      tx.property.findFirst({ where: { tenantId: w.tenantId, id: w.propertyId }, select: { listingAccessAt: true } }),
    ]);
    const problems = publishProblems({ state: p.state, worldStatus: w.status, environment: w.environment, zoneStatus: zone?.status ?? null, propertyApproved: !!property?.listingAccessAt });
    if (problems.length) throw new VirtualConflictError(problems.join(" "));
    const item = await tx.inventoryItem.create({
      data: { tenantId: w.tenantId, propertyId: w.propertyId, kind: VIRTUAL_PLACEMENT_KIND, categories: [], active: true, ...itemFields(p, w) },
      select: { id: true },
    });
    const next = await tx.virtualPlacement.update({ /* tenant-scope: the placement found above through its world. */ where: { id: p.id }, data: { state: "AVAILABLE", inventoryItemId: item.id }, select: PLACEMENT });
    await audit(tx, actor, AUDIT_ACTIONS.virtual.placementPublish, "VirtualPlacement", p.id, { before: { state: p.state }, after: { state: "AVAILABLE", inventoryItemId: item.id, priceCents: p.rackPriceCents } });
    return { placement: viewPlacement(next), inventoryItemId: item.id };
  });
}

async function retireInside(tx: Tx, p: { id: string; inventoryItemId: string | null }, _now: Date) {
  await tx.virtualPlacement.update({ /* tenant-scope: a placement found through its world by the caller. */ where: { id: p.id }, data: { state: "RETIRED" } });
  /* tenant-scope: the placement's own item, linked by its unique id. */
  if (p.inventoryItemId) await tx.inventoryItem.update({ where: { id: p.inventoryItemId }, data: { active: false, version: { increment: 1 } } });
}

/** POST /virtual/placements/:placementId/retire — off sale for good; its inventory item is switched off; its ID is never reused. */
export async function retirePlacement(actor: Actor, placementId: string, now = new Date()) {
  assertTenantWide(actor, "virtualWorld", "write");
  return prisma.$transaction(async (tx) => {
    const { p } = await placementFor(tx, actor, placementId, "write");
    if (p.state === "RETIRED") throw new VirtualConflictError("It is already retired.");
    const ahead = await futureBookings(tx, p.tenantId, [p.id], now);
    if (ahead) throw new VirtualConflictError(`It has ${ahead} booked window(s) still to come — release them, or cancel their campaigns, first.`);
    await retireInside(tx, p, now);
    await audit(tx, actor, AUDIT_ACTIONS.virtual.placementRetire, "VirtualPlacement", p.id, { before: { state: p.state }, after: { state: "RETIRED" } });
    const next = await tx.virtualPlacement.findFirstOrThrow({ where: { tenantId: p.tenantId, id: p.id }, select: PLACEMENT });
    return { placement: viewPlacement(next) };
  });
}
