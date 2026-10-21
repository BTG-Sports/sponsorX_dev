/**
 * A fan's email, deleted after 90 days — P8-BE-05 (P0-LEG-04; the owner's
 * decision, 2026-10-21).
 *
 * The only personal detail a fan gives is an optional email, to send the
 * reward code (and, if they tick the second box, so the sponsor may contact
 * them). It was kept forever. Now, 90 days after the claim, every copy
 * SponsorX holds is removed:
 *
 *   - the claim's `RewardEvent.fanEmail` (the consent timestamps stay: they
 *     are a record that consent was given and when, not who gave it);
 *   - the address in the sent-email log (`EmailSendLog.to` for the reward
 *     email; the row stays, so the idempotency key still stops a resend);
 *   - the address in the queued-email record (`OutboxJob` payload `to`, for a
 *     dispatched reward email).
 *
 * The counts, the redemptions and the anomaly rules (which look back 30
 * days) are unaffected. A lead already pushed to BTG's CRM (Zoho) is outside
 * SponsorX and is not touched here; pg-boss drops its own finished jobs well
 * inside the window.
 *
 * Run hourly by the worker's retention job; each tenant's sweep is audited.
 */
import { prisma } from "../db/client";
import { audit } from "../db/audit";

export const FAN_EMAIL_RETENTION_DAYS = 90;
/** What a deleted address reads as where the column can't be empty. */
export const DELETED_EMAIL = "(deleted after 90 days)";
const REWARD_TEMPLATE = "reward.claimed";

export type FanPurge = { tenants: number; claims: number; sendLogs: number; outbox: number };

/**
 * The sweep. `tenantIds` narrows it to those tenants (a test's own); the
 * worker passes none and sweeps every tenant.
 */
export async function purgeFanEmails(now = new Date(), opts: { tenantIds?: string[] } = {}): Promise<FanPurge> {
  const cutoff = new Date(now.getTime() - FAN_EMAIL_RETENTION_DAYS * 86_400_000);
  const scope = opts.tenantIds ?? null;
  /* tenant-scope: a platform-wide retention sweep (or the test's tenants); it reads only which tenants have expired addresses. */
  const tenants = await prisma.$queryRaw<Array<{ tenantId: string }>>`
    SELECT DISTINCT "tenantId" FROM "RewardEvent"
     WHERE "fanEmail" IS NOT NULL AND at < ${cutoff} AND (${scope}::text[] IS NULL OR "tenantId" = ANY(${scope}::text[]))
    UNION
    SELECT DISTINCT "tenantId" FROM "EmailSendLog"
     WHERE template = ${REWARD_TEMPLATE} AND "sentAt" < ${cutoff} AND "to" <> ${DELETED_EMAIL} AND (${scope}::text[] IS NULL OR "tenantId" = ANY(${scope}::text[]))
    UNION
    SELECT DISTINCT "tenantId" FROM "OutboxJob"
     WHERE name = 'notify.email' AND "dispatchedAt" IS NOT NULL AND "createdAt" < ${cutoff}
       AND payload->>'fanEventId' IS NOT NULL AND payload->>'to' <> ${DELETED_EMAIL}
       AND (${scope}::text[] IS NULL OR "tenantId" = ANY(${scope}::text[]))`;

  const out: FanPurge = { tenants: 0, claims: 0, sendLogs: 0, outbox: 0 };
  for (const { tenantId } of tenants) {
    const done = await prisma.$transaction(async (tx) => {
      /* tenant-scope: this tenant's claims older than the window. */
      const claims = await tx.rewardEvent.updateMany({ where: { tenantId, fanEmail: { not: null }, at: { lt: cutoff } }, data: { fanEmail: null } });
      /* tenant-scope: this tenant's sent reward emails older than the window. */
      const sendLogs = await tx.emailSendLog.updateMany({
        where: { tenantId, template: REWARD_TEMPLATE, sentAt: { lt: cutoff }, to: { not: DELETED_EMAIL } }, data: { to: DELETED_EMAIL },
      });
      /* tenant-scope: this tenant's dispatched reward emails older than the window. */
      const outbox = await tx.$executeRaw`
        UPDATE "OutboxJob" SET payload = jsonb_set(payload::jsonb, '{to}', to_jsonb(${DELETED_EMAIL}::text))
         WHERE "tenantId" = ${tenantId} AND name = 'notify.email' AND "dispatchedAt" IS NOT NULL AND "createdAt" < ${cutoff}
           AND payload->>'fanEventId' IS NOT NULL AND payload->>'to' <> ${DELETED_EMAIL}`;
      const counts = { claims: claims.count, sendLogs: sendLogs.count, outbox };
      await audit(tx, { userId: null, tenantId }, "fanData.purge", "Tenant", tenantId, {
        after: { ...counts, olderThan: cutoff.toISOString(), retentionDays: FAN_EMAIL_RETENTION_DAYS },
      });
      return counts;
    });
    out.tenants += 1;
    out.claims += done.claims;
    out.sendLogs += done.sendLogs;
    out.outbox += done.outbox;
  }
  return out;
}
