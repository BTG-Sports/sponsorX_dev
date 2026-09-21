/**
 * The athlete application lifecycle — P3-BE-01, §21, §26, §37.
 *
 * The acceptance says the state machine must be "enforced in the domain
 * layer". That word is doing real work: `Athlete.state` is an ordinary
 * column, so without this module any code path could set ACTIVE directly and
 * nothing would object. Enforcement means there is exactly one function that
 * changes the state, it consults a table of legal moves, and it refuses
 * everything else.
 *
 * The table itself lives in `athlete-state.ts`, which imports nothing — see
 * the note there on why the rule and the persistence are separate files.
 */

import type { Prisma } from "../generated/prisma/client";
import {
  canTransition,
  GuardianRequiredError,
  IllegalTransitionError,
  type AthleteState,
} from "./athlete-state";
import { prisma } from "../db/client";
import { AUDIT_ACTIONS, audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

/** Under 18 at the moment of asking. §26 ties the guardian workflow to age,
 *  and an athlete who turns 18 mid-application stops needing one. */
function isMinor(birthDate: Date | null): boolean {
  if (!birthDate) return false;
  const eighteenth = new Date(birthDate);
  eighteenth.setFullYear(eighteenth.getFullYear() + 18);
  return eighteenth > new Date();
}

/**
 * Move an application to a new state, or refuse.
 *
 * Everything happens in one transaction: the guard, the write and the audit
 * row. A state change that is not audited, or an audit describing a change
 * that rolled back, are both worse than a refusal.
 *
 * The §37 gate is checked here rather than at the UI, because "a minor cannot
 * go ACTIVE without a verified guardian" has to hold for the API and the
 * service account too, not only for someone clicking a button.
 */
export async function transitionAthlete(
  actor: Actor,
  athleteId: string,
  to: AthleteState,
  reviewerNotes?: string,
): Promise<{ id: string; state: AthleteState }> {
  assertAllowed(actor, "athlete", to === "ACTIVE" ? "approve" : "write");

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { id: athleteId, tenantId: actor.tenantId },
      select: { id: true, state: true, birthDate: true, guardianId: true },
    });

    /* Not found and not-yours are answered identically on purpose: telling a
       caller that an id exists in another tenant is itself a disclosure. */
    if (!athlete) throw new ForbiddenError("athlete", "write");

    const from = athlete.state as AthleteState;
    if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);

    if (to === "ACTIVE" && isMinor(athlete.birthDate)) {
      const guardian = athlete.guardianId
        ? await tx.guardian.findFirst({
            where: { id: athlete.guardianId, tenantId: actor.tenantId },
            select: { verifiedAt: true },
          })
        : null;
      if (!guardian?.verifiedAt) throw new GuardianRequiredError(athleteId);
    }

    const updated = await tx.athlete.update({
      where: { id: athleteId },
      data: { state: to as Prisma.AthleteUpdateInput["state"] },
      select: { id: true, state: true },
    });

    await audit(tx, actor, ATHLETE_AUDIT_ACTIONS[to], "Athlete", athleteId, {
      before: { state: from },
      after: { state: to, ...(reviewerNotes ? { reviewerNotes } : {}) },
    });

    return { id: updated.id, state: updated.state as AthleteState };
  });
}

/**
 * One audit action per destination state, rather than a single
 * "athlete.stateChange".
 *
 * §26 requires the log to answer questions like "who approved this athlete";
 * a single action name would make that a search through JSON payloads instead
 * of a filter on one column.
 */
const ATHLETE_AUDIT_ACTIONS: Record<AthleteState, `${string}.${string}`> = {
  DRAFT: "athlete.draft",
  SUBMITTED: "athlete.submit",
  UNDER_REVIEW: "athlete.beginReview",
  APPROVED: "athlete.approve",
  CHANGES_REQUESTED: "athlete.requestChanges",
  REJECTED: "athlete.reject",
  ACTIVE: "athlete.activate",
  SUSPENDED: "athlete.suspend",
};

export { ATHLETE_AUDIT_ACTIONS, AUDIT_ACTIONS };
export * from "./athlete-state";
