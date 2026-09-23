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

export type EmailJob = {
  tenantId: string;
  template: string;
  to: string;
  data: Record<string, string>;
  idempotencyKey: string;
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
    text: `Hi ${d.firstName ?? "there"},\n\nYour application has been approved. You can sign in and complete your profile here:\n\n${d.portalUrl ?? ""}\n\nThe more complete your profile, the more campaigns you will be matched with.\n\n— BTG SponsorX`,
  }),
  "athlete.changesRequested": (d) => ({
    subject: "One thing to fix on your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe need a change before we can approve your application:\n\n${d.reviewerNotes ?? "Please check your application for missing details."}\n\nUpdate it here and resubmit — you do not need to start again:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "athlete.rejected": (d) => ({
    subject: "About your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe are not able to approve your application at this time.\n\n${d.reviewerNotes ?? ""}\n\nThis is not necessarily permanent — the network grows, and sponsor demand changes by sport and region.\n\n— BTG SponsorX`,
  }),
  "invitation.sent": (d) => ({
    subject: `${d.sponsorName ?? "A sponsor"} wants to work with you`,
    text: `Hi ${d.firstName ?? "there"},\n\nYou have a new campaign invitation${d.sponsorName ? ` from ${d.sponsorName}` : ""}.\n\n${d.jobName ?? "The work"}${d.offered ? ` — ${d.offered}` : ""}\n\nOpen it to see the full terms and decide:\n\n${d.portalUrl ?? ""}\n\nIt expires on ${d.expiresOn ?? "the date shown in your portal"}.\n\n— BTG SponsorX`,
  }),
  /* P6-INT-02 — the fan's voucher. The ONLY template addressed to a member
     of the public rather than to an athlete or staff, which is why the
     consent gate in `recordClaim` stands in front of it. It carries the code,
     the offer, where to use it and when it runs out, because a fan who has to
     log in to find any of those has been sent a useless email — and there is
     no login for them to use. */
  "reward.claimed": (d) => ({
    subject: `Your ${d.offerText ?? "reward"} — code ${d.code ?? ""}`,
    text: `Here is your reward.\n\n${d.offerText ?? ""}\n\nCode: ${d.code ?? ""}\n\nShow this code to claim it. Valid until ${d.expiresOn ?? "the date on the offer"}.\n\n${d.terms ?? ""}\n\n— BTG SponsorX`,
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
  "guardian.verificationRequested": (d) => ({
    subject: `Please confirm you authorise ${d.athleteName ?? "an athlete"} to join SponsorX`,
    text: `Hi ${d.guardianName ?? "there"},\n\n${d.athleteName ?? "An athlete"} has listed you as their parent or guardian on a SponsorX application. Because they are under 18, we need your authorisation before they can take part in any paid campaign.\n\nA member of the BTG team will contact you to confirm.\n\n— BTG SponsorX`,
  }),
};

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
export async function handleSendEmail(
  pool: pg.Pool,
  job: EmailJob,
): Promise<"sent" | "duplicate"> {
  const build = TEMPLATES[job.template];
  if (!build) {
    /* Unknown template. Throwing lets pg-boss retry and then park it, which
       is right: the alternative — swallowing it — is an email nobody ever
       learns was never sent. */
    throw new Error(`No email template named ${JSON.stringify(job.template)}.`);
  }

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
    const result = await resend.emails.send({ from: FROM, to: job.to, subject, text });
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
