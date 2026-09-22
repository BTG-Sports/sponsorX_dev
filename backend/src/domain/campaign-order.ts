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
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canTransitionOrder,
  IllegalOrderTransitionError,
  type OrderState,
} from "./order-state";
import { guardianReadiness } from "./guardian-rules";
import { acceptAgreement } from "./agreement";

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
      select: { id: true },
    });
    if (!campaign) throw new ForbiddenError("campaignOrder", "write");

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
  /* ACCEPTED and REJECTED are the athlete's to make and go through
     `acceptOrder` / this function with an `own` reach; everything else is
     BTG's. */
  if (to !== "ACCEPTED" && to !== "REJECTED") {
    assertTenantWide(actor, "campaignOrder", "write");
  } else {
    assertAllowed(actor, "campaignOrder", "write");
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

  /* The acceptance is recorded first and in its own transaction, because
     `acceptAgreement` owns the body-hash comparison and the
     already-accepted check (P3-BE-06). If the order update below fails, the
     acceptance is an orphan row that records a real event and harms nothing;
     the reverse — an accepted order with no evidence — is the state §12
     cannot tolerate. */
  const order = await prisma.campaignOrder.findFirst({
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

  const readiness = guardianReadiness({
    birthDate: order.athlete.birthDate,
    ageBand: order.athlete.ageBand,
    guardianId: order.athlete.guardianId,
    guardianVerifiedAt: order.athlete.guardian?.verifiedAt ?? null,
  });
  if (readiness.status === "missing" || readiness.status === "unverified") {
    throw new GuardianRequiredForOrderError();
  }

  const acceptance = await acceptAgreement(actor, evidence);

  return prisma.$transaction(async (tx) => {
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

    await enqueue(tx, actor.tenantId, "notify.campaignLive", { orderId });

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
