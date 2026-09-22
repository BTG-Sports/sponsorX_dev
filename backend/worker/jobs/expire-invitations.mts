/**
 * Invitation expiry — P4-BE-05, §21.
 *
 * An offer with a deadline that nobody enforces is not an offer with a
 * deadline. Without this job an invitation sits INVITED forever, the athlete
 * can accept work the campaign has moved past, and the partial unique index
 * keeps refusing a fresh invitation because a stale one still counts as open.
 *
 * WHY A SWEEP AND NOT A SCHEDULED JOB PER INVITE. One row per invitation in
 * pg-boss would mean thousands of timers whose only purpose is a comparison
 * the database can do in one statement — and a per-invite job that is lost
 * leaves that invitation open forever, where a missed sweep simply catches
 * everything on its next run. The sweep is idempotent by construction.
 *
 * IT DOES NOT NOTIFY. An athlete who ignored an invitation for a week does
 * not need an email telling them so, and BTG sees it on the roster. If that
 * turns out to be wrong it is a template and an enqueue, not a redesign.
 */
import type pg from "pg";

export type ExpiryOutcome = { expired: number };

export async function expireInvitations(pool: pg.Pool): Promise<ExpiryOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* One statement, and the audit rows come from the same one. Doing it in
       two passes would leave a window where invitations are expired and
       unaudited — §26 wants the log to match the data, not to approximate it.

       Only INVITED and VIEWED are touched: those are the open states the
       partial unique index covers, and an ACCEPTED invitation past its
       expiry is a commitment, not a lapse. */
    const expired = await client.query<{ id: string; tenantId: string }>(
      `UPDATE "CampaignInvite"
          SET state = 'EXPIRED'
        WHERE state IN ('INVITED', 'VIEWED')
          AND "expiresAt" <= now()
        RETURNING id, "tenantId"`,
    );

    if (expired.rowCount) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "tenantId", "actorId", action, entity, "entityId", after)
         SELECT gen_random_uuid()::text, t."tenantId", NULL, 'invitation.expire',
                'CampaignInvite', t.id, '{"state":"EXPIRED"}'::jsonb
           FROM unnest($1::text[], $2::text[]) AS t(id, "tenantId")`,
        [expired.rows.map((r) => r.id), expired.rows.map((r) => r.tenantId)],
      );
    }

    await client.query("COMMIT");
    return { expired: expired.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
