/**
 * The brief readiness checklist, read — P4-BE-07.
 *
 * Gathers what `briefReadiness` (brief-readiness-rules.ts) needs for a page
 * of briefs in a handful of queries — the sponsors' standing and each
 * tenant's NIL floors in one query each, the eligibility counts once per
 * distinct targeting — and answers `{ ready, checks }` per brief.
 *
 * READ ONLY. Nothing here writes, and nothing anywhere moves a brief because
 * it is ready: BTG still qualifies and approves by hand.
 *
 * WHO SEES IT. BTG's brief desk — a caller who reads briefs tenant-wide and
 * may read athletes. A sponsor reading their own brief gets no checklist:
 * "is this sponsor in good standing" is BTG's question about them, and the
 * eligibility counts are of a roster a sponsor does not see.
 *
 * Every count is pinned to the BRIEF'S tenant as well as the actor's scope,
 * so a cross-tenant reader (SUPER_ADMIN) counts that tenant's athletes only.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { can, scopeOf, whereFor } from "../auth/scope";
import { eligibilityWhere } from "./matching";
import {
  briefReadiness,
  isReady,
  lowestJobFloor,
  sponsorStanding,
  type ReadinessCheck,
  type ReadinessInput,
} from "./brief-readiness-rules";

export type Readiness = { ready: boolean; checks: ReadinessCheck[] };

export type BriefForReadiness = {
  id: string;
  tenantId: string;
  sponsorId: string;
  state: string;
  objective: string;
  budget: number;
  startDate: Date;
  endDate: Date;
  sports: string[];
  stateCodes: string[];
  categories: string[];
  package: { name: string; priceLow: number } | null;
};

/** BTG's brief desk: tenant-wide brief reads, and athletes readable. */
export function canSeeReadiness(actor: Actor): boolean {
  const scope = scopeOf(actor, "campaignBrief", "read");
  return (scope === "own-tenant" || scope === "any") && can(actor, "athlete", "read");
}

/** The fields a brief read must select for its readiness. */
export const READINESS_SELECT = {
  id: true, tenantId: true, sponsorId: true, state: true, objective: true, budget: true,
  startDate: true, endDate: true, sports: true, stateCodes: true, categories: true,
  package: { select: { name: true, priceLow: true } },
} as const;

/**
 * `opts.readyOnly` — the caller wants only "is it ready?" (the `?ready=true`
 * scan): a brief already failing a cheap check is not ready whatever its
 * athletes, so its eligibility counts are not run. Its checklist then
 * reports the counts as 0 and must not be shown — readyBriefIds never does.
 */
export async function readinessFor(
  actor: Actor,
  briefs: readonly BriefForReadiness[],
  now = new Date(),
  opts: { readyOnly?: boolean } = {},
): Promise<Map<string, Readiness>> {
  const out = new Map<string, Readiness>();
  if (briefs.length === 0 || !canSeeReadiness(actor)) return out;

  const tenantIds = [...new Set(briefs.map((b) => b.tenantId))];
  const sponsorIds = [...new Set(briefs.map((b) => b.sponsorId))];

  const [requests, closures, jobs] = await Promise.all([
    prisma.inquiry.findMany({
      /* tenant-scope: the briefs' own tenants (each brief was read through whereFor). */
      where: { tenantId: { in: tenantIds }, sponsorId: { in: sponsorIds } },
      select: { sponsorId: true, state: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.accountClosure.findMany({
      /* tenant-scope: the briefs' own tenants (each brief was read through whereFor). */
      where: { tenantId: { in: tenantIds }, subjectKind: "SPONSOR", subjectId: { in: sponsorIds }, state: "CLOSED" },
      select: { subjectId: true },
    }),
    prisma.nilJob.findMany({
      /* tenant-scope: the briefs' own tenants' NIL catalogue. */
      where: { tenantId: { in: tenantIds } },
      select: { id: true, tenantId: true, name: true, sellFloorEmerging: true, sellFloorCreator: true, sellFloorPremium: true },
    }),
  ]);

  const latestRequest = new Map<string, string>();
  for (const r of requests) if (r.sponsorId && !latestRequest.has(r.sponsorId)) latestRequest.set(r.sponsorId, r.state);
  const closed = new Set(closures.map((c) => c.subjectId));
  const floorByTenant = new Map<string, ReadinessInput["lowestJobFloor"]>(
    tenantIds.map((t) => [t, lowestJobFloor(jobs.filter((j) => j.tenantId === t))]),
  );

  /* Eligibility counts, once per distinct targeting in a tenant. */
  const counts = new Map<string, Promise<{ eligible: number; conflicts: number }>>();
  const countFor = (b: BriefForReadiness) => {
    const sports = b.sports.filter(Boolean);
    const stateCodes = b.stateCodes.filter(Boolean);
    const categories = b.categories.filter(Boolean);
    const key = JSON.stringify([b.tenantId, [...sports].sort(), [...stateCodes].sort(), [...categories].sort()]);
    let p = counts.get(key);
    if (!p) {
      const pinned = (where: object) => ({ AND: [where, { tenantId: b.tenantId }] });
      p = Promise.all([
        prisma.athlete.count({ where: pinned(eligibilityWhere(actor, sports, stateCodes, categories)) /* tenant-scope: eligibilityWhere spreads whereFor(athlete), pinned to the brief's tenant */ }),
        categories.length
          ? prisma.athlete.count({ where: pinned(eligibilityWhere(actor, sports, stateCodes, [])) /* tenant-scope: eligibilityWhere spreads whereFor(athlete), pinned to the brief's tenant */ })
          : Promise.resolve(null),
      ]).then(([eligible, withoutConflicts]) => ({
        eligible,
        conflicts: withoutConflicts === null ? 0 : Math.max(0, withoutConflicts - eligible),
      }));
      counts.set(key, p);
    }
    return p;
  };

  await Promise.all(
    briefs.map(async (b) => {
      const input = (eligibleCount: number, conflictCount: number): ReadinessInput => ({
        objective: b.objective,
        startDate: b.startDate,
        endDate: b.endDate,
        budget: b.budget,
        package: b.package,
        lowestJobFloor: floorByTenant.get(b.tenantId) ?? null,
        sponsor: sponsorStanding({ latestRequestState: latestRequest.get(b.sponsorId) ?? null, closed: closed.has(b.sponsorId) }),
        eligibleCount,
        conflictCount,
        now,
      });
      if (opts.readyOnly && !isReady(b.state, briefReadiness(input(1, 0)))) {
        out.set(b.id, { ready: false, checks: briefReadiness(input(0, 0)) });
        return;
      }
      const { eligible, conflicts } = await countFor(b);
      const checks = briefReadiness(input(eligible, conflicts));
      out.set(b.id, { ready: isReady(b.state, checks), checks });
    }),
  );
  return out;
}

/** Bound on the DRAFT scan behind `?ready=true`. */
const READY_SCAN_CAP = 500;

/**
 * The ids of the DRAFT briefs the caller may read that are ready for review
 * — what `GET /briefs?ready=true` narrows to. Readiness is computed, not
 * stored, so this is one bounded scan of DRAFT briefs. A caller who does not
 * see readiness has no ready briefs.
 */
export async function readyBriefIds(actor: Actor, now = new Date()): Promise<string[]> {
  if (!canSeeReadiness(actor)) return [];
  const drafts = await prisma.campaignBrief.findMany({
    where: { ...whereFor(actor, "campaignBrief", "read"), state: "DRAFT" },
    select: READINESS_SELECT,
    orderBy: { createdAt: "desc" },
    take: READY_SCAN_CAP,
  });
  const readiness = await readinessFor(actor, drafts, now, { readyOnly: true });
  return drafts.filter((d) => readiness.get(d.id)?.ready).map((d) => d.id);
}
