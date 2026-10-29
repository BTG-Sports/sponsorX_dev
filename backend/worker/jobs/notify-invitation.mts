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
 *
 * POL-BE-09 — A MINOR'S INVITATION GOES TO THE GUARDIAN. Only the guardian can
 * accept it (guardian-acts.ts), so every invitation email — this one, and the
 * sweep's reminder and expiry warning — goes to the guardian while the
 * guardian acts for the athlete (`guardianControls`, the same rule as
 * accepting), with a copy to the minor saying their guardian decides. One
 * idempotency key per recipient, so a retry or the hourly sweep sends each
 * person one.
 */
import type pg from "pg";

import { guardianControls } from "../../src/domain/guardian-rules.ts";

export type InvitationJob = { inviteId: string };

/** The athlete and guardian fields every invitation email needs. */
export type InviteeRow = {
  email: string | null;
  legalName: string;
  displayName: string;
  birthDate: Date | null;
  ageBand: string | null;
  majorityAge: number | null;
  guardianId: string | null;
  comingOfAgeStartedAt: Date | null;
  comingOfAgeCompletedAt: Date | null;
  comingOfAgeTerminatedAt: Date | null;
  guardianEmail: string | null;
  guardianLegalName: string | null;
};

/** The athlete and guardian columns, for a query joining `"Athlete" a` and `LEFT JOIN "Guardian" g`. */
export const INVITEE_COLUMNS = `a.email, a."legalName", a."displayName", a."birthDate", a."ageBand", a."majorityAge",
            a."guardianId", a."comingOfAgeStartedAt", a."comingOfAgeCompletedAt", a."comingOfAgeTerminatedAt",
            g.email AS "guardianEmail", g."legalName" AS "guardianLegalName"`;

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Who an invitation email goes to, and how each is addressed. Pure.
 *
 * An adult: the athlete. While the guardian acts for them: the guardian
 * (`wardName` — the template words it for the person who decides), and the
 * athlete as a copy (`guardianDecides`), when they have an address. Each with
 * the suffix its idempotency key takes.
 */
export function invitationRecipients(row: InviteeRow): Array<{ to: string; key: "" | ":guardian"; data: Record<string, string> }> {
  const athleteFirst = firstOf(row.legalName) || firstOf(row.displayName);
  const guardian = guardianControls(row) && row.guardianEmail ? row.guardianEmail : null;
  const out: Array<{ to: string; key: "" | ":guardian"; data: Record<string, string> }> = [];
  if (guardian) {
    out.push({ to: guardian, key: ":guardian", data: { firstName: firstOf(row.guardianLegalName ?? "") || "there", wardName: athleteFirst } });
  }
  if (row.email) out.push({ to: row.email, key: "", data: { firstName: athleteFirst, ...(guardian ? { guardianDecides: "yes" } : {}) } });
  return out;
}

type Row = InviteeRow & {
  state: string;
  expiresAt: Date;
  sponsorName: string | null;
  jobName: string | null;
  offered: number;
};

export type InvitationNotifyOutcome =
  | { sent: true; to: string[] }
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
): { emails: Array<{ to: string; key: "" | ":guardian"; data: Record<string, string> }> } | { skip: string } {
  if (row.state !== "INVITED" && row.state !== "VIEWED") {
    return { skip: `invitation is ${row.state}` };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { skip: "invitation has already expired" };
  }
  const recipients = invitationRecipients(row);
  if (!recipients.length) return { skip: "nobody to email: no address for the athlete or a guardian" };

  const common = {
    sponsorName: row.sponsorName ?? "",
    jobName: row.jobName ?? "",
    /* Cents to something a person reads. The column is cents and the
       template must never print one. */
    offered: `$${(row.offered / 100).toFixed(2)}`,
    expiresOn: row.expiresAt.toISOString().slice(0, 10),
    portalUrl: `${appUrl}/athlete/invitations`,
  };
  return { emails: recipients.map((r) => ({ ...r, data: { ...r.data, ...common } })) };
}

export async function handleInvitationSent(
  pool: pg.Pool,
  job: InvitationJob,
  appUrl: string,
): Promise<InvitationNotifyOutcome> {
  const { rows } = await pool.query<Row>(
    `SELECT i.state, i."expiresAt", i.offered,
            ${INVITEE_COLUMNS},
            s.name AS "sponsorName", j.name AS "jobName"
       FROM "CampaignInvite" i
       JOIN "Athlete" a  ON a.id = i."athleteId"
       LEFT JOIN "Guardian" g ON g.id = a."guardianId"
       JOIN "Campaign" c ON c.id = i."campaignId"
       JOIN "Sponsor" s  ON s.id = c."sponsorId"
       LEFT JOIN "NilJob" j ON j."tenantId" = i."tenantId" AND j.id = i."jobId"
      WHERE i.id = $1`,
    [job.inviteId],
  );

  const row = rows[0];
  /* A missing invitation is not an error worth retrying — the row is gone and
     no amount of retrying brings it back. Throwing would park the job. */
  if (!row) return { sent: false, reason: "invitation no longer exists" };

  const built = buildInvitationEmail(row, appUrl);
  if ("skip" in built) return { sent: false, reason: built.skip };

  for (const e of built.emails) {
    await pool.query(
      `INSERT INTO "OutboxJob" (id, "tenantId", name, payload)
       SELECT gen_random_uuid()::text, i."tenantId", 'notify.email', $2::jsonb
         FROM "CampaignInvite" i WHERE i.id = $1`,
      [
        job.inviteId,
        JSON.stringify({
          template: "invitation.sent",
          to: e.to,
          data: e.data,
          idempotencyKey: `invitation.sent:${job.inviteId}${e.key}`,
        }),
      ],
    );
  }

  return { sent: true, to: built.emails.map((e) => e.to) };
}
