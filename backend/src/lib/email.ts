/**
 * Sending email — P3-INT-01, G-04, Addendum A1, Guide §10.
 *
 * Two rules, and both are in the acceptance:
 *
 *   1. **One `send()`, with the vendor behind it.** Resend was chosen in G-04
 *      over Postmark and SES, and `stack-decision.md` keeps that revisitable.
 *      The import of `resend` appears in exactly one place — the handler in
 *      `worker/jobs/send-email.mts`. Nothing in the domain layer knows which
 *      vendor exists, the same discipline as `auth/clerk.ts`.
 *
 *   2. **Every send is a queued job, so it retries.** `send()` does not call
 *      a vendor; it writes an outbox row inside the caller's transaction. An
 *      athlete approval must not fail because Resend is slow, and a retry
 *      must not depend on anyone catching an exception.
 *
 * ── IDEMPOTENCY IS NOT OPTIONAL HERE ────────────────────────────────────────
 *
 * The outbox drain is at-least-once by design (P2-BE-05): it sends to pg-boss
 * and then marks rows dispatched, so a process that dies between those two
 * steps re-sends. For a Zoho push that is recoverable. For email it means a
 * person receives the same message twice, and for something like "your
 * application was rejected" that is its own small harm.
 *
 * So every message carries an `idempotencyKey` derived from what the message
 * *is* rather than when it was sent, and the handler refuses to send a key it
 * has already sent. A caller that omits one is a compile error.
 */

import type { Prisma } from "../generated/prisma/client";
import { enqueue } from "../db/outbox";

/**
 * The templates Phase 1 sends. A closed union rather than free text: an email
 * whose template name is a typo silently never sends, and nobody notices
 * until an athlete says they were never told.
 *
 * Each template is claimed by the task that needs it. `athlete.approved`,
 * `athlete.changesRequested` and `athlete.rejected` are P3-BE-07's — the
 * "notifies the applicant" half of its acceptance.
 */
export type EmailTemplate =
  | "athlete.applicationReceived"
  | "athlete.approved"
  | "athlete.changesRequested"
  | "athlete.rejected"
  | "athlete.profileChangeApproved"
  | "athlete.profileChangeDeclined"
  | "guardian.verificationRequested"
  /* P4-INT-01 — the invitation's three moments. A reminder and an expiry
     warning are separate templates rather than one with a flag, because the
     wording differs in what it asks for: one nudges, the other says the offer
     is about to disappear. */
  | "invitation.sent"
  | "invitation.reminder"
  | "invitation.expiring"
  /* 2S1-INT-01 — an outside organisation's onboarding, to its primary
     contact: received, changes requested, approved, rejected, suspended. */
  | "onboarding.received"
  | "onboarding.changesRequested"
  | "onboarding.approved"
  | "onboarding.rejected"
  | "onboarding.suspended"
  /* 2S1-BE-05 — BTG's decision on a business asking to sponsor. */
  | "sponsor.accountOpened"
  | "sponsor.requestDeclined"
  /* 2S1-BE-17 — automatic approval: the applicant confirms their email; BTG
     hears of every new sponsor; a rejection after approval, and a reinstatement. */
  | "sponsor.confirmEmail"
  | "sponsor.newSponsor"
  | "sponsor.accountRejected"
  | "sponsor.accountReinstated";

export type EmailMessage = {
  template: EmailTemplate;
  to: string;
  /** Substituted into the template by the handler. Keep it to what the
   *  message needs — this payload is stored in the outbox row, and §26 is
   *  clear that personal data should not accumulate where nobody expects
   *  it. A name and a link, not a whole athlete record. */
  data: Record<string, string>;
  /**
   * Stable across retries of the *same* logical message, different for a
   * genuinely new one. Derive it from the event, never from `Date.now()`:
   * "athlete-approved:ath_123" is right, a timestamp is exactly the bug
   * this field exists to prevent.
   */
  idempotencyKey: string;
};

/**
 * Queue an email inside the caller's transaction.
 *
 * Takes `tx` for the same reason `enqueue` does: sending outside the
 * transaction would mean an applicant can be told they were approved by a
 * transaction that then rolled back.
 */
export async function send(
  tx: Prisma.TransactionClient,
  tenantId: string,
  message: EmailMessage,
): Promise<void> {
  if (!message.idempotencyKey) {
    throw new Error(
      "An email needs an idempotencyKey: outbox delivery is at-least-once, " +
        "so without one a retried drain sends the same message twice.",
    );
  }
  await enqueue(tx, tenantId, "notify.email", {
    /* Repeated inside the payload as well as on the outbox row: the drain
       hands pg-boss the payload alone, so a handler that needs the tenant
       has no other way to see it. */
    tenantId,
    template: message.template,
    to: message.to,
    data: message.data,
    idempotencyKey: message.idempotencyKey,
  });
}

/** Build the key for an athlete lifecycle notification. One per athlete per
 *  destination state, so re-approving after a suspension does send again. */
export function athleteNotificationKey(
  template: EmailTemplate,
  athleteId: string,
  occurrence: string | number,
): string {
  return `${template}:${athleteId}:${occurrence}`;
}
