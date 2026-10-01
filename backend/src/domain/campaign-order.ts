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
import { assertBudgetCarriesLine, assertLineClearsFloor } from "./margin-floor";
import { createDeliverablesFromJob } from "./deliverable";
import { createEarningForOrder } from "./earning";
import { projectLine } from "./pricing-learning";

export class TermsFrozenError extends Error {
  readonly status = 409;
  constructor(state: OrderState) {
    super(
      `This order is ${state}; its terms were fixed when it was sent. An ` +
        `athlete decides on the terms in front of them, so changing them now ` +
        `means a new order, not an edit of this one.`,
    );
    this.name = "TermsFrozenError";
  }
}

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
  /** Cents — what the sponsor pays for this line. Must clear the floor. */
  sellPrice: number;
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
      /* tenant-scope: keyed by the campaign loaded above through whereFor. */
      where: { campaignId: input.campaignId, state: { not: "CANCELLED" } },
      _sum: { compensation: true },
    });
    const athlete = await tx.athlete.findFirst({
      where: { id: input.athleteId, tenantId: actor.tenantId },
      select: {
        tier: true,
        /* P7-DATA-03 — the audience figures the projection rests on, read
           here so the implied CPM is frozen onto the line at creation. */
        socials: { select: { followers: true, avgViews: true, source: true } },
      },
    });

    /* P3-BE-12, per line and in its literal form: this line's sponsor price
       against this line's athlete cost. */
    assertLineClearsFloor(
      input.jobId, athlete?.tier ?? null, input.compensation, input.sellPrice);

    /* And the campaign must be able to pay for all of them together — a
       different way to be wrong, and the only one the budget can catch. */
    assertBudgetCarriesLine(
      input.jobId,
      athlete?.tier ?? null,
      input.compensation,
      existing._sum.compensation ?? 0,
      campaign.budget,
    );

    /* P7-DATA-03 — frozen here, at creation, for the same reason the price
       is: the athlete's follower and view figures move, and recomputing later
       answers "what would we project today" rather than "what did we think
       this was worth when we sold it". Fixed-price jobs get one too — they
       are exactly the lines with no price signal of their own. */
    const projection = projectLine(input.sellPrice, athlete?.socials ?? []);

    const order = await tx.campaignOrder.create({
      data: {
        tenantId: actor.tenantId,
        campaignId: input.campaignId,
        athleteId: input.athleteId,
        jobId: input.jobId,
        compensation: input.compensation,
        sellPrice: input.sellPrice,
        usageRights: input.usageRights,
        exclusivity: input.exclusivity ?? null,
        dueDate: input.dueDate,
        projectedImpressions: projection.projectedImpressions,
        impliedCpm: projection.impliedCpm,
        projectionSource: projection.projectionSource as Prisma.CampaignOrderCreateInput["projectionSource"],
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

/**
 * Change the commercial terms — only while the order is a DRAFT.
 *
 * P5-BE-02's acceptance says terms are "snapshotted at send time, not read
 * live". Nothing read them live, but nothing froze them either: the property
 * held only because no update path existed, which is not the same as being
 * enforced. The moment anyone added one, an order's terms could change under
 * an athlete who had already been sent them.
 *
 * So the update path exists here, and it refuses past DRAFT. SENT is the
 * snapshot: after it, the row is what the athlete was shown.
 */
export async function updateOrderTerms(
  actor: Actor,
  orderId: string,
  terms: Partial<OrderTerms>,
): Promise<{ id: string; state: OrderState }> {
  assertTenantWide(actor, "campaignOrder", "write");

  return prisma.$transaction(async (tx) => {
    const order = await tx.campaignOrder.findFirst({
      where: { ...whereFor(actor, "campaignOrder", "write"), id: orderId },
      select: { id: true, state: true, compensation: true, sellPrice: true },
    });
    if (!order) throw new ForbiddenError("campaignOrder", "write");

    const from = order.state as OrderState;
    if (from !== "DRAFT") throw new TermsFrozenError(from);

    const updated = await tx.campaignOrder.update({
      where: { id: orderId },
      data: {
        ...(terms.compensation !== undefined ? { compensation: terms.compensation } : {}),
        ...(terms.sellPrice !== undefined ? { sellPrice: terms.sellPrice } : {}),
        ...(terms.usageRights !== undefined ? { usageRights: terms.usageRights } : {}),
        ...(terms.exclusivity !== undefined ? { exclusivity: terms.exclusivity } : {}),
        ...(terms.dueDate !== undefined ? { dueDate: terms.dueDate } : {}),
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, "order.termsUpdate", "CampaignOrder", orderId, {
      before: { compensation: order.compensation, sellPrice: order.sellPrice },
      after: { fields: Object.keys(terms) },
    });

    return { id: updated.id, state: updated.state as OrderState };
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
        /* Needed by createDeliverablesFromJob below — read here, inside the
           transaction, rather than re-read after the update. */
        tenantId: true, jobId: true, dueDate: true,
        /* P7-BE-01 — the earning is raised in this same transaction. */
        athleteId: true, compensation: true,
        athlete: {
          select: {
            birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
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
      majorityAge: order.athlete.majorityAge,
      guardianId: order.athlete.guardianId,
      guardianVerifiedAt: order.athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianRequiredForOrderError();
    }

    /* One acceptance per ORDER, not per signer — see acceptAgreementIn's
       `oncePerSigner`. The `from !== "SENT"` guard above is the double-accept
       protection, and it runs inside this transaction. */
    const acceptance = await acceptAgreementIn(tx, actor, evidence, { oncePerSigner: false });

    const updated = await tx.campaignOrder.update({
      where: { id: orderId },
      data: {
        state: "ACCEPTED",
        acceptedAt: new Date(),
        acceptanceId: acceptance.acceptanceId,
      },
      select: { id: true, state: true },
    });

    /* P5-BE-03 — the deliverable set is created HERE, in the acceptance
       transaction, not by a follow-up call. An accepted order whose
       deliverables failed to write is an athlete who owes nothing and a
       sponsor who paid for something; the two facts have to commit together
       or not at all. `acceptOrder` is the only path to ACCEPTED
       (`transitionOrder` refuses it outright), so this is the only place the
       set can come into existence. */
    await createDeliverablesFromJob(tx, actor, {
      id: order.id,
      tenantId: order.tenantId,
      jobId: order.jobId,
      dueDate: order.dueDate,
    });

    /* P7-BE-01 — the earning exists from the moment the contract does, at
       PENDING. Raising it later, on completion, would mean the period between
       acceptance and delivery shows an athlete owed nothing for work they are
       already contractually committed to. */
    await createEarningForOrder(tx, actor, {
      id: order.id,
      tenantId: order.tenantId,
      athleteId: order.athleteId,
      compensation: order.compensation,
      dueDate: order.dueDate,
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
