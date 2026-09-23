/**
 * Deliverable deadline reminders — P5-INT-01, §39.
 *
 * A sweep, not a job queued per deliverable. Same reasoning as the invitation
 * expiry sweep beside it: a per-deliverable timer that is lost leaves that
 * athlete never reminded, where a missed sweep catches everything on the next
 * run. The comparison is one statement.
 *
 * REMINDS ONCE PER DELIVERABLE PER WINDOW, and that is enforced by
 * `EmailSendLog`'s unique idempotency key rather than by a column here. The
 * key contains the window, so a deliverable that is three days out gets the
 * three-day reminder and then the one-day reminder, and running the sweep
 * hourly does not send twelve.
 *
 * ONLY UNFINISHED WORK IS CHASED. A deliverable already at BTG_REVIEW or
 * beyond is with us, not with the athlete — reminding them of a deadline for
 * something they have already submitted is how a notification channel
 * teaches people to ignore it.
 */
import type pg from "pg";

/** Days before the due date a reminder goes out. */
export const REMINDER_WINDOWS = [3, 1] as const;

export type ReminderOutcome = { queued: number; windows: Record<string, number> };

type Row = {
  id: string;
  title: string;
  dueDate: Date;
  tenantId: string;
  email: string;
  displayName: string;
  campaignName: string;
};

/**
 * Queue a reminder for everything falling due inside each window.
 *
 * The rows are read and the sends queued in one transaction, so a crash
 * mid-sweep leaves nothing half-queued.
 */
export async function remindDueDeliverables(
  pool: pg.Pool,
  appUrl: string,
  now = new Date(),
): Promise<ReminderOutcome> {
  const client = await pool.connect();
  const windows: Record<string, number> = {};
  let queued = 0;

  try {
    await client.query("BEGIN");

    for (const days of REMINDER_WINDOWS) {
      /* The window is a single day, not "everything within N days" —
         otherwise the 3-day sweep would also match everything due tomorrow
         and the two windows would fight over the same deliverable. */
      const { rows } = await client.query<Row>(
        `SELECT d.id, d.title, d."dueDate", d."tenantId",
                u.email AS email,
                a."displayName" AS "displayName",
                c.name AS "campaignName"
           FROM "Deliverable" d
           JOIN "CampaignOrder" o ON o.id = d."orderId"
           JOIN "Campaign" c ON c.id = o."campaignId"
           JOIN "Athlete" a ON a.id = o."athleteId"
           JOIN "User" u ON u."athleteId" = a.id
          WHERE d.state IN ('NOT_STARTED', 'DRAFT_SUBMITTED')
            AND d."dueDate" >= $1::timestamp + ($2 || ' days')::interval
            AND d."dueDate" <  $1::timestamp + (($2::int + 1) || ' days')::interval`,
        [now.toISOString(), String(days)],
      );

      for (const row of rows) {
        const due = new Date(row.dueDate).toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO "OutboxJob" ("id", "tenantId", name, payload)
           VALUES (gen_random_uuid()::text, $1, 'notify.email', $2::jsonb)`,
          [
            row.tenantId,
            JSON.stringify({
              tenantId: row.tenantId,
              template: "deliverable.dueSoon",
              to: row.email,
              /* The window is IN the key, so 3-day and 1-day are different
                 sends and an hourly sweep does not repeat either. */
              idempotencyKey: `deliverable.dueSoon:${row.id}:${days}`,
              data: {
                firstName: row.displayName,
                title: row.title,
                campaignName: row.campaignName,
                dueOn: due,
                portalUrl: `${appUrl.replace(/\/+$/, "")}/athlete/deliverables/${row.id}`,
              },
            }),
          ],
        );
        queued += 1;
        windows[String(days)] = (windows[String(days)] ?? 0) + 1;
      }
    }

    await client.query("COMMIT");
    return { queued, windows };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
