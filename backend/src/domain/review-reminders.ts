/**
 * The 48-hour review reminders — P5-BE-09 (BTG admin review item 21).
 *
 * A draft that has waited more than REVIEW_REMINDER_HOURS on its reviewer
 * gets ONE reminder to that reviewer:
 *
 *   - waiting on BTG (in the queue after passing its checks, or picked up into
 *     BTG_REVIEW) → BTG's campaign managers;
 *   - waiting on the sponsor (SPONSOR_REVIEW) → the sponsor's admins.
 *
 * ONCE PER DRAFT PER STAGE. `Deliverable.reviewWaitingSince` is set when a
 * draft reaches a reviewer and cleared when it leaves; `reviewRemindedAt` is
 * claimed by a conditional update (only while the wait is the one read and
 * not yet reminded), so overlapping sweeps send once. The email's
 * idempotency key names the stage, the deliverable and the wait's start, so
 * an outbox redelivery is refused by the mailer too. A new draft — a
 * resubmission after a revision — is a new wait, and gets its own reminder.
 *
 * A system sweep with the system actor, like `sweepDeliveries`: each row in
 * its own transaction, so one failure is retried next run and stops nothing
 * else. `opts.tenantIds` scopes it for tests.
 */
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import { REVIEW_REMINDER_HOURS, reviewStage, waitedWords } from "./content-check-rules";

const BATCH = 500;
const appUrl = () => env.APP_URL.replace(/\/+$/, "");

export async function sweepReviewReminders(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { btg: 0, sponsor: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  /* Strictly more than the window: a draft at exactly 48 hours is not late yet. */
  const cutoff = new Date(now.getTime() - REVIEW_REMINDER_HOURS * 3_600_000);

  const due = await prisma.deliverable.findMany({
    /* tenant-scope: the system sweep — every tenant's drafts waiting past the window on a reviewer, not yet reminded; each is handled in its own tenant. */
    where: {
      ...books,
      state: { in: ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"] },
      reviewWaitingSince: { lt: cutoff },
      /* A draft the checks sent back never has a wait: submitDraft clears it
         and a CHECK constraint (migration 20261004200000) holds it there. */
      reviewRemindedAt: null,
    },
    select: { id: true, state: true, reviewWaitingSince: true },
    orderBy: { reviewWaitingSince: "asc" },
    take: BATCH,
  });

  for (const row of due) {
    const stage = reviewStage(row.state);
    const since = row.reviewWaitingSince;
    if (!stage || !since) continue;
    try {
      const sent = await prisma.$transaction(async (tx) => {
        const claimed = await tx.deliverable.updateMany({
          /* tenant-scope: the row the sweep found, by id, only while it is still this unreminded wait. */
          where: { id: row.id, state: row.state, reviewWaitingSince: since, reviewRemindedAt: null },
          data: { reviewRemindedAt: now },
        });
        if (claimed.count !== 1) return false;

        const d = await tx.deliverable.findUniqueOrThrow({
          /* tenant-scope: the row just claimed, by id. */
          where: { id: row.id },
          select: {
            id: true, tenantId: true, title: true,
            order: { select: { athlete: { select: { displayName: true } }, campaign: { select: { id: true, name: true, sponsorId: true } } } },
          },
        });
        const recipients = await tx.user.findMany({
          /* tenant-scope: the deliverable's own tenant — its campaign managers, or its sponsor's admins. */
          where:
            stage === "BTG"
              ? { tenantId: d.tenantId, disabledAt: null, roles: { has: "CAMPAIGN_MGR" } }
              : { tenantId: d.tenantId, disabledAt: null, sponsorId: d.order.campaign.sponsorId, roles: { has: "SPONSOR_ADMIN" } },
          select: { id: true, email: true },
        });
        const reviewUrl =
          stage === "BTG" ? `${appUrl()}/admin/approvals` : `${appUrl()}/sponsor/campaigns/${d.order.campaign.id}`;
        for (const u of recipients) {
          await send(tx, d.tenantId, {
            template: stage === "BTG" ? "deliverable.btgReviewReminder" : "deliverable.sponsorReviewReminder",
            to: u.email,
            idempotencyKey: `deliverable.reviewReminder:${stage}:${d.id}:${since.toISOString()}:${u.id}`,
            data: {
              title: d.title,
              athleteName: d.order.athlete.displayName,
              campaignName: d.order.campaign.name,
              waited: waitedWords(since, now),
              reviewUrl,
            },
          });
        }
        await audit(tx, { userId: null, tenantId: d.tenantId }, AUDIT_ACTIONS.deliverable.reviewReminder, "Deliverable", d.id, {
          after: { stage, waitingSince: since.toISOString(), recipients: recipients.length },
        });
        return true;
      });
      if (sent) out[stage === "BTG" ? "btg" : "sponsor"]++;
    } catch (error) {
      out.failed++;
      console.error(`[review-reminders] reminding about ${row.id} failed, will retry:`, error);
    }
  }
  return out;
}
