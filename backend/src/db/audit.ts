/**
 * The audit helper (P2-BE-06, Blueprint §26).
 *
 * §26 requires a record of who changed what and when across five areas:
 * **pricing, agreements, campaigns, payouts and permissions**. This is the one
 * way that record gets written, so that "is it audited?" has a single answer
 * rather than five partial ones.
 *
 * LIKE `enqueue`, IT TAKES THE TRANSACTION, NOT THE CLIENT. The audit row lands
 * in the same transaction as the change it describes — either both commit or
 * neither does. An audit written outside the transaction can describe a change
 * that rolled back, which is worse than no audit at all: it is a confident
 * record of something that never happened.
 *
 * WHAT NOT TO PUT IN `before` / `after`. These are `Json` columns and they will
 * faithfully store whatever they are handed. §26 forbids bank details, and
 * Addendum A6 forbids tax IDs, so do not pass whole records — pass the fields
 * that changed. `changedFields()` below exists to make that the easy option.
 */

import type { Prisma } from "../generated/prisma/client";

/**
 * The part of an `Actor` this helper needs.
 *
 * Deliberately narrow: `P2-BE-04` defines the full `Actor` in `actor.ts` with
 * roles and the athlete/sponsor/property/guardian ids, and that type satisfies
 * this one structurally. Typing against the whole thing here would have made
 * this task wait for Clerk.
 */
export type AuditActor = {
  /**
   * `null` for an act with no signed-in actor behind it.
   *
   * `AuditLog.actorId` has always been nullable and this is the case it was
   * nullable for: a public application arrives from someone who has no `User`
   * row and, by design, never will until they are approved (P3-BE-13). The
   * alternative — inventing a system user to satisfy the type — would file
   * every anonymous act under an actor who did not perform it, which is worse
   * than an honest null.
   */
  userId: string | null;
  tenantId: string;
};

/**
 * `entity.verb`, lower camel — `campaign.launch`, `order.accept`,
 * `rate.update`, `earning.markPaid`, `role.grant`.
 *
 * A template type rather than a closed union: every future domain function adds
 * its own actions, and a union here would mean editing this file for each one.
 * `AUDIT_ACTIONS` below carries the names for the five §26 areas so the common
 * ones are not spelled three different ways.
 */
export type AuditAction = `${string}.${string}`;

/**
 * The §26 areas and their actions. Use these constants rather than string
 * literals where one fits — a typo in an audit action is invisible until
 * someone searches the log for a change that appears never to have happened.
 */
export const AUDIT_ACTIONS = {
  /** Pricing — rate cards, package prices, the margin floor. */
  pricing: {
    rateSet: "rate.set",
    rateUpdate: "rate.update",
    packagePriceUpdate: "package.priceUpdate",
    floorOverrideAttempt: "pricing.floorOverrideAttempt",
  },
  /** Agreements — acceptance is the legally interesting event. */
  agreement: {
    accept: "agreement.accept",
    versionPublish: "agreement.versionPublish",
  },
  /** Campaigns — state transitions across §21. */
  campaign: {
    create: "campaign.create",
    launch: "campaign.launch",
    cancel: "campaign.cancel",
    orderAccept: "order.accept",
    orderReject: "order.reject",
  },
  /** Payouts — Phase 1 tracks status only; no bank details exist to audit. */
  payout: {
    markEligible: "earning.markEligible",
    approveForPayout: "earning.approveForPayout",
    markPaid: "earning.markPaid",
    hold: "earning.hold",
    dispute: "earning.dispute",
  },
  /** Permissions — role grants are the ones that matter in an incident. */
  permission: {
    roleGrant: "role.grant",
    roleRevoke: "role.revoke",
    tenantAccessGrant: "tenant.accessGrant",
  },
  /**
   * The guardian workflow for minors (P3-BE-03, §26, §37). Verification is an
   * attestation by a named BTG staff member, so "who confirmed this adult,
   * and when" must survive in the log — it is the evidence if a minor's
   * participation is ever challenged.
   */
  guardian: {
    link: "guardian.link",
    verify: "guardian.verify",
    unlink: "guardian.unlink",
  },
  /**
   * Private-object grants (P2-BE-08). Not one of §26's five areas, but the
   * same reasoning applies: a presigned URL is a bearer credential handed to
   * a browser, and "who was given access to this agreement, and when" is a
   * question that has to be answerable afterwards. The grant is the auditable
   * event — the upload itself happens directly against R2 and the server
   * never sees it.
   */
  storage: {
    privateUploadGrant: "storage.privateUploadGrant",
    privateDownloadGrant: "storage.privateDownloadGrant",
  },
  /**
   * The delivery chain (P5-BE-03, P5-BE-05, P5-BE-08, §13 steps 7–9).
   *
   * Every move is recorded because this is the chain that decides whether an
   * athlete is owed money: VERIFIED is what `P7-BE-02` turns into an earning.
   * A revision request carries the reason in `after`, so "why was this sent
   * back three times" is answerable from the log rather than from memory.
   */
  deliverable: {
    create: "deliverable.create",
    submitDraft: "deliverable.submitDraft",
    btgReview: "deliverable.btgReview",
    sponsorReview: "deliverable.sponsorReview",
    requestRevision: "deliverable.requestRevision",
    approve: "deliverable.approve",
    markPublished: "deliverable.markPublished",
    verify: "deliverable.verify",
    assetRegister: "deliverable.assetRegister",
  },
  /**
   * The fan funnel (P6-BE-02, P6-BE-07, §16).
   *
   * Only the staff-side actions are audited. The fan-side events — SCAN,
   * LANDING, CLAIM, REDEEM — are NOT written here: they are already rows in
   * `RewardEvent`, which is the funnel itself, and duplicating them into the
   * audit log would double every fan interaction at event scale while adding
   * nothing an auditor could not read from the funnel.
   */
  reward: {
    create: "reward.create",
    transition: "reward.transition",
    tokenIssue: "reward.tokenIssue",
  },
  tracking: {
    linkCreate: "tracking.linkCreate",
  },
  /**
   * Earnings (P7-BE-01, P7-BE-03). The state moves live under `payout`
   * above, which §26 already names as one of its five areas; these two are
   * the record's own lifecycle rather than a money decision.
   */
  earning: {
    create: "earning.create",
    adjust: "earning.adjust",
  },
  /**
   * Metric entry (P7-DATA-01, §22).
   *
   * Audited because a figure's PROVENANCE is the claim, not just its value:
   * "who recorded this as verified, and when" is the question asked when a
   * sponsor disputes a number. The rollup is not audited — it recomputes from
   * these rows and stores nothing.
   */
  metric: {
    record: "metric.record",
  },
} as const;

type Change = {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Write an audit row inside the caller's transaction.
 *
 * @example
 *   await db.$transaction(async (tx) => {
 *     const campaign = await tx.campaign.update({ ... })
 *     await enqueue(tx, actor.tenantId, "zoho.pushCampaign", { campaignId })
 *     await audit(tx, actor, AUDIT_ACTIONS.campaign.launch, "Campaign", campaignId, {
 *       before: { state: "APPROVAL" },
 *       after:  { state: "ACTIVE" },
 *     })
 *     return campaign
 *   })
 *
 * `tenantId` comes from the actor, never from an argument — an audit row filed
 * under the wrong tenant is invisible to the tenant it belongs to and visible
 * to one it does not.
 */
export async function audit(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  action: AuditAction,
  entity: string,
  entityId: string,
  change: Change = {},
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action,
      entity,
      entityId,
      before: (change.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (change.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Reduce a before/after pair to only the fields that actually changed.
 *
 * Passing whole records into an audit row is how a bank detail or a tax ID ends
 * up in a table nobody thought of as sensitive. This keeps the row to the
 * change itself, which is also what makes the log readable a year later.
 *
 * @example
 *   await audit(tx, actor, "rate.update", "AthleteRate", rate.id,
 *     changedFields(existing, updated, ["amount", "version"]))
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: readonly (keyof T)[],
): Change {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};

  for (const key of fields) {
    if (Object.is(before[key], after[key])) continue;
    b[key as string] = before[key];
    a[key as string] = after[key];
  }

  /* Nothing changed — return empty objects rather than nulls so the row still
     records that the action was taken. A no-op update is itself worth seeing. */
  return { before: b, after: a };
}
