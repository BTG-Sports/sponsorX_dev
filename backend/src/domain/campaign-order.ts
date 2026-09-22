/**
 * Campaign Orders — P5-BE-02 (the record) and P5-BE-01 (acceptance).
 *
 * The contract between BTG and one athlete for one job. §39's loop turns on
 * this: *invitation → Campaign Order → deliverable*.
 *
 * TERMS ARE FROZEN AT SEND, NOT READ LIVE. `compensation`, `usageRights`,
 * `exclusivity` and `dueDate` are copied onto the order when it is sent and
 * never re-read from the rate card or the campaign afterwards. A rate card is
 * versioned precisely because it moves; an order that read it live would mean
 * an athlete who accepted $150 in March being paid whatever the card says in
 * September, and neither party able to prove what was agreed.
 *
 * ACCEPTANCE IS EVIDENCE, NOT A BOOLEAN. P3-BE-06 built
 * `acceptAgreement` — body hash, signer, IP, user agent — and this attaches
 * the acceptance it produces to the order. The hash is of the text actually
 * shown, so a later edit to the template cannot rewrite what someone agreed
 * to.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canTransitionOrder,
  IllegalOrderTransitionError,
  type OrderState,
} from "./order-state";
import { guardianReadiness } from "./guardian-rules";
import { acceptAgreementIn } from "./agreement";
import { assertBudgetCarriesLine } from "./margin-floor";

export class AcceptanceNeedsEvidenceError extends Error {
  readonly status = 400;
  constructor() {
    super(
      "An order is accepted through its own endpoint, which records the body " +
        "hash of the text shown, the signer, the IP and the user agent, and " +
        "refuses a minor without a verified guardian (§12, §37). A bare state " +
        "change cannot carry any of that.",
    );
    this.name = "AcceptanceNeedsEvidenceError";
  }
}

export class OrderNotSentError extends Error {
  readonly status = 409;
  constructor(state: OrderState) {
    super(
      `This order is ${state}. Only a SENT order can be accepted — accepting ` +
        `a draft would bind an athlete to terms nobody has offered them yet.`,
    );
    this.name = "OrderNotSentError";
  }
}

export class GuardianRequiredForOrderError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This athlete is a minor whose guardian is not verified (§37, §4). A " +
        "minor cannot be bound to paid work without their guardian.",
    );
    this.name = "GuardianRequiredForOrderError";
  }
}

export type OrderTerms = {
  /** Cents — the athlete's compensation, never the sponsor price. */
  compensation: number;
  usageRights: string;
  exclusivity?: string | null;
  dueDate: Date;
};

/**
 * Create the order an accepted invitation becomes.
 *
 * It starts in DRAFT: sending is a separate act, because the terms are frozen
 * at that moment and freezing them should be something a person does on
 * purpose.
 */
export async function createOrder(
  actor: Actor,
  input: { campaignId: string; athleteId: string; jobId: string } & OrderTerms,
): Promise<{ id: string; state: OrderState }> {
  assertTenantWide(actor, "campaignOrder", "write");

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId },
      select: { id: true, budget: true },
    });
    if (!campaign) throw new ForbiddenError("campaignOrder", "write");

    /* P3-BE-12, enforced HERE rather than reported later. Built and tested as
       a rule, it was called by nothing until this line — which made its
       acceptance ("a line below the floor cannot be saved") untrue. */
    const existing = await tx.campaignOrder.aggregate({
      where: { campaignId: input.campaignId, state: { not: "CANCELLED" } },
      _sum: { compensation: true },
    });
    assertBudgetCarriesLine(
      input.jobId,
      input.compensation,
      existing._sum.compensation ?? 0,
      campaign.budget,
    );

    const order = await tx.campaignOrder.create({
      data: {
        tenantId: actor.tenantId,
        campaignId: input.campaignId,
        athleteId: input.athleteId,
        jobId: input.jobId,
        compensation: input.compensation,
        usageRights: input.usageRights,
        exclusivity: input.exclusivity ?? null,
        dueDate: input.dueDate,
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, "order.create", "CampaignOrder", order.id, {
      after: {
        campaignId: input.campaignId, athleteId: input.athleteId,
        jobId: input.jobId, compensation: input.compensation,
      },
    });

    return { id: order.id, state: order.state as OrderState };
  });
}

/** Move an order through §21, or refuse. */
export async function transitionOrder(
  actor: Actor,
  orderId: string,
  to: OrderState,
): Promise<{ id: string; state: OrderState }> {
  /* ACCEPTED IS NOT REACHABLE HERE, AT ALL.
     It was, and that made P5-BE-01's acceptance untrue: this path has no body
     hash, no signer, no IP and no guardian check, so an athlete could bind
     themselves to an order with none of the evidence §12 requires and a minor
     could do it without a verified guardian. A guard on one route means
     nothing while a second route reaches the same state around it. */
  if (to === "ACCEPTED") throw new AcceptanceNeedsEvidenceError();

  /* Declining is the athlete's and needs no evidence — there is nothing to
     prove about a refusal. Everything else is BTG's. */
  if (to === "REJECTED") {
    assertAllowed(actor, "campaignOrder", "write");
  } else {
    assertTenantWide(actor, "campaignOrder", "write");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.campaignOrder.findFirst({
      where: { ...whereFor(actor, "campaignOrder", "write"), id: orderId },
      select: { id: true, state: true },
    });
    if (!order) throw new ForbiddenError("campaignOrder", "write");

    const from = order.state as OrderState;
    if (!canTransitionOrder(from, to)) throw new IllegalOrderTransitionError(from, to);

    const updated = await tx.campaignOrder.update({
      where: { id: orderId },
      data: { state: to as Prisma.CampaignOrderUpdateInput["state"] },
      select: { id: true, state: true },
    });

    await audit(tx, actor, ORDER_AUDIT_ACTIONS[to], "CampaignOrder", orderId, {
      before: { state: from },
      after: { state: to },
    });

    return { id: updated.id, state: updated.state as OrderState };
  });
}

/**
 * Accept an order — P5-BE-01.
 *
 * Four things happen together or none do: the agreement acceptance is
 * recorded with its body hash and evidence, the order is linked to it, the
 * order moves to ACCEPTED, and the audit row is written. An acceptance
 * recorded against an order that did not move, or an order marked accepted
 * with no evidence behind it, are both worse than a refusal.
 *
 * The signer, IP and user agent come from the request via `acceptAgreement`,
 * never from the caller's body.
 */
export async function acceptOrder(
  actor: Actor,
  orderId: string,
  evidence: { agreementId: string; bodyHashShown: string; ip: string; userAgent: string },
): Promise<{ id: string; state: OrderState; acceptanceId: string }> {
  assertAllowed(actor, "campaignOrder", "write");

  /* ONE TRANSACTION. This was three, and the failure mode was not the orphan
     acceptance I talked myself into accepting — it was the order. If the
     process died after the acceptance was written, the order stayed SENT, the
     athlete retried, and acceptAgreement then refused with
     AlreadyAcceptedError because that signer had already accepted that
     version. The order could never be accepted by anyone again. */
  return prisma.$transaction(async (tx) => {
    const order = await tx.campaignOrder.findFirst({
      where: { ...whereFor(actor, "campaignOrder", "write"), id: orderId },
      select: {
        id: true, state: true,
        athlete: {
          select: {
            birthDate: true, ageBand: true, guardianId: true,
            guardian: { select: { verifiedAt: true } },
          },
        },
      },
    });
    if (!order) throw new ForbiddenError("campaignOrder", "write");

    const from = order.state as OrderState;
    if (from !== "SENT") throw new OrderNotSentError(from);

    /* Read inside the transaction, so the state cannot move between the check
       and the write. */
    const readiness = guardianReadiness({
      birthDate: order.athlete.birthDate,
      ageBand: order.athlete.ageBand,
      guardianId: order.athlete.guardianId,
      guardianVerifiedAt: order.athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianRequiredForOrderError();
    }

    const acceptance = await acceptAgreementIn(tx, actor, evidence);

    const updated = await tx.campaignOrder.update({
      where: { id: orderId },
      data: {
        state: "ACCEPTED",
        acceptedAt: new Date(),
        acceptanceId: acceptance.acceptanceId,
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.campaign.orderAccept, "CampaignOrder", orderId, {
      before: { state: from },
      after: {
        state: "ACCEPTED",
        acceptanceId: acceptance.acceptanceId,
        guardianId: acceptance.guardianId,
      },
    });

    /* No notification enqueued here. "campaign live" is not what happened —
       one order was accepted — and inventing a job name whose handler nobody
       owns just adds rows to the outbox that wait forever. P5-INT-01 owns
       deliverable and order notifications (fix 6). */

    return {
      id: updated.id,
      state: updated.state as OrderState,
      acceptanceId: acceptance.acceptanceId,
    };
  });
}

const ORDER_AUDIT_ACTIONS: Record<OrderState, `${string}.${string}`> = {
  DRAFT: "order.draft",
  SENT: "order.send",
  ACCEPTED: AUDIT_ACTIONS.campaign.orderAccept,
  REJECTED: AUDIT_ACTIONS.campaign.orderReject,
  ACTIVE: "order.activate",
  COMPLETED: "order.complete",
  CANCELLED: "order.cancel",
};

export { ORDER_AUDIT_ACTIONS };
export * from "./order-state";
