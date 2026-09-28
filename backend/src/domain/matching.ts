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
        verified: counted.length > 0 && counted.every((s) => s.source !== "SELF_REPORTED"),
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
