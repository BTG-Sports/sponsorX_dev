/**
 * Recording a Content Value Score — P3-BE-10, §14, P0-DATA-03.
 *
 * The arithmetic is in `content-value-rules.ts`, which imports nothing. This
 * file is the half that touches Postgres, and it re-exports the rule surface
 * so callers have one import.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  computeScore,
  SCORE_METHOD,
  type FactorAssessment,
  type ScoreBreakdown,
} from "./content-value-rules";

/**
 * Record a score as a snapshot.
 *
 * Snapshots are appended, never updated: §14's point is that a score is an
 * assessment made on a date by a named person, and overwriting one destroys
 * the only evidence of what was believed when a matching decision was taken.
 */
export async function scoreAthlete(
  actor: Actor,
  athleteId: string,
  assessment: FactorAssessment,
): Promise<ScoreBreakdown & { scoreId: string }> {
  /* An assessment ABOUT an athlete, made by BTG. An athlete holds
     `athleteScore.write` at `own` so their score can be shown to them;
     unguarded, that let them score themselves 100. */
  assertTenantWide(actor, "athleteScore", "write");

  const breakdown = computeScore(assessment);

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "read"), id: athleteId },
      select: { id: true },
    });
    if (!athlete) throw new ForbiddenError("athleteScore", "write");

    const row = await tx.athleteScore.create({
      data: {
        tenantId: actor.tenantId,
        athleteId,
        score: breakdown.score,
        /* The whole breakdown, not the number. A score without its reasoning
           is the thing the acceptance explicitly refuses. */
        factors: breakdown as unknown as Prisma.InputJsonValue,
        method: SCORE_METHOD,
        scoredBy: actor.userId,
      },
      select: { id: true },
    });

    await audit(tx, actor, "athleteScore.record", "Athlete", athleteId, {
      after: {
        score: breakdown.score,
        method: SCORE_METHOD,
        assessedGapPercent: breakdown.assessedGapPercent,
      },
    });

    return { ...breakdown, scoreId: row.id };
  });
}

/** The current score — the most recent snapshot, not an average. */
export async function readLatestScore(actor: Actor, athleteId: string) {
  assertAllowed(actor, "athleteScore", "read");
  return prisma.athleteScore.findFirst({
    where: { athleteId, tenantId: actor.tenantId },
    select: { id: true, score: true, factors: true, method: true, scoredBy: true, scoredAt: true },
    orderBy: { scoredAt: "desc" },
  });
}

export * from "./content-value-rules";
