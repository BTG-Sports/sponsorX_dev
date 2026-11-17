/**
 * The sponsor's shop window — P4-FE-01, §17, §9 screen 4.
 *
 * What a sponsor may browse before asking BTG for anything: the §7 packages
 * and the NIL job catalogue, at SPONSOR prices. Phase 1 is a managed
 * marketplace — this is a catalogue to request from, not a cart.
 *
 * ATHLETE PAY NEVER LEAVES HERE (guide §04, P4-SEC-02). Both reads name their
 * fields, and neither names `baseLow` / `baseHigh` (what the athlete is paid)
 * or anything from `AthleteRate`. The sell floors are internal pricing rules
 * and stay out too. `tests/sponsor-field-authz.test.ts` plants marker values
 * in every pay column and fails if one reaches a sponsor's response.
 *
 * THE TENANT IS THE SELLER. The matrix's `catalog` scope is cross-tenant by
 * design (a published list), but a sponsor buys from the marketplace they
 * belong to, so both reads are narrowed to the actor's own tenant.
 *
 * POL-FE-51 — THE ATHLETE POOL, AS VALUES AND YES / NO ONLY. A sponsor
 * picking a package, a sport and an area needs to know whether BTG could
 * staff it, and which sports and states it can target at all — the drawer
 * offered a fixture list, and a sport no live athlete plays was a certain
 * hold. `listTargeting` answers the distinct sports and state codes of the
 * tenant's ACTIVE athletes; `packageStaffing` answers, per package, whether
 * at least its minimum fit (`athleteFit`, the rule automatic approval holds
 * a brief on). Neither ever answers a name, an id or a count: the athlete
 * pool is BTG's, and a sponsor reads it only as yes / no.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { athleteFit } from "./matching";
import { packageStaffable } from "./brief-auto-rules";

export type CataloguePackage = {
  id: string;
  code: string;
  name: string;
  /** Whole dollars, as the §7 price list is stored — not cents. A brief's
   *  budget IS cents; the conversion is the brief form's job. */
  priceLow: number;
  priceHigh: number;
  athleteCountMin: number;
  athleteCountMax: number;
  lineItems: { jobCode: string; quantityPerAthlete: number }[];
  includes: { kind: string; code: string; quantity?: number }[];
  exclusivity: boolean;
  durationWeeks: number | null;
  /** POL-FE-51 — an athlete campaign package, or a SponsorX NEXT magazine ad
   *  (no athlete job lines; students and the edition deliver it). */
  kind: PackageKind;
};

export type PackageKind = "ATHLETE" | "NEXT_AD";

/** POL-FE-51 — the sponsor read adds whether BTG could staff it now: null
 *  for a package no athlete staffs (a NEXT ad). */
export type SponsorCataloguePackage = CataloguePackage & { staffable: boolean | null };

export type CatalogueJob = {
  id: string;
  name: string;
  /** Sponsor price band, whole dollars (the NIL catalogue's unit). */
  sellLow: number;
  sellHigh: number;
};

/** The one select both package reads share — pay columns are absent by
 *  construction, so the public and sponsor views cannot drift apart. */
const PACKAGE_SELECT = {
  id: true, code: true, name: true, priceLow: true, priceHigh: true,
  athleteCountMin: true, athleteCountMax: true, lineItems: true, includes: true,
  exclusivity: true, durationWeeks: true,
} as const;

/** The inventory a NEXT edition sells — what marks a package as a magazine ad. */
const NEXT_INVENTORY = new Set(["AD_SLOT", "PRESENTING"]);

/**
 * POL-FE-51 — an athlete campaign package, or a SponsorX NEXT magazine ad.
 * NEXT products are seeded with a `NEXT-` code and no athlete job lines
 * (sponsor-packages.ts); a package with no job lines that sells an ad slot
 * or the presenting line is one too, whatever its code. Pure.
 */
export function packageKind(p: { code: string; lineItems: readonly unknown[]; includes: readonly { kind: string }[] }): PackageKind {
  if (p.code.startsWith("NEXT-")) return "NEXT_AD";
  return p.lineItems.length === 0 && p.includes.some((i) => NEXT_INVENTORY.has(i.kind)) ? "NEXT_AD" : "ATHLETE";
}

function toPackage(
  r: { lineItems: unknown; includes: unknown } & Omit<CataloguePackage, "lineItems" | "includes" | "kind">,
): CataloguePackage {
  const lineItems = (r.lineItems as CataloguePackage["lineItems"]) ?? [];
  const includes = (r.includes as CataloguePackage["includes"] | null) ?? [];
  return { ...r, lineItems, includes, kind: packageKind({ code: r.code, lineItems, includes }) };
}

export async function listPackages(actor: Actor): Promise<SponsorCataloguePackage[]> {
  const rows = await prisma.sponsorPackage.findMany({
    where: { ...whereFor(actor, "sponsorPackage", "read"), tenantId: actor.tenantId, active: true },
    select: PACKAGE_SELECT,
    orderBy: { priceLow: "asc" },
  });
  const packages = rows.map(toPackage);
  /* No targeting yet: "could BTG staff this in any sport and area?" */
  const staffable = await staffableWith(actor, packages, { sports: [], stateCodes: [] });
  return packages.map((p) => ({ ...p, staffable: staffable.get(p.id) ?? null }));
}

/** A sponsor's targeting, as the brief will carry it. */
export type StaffingTarget = {
  sports: readonly string[];
  stateCodes: readonly string[];
  /** POL-BE-107 — only athletes in this country; absent means any. */
  countryCode?: string | null;
};

/**
 * POL-FE-51 — the categories an athlete must not be restricted for: the
 * caller's sponsor's own (automatic approval adds the brief's too, which a
 * catalogue read has none of). BTG staff browsing have none.
 */
async function sponsorCategories(actor: Actor): Promise<string[]> {
  if (!actor.sponsorId) return [];
  const s = await prisma.sponsor.findFirst({
    /* tenant-scope: the caller's own sponsor, in the caller's own tenant. */
    where: { id: actor.sponsorId, tenantId: actor.tenantId },
    select: { categories: true },
  });
  return (s?.categories ?? []).filter(Boolean);
}

/** One count of athletes who fit, then a yes / no per package. */
async function staffableWith(
  actor: Actor,
  packages: readonly { id: string; lineItems: unknown; athleteCountMin: number }[],
  target: StaffingTarget,
): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  if (!packages.some((p) => packageStaffable(p, 0) !== null)) {
    for (const p of packages) out.set(p.id, null);
    return out;
  }
  const fitCount = await prisma.athlete.count({
    /* tenant-scope: pinned to the caller's own tenant; athleteFit is the
       matching rule. Counted for the yes / no below and never returned. */
    where: {
      tenantId: actor.tenantId,
      ...athleteFit(target.sports.filter(Boolean), target.stateCodes.filter(Boolean), await sponsorCategories(actor), target.countryCode),
    },
  });
  for (const p of packages) out.set(p.id, packageStaffable(p, fitCount));
  return out;
}

/**
 * GET /catalogue/staffing — POL-FE-51: for the sponsor's targeting (a sport,
 * state codes; either may be empty for "any"), whether BTG could staff each
 * package on sale now. `{ id, staffable }` per package — never a count.
 */
export async function packageStaffing(actor: Actor, target: StaffingTarget): Promise<{ id: string; staffable: boolean | null }[]> {
  const rows = await prisma.sponsorPackage.findMany({
    where: { ...whereFor(actor, "sponsorPackage", "read"), tenantId: actor.tenantId, active: true },
    select: { id: true, lineItems: true, athleteCountMin: true },
    orderBy: { priceLow: "asc" },
  });
  const staffable = await staffableWith(actor, rows, target);
  return rows.map((r) => ({ id: r.id, staffable: staffable.get(r.id) ?? null }));
}

/**
 * GET /catalogue/targeting — POL-FE-51: the sports and US state codes a brief
 * can target, read from the tenant's ACTIVE athletes (the only ones
 * `athleteFit` counts), so the drawer offers nothing no athlete could fit.
 * POL-BE-107 adds the countries they are in; the states are those of US
 * athletes only, since a brief names states only when its country is US.
 * Distinct VALUES only, sorted — no names, no ids, no counts. Gated on the
 * package catalogue: whoever may browse packages may ask what they target.
 */
export async function listTargeting(actor: Actor): Promise<{ sports: string[]; countryCodes: string[]; stateCodes: string[] }> {
  assertAllowed(actor, "sponsorPackage", "read");
  const [sports, countries, states] = await Promise.all([
    prisma.athlete.findMany({
      /* tenant-scope: pinned to the caller's own tenant; values only. */
      where: { tenantId: actor.tenantId, state: "ACTIVE" },
      select: { sport: true },
      distinct: ["sport"],
    }),
    prisma.athlete.findMany({
      /* tenant-scope: pinned to the caller's own tenant; values only. */
      where: { tenantId: actor.tenantId, state: "ACTIVE" },
      select: { countryCode: true },
      distinct: ["countryCode"],
    }),
    prisma.athlete.findMany({
      /* tenant-scope: pinned to the caller's own tenant; values only. */
      where: { tenantId: actor.tenantId, state: "ACTIVE", countryCode: "US", stateCode: { not: null } },
      select: { stateCode: true },
      distinct: ["stateCode"],
    }),
  ]);
  const values = (xs: (string | null)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    sports: values(sports.map((s) => s.sport)),
    countryCodes: values(countries.map((c) => (c.countryCode ?? "").toUpperCase())),
    stateCodes: values(states.map((s) => s.stateCode)),
  };
}

/**
 * The §7 price list with no caller at all — P3-FE-05, the public /packages
 * page. The same select as the sponsor read, on purpose: sponsor prices are
 * marketing information, athlete pay is not, and one shared PACKAGE_SELECT
 * means there is no second field list to get wrong. The tenant is BTG's own
 * (the PUBLIC_INTAKE_TENANT_ID the public intake also writes to), because a
 * visitor has none.
 */
export async function listPublicPackages(tenantId: string): Promise<CataloguePackage[]> {
  const rows = await prisma.sponsorPackage.findMany({
    /* tenant-scope: public read, pinned to the configured public tenant. */
    where: { tenantId, active: true },
    select: PACKAGE_SELECT,
    orderBy: { priceLow: "asc" },
  });
  return rows.map(toPackage);
}

export async function listJobs(actor: Actor): Promise<CatalogueJob[]> {
  return prisma.nilJob.findMany({
    where: { ...whereFor(actor, "nilJob", "read"), tenantId: actor.tenantId },
    select: { id: true, name: true, sellLow: true, sellHigh: true },
    orderBy: { id: "asc" },
  });
}
