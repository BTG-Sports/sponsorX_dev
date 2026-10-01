/**
 * Deliverables — P5-BE-03 (creation), P5-BE-08 (the approval chain) and
 * P5-BE-06 (creative assets).
 *
 * §39's loop runs *Campaign Order → deliverable → tracking/reward → earnings*.
 * This module owns the middle of that: the list of things an athlete owes the
 * moment they accept, the review chain that decides whether the work is
 * acceptable, and the assets uploaded against it.
 *
 * WHY CREATION TAKES A `tx` AND THE REST DO NOT. `createDeliverablesFromJob`
 * is never called on its own — P5-BE-03's acceptance is that the set is
 * created *inside the same transaction as acceptance*, so it takes the
 * caller's transaction and has no `prisma.$transaction` of its own. Every
 * other function here starts its own, because each is a standalone action.
 *
 * WHY A REVIEW VERDICT USES `approve` AND NOT `write`. §15 gives a sponsor
 * `deliverable.approve` on their own campaigns and deliberately no `write` —
 * they judge the work, they do not edit it. Requesting a revision is a
 * verdict, so it is gated on `approve` too; if it were gated on `write` the
 * sponsor half of the review chain would be unreachable for the exact role
 * the chain exists to serve.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presignPrivateUpload } from "../lib/storage";
import { notifyGuardianOfUpload } from "./guardian-acts";
import {
  canTransitionDeliverable,
  IllegalDeliverableTransitionError,
  type DeliverableState,
} from "./deliverable-state";
import { deliverablesForOrder } from "./deliverable-template";
import { maybeMakeEligible } from "./earning";

export class PublishedUrlRequiredError extends Error {
  readonly status = 400;
  constructor() {
    super(
      "Marking a deliverable published needs the URL the work was published " +
        "at. VERIFIED means BTG checked that link; there is nothing to check " +
        "without it.",
    );
    this.name = "PublishedUrlRequiredError";
  }
}

export class RevisionReasonRequiredError extends Error {
  readonly status = 400;
  constructor() {
    super(
      "A revision request needs a reason. The athlete is being asked to redo " +
        "paid work; 'rejected' with no explanation is not an instruction.",
    );
    this.name = "RevisionReasonRequiredError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   P5-BE-03 · Creation
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create the deliverable set an order owes, inside the caller's transaction.
 *
 * Called from `acceptOrder` and nowhere else. It takes the order fields it
 * needs rather than re-reading the row, because the caller has already read it
 * inside the same transaction and a second read is a second chance for the
 * state to have moved.
 *
 * Idempotent by refusal, not by upsert: if the order already has deliverables
 * this throws rather than silently duplicating. An order can only be accepted
 * once, so a second call means a bug worth surfacing.
 */
export async function createDeliverablesFromJob(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "tenantId" | "userId">,
  order: { id: string; tenantId: string; jobId: string; dueDate: Date },
): Promise<{ count: number }> {
  const existing = await tx.deliverable.count({ where: { orderId: order.id, tenantId: order.tenantId } });
  if (existing > 0) {
    throw new Error(
      `Order ${order.id} already has ${existing} deliverables. Creating them ` +
        `twice would double what the athlete owes.`,
    );
  }

  const rows = deliverablesForOrder({ jobId: order.jobId, dueDate: order.dueDate });

  await tx.deliverable.createMany({
    data: rows.map((row) => ({
      tenantId: order.tenantId,
      orderId: order.id,
      title: row.title,
      dueDate: row.dueDate,
      /* NOT_STARTED is the schema default, but it is stated here so the
         starting state of the chain is visible at the place it begins. */
      state: "NOT_STARTED" as const,
    })),
  });

  await audit(tx, actor, AUDIT_ACTIONS.deliverable.create, "CampaignOrder", order.id, {
    after: {
      jobId: order.jobId,
      count: rows.length,
      titles: rows.map((r) => r.title),
    },
  });

  return { count: rows.length };
}

/* ────────────────────────────────────────────────────────────────────────────
   P5-BE-08 · The approval chain
   ──────────────────────────────────────────────────────────────────────────── */

type Moved = { id: string; state: DeliverableState };

/**
 * The shared body of every chain step: read the deliverable the actor can
 * actually reach, check the move is legal from where it is now, write it, and
 * audit — all in one transaction, with the read inside so the state cannot
 * move between check and write.
 *
 * `action` decides which permission is required, which is what keeps a
 * sponsor able to approve but not to submit.
 */
async function move(
  actor: Actor,
  deliverableId: string,
  to: DeliverableState,
  opts: {
    action: "write" | "approve";
    tenantWide: boolean;
    auditAction: Parameters<typeof audit>[2];
    data?: Prisma.DeliverableUpdateInput;
    after?: Record<string, unknown>;
    /** Runs inside the same transaction, once the move is written and
     *  audited. Used by P7-BE-02 to release the order's earning. */
    afterMove?: (
      tx: Prisma.TransactionClient,
      context: { orderId: string },
    ) => Promise<unknown>;
    /**
     * P5-INT-01 — the athlete-facing message for this step, if there is one.
     *
     * Enqueued in the same transaction as the move, so a state change and the
     * message announcing it commit together: an athlete is never told their
     * work was approved by a transaction that then rolled back.
     */
    notify?: {
      template: string;
      data?: Record<string, string>;
    };
  },
): Promise<Moved> {
  if (opts.tenantWide) {
    assertTenantWide(actor, "deliverable", opts.action);
  } else {
    assertAllowed(actor, "deliverable", opts.action);
  }

  return prisma.$transaction(async (tx) => {
    const found = await tx.deliverable.findFirst({
      where: { ...whereFor(actor, "deliverable", opts.action), id: deliverableId },
      select: {
        id: true, state: true, orderId: true, title: true, tenantId: true,
        /* P5-INT-01 — who to write to, and what to call the campaign. Read
           in the same query rather than a second one after the move. */
        order: {
          select: {
            campaign: { select: { name: true } },
            athlete: { select: { displayName: true, user: { select: { email: true } } } },
          },
        },
      },
    });
    if (!found) throw new ForbiddenError("deliverable", opts.action);

    const from = found.state as DeliverableState;
    if (!canTransitionDeliverable(from, to)) {
      throw new IllegalDeliverableTransitionError(from, to);
    }

    const updated = await tx.deliverable.update({
      where: { id: deliverableId },
      data: { state: to as Prisma.DeliverableUpdateInput["state"], ...opts.data },
      select: { id: true, state: true },
    });

    await audit(tx, actor, opts.auditAction, "Deliverable", deliverableId, {
      before: { state: from },
      after: { state: to, ...opts.after },
    });

    /* P5-INT-01 — queued inside the transaction, for the same reason the
       outbox exists at all: the message and the fact it announces must
       commit together or not at all.

       Silently skipped where the athlete has no linked user, which is a real
       state during onboarding. A missing address is not a reason to refuse a
       BTG reviewer's approval. */
    const email = found.order.athlete.user?.email;
    if (opts.notify && email) {
      await enqueue(tx, found.tenantId, "notify.email", {
        tenantId: found.tenantId,
        template: opts.notify.template,
        to: email,
        /* Keyed on the deliverable AND the state, so re-entering a state
           after a revision sends again — which is correct, it is a new
           request — while a retry of one transition does not. */
        idempotencyKey: `${opts.notify.template}:${deliverableId}:${to}`,
        data: {
          firstName: found.order.athlete.displayName,
          title: found.title,
          campaignName: found.order.campaign.name,
          ...opts.notify.data,
        },
      });
    }

    /* Same transaction, deliberately — see verifyPublished. */
    if (opts.afterMove) await opts.afterMove(tx, { orderId: found.orderId });

    return { id: updated.id, state: updated.state as DeliverableState };
  });
}

/** The athlete submits a draft: NOT_STARTED → DRAFT_SUBMITTED. */
export function submitDraft(actor: Actor, deliverableId: string): Promise<Moved> {
  return move(actor, deliverableId, "DRAFT_SUBMITTED", {
    action: "write",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.deliverable.submitDraft,
  });
}

/** BTG picks it up: DRAFT_SUBMITTED → BTG_REVIEW. */
export function startBtgReview(actor: Actor, deliverableId: string): Promise<Moved> {
  return move(actor, deliverableId, "BTG_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.deliverable.btgReview,
  });
}

/**
 * BTG routes it to the sponsor: BTG_REVIEW → SPONSOR_REVIEW.
 *
 * Optional by design — BTG may approve from BTG_REVIEW instead. See
 * `deliverable-state.ts` for why the branch exists.
 */
export function sendToSponsorReview(actor: Actor, deliverableId: string): Promise<Moved> {
  return move(actor, deliverableId, "SPONSOR_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.deliverable.sponsorReview,
  });
}

/**
 * Either reviewer sends it back: BTG_REVIEW | SPONSOR_REVIEW →
 * DRAFT_SUBMITTED, with the reason on the audit row.
 */
export async function requestRevision(
  actor: Actor,
  deliverableId: string,
  reason: string,
): Promise<Moved> {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) throw new RevisionReasonRequiredError();

  return await move(actor, deliverableId, "DRAFT_SUBMITTED", {
    action: "approve",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.deliverable.requestRevision,
    after: { reason: trimmed },
    notify: { template: "deliverable.revisionRequested", data: { reason: trimmed } },
  });
}

/** Either reviewer approves: BTG_REVIEW | SPONSOR_REVIEW → APPROVED. */
export function approveDeliverable(actor: Actor, deliverableId: string): Promise<Moved> {
  return move(actor, deliverableId, "APPROVED", {
    action: "approve",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.deliverable.approve,
    notify: { template: "deliverable.approved" },
  });
}

/**
 * The athlete says it is live: APPROVED → PUBLISHED, recording where.
 *
 * The URL is mandatory — see `PublishedUrlRequiredError`.
 */
export async function markPublished(
  actor: Actor,
  deliverableId: string,
  publishedUrl: string,
): Promise<Moved> {
  const trimmed = publishedUrl?.trim() ?? "";
  if (!trimmed) throw new PublishedUrlRequiredError();

  return await move(actor, deliverableId, "PUBLISHED", {
    action: "write",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.deliverable.markPublished,
    data: { publishedUrl: trimmed, publishedAt: new Date() },
    after: { publishedUrl: trimmed },
  });
}

/**
 * BTG confirms the published work: PUBLISHED → VERIFIED.
 *
 * Tenant-wide on purpose. This is the state `P7-BE-02` turns into money, so
 * the athlete who claims the work is live must not also be the one who
 * confirms it.
 */
export async function verifyPublished(
  actor: Actor,
  deliverableId: string,
): Promise<Moved> {
  return move(actor, deliverableId, "VERIFIED", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.deliverable.verify,
    /* P7-BE-02 — verifying the LAST deliverable on an order releases its
       earning to ELIGIBLE, in this same transaction. Work verified and money
       owed have to become true together: a crash between them would leave an
       athlete who finished everything permanently at PENDING, with nothing in
       the system to notice. */
    afterMove: (tx, order) => maybeMakeEligible(tx, actor, order.orderId),
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   P5-BE-06 · Creative assets
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Presign a direct-to-R2 upload for a deliverable's creative.
 *
 * The bytes never touch this server — §11 and Addendum A8. The browser PUTs
 * straight to the private bucket with the URL returned here, then calls
 * `registerCreativeAsset` with the key.
 *
 * The key is built here rather than accepted from the caller: a client-chosen
 * key is a client-chosen *path*, and a presigned PUT against a path the
 * client picked is a write primitive into anyone's folder.
 */
export async function presignCreativeUpload(
  actor: Actor,
  deliverableId: string,
  contentType: string,
): Promise<{ url: string; key: string }> {
  assertAllowed(actor, "creativeAsset", "write");

  /* Reachability is checked before a credential is issued: an actor who
     cannot write this deliverable's assets gets no URL. */
  const deliverable = await prisma.deliverable.findFirst({
    where: { ...whereFor(actor, "deliverable", "write"), id: deliverableId },
    select: { id: true, tenantId: true },
  });
  if (!deliverable) throw new ForbiddenError("creativeAsset", "write");

  const key = `t/${deliverable.tenantId}/deliverable/${deliverable.id}/${crypto.randomUUID()}`;

  const url = await presignPrivateUpload(actor, key, contentType, {
    entity: "Deliverable",
    entityId: deliverable.id,
  });

  return { url, key };
}

/**
 * Record an uploaded asset against its deliverable.
 *
 * Versions are allocated inside the transaction from the current maximum, so
 * two uploads racing cannot both claim the same version — the unique index on
 * `(deliverableId, version)` is the backstop that makes the loser retry rather
 * than overwrite.
 */
export async function registerCreativeAsset(
  actor: Actor,
  deliverableId: string,
  r2Key: string,
): Promise<{ id: string; version: number }> {
  assertAllowed(actor, "creativeAsset", "write");

  return prisma.$transaction(async (tx) => {
    const deliverable = await tx.deliverable.findFirst({
      where: { ...whereFor(actor, "deliverable", "write"), id: deliverableId },
      select: { id: true, tenantId: true },
    });
    if (!deliverable) throw new ForbiddenError("creativeAsset", "write");

    const highest = await tx.creativeAsset.aggregate({
      /* tenant-scope: keyed by the deliverable loaded above through whereFor. */
      where: { deliverableId },
      _max: { version: true },
    });
    const version = (highest._max.version ?? 0) + 1;

    const asset = await tx.creativeAsset.create({
      data: {
        tenantId: deliverable.tenantId,
        deliverableId,
        version,
        r2Key,
        uploadedBy: actor.userId,
      },
      select: { id: true, version: true },
    });

    await audit(
      tx,
      actor,
      AUDIT_ACTIONS.deliverable.assetRegister,
      "Deliverable",
      deliverableId,
      { after: { assetId: asset.id, version, r2Key } },
    );

    /* P5-BE-07 — resizing happens on the worker. An athlete uploading from a
       phone at an event must not wait on three webp encodes. */
    await enqueue(tx, deliverable.tenantId, "image.derive", { assetId: asset.id });

    /* 2S1-BE-11 — a minor uploads their own content; their guardian is emailed for every upload. */
    await notifyGuardianOfUpload(tx, actor, { deliverableId, assetId: asset.id });

    return asset;
  });
}
