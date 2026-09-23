/**
 * Invitation notifications — P4-INT-01, §39.
 *
 * The handler for `notify.invitationSent`, which `inviteAthlete` has been
 * enqueuing since P4-BE-04 with nothing to consume it. Until now the drain
 * held those rows rather than dispatching them into a queue nobody worked —
 * this is what they were waiting for.
 *
 * IT RESOLVES THE ROW AT SEND TIME, NOT AT ENQUEUE TIME. The outbox payload
 * carries an id and nothing else. An invitation that was declined, expired or
 * withdrawn between the enqueue and the drain must not produce an email
 * saying "you have a new invitation" — so the job reads the current state and
 * skips a closed one. The alternative, embedding the details in the payload,
 * would make every retry send a snapshot of a world that has moved on.
 */
import type pg from "pg";

export type InvitationJob = { inviteId: string };

type Row = {
  state: string;
  expiresAt: Date;
  email: string;
  legalName: string;
  displayName: string;
  sponsorName: string | null;
  jobName: string | null;
  offered: number;
};

export type InvitationNotifyOutcome =
  | { sent: true; to: string }
  | { sent: false; reason: string };

/**
 * Build the email for an open invitation, or say why there is none.
 *
 * Returns the message rather than sending it, so the queueing stays in
 * `send()` (P3-INT-01) and this stays testable without a vendor.
 */
export function buildInvitationEmail(
  row: Row,
  appUrl: string,
): { to: string; data: Record<string, string> } | { skip: string } {
  if (row.state !== "INVITED" && row.state !== "VIEWED") {
    return { skip: `invitation is ${row.state}` };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { skip: "invitation has already expired" };
  }

  const source = row.legalName.trim() || row.displayName.trim();
  return {
    to: row.email,
    data: {
      firstName: source.split(/\s+/)[0] ?? "",
      sponsorName: row.sponsorName ?? "",
      jobName: row.jobName ?? "",
      /* Cents to something a person reads. The column is cents and the
         template must never print one. */
      offered: `$${(row.offered / 100).toFixed(2)}`,
      expiresOn: row.expiresAt.toISOString().slice(0, 10),
      portalUrl: `${appUrl}/athlete/invitations`,
    },
  };
}

export async function handleInvitationSent(
  pool: pg.Pool,
  job: InvitationJob,
  appUrl: string,
): Promise<InvitationNotifyOutcome> {
  const { rows } = await pool.query<Row>(
    `SELECT i.state, i."expiresAt", i.offered,
            a.email, a."legalName", a."displayName",
            s.name AS "sponsorName", j.name AS "jobName"
       FROM "CampaignInvite" i
       JOIN "Athlete" a  ON a.id = i."athleteId"
       JOIN "Campaign" c ON c.id = i."campaignId"
       JOIN "Sponsor" s  ON s.id = c."sponsorId"
       LEFT JOIN "NilJob" j ON j.id = i."jobId"
      WHERE i.id = $1`,
    [job.inviteId],
  );

  const row = rows[0];
  /* A missing invitation is not an error worth retrying — the row is gone and
     no amount of retrying brings it back. Throwing would park the job. */
  if (!row) return { sent: false, reason: "invitation no longer exists" };

  const built = buildInvitationEmail(row, appUrl);
  if ("skip" in built) return { sent: false, reason: built.skip };

  await pool.query(
    `INSERT INTO "OutboxJob" (id, "tenantId", name, payload)
     SELECT gen_random_uuid()::text, i."tenantId", 'notify.email', $2::jsonb
       FROM "CampaignInvite" i WHERE i.id = $1`,
    [
      job.inviteId,
      JSON.stringify({
        template: "invitation.sent",
        to: built.to,
        data: built.data,
        idempotencyKey: `invitation.sent:${job.inviteId}`,
      }),
    ],
  );

  return { sent: true, to: built.to };
}
