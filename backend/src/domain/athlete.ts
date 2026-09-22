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
import { guardianReadiness } from "./guardian-rules";

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
  return prisma.$transaction((tx) =>
    transitionAthleteIn(tx, actor, athleteId, to, reviewerNotes),
  );
}

/**
 * The same move, inside a transaction the caller already opened.
 *
 * P3-BE-07 needs the state change, the reviewer's note and the applicant's
 * notification to commit or roll back together, and Prisma has no nested
 * interactive transaction — so the body lives here and `transitionAthlete`
 * above is the convenience wrapper for callers who have nothing else to do.
 *
 * There is still exactly one function that changes `Athlete.state`, which is
 * the invariant P3-BE-01 set out to establish. It just takes the transaction
 * as an argument now, for the same reason `audit` and `enqueue` do.
 */
export async function transitionAthleteIn(
  tx: Prisma.TransactionClient,
  actor: Actor,
  athleteId: string,
  to: AthleteState,
  reviewerNotes?: string,
): Promise<{ id: string; state: AthleteState }> {
  assertAllowed(actor, "athlete", to === "ACTIVE" ? "approve" : "write");

  const athlete = await tx.athlete.findFirst({
    where: { id: athleteId, tenantId: actor.tenantId },
    select: {
      id: true,
      state: true,
      birthDate: true,
      ageBand: true,
      guardianId: true,
      guardian: { select: { verifiedAt: true } },
    },
  });

  /* Not found and not-yours are answered identically on purpose: telling a
     caller that an id exists in another tenant is itself a disclosure. */
  if (!athlete) throw new ForbiddenError("athlete", "write");

  const from = athlete.state as AthleteState;
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);

  /* The §37 gate, asked through the shared rule rather than re-derived
     here. B4's Campaign Order acceptance asks the same question of the same
     function, which is what stops a minor being blocked from activation yet
     able to accept paid work. */
  if (to === "ACTIVE") {
    const readiness = guardianReadiness({
      birthDate: athlete.birthDate,
      ageBand: athlete.ageBand,
      guardianId: athlete.guardianId,
      guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianRequiredError(athleteId);
    }
  }

  /* A review decision is not only a state change: §11 §10 keeps the note
     and the date on the application itself, because CHANGES_REQUESTED is
     shown to the applicant and "when was this last looked at" is the first
     question anyone asks of a queue. Auditing the note without storing it —
     which is what this did before P3-BE-07 — leaves the applicant's own
     screen unable to say what needs fixing. */
  const isReviewDecision =
    to === "APPROVED" || to === "CHANGES_REQUESTED" || to === "REJECTED";

  const updated = await tx.athlete.update({
    where: { id: athleteId },
    data: {
      state: to as Prisma.AthleteUpdateInput["state"],
      ...(isReviewDecision
        ? { reviewerNotes: reviewerNotes ?? null, reviewedAt: new Date() }
        : {}),
    },
    select: { id: true, state: true },
  });

  await audit(tx, actor, ATHLETE_AUDIT_ACTIONS[to], "Athlete", athleteId, {
    before: { state: from },
    after: { state: to, ...(reviewerNotes ? { reviewerNotes } : {}) },
  });

  return { id: updated.id, state: updated.state as AthleteState };
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
