/**
 * Marketplace search — 2S3-BE-04.
 *
 * "Sponsors browse what is available to them. Visibility rules mean two
 * sponsors see different catalogues." Done when: "Search returns only
 * inventory visible to the requesting sponsor and tenant."
 *
 * VISIBLE, for a sponsor, is the listing scope `catalog` (scope.ts): a
 * PUBLISHED, PUBLIC listing whose publish time has come, of an item on sale,
 * from a property whose listing access stands (or, 2S3-BE-05, an athlete
 * with no team who is still approved), in the sponsor's own
 * marketplace — its tenant and the tenants its tenant operates. Then, per
 * sponsor: nothing whose owner will not sell to the sponsor's categories
 * today (the item's restricted categories, and the owner's restrictions in
 * force now). That is why two sponsors see different catalogues.
 *
 * BTG staff search the tenants they operate through the same live filter, so
 * the console shows what a buyer sees. Nobody else searches.
 *
 * The result names an athlete by display name, sport and position only —
 * never a legal name, an address or a contact.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { overlaps } from "./restrictions";
import { sellerCanSell } from "./listing-rules";

export type SearchFilters = {
  q?: string; kind?: string; category?: string; sport?: string; stateCode?: string;
  minPrice?: number; maxPrice?: number; availableFrom?: Date; availableUntil?: Date; limit?: number;
};

const SELECT = {
  id: true, title: true, description: true, publishedAt: true, tenantId: true,
  property: { select: { id: true, name: true, kind: true, stateCode: true, city: true } },
  sellerAthleteId: true,
  item: {
    select: {
      id: true, kind: true, priceCents: true, quantity: true, availableFrom: true, availableUntil: true, categories: true,
      restrictedCategories: true, packageRules: true, athleteId: true, propertyId: true,
      athlete: { select: { displayName: true, sport: true, position: true, propertyId: true, stateCode: true } },
    },
  },
} as const;

/** Always applied, whoever searches — search shows only what a buyer can buy. */
function live(now: Date): Prisma.ListingWhereInput {
  return {
    state: "PUBLISHED", visibility: "PUBLIC", item: { active: true },
    AND: [sellerCanSell(), { OR: [{ publishAt: null }, { publishAt: { lte: now } }] }],
  };
}

function filtersWhere(f: SearchFilters): Prisma.ListingWhereInput[] {
  const and: Prisma.ListingWhereInput[] = [];
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  }
  if (f.kind) and.push({ item: { kind: f.kind } });
  if (f.category) and.push({ item: { categories: { has: f.category } } });
  if (f.sport) and.push({ item: { athlete: { sport: { equals: f.sport, mode: "insensitive" } } } });
  /* An independent athlete's listing has no property: its state is the athlete's (2S3-BE-05). */
  if (f.stateCode) and.push({ OR: [{ property: { stateCode: f.stateCode } }, { propertyId: null, item: { athlete: { stateCode: f.stateCode } } }] });
  if (f.minPrice != null) and.push({ item: { priceCents: { gte: f.minPrice } } });
  if (f.maxPrice != null) and.push({ item: { priceCents: { lte: f.maxPrice } } });
  if (f.availableFrom) and.push({ item: { OR: [{ availableUntil: null }, { availableUntil: { gte: f.availableFrom } }] } });
  if (f.availableUntil) and.push({ item: { OR: [{ availableFrom: null }, { availableFrom: { lte: f.availableUntil } }] } });
  return and;
}

export async function searchMarketplace(actor: Actor, f: SearchFilters = {}) {
  const scope = assertAllowed(actor, "listing", "read");
  if (scope !== "catalog" && scope !== "operated" && scope !== "any") throw new ForbiddenError("listing", "read");
  const now = new Date();

  /* The sponsor's categories: what it may not be sold, today. */
  let categories: string[] = [];
  if (scope === "catalog") {
    if (!actor.sponsorId) throw new ForbiddenError("listing", "read");
    const sponsor = await prisma.sponsor.findFirst({ where: { tenantId: actor.tenantId, id: actor.sponsorId }, select: { categories: true } });
    categories = sponsor?.categories ?? [];
  }

  const rows = await prisma.listing.findMany({
    where: {
      AND: [
        whereFor(actor, "listing", "read"), live(now), ...filtersWhere(f),
        ...(categories.length ? [{ item: { NOT: { restrictedCategories: { hasSome: categories } } } }] : []),
      ],
    },
    select: SELECT,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: Math.min(Math.max(f.limit ?? 50, 1), 100),
  });

  /* The owners' restrictions in force now, for this sponsor — one query for the page. */
  let hidden = new Set<string>();
  if (categories.length && rows.length) {
    const athleteIds = rows.map((r) => r.item.athleteId).filter((x): x is string => Boolean(x));
    const propertyIds = [...new Set(rows.flatMap((r) => [r.item.propertyId, r.item.athlete?.propertyId]).filter((x): x is string => Boolean(x)))];
    const restrictions = await prisma.brandRestriction.findMany({
      where: {
        /* tenant-scope: the owners of listings already admitted by the catalogue scope above; tenants come from those rows. */
        tenantId: { in: [...new Set(rows.map((r) => r.tenantId))] },
        category: { in: categories },
        OR: [{ athleteId: { in: athleteIds } }, { propertyId: { in: propertyIds } }],
      },
      select: { athleteId: true, propertyId: true, startsOn: true, endsOn: true },
    });
    const today = { startsOn: now, endsOn: now };
    const blocked = restrictions.filter((r) => overlaps(r, today));
    hidden = new Set(rows.filter((row) => blocked.some((b) =>
      (b.athleteId && b.athleteId === row.item.athleteId)
      || (b.propertyId && (b.propertyId === row.item.propertyId || b.propertyId === row.item.athlete?.propertyId)))).map((r) => r.id));
  }

  return rows.filter((r) => !hidden.has(r.id)).map((r) => ({
    id: r.id, title: r.title, description: r.description, publishedAt: r.publishedAt,
    property: r.property,
    seller: r.property
      ? { type: "PROPERTY" as const, id: r.property.id, name: r.property.name }
      : { type: "ATHLETE" as const, id: r.sellerAthleteId!, name: r.item.athlete?.displayName ?? "athlete" },
    athlete: r.item.athlete ? { displayName: r.item.athlete.displayName, sport: r.item.athlete.sport, position: r.item.athlete.position } : null,
    item: {
      id: r.item.id, kind: r.item.kind, priceCents: r.item.priceCents, quantity: r.item.quantity,
      availableFrom: r.item.availableFrom, availableUntil: r.item.availableUntil, categories: r.item.categories, packageRules: r.item.packageRules,
    },
  }));
}
