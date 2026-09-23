/**
 * Applying an inbound Zoho invoice — P7-BE-04, §18, §20.
 *
 * The handler for `zoho.ingestInvoice`. The webhook route recorded the
 * payload and queued this; here it is applied to the mirror and the delivery
 * row is closed out.
 *
 * EVERY OUTCOME IS RECORDED, INCLUDING REFUSAL. §20 says inbound attempts are
 * logged "whether or not they were accepted", so a payload naming a deal we
 * do not have becomes a REJECTED delivery with the reason on it — not a
 * silent drop, and not an invoice attached to a guessed campaign.
 *
 * REJECTED IS TERMINAL; FAILED IS NOT. A deal we have never heard of will not
 * become known by retrying, so that outcome is recorded and the job finishes
 * successfully. An unexpected error is left to throw, so pg-boss retries it —
 * the distinction is between "we understood and declined" and "we broke".
 */
import type pg from "pg";

export type IngestInvoiceJob = { deliveryId: string };

export type IngestInvoiceOutcome =
  | { status: "APPLIED"; invoiceId: string }
  | { status: "REJECTED"; reason: string }
  | { status: "SKIPPED"; reason: string };

type DeliveryRow = { id: string; payload: unknown; status: string };

/**
 * `apply` is injected so the job is testable without a database behind the
 * domain function, and so the Prisma-shaped work stays in `domain/invoice.ts`
 * where the rules live.
 */
export async function handleIngestInvoice(
  db: pg.Pool,
  job: IngestInvoiceJob,
  deps: {
    apply: (payload: unknown) => Promise<{ applied: boolean; invoiceId?: string; reason?: string }>;
  },
): Promise<IngestInvoiceOutcome> {
  const { rows } = await db.query<DeliveryRow>(
    `SELECT id, payload, status FROM "WebhookDelivery" WHERE id = $1`,
    [job.deliveryId],
  );
  const delivery = rows[0];
  if (!delivery) return { status: "SKIPPED", reason: "delivery no longer exists" };
  if (delivery.status !== "RECEIVED") {
    /* Already processed. pg-boss is at-least-once, so a second run of the
       same job is expected rather than exceptional. */
    return { status: "SKIPPED", reason: `already ${delivery.status}` };
  }

  try {
    const result = await deps.apply(delivery.payload);
    await db.query(`UPDATE "WebhookDelivery" SET status = $2 WHERE id = $1`, [
      delivery.id,
      "APPLIED",
    ]);
    return result.invoiceId
      ? { status: "APPLIED", invoiceId: result.invoiceId }
      : { status: "SKIPPED", reason: result.reason ?? "no change" };
  } catch (error) {
    /* A refusal we understand — an unknown deal, a malformed payload — is
       recorded and closed. Anything else is rethrown so the queue retries. */
    const status = (error as { status?: number }).status;
    if (status === 422) {
      await db.query(
        `UPDATE "WebhookDelivery" SET status = $2, error = $3 WHERE id = $1`,
        [delivery.id, "REJECTED", (error as Error).message],
      );
      return { status: "REJECTED", reason: (error as Error).message };
    }
    await db.query(
      `UPDATE "WebhookDelivery" SET status = $2, error = $3 WHERE id = $1`,
      [delivery.id, "FAILED", (error as Error).message],
    );
    throw error;
  }
}
