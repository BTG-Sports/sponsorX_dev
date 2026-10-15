/**
 * A team's or school's intelligence hub — 3S7-BE-02 (documentation/SponsorX-Hub-Intelligence.md),
 * read by 3S7-FE-02 (/property/intelligence; contract: frontend/src/lib/property-intelligence-live.ts).
 *
 * SCOPE. Only the caller's own property (Actor.propertyId), never one named
 * in the request (`propertyIntelligence`, RBAC matrix §32).
 *
 * ITS INVENTORY is what it sells: the items it owns, and its roster
 * athletes' items. The CPM engine (3S2-BE-02) prices athletes' items, so
 * the suggested prices are the roster's.
 *
 *   rates          each priced item's latest stored suggestion (3S2-BE-03),
 *                  with its three largest factors;
 *   opportunity    active items with nothing sold in 12 months, at their
 *                  listed price — an estimate, and labelled one;
 *   sellThrough    per format: active items, and those with a sale in 12
 *                  months;
 *   categoryFit    per brand category: a base, plus items listed for it,
 *                  plus sales to sponsors in it. A category restricted for
 *                  the property fits 0; so does an age-gated one for a
 *                  school, flagged with the reason;
 *   quality        0–100, the average of: listings complete (a description
 *                  and a category), on sale (a published listing) and,
 *                  once there are orders, orders fulfilled.
 */
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { assertAllowed, whereFor } from "../auth/scope";
import { prisma } from "../db/client";
import { BRAND_CATEGORIES, SENSITIVE_CATEGORIES } from "./brand-categories";
import { assertFeature } from "./model-registry";

export const PROPERTY_INTEL_VERSION = "property-intel@1.0.0";
/** Sales in this many days count towards sell-through, opportunity and category fit. */
export const SALES_WINDOW_DAYS = 365;
/** Category fit: the base, items listed for the category, and sales to sponsors in it (full at FIT_FULL_SALES). */
export const FIT_BASE = 0.4;
export const FIT_LISTED = 0.3;
export const FIT_SOLD = 0.3;
export const FIT_FULL_SALES = 3;

const SOLD_STATES = ["APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"] as const;
const PAST_PAYMENT = ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "REFUNDED"];
const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

type Factor = { label: string; effect: number };

/** A category's fit for this property, and why. */
export function categoryFit(c: { category: string; school: boolean; restricted: boolean; listed: boolean; salesToCategory: number }): { fit: number; reason: string } {
  if (c.restricted) return { fit: 0, reason: "Restricted for this property." };
  if (c.school && (SENSITIVE_CATEGORIES as readonly string[]).includes(c.category)) return { fit: 0, reason: "Age-gated: never offered for a school." };
  const sold = Math.min(1, c.salesToCategory / FIT_FULL_SALES);
  const fit = round2(FIT_BASE + (c.listed ? FIT_LISTED : 0) + FIT_SOLD * sold);
  const why = [
    c.listed ? "you list items for it" : "nothing is listed for it yet",
    c.salesToCategory ? `${c.salesToCategory} sale(s) to its brands in the last 12 months` : "no sales to its brands yet",
  ];
  return { fit, reason: `${why[0][0]!.toUpperCase()}${why[0].slice(1)}; ${why[1]}.` };
}

/** GET /intelligence/property — the caller's own property only. */
export async function propertyIntelligence(actor: Actor, now = new Date()) {
  const scope = assertAllowed(actor, "propertyIntelligence", "read");
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("propertyIntelligence", "read");
  const property = await prisma.property.findFirst({
    where: { AND: [whereFor(actor, "property", "read"), { id: actor.propertyId }] },
    select: { id: true, tenantId: true, kind: true },
  });
  if (!property) throw new ForbiddenError("propertyIntelligence", "read");
  await assertFeature(prisma, property.tenantId, "propertyHub");
  const tenantId = property.tenantId;
  const since = new Date(now.getTime() - SALES_WINDOW_DAYS * 86_400_000);
  const school = property.kind === "SCHOOL";

  const items = await prisma.inventoryItem.findMany({
    /* tenant-scope: tenantId — the property's own tenant (found through whereFor above); its own items and its roster's. */
    where: { tenantId, active: true, OR: [{ propertyId: property.id }, { athlete: { propertyId: property.id } }] },
    select: { id: true, title: true, kind: true, priceCents: true, description: true, categories: true, listings: { select: { state: true } } },
    orderBy: { id: "asc" },
  });
  const ids = items.map((i) => i.id);

  const [recs, lines, restrictions] = await Promise.all([
    ids.length ? prisma.$queryRawUnsafe<Array<{ inventoryId: string; modelVersion: string; confidence: number; currentCpmCents: number | null; recommendedCpmCents: number; factors: Factor[]; computedAt: Date }>>(
      /* tenant-scope: explicit — the property's tenant's latest suggestion per item. */
      `SELECT DISTINCT ON ("inventoryId") "inventoryId", "modelVersion", confidence, "currentCpmCents", "recommendedCpmCents", factors, "computedAt"
         FROM "PricingRecommendation" WHERE "tenantId" = $1 AND "inventoryId" = ANY($2::text[]) ORDER BY "inventoryId", day DESC`,
      tenantId, ids,
    ) : Promise.resolve([]),
    ids.length ? prisma.marketplaceOrderLine.findMany({
      /* tenant-scope: itemTenantId — lines selling the property's own tenant's items, wherever the buyer's order lives. */
      where: { itemTenantId: tenantId, inventoryItemId: { in: ids }, order: { state: { in: [...SOLD_STATES, "REFUNDED"] }, createdAt: { gte: since } } },
      select: { inventoryItemId: true, order: { select: { state: true, sponsorId: true, tenantId: true } } },
    }) : Promise.resolve([]),
    prisma.brandRestriction.findMany({
      /* tenant-scope: tenantId — the property's own restrictions, live now. */
      where: { tenantId, propertyId: property.id, OR: [{ endsOn: null }, { endsOn: { gte: now } }], AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: now } }] }] },
      select: { category: true },
    }),
  ]);
  const soldLines = lines.filter((l) => (SOLD_STATES as readonly string[]).includes(l.order.state));
  const soldItems = new Set(soldLines.map((l) => l.inventoryItemId));
  const buyers = [...new Map(soldLines.map((l) => [l.order.sponsorId, l.order.tenantId])).entries()];
  const sponsorCats = new Map((buyers.length ? await prisma.sponsor.findMany({
    /* tenant-scope: the buying sponsors named on the property's own sold lines, each in its order's tenant. */
    where: { OR: buyers.map(([id, t]) => ({ id, tenantId: t })) }, select: { id: true, categories: true },
  }) : []).map((s) => [s.id, s.categories]));

  /* ── suggested prices ── */
  const itemBy = new Map(items.map((i) => [i.id, i]));
  const rates = recs.filter((r) => itemBy.has(r.inventoryId)).map((r) => ({
    inventoryId: r.inventoryId, name: itemBy.get(r.inventoryId)!.title, format: itemBy.get(r.inventoryId)!.kind,
    currentCpmCents: r.currentCpmCents, recommendedCpmCents: r.recommendedCpmCents,
    stamp: { modelVersion: r.modelVersion, confidence: r.confidence, computedAt: r.computedAt.toISOString() },
    topFactors: [...(r.factors ?? [])].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.label.localeCompare(b.label)).slice(0, 3).map((f) => ({ label: f.label, effect: f.effect })),
  }));

  /* ── open opportunity and sell-through ── */
  const unsold = items.filter((i) => !soldItems.has(i.id));
  const byFormat = new Map<string, { sold: number; listed: number }>();
  for (const i of items) {
    const f = byFormat.get(i.kind) ?? { sold: 0, listed: 0 };
    f.listed += 1;
    if (soldItems.has(i.id)) f.sold += 1;
    byFormat.set(i.kind, f);
  }

  /* ── category fit ── */
  const restricted = new Set(restrictions.map((r) => r.category));
  const listedFor = new Set(items.flatMap((i) => i.categories));
  const salesTo = new Map<string, number>();
  for (const l of soldLines) for (const c of sponsorCats.get(l.order.sponsorId) ?? []) salesTo.set(c, (salesTo.get(c) ?? 0) + 1);
  const categories = BRAND_CATEGORIES.map((category) => ({
    category, ...categoryFit({ category, school, restricted: restricted.has(category), listed: listedFor.has(category), salesToCategory: salesTo.get(category) ?? 0 }),
  })).sort((a, b) => b.fit - a.fit || a.category.localeCompare(b.category));

  /* ── quality ── */
  const complete = items.filter((i) => !!i.description?.trim() && i.categories.length > 0).length;
  const onSale = items.filter((i) => i.listings.some((l) => l.state === "PUBLISHED")).length;
  const settled = lines.filter((l) => PAST_PAYMENT.includes(l.order.state));
  const fulfilled = settled.filter((l) => l.order.state === "FULFILLED" || l.order.state === "CLOSED").length;
  const components = [
    { label: "Listings complete", score: pct(complete, items.length), detail: `${complete} of ${items.length} item(s) have a description and a category.` },
    { label: "On sale", score: pct(onSale, items.length), detail: `${onSale} of ${items.length} item(s) have a published listing.` },
    ...(settled.length ? [{ label: "Orders fulfilled", score: pct(fulfilled, settled.length), detail: `${fulfilled} of ${settled.length} paid order line(s) delivered in the last 12 months.` }] : []),
  ];
  const stampAt = now.toISOString();

  return {
    asOf: stampAt,
    rates,
    opportunity: { openValueCents: unsold.reduce((t, i) => t + i.priceCents, 0), unsoldItems: unsold.length, provenance: "ESTIMATED" as const },
    sellThrough: [...byFormat.entries()].map(([format, f]) => ({ format, sold: f.sold, listed: f.listed, rate: f.listed > 0 ? round2(f.sold / f.listed) : null }))
      .sort((a, b) => a.format.localeCompare(b.format)),
    categoryFit: { stamp: { modelVersion: PROPERTY_INTEL_VERSION, confidence: round2(Math.min(1, 0.3 + soldLines.length / 10)), computedAt: stampAt }, categories },
    quality: {
      score: items.length ? Math.round(components.reduce((t, c) => t + c.score, 0) / components.length) : 0,
      components,
      stamp: { modelVersion: PROPERTY_INTEL_VERSION, confidence: settled.length ? 0.8 : 0.5, computedAt: stampAt },
    },
  };
}
