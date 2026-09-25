/**
 * The regional (DMV) edition's school pools — P9-BE-14, spec v2.0 §5.7.
 *
 * Regional revenue is allocated by PREDEFINED RULES, never negotiated after
 * publication. A DMV edition draws from several schools, and the schools'
 * share of it (the SCHOOL RevenueSplit, P9-BE-06) resolves into two pools:
 *
 *   SALES   — by sales credit: each school's students' SalesAttribution in
 *             the edition ÷ the edition's total attributed sales;
 *   CONTENT — by contribution: units ÷ total eligible units × pool, with
 *             FEATURE 5 · PHOTO_PACKAGE 3 · INTERVIEW 3 · VIDEO 5.
 *
 * A school contributing no selected content receives nothing from the content
 * pool — it gets no row there at all. The 50/50 division of the school share
 * between the two pools is SIMULATED (documentation/SponsorX-NEXT-Rate-Card-
 * Decision.md) until BTG sets it.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

export const CONTRIBUTION_UNITS = { FEATURE: 5, PHOTO_PACKAGE: 3, INTERVIEW: 3, VIDEO: 5 } as const;
export type ContributionKind = keyof typeof CONTRIBUTION_UNITS;
export const CONTRIBUTION_KINDS = Object.keys(CONTRIBUTION_UNITS) as ContributionKind[];

/** Basis points of the edition's SCHOOL share that form the SALES pool; the
 *  rest is the CONTENT pool. */
export const DMV_SALES_POOL_BPS = 5_000;

export class ContributionError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ContributionError";
  }
}

/**
 * Shares of `pool` in proportion to `weights`, in whole cents that sum to the
 * pool exactly (largest remainder). Zero-weight keys get nothing, and an
 * all-zero input allocates nothing — there is no one to pay.
 */
export function allocateByWeight(pool: number, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights].filter(([, w]) => w > 0).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out = new Map<string, number>();
  if (total === 0 || pool <= 0) return out;
  const raw = entries.map(([k, w]) => [k, (pool * w) / total] as const);
  for (const [k, v] of raw) out.set(k, Math.floor(v));
  let left = pool - [...out.values()].reduce((s, v) => s + v, 0);
  for (const [k] of [...raw].sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])))) {
    if (left === 0) break;
    out.set(k, out.get(k)! + 1);
    left -= 1;
  }
  return out;
}

/** Record a student's contribution to an edition, at their school. */
export async function recordContribution(
  actor: Actor,
  editionId: string,
  input: { studentId: string; kind: ContributionKind },
): Promise<{ id: string; units: number }> {
  assertTenantWide(actor, "contentContribution", "write");
  if (!(input.kind in CONTRIBUTION_UNITS)) throw new ContributionError("Unknown contribution kind.");
  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({ where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true } });
    if (!edition) throw new ForbiddenError("contentContribution", "write");
    const student = await tx.student.findFirst({ where: { tenantId: actor.tenantId, id: input.studentId }, select: { id: true, propertyId: true } });
    if (!student) throw new ForbiddenError("student", "read");
    const units = CONTRIBUTION_UNITS[input.kind];
    const row = await tx.contentContribution.create({
      data: { tenantId: actor.tenantId, editionId, studentId: student.id, propertyId: student.propertyId, kind: input.kind, units },
      select: { id: true, units: true },
    });
    await audit(tx, actor, "contentContribution.record", "Edition", editionId, { after: { studentId: student.id, kind: input.kind, units } });
    return row;
  });
}

/**
 * Resolve a regional edition's two school pools from the SCHOOL split, by
 * formula, inside the caller's transaction (the edition's publication).
 * Returns nothing for a school's own (non-regional) edition — its school
 * share is simply that school's.
 */
export async function resolveSchoolPools(
  tx: Prisma.TransactionClient,
  tenantId: string,
  editionId: string,
): Promise<{ sales: Map<string, number>; content: Map<string, number> } | null> {
  const edition = await tx.edition.findFirst({
    where: { tenantId, id: editionId }, select: { publication: { select: { propertyId: true } } },
  });
  if (!edition || edition.publication.propertyId !== null) return null;

  const school = await tx.revenueSplit.findFirst({
    where: { tenantId, editionId, payeeKind: "SCHOOL" }, select: { amountCents: true },
  });
  const share = school?.amountCents ?? 0;
  const salesPool = Math.floor((share * DMV_SALES_POOL_BPS) / 10_000);
  const contentPool = share - salesPool;

  const attributed = await tx.salesAttribution.findMany({
    where: { tenantId, editionId }, select: { value: true, student: { select: { propertyId: true } } },
  });
  const salesWeights = new Map<string, number>();
  for (const a of attributed) salesWeights.set(a.student.propertyId, (salesWeights.get(a.student.propertyId) ?? 0) + a.value);

  const units = await tx.contentContribution.groupBy({
    where: { tenantId, editionId }, by: ["propertyId"], _sum: { units: true },
  });
  const contentWeights = new Map(units.map((u) => [u.propertyId, u._sum.units ?? 0]));

  const sales = allocateByWeight(salesPool, salesWeights);
  const content = allocateByWeight(contentPool, contentWeights);

  await tx.schoolPoolAllocation.deleteMany({ where: { tenantId, editionId } });
  await tx.schoolPoolAllocation.createMany({
    data: [
      ...[...sales].map(([propertyId, amountCents]) => ({ tenantId, editionId, propertyId, pool: "SALES" as const, amountCents })),
      ...[...content].map(([propertyId, amountCents]) => ({ tenantId, editionId, propertyId, pool: "CONTENT" as const, amountCents })),
    ],
  });
  return { sales, content };
}

export async function schoolPools(actor: Actor, editionId: string) {
  assertAllowed(actor, "schoolPoolAllocation", "read");
  const edition = await prisma.edition.findFirst({ where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true } });
  if (!edition) throw new ForbiddenError("schoolPoolAllocation", "read");
  return prisma.schoolPoolAllocation.findMany({
    where: { ...whereFor(actor, "schoolPoolAllocation", "read"), editionId },
    select: { propertyId: true, pool: true, amountCents: true, computedAt: true },
    orderBy: [{ pool: "asc" }, { propertyId: "asc" }],
  });
}
