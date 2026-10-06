/**
 * Payout accounts, card payments and payouts — 2S5-INT-01, 2S5-INT-03,
 * 2S5-BE-04 and 2S5-BE-05.
 *
 * The story (walkthrough steps 5, 11, 14, 15):
 *   - A payee (an athlete, or a property/team) sets up where they are paid on
 *     the provider's own page. SponsorX keeps the provider's account id and
 *     its status — never a bank detail.
 *   - A sponsor pays an approved order on the provider's page. SponsorX never
 *     sees the card. The provider's confirmation marks the order PAID, which
 *     makes the payables available (ledger.ts).
 *   - A payee requests its available balance. It is requestable only when:
 *       the sponsor's payment is in (the payable is AVAILABLE),
 *       the LINE is delivered and confirmed (2S4-BE-07 — by the sponsor, by
 *         24 hours of silence, or by BTG; a line under a reported problem is
 *         held until BTG resolves it),
 *       the holding period since that confirmation has passed (PAYOUT_HOLD_DAYS),
 *       and the payout account is READY.
 *     A refunded or cancelled order's money is reversed in the ledger and so
 *     can never be requested.
 *   - 2S5-BE-06 — it is approved AUTOMATICALLY, as the system, when every
 *     check passes, it is under $2,000, the payout account didn't change in
 *     the last 7 days and the payee's automatic approvals in the last 7 days
 *     stay under $5,000 (payout-auto.ts). Otherwise BTG admin or Finance
 *     approves it (or sends it back with a note), reading the reasons.
 *   - The provider sends it; its confirmation marks it PAID, posts the PAYOUT
 *     journals and emails the payee.
 *   - 2S5-BE-07 — a payout the provider couldn't send is retried
 *     automatically (a temporary failure, up to 3 times), waits for the payee
 *     to fix their payout account (retried once when it is READY again), or
 *     goes to BTG. BTG can retry any failed payout at any time.
 *
 * All provider traffic goes through lib/payment-provider.ts. With Stripe
 * (2S5-INT-01 / -03): the sponsor pays on Stripe's hosted Checkout, a payee
 * sets up a Connect Express account on Stripe's hosted onboarding, and a
 * payout is a transfer to that account. On staging the provider may be a
 * labelled stand-in that moves no money; in production, until a provider is
 * connected, links are refused and approved payouts wait.
 */

/** A transaction that calls the provider waits for it, at most PAYMENT_PROVIDER_TIMEOUT_MS (and its own work besides). */
const providerTx = () => ({ timeout: env.PAYMENT_PROVIDER_TIMEOUT_MS * 2 + 10_000, maxWait: 10_000 });
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  createPayoutAccount, openCheckout, payoutAccountLinkUrl, payoutAccountStatus, ProviderRefusedError, providerName, readStandinToken, sendPayoutToProvider, standinLink, standinRef,
  StandinTokenError,
} from "../lib/payment-provider";
import { postPayout, postPayoutReturn } from "./ledger";
import { recordRefund } from "./refunds";
import { lockOrder, moveOrderAsSystem, payOrderIn } from "./marketplace-order";
import { appUrl, btgAdmins, tell } from "./order-mail";
import { assertMayCommit } from "./guardian-acts";
import { payoutHoldReason } from "./payout-holds";
import { applied, deferred, emitStandinEvent, held, ignored, processPaymentEvent, standinDecline, type Handler } from "./payment-events";
import { moneyHoldsOn } from "./payment-exceptions";
import {
  autoApprovalReasons, autoApproveSettings, autoApprovedByTenant, autoWindowFor, claimsMoney, lockPayee, nextChangedAt, planFailure,
  SYSTEM, waitingOnOf, waitingOnWhere, windowStart, type FailureKind, type WaitingOn,
} from "./payout-auto";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class PayoutError extends Error {
  readonly status: number;
  readonly reasons: string[];
  constructor(message: string, status = 409, reasons: string[] = []) {
    super(message);
    this.name = "PayoutError";
    this.status = status;
    this.reasons = reasons;
  }
}

export type PayeeType = "ATHLETE" | "PROPERTY";
export type Payee = { payeeType: PayeeType; payeeId: string; payeeTenantId: string };

const PAYABLE: Record<PayeeType, string> = { ATHLETE: "ATHLETE_PAYABLE", PROPERTY: "PROPERTY_PAYABLE" };
/* 2S4-BE-07 — an order whose confirmed lines may release money: paid, not refunded or cancelled. */
const RELEASING = new Set(["IN_DELIVERY", "FULFILLED", "CLOSED"]);
const PAID_OR_LATER = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);

const providerUnavailable = (what: string) =>
  new PayoutError(`${what} opens once SponsorX's payment provider is connected. Nothing has been charged or sent.`, 409);

/** The actor as a payee: an athlete for themselves, a property manager for their property. */
function payeeOf(actor: Actor, resource: "payout" | "payoutAccount", action: "read" | "write"): Payee {
  const scope = assertAllowed(actor, resource, action);
  if (scope === "own" && actor.athleteId) return { payeeType: "ATHLETE", payeeId: actor.athleteId, payeeTenantId: actor.tenantId };
  if (scope === "own-property" && actor.propertyId) return { payeeType: "PROPERTY", payeeId: actor.propertyId, payeeTenantId: actor.tenantId };
  throw new ForbiddenError(resource, action);
}

/** A same-site path to come back to — never another site. 2S8-SEC-02: control
 *  characters are refused too — browsers strip a tab or newline, so
 *  "/\t/evil.example" arrives as "//evil.example". */
export function safeReturnPath(p: unknown, fallback: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  const control = /[\u0000-\u001f\u007f]/;
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !control.test(p) ? p.slice(0, 300) : fallback;
}

async function payeeName(db: Db, p: { payeeType: PayeeType; payeeId: string }): Promise<string> {
  if (p.payeeType === "ATHLETE") {
    const a = await db.athlete.findUnique({
      /* tenant-scope: the payee named by a payout or account row the caller already loaded through its own scope. */
      where: { id: p.payeeId }, select: { legalName: true, displayName: true },
    });
    return a?.legalName || a?.displayName || "Athlete";
  }
  const pr = await db.property.findUnique({
    /* tenant-scope: the payee named by a payout or account row the caller already loaded through its own scope. */
    where: { id: p.payeeId }, select: { name: true },
  });
  return pr?.name ?? "Property";
}

/** Where a payee's emails go: the athlete's login, or the property's manager. */
async function payeeEmail(db: Db, p: Payee): Promise<{ email: string; firstName: string } | null> {
  const user = await db.user.findFirst({
    /* tenant-scope: the payee's own users, in the payee's own tenant. */
    where: p.payeeType === "ATHLETE"
      ? { tenantId: p.payeeTenantId, athleteId: p.payeeId }
      : { tenantId: p.payeeTenantId, propertyId: p.payeeId, roles: { has: "PROPERTY_MGR" } },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;
  const name = await payeeName(db, p);
  return { email: user.email, firstName: name.split(/\s+/)[0] ?? name };
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const orderRef = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;

/* ── payout accounts — 2S5-INT-03 ─────────────────────────────────────── */

const ACCOUNT_SELECT = { status: true, provider: true, providerAccountId: true, changedAt: true, updatedAt: true } as const;

function accountView(row: { status: string; provider: string; updatedAt: Date } | null) {
  const provider = providerName();
  return {
    status: (row?.status ?? "NOT_SET_UP") as "NOT_SET_UP" | "NEEDS_INFO" | "READY",
    provider,
    /** False until a provider is connected: the set-up button says so. */
    canSetUp: provider !== "none",
    testProvider: provider === "standin",
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function myPayoutAccount(actor: Actor) {
  payeeOf(actor, "payoutAccount", "read");
  const row = await prisma.payoutAccount.findFirst({ where: whereFor(actor, "payoutAccount", "read"), select: ACCOUNT_SELECT });
  return accountView(row);
}

/** The link to the provider's set-up page (or back to it, to finish or manage). */
export async function payoutAccountLink(actor: Actor, returnPath: unknown, now = new Date()) {
  const payee = payeeOf(actor, "payoutAccount", "write");
  /* 2S1-BE-11 — a minor's payout account is set up by their guardian, in the guardian's name. */
  await assertMayCommit(prisma, actor, "manage");
  const provider = providerName();
  if (provider === "none") throw providerUnavailable("Payout set-up");
  const back = safeReturnPath(returnPath, payee.payeeType === "ATHLETE" ? "/athlete" : "/property/earnings");
  if (provider === "stripe") return { url: await stripeAccountLink(actor, payee, back, now) };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.payoutAccount.findFirst({ where: whereFor(actor, "payoutAccount", "write"), select: { id: true } });
    if (!existing) {
      await tx.payoutAccount.create({
        data: { tenantId: payee.payeeTenantId, payeeType: payee.payeeType, payeeId: payee.payeeId, provider },
        select: { id: true },
      });
    }
    await audit(tx, actor, "payoutAccount.link", "PayoutAccount", `${payee.payeeType}:${payee.payeeId}`, { after: { provider } });
  });
  return { url: standinLink({ kind: "account", payeeType: payee.payeeType, payeeId: payee.payeeId, tenantId: payee.payeeTenantId, returnPath: back }, now) };
}

/**
 * 2S5-INT-03 — Stripe: the payee's connected account, opened the first time
 * they start (an Express account, idempotent per payee — a retry is the same
 * account), its id stored and nothing else; then the link to Stripe's hosted
 * onboarding — or, once READY, to their Express dashboard. Stripe's word on
 * the account (`account.updated`) is what moves its status; SponsorX never
 * sees a bank detail. Stripe is called outside any transaction, so a slow
 * Stripe holds no lock: the account is created, then recorded.
 *
 * A payee who had an account at another provider (the stand-in, on staging)
 * starts again at Stripe: NOT_SET_UP, and a new account is a change
 * (2S5-BE-06's review window).
 */
async function stripeAccountLink(actor: Actor, payee: Payee, back: string, now: Date): Promise<string> {
  const before = await prisma.payoutAccount.findFirst({ where: whereFor(actor, "payoutAccount", "write"), select: { id: true, provider: true, providerAccountId: true, status: true } });
  let accountRef = before?.provider === "stripe" ? before.providerAccountId : null;
  if (!accountRef) {
    /* Stripe asks for a contact for the account: the person setting it up (the payee, a property's manager, a minor's guardian). */
    const me = await prisma.user.findUnique({ /* tenant-scope: the signed-in user's own row. */ where: { id: actor.userId }, select: { email: true } });
    if (!me?.email) throw new PayoutError("Your login has no email address, which the payment provider needs to set up payouts — contact BTG support.", 409);
    accountRef = (await createPayoutAccount({
      payeeType: payee.payeeType, payeeId: payee.payeeId, tenantId: payee.payeeTenantId, contactEmail: me.email, displayName: await payeeName(prisma, payee),
    })).accountRef;
    const opened = accountRef;
    await prisma.$transaction(async (tx) => {
      await lockPayee(tx, payee);
      const row = await tx.payoutAccount.findFirst({ where: whereFor(actor, "payoutAccount", "write"), select: { id: true, provider: true, providerAccountId: true, status: true } });
      if (row?.provider === "stripe" && row.providerAccountId === opened) return; // recorded by a request at the same moment
      const data = { provider: "stripe", providerAccountId: opened, status: "NOT_SET_UP", changedAt: row?.providerAccountId ? now : null };
      if (row) {
        await tx.payoutAccount.update({ /* tenant-scope: the row just loaded through whereFor(payoutAccount, write). */ where: { id: row.id }, data, select: { id: true } });
      } else {
        await tx.payoutAccount.create({ data: { ...data, tenantId: payee.payeeTenantId, payeeType: payee.payeeType, payeeId: payee.payeeId }, select: { id: true } });
      }
      await audit(tx, actor, "payoutAccount.open", "PayoutAccount", `${payee.payeeType}:${payee.payeeId}`, {
        before: row ? { provider: row.provider, status: row.status } : undefined,
        after: { provider: "stripe", providerAccountId: opened, status: "NOT_SET_UP" },
      });
    });
  }
  const url = await payoutAccountLinkUrl({ accountRef, returnPath: back, manage: before?.provider === "stripe" && before.status === "READY", requestId: randomUUID() });
  await prisma.$transaction((tx) => audit(tx, actor, "payoutAccount.link", "PayoutAccount", `${payee.payeeType}:${payee.payeeId}`, { after: { provider: "stripe" } }));
  return url;
}

/* ── card payment — 2S5-INT-01 ────────────────────────────────────────── */

const ATTEMPT_SELECT = { id: true, state: true, amountCents: true, failureReason: true, providerRef: true, createdAt: true, updatedAt: true } as const;

/** The order's payment as the sponsor (or BTG) sees it: can it be paid, and how did the last try go. */
export async function orderPayment(actor: Actor, orderId: string) {
  assertAllowed(actor, "marketplaceOrder", "read");
  const order = await prisma.marketplaceOrder.findFirst({
    where: { ...whereFor(actor, "marketplaceOrder", "read"), id: orderId }, select: { id: true, state: true, totalCents: true },
  });
  if (!order) throw new ForbiddenError("marketplaceOrder", "read");
  const latest = await prisma.paymentAttempt.findFirst({
    /* tenant-scope: the order was loaded through whereFor(marketplaceOrder, read); its attempts are named by its id. */
    where: { orderId: order.id }, select: ATTEMPT_SELECT, orderBy: { createdAt: "desc" },
  });
  const provider = providerName();
  return {
    orderId: order.id,
    amountCents: order.totalCents,
    due: order.state === "APPROVED" || order.state === "AWAITING_PAYMENT",
    provider,
    canPay: provider !== "none",
    testProvider: provider === "standin",
    latest,
  };
}

/** Orders still owing payment — a failed try on any other order is resolved (paid another way, or cancelled). */
const DUE = ["APPROVED", "AWAITING_PAYMENT"] as const;

type AttemptLite = { id: string; orderId: string; state: string; amountCents: number; failureReason: string | null; createdAt: Date; updatedAt: Date };

/** Each order's latest attempt, kept only where it FAILED; with how many of the order's tries failed. Pure. */
export function latestFailedAttempts(attempts: AttemptLite[]) {
  const latest = new Map<string, AttemptLite>();
  const failedTries = new Map<string, number>();
  for (const a of attempts) {
    const seen = latest.get(a.orderId);
    if (!seen || a.createdAt.getTime() > seen.createdAt.getTime()) latest.set(a.orderId, a);
    if (a.state === "FAILED") failedTries.set(a.orderId, (failedTries.get(a.orderId) ?? 0) + 1);
  }
  return [...latest.values()].filter((a) => a.state === "FAILED").map((a) => ({ attempt: a, failedTries: failedTries.get(a.orderId) ?? 1 }));
}

/**
 * 2S7-FE-02 — BTG's failed card payments: every order still owing payment
 * whose latest card attempt failed, oldest failure first. BTG admin only
 * (the approve scope, as BTG's payout queue): Finance reads each order's
 * payment on the order itself. The sponsor can simply pay again from their
 * order; BTG opens it to cancel, or to mark it paid another way.
 */
export async function failedPayments(actor: Actor) {
  assertAllowed(actor, "marketplaceOrder", "approve");
  const orders = await prisma.marketplaceOrder.findMany({
    where: { ...whereFor(actor, "marketplaceOrder", "read"), state: { in: [...DUE] } },
    select: { id: true, sponsorId: true, state: true, totalCents: true }, take: 500,
  });
  if (orders.length === 0) return { payments: [] };
  const attempts = await prisma.paymentAttempt.findMany({
    /* tenant-scope: the attempts of orders just loaded through whereFor(marketplaceOrder, read), named by their ids. */
    where: { orderId: { in: orders.map((o) => o.id) } },
    select: { id: true, orderId: true, state: true, amountCents: true, failureReason: true, createdAt: true, updatedAt: true },
  });
  const failed = latestFailedAttempts(attempts).sort((x, y) => x.attempt.updatedAt.getTime() - y.attempt.updatedAt.getTime());
  const byId = new Map(orders.map((o) => [o.id, o]));
  const sponsorIds = [...new Set(failed.map((f) => byId.get(f.attempt.orderId)!.sponsorId))];
  const sponsors = sponsorIds.length
    ? await prisma.sponsor.findMany({
        /* tenant-scope: the sponsors named by orders loaded through whereFor(marketplaceOrder, read). */
        where: { id: { in: sponsorIds } }, select: { id: true, name: true },
      })
    : [];
  const sponsorName = new Map(sponsors.map((s) => [s.id, s.name]));
  return {
    payments: failed.map(({ attempt, failedTries }) => {
      const o = byId.get(attempt.orderId)!;
      return {
        orderId: o.id,
        orderRef: orderRef(o.id),
        orderState: o.state,
        totalCents: o.totalCents,
        sponsorId: o.sponsorId,
        sponsorName: sponsorName.get(o.sponsorId) ?? "Sponsor",
        attemptId: attempt.id,
        amountCents: attempt.amountCents,
        failureReason: attempt.failureReason,
        failedAt: attempt.updatedAt,
        failedTries,
      };
    }),
  };
}

/** The sponsor starts paying: a link to the provider's payment page. */
export async function startCardPayment(actor: Actor, orderId: string, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("marketplaceOrder", "write");
  const provider = providerName();
  if (provider === "none") throw providerUnavailable("Card payment");
  const opened = await prisma.$transaction(async (tx) => {
    const found = await tx.marketplaceOrder.findFirst({
      where: { ...whereFor(actor, "marketplaceOrder", "write"), id: orderId }, select: { id: true },
    });
    if (!found) throw new ForbiddenError("marketplaceOrder", "write");
    /* The order's row lock, then its state as it is now: a cancel committing
       (the unpaid sweep, the sponsor, BTG) is waited for and read, so no
       payment starts for an order that is no longer waiting for one. */
    await lockOrder(tx, found.id);
    const order = await tx.marketplaceOrder.findUniqueOrThrow({
      /* tenant-scope: the row just found through whereFor(marketplaceOrder, write), re-read under its lock. */
      where: { id: found.id }, select: { id: true, tenantId: true, sponsorId: true, state: true, totalCents: true },
    });
    if (order.state !== "APPROVED" && order.state !== "AWAITING_PAYMENT") {
      throw new PayoutError(
        order.state === "PENDING_APPROVAL" ? "BTG hasn't approved this order yet — you can pay once it has."
        : order.state === "PENDING_SELLER" ? "The seller hasn't accepted this order yet — you can pay once they have."
        : "This order isn't waiting for payment.",
      );
    }
    const confirming = await tx.paymentAttempt.findFirst({
      /* tenant-scope: this order's own attempts, named by its id. */
      where: { orderId: order.id, state: "PROCESSING" }, select: { id: true },
    });
    if (confirming) throw new PayoutError("A payment for this order is already being confirmed — please don't pay again.");
    if (order.state === "APPROVED") await moveOrderAsSystem(tx, order.id, "AWAITING_PAYMENT", now);
    const created = await tx.paymentAttempt.create({
      data: { tenantId: order.tenantId, orderId: order.id, sponsorId: order.sponsorId, amountCents: order.totalCents, provider, createdBy: actor.userId },
      select: { id: true },
    });
    await audit(tx, actor, "payment.start", "MarketplaceOrder", order.id, { after: { attemptId: created.id, amountCents: order.totalCents, provider } });
    /* 2S8-QA-02 — the provider's page is opened inside this transaction: if the provider is down,
       no attempt is recorded and the order is as it was (503, try again). 2S5-INT-01 — with
       Stripe, a hosted Checkout Session for this attempt (lib/payment-provider.ts). */
    return openCheckout({
      attemptId: created.id, orderId: order.id, orderRef: orderRef(order.id), amountCents: order.totalCents,
      returnPath: `/sponsor/orders/${order.id}?payment=returned`, cancelPath: `/sponsor/orders/${order.id}`, now,
    });
  }, providerTx());
  return { url: opened.url };
}

/**
 * 2S5-INT-02 — the provider confirms a card payment: the order is paid.
 * Idempotent. 2S4-BE-10 — through `payOrderIn`, the one path every payment
 * takes (card, Zoho invoice, BTG by hand): the same move, the same record
 * on the order, the same emails.
 *
 * The money is the sponsor's either way, so a confirmation for an order that
 * is no longer waiting for it is never dropped: it is RECORDED FOR REFUND —
 * audited (`payment.paidAfterCancel` for an order cancelled or refunded,
 * `payment.afterPaid` for one already paid another way) and BTG's admins
 * emailed to refund the sponsor. Under the order's row lock, so it reads
 * what a cancel committing at the same moment did.
 */
export async function confirmPayment(attemptId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.paymentAttempt.findUnique({
      /* tenant-scope: the attempt named by the provider's confirmation job. */
      where: { id: attemptId }, select: ATTEMPT_CONFIRM,
    });
    if (!a || a.state !== "PROCESSING") return { confirmed: false };
    await lockOrder(tx, a.orderId);
    const claimed = await tx.paymentAttempt.updateMany({
      /* tenant-scope: the row just loaded by id; conditional, so a redelivered confirmation finds nothing. */
      where: { id: a.id, state: "PROCESSING" }, data: { state: "SUCCEEDED" },
    });
    if (claimed.count === 0) return { confirmed: false };
    return succeededIn(tx, a, now);
  });
}

/** What a confirmation reads of the attempt. */
export const ATTEMPT_CONFIRM = { id: true, tenantId: true, orderId: true, state: true, amountCents: true, createdBy: true, providerRef: true } as const;
type ConfirmedAttempt = Prisma.PaymentAttemptGetPayload<{ select: typeof ATTEMPT_CONFIRM }>;

/**
 * After the attempt was claimed SUCCEEDED (by `confirmPayment`, or by the
 * provider's `payment.succeeded` event — payment-events.ts), in the same
 * transaction and under the order's row lock: the order is paid — or, when
 * it is no longer waiting, the money is recorded for refund. Audited.
 */
export async function paymentSucceededIn(tx: Tx, a: ConfirmedAttempt, now: Date) {
  return succeededIn(tx, a, now);
}

async function succeededIn(tx: Tx, a: ConfirmedAttempt, now: Date): Promise<{ confirmed: true; refundNeeded?: true }> {
  await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.confirm", "MarketplaceOrder", a.orderId, { after: { attemptId: a.id, amountCents: a.amountCents } });
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order this attempt was made for, recorded on it. */
    where: { id: a.orderId }, select: { state: true },
  });
  if (order.state !== "APPROVED" && order.state !== "AWAITING_PAYMENT") {
    const ended = order.state === "CANCELLED" || order.state === "REFUNDED";
    await audit(tx, { userId: null, tenantId: a.tenantId }, ended ? "payment.paidAfterCancel" : "payment.afterPaid", "MarketplaceOrder", a.orderId, {
      after: { attemptId: a.id, amountCents: a.amountCents, orderState: order.state, providerRef: a.providerRef, refundNeeded: true },
    });
    /* 2S4-BE-13 — money received for a cancelled order: a whole-order row on
       Finance's "Refunds to send" for the amount received (refunded to the
       card at once through the stand-in). That row is the refund, so BTG's
       "refund needed" email is not sent for it. (A cancelled order was never
       paid, so it has no other refund row. One row per card attempt — two
       attempts confirmed after one cancellation are two rows — and the
       attempt's claim above means a redelivery never reaches here twice.) */
    if (order.state === "CANCELLED") {
      await recordRefund(tx, { userId: null, tenantId: a.tenantId }, a.orderId, { cause: "PAID_AFTER_CANCELLATION", lineId: null, cancellation: false }, {
        whole: true, received: { attemptId: a.id, amountCents: a.amountCents, paidVia: "CARD", paymentReference: a.providerRef },
      }, now);
      return { confirmed: true, refundNeeded: true };
    }
    /* Refunded, or already paid another way: BTG's to sort out by hand. */
    for (const u of await btgAdmins(tx, a.tenantId)) {
      await tell(tx, { tenantId: a.tenantId, email: u.email }, "payment.refundNeeded", a.id, {
        orderRef: orderRef(a.orderId), amount: usd(a.amountCents), orderState: order.state.toLowerCase().replace("_", " "),
        why: ended
          ? "The card payment was confirmed after the order was refunded"
          : "The card payment was confirmed for an order that had already been paid another way",
        providerRef: a.providerRef ?? "", orderUrl: appUrl(`/admin/marketplace/orders/${a.orderId}`),
      });
    }
    return { confirmed: true, refundNeeded: true };
  }
  await payOrderIn(tx, { userId: null, tenantId: a.tenantId }, a.orderId, { via: "CARD", reference: a.providerRef, attemptId: a.id, receiptTo: a.createdBy }, now);
  return { confirmed: true };
}

/* ── the stand-in provider's own pages (staging only) ─────────────────── */

function assertStandin() {
  if (providerName() !== "standin") throw new StandinTokenError("The test payment provider is switched off here.");
}

/** What the stand-in's page shows. */
export async function standinDetails(token: string, now = new Date()) {
  assertStandin();
  const link = readStandinToken(token, now);
  if (link.kind === "account") {
    const name = await payeeName(prisma, link);
    const row = await prisma.payoutAccount.findUnique({
      /* tenant-scope: the payee named in a link this server signed. */
      where: { payeeType_payeeId: { payeeType: link.payeeType, payeeId: link.payeeId } }, select: { status: true },
    });
    return { kind: "account" as const, payeeName: name, status: row?.status ?? "NOT_SET_UP", returnPath: link.returnPath };
  }
  const a = await prisma.paymentAttempt.findUnique({
    /* tenant-scope: the attempt named in a link this server signed. */
    where: { id: link.attemptId }, select: { orderId: true, amountCents: true, state: true, sponsorId: true },
  });
  if (!a) throw new StandinTokenError();
  const sponsor = await prisma.sponsor.findUnique({
    /* tenant-scope: the sponsor recorded on that attempt. */
    where: { id: a.sponsorId }, select: { name: true },
  });
  return { kind: "checkout" as const, orderRef: orderRef(a.orderId), amountCents: a.amountCents, sponsorName: sponsor?.name ?? "", state: a.state, returnPath: link.returnPath };
}

/** The stand-in's "set up" page was completed (or asked for more information). */
export async function completeStandinAccount(token: string, outcome: "READY" | "NEEDS_INFO", now = new Date()) {
  assertStandin();
  const link = readStandinToken(token, now);
  if (link.kind !== "account") throw new StandinTokenError();
  await prisma.$transaction(async (tx) => {
    await recordAccountStatus(tx, { payeeType: link.payeeType, payeeId: link.payeeId, payeeTenantId: link.tenantId }, { status: outcome, provider: "standin" }, now);
  });
  return { returnPath: link.returnPath };
}

/**
 * The provider's word on a payee's payout account — the one place its status
 * is written (the stand-in's page today; a real provider's webhook later).
 * 2S5-BE-06 — keeps `changedAt` (nextChangedAt). 2S5-BE-07 — an account
 * READY again releases the payouts that were waiting for the payee to fix
 * it: each is retried automatically, once. Under the payee's lock, so a
 * payout request at the same moment reads the account as it now is.
 */
async function recordAccountStatus(
  tx: Tx, payee: Payee, report: { status: "READY" | "NEEDS_INFO"; provider: string; providerAccountId?: string | null }, now: Date,
) {
  await lockPayee(tx, payee);
  const row = await tx.payoutAccount.findUnique({
    /* tenant-scope: the payee named in a link this server signed (or the provider's report), by its unique payee key. */
    where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: { id: true, status: true, providerAccountId: true, changedAt: true },
  });
  const providerAccountId = report.providerAccountId ?? row?.providerAccountId ?? standinRef("acct");
  const changedAt = nextChangedAt(row, { status: report.status, providerAccountId }, now);
  const data = { status: report.status, provider: report.provider, providerAccountId, changedAt };
  if (row) {
    await tx.payoutAccount.update({
      /* tenant-scope: the row just loaded for this payee. */
      where: { id: row.id }, data, select: { id: true },
    });
  } else {
    await tx.payoutAccount.create({ data: { ...data, tenantId: payee.payeeTenantId, payeeType: payee.payeeType, payeeId: payee.payeeId }, select: { id: true } });
  }
  await audit(tx, { userId: null, tenantId: payee.payeeTenantId }, "payoutAccount.status", "PayoutAccount", `${payee.payeeType}:${payee.payeeId}`, {
    before: row ? { status: row.status, changedAt: row.changedAt } : undefined,
    after: { status: report.status, provider: report.provider, changedAt },
  });
  if (report.status !== "READY") return;
  const waiting = await tx.payout.findMany({
    /* tenant-scope: this payee's own payouts in every set of books, by payee key, waiting for this account. */
    where: { payeeType: payee.payeeType, payeeId: payee.payeeId, state: "FAILED", waitingOn: "PAYEE_ACCOUNT" }, select: { id: true },
  });
  for (const w of waiting) await autoRetry(tx, w.id, "ACCOUNT_READY", now);
  /* 2S5-BE-04 — an approved payout that waited because the account wasn't READY goes now (sending is conditional: one already sent is untouched). */
  const approved = await tx.payout.findMany({
    /* tenant-scope: this payee's own approved payouts in every set of books, by payee key. */
    where: { payeeType: payee.payeeType, payeeId: payee.payeeId, state: "APPROVED" }, select: { id: true, tenantId: true },
  });
  for (const p of approved) await enqueue(tx, p.tenantId, "payouts.send", { payoutId: p.id });
}

/** 2S5-BE-04 — provider readiness: the payee's payout account is READY at the provider now. */
async function accountReady(db: Db, payee: { payeeType: string; payeeId: string }): Promise<boolean> {
  const account = await db.payoutAccount.findUnique({
    /* tenant-scope: the account of the payee a payout (loaded through the caller's scope) names, by its unique payee key. */
    where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: { status: true },
  });
  return account?.status === "READY";
}

/** The stand-in's payment page: the sponsor paid (confirmation follows) or the card was declined. */
export async function completeStandinCheckout(token: string, outcome: "SUCCEED" | "DECLINE", now = new Date()) {
  assertStandin();
  const link = readStandinToken(token, now);
  if (link.kind !== "checkout") throw new StandinTokenError();
  /* 2S5-INT-02 — a declined card is the provider's word like any other: a
     signed `payment.failed` event, through the webhook's own door. */
  let declined = false;
  await prisma.$transaction(async (tx) => {
    const a = await tx.paymentAttempt.findUnique({
      /* tenant-scope: the attempt named in a link this server signed. */
      where: { id: link.attemptId }, select: { id: true, tenantId: true, orderId: true, state: true },
    });
    if (!a) throw new StandinTokenError();
    if (a.state !== "PENDING") return; // already answered — the page was submitted twice
    if (outcome === "DECLINE") {
      declined = true;
      return;
    }
    /* The order's row lock, then its state now: the money is not taken for
       an order that stopped waiting for it (cancelled while the page was
       open) — the attempt fails and nothing is charged. A cancel waits for
       this, and then sees the payment being confirmed and refuses. */
    const orderState = await lockOrder(tx, a.orderId);
    if (orderState !== "APPROVED" && orderState !== "AWAITING_PAYMENT") {
      const failed = await tx.paymentAttempt.updateMany({
        /* tenant-scope: the row just loaded by the signed link's id; conditional on it still being open. */
        where: { id: a.id, state: "PENDING" },
        data: { state: "FAILED", failureReason: `The order is no longer waiting for payment (it is ${String(orderState).toLowerCase().replace("_", " ")}) — nothing was charged.` },
      });
      if (failed.count) await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.refused", "MarketplaceOrder", a.orderId, { after: { attemptId: a.id, orderState } });
      return;
    }
    const processing = await tx.paymentAttempt.updateMany({
      /* tenant-scope: the row just loaded by the signed link's id; conditional, so a double submit takes it once. */
      where: { id: a.id, state: "PENDING" }, data: { state: "PROCESSING", providerRef: standinRef("pay") },
    });
    if (processing.count === 0) return;
    /* The provider's confirmation arrives separately, like a real webhook. */
    await enqueue(tx, a.tenantId, "payments.confirm", { attemptId: a.id });
  });
  if (declined) await standinDecline(link.attemptId, now);
  return { returnPath: link.returnPath };
}


/* ── the payee's balance — 2S5-BE-04 ──────────────────────────────────── */

type OrderMoney = {
  orderId: string; books: string; state: string; fulfilledAt: Date | null; sponsorName: string; title: string;
  shareCents: number; availableCents: number; heldCents: number; awaitingPaymentCents: number; inFlightCents: number;
  requestableCents: number; holdUntil: Date | null;
  /**
   * 2S8-QA-05 — the real figure on this order: available less what is already
   * requested, NOT rounded up to zero. Negative when a refund came after the
   * money was paid out (the reversal debits a payable the payout already
   * emptied) — the payee owes that much back, and `owedBackCents` says how much.
   */
  balanceCents: number; owedBackCents: number;
  /** 2S4-BE-07 — the payee's lines on this order: how many are confirmed, and how many held by a reported problem. */
  confirmedLines: number; problemLines: number;
  /**
   * 2S5-BE-04 — the order's money is frozen: the sponsor disputed the payment,
   * or the provider refunded part of it and BTG is checking (payment-
   * exceptions.ts). Nothing of it is requestable. BTG's words in `frozenReason`;
   * the payee reads only that BTG is reviewing a problem with the payment.
   */
  frozen: boolean; frozenReason: string | null;
};

type LineRelease = { state: string; confirmedAt: Date | null };

/**
 * 2S4-BE-07 — whether a line's money may be released now: confirmed (by the
 * sponsor, silence or BTG) and past the holding period from that
 * confirmation. A line still in delivery, delivered but unanswered, or under a
 * reported problem is held. Pure.
 */
export function lineReleasable(d: LineRelease | undefined, holdMs: number, now: Date): boolean {
  return !!d && d.state === "CONFIRMED" && !!d.confirmedAt && d.confirmedAt.getTime() + holdMs <= now.getTime();
}

async function balanceOf(db: Db, payee: Payee, now: Date) {
  const entries = await db.ledgerEntry.findMany({
    /* tenant-scope: the payee's own entries — its tenant, type and id, exactly as ledgerEntry's own scope reads them. */
    where: { partyTenantId: payee.payeeTenantId, partyType: payee.payeeType, partyId: payee.payeeId, account: { in: [PAYABLE[payee.payeeType], "RESERVE_HELD"] }, orderId: { not: null } },
    select: { tenantId: true, orderId: true, lineId: true, account: true, entryType: true, status: true, debitCents: true, creditCents: true },
  });
  const inFlight = await db.payoutLine.findMany({
    /* tenant-scope: lines of this payee's own payouts, named by payee. 2S5-BE-07 — a failed payout that will be sent again on its own still claims its money. */
    where: { payout: { payeeTenantId: payee.payeeTenantId, payeeType: payee.payeeType, payeeId: payee.payeeId, ...claimsMoney } },
    select: { orderId: true, amountCents: true },
  });
  const orderIds = [...new Set(entries.map((e) => e.orderId!))];
  const orders = await db.marketplaceOrder.findMany({
    /* tenant-scope: the orders the payee's own ledger entries name. */
    where: { id: { in: orderIds } },
    select: { id: true, state: true, fulfilledAt: true, sponsorId: true, lines: { select: { title: true }, orderBy: { startsOn: "asc" } } },
  });
  const sponsors = await db.sponsor.findMany({
    /* tenant-scope: the sponsors of those orders. */
    where: { id: { in: [...new Set(orders.map((o) => o.sponsorId))] } }, select: { id: true, name: true },
  });
  const sponsorName = new Map(sponsors.map((s) => [s.id, s.name]));
  const holdMs = env.PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000;
  /* 2S4-BE-07 — each of the payee's lines, as delivered and confirmed. */
  const lineIds = [...new Set(entries.map((e) => e.lineId).filter((x): x is string => Boolean(x)))];
  const deliveries = lineIds.length
    ? await db.orderLineDelivery.findMany({
        /* tenant-scope: the delivery rows of the lines the payee's own ledger entries name. */
        where: { lineId: { in: lineIds } }, select: { lineId: true, state: true, confirmedAt: true },
      })
    : [];
  const delivery = new Map(deliveries.map((d) => [d.lineId, d]));
  /* 2S5-BE-04 — "dispute status": an open dispute (or a provider refund BTG is checking) freezes the order's money. */
  const frozen = await moneyHoldsOn(db, orders.map((o) => o.id));

  const out: OrderMoney[] = [];
  for (const o of orders) {
    const mine = entries.filter((e) => e.orderId === o.id);
    const payable = mine.filter((e) => e.account === PAYABLE[payee.payeeType]);
    const net = (xs: typeof mine) => xs.reduce((s, e) => s + e.creditCents - e.debitCents, 0);
    const availableCents = net(payable.filter((e) => e.status !== "PENDING"));
    const awaitingPaymentCents = net(payable.filter((e) => e.status === "PENDING"));
    const heldCents = net(mine.filter((e) => e.account === "RESERVE_HELD"));
    const shareCents = mine.filter((e) => e.entryType === "BOOKING" && e.status !== "REVERSED").reduce((s, e) => s + e.creditCents, 0);
    const inFlightCents = inFlight.filter((l) => l.orderId === o.id).reduce((s, l) => s + l.amountCents, 0);
    /* Line by line: money on a line not yet confirmed (or past its hold) is
       locked. Paid-out money (PAYOUT, no line) has already left the balance. */
    const myLines = [...new Set(mine.map((e) => e.lineId).filter((x): x is string => Boolean(x)))];
    const released = (lineId: string | null) => lineId !== null && RELEASING.has(o.state) && lineReleasable(delivery.get(lineId), holdMs, now);
    const frozenReason = frozen.get(o.id) ?? null;
    const lockedCents = frozenReason
      ? Math.max(0, availableCents)
      : net(payable.filter((e) => e.status !== "PENDING" && e.lineId !== null && !released(e.lineId)));
    const confirmed = myLines.map((l) => delivery.get(l)).filter((d) => d?.state === "CONFIRMED" && d.confirmedAt) as { confirmedAt: Date }[];
    const holdUntil = confirmed.length ? new Date(Math.max(...confirmed.map((d) => d.confirmedAt.getTime())) + holdMs) : null;
    out.push({
      orderId: o.id, books: mine[0]!.tenantId, state: o.state, fulfilledAt: o.fulfilledAt,
      sponsorName: sponsorName.get(o.sponsorId) ?? "", title: o.lines.map((l) => l.title).join(" · "),
      shareCents, availableCents, heldCents, awaitingPaymentCents, inFlightCents,
      requestableCents: Math.max(0, availableCents - lockedCents - inFlightCents), holdUntil,
      balanceCents: availableCents - inFlightCents, owedBackCents: Math.max(0, inFlightCents - availableCents),
      confirmedLines: confirmed.length, problemLines: myLines.filter((l) => delivery.get(l)?.state === "PROBLEM").length,
      frozen: frozenReason !== null, frozenReason,
    });
  }
  return out.sort((a, b) => (b.fulfilledAt?.getTime() ?? 0) - (a.fulfilledAt?.getTime() ?? 0));
}

const PAYOUT_SELECT = {
  id: true, tenantId: true, payeeType: true, payeeId: true, payeeTenantId: true, amountCents: true, state: true,
  requestedAt: true, decidedAt: true, decisionNote: true, providerRef: true, sentAt: true, paidAt: true, failureReason: true, createdAt: true,
  approvedAutomatically: true, reviewReasons: true, failureKind: true, failedAt: true, waitingOn: true, retryCount: true, nextRetryAt: true,
  accountRetryUsed: true,
  /* 2S5-BE-05 — its hand-overs to the provider, and a return by the bank. */
  sendAttempts: true, returnedAt: true, returnCount: true,
  lines: { select: { orderId: true, amountCents: true } },
} as const;
type PayoutRow = Prisma.PayoutGetPayload<{ select: typeof PAYOUT_SELECT }>;

/**
 * A payout as BTG reads it: the automatic approval, the reasons it waits
 * (2S5-BE-06), the failure kind, who it waits on and the retry schedule
 * (2S5-BE-07).
 */
function payoutView(p: PayoutRow) {
  const { accountRetryUsed: _used, waitingOn: _stored, ...rest } = p;
  return {
    ...rest,
    waitingOn: waitingOnOf(p),
    /* Empty when approved automatically; the reasons a REQUESTED or FAILED payout waits. */
    reviewReasons: p.approvedAutomatically ? [] : p.reviewReasons,
    lines: p.lines.map((l) => ({ ...l, orderRef: orderRef(l.orderId) })),
  };
}

/**
 * The same payout as the payee reads it: whether it was approved
 * automatically and who it waits on — never the internal reasons (the rule's
 * safeguards, the same rule as listing holds), the failure kind or the retry
 * schedule.
 */
function payeePayoutView(p: PayoutRow) {
  const { reviewReasons: _r, retryCount: _c, nextRetryAt: _n, failureKind: _k, failedAt: _f, ...rest } = payoutView(p);
  return rest;
}

/** BTG's view for a payout approver; the payee's for everyone else who reads it. */
const viewFor = (actor: Actor) => (can(actor, "payout", "approve") ? payoutView : payeePayoutView);

/** The payee's money: what can be requested, what can't yet and why, and every payout so far. */
export async function myPayouts(actor: Actor, now = new Date()) {
  const payee = payeeOf(actor, "payout", "read");
  const [orders, accountRow, payouts, grouped] = await Promise.all([
    balanceOf(prisma, payee, now),
    prisma.payoutAccount.findUnique({
      /* tenant-scope: the payee's own account, by its unique payee key from the actor. */
      where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: ACCOUNT_SELECT,
    }),
    prisma.payout.findMany({ where: whereFor(actor, "payout", "read"), select: PAYOUT_SELECT, orderBy: { requestedAt: "desc" }, take: 50 }),
    /* 2S2-FE-01 — every payout of the payee's by state, counted in Postgres, not over the 50 listed. */
    prisma.payout.groupBy({ by: ["state"], where: whereFor(actor, "payout", "read"), _count: { _all: true }, _sum: { amountCents: true } }),
  ]);
  const byState = Object.fromEntries(STATES.map((st) => {
    const g = grouped.find((x) => x.state === st);
    return [st, { count: g?._count._all ?? 0, amountCents: g?._sum.amountCents ?? 0 }];
  })) as Record<(typeof STATES)[number], { count: number; amountCents: number }>;
  const account = accountView(accountRow && accountRow.status ? accountRow : null);
  const sum = (f: (o: OrderMoney) => number) => orders.reduce((s, o) => s + f(o), 0);
  const requestableCents = sum((o) => o.requestableCents);
  const owedBackCents = sum((o) => o.owedBackCents);
  const paidOutCents = byState.PAID.amountCents;
  const holds = orders.filter((o) => o.confirmedLines > 0 && o.holdUntil && o.holdUntil > now && o.availableCents - o.inFlightCents > 0);
  const nextHold = holds.map((o) => o.holdUntil!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const checks = [
    { key: "payment", label: "Sponsor's payment received", ok: orders.some((o) => PAID_OR_LATER.has(o.state)) },
    { key: "delivered", label: "Delivery confirmed by the sponsor", ok: orders.some((o) => o.confirmedLines > 0) },
    { key: "account", label: "Payout account ready", ok: account.status === "READY" },
    { key: "hold", label: nextHold ? `Holding period ends ${nextHold.toISOString().slice(0, 10)}` : "Holding period passed", ok: !nextHold || requestableCents > 0 },
  ];
  /* 2S4-BE-07 — a line under a reported problem is held until BTG resolves it. */
  const problemLines = orders.reduce((s, o) => s + o.problemLines, 0);
  if (problemLines) checks.push({ key: "problem", label: `${problemLines} line${problemLines === 1 ? "" : "s"} held — a sponsor reported a problem BTG is resolving`, ok: false });
  /* 2S5-BE-04 — a dispute (or a provider refund BTG is checking) freezes an order's money. The payee is told BTG is on it, not the detail. */
  const frozenOrders = orders.filter((o) => o.frozen).length;
  if (frozenOrders) checks.push({ key: "dispute", label: `${frozenOrders} order${frozenOrders === 1 ? "" : "s"} held — BTG is reviewing a problem with the sponsor's payment`, ok: false });
  return {
    currency: "USD",
    payee: { payeeType: payee.payeeType, name: await payeeName(prisma, payee) },
    account,
    totals: {
      requestableCents,
      heldCents: sum((o) => o.heldCents),
      awaitingPaymentCents: sum((o) => o.awaitingPaymentCents),
      notYetReleasableCents: sum((o) => Math.max(0, o.availableCents - o.inFlightCents) - o.requestableCents),
      inFlightCents: sum((o) => o.inFlightCents),
      paidOutCents,
      /* 2S8-QA-05 — money owed back from refunds that came after a payout, never hidden as $0. */
      owedBackCents,
    },
    /** 2S8-QA-05 — the same, in words; null when nothing is owed back. */
    owedBackNote: owedBackCents > 0 ? `You owe ${usd(owedBackCents)} back from a refund` : null,
    /** Every payout so far by state — how many and how much (2S2-FE-01). */
    byState,
    canRequest: account.status === "READY" && requestableCents > 0,
    checks,
    orders: orders.map(({ books: _books, frozenReason: _why, ...o }) => ({ ...o, orderRef: orderRef(o.orderId) })),
    payouts: payouts.map(payeePayoutView),
  };
}

/**
 * The payout rules, as BTG reads them on a payout: over its orders, the
 * payee's money on each, and the account. 2S5-BE-04's five, every time —
 * payment cleared, delivery confirmed, provider readiness, the holding
 * period, and (`dispute`) no dispute open on its orders. Pure.
 */
export function payoutChecks(
  orders: Array<{ state: string; confirmedLines: number; holdUntil: Date | null; frozen?: boolean }>, accountStatus: string | null | undefined, now: Date,
) {
  return [
    { key: "payment", label: "Sponsor's payment received", ok: orders.every((o) => PAID_OR_LATER.has(o.state)) },
    { key: "delivered", label: "Delivery confirmed (the payee's lines on each order)", ok: orders.every((o) => o.confirmedLines > 0) },
    { key: "account", label: "Payout account ready", ok: accountStatus === "READY" },
    { key: "hold", label: "Holding period passed", ok: orders.every((o) => !!o.holdUntil && o.holdUntil <= now) },
    { key: "dispute", label: FROZEN_CHECK, ok: orders.every((o) => !o.frozen) },
  ];
}

/**
 * The payee asks for its whole requestable balance — one payout per set of
 * books. 2S5-BE-06 — each is then approved automatically, as the system, in
 * this same transaction, when the rule passes (payout-auto.ts); otherwise it
 * waits for BTG with its reasons. Under the payee's lock: two requests at
 * once are taken one after the other, so the second neither claims the same
 * money nor slips under the 7-day cap beside the first.
 */
export async function requestPayout(actor: Actor, now = new Date()) {
  const payee = payeeOf(actor, "payout", "write");
  /* 2S1-BE-11 — a minor's payouts are requested by their guardian; 2S1-BE-12 — none during the coming-of-age allowance. */
  await assertMayCommit(prisma, actor, "payoutRequest");
  return prisma.$transaction(async (tx) => {
    await lockPayee(tx, payee);
    /* Held (2S1-BE-06 organisations, 2S1-BE-09 / -10 athletes): payout-holds.ts. */
    const held = await payoutHoldReason(tx, payee);
    if (held) throw new PayoutError(held, 409, ["Payouts not on hold"]);
    const account = await tx.payoutAccount.findUnique({
      /* tenant-scope: the payee's own account, by its unique payee key from the actor. */
      where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: { status: true, changedAt: true },
    });
    if (account?.status !== "READY") throw new PayoutError("Set up your payout account first — payouts are sent to it.", 409, ["Payout account ready"]);
    const money = await balanceOf(tx, payee, now);
    const orders = money.filter((o) => o.requestableCents > 0);
    if (!orders.length) {
      /* 2S5-BE-04 — say so when the only money there is is frozen by a payment problem BTG is reviewing. */
      const frozenOnly = money.some((o) => o.frozen && o.availableCents - o.inFlightCents > 0);
      throw new PayoutError(
        frozenOnly ? "Nothing can be paid out yet — BTG is reviewing a problem with a sponsor's payment, and that money is held until it is resolved." : "Nothing is ready to pay out yet.",
        409, ["An order that is paid, delivered and past its holding period", ...(frozenOnly ? [FROZEN_CHECK] : [])],
      );
    }
    const byBooks = new Map<string, OrderMoney[]>();
    for (const o of orders) byBooks.set(o.books, [...(byBooks.get(o.books) ?? []), o]);
    const settings = autoApproveSettings();
    /* Read after the lock: every automatic approval for this payee that committed before it. */
    const byTenant = await autoApprovedByTenant(tx, payee, windowStart(now, settings));
    const created = [];
    for (const [books, os] of byBooks) {
      const amountCents = os.reduce((s, o) => s + o.requestableCents, 0);
      const checks = payoutChecks(os, account.status, now);
      /* The cap counts every tenant; this payout's books are who reads the reason. */
      const window = autoWindowFor(byTenant, books);
      const windowCents = window.totalCents;
      const reasons = autoApprovalReasons({
        amountCents, held: false, unmetChecks: checks.filter((c) => !c.ok).map((c) => c.label),
        accountChangedAt: account.changedAt, windowCents, windowIncludesOtherTenants: window.includesOtherTenants, now,
      }, settings);
      const auto = reasons.length === 0;
      const row = await tx.payout.create({
        data: {
          tenantId: books, ...payee, amountCents, requestedBy: actor.userId, requestedAt: now,
          ...(auto
            ? { state: "APPROVED", decidedBy: SYSTEM, decidedAt: now, approvedAutomatically: true, reviewReasons: [] }
            : { state: "REQUESTED", reviewReasons: reasons }),
          lines: { create: os.map((o) => ({ orderId: o.orderId, amountCents: o.requestableCents })) },
        },
        select: PAYOUT_SELECT,
      });
      await audit(tx, actor, "payout.request", "Payout", row.id, { after: { amountCents, orders: os.length, ...(auto ? {} : { reviewReasons: reasons }) } });
      if (auto) {
        await audit(tx, { userId: null, tenantId: books }, "payout.autoApprove", "Payout", row.id, {
          before: { state: "REQUESTED" },
          after: { state: "APPROVED", decidedBy: SYSTEM, approvedAutomatically: true, checks, rule: { ...settings, windowCentsBefore: window.includesOtherTenants ? null : windowCents, windowIncludesOtherTenants: window.includesOtherTenants } },
        });
        await enqueue(tx, books, "payouts.send", { payoutId: row.id });
        await notifyPayee(tx, { ...row, ...payee }, "payout.approved");
        byTenant.set(books, (byTenant.get(books) ?? 0) + amountCents);
      }
      created.push(payeePayoutView(row));
    }
    return { payouts: created };
  });
}

/* ── BTG's side — 2S5-BE-05 ───────────────────────────────────────────── */

const STATES = ["REQUESTED", "APPROVED", "SENDING", "PAID", "REJECTED", "FAILED"] as const;
export type PayoutState = (typeof STATES)[number];
export const isPayoutState = (s: unknown): s is PayoutState => typeof s === "string" && (STATES as readonly string[]).includes(s);

async function withPayee(db: Db, rows: PayoutRow[], view: (p: PayoutRow) => ReturnType<typeof payeePayoutView> | ReturnType<typeof payoutView> = payoutView) {
  return Promise.all(rows.map(async (p) => ({ ...view(p), payeeName: await payeeName(db, { payeeType: p.payeeType as PayeeType, payeeId: p.payeeId }) })));
}

/**
 * BTG's list: payouts by state, every state's count, and — 2S5-BE-07 — how
 * many wait on whom (`waiting`). `waitingOn` narrows the list to the payouts
 * waiting on BTG (REQUESTED, and FAILED left for BTG), on the system's
 * retry, or on the payee's account; BTG's screen defaults to BTG.
 */
export async function listPayouts(actor: Actor, states?: PayoutState[], waitingOn?: WaitingOn) {
  assertAllowed(actor, "payout", "approve");
  const scope = whereFor(actor, "payout", "read");
  const rows = await prisma.payout.findMany({
    /* tenant-scope: `scope` is whereFor(payout, read); every filter only narrows it. */
    where: { AND: [scope, ...(states?.length ? [{ state: { in: states } }] : []), ...(waitingOn ? [waitingOnWhere(waitingOn)] : [])] },
    select: PAYOUT_SELECT, orderBy: { requestedAt: "asc" }, take: 200,
  });
  const counts = await prisma.payout.groupBy({ /* tenant-scope: whereFor(payout, read). */ by: ["state"], where: scope, _count: { _all: true } });
  const failed = await prisma.payout.groupBy({ /* tenant-scope: whereFor(payout, read). */ by: ["waitingOn"], where: { AND: [scope, { state: "FAILED" }] }, _count: { _all: true } });
  const failedOn = (w: WaitingOn) => failed.filter((f) => (f.waitingOn ?? "BTG") === w).reduce((n, f) => n + f._count._all, 0);
  const requested = counts.find((c) => c.state === "REQUESTED")?._count._all ?? 0;
  return {
    payouts: await withPayee(prisma, rows),
    counts: Object.fromEntries(counts.map((c) => [c.state, c._count._all])),
    waiting: {
      BTG: requested + failedOn("BTG"),
      SYSTEM_RETRY: failedOn("SYSTEM_RETRY"),
      PAYEE_ACCOUNT: failedOn("PAYEE_ACCOUNT"),
      /* FAILED only, by who it waits on — the Failed tab's filter. */
      failed: { BTG: failedOn("BTG"), SYSTEM_RETRY: failedOn("SYSTEM_RETRY"), PAYEE_ACCOUNT: failedOn("PAYEE_ACCOUNT") },
    },
  };
}

/**
 * One payout. BTG (an approver) reads the rule checks and every reason; a
 * payee reading its own payout here gets its own view (payeePayoutView) —
 * the checks are about its own money, but never the internal reasons.
 */
export async function getPayout(actor: Actor, id: string, now = new Date()) {
  assertAllowed(actor, "payout", "read");
  const row = await prisma.payout.findFirst({ where: { ...whereFor(actor, "payout", "read"), id }, select: PAYOUT_SELECT });
  if (!row) throw new ForbiddenError("payout", "read");
  const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
  const account = await prisma.payoutAccount.findUnique({
    /* tenant-scope: the account of the payee this payout (loaded through whereFor) names. */
    where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: ACCOUNT_SELECT,
  });
  const orders = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the orders this payout's own lines name. */
    where: { id: { in: row.lines.map((l) => l.orderId) } }, select: { id: true, state: true, fulfilledAt: true, totalCents: true, lines: { select: { title: true } } },
  });
  /* 2S4-BE-07 — the payee's money on each order, released line by line, as when it was requested. */
  const money = new Map((await balanceOf(prisma, payee, now)).map((o) => [o.orderId, o]));
  const [view] = await withPayee(prisma, [row], viewFor(actor));
  return {
    ...view!,
    account: accountView(account),
    orders: orders.map((o) => ({ orderId: o.id, orderRef: orderRef(o.id), state: o.state, fulfilledAt: o.fulfilledAt, totalCents: o.totalCents, title: o.lines.map((l) => l.title).join(" · ") })),
    checks: payoutChecks(
      orders.map((o) => ({ state: o.state, confirmedLines: money.get(o.id)?.confirmedLines ?? 0, holdUntil: money.get(o.id)?.holdUntil ?? null, frozen: money.get(o.id)?.frozen ?? false })),
      account?.status, now,
    ),
    provider: providerName(),
  };
}

async function notifyPayee(
  tx: Tx, row: { id: string; tenantId: string; amountCents: number } & Payee, template: string, extra: Record<string, string> = {}, key?: string,
) {
  const to = await payeeEmail(tx, row);
  if (!to) return;
  const path = row.payeeType === "ATHLETE" ? "/athlete/money" : "/property/earnings";
  await enqueue(tx, row.tenantId, "notify.email", {
    tenantId: row.tenantId,
    template,
    to: to.email,
    idempotencyKey: key ?? `${template}:${row.id}`,
    data: { firstName: to.firstName, amount: usd(row.amountCents), portalUrl: `${env.APP_URL.replace(/\/+$/, "")}${path}`, ...extra },
  });
}

/** BTG approves (hands it to the provider) or sends it back with a note. */
export async function decidePayout(actor: Actor, id: string, decision: "APPROVE" | "REJECT", note?: string | null, now = new Date()) {
  assertAllowed(actor, "payout", "approve");
  const trimmed = note?.trim() || null;
  if (decision === "REJECT" && !trimmed) throw new PayoutError("Say why it's being sent back — the payee reads this note.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findFirst({ where: { ...whereFor(actor, "payout", "approve"), id }, select: PAYOUT_SELECT });
    if (!row) throw new ForbiddenError("payout", "approve");
    if (row.state !== "REQUESTED") throw new PayoutError(`This payout is ${row.state.toLowerCase()}, not waiting for a decision.`);
    const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
    /* A payee BTG rejected (organisation or athlete) is held: send it back if you must, but don't pay it. */
    const held = decision === "APPROVE" ? await payoutHoldReason(tx, payee) : null;
    if (held) throw new PayoutError(held, 409, ["Payouts not on hold"]);
    /* 2S5-BE-03 — a disputed payment (or a refund the provider made that BTG is checking) freezes its order's money. */
    const frozen = decision === "APPROVE" ? await moneyHoldsOn(tx, row.lines.map((l) => l.orderId)) : new Map<string, string>();
    if (frozen.size) throw new PayoutError(`${[...frozen.values()][0]}, so this payout can't be approved yet.`, 409, [FROZEN_CHECK]);
    /* Conditional: two decisions at once (two reviewers) move it once. */
    const moved = await tx.payout.updateMany({
      /* tenant-scope: the row just loaded through whereFor(payout, approve). */
      where: { id: row.id, state: "REQUESTED" },
      data: { state: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedBy: actor.userId, decidedAt: now, decisionNote: trimmed },
    });
    if (!moved.count) throw new PayoutError("This payout has just been decided by someone else.");
    const updated = await tx.payout.findUniqueOrThrow({
      /* tenant-scope: the row just moved. */
      where: { id: row.id }, select: PAYOUT_SELECT,
    });
    await audit(tx, actor, decision === "APPROVE" ? "payout.approve" : "payout.reject", "Payout", row.id, {
      before: { state: row.state }, after: { state: updated.state, note: trimmed },
    });
    if (decision === "APPROVE") {
      await enqueue(tx, row.tenantId, "payouts.send", { payoutId: row.id });
      await notifyPayee(tx, { ...row, ...payee }, "payout.approved");
    } else {
      await notifyPayee(tx, { ...row, ...payee }, "payout.sentBack", { note: trimmed ?? "" });
    }
    return payoutView(updated);
  });
}

/**
 * A payout the provider couldn't send goes back to the provider — BTG's
 * retry, at any time, whoever it was waiting on. 2S5-BE-07 — it resets the
 * automatic retries (three more if it fails again for a temporary reason,
 * and one more after the payee fixes their account).
 *
 * A failed payout left for BTG no longer claims its money, so the payee may
 * have requested it again since. Under the payee's lock, its money must
 * still be free — or it is refused, and never sent twice.
 */
export async function retryPayout(actor: Actor, id: string, now = new Date()) {
  assertAllowed(actor, "payout", "approve");
  return prisma.$transaction(async (tx) => {
    const found = await tx.payout.findFirst({ where: { ...whereFor(actor, "payout", "approve"), id }, select: { id: true, payeeType: true, payeeId: true, payeeTenantId: true } });
    if (!found) throw new ForbiddenError("payout", "approve");
    const payee: Payee = { payeeType: found.payeeType as PayeeType, payeeId: found.payeeId, payeeTenantId: found.payeeTenantId };
    await lockPayee(tx, payee);
    const row = await tx.payout.findUniqueOrThrow({
      /* tenant-scope: the row just found through whereFor(payout, approve), re-read under the payee's lock. */
      where: { id: found.id }, select: PAYOUT_SELECT,
    });
    if (row.state !== "FAILED") throw new PayoutError("Only a payout the provider couldn't send can be retried.");
    if (waitingOnOf(row) === "BTG") {
      const money = new Map((await balanceOf(tx, payee, now)).map((o) => [o.orderId, o.requestableCents]));
      if (row.lines.some((l) => (money.get(l.orderId) ?? 0) < l.amountCents)) {
        throw new PayoutError("This money has been requested again in a newer payout, or is no longer available to pay out — this payout can't be sent again.");
      }
    }
    const moved = await tx.payout.updateMany({
      /* tenant-scope: the row just loaded through whereFor(payout, approve); conditional, so two retries at once move it once. */
      where: { id: row.id, state: "FAILED" },
      data: {
        state: "APPROVED", failureReason: null, failureKind: null, waitingOn: null, nextRetryAt: null,
        retryCount: 0, accountRetryUsed: false, reviewReasons: [],
      },
    });
    if (!moved.count) throw new PayoutError("Only a payout the provider couldn't send can be retried.");
    await audit(tx, actor, "payout.retry", "Payout", row.id, {
      before: { state: "FAILED", waitingOn: waitingOnOf(row), retryCount: row.retryCount, failureKind: row.failureKind },
      after: { state: "APPROVED", retryCount: 0 },
    });
    await enqueue(tx, row.tenantId, "payouts.send", { payoutId: row.id });
    return payoutView(await tx.payout.findUniqueOrThrow({
      /* tenant-scope: the row just moved. */
      where: { id: row.id }, select: PAYOUT_SELECT,
    }));
  });
}

/* ── frozen money — 2S5-BE-03 ─────────────────────────────────────────── */

/** The rule's name for a dispute (or a provider refund BTG is checking) on a payout's orders. */
export const FROZEN_CHECK = "No dispute open on its orders";

/**
 * The money a payout would pay went back to the sponsor (a dispute lost, or
 * the provider refunded the payment): every payout covering this order that
 * has not been handed to the provider — REQUESTED, APPROVED, or FAILED — is
 * sent back, as the system, with a note the payee reads. Its other orders'
 * money is free to request again. A payout already SENDING can't be stopped:
 * once paid, what it paid is owed back. Each move is conditional on the state
 * it leaves. Returns how many were sent back.
 */
export async function sendBackPayoutsCovering(tx: Tx, orderId: string, note: string, now: Date): Promise<number> {
  const rows = await tx.payout.findMany({
    /* tenant-scope: the payouts whose lines name this order — the caller loaded the order through its own scope. */
    where: { lines: { some: { orderId } }, state: { in: ["REQUESTED", "APPROVED", "FAILED"] } }, select: PAYOUT_SELECT,
  });
  let sentBack = 0;
  for (const row of rows) {
    const moved = await tx.payout.updateMany({
      /* tenant-scope: a row just listed for this order; conditional on the state it leaves. */
      where: { id: row.id, state: row.state },
      data: { state: "REJECTED", decidedBy: SYSTEM, decidedAt: now, decisionNote: note, waitingOn: null, nextRetryAt: null },
    });
    if (!moved.count) continue;
    sentBack++;
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.sentBackBySystem", "Payout", row.id, {
      before: { state: row.state }, after: { state: "REJECTED", orderId, note },
    });
    const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
    await notifyPayee(tx, { ...row, ...payee }, "payout.sentBack", { note }, `payout.sentBack:${row.id}:${orderId}`);
  }
  return sentBack;
}

/**
 * The hold on an order's money lifted (a dispute won, a provider refund
 * closed): each APPROVED payout covering it goes to the provider again.
 * Sending is conditional, so one already sent or queued is harmless.
 */
export async function resumePayoutsCovering(tx: Tx, orderId: string) {
  const rows = await tx.payout.findMany({
    /* tenant-scope: the payouts whose lines name this order — the caller loaded the order through its own scope. */
    where: { lines: { some: { orderId } }, state: "APPROVED" }, select: { id: true, tenantId: true },
  });
  for (const row of rows) {
    await enqueue(tx, row.tenantId, "payouts.send", { payoutId: row.id });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.resume", "Payout", row.id, { after: { orderId, why: "its order's money is no longer frozen" } });
  }
  return rows.length;
}

/* ── the provider's side (worker jobs) ────────────────────────────────── */

/**
 * Hand an approved payout to the provider (the `payouts.send` job). With no
 * provider connected it waits, APPROVED, and says so on every screen. The
 * provider is called through the adapter with `<id>:<hand-over>` as its
 * idempotency key; its answer — paid, failed, returned — arrives later as a
 * provider event (`payout.*`, below). Conditional on the row still being
 * APPROVED and on its hand-over count, so two send jobs for the same payout
 * hand it over once; a provider that throws (down, timing out) rolls the
 * whole step back and the queue retries it with the same key.
 */
export async function sendPayout(payoutId: string, now = new Date()): Promise<{ sent: boolean; refused?: boolean }> {
  const provider = providerName();
  if (provider === "none") return { sent: false };
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the job this server enqueued on approval. */
      where: { id: payoutId },
      select: { id: true, tenantId: true, state: true, payeeType: true, payeeId: true, payeeTenantId: true, amountCents: true, sendAttempts: true, lines: { select: { orderId: true } } },
    });
    if (!row || row.state !== "APPROVED") return { sent: false };
    /* Held (2S1-BE-06 / -09): it waits, APPROVED, until BTG reinstates the payee, which sends it again. */
    if (await payoutHoldReason(tx, row)) return { sent: false };
    /* 2S5-BE-03 — frozen by a dispute (or a provider refund BTG is checking) on an order it covers:
       it waits, APPROVED, until BTG resolves it (resumePayoutsCovering sends it), or is sent back if the dispute is lost. */
    if ((await moneyHoldsOn(tx, row.lines.map((l) => l.orderId))).size) return { sent: false };
    /* 2S5-BE-04 — never released to an account that isn't READY: it waits, APPROVED, and the payee's
       next READY sends it (recordAccountStatus). */
    if (!(await accountReady(tx, row))) return { sent: false };
    const account = await tx.payoutAccount.findUnique({
      /* tenant-scope: the payee's account, by the unique payee key the payout names. */
      where: { payeeType_payeeId: { payeeType: row.payeeType, payeeId: row.payeeId } }, select: { providerAccountId: true },
    });
    const attempt = row.sendAttempts + 1;
    let handed: Awaited<ReturnType<typeof sendPayoutToProvider>>;
    try {
      handed = await sendPayoutToProvider({
        payoutId: row.id, amountCents: row.amountCents, currency: "USD", accountId: account?.providerAccountId ?? null, idempotencyKey: `${row.id}:${attempt}`,
      });
    } catch (error) {
      if (!(error instanceof ProviderRefusedError)) throw error;
      return refusedByProvider(tx, row.id, row.sendAttempts, error, now);
    }
    const moved = await tx.payout.updateMany({
      /* tenant-scope: the row just loaded by id; conditional on its state and hand-over count, so a second job for it finds nothing. */
      where: { id: row.id, state: "APPROVED", sendAttempts: row.sendAttempts },
      data: { state: "SENDING", provider: handed.provider, providerRef: handed.reference, sentAt: now, sendAttempts: attempt },
    });
    if (!moved.count) return { sent: false };
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.send", "Payout", row.id, { after: { provider: handed.provider, providerRef: handed.reference, attempt } });
    return { sent: true };
  }, providerTx());
}

/**
 * 2S5-INT-01 — the provider answered the hand-over and refused it (Stripe: no
 * destination account, BTG's balance short, an account that can't take
 * transfers). Retrying the same thing would be refused again, so it is a
 * payout failure like any the provider reports later — handed over, then
 * FAILED with Stripe's reason, its kind (lib/stripe.ts `failureKindFor`)
 * deciding what happens next: retried, waiting for the payee's account, or
 * BTG's. Conditional on the hand-over count, as the hand-over itself is.
 */
async function refusedByProvider(tx: Tx, payoutId: string, sendAttempts: number, error: ProviderRefusedError, now: Date): Promise<{ sent: false; refused: true }> {
  const moved = await tx.payout.updateMany({
    /* tenant-scope: the payout this job loaded by id; conditional on its state and hand-over count. */
    where: { id: payoutId, state: "APPROVED", sendAttempts },
    data: { state: "SENDING", provider: providerName(), providerRef: null, sentAt: now, sendAttempts: sendAttempts + 1 },
  });
  if (!moved.count) return { sent: false, refused: true };
  const row = await tx.payout.findUniqueOrThrow({ /* tenant-scope: the row just moved. */ where: { id: payoutId }, select: PAYOUT_SELECT });
  await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.send", "Payout", row.id, {
    after: { provider: providerName(), refused: true, providerCode: error.providerCode, attempt: sendAttempts + 1 },
  });
  await payoutFailedIn(tx, row, "SENDING", `The payment provider refused the payout: ${error.providerMessage}`.slice(0, 500), error.kind, now);
  return { sent: false, refused: true };
}

/** The provider confirms the money arrived: PAID, the PAYOUT journals, and the payee's email. Idempotent. */
export async function confirmPayoutPaid(payoutId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the provider's confirmation job. */
      where: { id: payoutId }, select: PAYOUT_SELECT,
    });
    if (!row || row.state !== "SENDING") return { paid: false };
    return { paid: await payoutPaidIn(tx, row, now) };
  });
}

/** SENDING → PAID, under the caller's transaction: conditional, so a second confirmation posts nothing twice. */
async function payoutPaidIn(tx: Tx, row: PayoutRow, now: Date): Promise<boolean> {
  const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
  const moved = await tx.payout.updateMany({
    /* tenant-scope: the row the caller loaded by id; conditional, so a redelivered confirmation posts nothing twice. */
    where: { id: row.id, state: "SENDING" }, data: { state: "PAID", paidAt: now },
  });
  if (!moved.count) return false;
  /* A payout paid again after the bank returned it posts its own journals (the return mirrored the first). */
  await postPayout(tx, row.tenantId, row.id, payee, row.lines, row.returnCount);
  await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.paid", "Payout", row.id, { after: { amountCents: row.amountCents, providerRef: row.providerRef } });
  await notifyPayee(tx, { ...row, ...payee }, "payout.paid", { orders: row.lines.map((l) => `${orderRef(l.orderId)} — ${usd(l.amountCents)}`).join("\n") }, `payout.paid:${row.id}:${row.sendAttempts}`);
  return true;
}

/**
 * The provider couldn't send it: FAILED, with the provider's reason, and —
 * 2S5-BE-07 — its failure kind deciding what happens next (payout-auto.ts
 * `planFailure`): a temporary failure is retried by the sweep; an account
 * problem emails the payee and waits for their account; anything else is
 * BTG's. Idempotent (conditional on SENDING).
 */
export async function failPayout(payoutId: string, reason: string, kind: FailureKind = "OTHER", now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the provider's failure. */
      where: { id: payoutId }, select: PAYOUT_SELECT,
    });
    if (!row || row.state !== "SENDING") return { failed: false };
    return { failed: await payoutFailedIn(tx, row, "SENDING", reason, kind, now) };
  });
}

/**
 * → FAILED from `from` (SENDING: the provider couldn't send it; PAID: the
 * bank returned it), with the plan for what happens next. Conditional on
 * `from`. 2S5-BE-05 — a failure left for BTG is surfaced: BTG's admins are
 * emailed, and it waits on BTG's list.
 */
async function payoutFailedIn(tx: Tx, row: PayoutRow, from: "SENDING" | "PAID", reason: string, kind: FailureKind, now: Date, extra: Prisma.PayoutUpdateManyMutationInput = {}): Promise<boolean> {
  const plan = planFailure(kind, row, now);
  const moved = await tx.payout.updateMany({
    /* tenant-scope: the row the caller loaded by id; conditional, so a redelivered failure moves it once. */
    where: { id: row.id, state: from },
    data: {
      state: "FAILED", failureReason: reason.slice(0, 500), failureKind: kind, failedAt: now,
      waitingOn: plan.waitingOn, nextRetryAt: plan.nextRetryAt, reviewReasons: plan.reviewReasons, ...extra,
    },
  });
  if (!moved.count) return false;
  await audit(tx, { userId: null, tenantId: row.tenantId }, from === "PAID" ? "payout.returned" : "payout.fail", "Payout", row.id, {
    before: { state: from },
    after: { reason, kind, waitingOn: plan.waitingOn, nextRetryAt: plan.nextRetryAt, retryCount: row.retryCount, reviewReasons: plan.reviewReasons },
  });
  const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
  if (plan.tellPayee) await notifyPayee(tx, { ...row, ...payee }, "payout.accountNeedsFix", {}, `payout.accountNeedsFix:${row.id}:${now.toISOString()}`);
  if (plan.waitingOn === "BTG") {
    const name = await payeeName(tx, payee);
    for (const u of await btgAdmins(tx, row.tenantId)) {
      await tell(tx, { tenantId: row.tenantId, email: u.email }, "payout.failedForBtg", `${row.id}:${row.sendAttempts}:${from}`, {
        payeeName: name, amount: usd(row.amountCents), reason: [reason, ...plan.reviewReasons].join(" — "),
        payoutUrl: appUrl(`/admin/payouts/${row.id}`),
      });
    }
  }
  return true;
}

/**
 * 2S5-BE-07 — one automatic retry, as the system: the payout goes back to
 * APPROVED and to the provider. Conditional on the row still waiting the way
 * the caller found it (and, for a scheduled retry, on its count), so a sweep
 * run twice — or two sweeps at once — retries it once.
 */
async function autoRetry(tx: Tx, payoutId: string, why: "SCHEDULE" | "ACCOUNT_READY", now: Date): Promise<boolean> {
  const row = await tx.payout.findUnique({
    /* tenant-scope: the payout named by the sweep (or the payee's account report), by id. */
    where: { id: payoutId }, select: { id: true, tenantId: true, state: true, waitingOn: true, retryCount: true },
  });
  if (!row || row.state !== "FAILED") return false;
  const moved = why === "SCHEDULE"
    ? await tx.payout.updateMany({
        /* tenant-scope: the row just loaded by id; conditional on its schedule and count. */
        where: { id: row.id, state: "FAILED", waitingOn: "SYSTEM_RETRY", nextRetryAt: { lte: now }, retryCount: row.retryCount },
        data: { state: "APPROVED", waitingOn: null, nextRetryAt: null, retryCount: row.retryCount + 1, reviewReasons: [] },
      })
    : await tx.payout.updateMany({
        /* tenant-scope: the row just loaded by id; conditional on it still waiting for the payee's account. */
        where: { id: row.id, state: "FAILED", waitingOn: "PAYEE_ACCOUNT" },
        data: { state: "APPROVED", waitingOn: null, accountRetryUsed: true, reviewReasons: [] },
      });
  if (!moved.count) return false;
  await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.autoRetry", "Payout", row.id, {
    before: { state: "FAILED", waitingOn: row.waitingOn, retryCount: row.retryCount },
    after: { state: "APPROVED", why, retryCount: why === "SCHEDULE" ? row.retryCount + 1 : row.retryCount },
  });
  await enqueue(tx, row.tenantId, "payouts.send", { payoutId: row.id });
  return true;
}

/**
 * 2S5-BE-07 — the worker's sweep: every payout whose automatic retry is due
 * goes back to the provider. `opts.tenantIds` limits it to some books, for a
 * test that moves the clock.
 */
export async function sweepPayoutRetries(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { retried: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  const due = await prisma.payout.findMany({
    /* tenant-scope: the system sweep — every tenant's payouts whose automatic retry is due; each is retried in its own books. */
    where: { ...books, state: "FAILED", waitingOn: "SYSTEM_RETRY", nextRetryAt: { lte: now } },
    select: { id: true }, orderBy: { nextRetryAt: "asc" }, take: 200,
  });
  for (const { id } of due) {
    try {
      if (await prisma.$transaction((tx) => autoRetry(tx, id, "SCHEDULE", now))) out.retried++;
    } catch (error) {
      out.failed++;
      console.error(`[payouts] automatic retry of ${id} failed, will retry next sweep:`, error);
    }
  }
  return out;
}

/** What the stand-in says when it fails a payout, by kind. */
const STANDIN_FAILURES: Record<FailureKind, string> = {
  TEMPORARY: "The payment provider couldn't reach the bank — a temporary problem (test payment provider).",
  ACCOUNT: "The payee's payout account needs attention before money can be sent to it (test payment provider).",
  OTHER: "The payment provider refused this payout (test payment provider).",
};

/**
 * The stand-in provider's answer to a payout it was handed: paid — or, when
 * STANDIN_PAYOUT_FAILURE names a failure kind, failed that way, so the
 * retry story runs end to end on staging and in tests. 2S5-BE-05 — spoken as
 * a provider speaks: a signed `payout.paid` / `payout.failed` event through
 * the webhook's door, applied at once (the queued job then finds it applied).
 * Its event id is the hand-over's, so the job delivered twice is one event.
 */
export async function completeStandinPayout(payoutId: string, now = new Date()) {
  if (providerName() !== "standin") return { paid: false, failed: false };
  const row = await prisma.payout.findUnique({
    /* tenant-scope: the payout the stand-in was just handed, by id. */
    where: { id: payoutId }, select: { id: true, state: true, providerRef: true, sendAttempts: true },
  });
  if (!row || row.state !== "SENDING") return { paid: false, failed: false };
  const kind = env.STANDIN_PAYOUT_FAILURE;
  const ref = { payoutId: row.id, payoutRef: row.providerRef ?? undefined };
  const ev = kind
    ? await emitStandinEvent("payout.failed", { ...ref, kind, reason: STANDIN_FAILURES[kind] }, { id: `evt_standin_payout_${row.id}_${row.sendAttempts}`, now })
    : await emitStandinEvent("payout.paid", ref, { id: `evt_standin_payout_${row.id}_${row.sendAttempts}`, now });
  const r = await processPaymentEvent(ev.id, now);
  const applied = r.status === "APPLIED" && r.changed;
  return kind ? { paid: false, failed: applied } : { failed: false, paid: applied };
}

/* ── the provider's word on a payout — 2S5-BE-05 ──────────────────────── */

/** The payout an event names: its id, else the provider's reference. */
async function payoutOf(tx: Tx, data: Record<string, unknown>) {
  const byId = typeof data.payoutId === "string"
    ? await tx.payout.findUnique({ /* tenant-scope: the payout a verified provider event names, by id. */ where: { id: data.payoutId }, select: PAYOUT_SELECT })
    : null;
  return byId ?? (typeof data.payoutRef === "string"
    ? await tx.payout.findFirst({ /* tenant-scope: the payout the provider's own reference names. */ where: { providerRef: data.payoutRef }, select: PAYOUT_SELECT })
    : null);
}

/** The payout, locked for this event (`SELECT … FOR UPDATE`), and read again after the lock. */
async function lockedPayout(tx: Tx, data: Record<string, unknown>) {
  const found = await payoutOf(tx, data);
  if (!found) return null;
  await tx.$queryRaw`SELECT id FROM "Payout" WHERE id = ${found.id} FOR UPDATE`;
  return tx.payout.findUniqueOrThrow({ /* tenant-scope: the row just found, re-read under its lock. */ where: { id: found.id }, select: PAYOUT_SELECT });
}

/** An event about an earlier hand-over of this payout (its reference since replaced by a retry) says nothing about this one. */
const stale = (row: PayoutRow, data: Record<string, unknown>) => typeof data.payoutRef === "string" && row.providerRef !== null && data.payoutRef !== row.providerRef;

/** payout.paid — the money arrived: SENDING → PAID, its journals, the payee told. A late "paid" for a payout SponsorX had failed is BTG's. */
export const onPayoutPaid: Handler = async (tx, _ev, data, now) => {
  const row = await lockedPayout(tx, data);
  if (!row) return deferred("No payout in SponsorX matches this event yet — tried again shortly");
  if (stale(row, data)) return ignored("About an earlier hand-over of this payout, since sent again", row.tenantId);
  if (row.state === "PAID") return ignored("The payout was already confirmed paid", row.tenantId);
  if (row.state === "APPROVED") return deferred("The provider's answer arrived before SponsorX recorded the hand-over — tried again shortly", row.tenantId);
  if (row.state === "SENDING") {
    await payoutPaidIn(tx, row, now);
    return applied(`Payout of ${usd(row.amountCents)} paid`, row.tenantId);
  }
  /* FAILED or REJECTED: SponsorX thought it didn't go — never let a retry pay it twice. */
  if (row.state === "FAILED" && row.waitingOn !== "BTG") {
    await tx.payout.updateMany({
      /* tenant-scope: the row just locked; conditional on its state. */
      where: { id: row.id, state: "FAILED" },
      data: { waitingOn: "BTG", nextRetryAt: null, reviewReasons: ["The provider later reported this payout as paid — check with the provider before retrying"] },
    });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.retryStopped", "Payout", row.id, { before: { waitingOn: row.waitingOn }, after: { waitingOn: "BTG", why: "provider reported it paid" } });
  }
  return held(`The provider says this payout of ${usd(row.amountCents)} was paid, but SponsorX had it as ${row.state.toLowerCase()} — no retry is sent until BTG has checked with the provider.`, row.tenantId);
};

/** payout.failed — the provider couldn't send it: SENDING → FAILED, retried or BTG's by its kind. Never undoes a paid payout. */
export const onPayoutFailed: Handler = async (tx, _ev, data, now) => {
  const row = await lockedPayout(tx, data);
  if (!row) return deferred("No payout in SponsorX matches this event yet — tried again shortly");
  if (stale(row, data)) return ignored("About an earlier hand-over of this payout, since sent again", row.tenantId);
  if (row.state === "APPROVED") return deferred("The provider's answer arrived before SponsorX recorded the hand-over — tried again shortly", row.tenantId);
  if (row.state !== "SENDING") return ignored(`The payout is already ${row.state.toLowerCase()} — a late failure changes nothing (a returned payout is payout.returned)`, row.tenantId);
  const kind = (["TEMPORARY", "ACCOUNT", "OTHER"] as const).find((k) => k === data.kind) ?? "OTHER";
  const reason = (typeof data.reason === "string" && data.reason.trim()) || "The payment provider couldn't send this payout.";
  await payoutFailedIn(tx, row, "SENDING", reason, kind, now);
  return applied(`Payout failed (${kind.toLowerCase()})`, row.tenantId);
};

/**
 * payout.returned — the bank sent a paid payout back: PAID → FAILED as an
 * account failure (the payee is asked to fix their payout account, and it is
 * sent again when it is READY; a second return is BTG's), and its PAYOUT
 * journals mirrored, so the money is the payee's again in the books.
 */
export const onPayoutReturned: Handler = async (tx, _ev, data, now) => {
  const row = await lockedPayout(tx, data);
  if (!row) return deferred("No payout in SponsorX matches this event yet — tried again shortly");
  if (stale(row, data)) return ignored("About an earlier hand-over of this payout, since sent again", row.tenantId);
  if (row.state === "SENDING" || row.state === "APPROVED") return deferred("The return arrived before the payout's confirmation — tried again shortly", row.tenantId);
  if (row.state !== "PAID") return ignored(`The payout is ${row.state.toLowerCase()} — nothing to return`, row.tenantId);
  const reason = (typeof data.reason === "string" && data.reason.trim()) || "The payee's bank returned the payout.";
  const returnCount = row.returnCount + 1;
  const moved = await payoutFailedIn(tx, row, "PAID", reason, "ACCOUNT", now, { paidAt: null, returnedAt: now, returnCount });
  if (!moved) return ignored("The return was already recorded", row.tenantId);
  const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
  await postPayoutReturn(tx, row.tenantId, row.id, payee, row.lines, returnCount);
  return applied(`Payout of ${usd(row.amountCents)} returned by the bank — waiting for the payee's payout account`, row.tenantId);
};

/**
 * account.updated — 2S5-INT-03: the provider's word on a payee's payout
 * account, by its account id. Ready or needing information, through
 * `recordAccountStatus` (the one place it is written — READY again releases
 * the payouts waiting on it). The same status again changes nothing. An
 * account SponsorX hasn't recorded yet (the provider faster than our commit)
 * waits and is tried again; one the payee has since replaced is ignored. An
 * account the provider rejected is recorded NEEDS_INFO and HELD for BTG: the
 * payee can't fix that themselves.
 */
export const onAccountUpdated: Handler = async (tx, ev, data, now) => {
  const accountRef = String(data.accountRef);
  const row = await tx.payoutAccount.findFirst({
    /* tenant-scope: the payout account a verified provider event names, by the provider's own account id. */
    where: { provider: ev.provider, providerAccountId: accountRef }, select: { tenantId: true, payeeType: true, payeeId: true, status: true },
  });
  if (!row) return deferred("No payout account in SponsorX matches this provider account yet — tried again shortly");
  /* A thin event only said it changed: the account is read afresh from the provider (the worker, never a request path). */
  const fresh = data.status === undefined ? await payoutAccountStatus(accountRef) : null;
  const status = (fresh?.status ?? data.status) === "READY" ? "READY" : "NEEDS_INFO";
  const reason = fresh ? fresh.reason : typeof data.reason === "string" ? data.reason : null;
  const rejected = fresh ? fresh.rejected : data.rejected === true;
  const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.tenantId };
  const who = `${await payeeName(tx, payee)}'s payout account`;
  if (row.status !== status) await recordAccountStatus(tx, payee, { status, provider: ev.provider, providerAccountId: accountRef }, now);
  if (rejected) {
    return held(`${who} was rejected by the payment provider${reason ? ` — ${reason}` : ""}. The payee can't fix this themselves: contact them, and check it with the provider.`);
  }
  if (row.status === status) return ignored(`${who} is already ${status === "READY" ? "ready" : "waiting on information"}`);
  return applied(status === "READY" ? `${who} is ready to be paid` : `${who} needs attention${reason ? `: ${reason}` : ""}`);
};

/** The handlers this module owns, for payment-events.ts (resolved at call time). */
export function payoutHandlerFor(type: string): Handler | null {
  if (type === "account.updated") return onAccountUpdated;
  if (type === "payout.paid") return onPayoutPaid;
  if (type === "payout.failed") return onPayoutFailed;
  if (type === "payout.returned") return onPayoutReturned;
  return null;
}
