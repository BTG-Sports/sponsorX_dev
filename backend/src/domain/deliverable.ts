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
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { send } from "../lib/email";
import { env } from "../config/env";
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
import {
  allPassed,
  CAPTION_MAX,
  contentChecks,
  failedReasons,
  normalizeContentType,
  sentBack,
  type ContentCheck,
} from "./content-check-rules";
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

/** P5-BE-09 — a draft that failed the automatic checks is the athlete's to
 *  fix; BTG cannot pick it up. */
export class DraftFailedChecksError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This draft didn't pass the automatic checks and is back with the " +
        "athlete. It reaches the review queue when they submit one that passes.",
    );
    this.name = "DraftFailedChecksError";
  }
}

/** P5-BE-09 — a submitted draft that is in BTG's queue cannot be submitted
 *  again until it is sent back. */
export class DraftAlreadySubmittedError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This draft is already waiting for BTG's review. You can submit again " +
        "if it is sent back to you.",
    );
    this.name = "DraftAlreadySubmittedError";
  }
}

/** P5-BE-09 — no new version while a reviewer is looking at the checked one. */
export class DraftInReviewError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This draft is with its reviewers. You can upload a new version if it " +
        "is sent back to you.",
    );
    this.name = "DraftInReviewError";
  }
}

export class CaptionTooLongError extends Error {
  readonly status = 422;
  constructor() {
    super(`A caption can be at most ${CAPTION_MAX} characters.`);
    this.name = "CaptionTooLongError";
  }
}

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const appUrl = () => env.APP_URL.replace(/\/+$/, "");

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
    /** P5-BE-09 — refuse the move for a reason the state table cannot see
     *  (a draft that failed its checks). Runs inside the transaction. */
    guard?: (found: { checksPassed: boolean | null }) => void;
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
        checksPassed: true, reviewWaitingSince: true,
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
    opts.guard?.(found);

    const updated = await tx.deliverable.update({
      where: { id: deliverableId },
      data: {
        state: to as Prisma.DeliverableUpdateInput["state"],
        ...reviewClock(to, found.reviewWaitingSince),
        ...opts.data,
      },
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

/**
 * P5-BE-09 — the review clock a move leaves behind.
 *
 * `reviewWaitingSince` is when the current draft reached its current
 * reviewer. BTG picking a draft up does not restart BTG's wait (it reached
 * BTG when it was submitted — a draft from before the clock existed starts
 * it here); sending it to the sponsor starts the sponsor's; leaving the
 * review desks clears it. A new wait has not been reminded about.
 */
function reviewClock(
  to: DeliverableState,
  waitingSince: Date | null,
): { reviewWaitingSince?: Date | null; reviewRemindedAt?: null } {
  if (to === "BTG_REVIEW") return waitingSince ? {} : { reviewWaitingSince: new Date(), reviewRemindedAt: null };
  if (to === "SPONSOR_REVIEW") return { reviewWaitingSince: new Date(), reviewRemindedAt: null };
  return { reviewWaitingSince: null, reviewRemindedAt: null };
}

export type Submitted = Moved & { passed: boolean; checks: ContentCheck[] };

/**
 * The athlete submits a draft, with the caption they will post — and the
 * automatic checks run on it (P5-BE-09).
 *
 * From NOT_STARTED it is the chain's first move (→ DRAFT_SUBMITTED). From
 * DRAFT_SUBMITTED it is a RESUBMISSION, allowed only while the draft is back
 * with the athlete — sent back by the checks or by a reviewer — and it moves
 * no state: the same deliverable, answered.
 *
 * Passing: it is in BTG's queue exactly as before, with the passed checks
 * kept for the reviewer and BTG's review clock started. Failing: in the same
 * transaction the system sends it back — the failures are audited as a
 * revision by the system and emailed to the athlete — and it never enters
 * BTG's queue (`checksPassed = false`). Failing is recorded, not refused, so
 * the athlete sees exactly what to fix.
 *
 * The write is conditional on the row being as it was read (state and the
 * last check time), so two submissions racing record one and refuse the
 * other — never two verdicts and two emails for one draft.
 */
export async function submitDraft(
  actor: Actor,
  deliverableId: string,
  input: { caption?: string | null } = {},
): Promise<Submitted> {
  assertAllowed(actor, "deliverable", "write");
  const caption = input.caption?.trim() || null;
  if (caption && caption.length > CAPTION_MAX) throw new CaptionTooLongError();

  return prisma.$transaction(async (tx) => {
    const found = await tx.deliverable.findFirst({
      where: { ...whereFor(actor, "deliverable", "write"), id: deliverableId },
      select: {
        id: true, state: true, title: true, tenantId: true,
        checks: true, checksPassed: true, checkedAt: true,
        assets: { select: { version: true, contentType: true, uploadedAt: true }, orderBy: { version: "desc" }, take: 1 },
        order: {
          select: {
            campaign: { select: { name: true } },
            athlete: { select: { displayName: true, user: { select: { email: true } } } },
            /* The accepted offer, when the order came from one: its disclosures. */
            offer: { select: { disclosures: true } },
          },
        },
      },
    });
    if (!found) throw new ForbiddenError("deliverable", "write");

    const from = found.state as DeliverableState;
    const latest = found.assets[0] ?? null;
    if (from === "DRAFT_SUBMITTED") {
      const revision = await tx.auditLog.findFirst({
        /* tenant-scope: the deliverable's own tenant, loaded above through whereFor. */
        where: {
          tenantId: found.tenantId, entity: "Deliverable", entityId: found.id,
          action: AUDIT_ACTIONS.deliverable.requestRevision,
        },
        select: { after: true, at: true },
        orderBy: { at: "desc" },
      });
      const reason = (revision?.after as { reason?: unknown } | null)?.reason;
      const back = sentBack({
        state: from,
        checksPassed: found.checksPassed,
        checks: found.checks,
        checkedAt: found.checkedAt,
        latestUploadAt: latest?.uploadedAt ?? null,
        revision: revision ? { reason: typeof reason === "string" ? reason : "", at: revision.at } : null,
      });
      if (!back) throw new DraftAlreadySubmittedError();
    } else if (!canTransitionDeliverable(from, "DRAFT_SUBMITTED")) {
      throw new IllegalDeliverableTransitionError(from, "DRAFT_SUBMITTED");
    }

    const checks = contentChecks({
      latest: latest ? { version: latest.version, contentType: latest.contentType } : null,
      caption,
      requiredDisclosures: found.order.offer?.disclosures ?? [],
    });
    const passed = allPassed(checks);
    const now = new Date();

    const written = await tx.deliverable.updateMany({
      /* tenant-scope: the row loaded above through whereFor, only while unchanged. */
      where: { id: found.id, state: from, checkedAt: found.checkedAt },
      data: {
        state: "DRAFT_SUBMITTED",
        caption,
        captionVersion: latest?.version ?? null,
        checks: checks as unknown as Prisma.InputJsonValue,
        checksPassed: passed,
        checkedAt: now,
        reviewWaitingSince: passed ? now : null,
        reviewRemindedAt: null,
      },
    });
    if (written.count !== 1) throw new DraftAlreadySubmittedError();

    await audit(tx, actor, AUDIT_ACTIONS.deliverable.submitDraft, "Deliverable", found.id, {
      before: { state: from },
      after: {
        state: "DRAFT_SUBMITTED",
        resubmission: from === "DRAFT_SUBMITTED",
        version: latest?.version ?? null,
        caption,
        checksPassed: passed,
        checks,
      },
    });

    if (!passed) {
      const reasons = failedReasons(checks);
      await audit(tx, SYSTEM(found.tenantId), AUDIT_ACTIONS.deliverable.systemRevision, "Deliverable", found.id, {
        before: { state: "DRAFT_SUBMITTED" },
        after: { state: "DRAFT_SUBMITTED", reasons },
      });
      /* As move()'s notifications: skipped where the athlete has no linked
         login yet. Their page shows the same reasons either way. */
      const email = found.order.athlete.user?.email;
      if (email) {
        await send(tx, found.tenantId, {
          template: "deliverable.checksFailed",
          to: email,
          /* One per failed submission, identified by its own recorded time
             (checkedAt), so a retried send is the same message. */
          idempotencyKey: `deliverable.checksFailed:${found.id}:${now.toISOString()}`,
          data: {
            firstName: found.order.athlete.displayName,
            title: found.title,
            campaignName: found.order.campaign.name,
            reasons: reasons.map((r) => `- ${r}`).join("\n"),
            portalUrl: `${appUrl()}/athlete/deliverables/${found.id}`,
          },
        });
      }
    }

    return { id: found.id, state: "DRAFT_SUBMITTED" as const, passed, checks };
  });
}

/** BTG picks it up: DRAFT_SUBMITTED → BTG_REVIEW. Never a draft the
 *  automatic checks sent back (P5-BE-09). */
export function startBtgReview(actor: Actor, deliverableId: string): Promise<Moved> {
  return move(actor, deliverableId, "BTG_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.deliverable.btgReview,
    guard: (d) => {
      if (d.checksPassed === false) throw new DraftFailedChecksError();
    },
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
 * P5-BE-09 — what a reviewer looks at is the version that passed the checks.
 * A new version while the draft is on a review desk would put unchecked work
 * in front of BTG or the sponsor, so it waits until the draft comes back to
 * the athlete: in BTG_REVIEW or SPONSOR_REVIEW, or in BTG's queue (submitted,
 * passed, no reviewer's revision since), it is refused. A draft submitted
 * before the checks existed (checksPassed null) keeps the old rule — an
 * upload answers its revision.
 */
async function assertMayAddVersion(
  db: Pick<Prisma.TransactionClient, "auditLog">,
  d: { id: string; tenantId: string; state: string; checksPassed: boolean | null; checkedAt: Date | null },
): Promise<void> {
  if (d.state === "BTG_REVIEW" || d.state === "SPONSOR_REVIEW") throw new DraftInReviewError();
  if (d.state !== "DRAFT_SUBMITTED" || d.checksPassed !== true) return;
  const revision = await db.auditLog.findFirst({
    /* tenant-scope: the deliverable's own tenant, loaded by the caller through whereFor. */
    where: {
      tenantId: d.tenantId, entity: "Deliverable", entityId: d.id,
      action: AUDIT_ACTIONS.deliverable.requestRevision,
      at: { gt: d.checkedAt ?? new Date(0) },
    },
    select: { id: true },
  });
  if (!revision) throw new DraftInReviewError();
}

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
    select: { id: true, tenantId: true, state: true, checksPassed: true, checkedAt: true },
  });
  if (!deliverable) throw new ForbiddenError("creativeAsset", "write");
  /* No credential for a file that could not be recorded (P5-BE-09). */
  await assertMayAddVersion(prisma, deliverable);

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
      select: { id: true, tenantId: true, state: true, checksPassed: true, checkedAt: true },
    });
    if (!deliverable) throw new ForbiddenError("creativeAsset", "write");

    await assertMayAddVersion(tx, deliverable);

    /* P5-BE-09 — the file's type is the one its upload was presigned for:
       the signed PUT enforces that Content-Type, and the grant's audit row
       recorded it server-side. A key this deliverable was never granted has
       no type, and the file-type check will say so. */
    const grant = await tx.auditLog.findFirst({
      /* tenant-scope: the grant was audited under the presigning actor's
         tenant — the deliverable's own (loaded above through whereFor), or
         this actor's; keyed by this deliverable and this key. */
      where: {
        tenantId: { in: [...new Set([deliverable.tenantId, actor.tenantId])] },
        entity: "Deliverable", entityId: deliverable.id,
        action: AUDIT_ACTIONS.storage.privateUploadGrant,
        after: { path: ["key"], equals: r2Key },
      },
      select: { after: true },
      orderBy: { at: "desc" },
    });
    const granted = (grant?.after as { contentType?: unknown } | null)?.contentType;
    const contentType = normalizeContentType(typeof granted === "string" ? granted : null);

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
        contentType,
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
