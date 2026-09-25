/**
 * Application review — P3-BE-07, §13, §23, §26.
 *
 * The three admin actions on an athlete application: approve, request
 * changes, reject. Plus `beginReview`, which is not one of the three but is
 * what makes them reachable — §21 only permits those destinations out of
 * UNDER_REVIEW, so an application nobody has claimed cannot be decided.
 *
 * WHY THIS IS NOT JUST `transitionAthlete` WITH A STATE ARGUMENT.
 * The acceptance is "every transition is audited **and notifies the
 * applicant**". Those are three writes — the state, the note, the queued
 * email — and they have to commit together. A decision that is audited but
 * whose notification rolled back is an applicant who is never told; a
 * notification that survives a rolled-back decision is an applicant told
 * something untrue. So this module owns one transaction per decision and
 * calls `transitionAthleteIn` inside it.
 *
 * WHY THE NOTIFICATION IS QUEUED RATHER THAN SENT.
 * `send()` writes an outbox row (P3-INT-01). Calling Resend inline would put
 * a vendor on the request path, which Addendum A1 forbids for exactly this
 * case: BTG should be able to work the review queue while Resend is down.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not activate anyone. APPROVED
 * and ACTIVE are different states on purpose — §37's guardian gate stands
 * between them, and `transitionAthlete` enforces it. Approval says the
 * application passed review; activation says the athlete may take paid work,
 * and for a minor that needs a verified guardian.
 */

import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";
import { athleteNotificationKey, send, type EmailTemplate } from "../lib/email";
import { env } from "../config/env";
import { transitionAthleteIn } from "./athlete";
import type { AthleteState } from "./athlete-state";

/** The three decisions §21 allows out of UNDER_REVIEW. */
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

/**
 * Raised when a decision that reaches the applicant carries nothing to say.
 *
 * 422 rather than 400: the request is well-formed and the caller is
 * permitted; it is the content that cannot stand. Zod refuses this at the
 * route too, but the rule belongs here as well — §8's service account and any
 * future internal caller reach the domain function, not the router.
 */
export class ReviewNotesRequiredError extends Error {
  readonly status = 422;
  constructor(decision: ReviewDecision) {
    super(
      `A ${decision === "REJECTED" ? "rejection" : "request for changes"} needs reviewer notes: ` +
        `the applicant is sent them verbatim, and they are the record of why the decision was made (§23).`,
    );
    this.name = "ReviewNotesRequiredError";
  }
}

/** Which message each decision sends. The templates were reserved for this
 *  task when P3-INT-01 defined the union. */
const DECISION_TEMPLATE: Record<ReviewDecision, EmailTemplate> = {
  APPROVED: "athlete.approved",
  CHANGES_REQUESTED: "athlete.changesRequested",
  REJECTED: "athlete.rejected",
};

/** Notes reach the applicant for two of the three, and are required there. */
const NOTES_REQUIRED: Record<ReviewDecision, boolean> = {
  APPROVED: false,
  CHANGES_REQUESTED: true,
  REJECTED: true,
};

/**
 * Claim an application for review — SUBMITTED → UNDER_REVIEW.
 *
 * No email: "someone has started reading it" is not news an applicant needs,
 * and a message per queue movement is how a product teaches people to ignore
 * its mail. The audit row records who picked it up, which is what §23's
 * checklist actually wants to know.
 */
export async function beginReview(
  actor: Actor,
  athleteId: string,
): Promise<{ id: string; state: AthleteState }> {
  assertAllowed(actor, "athleteApplication", "approve");
  return prisma.$transaction((tx) =>
    transitionAthleteIn(tx, actor, athleteId, "UNDER_REVIEW"),
  );
}

/**
 * Decide an application, and tell the applicant.
 *
 * One transaction: the state, the note and the queued email. An illegal
 * decision (anything but UNDER_REVIEW as the current state) is refused by
 * `transitionAthleteIn` with a 409, which also makes a double-decision
 * impossible — the second attempt has nothing legal to move from.
 */
export async function reviewApplication(
  actor: Actor,
  athleteId: string,
  decision: ReviewDecision,
  reviewerNotes?: string,
): Promise<{ id: string; state: AthleteState }> {
  /* The reviewer's own gate. `transitionAthleteIn` separately checks
     `athlete` write, which is the record being changed — this one is about
     the act of reviewing, and it is the cell §5 of the RBAC matrix actually
     assigns to BTG_ADMIN, NETWORK_MGR and SUPER_ADMIN. */
  assertAllowed(actor, "athleteApplication", "approve");

  const notes = reviewerNotes?.trim() || undefined;
  if (NOTES_REQUIRED[decision] && !notes) throw new ReviewNotesRequiredError(decision);

  return prisma.$transaction(async (tx) => {
    /* Read before the transition, for the notification. Inside the same
       transaction so a concurrent change cannot slip between the address we
       write to and the decision we are recording. */
    const applicant = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athleteApplication", "approve"), id: athleteId },
      select: { id: true, email: true, legalName: true, displayName: true },
    });
    /* Not found and not-yours answer identically, as everywhere else: telling
       a caller that an id exists in another tenant is itself a disclosure. */
    if (!applicant) throw new ForbiddenError("athleteApplication", "approve");

    const result = await transitionAthleteIn(tx, actor, athleteId, decision, notes);

    /* A claimed FEATURED athlete's email is set at verification, so every
       applicant reaching a decision has one; the guard is for the type, and a
       decision is never lost for want of an address. */
    if (applicant.email) await send(tx, actor.tenantId, {
      template: DECISION_TEMPLATE[decision],
      to: applicant.email,
      data: {
        firstName: firstNameOf(applicant.legalName, applicant.displayName),
        portalUrl: `${env.APP_URL}/athlete`,
        ...(notes ? { reviewerNotes: notes } : {}),
      },
      /* One message per athlete per decision. The occurrence is the decision
         itself rather than a timestamp: the state machine already makes a
         second identical decision impossible, so keying on the destination
         state means a retried drain cannot duplicate the message, while a
         genuinely new decision later (rejected after changes, say) is a
         different key and does send. */
      idempotencyKey: athleteNotificationKey(
        DECISION_TEMPLATE[decision],
        athleteId,
        decision,
      ),
    });

    return result;
  });
}

/** Approve — the application passed review. Activation is a separate step. */
export function approveApplication(actor: Actor, athleteId: string, reviewerNotes?: string) {
  return reviewApplication(actor, athleteId, "APPROVED", reviewerNotes);
}

/** Send it back with something to fix. The applicant may resubmit (§21). */
export function requestChanges(actor: Actor, athleteId: string, reviewerNotes: string) {
  return reviewApplication(actor, athleteId, "CHANGES_REQUESTED", reviewerNotes);
}

/** Refuse it. REJECTED is terminal — re-applying creates a new application. */
export function rejectApplication(actor: Actor, athleteId: string, reviewerNotes: string) {
  return reviewApplication(actor, athleteId, "REJECTED", reviewerNotes);
}

/**
 * A first name for the greeting.
 *
 * Legal name first because that is the human being; display name is a brand
 * and may be "SHAMMAH.27". Neither is guaranteed to split into given and
 * family names in any particular way — this is a greeting, not an identity
 * claim, and the templates fall back to "there" if it comes out empty.
 */
function firstNameOf(legalName: string, displayName: string): string {
  const source = legalName.trim() || displayName.trim();
  return source.split(/\s+/)[0] ?? "";
}
