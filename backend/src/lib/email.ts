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
  /* P9-BE-20 — a school's advisors hear, once a day, who the system
     approved from their roster. */
  | "student.autoApprovedDigest"
  /* P9-BE-21 — SALES (or BTG admins) hear once of a prospect held for them. */
  | "studentProspect.heldForSales"
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
  /* 2S1-BE-06 — automatic approval: the contact confirms their email; BTG
     admins hear of every new organisation; a Reject after approval, and a
     reinstatement. 2S1-BE-07 — BTG admins hear of every document change. */
  | "onboarding.confirmEmail"
  | "onboarding.newOrganization"
  | "onboarding.accountRejected"
  | "onboarding.reinstated"
  | "onboarding.documentChanged"
  /* 2S1-BE-05 — BTG's decision on a business asking to sponsor. */
  | "sponsor.accountOpened"
  | "sponsor.requestDeclined"
  /* 2S1-BE-17 — automatic approval: the applicant confirms their email; BTG
     hears of every new sponsor; a rejection after approval, and a reinstatement. */
  | "sponsor.confirmEmail"
  | "sponsor.newSponsor"
  | "sponsor.accountRejected"
  | "sponsor.accountReinstated"
  /* 2S2-FE-03 — an athlete asks for a change to a sent offer; to the
     campaign manager(s). */
  | "offer.changeRequested"
  /* 2S2-FE-03 follow-up — the athlete (and a minor's guardian) hears that an
     offer was sent; that BTG kept it as it stands, with BTG's reply; or that
     BTG is revising it and a new one is coming. */
  | "offer.sent"
  | "offer.changeKept"
  | "offer.revising"
  /* 2S4-BE-06 — a seller (the team's manager, the athlete) hears of each
     sale: when it is approved, and when the sponsor has paid. */
  | "sale.approved"
  | "sale.paid"
  /* 2S4-BE-07 / -08 — delivery: the sponsor is asked to confirm; the seller
     hears it was confirmed, or put on hold by a problem; BTG hears of each
     problem; everyone hears BTG's decision; a late seller is reminded. */
  | "delivery.marked"
  | "delivery.confirmed"
  /* 2S4-BE-11 — a problem settled between the seller and the sponsor, or handed to BTG. */
  | "delivery.problemToAnswer"
  | "delivery.sellerAnswered"
  | "delivery.settled"
  | "delivery.escalated"
  | "delivery.withBtg"
  | "delivery.resolved"
  | "delivery.overdue"
  /* 2S4-BE-12 — cancelling a paid line: the sponsor's cancellation confirmed;
     the seller told a line was cancelled; the seller asked to cancel (with the
     deadline); the sponsor told the seller's answer; a seller's cancellation
     told to the sponsor; a request the seller declined or didn't answer, to BTG. */
  | "delivery.cancelConfirmed"
  | "sale.lineCancelled"
  | "sale.cancellationRequested"
  | "delivery.cancellationAnswered"
  | "delivery.sellerCancelled"
  | "delivery.cancellationEscalated"
  /* 2S4-BE-13 — the sponsor's refund was sent (by Finance, or to the card by the provider). */
  | "refund.sent"
  /* 2S2-BE-05 — a team invites an athlete already on SponsorX; the team
     hears the answer; either side ending the link tells the other. */
  | "team.invited"
  | "team.invitationAnswered"
  | "team.linkEnded"
  /* 2S1-BE-13 — closing an account and coming back: the owner is told it
     closed (with the reactivation link), sent a fresh link on request, and
     told when it is back; a rejected account's request reaches BTG admins,
     and BTG's "no" reaches the person. */
  | "account.closed"
  | "account.reactivationLink"
  | "account.reactivated"
  | "account.reactivationRequested"
  | "account.reactivationDeclined"
  /* 2S1-BE-14 — BTG admins are told about sensitive profile edits only. */
  | "athlete.sensitiveEdit"
  /* 2S1-BE-15 — the guardian handoff: the new guardian confirms their email;
     the current guardian is asked; a decline points to BTG support; the
     switch is told to all three and to BTG admins. */
  | "handoff.confirmEmail"
  | "handoff.requested"
  | "handoff.declined"
  | "handoff.declinedByBtg"
  | "handoff.switchedNew"
  | "handoff.switchedPrevious"
  | "handoff.switchedAthlete"
  | "handoff.btgNotice"
  /* 2S1-BE-15 — a dispute decided by hand: a BTG admin replaced a guardian
     (both guardians and the athlete are told, with the reason); and a
     handoff waiting for BTG because "BTG staff confirm minors" is on. */
  | "guardian.replacedByBtg"
  | "handoff.staffConfirm"
  /* 2S1-BE-16 — a contact-form message to the support mailbox, and the
     sender's copy. */
  | "support.message"
  | "support.copy"
  /* 2S1-BE-09 / -10 — athletes and guardians approved automatically: the
     athlete's email confirmation, the guardian's set-up link and approval,
     BTG told of every new sign-up, and BTG's Reject / Reinstate after it. */
  | "athlete.confirmEmail"
  | "guardian.setup"
  | "guardian.approved"
  | "signup.newSignup"
  | "athlete.accountRejected"
  | "athlete.accountReinstated"
  | "guardian.accountRejected"
  | "guardian.accountReinstated"
  /* 2S1-BE-11 — a minor uploaded content; their guardian hears of each one. */
  | "guardian.contentUploaded"
  /* P5-BE-09 — a draft that failed the automatic checks goes back to the
     athlete, each failure in words; a draft waiting over 48 hours on its
     reviewer reminds BTG's campaign managers, or the sponsor's admins. */
  | "deliverable.checksFailed"
  | "deliverable.btgReviewReminder"
  | "deliverable.sponsorReviewReminder"
  /* 2S1-BE-12 — coming of age: the start, the reminders, taking over, the
     end of the allowance, the link the guardian sends, and BTG's settling. */
  | "comingOfAge.started"
  | "comingOfAge.reminder"
  | "comingOfAge.completed"
  | "comingOfAge.terminated"
  | "comingOfAge.uploadLink"
  | "comingOfAge.btgSettle"
  /* 2S3-BE-06 — listings publish automatically: the seller hears it is live,
     or held ("BTG is taking a look"); BTG's admins hear of each held listing
     and, once a day, get one summary of what went live on its own; the
     seller hears BTG's decision, pause or end, with the reason; and, when an
     account comes back, of any listing that stays paused and why. */
  | "listing.live"
  | "listing.held"
  | "listing.heldForBtg"
  | "listing.autoPublishedDigest"
  | "listing.changesRequested"
  | "listing.pausedByBtg"
  | "listing.endedByBtg"
  | "listing.staysPaused"
  /* 2S4-BE-09 — order approval, automated: a seller is asked to accept an
     order a listing of theirs asks to approve (and told if their 48 hours
     ran out); the sponsor hears the seller's answer, or that nobody
     answered; BTG's admins hear of each order held for them, and once a day
     get one summary of what was approved on its own. */
  | "sale.approvalRequested"
  | "sale.approvalExpired"
  | "order.sellerAccepted"
  | "order.sellerDeclined"
  | "order.sellerNoAnswer"
  | "order.heldForBtg"
  | "order.autoApprovedDigest"
  /* 2S4-BE-10 — payment, automated: approved (pay by), reminded on days
     one and two, cancelled unpaid on day three (and each seller told); the
     receipt, however it was paid. */
  | "order.approved"
  | "order.paymentReminder"
  | "order.cancelledUnpaid"
  | "sale.cancelled"
  | "payment.received"
  /* 2S4-BE-10 — a card payment confirmed for an order no longer waiting for it: BTG's admins refund the sponsor. */
  | "payment.refundNeeded"
  /* 2S5-INT-02 — a provider event SponsorX would not apply on its own (it names nothing SponsorX knows, the amounts disagree, it contradicts what was recorded): BTG's admins, with the reason. */
  | "payment.heldForBtg"
  /* 2S5-BE-03 — a dispute opened (the support mailbox and BTG's admins: the review item), and the provider's decision on it (BTG resolves it). */
  | "dispute.opened"
  | "dispute.providerClosed"
  /* P9-BE-16 — a sold ad slot's artwork on the approval board, each step
     emailed to the other party: a new version is in; it is ready for the
     sponsor's sign-off; a reviewer asked for changes; the sponsor approved. */
  | "editionArtwork.submitted"
  | "editionArtwork.readyForSignOff"
  | "editionArtwork.revisionRequested"
  | "editionArtwork.approved"
  /* P9-BE-22 — the automatic checks sent an upload back: every reason, to the sponsor. */
  | "editionArtwork.checksFailed"
  /* 2S5-BE-07 — the payment provider couldn't send a payout because the
     payee's payout account needs attention: fix it (on the provider's page,
     from the money page) and it is sent again on its own. */
  | "payout.accountNeedsFix"
  /* 2S5-BE-05 — a payout the provider couldn't send (or the bank returned) that now waits on BTG: its admins, with the reason. */
  | "payout.failedForBtg"
  /* P4-BE-09 — campaigns move on their own: BTG's campaign managers hear a
     campaign is ready to launch; the sponsor hears their final report is ready. */
  | "campaign.readyToLaunch"
  | "campaign.finalReportReady"
  /* P4-BE-11 — sponsor briefs approved automatically: the sponsor hears
     their request is approved; BTG's campaign managers hear of each brief
     held for them, with the reasons (which the sponsor never sees). */
  | "brief.autoApproved"
  | "brief.heldForBtg"
  /* P4-BE-12 — automatic staffing stopped and handed the campaign to BTG's
     campaign managers, with the reason. */
  | "campaign.staffingStopped"
  /* P9-BE-18 — a NEXT ad sale the system would not make by itself: SALES
     and BTG's admins hear of it once, with the reasons. */
  | "adSale.heldForSales";

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
  /** 2S1-BE-16 — where a reply goes (a support message replies to its sender). */
  replyTo?: string;
  /** 2S1-BE-16 — threading headers (Message-ID, In-Reply-To, References), so a
   *  reply from the support desk continues the sender's thread. */
  headers?: Record<string, string>;
  /** 2S1-BE-16 — private-bucket objects the worker attaches. Keys only: the
   *  bytes are read by the worker at send time, never stored in the outbox. */
  attachments?: { filename: string; key: string; contentType: string }[];
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
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    ...(message.headers ? { headers: message.headers } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
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
