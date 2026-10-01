/**
 * Inventory — 2S2-BE-01 (an athlete's own NIL items) and the team half of
 * 2S2-BE-04 (a team's property inventory).
 *
 * "External athletes define their own NIL items, rates, availability,
 * categories, restrictions and package rules — rather than BTG setting rates
 * for them as in Phase 1." So the OWNER prices an item, and the owner is
 * always the caller: an athlete's items belong to their own Athlete row, a
 * team manager's to their own Property. Nobody names an owner in a request,
 * so nobody can create or reprice an item for someone else. BTG reads the
 * inventory of the tenants it operates (the `operated` scope) and does not
 * write it.
 *
 * Price and quantity are frozen while a listing of the item is PUBLISHED —
 * pause the listing first, so an open cart never changes under a buyer
 * (state machines §2). Every price or quantity change bumps `version`.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { assertMayCommit } from "./guardian-acts";
import { BRAND_CATEGORIES } from "./brand-categories";

export const INVENTORY_KINDS = ["SOCIAL_POST", "VIDEO", "APPEARANCE", "AUTOGRAPH", "CAMP", "SIGNAGE", "TICKETS", "OTHER", "PACKAGE"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

/**
 * `exclusive`: one buyer per period — a second commitment on overlapping
 * dates is refused (2S3-BE-03). `requiresApproval`: an order that buys it
 * waits for BTG (2S4-BE-05).
 */
export type PackageRules = { minQuantity?: number; maxQuantity?: number; bundleOnly?: boolean; exclusive?: boolean; requiresApproval?: boolean };

/** 2S3-BE-02 — what one unit of a PACKAGE contains. */
export type ComponentInput = { itemId: string; quantity: number };
export const MAX_COMPONENTS = 10;

export type InventoryInput = {
  title: string;
  description?: string | null;
  kind: InventoryKind;
  jobId?: string | null;
  priceCents: number;
  quantity?: number | null;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
  categories?: string[];
  restrictedCategories?: string[];
  packageRules?: PackageRules;
  active?: boolean;
  /** Required for a PACKAGE, refused for anything else. Set once, at creation. */
  components?: ComponentInput[];
};

export class InventoryError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "InventoryError";
    this.status = status;
  }
}

const SELECT = {
  id: true, athleteId: true, propertyId: true, jobId: true, title: true, description: true, kind: true,
  priceCents: true, quantity: true, availableFrom: true, availableUntil: true, categories: true,
  restrictedCategories: true, packageRules: true, active: true, version: true, createdAt: true, updatedAt: true,
  components: { select: { quantity: true, component: { select: { id: true, title: true, kind: true, priceCents: true } } } },
} as const;

const CATEGORY_SET: ReadonlySet<string> = new Set(BRAND_CATEGORIES);

/** The rules a single item must satisfy, whoever owns it. Pure. */
export function inventoryProblems(i: {
  priceCents: number; quantity?: number | null; availableFrom?: Date | null; availableUntil?: Date | null;
  categories?: string[]; restrictedCategories?: string[]; packageRules?: PackageRules;
}): string[] {
  const out: string[] = [];
  if (!Number.isInteger(i.priceCents) || i.priceCents < 100) out.push("priceCents: at least $1.00, in whole cents");
  if (i.quantity != null && (!Number.isInteger(i.quantity) || i.quantity < 0)) out.push("quantity: a whole number, 0 or more");
  if (i.availableFrom && i.availableUntil && i.availableUntil < i.availableFrom) out.push("availableUntil: before availableFrom");
  for (const c of [...(i.categories ?? []), ...(i.restrictedCategories ?? [])]) {
    if (!CATEGORY_SET.has(c)) out.push(`category: unknown ${c}`);
  }
  const both = (i.categories ?? []).filter((c) => (i.restrictedCategories ?? []).includes(c));
  if (both.length) out.push(`categories: ${both.join(", ")} both offered and restricted`);
  const r = i.packageRules ?? {};
  if (r.minQuantity != null && r.maxQuantity != null && r.maxQuantity < r.minQuantity) out.push("packageRules: maxQuantity below minQuantity");
  if (r.maxQuantity != null && i.quantity != null && r.maxQuantity > i.quantity) out.push("packageRules: maxQuantity above the quantity available");
  return out;
}

function assertValid(i: Parameters<typeof inventoryProblems>[0]) {
  const problems = inventoryProblems(i);
  if (problems.length) throw new InventoryError(`Inventory item: ${problems.join("; ")}.`);
}

/** Who owns what this caller creates — always themselves. */
async function ownerFor(tx: Prisma.TransactionClient, actor: Actor): Promise<{ athleteId: string } | { propertyId: string }> {
  if (actor.athleteId && actor.roles.includes("ATHLETE")) {
    const athlete = await tx.athlete.findFirst({
      where: { tenantId: actor.tenantId, id: actor.athleteId }, select: { state: true },
    });
    if (!athlete || !["APPROVED", "ACTIVE"].includes(athlete.state)) {
      throw new InventoryError("Only an approved athlete can sell inventory.", 409);
    }
    return { athleteId: actor.athleteId };
  }
  if (actor.propertyId && actor.roles.includes("PROPERTY_MGR")) {
    const property = await tx.property.findFirst({ where: { tenantId: actor.tenantId, id: actor.propertyId }, select: { id: true } });
    if (property) return { propertyId: property.id };
  }
  throw new ForbiddenError("inventoryItem", "write");
}

async function assertJob(tx: Prisma.TransactionClient, jobId: string | null | undefined) {
  if (!jobId) return;
  const job = await tx.nilJob.findFirst({
    /* tenant-scope: the NIL job catalogue is BTG's published list, read across tenants by design (matrix §6 "catalog"). */
    where: { id: jobId },
    select: { id: true },
  });
  if (!job) throw new InventoryError(`No catalogue job ${jobId}.`);
}

export async function listInventory(actor: Actor) {
  return prisma.inventoryItem.findMany({
    where: whereFor(actor, "inventoryItem", "read"), select: SELECT, orderBy: { createdAt: "asc" },
  });
}

export async function getInventoryItem(actor: Actor, id: string) {
  const item = await prisma.inventoryItem.findFirst({ where: { ...whereFor(actor, "inventoryItem", "read"), id }, select: SELECT });
  if (!item) throw new ForbiddenError("inventoryItem", "read");
  return item;
}

/**
 * 2S3-BE-02 — a package is bundled from the owner's own items (a team's: the
 * team's and its roster athletes'). No package inside a package, no item
 * twice, at least one unit each.
 */
async function assertComponents(
  tx: Prisma.TransactionClient, actor: Actor, owner: { athleteId: string } | { propertyId: string }, input: InventoryInput,
): Promise<ComponentInput[]> {
  const parts = input.components ?? [];
  if (input.kind !== "PACKAGE") {
    if (parts.length) throw new InventoryError("Only a PACKAGE has components.");
    return [];
  }
  if (parts.length < 1 || parts.length > MAX_COMPONENTS) throw new InventoryError(`A package bundles 1 to ${MAX_COMPONENTS} items.`);
  if (new Set(parts.map((p) => p.itemId)).size !== parts.length) throw new InventoryError("A package lists each item once — use its quantity.");
  if (parts.some((p) => !Number.isInteger(p.quantity) || p.quantity < 1)) throw new InventoryError("Each item in a package takes at least one unit.");
  const ownerWhere: Prisma.InventoryItemWhereInput = "athleteId" in owner
    ? { athleteId: owner.athleteId }
    : { OR: [{ propertyId: owner.propertyId }, { athlete: { propertyId: owner.propertyId } }] };
  const found = await tx.inventoryItem.findMany({
    where: { tenantId: actor.tenantId, id: { in: parts.map((p) => p.itemId) }, ...ownerWhere },
    select: { id: true, kind: true },
  });
  if (found.length !== parts.length) throw new ForbiddenError("inventoryItem", "write");
  if (found.some((f) => f.kind === "PACKAGE")) throw new InventoryError("A package cannot contain another package.");
  return parts;
}

export async function createInventoryItem(actor: Actor, input: InventoryInput) {
  assertAllowed(actor, "inventoryItem", "write");
  assertValid(input);
  return prisma.$transaction(async (tx) => {
    /* 2S1-BE-11 / -12 — a minor's items are added by their guardian; none during coming of age. */
    await assertMayCommit(tx, actor, "list");
    const owner = await ownerFor(tx, actor);
    await assertJob(tx, input.jobId);
    const parts = await assertComponents(tx, actor, owner, input);
    const item = await tx.inventoryItem.create({
      data: {
        tenantId: actor.tenantId, ...owner, title: input.title.trim(), description: input.description?.trim() || null,
        kind: input.kind, jobId: input.jobId ?? null, priceCents: input.priceCents, quantity: input.quantity ?? null,
        availableFrom: input.availableFrom ?? null, availableUntil: input.availableUntil ?? null,
        categories: input.categories ?? [], restrictedCategories: input.restrictedCategories ?? [],
        packageRules: (input.packageRules ?? {}) as Prisma.InputJsonValue, active: input.active ?? true,
        components: { create: parts.map((p) => ({ tenantId: actor.tenantId, componentItemId: p.itemId, quantity: p.quantity })) },
      },
      select: SELECT,
    });
    await audit(tx, actor, "inventory.create", "InventoryItem", item.id, {
      after: { ...owner, priceCents: item.priceCents, quantity: item.quantity, kind: item.kind, ...(parts.length ? { components: parts } : {}) },
    });
    return item;
  });
}

export async function updateInventoryItem(actor: Actor, id: string, patch: Partial<InventoryInput>) {
  if (patch.components !== undefined) throw new InventoryError("A package's contents are fixed — create a new package to change them.");
  if (patch.kind !== undefined && patch.kind === "PACKAGE") throw new InventoryError("An item cannot become a package — create one.");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({ where: { ...whereFor(actor, "inventoryItem", "write"), id }, select: SELECT });
    if (!item) throw new ForbiddenError("inventoryItem", "write");
    /* 2S1-BE-11 — pricing a minor's item is their guardian's. */
    await assertMayCommit(tx, actor, "manage");
    const next = {
      priceCents: patch.priceCents ?? item.priceCents,
      quantity: patch.quantity === undefined ? item.quantity : patch.quantity,
      availableFrom: patch.availableFrom === undefined ? item.availableFrom : patch.availableFrom,
      availableUntil: patch.availableUntil === undefined ? item.availableUntil : patch.availableUntil,
      categories: patch.categories ?? item.categories,
      restrictedCategories: patch.restrictedCategories ?? item.restrictedCategories,
      packageRules: patch.packageRules ?? (item.packageRules as PackageRules),
    };
    assertValid(next);
    const repriced = next.priceCents !== item.priceCents || next.quantity !== item.quantity;
    if (repriced) {
      const live = await tx.listing.count({ where: { tenantId: actor.tenantId, inventoryItemId: id, state: "PUBLISHED" } });
      if (live) throw new InventoryError("A published listing shows this price and quantity. Pause the listing first, then change them.", 409);
    }
    if (patch.jobId !== undefined) await assertJob(tx, patch.jobId);
    const updated = await tx.inventoryItem.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.jobId !== undefined ? { jobId: patch.jobId } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...next,
        packageRules: next.packageRules as Prisma.InputJsonValue,
        ...(repriced ? { version: { increment: 1 } } : {}),
      },
      select: SELECT,
    });
    if (repriced) {
      await audit(tx, actor, "inventory.reprice", "InventoryItem", id, {
        before: { priceCents: item.priceCents, quantity: item.quantity, version: item.version },
        after: { priceCents: updated.priceCents, quantity: updated.quantity, version: updated.version },
      });
    }
    return updated;
  });
}
