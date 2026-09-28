/**
 * The availability, exclusivity and conflict check — 2S3-BE-03.
 *
 * "One service answers: is this available on these dates, in this quantity,
 * without a category conflict, above the floor price? Every purchase path
 * calls it." Done when: "Availability check correctly rejects date overlap,
 * quantity overrun, category conflict and sub-floor pricing."
 *
 * The purchase paths that exist call it: a cart line on add and on update
 * (cart.ts), and a formal offer on an inventory item when drafted and when
 * accepted (offer.ts). The order and checkout steps (2S4) will call it too;
 * tests/availability-callers.test.ts fails if a cart line is written anywhere
 * that does not go through it.
 *
 * What it counts:
 *   - dates: inside the item's availability window, and — for an EXCLUSIVE
 *     item (packageRules.exclusive: one buyer per period) — clear of every
 *     live commitment on the item;
 *   - quantity: live commitments plus this request within the item's stock,
 *     and within the package's min/max;
 *   - category: the item's own restricted categories, and every restriction
 *     on its owner for these dates (restrictions.ts — the same question the
 *     offer and the invitation ask);
 *   - floor: the price paid per unit is not below the owner's price.
 *
 * It explains every refusal, so the buyer is told what to change.
 */
import type { Prisma } from "../generated/prisma/client";
import { overlaps, restrictionConflicts } from "./restrictions";
import type { PackageRules } from "./inventory";

export type AvailabilityCode =
  | "NOT_LISTED" | "NO_CATEGORY" | "OUT_OF_WINDOW" | "DATE_OVERLAP" | "QUANTITY_OVERRUN" | "PACKAGE_RULE" | "CATEGORY_CONFLICT" | "SUB_FLOOR";
export type AvailabilityReason = { code: AvailabilityCode; message: string };

export class UnavailableError extends Error {
  readonly status = 409;
  readonly reasons: AvailabilityReason[];
  constructor(reasons: AvailabilityReason[]) {
    super(`Not available: ${reasons.map((r) => r.message).join("; ")}.`);
    this.name = "UnavailableError";
    this.reasons = reasons;
  }
}

export type AvailabilityRequest = {
  quantity: number;
  startsOn: Date;
  endsOn: Date;
  /** The buyer's brand categories. */
  categories: readonly string[];
  /** What is paid per unit — the floor is the owner's price. */
  unitPriceCents: number;
  /** A commitment this request itself already holds (re-checking an accepted offer). */
  ignore?: { source: string; sourceId: string };
};

type Item = {
  id: string; tenantId: string; athleteId: string | null; propertyId: string | null; priceCents: number; quantity: number | null;
  availableFrom: Date | null; availableUntil: Date | null; restrictedCategories: string[]; packageRules: unknown; active: boolean;
  title?: string; kind?: string;
};
type Commitment = { quantity: number; startsOn: Date; endsOn: Date };

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The rules over already-loaded facts. Pure. */
export function availabilityReasons(item: Item, commitments: Commitment[], categoryConflicts: string[], r: AvailabilityRequest): AvailabilityReason[] {
  const out: AvailabilityReason[] = [];
  const rules = (item.packageRules ?? {}) as PackageRules;
  if (!item.active) out.push({ code: "NOT_LISTED", message: "the item is not on sale" });
  if (!r.categories.length) out.push({ code: "NO_CATEGORY", message: "the buyer's brand category is not set — BTG sets it before anything can be bought" });

  if (r.endsOn < r.startsOn) out.push({ code: "OUT_OF_WINDOW", message: "the end date is before the start date" });
  if (item.availableFrom && r.startsOn < item.availableFrom) out.push({ code: "OUT_OF_WINDOW", message: `available from ${day(item.availableFrom)}` });
  if (item.availableUntil && r.endsOn > item.availableUntil) out.push({ code: "OUT_OF_WINDOW", message: `available until ${day(item.availableUntil)}` });
  if (rules.exclusive) {
    const clash = commitments.find((c) => overlaps(c, r));
    if (clash) out.push({ code: "DATE_OVERLAP", message: `already committed ${day(clash.startsOn)} – ${day(clash.endsOn)}` });
  }

  if (!Number.isInteger(r.quantity) || r.quantity < 1) out.push({ code: "QUANTITY_OVERRUN", message: "quantity must be at least 1" });
  const committed = commitments.reduce((s, c) => s + c.quantity, 0);
  if (item.quantity !== null && committed + r.quantity > item.quantity) {
    out.push({ code: "QUANTITY_OVERRUN", message: `${Math.max(0, item.quantity - committed)} left of ${item.quantity}` });
  }
  if (rules.maxQuantity != null && r.quantity > rules.maxQuantity) out.push({ code: "QUANTITY_OVERRUN", message: `at most ${rules.maxQuantity} per purchase` });
  if (rules.minQuantity != null && r.quantity < rules.minQuantity) out.push({ code: "PACKAGE_RULE", message: `at least ${rules.minQuantity} per purchase` });

  const itemRestricted = item.restrictedCategories.filter((c) => r.categories.includes(c));
  for (const c of [...new Set([...itemRestricted, ...categoryConflicts])]) out.push({ code: "CATEGORY_CONFLICT", message: `${c} is restricted for these dates` });

  if (r.unitPriceCents < item.priceCents) out.push({ code: "SUB_FLOOR", message: `below the owner's price of $${(item.priceCents / 100).toFixed(2)}` });
  return out;
}

const ITEM_FACTS = {
  id: true, tenantId: true, athleteId: true, propertyId: true, priceCents: true, quantity: true, availableFrom: true,
  availableUntil: true, restrictedCategories: true, packageRules: true, active: true, title: true, kind: true,
} as const;

/** Commitments that still count: not released, and not a hold whose time is up. */
export function liveCommitments(now = new Date()) {
  return { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

async function reasonsForItem(tx: Prisma.TransactionClient, item: Item, r: AvailabilityRequest, now: Date) {
  const commitments = await tx.inventoryCommitment.findMany({
    where: {
      /* tenant-scope: keyed by the item loaded above with its tenantId; a commitment belongs to exactly one item. */
      inventoryItemId: item.id, ...liveCommitments(now),
      ...(r.ignore ? { NOT: { source: r.ignore.source, sourceId: { startsWith: r.ignore.sourceId } } } : {}),
    },
    select: { quantity: true, startsOn: true, endsOn: true },
  });
  const conflicts = await restrictionConflicts(tx, {
    tenantId: item.tenantId, athleteId: item.athleteId, propertyId: item.propertyId, categories: r.categories, startsOn: r.startsOn, endsOn: r.endsOn,
  });
  return availabilityReasons(item, commitments, conflicts.map((c) => c.category), r);
}

/**
 * Load the facts for one inventory item and apply the rules. A PACKAGE is
 * checked as itself AND through every item in it (2S3-BE-02): each unit of
 * the package takes its components' quantities, so a package cannot sell
 * stock its parts do not have, dates they are booked, or to a category any
 * of their owners refuse. The package's price is the floor; its parts are
 * not priced separately.
 */
export async function checkInventoryItem(tx: Prisma.TransactionClient, itemId: string, tenantId: string, r: AvailabilityRequest, now = new Date()) {
  const item = await tx.inventoryItem.findFirst({
    where: { tenantId, id: itemId },
    select: { ...ITEM_FACTS, components: { select: { quantity: true, component: { select: ITEM_FACTS } } } },
  });
  if (!item) return { ok: false as const, reasons: [{ code: "NOT_LISTED" as const, message: "no such item" }], item: null };
  const reasons = await reasonsForItem(tx, item, r, now);
  for (const { quantity, component } of item.components) {
    const inner = await reasonsForItem(tx, component, { ...r, quantity: r.quantity * quantity, unitPriceCents: component.priceCents }, now);
    for (const x of inner) {
      /* The buyer's own category gap is said once, for the package. */
      if (x.code === "NO_CATEGORY") continue;
      reasons.push({ code: x.code, message: `in the package, ${component.title}: ${x.message}` });
    }
  }
  return { ok: reasons.length === 0, reasons, item };
}

/**
 * The stock a purchase of `quantity` units takes: the item itself and, for a
 * package, each component times its quantity. Every commitment writer
 * (reservation, order) expands through here, so a package and its parts can
 * never be held apart.
 */
export async function unitsTaken(tx: Prisma.TransactionClient, itemId: string, tenantId: string, quantity: number) {
  const item = await tx.inventoryItem.findFirst({
    where: { tenantId, id: itemId },
    select: { id: true, tenantId: true, components: { select: { quantity: true, componentItemId: true } } },
  });
  if (!item) return [];
  return [
    { inventoryItemId: item.id, tenantId: item.tenantId, quantity },
    ...item.components.map((c) => ({ inventoryItemId: c.componentItemId, tenantId: item.tenantId, quantity: c.quantity * quantity })),
  ];
}

/**
 * A listing, bought at its own price: the listing must be live, and then the
 * item check applies. The caller has already found the listing through its
 * own scope (a sponsor's catalogue).
 */
export async function checkListing(tx: Prisma.TransactionClient, listingId: string, r: Omit<AvailabilityRequest, "unitPriceCents">) {
  const listing = await tx.listing.findFirst({
    /* tenant-scope: the caller resolved this listing through whereFor(listing, read) — a sponsor's catalogue spans the tenants its own operates. */
    where: { id: listingId },
    select: { id: true, tenantId: true, state: true, visibility: true, publishAt: true, inventoryItemId: true, property: { select: { listingAccessAt: true } }, item: { select: { priceCents: true } } },
  });
  const live = listing && listing.state === "PUBLISHED" && listing.visibility === "PUBLIC" && listing.property.listingAccessAt
    && (!listing.publishAt || listing.publishAt <= new Date());
  if (!listing || !live) {
    return { ok: false as const, reasons: [{ code: "NOT_LISTED" as const, message: "the listing is not live" }], unitPriceCents: 0, itemId: null, itemTenantId: null };
  }
  const unitPriceCents = listing.item.priceCents;
  const result = await checkInventoryItem(tx, listing.inventoryItemId, listing.tenantId, { ...r, unitPriceCents });
  return { ok: result.ok, reasons: result.reasons, unitPriceCents, itemId: listing.inventoryItemId, itemTenantId: listing.tenantId };
}
