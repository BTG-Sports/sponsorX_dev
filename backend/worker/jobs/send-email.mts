/**
 * The email job handler — P3-INT-01, G-04, Guide §10.
 *
 * **The only file in the repo that imports the email vendor.** G-04 chose
 * Resend, and `stack-decision.md` keeps that decision revisitable; a swap to
 * Postmark or SES should change this file and nothing else. The domain layer
 * calls `send()` in `src/lib/email.ts`, which writes an outbox row and knows
 * no vendor at all.
 *
 * Raw `pg` rather than Prisma, matching the worker entry: this process is not
 * bundled and the generated client is ESM-syntax TypeScript.
 *
 * ── WHY THIS HANDLER KEEPS ITS OWN LEDGER ───────────────────────────────────
 *
 * The outbox drain is at-least-once (P2-BE-05): it sends to pg-boss, then
 * marks rows dispatched, so a crash between those steps re-delivers. pg-boss
 * itself also retries a failed job. Both are correct, and both mean this
 * handler can be asked to send the same message more than once.
 *
 * So before sending it claims the message's `idempotencyKey` with an INSERT
 * that will conflict on a second attempt. Claiming *before* sending rather
 * than recording after is the important ordering: recording after leaves a
 * window where the email went out and the crash happened before the note,
 * which sends twice. Claiming first can at worst lose a message when the
 * vendor call fails after the claim — so a failed send releases the claim.
 */

import pg from "pg";

import { MUTABLE_EVENTS } from "../../src/domain/notification-rules.ts";

export type EmailJob = {
  tenantId: string;
  template: string;
  to: string;
  data: Record<string, string>;
  idempotencyKey: string;
  /** Fan emails only (P6-SEC-03): the claim whose consent this send relies on. */
  fanEventId?: string;
};

/**
 * Subject and body per template. Data, not code, so adding a message is a
 * table entry — and so that someone who is not a developer can be asked
 * whether the wording is right.
 *
 * Plain text only in Phase 1. HTML mail brings a rendering pipeline, inlined
 * CSS and a preview tool, none of which the loop in §39 needs to work.
 */
const TEMPLATES: Record<string, (d: Record<string, string>) => { subject: string; text: string }> = {
  "athlete.applicationReceived": (d) => ({
    subject: "We have your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for applying to the SponsorX Athlete Network. Our team reviews every application by hand, so this takes a few days rather than minutes.\n\nWe will email you as soon as there is a decision.\n\n— BTG SponsorX`,
  }),
  "athlete.approved": (d) => ({
    subject: "You are in — welcome to the SponsorX Athlete Network",
    text: `Hi ${d.firstName ?? "there"},\n\nYour application has been approved. Sign in with this email address and complete your profile here:\n\n${d.portalUrl ?? ""}\n\nThe more complete your profile, the more campaigns you will be matched with.\n\n— BTG SponsorX`,
  }),
  "athlete.changesRequested": (d) => ({
    subject: "One thing to fix on your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe need a change before we can approve your application:\n\n${d.reviewerNotes ?? "Please check your application for missing details."}\n\nUpdate it here and resubmit — you do not need to start again:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* P3-BE-16 — the decision on a profile change the athlete proposed. */
  "athlete.profileChangeApproved": (d) => ({
    subject: "Your SponsorX profile change is live",
    text: `Hi ${d.firstName ?? "there"},

The change you sent to your profile (${d.sections ?? "your profile"}) has been approved and is now live.

${d.portalUrl ?? ""}

— BTG SponsorX`,
  }),
  "athlete.profileChangeDeclined": (d) => ({
    subject: "About the change to your SponsorX profile",
    text: `Hi ${d.firstName ?? "there"},

We couldn't approve the change you sent to your profile (${d.sections ?? "your profile"}):

${d.reviewerNotes ?? ""}

Your profile is unchanged. You can send a new change from your portal:

${d.portalUrl ?? ""}

— BTG SponsorX`,
  }),
  "athlete.rejected": (d) => ({
    subject: "About your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe are not able to approve your application at this time.\n\n${d.reviewerNotes ?? ""}\n\nThis is not necessarily permanent — the network grows, and sponsor demand changes by sport and region.\n\n— BTG SponsorX`,
  }),
  "invitation.sent": (d) => ({
    subject: `${d.sponsorName ?? "A sponsor"} wants to work with you`,
    text: `Hi ${d.firstName ?? "there"},\n\nYou have a new campaign invitation${d.sponsorName ? ` from ${d.sponsorName}` : ""}.\n\n${d.jobName ?? "The work"}${d.offered ? ` — ${d.offered}` : ""}\n\nOpen it to see the full terms and decide:\n\n${d.portalUrl ?? ""}\n\nIt expires on ${d.expiresOn ?? "the date shown in your portal"}.\n\n— BTG SponsorX`,
  }),
  /* 2S5-INT-02 — the sponsor's receipt, sent once the payment provider
     confirms the card payment. No card details: SponsorX never had them. */
  "payment.received": (d) => ({
    subject: `Payment received for order ${d.orderRef ?? ""} — ${d.amount ?? ""}`,
    text: `Your card payment for order ${d.orderRef ?? ""} has been confirmed by our payment provider.\n\n${d.lines ?? ""}\n\nPaid: ${d.amount ?? ""}\n\nYour order is now in delivery. View it here:\n\n${d.orderUrl ?? ""}\n\nYou paid on the payment provider's secure page. SponsorX never sees your card, and this email never includes card details.\n\n— BTG SponsorX`,
  }),
  /* 2S5-BE-05 — a payee's payout, from BTG's decision to the money arriving. */
  "payout.approved": (d) => ({
    subject: `BTG approved your payout of ${d.amount ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has approved your payout of ${d.amount ?? ""}. It's on its way to your payout account — we'll email you again when it has been paid.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "payout.paid": (d) => ({
    subject: `Your payout of ${d.amount ?? ""} has been paid`,
    text: `Hi ${d.firstName ?? "there"},\n\nYour payout of ${d.amount ?? ""} has been paid, confirmed by our payment provider. It may take a few days to show in your bank.\n\nWhat it covers:\n${d.orders ?? ""}\n\nView it in SponsorX:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "payout.sentBack": (d) => ({
    subject: "About your SponsorX payout request",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG couldn't approve your payout request of ${d.amount ?? ""} yet:\n\n${d.note ?? ""}\n\nThe money is still yours and available to request again from your portal:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),

  /* P6-INT-02 — the fan's voucher. The ONLY template addressed to a member
     of the public rather than to an athlete or staff, which is why the
     consent gate in `recordClaim` stands in front of it. It carries the code,
     the offer, where to use it and when it runs out, because a fan who has to
     log in to find any of those has been sent a useless email — and there is
     no login for them to use. */
  "reward.claimed": (d) => ({
    subject: `Your ${d.offerText ?? "reward"} — code ${d.code ?? ""}`,
    text: `Here is your reward.\n\n${d.offerText ?? ""}\n\nCode: ${d.code ?? ""}\n\nShow this code to claim it. Valid until ${d.expiresOn ?? "the date on the offer"}.\n\n${d.terms ?? ""}\n\n— BTG SponsorX\n\nDon't want emails from us? Unsubscribe in one tap: ${d.unsubscribeUrl ?? ""}`,
  }),

  /* P5-INT-01 — the three deliverable messages. All to the athlete: BTG sees
     the queue in their own workspace and does not need mail about it. */
  "deliverable.dueSoon": (d) => ({
    subject: `Due ${d.dueOn ?? "soon"}: ${d.title ?? "your deliverable"}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.title ?? "A deliverable"} for ${d.campaignName ?? "your campaign"} is due on ${d.dueOn ?? "its due date"}.\n\nUpload it here:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "deliverable.revisionRequested": (d) => ({
    subject: `A change is needed: ${d.title ?? "your deliverable"}`,
    /* The reason is mandatory upstream (RevisionReasonRequiredError), so it
       is quoted rather than defaulted — an email saying "changes requested"
       with no reason is an instruction the athlete cannot follow. */
    text: `Hi ${d.firstName ?? "there"},\n\nWe need a change to ${d.title ?? "your deliverable"} before it can be approved:\n\n${d.reason ?? ""}\n\nYou do not need to start again — update and resubmit here:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "deliverable.approved": (d) => ({
    subject: `Approved: ${d.title ?? "your deliverable"}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.title ?? "Your deliverable"} has been approved${d.campaignName ? ` for ${d.campaignName}` : ""}.\n\nOnce it is live, mark it published in your portal and add the link — that is what lets us verify it and release your earnings.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),

  "invitation.reminder": (d) => ({
    subject: "You have an open SponsorX invitation",
    text: `Hi ${d.firstName ?? "there"},\n\nYou still have an invitation waiting${d.sponsorName ? ` from ${d.sponsorName}` : ""}. There is nothing wrong — we just did not want it to get lost.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "invitation.expiring": (d) => ({
    subject: "Your SponsorX invitation expires soon",
    text: `Hi ${d.firstName ?? "there"},\n\nYour invitation${d.sponsorName ? ` from ${d.sponsorName}` : ""} expires on ${d.expiresOn ?? "shortly"}. After that the sponsor may offer the work to someone else.\n\nIf you are not interested, declining is genuinely helpful — it lets us fill the slot.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* P9-BE-13, §5.6 — SponsorX declined a business a student brought in.
     It says plainly that their sales credit is untouched, because that is a
     requirement and not a courtesy, and offers the categories still open. */
  "student.prospectDeclined": (d) => ({
    subject: `About ${d.businessName ?? "your prospect"}`,
    text: `Hi ${d.studentName ?? "there"},\n\nSponsorX can't take on ${d.businessName ?? "this business"} right now (reason: ${(d.reason ?? "OTHER").replace(/_/g, " ").toLowerCase()}).\n\nThis doesn't count against you — your sales credit and points are unchanged.${d.openCategories ? `\n\nCategories still open at your school: ${d.openCategories}.` : ""}\n\n— SponsorX NEXT`,
  }),
  /* 2S1-INT-01 — the five onboarding messages, to the organisation's primary
     contact. Every refusal quotes the reviewer's note, which is mandatory
     upstream (NEEDS_NOTE), because "changes requested" with no reason is an
     instruction nobody can follow. */
  "onboarding.received": (d) => ({
    subject: `We have ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nThanks for applying to sell on SponsorX. We verify every organisation by hand, so this takes a few days rather than minutes.\n\nWe will email you as soon as there is a decision.\n\n— BTG SponsorX`,
  }),
  "onboarding.changesRequested": (d) => ({
    subject: `One thing to fix on ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe need a change before we can approve ${d.orgName ?? "your organisation"}:\n\n${d.notes ?? ""}\n\nYour answers are saved. Update them and resubmit here — you do not need to start again:\n\n${d.resumeUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-05 — BTG's decision on a request to sponsor. */
  "sponsor.accountOpened": (d) => ({
    subject: "Your SponsorX sponsor account is ready",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has opened a sponsor account for ${d.businessName ?? "your business"} on SponsorX. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\nFrom there you can browse athletes and teams, and send BTG a brief.\n\n— BTG SponsorX`,
  }),
  "sponsor.requestDeclined": (d) => ({
    subject: "About your SponsorX sponsor request",
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for asking to sponsor on SponsorX. BTG can't open an account for ${d.businessName ?? "you"} yet:\n\n${d.note ?? ""}\n\nYou can reply to this email with any questions.\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-17 — automatic approval, and BTG's reject / reinstate after it. */
  "sponsor.confirmEmail": (d) => ({
    subject: "Confirm your email for SponsorX",
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for asking to sponsor on SponsorX for ${d.businessName ?? "your business"}. Confirm this is your email address:\n\n${d.confirmUrl ?? ""}\n\nOnce your email is confirmed and your proof of business is uploaded, we open your account — usually straight away.\n\n— BTG SponsorX`,
  }),
  "sponsor.newSponsor": (d) => ({
    subject: `New sponsor: ${d.businessName ?? "a business"} ${d.outcome ?? ""}`.trim(),
    text: `${d.businessName ?? "A business"} ${d.outcome ?? "asked to sponsor"} on SponsorX.${d.reasons ? `\n\nWhy it is waiting for you:\n${d.reasons}` : ""}\n\nOpen the request:\n\n${d.reviewUrl ?? ""}\n\nIf the submission looks bogus, reject it from that page — the sponsor's sign-in is switched off and they are told why.\n\n— SponsorX`,
  }),
  "sponsor.accountRejected": (d) => ({
    subject: "Your SponsorX sponsor account has been closed",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has closed the sponsor account for ${d.businessName ?? "your business"} on SponsorX:\n\n${d.note ?? ""}\n\nIf you think this is a mistake, contact BTG support:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "offer.changeRequested": (d) => ({
    subject: `Change requested: ${d.sponsorName ?? "a sponsor"} · ${d.campaignName ?? "a campaign"}`,
    text: `${d.athleteName ?? "An athlete"} asked for a change to the offer on ${d.sponsorName ?? "a sponsor"}'s ${d.campaignName ?? "campaign"}:\n\n${d.note ?? ""}\n\nThe offer is still open — they can accept or decline it as it stands. Its terms are fixed once sent, so to change them withdraw it and send a revised offer, or tell them it stands.\n\nThe campaign:\n\n${d.campaignUrl ?? ""}\n\n— SponsorX`,
  }),
  "sponsor.accountReinstated": (d) => ({
    subject: "Your SponsorX sponsor account is open again",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has reopened the sponsor account for ${d.businessName ?? "your business"}. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.approved": (d) => ({
    subject: `${d.orgName ?? "Your organisation"} is approved on SponsorX`,
    text: `Hi ${d.contactName ?? "there"},\n\n${d.orgName ?? "Your organisation"} has been approved. Your account is ready: sign in with this email address to reach your property portal.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.rejected": (d) => ({
    subject: `About ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe are not able to approve ${d.orgName ?? "your organisation"} at this time.\n\n${d.notes ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.suspended": (d) => ({
    subject: `${d.orgName ?? "Your organisation"}'s SponsorX listings are paused`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe have paused ${d.orgName ?? "your organisation"}'s access to list on SponsorX:\n\n${d.notes ?? ""}\n\nNothing has been deleted. Reply to this email and our team will work through it with you.\n\n— BTG SponsorX`,
  }),
  "guardian.verificationRequested": (d) => ({
    subject: `Please confirm you authorise ${d.athleteName ?? "an athlete"} to join SponsorX`,
    text: `Hi ${d.guardianName ?? "there"},\n\n${d.athleteName ?? "An athlete"} has listed you as their parent or guardian on a SponsorX application. Because they are under 18, we need your authorisation before they can take part in any paid campaign.\n\nA member of the BTG team will contact you to confirm.\n\n— BTG SponsorX`,
  }),
};

/**
 * Templates addressed to a member of the public — P6-SEC-03.
 *
 * "An unsubscribe link in every fan email." Every template here must print
 * `unsubscribeUrl`, and the handler refuses to send one without it and
 * without the consent record it relies on. A template added for fans but
 * left out of this set is caught by the test that reads the enqueue sites.
 */
export const FAN_TEMPLATES: ReadonlySet<string> = new Set(["reward.claimed"]);

/** From address. A verified sending domain is required before any of this
 *  leaves the building — see the note in the task board for P3-INT-01. */
const FROM = process.env.EMAIL_FROM ?? "SponsorX <noreply@sponsorx.net>";

/**
 * Claim the key, send, and release the claim if the vendor rejects it.
 *
 * Returns `"duplicate"` when the key was already claimed, which is a success
 * for the queue's purposes — the message has been sent once, which is what
 * was asked for.
 */
/**
 * 2S6-BE-02 — has the recipient muted this event on email? Read at send time,
 * so a mute set after the job was queued still holds. The recipient is found
 * the way the message found them: a user in the job's tenant with that
 * address, or the user linked to the athlete with that address (athlete mail
 * goes to the athlete record's email). Only a mutable event can be muted —
 * a stray row can never silence a decision notice.
 */
export async function mutedFor(pool: pg.Pool, job: Pick<EmailJob, "tenantId" | "template" | "to">): Promise<boolean> {
  if (!(MUTABLE_EVENTS as readonly string[]).includes(job.template)) return false;
  const { rowCount } = await pool.query(
    `SELECT 1 FROM "NotificationPreference" np
       JOIN "User" u ON u.id = np."userId" AND u."tenantId" = np."tenantId"
      WHERE np."tenantId" = $1 AND np.event = $2 AND np.channel = 'EMAIL' AND np.muted
        AND (lower(u.email) = lower($3)
             OR u."athleteId" IN (SELECT a.id FROM "Athlete" a WHERE a."tenantId" = $1 AND lower(a.email) = lower($3)))
      LIMIT 1`,
    [job.tenantId, job.template, job.to],
  );
  return (rowCount ?? 0) > 0;
}

export async function handleSendEmail(
  pool: pg.Pool,
  job: EmailJob,
): Promise<"sent" | "duplicate" | "withdrawn" | "muted"> {
  const build = TEMPLATES[job.template];
  if (!build) {
    /* Unknown template. Throwing lets pg-boss retry and then park it, which
       is right: the alternative — swallowing it — is an email nobody ever
       learns was never sent. */
    throw new Error(`No email template named ${JSON.stringify(job.template)}.`);
  }

  const fan = FAN_TEMPLATES.has(job.template);
  if (fan) {
    if (!job.fanEventId || !job.data.unsubscribeUrl) {
      throw new Error(
        `${job.template} is a fan email and must carry fanEventId and unsubscribeUrl (P6-SEC-03).`,
      );
    }
    /* Re-checked at send time, in SQL: a fan who unsubscribed between the
       claim and this job running is not emailed. Same rule as `mayContact()`
       on the API side, expressed in the WHERE clause. */
    const ok = await pool.query(
      `SELECT 1 FROM "RewardEvent"
        WHERE id = $1 AND "fanEmail" IS NOT NULL
          AND "consentVersion" IS NOT NULL AND "consentWithdrawnAt" IS NULL`,
      [job.fanEventId],
    );
    if (ok.rowCount === 0) return "withdrawn";
  }

  /* Before the claim: a muted message is not sent, and not recorded as sent. */
  if (await mutedFor(pool, job)) return "muted";

  const claimed = await pool.query(
    `INSERT INTO "EmailSendLog" ("idempotencyKey", "tenantId", template, "to")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("idempotencyKey") DO NOTHING
     RETURNING "idempotencyKey"`,
    [job.idempotencyKey, job.tenantId, job.template, job.to],
  );
  if (claimed.rowCount === 0) return "duplicate";

  const { subject, text } = build(job.data);

  try {
    /* The vendor, imported lazily and only here. Lazy so that the worker can
       boot, drain and run every other job type with no email credentials at
       all — which is exactly the state of a fresh developer machine. */
    const { Resend } = await import("resend");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: FROM,
      to: job.to,
      subject,
      text,
      /* RFC 8058 one-click: mail clients show their own "Unsubscribe" button
         and POST to this URL, which the web app forwards to the API. */
      ...(fan
        ? {
            headers: {
              "List-Unsubscribe": `<${job.data.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    });
    if (result.error) throw new Error(`Resend rejected the message: ${result.error.message}`);
  } catch (error) {
    /* Release the claim so a retry can genuinely try again. Without this a
       transient vendor outage would permanently suppress the message, which
       is a worse failure than sending twice. */
    await pool
      .query(`DELETE FROM "EmailSendLog" WHERE "idempotencyKey" = $1`, [job.idempotencyKey])
      .catch(() => {});
    throw error;
  }

  return "sent";
}

export { TEMPLATES as EMAIL_TEMPLATES };
