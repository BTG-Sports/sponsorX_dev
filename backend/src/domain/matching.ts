/**
 * Eligible athletes — P4-BE-03, §26, §11 §6.
 *
 * The query BTG's matching desk runs against a brief. Phase 1 is a *managed*
 * marketplace: this shortlists, and a person chooses. Nothing here ranks or
 * auto-invites.
 *
 * THREE FILTERS, AND ONLY ONE OF THEM IS A RULE.
 *
 *   - **Conflict** is a rule. An athlete who said they will not promote
 *     alcohol must not appear on an alcohol brief, and the check has to be a
 *     query rather than a reviewer's memory. This is the filter §26 requires
 *     and the reason `restrictedCategories` is an indexed array.
 *   - **Sport and geography** are *targeting*. A brief naming Maryland
 *     basketball is describing who it wants, not forbidding anyone else, and
 *     an empty list means "no preference" rather than "nobody".
 *
 * Conflating the two is the failure worth guarding against: a targeting miss
 * costs a good match, and a conflict miss puts an athlete in front of a brand
 * they refused.
 *
 * ACTIVE ONLY. An athlete who has not been activated cannot take paid work —
 * §37's guardian gate stands between APPROVED and ACTIVE — so an unactivated
 * athlete appearing on a shortlist would be an invitation nobody could accept.
 */

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canReadField } from "../auth/fields";
import type { BrandCategory } from "./brand-categories";
import { isVerified, type MetricSource } from "./metric-source";
import { clampPage, pageInfo, readPage, type PageInfo, type PageRequest } from "../lib/paging";

export type EligibleAthlete = {
  id: string;
  displayName: string;
  sport: string;
  stateCode: string | null;
  tier: string | null;
  /** Why this athlete is on the list, so the desk can see the match rather
   *  than trust it. §14's score is a separate concern and is read per row. */
  matched: { sport: boolean; geography: boolean };
  /* --- what the matching desk weighs (P4-FE-02). Each is present only for
     a caller who may read it; for anyone else it is ABSENT, not null, so
     "denied" and "not scored yet" can never be confused. --------------- */
  city?: string | null;
  /** Latest §14 snapshot, or null when unscored — never zero. Denied to the
   *  sponsor/property side by §7's `athleteScore.value`. */
  score?: { value: number; factors: unknown; method: string; scoredAt: string } | null;
  /** Summed followers, and whether every account behind the sum is
   *  platform-verified (§22) — self-reported reach must look different. */
  reach?: { followers: number | null; verified: boolean };
  /** Current rate per NIL job, cents. BTG-internal — §7.1 denies
   *  `athleteRate.amount` to every sponsor-side role. */
  rates?: { jobId: string; amount: number }[];
};

export type EligibilityCriteria = {
  sports?: readonly string[];
  stateCodes?: readonly string[];
  /** The brief's categories. An athlete restricting any of them is excluded. */
  categories?: readonly BrandCategory[];
  limit?: number;
};

/**
 * Shortlist for a brief.
 *
 * The conflict exclusion is `NOT hasSome`, not a negated `hasEvery`: an
 * athlete who bars *any* of the brief's categories is a conflict, not only
 * one who bars all of them. That distinction is the whole check — a brief for
 * an alcohol brand with a food category attached must still exclude the
 * athlete who refuses alcohol.
 */
export async function eligibleAthletes(
  actor: Actor,
  criteria: EligibilityCriteria,
): Promise<EligibleAthlete[]> {
  assertAllowed(actor, "athlete", "read");

  const sports = criteria.sports?.filter(Boolean) ?? [];
  const stateCodes = criteria.stateCodes?.filter(Boolean) ?? [];
  const categories = criteria.categories?.filter(Boolean) ?? [];

  /* Column rights, decided once per call from the matrix — never from who
     the route thinks is asking. */
  const seeScore =
    canReadField(actor.roles, "athleteScore.value") && can(actor, "athleteScore", "read");
  const seeRates =
    canReadField(actor.roles, "athleteRate.amount") && can(actor, "athleteRate", "read");

  const rows = await prisma.athlete.findMany({
    where: {
      ...whereFor(actor, "athlete", "read"),
      state: "ACTIVE",
      ...(sports.length ? { sport: { in: [...sports] } } : {}),
      ...(stateCodes.length ? { stateCode: { in: [...stateCodes] } } : {}),
      ...(categories.length
        ? { NOT: { restrictedCategories: { hasSome: [...categories] } } }
        : {}),
    },
    select: {
      id: true, displayName: true, sport: true, stateCode: true, tier: true, city: true,
      ...(seeScore
        ? {
            scores: {
              select: { score: true, factors: true, method: true, scoredAt: true },
              orderBy: { scoredAt: "desc" as const },
              take: 1,
            },
          }
        : {}),
      socials: { select: { followers: true, source: true } },
      ...(seeRates
        ? { rates: { select: { jobId: true, amount: true, version: true } } }
        : {}),
    },
    orderBy: [{ displayName: "asc" }],
    take: Math.min(criteria.limit ?? 100, 200),
  });

  return rows.map((row) => {
    const r = row as typeof row & {
      scores?: { score: number; factors: unknown; method: string; scoredAt: Date }[];
      rates?: { jobId: string; amount: number; version: number }[];
    };
    const counted = row.socials.filter((s) => s.followers !== null);
    return {
      id: row.id,
      displayName: row.displayName,
      sport: row.sport,
      stateCode: row.stateCode,
      tier: row.tier,
      matched: {
        sport: sports.length === 0 || sports.includes(row.sport),
        geography: stateCodes.length === 0 || (!!row.stateCode && stateCodes.includes(row.stateCode)),
      },
      city: row.city,
      ...(seeScore
        ? {
            score: r.scores?.[0]
              ? {
                  value: r.scores[0].score,
                  factors: r.scores[0].factors,
                  method: r.scores[0].method,
                  scoredAt: r.scores[0].scoredAt.toISOString(),
                }
              : null,
          }
        : {}),
      reach: {
        followers: counted.length ? counted.reduce((n, s) => n + (s.followers ?? 0), 0) : null,
        /* Verified only when every counted row carries a verified label —
           `!== SELF_REPORTED` used to let an ESTIMATED row through (P7-QA-02). */
        verified: counted.length > 0 && counted.every((s) => isVerified(s.source as MetricSource)),
      },
      ...(seeRates ? { rates: currentRates(r.rates ?? []) } : {}),
    };
  });
}

/** The live rate per job is the highest version — older versions are kept
 *  as history (P3-BE-09) and must not be read as a second rate. */
function currentRates(
  rows: readonly { jobId: string; amount: number; version: number }[],
): { jobId: string; amount: number }[] {
  const best = new Map<string, { amount: number; version: number }>();
  for (const r of rows) {
    const had = best.get(r.jobId);
    if (!had || r.version > had.version) best.set(r.jobId, { amount: r.amount, version: r.version });
  }
  return [...best].map(([jobId, v]) => ({ jobId, amount: v.amount })).sort((a, b) => a.jobId.localeCompare(b.jobId));
}

/** Shortlist straight from a brief, so the desk cannot mistype its criteria. */
export async function eligibleForBrief(
  actor: Actor,
  briefId: string,
  limit?: number,
): Promise<EligibleAthlete[]> {
  assertAllowed(actor, "campaignBrief", "read");

  const brief = await prisma.campaignBrief.findFirst({
    where: { ...whereFor(actor, "campaignBrief", "read"), id: briefId },
    select: { sports: true, stateCodes: true, categories: true },
  });
  if (!brief) throw new ForbiddenError("campaignBrief", "read");

  return eligibleAthletes(actor, {
    sports: brief.sports,
    stateCodes: brief.stateCodes,
    categories: brief.categories as BrandCategory[],
    limit,
  });
}

/* --- the shortlist, PAGED (2026-09-29) ----------------------------------

   The desk used to take the first 200 eligible athletes by name and filter
   and sort them in the browser — past 200, the network simply wasn't there.
   This answers one page with its true total, and the tier / sport facets of
   the whole eligible roster (the filter rail's counts).

   IN THE DATABASE: the eligibility rule itself (identical to
   eligibleAthletes — ACTIVE, the brief's targeting, the §26 conflict
   exclusion), `q` (name, sport, city, state code, tier name), `sport`,
   `tier` (UNTIERED = none set) and the name order.

   SCORE is a stored snapshot in its own history table — the LATEST row per
   athlete, which no Prisma WHERE / ORDER BY can express. So a score sort or
   a minimum score reads a thin projection (id, name, latest score) of the
   filtered set, orders / filters that in memory and fetches full rows for
   one page only. Only for a caller who may read scores (§7
   `athleteScore.value`): for anyone else `min` is ignored and the order is
   by name — ordering by a column you may not read would leak it.

   NOT SERVED: the desk's margin and cost sorts. Both are computed from the
   athlete's current rate version per job × the package's quantities against
   the tier's sell floor — not a column, and not the domain's to price. The
   Studio keeps them for the page in hand only. activeOnly / guardianOnly
   need nothing: this query returns ACTIVE athletes only, and ACTIVE already
   required a verified guardian (§37). */

export type EligibleFilters = {
  q?: string;
  sport?: string;
  /** An AthleteTier, or "UNTIERED". Anything else is ignored. */
  tier?: string;
  minScore?: number;
  sort: "score" | "name";
};

export type EligibleFacets = {
  /** Every athlete eligible for the brief, before the desk's filters. */
  total: number;
  /** Per tier over that roster; untiered athletes count as UNTIERED. */
  tiers: Record<string, number>;
  sports: string[];
};

const TIERS = ["EMERGING", "CREATOR", "PREMIUM", "ANCHOR"] as const;
const TIER_WORDS: Record<(typeof TIERS)[number], string> = {
  EMERGING: "emerging", CREATOR: "creator", PREMIUM: "premium", ANCHOR: "anchor",
};

export function eligibilityWhere(actor: Actor, sports: string[], stateCodes: string[], categories: string[]) {
  return {
    ...whereFor(actor, "athlete", "read"),
    state: "ACTIVE" as const,
    ...(sports.length ? { sport: { in: [...sports] } } : {}),
    ...(stateCodes.length ? { stateCode: { in: [...stateCodes] } } : {}),
    ...(categories.length
      ? { NOT: { restrictedCategories: { hasSome: [...categories] } } }
      : {}),
  };
}

export async function eligiblePageForBrief(
  actor: Actor,
  briefId: string,
  req: PageRequest,
  filters: EligibleFilters,
): Promise<{ athletes: EligibleAthlete[]; page: PageInfo; facets: EligibleFacets }> {
  assertAllowed(actor, "campaignBrief", "read");
  assertAllowed(actor, "athlete", "read");

  const brief = await prisma.campaignBrief.findFirst({
    where: { ...whereFor(actor, "campaignBrief", "read"), id: briefId },
    select: { sports: true, stateCodes: true, categories: true },
  });
  if (!brief) throw new ForbiddenError("campaignBrief", "read");

  const sports = brief.sports.filter(Boolean);
  const stateCodes = brief.stateCodes.filter(Boolean);
  const categories = (brief.categories as BrandCategory[]).filter(Boolean);
  const seeScore =
    canReadField(actor.roles, "athleteScore.value") && can(actor, "athleteScore", "read");
  const seeRates =
    canReadField(actor.roles, "athleteRate.amount") && can(actor, "athleteRate", "read");

  const base = eligibilityWhere(actor, sports, stateCodes, categories);
  const q = filters.q?.trim();
  const needle = q?.toLowerCase() ?? "";
  const tierHits = needle ? TIERS.filter((t) => TIER_WORDS[t].includes(needle)) : [];
  const tier = filters.tier === "UNTIERED" ? null : (TIERS as readonly string[]).includes(filters.tier ?? "") ? filters.tier : undefined;
  const contains = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const where = {
    AND: [
      base,
      ...(q
        ? [{
            OR: [
              { displayName: contains(q) },
              { sport: contains(q) },
              { city: contains(q) },
              { stateCode: contains(q) },
              ...(tierHits.length ? [{ tier: { in: [...tierHits] } }] : []),
              ...("untiered".includes(needle) ? [{ tier: null }] : []),
            ],
          }]
        : []),
      ...(filters.sport ? [{ sport: filters.sport }] : []),
      ...(tier !== undefined ? [{ tier: tier as never }] : []),
    ],
  };
  const select = {
    id: true, displayName: true, sport: true, stateCode: true, tier: true, city: true,
    ...(seeScore
      ? {
          scores: {
            select: { score: true, factors: true, method: true, scoredAt: true },
            orderBy: { scoredAt: "desc" as const },
            take: 1,
          },
        }
      : {}),
    socials: { select: { followers: true, source: true } },
    ...(seeRates ? { rates: { select: { jobId: true, amount: true, version: true } } } : {}),
  };
  const BY_NAME = [{ displayName: "asc" as const }, { id: "asc" as const }];

  const [tierGroups, sportGroups] = await Promise.all([
    prisma.athlete.groupBy({ by: ["tier"], where: base /* tenant-scope: eligibilityWhere spreads whereFor(athlete) */, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["sport"], where: base /* tenant-scope: eligibilityWhere spreads whereFor(athlete) */, orderBy: { sport: "asc" } }),
  ]);
  const facets: EligibleFacets = {
    total: tierGroups.reduce((n, g) => n + g._count._all, 0),
    tiers: Object.fromEntries(tierGroups.map((g) => [g.tier ?? "UNTIERED", g._count._all])),
    sports: sportGroups.map((g) => g.sport),
  };

  const byScore = seeScore && (filters.sort === "score" || filters.minScore !== undefined);
  let rows: unknown[];
  let page: PageInfo;
  if (!byScore) {
    const got = await readPage(
      req,
      () => prisma.athlete.count({ where /* tenant-scope: AND[eligibilityWhere(whereFor(athlete)), …] */ }),
      (skip, take) =>
        prisma.athlete.findMany({
          where /* tenant-scope: AND[eligibilityWhere(whereFor(athlete)), …] */,
          select,
          orderBy: BY_NAME,
          skip,
          take,
        }) as unknown as Promise<unknown[]>,
    );
    rows = got.rows;
    page = got.page;
  } else {
    /* The thin projection: id and the latest snapshot's score, name order —
       so equal scores (and the unscored, last) keep a stable name order. */
    const thin = await prisma.athlete.findMany({
      where /* tenant-scope: AND[eligibilityWhere(whereFor(athlete)), …] */,
      select: { id: true, scores: { select: { score: true }, orderBy: { scoredAt: "desc" as const }, take: 1 } },
      orderBy: BY_NAME,
    });
    const scored = thin
      .map((a) => ({ id: a.id, score: a.scores[0]?.score ?? null }))
      /* A minimum is a claim about the score — the unscored can't meet it. */
      .filter((a) => filters.minScore === undefined || (a.score !== null && a.score >= filters.minScore));
    const ordered = filters.sort === "score"
      ? scored.map((a, i) => ({ ...a, i })).sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || x.i - y.i)
      : scored;
    const at = clampPage(req, ordered.length);
    const ids = ordered.slice(at.skip, at.skip + at.take).map((a) => a.id);
    const full = ids.length
      ? ((await prisma.athlete.findMany({
          where: { AND: [where, { id: { in: ids } }] } /* tenant-scope: AND[eligibilityWhere(whereFor(athlete)), …] */,
          select,
        })) as unknown as { id: string }[])
      : [];
    const byId = new Map(full.map((r) => [r.id, r]));
    rows = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    page = pageInfo(at, ordered.length);
  }

  return {
    athletes: rows.map((row) => toEligible(row as EligibleRow, sports, stateCodes, seeScore, seeRates)),
    page,
    facets,
  };
}

type EligibleRow = {
  id: string; displayName: string; sport: string; stateCode: string | null; tier: string | null; city: string | null;
  scores?: { score: number; factors: unknown; method: string; scoredAt: Date }[];
  socials: { followers: number | null; source: string }[];
  rates?: { jobId: string; amount: number; version: number }[];
};

/** One row → the shortlist's shape. The same mapping as eligibleAthletes,
 *  field gating included: a denied column is ABSENT. */
function toEligible(
  r: EligibleRow,
  sports: readonly string[],
  stateCodes: readonly string[],
  seeScore: boolean,
  seeRates: boolean,
): EligibleAthlete {
  const counted = r.socials.filter((s) => s.followers !== null);
  return {
    id: r.id,
    displayName: r.displayName,
    sport: r.sport,
    stateCode: r.stateCode,
    tier: r.tier,
    matched: {
      sport: sports.length === 0 || sports.includes(r.sport),
      geography: stateCodes.length === 0 || (!!r.stateCode && stateCodes.includes(r.stateCode)),
    },
    city: r.city,
    ...(seeScore
      ? {
          score: r.scores?.[0]
            ? {
                value: r.scores[0].score,
                factors: r.scores[0].factors,
                method: r.scores[0].method,
                scoredAt: r.scores[0].scoredAt.toISOString(),
              }
            : null,
        }
      : {}),
    reach: {
      followers: counted.length ? counted.reduce((n, s) => n + (s.followers ?? 0), 0) : null,
      verified: counted.length > 0 && counted.every((s) => isVerified(s.source as MetricSource)),
    },
    ...(seeRates ? { rates: currentRates(r.rates ?? []) } : {}),
  };
}

/**
 * Would inviting this athlete to this brief breach a restriction?
 *
 * The same rule as the shortlist filter, asked about one athlete — because
 * the shortlist is advisory and the invitation is the act. A desk that
 * shortlists correctly and then invites from a stale tab has still done the
 * thing §26 forbids, so `inviteAthlete` asks this again at the moment it
 * matters.
 */
export async function hasCategoryConflict(
  tenantId: string,
  athleteId: string,
  categories: readonly string[],
): Promise<boolean> {
  if (categories.length === 0) return false;

  const athlete = await prisma.athlete.findFirst({
    where: { id: athleteId, tenantId },
    select: { restrictedCategories: true },
  });
  if (!athlete) return true; // unreachable athlete: refuse rather than allow

  return athlete.restrictedCategories.some((r) => categories.includes(r));
}
