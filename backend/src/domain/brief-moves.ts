/**
 * One body for every brief move — P4-BE-11.
 *
 * BTG's manual qualify / approve / close (`transitionBrief`) and the system's
 * automatic approval (`brief-auto.ts`) run through `applyBriefMove`, so the
 * side effects are the same whoever moves the brief: the audit row, the Zoho
 * Deal queued (§18 rows 4–5), the follow-up CRM task on qualification.
 *
 * CONCURRENCY. Every move — and a sponsor's edit, which may approve — first
 * takes the brief's row lock (`lockBrief`, SELECT … FOR UPDATE) and decides
 * on the state read under it; the update then claims the row on that state.
 * A sponsor's edit and BTG's approve therefore run one after the other, and
 * the second sees the first's result: never both from the same state.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { raiseSyncTask } from "./sync-tasks";
import { canTransitionBrief, IllegalBriefTransitionError, type BriefState } from "./brief-state";

type Tx = Prisma.TransactionClient;

/** One action per destination, so "who approved this brief" is a filter on a
 *  column rather than a search through JSON (§26). */
export const BRIEF_AUDIT_ACTIONS: Record<BriefState, `${string}.${string}`> = {
  DRAFT: "brief.draft",
  QUALIFIED: "brief.qualify",
  APPROVED: "brief.approve",
  CAMPAIGN_CREATED: "brief.campaignCreated",
  CLOSED: "brief.close",
};

/**
 * Lock a brief's row for the rest of the transaction and read its state
 * under the lock. Null when no such brief exists (in `tenantId`, when given).
 * Callers find the brief through their own scope first; this only orders
 * concurrent writers.
 */
export async function lockBrief(tx: Tx, briefId: string, tenantId?: string): Promise<BriefState | null> {
  const rows = tenantId
    ? await tx.$queryRaw<Array<{ state: BriefState }>>`SELECT state::text AS state FROM "CampaignBrief" WHERE id = ${briefId} AND "tenantId" = ${tenantId} FOR UPDATE`
    : await tx.$queryRaw<Array<{ state: BriefState }>>`SELECT state::text AS state FROM "CampaignBrief" WHERE id = ${briefId} FOR UPDATE`;
  return rows[0]?.state ?? null;
}

/** Someone else moved the brief between the read and the claim. */
export class BriefStateConflictError extends Error {
  readonly status = 409;
  constructor() {
    super("This brief was moved by someone else a moment ago — refresh to see where it is now.");
    this.name = "BriefStateConflictError";
  }
}

export type BriefForMove = {
  id: string;
  tenantId: string;
  state: BriefState;
  objective: string;
  sponsorName: string;
};

/**
 * Move a locked brief one step through §21, with its side effects.
 *
 * `automatic` marks a move the system made (audited with no user, and
 * `automatic: true`); `pushDeal: false` leaves the Zoho push to a later step
 * of the same transaction (the automatic path queues ONE push, on the
 * campaign, which reads the final state when it runs — three pushes for the
 * same Deal would all assert that same stage).
 */
export async function applyBriefMove(
  tx: Tx,
  by: AuditActor,
  brief: BriefForMove,
  to: BriefState,
  opts: { closeReason?: string | null; automatic?: boolean; reason?: string; pushDeal?: boolean } = {},
): Promise<{ id: string; state: BriefState }> {
  const from = brief.state;
  if (!canTransitionBrief(from, to)) throw new IllegalBriefTransitionError(from, to);
  const closeReason = to === "CLOSED" ? opts.closeReason ?? null : null;

  const claimed = await tx.campaignBrief.updateMany({
    /* tenant-scope: the brief the caller found through its scope (or the system's own tenant) and locked, by id and tenant. */
    where: { id: brief.id, tenantId: brief.tenantId, state: from },
    data: { state: to, ...(to === "CLOSED" ? { closeReason } : {}) },
  });
  if (claimed.count !== 1) throw new BriefStateConflictError();

  await audit(tx, by, BRIEF_AUDIT_ACTIONS[to], "CampaignBrief", brief.id, {
    before: { state: from },
    after: {
      state: to,
      ...(closeReason ? { reason: closeReason } : {}),
      ...(opts.automatic ? { automatic: true, ...(opts.reason ? { why: opts.reason } : {}) } : {}),
    },
  });

  /* §18 rows 4–5 (P8-INT-01). Qualifying a brief opens its Zoho Deal;
     approval and closing are the two later stages SponsorX asserts
     (field-mapping §7.4). A brief closed straight from DRAFT never had a
     Deal, and does not get a Closed Lost one invented for it. Queued in
     this transaction — never called — so Zoho being down cannot stop a
     brief moving. Queued under the BRIEF's tenant, which is where the
     worker looks it up. */
  const assertsStage = to === "QUALIFIED" || to === "APPROVED" || (to === "CLOSED" && from !== "DRAFT");
  if (assertsStage && opts.pushDeal !== false) await enqueue(tx, brief.tenantId, "zoho.pushDeal", { briefId: brief.id });
  if (to === "QUALIFIED") {
    await raiseSyncTask(tx, { userId: by.userId, tenantId: brief.tenantId }, {
      kind: "FOLLOW_UP",
      briefId: brief.id,
      subject: `Follow up with ${brief.sponsorName} on their brief`,
      body: brief.objective,
    });
  }
  return { id: brief.id, state: to };
}
