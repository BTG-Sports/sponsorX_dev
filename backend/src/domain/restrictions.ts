/**
 * Brand restrictions — 2S2-BE-02.
 *
 * "Extends Phase 1's restriction list into a first-class table with category,
 * restriction type and date range — it now has to block purchases, not just
 * invitations." Done when: "A restricted category blocks listing purchase and
 * campaign offer for the overlapping date range."
 *
 * ONE QUESTION, ASKED EVERYWHERE: `restrictionConflicts`. It is asked by the
 * availability check (so every purchase path — a cart line today, an order
 * later), by the formal offer when it is drafted and again when it is
 * accepted, and by the Phase 1 invitation, so no road reaches an athlete
 * around it.
 *
 * What counts, for an athlete: their own restrictions, their team's (a
 * league or school rule covers the whole roster), and Phase 1's
 * `restrictedCategories` on their profile, which reads as an open-ended
 * PROHIBITED restriction. A window with a null end is open on that side.
 *
 * EXCLUSIVITY rows are written by an accepted offer with an exclusivity
 * period (offer.ts): the sponsor's categories, from acceptance for N days.
 * They are contractual, so the athlete cannot delete them.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import { BRAND_CATEGORIES } from "./brand-categories";

export const RESTRICTION_TYPES = ["PROHIBITED", "LEAGUE_RULE", "SCHOOL_POLICY", "EXCLUSIVITY"] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];
/** EXCLUSIVITY comes only from an accepted offer. */
export const MANUAL_TYPES = ["PROHIBITED", "LEAGUE_RULE", "SCHOOL_POLICY"] as const;

export type Conflict = { category: string; type: RestrictionType | "PROFILE"; reason: string | null; until: Date | null };

export class RestrictionError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "RestrictionError";
    this.status = status;
  }
}

/** A restricted category meets the buyer — refused, with what and why. */
export class CategoryRestrictedError extends Error {
  readonly status = 409;
  readonly conflicts: Conflict[];
  constructor(conflicts: Conflict[]) {
    super(`Restricted for these dates: ${conflicts.map((c) => `${c.category} (${c.type.toLowerCase().replace("_", " ")}${c.reason ? `: ${c.reason}` : ""})`).join("; ")}.`);
    this.name = "CategoryRestrictedError";
    this.conflicts = conflicts;
  }
}

/** The first and last millisecond of a date's UTC day — windows are whole days. */
export const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayEnd = (d: Date) => new Date(dayStart(d).getTime() + 864e5 - 1);

/**
 * Do two windows overlap? Compared by whole UTC days — two bookings on the
 * same day clash whatever their times — and a null end is open on that side.
 * Pure.
 */
export function overlaps(a: { startsOn: Date | null; endsOn: Date | null }, b: { startsOn: Date; endsOn: Date }): boolean {
  return (a.startsOn === null || dayStart(a.startsOn) <= dayEnd(b.endsOn)) && (a.endsOn === null || dayEnd(a.endsOn) >= dayStart(b.startsOn));
}

/**
 * Every restriction that stops these categories being sold, for these dates,
 * by this athlete or team. Empty means clear.
 */
export async function restrictionConflicts(
  tx: Prisma.TransactionClient,
  q: { tenantId: string; athleteId?: string | null; propertyId?: string | null; categories: readonly string[]; startsOn: Date; endsOn: Date },
): Promise<Conflict[]> {
  if (!q.categories.length) return [];
  const want = new Set(q.categories);
  const owners: Prisma.BrandRestrictionWhereInput[] = [];
  let profile: string[] = [];
  if (q.athleteId) {
    const athlete = await tx.athlete.findFirst({
      where: { tenantId: q.tenantId, id: q.athleteId }, select: { propertyId: true, restrictedCategories: true },
    });
    owners.push({ athleteId: q.athleteId });
    if (athlete?.propertyId) owners.push({ propertyId: athlete.propertyId });
    profile = athlete?.restrictedCategories ?? [];
  }
  if (q.propertyId) owners.push({ propertyId: q.propertyId });
  if (!owners.length) return [];

  const rows = await tx.brandRestriction.findMany({
    where: { tenantId: q.tenantId, OR: owners, category: { in: [...want] } },
    select: { category: true, type: true, reason: true, startsOn: true, endsOn: true },
  });
  const window = { startsOn: q.startsOn, endsOn: q.endsOn };
  const out: Conflict[] = rows
    .filter((r) => overlaps(r, window))
    .map((r) => ({ category: r.category, type: r.type as RestrictionType, reason: r.reason, until: r.endsOn }));
  for (const c of profile) if (want.has(c)) out.push({ category: c, type: "PROFILE", reason: "on the athlete's profile", until: null });
  return out;
}

export async function assertNoRestriction(tx: Prisma.TransactionClient, q: Parameters<typeof restrictionConflicts>[1]) {
  const conflicts = await restrictionConflicts(tx, q);
  if (conflicts.length) throw new CategoryRestrictedError(conflicts);
}

/* ── managing them ──────────────────────────────────────────────────────── */

const SELECT = {
  id: true, athleteId: true, propertyId: true, category: true, type: true, startsOn: true, endsOn: true, reason: true,
  sourceOfferId: true, createdAt: true,
} as const;

export type RestrictionInput = {
  athleteId?: string | null; propertyId?: string | null; category: string;
  type: (typeof MANUAL_TYPES)[number]; startsOn?: Date | null; endsOn?: Date | null; reason?: string | null;
};

export async function listRestrictions(actor: Actor) {
  return prisma.brandRestriction.findMany({ where: whereFor(actor, "brandRestriction", "read"), select: SELECT, orderBy: { createdAt: "asc" } });
}

/** Whose restriction this is — resolved against the caller's own reach, never taken on trust. */
async function resolveOwner(tx: Prisma.TransactionClient, actor: Actor, input: RestrictionInput) {
  const scope = assertAllowed(actor, "brandRestriction", "write");
  if (scope === "own") {
    if (!actor.athleteId || (input.athleteId && input.athleteId !== actor.athleteId) || input.propertyId) throw new ForbiddenError("brandRestriction", "write");
    return { tenantId: actor.tenantId, athleteId: actor.athleteId };
  }
  if (scope === "own-property") {
    if (!actor.propertyId) throw new ForbiddenError("brandRestriction", "write");
    if (!input.athleteId) return { tenantId: actor.tenantId, propertyId: actor.propertyId };
    const onRoster = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: input.athleteId, propertyId: actor.propertyId }, select: { id: true } });
    if (!onRoster) throw new ForbiddenError("brandRestriction", "write");
    return { tenantId: actor.tenantId, athleteId: onRoster.id };
  }
  /* Staff: the owner named in the request, if it is in a tenant they reach. */
  if (Boolean(input.athleteId) === Boolean(input.propertyId)) throw new RestrictionError("Name exactly one of athleteId or propertyId.");
  if (input.athleteId) {
    const a = await tx.athlete.findFirst({
      /* tenant-scope: looked up by id, then admitted only if its tenant is in the caller's reach (inReach). */
      where: { id: input.athleteId },
      select: { id: true, tenantId: true },
    });
    if (!a || !(await inReach(tx, actor, scope, a.tenantId))) throw new ForbiddenError("brandRestriction", "write");
    return { tenantId: a.tenantId, athleteId: a.id };
  }
  const p = await tx.property.findFirst({
    /* tenant-scope: looked up by id, then admitted only if its tenant is in the caller's reach (inReach). */
    where: { id: input.propertyId! },
    select: { id: true, tenantId: true },
  });
  if (!p || !(await inReach(tx, actor, scope, p.tenantId))) throw new ForbiddenError("brandRestriction", "write");
  return { tenantId: p.tenantId, propertyId: p.id };
}

/** any: everywhere; own-tenant: the caller's; operated: the caller's and the tenants it operates. */
async function inReach(tx: Prisma.TransactionClient, actor: Actor, scope: string, tenantId: string): Promise<boolean> {
  if (scope === "any") return true;
  if (tenantId === actor.tenantId) return scope === "own-tenant" || scope === "operated";
  if (scope !== "operated") return false;
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { operatorTenantId: true } });
  return t?.operatorTenantId === actor.tenantId;
}

export async function createRestriction(actor: Actor, input: RestrictionInput) {
  if (!(BRAND_CATEGORIES as readonly string[]).includes(input.category)) throw new RestrictionError(`Unknown category ${input.category}.`);
  if (!(MANUAL_TYPES as readonly string[]).includes(input.type)) throw new RestrictionError("EXCLUSIVITY is written by an accepted offer, not by hand.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw new RestrictionError("endsOn is before startsOn.");
  return prisma.$transaction(async (tx) => {
    const owner = await resolveOwner(tx, actor, input);
    const row = await tx.brandRestriction.create({
      data: {
        ...owner, category: input.category, type: input.type, startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null,
        reason: input.reason?.trim() || null, createdBy: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, "restriction.create", "BrandRestriction", row.id, { after: { ...owner, category: row.category, type: row.type } });
    return row;
  });
}

export async function deleteRestriction(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.brandRestriction.findFirst({ where: { ...whereFor(actor, "brandRestriction", "write"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("brandRestriction", "write");
    if (row.sourceOfferId && scopeFor(actor.roles, "brandRestriction", "write") !== "any") {
      throw new RestrictionError("This exclusivity is part of an accepted offer and cannot be removed.", 409);
    }
    /* tenant-scope: the row loaded above through whereFor(brandRestriction, write). */
    await tx.brandRestriction.delete({ where: { id: row.id } });
    await audit(tx, actor, "restriction.delete", "BrandRestriction", id, { before: { category: row.category, type: row.type } });
    return { id };
  });
}

/** BTG sets a sponsor's brand categories — never the sponsor itself, whose restrictions they decide. */
export async function setSponsorCategories(actor: Actor, sponsorId: string, categories: readonly string[]) {
  assertTenantWide(actor, "sponsor", "write");
  const unknown = categories.filter((c) => !(BRAND_CATEGORIES as readonly string[]).includes(c));
  if (unknown.length) throw new RestrictionError(`Unknown categories: ${unknown.join(", ")}.`);
  return prisma.$transaction(async (tx) => {
    const sponsor = await tx.sponsor.findFirst({ where: { ...whereFor(actor, "sponsor", "write"), id: sponsorId }, select: { id: true, categories: true } });
    if (!sponsor) throw new ForbiddenError("sponsor", "write");
    const updated = await tx.sponsor.update({
      /* tenant-scope: the row loaded above through whereFor(sponsor, write). */
      where: { id: sponsor.id }, data: { categories: [...new Set(categories)] }, select: { id: true, categories: true },
    });
    await audit(tx, actor, "sponsor.setCategories", "Sponsor", sponsorId, { before: { categories: sponsor.categories }, after: { categories: updated.categories } });
    return updated;
  });
}

/** An accepted offer's exclusivity: the sponsor's categories, blocked for N days from acceptance. */
export async function writeExclusivity(
  tx: Prisma.TransactionClient,
  offer: { id: string; tenantId: string; athleteId: string; exclusivityDays: number | null },
  categories: readonly string[],
  acceptedAt: Date,
  sponsorName: string,
) {
  if (!offer.exclusivityDays) return 0;
  const endsOn = new Date(acceptedAt.getTime() + offer.exclusivityDays * 864e5);
  const out = await tx.brandRestriction.createMany({
    data: categories.map((category) => ({
      tenantId: offer.tenantId, athleteId: offer.athleteId, category, type: "EXCLUSIVITY", startsOn: acceptedAt, endsOn,
      reason: `Exclusive to ${sponsorName} (offer ${offer.id})`, sourceOfferId: offer.id,
    })),
  });
  return out.count;
}
