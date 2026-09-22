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
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
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
      id: true, displayName: true, sport: true, stateCode: true, tier: true,
    },
    orderBy: [{ displayName: "asc" }],
    take: Math.min(criteria.limit ?? 100, 200),
  });

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    sport: row.sport,
    stateCode: row.stateCode,
    tier: row.tier,
    matched: {
      sport: sports.length === 0 || sports.includes(row.sport),
      geography: stateCodes.length === 0 || (!!row.stateCode && stateCodes.includes(row.stateCode)),
    },
  }));
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
