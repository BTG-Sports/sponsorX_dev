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
import { clampPage, pageInfo, type PageRequest } from "../lib/paging";

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

/** The caller's catalogue: its scope check, its restricted categories (sponsors
 *  only), and the WHERE those two facts admit — everything but the caller's
 *  own filters, so both the capped read and the paged read share it. */
async function catalogueScope(actor: Actor, now: Date): Promise<{ categories: string[]; where: Prisma.ListingWhereInput[] }> {
  const scope = assertAllowed(actor, "listing", "read");
  if (scope !== "catalog" && scope !== "operated" && scope !== "any") throw new ForbiddenError("listing", "read");

  /* The sponsor's categories: what it may not be sold, today. */
  let categories: string[] = [];
  if (scope === "catalog") {
    if (!actor.sponsorId) throw new ForbiddenError("listing", "read");
    const sponsor = await prisma.sponsor.findFirst({ where: { tenantId: actor.tenantId, id: actor.sponsorId }, select: { categories: true } });
    categories = sponsor?.categories ?? [];
  }

  const where: Prisma.ListingWhereInput[] = [
    whereFor(actor, "listing", "read"), live(now),
    ...(categories.length ? [{ item: { NOT: { restrictedCategories: { hasSome: categories } } } }] : []),
  ];
  return { categories, where };
}

type Restrictable = { id: string; tenantId: string; item: { athleteId: string | null; propertyId: string | null; athlete: { propertyId: string | null } | null } };

/** The owners' restrictions in force now, for this sponsor — one query for
 *  whatever rows were already admitted by the catalogue scope. */
async function hiddenIds(rows: Restrictable[], categories: string[], now: Date): Promise<Set<string>> {
  if (!categories.length || !rows.length) return new Set();
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
  return new Set(rows.filter((row) => blocked.some((b) =>
    (b.athleteId && b.athleteId === row.item.athleteId)
    || (b.propertyId && (b.propertyId === row.item.propertyId || b.propertyId === row.item.athlete?.propertyId)))).map((r) => r.id));
}

function toResult(r: Prisma.ListingGetPayload<{ select: typeof SELECT }>) {
  return {
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
  };
}

export async function searchMarketplace(actor: Actor, f: SearchFilters = {}) {
  const now = new Date();
  const { categories, where } = await catalogueScope(actor, now);

  const rows = await prisma.listing.findMany({
    /* tenant-scope: whereFor(actor, "listing", "read") leads `where` (catalogueScope). */
    where: { AND: [...where, ...filtersWhere(f)] },
    select: SELECT,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: Math.min(Math.max(f.limit ?? 50, 1), 100),
  });

  const hidden = await hiddenIds(rows, categories, now);
  return rows.filter((r) => !hidden.has(r.id)).map(toResult);
}

const THIN = { id: true, tenantId: true, item: { select: { athleteId: true, propertyId: true, athlete: { select: { propertyId: true } } } } } as const;

/** P1-ART-23 — the shop, server-paged: the visible ids are counted and sliced
 *  in order, then only the page's rows are read in full. */
export async function searchMarketplacePage(actor: Actor, f: SearchFilters, req: PageRequest) {
  const now = new Date();
  const { categories, where } = await catalogueScope(actor, now);
  const order = [{ publishedAt: "desc" as const }, { id: "asc" as const }];
  const thin = await prisma.listing.findMany({
    /* tenant-scope: whereFor(actor, "listing", "read") leads `where` (catalogueScope). */
    where: { AND: [...where, ...filtersWhere(f)] }, select: THIN, orderBy: order,
  });
  const hidden = await hiddenIds(thin, categories, now);
  const visible = thin.filter((r) => !hidden.has(r.id)).map((r) => r.id);
  const at = clampPage(req, visible.length);
  const ids = visible.slice(at.skip, at.skip + at.take);
  const rows = ids.length
    ? await prisma.listing.findMany({
        /* tenant-scope: ids admitted by the scoped read above. */
        where: { id: { in: ids } }, select: SELECT,
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { results: ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map(toResult), page: pageInfo(at, visible.length) };
}
