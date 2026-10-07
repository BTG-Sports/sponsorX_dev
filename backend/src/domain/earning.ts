/**
 * Earnings — P7-BE-01 (the record), P7-BE-02 (automatic eligibility) and
 * P7-BE-03 (gross, adjustments and BTG margin).
 *
 * The end of §39's loop: *deliverable → tracking/reward → earnings → sponsor
 * report*. What an athlete is owed, and how far along it is.
 *
 * NOTHING HERE MOVES MONEY, AND THAT IS THE DESIGN. Phase 1 tracks status
 * only (Addendum A6). Transfers happen in Zoho Books, arranged by a person;
 * `PAID` records that one happened. So there is no tax ID field, no bank
 * detail, no payment provider and no way to add one without changing the
 * schema — §26 forbids bank details outright, and a model that cannot hold
 * them cannot leak them.
 *
 * `Earning.reference` holds a Zoho or bank REFERENCE — a pointer to a record
 * elsewhere, not a credential, and not enough to move anything.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { MARGIN_FLOOR } from "./pricing";
import {
  canTransitionEarning,
  IllegalEarningTransitionError,
  isEarningMutable,
  type EarningState,
} from "./earning-state";
import { payoutHoldReason } from "./payout-holds";
import { refuseCardNumber } from "./marketplace-order-rules";
import { autoApprovalReasons, autoApproveSettings, autoApprovedByTenant, autoWindowFor, lockPayee, SYSTEM, windowStart } from "./payout-auto";

export class EarningImmutableError extends Error {
  readonly status = 409;
  constructor(state: EarningState) {
    super(
      `This earning is ${state}; its amount can no longer change. Once money ` +
        `has been approved or sent, a correction is a new adjustment, not a ` +
        `quiet edit of what was already agreed.`,
    );
    this.name = "EarningImmutableError";
  }
}

export class OrderNotEarningEligibleError extends Error {
  readonly status = 409;
  constructor(reason: string) {
    super(`This order has no earning to record: ${reason}`);
    this.name = "OrderNotEarningEligibleError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   P7-BE-03 · What the money actually is
   ──────────────────────────────────────────────────────────────────────────── */

export type EarningBreakdown = {
  /** cents — what the athlete is paid, before adjustments. */
  gross: number;
  /** cents — corrections, positive or negative. */
  adjustment: number;
  /** cents — what the athlete ends up with. */
  net: number;
  /** cents — what the sponsor paid for this line. */
  sellPrice: number;
  /** cents — BTG's margin on the line. */
  margin: number;
  /** Margin as a share of the sponsor price, to four decimal places. */
  marginRate: number;
};

/**
 * Split one order's money three ways — P7-BE-03.
 *
 * Pure: no database, no clock. Takes the two numbers frozen onto the order at
 * send time and the adjustment recorded against the earning.
 *
 * WHY THE FLOOR IS NOT RE-CHECKED HERE. `P3-BE-12` refuses to create a line
 * whose sponsor price is below athlete cost x 1.4, inside the same
 * transaction that creates it. So a line below the floor cannot exist to be
 * calculated, and repeating the check at calculation time would be a second
 * place for the rule to drift from the first. What this function does instead
 * is REPORT the margin rate, so an underwater line — if one ever appeared
 * through a migration or a manual fix — is visible rather than silently
 * averaged into a total.
 *
 * ADJUSTMENTS MOVE THE ATHLETE'S SIDE, NOT BTG'S. A correction is money BTG
 * pays or claws back; the sponsor already paid `sellPrice` and is not
 * re-invoiced because an athlete was topped up. So `margin` is computed
 * against `gross + adjustment`.
 */
export function breakdown(input: {
  compensation: number;
  sellPrice: number;
  adjustment?: number;
}): EarningBreakdown {
  const adjustment = input.adjustment ?? 0;
  const net = input.compensation + adjustment;
  const margin = input.sellPrice - net;

  return {
    gross: input.compensation,
    adjustment,
    net,
    sellPrice: input.sellPrice,
    margin,
    marginRate:
      input.sellPrice === 0 ? 0 : Math.round((margin / input.sellPrice) * 10000) / 10000,
  };
}

/** True where the line still clears §5's floor. Reported, never enforced
 *  here — enforcement is P3-BE-12's, at creation. */
export function clearsFloor(b: EarningBreakdown): boolean {
  return b.sellPrice >= Math.ceil(b.net * MARGIN_FLOOR);
}

/* ────────────────────────────────────────────────────────────────────────────
   P7-BE-01 · The record
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create the earning for an accepted order, inside the caller's transaction.
 *
 * One earning per order — `Earning.orderId` is unique — so this is idempotent
 * by refusal rather than by upsert: a second call means a bug worth seeing.
 *
 * Starts at PENDING always. An earning that arrived ELIGIBLE would mean the
 * athlete was owed money before any work was verified.
 */
export async function createEarningForOrder(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "tenantId" | "userId">,
  order: {
    id: string;
    tenantId: string;
    athleteId: string;
    compensation: number;
    dueDate: Date;
  },
): Promise<{ id: string; state: EarningState }> {
  const existing = await tx.earning.findUnique({
    /* tenant-scope: orderId is unique; the order is the one being accepted, already scoped by the caller. */
    where: { orderId: order.id },
    select: { id: true },
  });
  if (existing) {
    throw new OrderNotEarningEligibleError("it already has one");
  }

  const created = await tx.earning.create({
    data: {
      tenantId: order.tenantId,
      athleteId: order.athleteId,
      orderId: order.id,
      gross: order.compensation,
      /* The year the work was due, not the year it is paid. A deliverable due
         in December and paid in January belongs to the December campaign for
         reporting, and using the payment date would move earnings between
         years depending on how fast Finance ran a batch. */
      taxYear: order.dueDate.getUTCFullYear(),
      state: "PENDING",
    },
    select: { id: true, state: true },
  });

  await audit(tx, actor, AUDIT_ACTIONS.earning.create, "Earning", created.id, {
    after: { orderId: order.id, gross: order.compensation, state: "PENDING" },
  });

  return { id: created.id, state: created.state as EarningState };
}

/**
 * Move an earning through §21, or refuse.
 *
 * `markPaid` is folded in rather than separate: reaching PAID also records
 * when and against which reference, and a transition that could reach PAID
 * without those would be a payment nobody can trace.
 */
export async function transitionEarning(
  actor: Actor,
  earningId: string,
  to: EarningState,
  detail: { reference?: string | null } = {},
): Promise<{ id: string; state: EarningState }> {
  /* Finance moves money through its states; §15 gives FINANCE the approve
     right on earnings and BTG_ADMIN only read/write. Approving a payout and
     recording one are both `approve`. */
  const action = to === "APPROVED_FOR_PAYOUT" || to === "PAID" ? "approve" : "write";
  assertTenantWide(actor, "earning", action);
  /* 2S0-SEC-01 (O5) — "a Zoho or bank reference", never a card number (§26). */
  refuseCardNumber(detail.reference, "reference");

  return prisma.$transaction(async (tx) => {
    const earning = await tx.earning.findFirst({
      where: { ...whereFor(actor, "earning", action), id: earningId },
      select: { id: true, state: true },
    });
    if (!earning) throw new ForbiddenError("earning", action);

    const from = earning.state as EarningState;
    if (!canTransitionEarning(from, to)) throw new IllegalEarningTransitionError(from, to);

    /* tenant-scope: the row loaded above through whereFor(earning). */
    const updated = await tx.earning.update({
      where: { id: earningId },
      data: {
        state: to as Prisma.EarningUpdateInput["state"],
        ...(to === "PAID"
          ? { paidAt: new Date(), reference: detail.reference ?? null }
          : {}),
        /* 2S5-BE-08 — approved by a person now, not by the rule. */
        ...(to === "APPROVED_FOR_PAYOUT" ? { approvedAutomatically: false } : {}),
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, EARNING_AUDIT_ACTIONS[to], "Earning", earningId, {
      before: { state: from },
      after: { state: to, ...(to === "PAID" ? { reference: detail.reference ?? null } : {}) },
    });

    return { id: updated.id, state: updated.state as EarningState };
  });
}

/**
 * Record a correction against an earning — P7-BE-03.
 *
 * Refused once the money is approved or gone: after that a correction is a
 * new adjustment with its own audit trail, not a quiet edit of a figure
 * someone already signed off.
 */
export async function adjustEarning(
  actor: Actor,
  earningId: string,
  adjustment: number,
  reason: string,
): Promise<EarningBreakdown & { id: string }> {
  assertTenantWide(actor, "earning", "write");
  refuseCardNumber(reason, "reason"); // 2S0-SEC-01 (O5)

  return prisma.$transaction(async (tx) => {
    const earning = await tx.earning.findFirst({
      where: { ...whereFor(actor, "earning", "write"), id: earningId },
      select: {
        id: true, state: true, gross: true, adjustment: true,
        order: { select: { sellPrice: true } },
      },
    });
    if (!earning) throw new ForbiddenError("earning", "write");

    const state = earning.state as EarningState;
    if (!isEarningMutable(state)) throw new EarningImmutableError(state);

    /* tenant-scope: the row loaded above through whereFor(earning, write). */
    const updated = await tx.earning.update({
      where: { id: earningId },
      data: { adjustment },
      select: { id: true, gross: true, adjustment: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.earning.adjust, "Earning", earningId, {
      before: { adjustment: earning.adjustment },
      after: { adjustment, reason },
    });

    return {
      id: updated.id,
      ...breakdown({
        compensation: updated.gross,
        sellPrice: earning.order.sellPrice,
        adjustment: updated.adjustment,
      }),
    };
  });
}

/** One earning with its money broken out. */
export async function readEarning(
  actor: Actor,
  earningId: string,
): Promise<EarningBreakdown & { id: string; state: EarningState; clearsFloor: boolean }> {
  assertAllowed(actor, "earning", "read");

  const earning = await prisma.earning.findFirst({
    where: { ...whereFor(actor, "earning", "read"), id: earningId },
    select: {
      id: true, state: true, gross: true, adjustment: true,
      order: { select: { sellPrice: true } },
    },
  });
  if (!earning) throw new ForbiddenError("earning", "read");

  const b = breakdown({
    compensation: earning.gross,
    sellPrice: earning.order.sellPrice,
    adjustment: earning.adjustment,
  });

  return { id: earning.id, state: earning.state as EarningState, ...b, clearsFloor: clearsFloor(b) };
}

/* ────────────────────────────────────────────────────────────────────────────
   P7-BE-02 · Eligibility from completed work
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Make an order's earning ELIGIBLE once its work is verified, inside the
 * caller's transaction. Called from the deliverable chain, never on its own.
 *
 * WHEN, EXACTLY — AND A DIVERGENCE FROM THE TASK'S WORDING.
 * `P7-BE-02` says "closing an accepted deliverable makes the associated
 * earning ELIGIBLE". Read literally that fires on the FIRST deliverable, but
 * an Earning is per ORDER (`orderId` is unique) and an order can owe several
 * deliverables — SX-07 owes four weekly posts. Firing on the first would make
 * an athlete owed the whole fee for a quarter of the work.
 *
 * So this fires when the LAST one is verified: every deliverable on the order
 * is VERIFIED, and only then. That is a deliberate divergence from the
 * sentence, recorded here and raised on the pull request rather than quietly
 * reinterpreted — the alternative is a commercial error, not a style choice.
 *
 * Returns null when the order is not finished yet, which is the ordinary case
 * for every deliverable except the last.
 */
export async function maybeMakeEligible(
  tx: Prisma.TransactionClient,
  actor: Pick<Actor, "tenantId" | "userId">,
  orderId: string,
): Promise<{ id: string; state: EarningState } | null> {
  const outstanding = await tx.deliverable.count({
    where: { orderId, tenantId: actor.tenantId, state: { not: "VERIFIED" } },
  });
  if (outstanding > 0) return null;

  const earning = await tx.earning.findUnique({
    /* tenant-scope: orderId is unique; the order comes from a deliverable the caller loaded through whereFor. */
    where: { orderId },
    select: { id: true, state: true },
  });
  /* No earning yet is not an error: orders created before earnings existed,
     and orders whose earning is raised later, both reach here legitimately. */
  if (!earning) return null;

  const from = earning.state as EarningState;
  /* Only PENDING becomes ELIGIBLE automatically. An earning a human put on
     HOLD or into DISPUTE must not be quietly released by the last deliverable
     landing — that decision is Finance's to reverse, not this function's. */
  if (from !== "PENDING") return null;

  /* tenant-scope: the order's earning found above; orderId is unique and comes from a deliverable the caller loaded through whereFor. */
  const updated = await tx.earning.update({
    where: { id: earning.id },
    data: { state: "ELIGIBLE" },
    select: { id: true, state: true },
  });

  await audit(tx, actor, AUDIT_ACTIONS.payout.markEligible, "Earning", earning.id, {
    before: { state: from },
    after: { state: "ELIGIBLE", reason: "all deliverables verified", orderId },
  });

  /* 2S5-BE-08 — and on to APPROVED_FOR_PAYOUT, by the rule, in this same transaction. */
  const approved = await autoApproveEarning(tx, earning.id);
  return { id: updated.id, state: approved ?? (updated.state as EarningState) };
}

/**
 * 2S5-BE-08 — an earning that has just become ELIGIBLE moves on to
 * APPROVED_FOR_PAYOUT as the system, audited, when the programme owner's rule
 * passes (payout-auto.ts): it is not HELD or DISPUTED, the athlete's payouts
 * are not on hold, its net is under $2,000, and the athlete's automatic
 * approvals in the last 7 days — Phase 2 payouts and Phase 1 earnings,
 * counting this one — stay under $5,000. There is no payout-account check:
 * Phase 1 money is paid outside SponsorX and Finance records it. Otherwise it
 * stays ELIGIBLE with its reasons, for Finance's approval by hand.
 *
 * Only an ELIGIBLE earning is ever moved, conditionally — a HELD or DISPUTED
 * one (a person put it there) is never touched. PAID stays Finance's.
 * Under the athlete's payee lock, shared with their payout requests, so the
 * two cannot both slip under the 7-day cap.
 */
async function autoApproveEarning(tx: Prisma.TransactionClient, earningId: string, now = new Date()): Promise<EarningState | null> {
  const e = await tx.earning.findUnique({
    /* tenant-scope: the earning the caller just made ELIGIBLE, by id. */
    where: { id: earningId }, select: { id: true, tenantId: true, athleteId: true, state: true, gross: true, adjustment: true },
  });
  if (!e || e.state !== "ELIGIBLE") return null;
  const payee = { payeeType: "ATHLETE", payeeId: e.athleteId };
  await lockPayee(tx, payee);
  const settings = autoApproveSettings();
  const amountCents = e.gross + e.adjustment;
  const held = await payoutHoldReason(tx, payee);
  /* The cap counts every tenant; Finance in this earning's tenant reads the reason. */
  const window = autoWindowFor(await autoApprovedByTenant(tx, payee, windowStart(now, settings)), e.tenantId);
  const windowCents = window.totalCents;
  const reasons = autoApprovalReasons({ amountCents, held: Boolean(held), windowCents, windowIncludesOtherTenants: window.includesOtherTenants, now }, settings);
  if (reasons.length) {
    await tx.earning.updateMany({
      /* tenant-scope: the earning just loaded by id; only while it is still ELIGIBLE. */
      where: { id: e.id, state: "ELIGIBLE" }, data: { reviewReasons: reasons },
    });
    await audit(tx, { userId: null, tenantId: e.tenantId }, "earning.needsReview", "Earning", e.id, {
      after: { state: "ELIGIBLE", approvedAutomatically: false, reviewReasons: reasons },
    });
    return null;
  }
  const moved = await tx.earning.updateMany({
    /* tenant-scope: the earning just loaded by id; conditional, so nothing but an ELIGIBLE earning moves. */
    where: { id: e.id, state: "ELIGIBLE" },
    data: { state: "APPROVED_FOR_PAYOUT", approvedAutomatically: true, autoApprovedAt: now, reviewReasons: [] },
  });
  if (!moved.count) return null;
  await audit(tx, { userId: null, tenantId: e.tenantId }, AUDIT_ACTIONS.payout.approveForPayout, "Earning", e.id, {
    before: { state: "ELIGIBLE" },
    after: { state: "APPROVED_FOR_PAYOUT", approvedBy: SYSTEM, approvedAutomatically: true, amountCents, rule: { ...settings, windowCentsBefore: window.includesOtherTenants ? null : windowCents, windowIncludesOtherTenants: window.includesOtherTenants } },
  });
  return "APPROVED_FOR_PAYOUT";
}

const EARNING_AUDIT_ACTIONS: Record<EarningState, `${string}.${string}`> = {
  PENDING: "earning.pending",
  ELIGIBLE: AUDIT_ACTIONS.payout.markEligible,
  APPROVED_FOR_PAYOUT: AUDIT_ACTIONS.payout.approveForPayout,
  PAID: AUDIT_ACTIONS.payout.markPaid,
  HELD: AUDIT_ACTIONS.payout.hold,
  DISPUTED: AUDIT_ACTIONS.payout.dispute,
};

export { EARNING_AUDIT_ACTIONS };
