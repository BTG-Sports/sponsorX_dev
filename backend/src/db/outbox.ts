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
  /* P8-INT-01. Legacy name for the Deal push, enqueued by launches before
     the Zoho sync shipped; handled as an alias of zoho.pushDeal so rows
     already in the outbox are not stranded. New code enqueues pushDeal. */
  | "zoho.pushCampaign"
  | "zoho.pushAthlete"
  /* P8-INT-01 — outbound. Accounts and Contacts have no job of their own:
     nothing in Phase 1 creates a sponsor or a contact on a request path, so
     they are pushed as the parents of the Deal or Task that needs them. */
  | "zoho.pushDeal"
  | "zoho.pushTask"
  /* P8-INT-06 — a sponsor enquiry becomes a Lead; a completed campaign opens
     its renewal Deal. */
  | "zoho.pushLead"
  | "zoho.pushRenewal"
  /* 2S1-BE-05 — a sponsor BTG just approved: its Account and primary
     Contact, pushed at once so converting the lead matches it. */
  | "zoho.pushSponsor"
  /* 2S7-INT-01 — a contracted marketplace order, its sponsor, and the
     outside properties it buys from. */
  | "zoho.pushMarketplaceOrder"
  /* P8-INT-03 — a verified CRM notification, recorded and queued by the
     webhook route; the worker fetches and applies the records. */
  | "zoho.ingestCrm"
  /* P8-INT-07 — the kept, re-runnable import of what Zoho already knows. */
  | "zoho.backfill"
  /* 2S7-BE-02 — a sponsor report rendered as a file on the worker. */
  | "report.render"
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
  /* P7-BE-04 — inbound. §18 makes Zoho bi-directional, and the inbound half
     lands in the queue exactly as the outbound half does. */
  | "zoho.ingestInvoice"
  | "tracking.resolveGeo"
  /* P3-DATA-01 — the pilot cohort, imported as a job rather than hand-seeded. */
  | "athlete.importCohort"
  /* 2S5-INT-02 / 2S5-BE-05 — the payment provider's side of a card payment
     and a payout: confirming a payment, sending an approved payout, and
     confirming it arrived. The stand-in provider on staging runs these; a
     real provider's webhooks will land on the same jobs. */
  | "payments.confirm"
  /* 2S5-INT-02 — one provider event (PaymentEvent), recorded by the signed webhook, applied by the worker. */
  | "payments.event"
  | "payouts.send"
  | "payouts.confirm";

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
