/**
 * CRM tasks SponsorX raises — §18 row 7, P8-INT-01, field-mapping §7.5.
 *
 * Three moments in the loop produce work a person at BTG has to do, and §18
 * wants that work visible in the CRM where sales already lives:
 *
 *   - FOLLOW_UP — a brief was qualified; someone should talk to the sponsor.
 *   - APPROVAL  — a campaign was submitted for approval.
 *   - RENEWAL   — a campaign completed; the renewal conversation starts.
 *
 * Raised INSIDE the caller's transaction and pushed through the outbox, so a
 * task exists exactly when the transition that caused it committed.
 * `dedupeKey` makes it one task per event: a retried transition does not
 * raise a second.
 */
import type { Prisma } from "../generated/prisma/client";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";

export type SyncTaskKind = "FOLLOW_UP" | "APPROVAL" | "RENEWAL";

const DUE_IN_DAYS: Record<SyncTaskKind, number> = {
  FOLLOW_UP: 3,
  APPROVAL: 2,
  RENEWAL: 7,
};

export async function raiseSyncTask(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "userId" | "tenantId">,
  task: {
    kind: SyncTaskKind;
    briefId?: string;
    campaignId?: string;
    subject: string;
    body?: string;
  },
): Promise<void> {
  const subjectId = task.campaignId ?? task.briefId;
  if (!subjectId) throw new Error("a sync task hangs off a brief or a campaign");
  const dedupeKey = `${task.kind.toLowerCase()}:${subjectId}`;

  const existing = await tx.syncTask.findUnique({
    /* tenant-scope: the dedupe key embeds the brief or campaign id, which the
       calling transition loaded through whereFor. */
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) return;

  const due = new Date(Date.now() + DUE_IN_DAYS[task.kind] * 24 * 60 * 60 * 1000);
  const created = await tx.syncTask.create({
    data: {
      tenantId: actor.tenantId,
      kind: task.kind,
      subject: task.subject,
      body: task.body ?? null,
      dueDate: due,
      assigneeUserId: actor.userId,
      briefId: task.briefId ?? null,
      campaignId: task.campaignId ?? null,
      dedupeKey,
    },
    select: { id: true },
  });
  await enqueue(tx, actor.tenantId, "zoho.pushTask", { taskId: created.id });
}
