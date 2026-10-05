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
import { AGE_FIELD, missingApplicationFields } from "../contracts/athlete";

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
 * An act the platform performs with nobody behind it.
 *
 * Exactly one thing in Phase 1 needs this: a public application at `/join`,
 * where the applicant has no session and no `User` row (P3-BE-13). Rather
 * than inventing a service identity and quietly granting it write access to
 * athletes — which §8 deliberately withholds from `SERVICE` — the absence of
 * an actor is made explicit in the type, so every bypass of the role check is
 * one `grep` away.
 */
export type SystemActor = {
  readonly system: true;
  tenantId: string;
  userId: null;
  /**
   * 2S1-BE-09 / -10 — the automatic sign-up approval, and only it. BTG has at
   * most one reviewer, so the programme owner agreed (2026-10-01) that the
   * system approves and BTG checks afterwards: an athlete whose checks all
   * passed (signup-rules.ts) is activated with no person behind it. The §37
   * guardian gate below still runs — a minor's guardian must be verified
   * first, by the same checks. Every other system path is refused ACTIVE.
   */
  readonly signupChecksPassed?: true;
};
export type TransitionActor = Actor | SystemActor;

function isSystemActor(actor: TransitionActor): actor is SystemActor {
  return "system" in actor;
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
  actor: TransitionActor,
  athleteId: string,
  to: AthleteState,
  reviewerNotes?: string,
): Promise<{ id: string; state: AthleteState }> {
  if (isSystemActor(actor)) {
    /* No role check, because there is no role and no person — see the type's
       own note. The state table still governs: a system transition is refused
       exactly as a human one is if §21 does not draw the edge.

       ACTIVE is refused outright. §37's gate says a minor may not be
       activated without a verified guardian, and the whole point of that gate
       is that a human being decided. A path with no actor must never be the
       thing that grants someone the ability to take paid work. */
    if (to === "ACTIVE" && !actor.signupChecksPassed) {
      throw new Error(
        "A system transition may not activate an athlete. Activation is a " +
          "decision with a person behind it (§37) — use an Actor — or the " +
          "automatic sign-up approval, once every check has passed.",
      );
    }
  } else {
    assertAllowed(actor, "athlete", to === "ACTIVE" ? "approve" : "write");
  }

  const athlete = await tx.athlete.findFirst({
    where: { id: athleteId, tenantId: actor.tenantId },
    select: {
      id: true,
      state: true,
      birthDate: true,
      ageBand: true,
      majorityAge: true,
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
      majorityAge: athlete.majorityAge,
      guardianId: athlete.guardianId,
      guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianRequiredError(athleteId);
    }
    /* P9-BE-11, spec §5.4 — a CLAIMED featured athlete who is a minor needs
       more than a verified guardian on file: the guardian's own COMMERCIAL
       authorisation, recorded as consent for this athlete as the subject.
       "Commercial activation cannot complete without it." */
    if (readiness.status === "ready") {
      const claimed = await tx.athleteClaim.count({
        where: { tenantId: actor.tenantId, athleteId, state: "VERIFIED" },
      });
      if (claimed > 0) {
        const authorised = await tx.agreementAcceptance.count({
          where: {
            tenantId: actor.tenantId, athleteId, guardianId: athlete.guardianId,
            agreement: { is: { kind: "COMMERCIAL" } },
          },
        });
        if (authorised === 0) throw new CommercialAuthorisationRequiredError(athleteId);
      }
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

  /* Conditional on the state we read (QA-05, pass 5). Two parallel
     requests both read APPROVED; without `state: from` in the WHERE both
     writes landed and two audit rows claimed the same activation. With it,
     Postgres makes the second UPDATE wait on the first's row lock, re-checks
     the predicate, and matches nothing — Prisma answers P2025, and the loser
     is told the move is no longer legal from where the row now is. */
  let updated: { id: string; state: string };
  try {
    updated = await tx.athlete.update({
      /* 2S8-QA-07 — the tenant the athlete was loaded in, in the write itself. */
      where: { id: athleteId, tenantId: actor.tenantId, state: from },
      data: {
        state: to as Prisma.AthleteUpdateInput["state"],
        ...(isReviewDecision
          ? { reviewerNotes: reviewerNotes ?? null, reviewedAt: new Date() }
          : {}),
      },
      select: { id: true, state: true },
    });
  } catch (err) {
    if ((err as { code?: unknown }).code !== "P2025") throw err;
    const now = await tx.athlete.findFirst({
      where: { id: athleteId, tenantId: actor.tenantId },
      select: { state: true },
    });
    throw new IllegalTransitionError((now?.state as AthleteState | undefined) ?? from, to);
  }

  await audit(tx, actor, ATHLETE_AUDIT_ACTIONS[to], "Athlete", athleteId, {
    before: { state: from },
    after: { state: to, ...(reviewerNotes ? { reviewerNotes } : {}) },
  });

  return { id: updated.id, state: updated.state as AthleteState };
}

/**
 * Activate an athlete — `POST /applications/:id/activate`, APPROVED → ACTIVE
 * and nothing else (product decisions of 2026-09-28, QA pass 5).
 *
 * Two refusals the plain transition does not make:
 *
 *   - FROM SUSPENDED. §21 draws SUSPENDED → ACTIVE, and the edge stays in the
 *     table for the reinstatement step — but that is a different decision
 *     (someone reviewed why they were suspended) with its own audit action,
 *     and it is not built yet. Activation must not quietly lift a suspension
 *     under "athlete.activate".
 *   - AN INCOMPLETE RECORD. The athlete must hold every field the
 *     application form requires (`missingApplicationFields`, derived from the
 *     form's contract), including a birthDate or an ageBand. Without either,
 *     guardianReadiness() has no age to reason about, and "unknown" must not
 *     pass §37's gate as "adult".
 *
 * The role is checked first, so a caller who may not activate learns nothing
 * about the record's state.
 */
export async function activateAthlete(
  actor: Actor,
  athleteId: string,
): Promise<{ id: string; state: AthleteState }> {
  assertAllowed(actor, "athlete", "approve");
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { id: athleteId, tenantId: actor.tenantId },
      select: {
        id: true, state: true, legalName: true, displayName: true, email: true,
        stateCode: true, sport: true, birthDate: true, ageBand: true, signupRejectedAt: true,
      },
    });
    if (!athlete) throw new ForbiddenError("athlete", "write");

    const from = athlete.state as AthleteState;
    if (from === "SUSPENDED") throw new ReinstatementRequiredError();
    if (from !== "APPROVED") throw new IllegalTransitionError(from, "ACTIVE");
    /* 2S1-BE-09 — BTG rejected this sign-up after approval; Reinstate (New sign-ups) is the way back. */
    if (athlete.signupRejectedAt) throw new ReinstatementRequiredError();

    const missing = missingApplicationFields(athlete);
    if (missing.length > 0) throw new ProfileIncompleteError(missing);

    return transitionAthleteIn(tx, actor, athleteId, "ACTIVE");
  });
}

/** 409 — activation does not lift a suspension (decision 2, 2026-09-28). */
export class ReinstatementRequiredError extends Error {
  readonly status = 409;
  readonly code = "reinstatement_required";
  constructor() {
    super(
      "This athlete is suspended. Activating does not lift a suspension — " +
        "reinstatement is a separate step.",
    );
    this.name = "ReinstatementRequiredError";
  }
}

/** Human labels for the missing-field keys, for the refusal's sentence. */
const FIELD_LABELS: Record<string, string> = {
  legalName: "legal name",
  displayName: "display name",
  email: "email",
  stateCode: "state",
  sport: "sport",
  [AGE_FIELD]: "date of birth or age band",
};

/** 422 — the record lacks fields the application form requires. */
export class ProfileIncompleteError extends Error {
  readonly status = 422;
  readonly code = "profile_incomplete";
  readonly details: { missing: string[] };
  constructor(missing: string[]) {
    super(
      `This athlete's profile is incomplete, so they can't be activated yet. Missing: ` +
        `${missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.`,
    );
    this.name = "ProfileIncompleteError";
    this.details = { missing };
  }
}

export class CommercialAuthorisationRequiredError extends Error {
  readonly status = 409;
  constructor(athleteId: string) {
    super(
      `Athlete ${athleteId} claimed a featured profile and is a minor: activation needs ` +
        `their guardian's COMMERCIAL authorisation on record (P9-BE-11).`,
    );
    this.name = "CommercialAuthorisationRequiredError";
  }
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
  /* Never a transition's destination — a featured profile is created that
     way (P9-BE-11) — but the record type demands a name for every state. */
  FEATURED: "athlete.feature",
};

export { ATHLETE_AUDIT_ACTIONS, AUDIT_ACTIONS };
export * from "./athlete-state";
