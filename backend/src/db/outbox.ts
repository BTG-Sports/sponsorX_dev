/**
 * The transactional outbox (P2-BE-05, Guide §05).
 *
 * THE WHOLE POINT: a job is written in the **same transaction** as the record
 * that causes it. Either both land or neither does. A campaign can never go
 * live without its Zoho sync queued, and a queued sync can never point at a
 * campaign that rolled back.
 *
 * This is also what keeps Zoho off the request path. Nothing here calls a
 * vendor; it writes a row. If Zoho is down, sponsors still browse, athletes
 * still accept orders, fans still redeem — the syncs wait.
 *
 * Deliberately NOT done here: calling `boss.send()` directly from a request.
 * pg-boss writes through its own connection, outside the caller's transaction,
 * so a rollback would leave a job queued for work that never happened. The
 * worker's drain is what bridges the outbox to pg-boss — see worker/index.ts.
 */

import type { Prisma } from "../generated/prisma/client";

/**
 * A queued job's name. Kept as a string union so a typo is a compile error
 * rather than a job nothing ever handles.
 *
 * Each name is claimed by the task that builds its handler; the drain dispatches
 * any name it finds, so adding one here does not require touching the worker.
 */
export type JobName =
  | "zoho.pushCampaign"
  | "zoho.pushAthlete"
  /* Every transactional email, one job name (P3-INT-01). The template lives
     in the payload rather than the name so that adding a message does not
     mean touching the worker's handler registration. */
  | "notify.email"
  | "notify.campaignLive"
  | "notify.invitationSent"
  | "notify.deliverableDue"
  | "reward.generateQr"
  /* P5-BE-07. Enqueued when a creative asset is registered; the worker
     resizes it to 320/640/1280 webp. */
  | "image.derive"
  | "tracking.resolveGeo";

/**
 * Write a job into the outbox, inside the caller's transaction.
 *
 * Takes `tx` rather than the client on purpose — passing `db` here would defeat
 * the entire mechanism by writing outside the transaction, so the type makes
 * that awkward to do by accident.
 *
 * @example
 *   await db.$transaction(async (tx) => {
 *     const campaign = await tx.campaign.update({ ... })
 *     await enqueue(tx, actor.tenantId, "zoho.pushCampaign", { campaignId })
 *     return campaign
 *   })
 */
export async function enqueue(
  tx: Prisma.TransactionClient,
  tenantId: string,
  name: JobName,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.outboxJob.create({
    data: { tenantId, name, payload: payload as Prisma.InputJsonValue },
  });
}
