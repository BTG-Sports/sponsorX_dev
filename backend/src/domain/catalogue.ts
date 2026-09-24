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
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { whereFor } from "../auth/scope";

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
};

export type CatalogueJob = {
  id: string;
  name: string;
  /** Sponsor price band, whole dollars (the NIL catalogue's unit). */
  sellLow: number;
  sellHigh: number;
};

export async function listPackages(actor: Actor): Promise<CataloguePackage[]> {
  const rows = await prisma.sponsorPackage.findMany({
    where: { ...whereFor(actor, "sponsorPackage", "read"), tenantId: actor.tenantId, active: true },
    select: {
      id: true, code: true, name: true, priceLow: true, priceHigh: true,
      athleteCountMin: true, athleteCountMax: true, lineItems: true, includes: true,
      exclusivity: true, durationWeeks: true,
    },
    orderBy: { priceLow: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    lineItems: (r.lineItems as CataloguePackage["lineItems"]) ?? [],
    includes: (r.includes as CataloguePackage["includes"] | null) ?? [],
  }));
}

export async function listJobs(actor: Actor): Promise<CatalogueJob[]> {
  return prisma.nilJob.findMany({
    where: { ...whereFor(actor, "nilJob", "read"), tenantId: actor.tenantId },
    select: { id: true, name: true, sellLow: true, sellHigh: true },
    orderBy: { id: "asc" },
  });
}
