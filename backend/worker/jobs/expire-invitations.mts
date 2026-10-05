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
 * IT ALSO SENDS P4-INT-01's OTHER TWO EMAILS — the reminder and the expiry
 * warning — because the same sweep already has the rows in front of it and a
 * second timer over the same table would be two things to keep in step. The
 * expiry itself still sends nothing: an athlete who let an offer lapse does
 * not need telling, and BTG sees it on the roster.
 */
import type pg from "pg";

export type ExpiryOutcome = { expired: number; reminded: number; warned: number };

/* 2S8-OPS-02 — THE CLOCK IS READ IN UTC. The timestamp columns hold UTC as
   `timestamp without time zone`; bare `now()` is a timestamptz, and comparing
   the two makes Postgres read the column in the SESSION's zone. On a database
   running in Asia/Manila that expired every invitation eight hours early.
   `now() AT TIME ZONE 'UTC'` is UTC wall-clock time, whatever the session. */
const NOW = `(now() AT TIME ZONE 'UTC')`;

/** Days after sending with no response before a nudge. */
const REMINDER_AFTER_DAYS = 3;
/** Days before expiry that the warning goes out. */
const WARN_WITHIN_DAYS = 2;

export async function expireInvitations(
  pool: pg.Pool,
  appUrl: string,
  /** Only these tenants' invitations (tests); every tenant's when omitted. */
  opts: { tenantIds?: string[] } = {},
): Promise<ExpiryOutcome> {
  const tenants = opts.tenantIds ?? null;
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
          AND "expiresAt" <= ${NOW}
          AND ($1::text[] IS NULL OR "tenantId" = ANY($1::text[]))
        RETURNING id, "tenantId"`,
      [tenants],
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

    /* P4-INT-01's other two emails. The acceptance asks for invitation,
       reminder AND expiry-warning "all send as queued jobs" — the first was
       enqueued by inviteAthlete and these two had templates nobody sent.

       Both are enqueued straight onto the outbox as notify.email rows, with
       an idempotency key per invitation per kind. The sweep runs hourly, so
       without the key an athlete would be reminded once an hour for three
       days; EmailSendLog's unique key is what actually stops that, and the
       key is what makes it stop at one. */
    const reminded = await client.query(
      `INSERT INTO "OutboxJob" (id, "tenantId", name, payload)
       SELECT gen_random_uuid()::text, i."tenantId", 'notify.email',
              jsonb_build_object(
                'template', 'invitation.reminder',
                'to', a.email,
                'data', jsonb_build_object(
                  'firstName', split_part(a."legalName", ' ', 1),
                  'sponsorName', s.name,
                  'portalUrl', $1::text || '/athlete/invitations'),
                'idempotencyKey', 'invitation.reminder:' || i.id)
         FROM "CampaignInvite" i
         JOIN "Athlete" a  ON a.id = i."athleteId"
         JOIN "Campaign" c ON c.id = i."campaignId"
         JOIN "Sponsor" s  ON s.id = c."sponsorId"
        WHERE i.state = 'INVITED'
          AND i."viewedAt" IS NULL
          AND i."sentAt" <= ${NOW} - ($2 || ' days')::interval
          AND i."expiresAt" > ${NOW}
          AND ($3::text[] IS NULL OR i."tenantId" = ANY($3::text[]))`,
      [appUrl, REMINDER_AFTER_DAYS, tenants],
    );

    const warned = await client.query(
      `INSERT INTO "OutboxJob" (id, "tenantId", name, payload)
       SELECT gen_random_uuid()::text, i."tenantId", 'notify.email',
              jsonb_build_object(
                'template', 'invitation.expiring',
                'to', a.email,
                'data', jsonb_build_object(
                  'firstName', split_part(a."legalName", ' ', 1),
                  'sponsorName', s.name,
                  'expiresOn', to_char(i."expiresAt", 'YYYY-MM-DD'),
                  'portalUrl', $1::text || '/athlete/invitations'),
                'idempotencyKey', 'invitation.expiring:' || i.id)
         FROM "CampaignInvite" i
         JOIN "Athlete" a  ON a.id = i."athleteId"
         JOIN "Campaign" c ON c.id = i."campaignId"
         JOIN "Sponsor" s  ON s.id = c."sponsorId"
        WHERE i.state IN ('INVITED', 'VIEWED')
          AND i."expiresAt" > ${NOW}
          AND i."expiresAt" <= ${NOW} + ($2 || ' days')::interval
          AND ($3::text[] IS NULL OR i."tenantId" = ANY($3::text[]))`,
      [appUrl, WARN_WITHIN_DAYS, tenants],
    );

    await client.query("COMMIT");
    return {
      expired: expired.rowCount ?? 0,
      reminded: reminded.rowCount ?? 0,
      warned: warned.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
