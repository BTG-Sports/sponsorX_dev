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
 *       the order is delivered (FULFILLED or CLOSED),
 *       the holding period since fulfilment has passed (PAYOUT_HOLD_DAYS),
 *       and the payout account is READY.
 *     A refunded or cancelled order's money is reversed in the ledger and so
 *     can never be requested.
 *   - BTG admin or Finance approves (or sends it back with a note). The
 *     provider sends it; its confirmation marks it PAID, posts the PAYOUT
 *     journals and emails the payee.
 *
 * All provider traffic goes through lib/payment-provider.ts. On staging the
 * provider is a labelled stand-in that moves no money; in production, until a
 * provider is connected, links are refused and approved payouts wait.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { providerName, readStandinToken, standinLink, standinRef, StandinTokenError } from "../lib/payment-provider";
import { postPayout } from "./ledger";
import { moveOrderAsSystem } from "./marketplace-order";

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
/** A payout still claiming its money — the same money can't be requested twice. */
const IN_FLIGHT = ["REQUESTED", "APPROVED", "SENDING"];
const DELIVERED = new Set(["FULFILLED", "CLOSED"]);
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

/** A same-site path to come back to — never another site. */
function safeReturnPath(p: unknown, fallback: string): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p.slice(0, 300) : fallback;
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

const ACCOUNT_SELECT = { status: true, provider: true, providerAccountId: true, updatedAt: true } as const;

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
  const provider = providerName();
  if (provider === "none") throw providerUnavailable("Payout set-up");
  const back = safeReturnPath(returnPath, payee.payeeType === "ATHLETE" ? "/athlete" : "/property/earnings");
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

/** The sponsor starts paying: a link to the provider's payment page. */
export async function startCardPayment(actor: Actor, orderId: string, now = new Date()) {
  const scope = assertAllowed(actor, "marketplaceOrder", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("marketplaceOrder", "write");
  const provider = providerName();
  if (provider === "none") throw providerUnavailable("Card payment");
  const attempt = await prisma.$transaction(async (tx) => {
    const order = await tx.marketplaceOrder.findFirst({
      where: { ...whereFor(actor, "marketplaceOrder", "write"), id: orderId },
      select: { id: true, tenantId: true, sponsorId: true, state: true, totalCents: true },
    });
    if (!order) throw new ForbiddenError("marketplaceOrder", "write");
    if (order.state !== "APPROVED" && order.state !== "AWAITING_PAYMENT") {
      throw new PayoutError(order.state === "PENDING_APPROVAL" ? "BTG hasn't approved this order yet — you can pay once it has." : "This order isn't waiting for payment.");
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
    return created;
  });
  return { url: standinLink({ kind: "checkout", attemptId: attempt.id, returnPath: `/sponsor/orders/${orderId}?payment=returned` }, now) };
}

/** 2S5-INT-02 — the provider confirms a card payment: the order is paid. Idempotent. */
export async function confirmPayment(attemptId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.paymentAttempt.findUnique({
      /* tenant-scope: the attempt named by the provider's confirmation job. */
      where: { id: attemptId }, select: { id: true, tenantId: true, orderId: true, state: true, amountCents: true, createdBy: true },
    });
    if (!a || a.state !== "PROCESSING") return { confirmed: false };
    await tx.paymentAttempt.update({
      /* tenant-scope: the row just loaded by id. */
      where: { id: a.id }, data: { state: "SUCCEEDED" }, select: { id: true },
    });
    const order = await moveOrderAsSystem(tx, a.orderId, "PAID", now);
    await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.confirm", "MarketplaceOrder", a.orderId, { after: { attemptId: a.id, amountCents: a.amountCents } });
    const buyer = a.createdBy
      ? await tx.user.findUnique({
          /* tenant-scope: the sponsor user who started this attempt, recorded on it. */
          where: { id: a.createdBy }, select: { email: true },
        })
      : null;
    if (buyer) {
      await enqueue(tx, a.tenantId, "notify.email", {
        tenantId: a.tenantId,
        template: "payment.received",
        to: buyer.email,
        idempotencyKey: `payment.received:${a.id}`,
        data: {
          orderRef: orderRef(a.orderId),
          amount: usd(a.amountCents),
          lines: order.lines.map((l) => `${l.title} — ${usd(l.lineTotalCents)}`).join("\n"),
          orderUrl: `${env.APP_URL.replace(/\/+$/, "")}/sponsor/orders/${a.orderId}`,
        },
      });
    }
    return { confirmed: true };
  });
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
    const row = await tx.payoutAccount.findUnique({
      /* tenant-scope: the payee named in a link this server signed. */
      where: { payeeType_payeeId: { payeeType: link.payeeType, payeeId: link.payeeId } }, select: { id: true, providerAccountId: true },
    });
    const data = { status: outcome, provider: "standin", providerAccountId: row?.providerAccountId ?? standinRef("acct") };
    if (row) {
      await tx.payoutAccount.update({
        /* tenant-scope: the row just loaded for this signed link's payee. */
        where: { id: row.id }, data, select: { id: true },
      });
    } else {
      await tx.payoutAccount.create({ data: { ...data, tenantId: link.tenantId, payeeType: link.payeeType, payeeId: link.payeeId }, select: { id: true } });
    }
    await audit(tx, { userId: null, tenantId: link.tenantId }, "payoutAccount.status", "PayoutAccount", `${link.payeeType}:${link.payeeId}`, { after: { status: outcome, provider: "standin" } });
  });
  return { returnPath: link.returnPath };
}

/** The stand-in's payment page: the sponsor paid (confirmation follows) or the card was declined. */
export async function completeStandinCheckout(token: string, outcome: "SUCCEED" | "DECLINE", now = new Date()) {
  assertStandin();
  const link = readStandinToken(token, now);
  if (link.kind !== "checkout") throw new StandinTokenError();
  await prisma.$transaction(async (tx) => {
    const a = await tx.paymentAttempt.findUnique({
      /* tenant-scope: the attempt named in a link this server signed. */
      where: { id: link.attemptId }, select: { id: true, tenantId: true, orderId: true, state: true },
    });
    if (!a) throw new StandinTokenError();
    if (a.state !== "PENDING") return; // already answered — the page was submitted twice
    if (outcome === "DECLINE") {
      await tx.paymentAttempt.update({
        /* tenant-scope: the row just loaded by the signed link's id. */
        where: { id: a.id }, data: { state: "FAILED", failureReason: "The card was declined (test payment provider)." }, select: { id: true },
      });
      await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.fail", "MarketplaceOrder", a.orderId, { after: { attemptId: a.id } });
      return;
    }
    await tx.paymentAttempt.update({
      /* tenant-scope: the row just loaded by the signed link's id. */
      where: { id: a.id }, data: { state: "PROCESSING", providerRef: standinRef("pay") }, select: { id: true },
    });
    /* The provider's confirmation arrives separately, like a real webhook. */
    await enqueue(tx, a.tenantId, "payments.confirm", { attemptId: a.id });
  });
  return { returnPath: link.returnPath };
}

/* ── the payee's balance — 2S5-BE-04 ──────────────────────────────────── */

type OrderMoney = {
  orderId: string; books: string; state: string; fulfilledAt: Date | null; sponsorName: string; title: string;
  shareCents: number; availableCents: number; heldCents: number; awaitingPaymentCents: number; inFlightCents: number;
  requestableCents: number; holdUntil: Date | null;
};

async function balanceOf(db: Db, payee: Payee, now: Date) {
  const entries = await db.ledgerEntry.findMany({
    /* tenant-scope: the payee's own entries — its tenant, type and id, exactly as ledgerEntry's own scope reads them. */
    where: { partyTenantId: payee.payeeTenantId, partyType: payee.payeeType, partyId: payee.payeeId, account: { in: [PAYABLE[payee.payeeType], "RESERVE_HELD"] }, orderId: { not: null } },
    select: { tenantId: true, orderId: true, account: true, entryType: true, status: true, debitCents: true, creditCents: true },
  });
  const inFlight = await db.payoutLine.findMany({
    /* tenant-scope: lines of this payee's own payouts, named by payee. */
    where: { payout: { payeeTenantId: payee.payeeTenantId, payeeType: payee.payeeType, payeeId: payee.payeeId, state: { in: IN_FLIGHT } } },
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
    const holdUntil = o.fulfilledAt ? new Date(o.fulfilledAt.getTime() + holdMs) : null;
    const releasable = DELIVERED.has(o.state) && holdUntil !== null && holdUntil <= now;
    out.push({
      orderId: o.id, books: mine[0]!.tenantId, state: o.state, fulfilledAt: o.fulfilledAt,
      sponsorName: sponsorName.get(o.sponsorId) ?? "", title: o.lines.map((l) => l.title).join(" · "),
      shareCents, availableCents, heldCents, awaitingPaymentCents, inFlightCents,
      requestableCents: releasable ? Math.max(0, availableCents - inFlightCents) : 0, holdUntil,
    });
  }
  return out.sort((a, b) => (b.fulfilledAt?.getTime() ?? 0) - (a.fulfilledAt?.getTime() ?? 0));
}

const PAYOUT_SELECT = {
  id: true, tenantId: true, payeeType: true, payeeId: true, payeeTenantId: true, amountCents: true, state: true,
  requestedAt: true, decidedAt: true, decisionNote: true, providerRef: true, sentAt: true, paidAt: true, failureReason: true, createdAt: true,
  lines: { select: { orderId: true, amountCents: true } },
} as const;
type PayoutRow = Prisma.PayoutGetPayload<{ select: typeof PAYOUT_SELECT }>;

function payoutView(p: PayoutRow) {
  return { ...p, lines: p.lines.map((l) => ({ ...l, orderRef: orderRef(l.orderId) })) };
}

/** The payee's money: what can be requested, what can't yet and why, and every payout so far. */
export async function myPayouts(actor: Actor, now = new Date()) {
  const payee = payeeOf(actor, "payout", "read");
  const [orders, accountRow, payouts] = await Promise.all([
    balanceOf(prisma, payee, now),
    prisma.payoutAccount.findUnique({
      /* tenant-scope: the payee's own account, by its unique payee key from the actor. */
      where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: ACCOUNT_SELECT,
    }),
    prisma.payout.findMany({ where: whereFor(actor, "payout", "read"), select: PAYOUT_SELECT, orderBy: { requestedAt: "desc" }, take: 50 }),
  ]);
  const account = accountView(accountRow && accountRow.status ? accountRow : null);
  const sum = (f: (o: OrderMoney) => number) => orders.reduce((s, o) => s + f(o), 0);
  const requestableCents = sum((o) => o.requestableCents);
  const paidOutCents = payouts.filter((p) => p.state === "PAID").reduce((s, p) => s + p.amountCents, 0);
  const holds = orders.filter((o) => DELIVERED.has(o.state) && o.holdUntil && o.holdUntil > now && o.availableCents - o.inFlightCents > 0);
  const nextHold = holds.map((o) => o.holdUntil!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const checks = [
    { key: "payment", label: "Sponsor's payment received", ok: orders.some((o) => PAID_OR_LATER.has(o.state)) },
    { key: "delivered", label: "Order delivered (marked fulfilled)", ok: orders.some((o) => DELIVERED.has(o.state)) },
    { key: "account", label: "Payout account ready", ok: account.status === "READY" },
    { key: "hold", label: nextHold ? `Holding period ends ${nextHold.toISOString().slice(0, 10)}` : "Holding period passed", ok: !nextHold || requestableCents > 0 },
  ];
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
    },
    canRequest: account.status === "READY" && requestableCents > 0,
    checks,
    orders: orders.map(({ books: _books, ...o }) => ({ ...o, orderRef: orderRef(o.orderId) })),
    payouts: payouts.map(payoutView),
  };
}

/** The payee asks for its whole requestable balance — one payout per set of books. */
export async function requestPayout(actor: Actor, now = new Date()) {
  const payee = payeeOf(actor, "payout", "write");
  return prisma.$transaction(async (tx) => {
    const account = await tx.payoutAccount.findUnique({
      /* tenant-scope: the payee's own account, by its unique payee key from the actor. */
      where: { payeeType_payeeId: { payeeType: payee.payeeType, payeeId: payee.payeeId } }, select: { status: true },
    });
    if (account?.status !== "READY") throw new PayoutError("Set up your payout account first — payouts are sent to it.", 409, ["Payout account ready"]);
    const orders = (await balanceOf(tx, payee, now)).filter((o) => o.requestableCents > 0);
    if (!orders.length) throw new PayoutError("Nothing is ready to pay out yet.", 409, ["An order that is paid, delivered and past its holding period"]);
    const byBooks = new Map<string, OrderMoney[]>();
    for (const o of orders) byBooks.set(o.books, [...(byBooks.get(o.books) ?? []), o]);
    const created = [];
    for (const [books, os] of byBooks) {
      const amountCents = os.reduce((s, o) => s + o.requestableCents, 0);
      const row = await tx.payout.create({
        data: {
          tenantId: books, ...payee, amountCents, requestedBy: actor.userId, requestedAt: now,
          lines: { create: os.map((o) => ({ orderId: o.orderId, amountCents: o.requestableCents })) },
        },
        select: PAYOUT_SELECT,
      });
      await audit(tx, actor, "payout.request", "Payout", row.id, { after: { amountCents, orders: os.length } });
      created.push(payoutView(row));
    }
    return { payouts: created };
  });
}

/* ── BTG's side — 2S5-BE-05 ───────────────────────────────────────────── */

const STATES = ["REQUESTED", "APPROVED", "SENDING", "PAID", "REJECTED", "FAILED"] as const;
export type PayoutState = (typeof STATES)[number];
export const isPayoutState = (s: unknown): s is PayoutState => typeof s === "string" && (STATES as readonly string[]).includes(s);

async function withPayee(db: Db, rows: PayoutRow[]) {
  return Promise.all(rows.map(async (p) => ({ ...payoutView(p), payeeName: await payeeName(db, { payeeType: p.payeeType as PayeeType, payeeId: p.payeeId }) })));
}

export async function listPayouts(actor: Actor, states?: PayoutState[]) {
  assertAllowed(actor, "payout", "approve");
  const rows = await prisma.payout.findMany({
    where: { ...whereFor(actor, "payout", "read"), ...(states?.length ? { state: { in: states } } : {}) },
    select: PAYOUT_SELECT, orderBy: { requestedAt: "asc" }, take: 200,
  });
  const counts = await prisma.payout.groupBy({ by: ["state"], where: whereFor(actor, "payout", "read"), _count: { _all: true } });
  return { payouts: await withPayee(prisma, rows), counts: Object.fromEntries(counts.map((c) => [c.state, c._count._all])) };
}

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
  const [view] = await withPayee(prisma, [row]);
  return {
    ...view!,
    account: accountView(account),
    orders: orders.map((o) => ({ orderId: o.id, orderRef: orderRef(o.id), state: o.state, fulfilledAt: o.fulfilledAt, totalCents: o.totalCents, title: o.lines.map((l) => l.title).join(" · ") })),
    checks: [
      { key: "payment", label: "Sponsor's payment received", ok: orders.every((o) => PAID_OR_LATER.has(o.state)) },
      { key: "delivered", label: "Order delivered (marked fulfilled)", ok: orders.every((o) => DELIVERED.has(o.state)) },
      { key: "account", label: "Payout account ready", ok: account?.status === "READY" },
      { key: "hold", label: "Holding period passed", ok: orders.every((o) => o.fulfilledAt && o.fulfilledAt.getTime() + env.PAYOUT_HOLD_DAYS * 86_400_000 <= now.getTime()) },
    ],
    provider: providerName(),
  };
}

async function notifyPayee(tx: Tx, row: { id: string; tenantId: string; amountCents: number } & Payee, template: string, extra: Record<string, string> = {}) {
  const to = await payeeEmail(tx, row);
  if (!to) return;
  const path = row.payeeType === "ATHLETE" ? "/athlete/money" : "/property/earnings";
  await enqueue(tx, row.tenantId, "notify.email", {
    tenantId: row.tenantId,
    template,
    to: to.email,
    idempotencyKey: `${template}:${row.id}`,
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
    const updated = await tx.payout.update({
      /* tenant-scope: the row just loaded through whereFor(payout, approve). */
      where: { id: row.id },
      data: { state: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedBy: actor.userId, decidedAt: now, decisionNote: trimmed },
      select: PAYOUT_SELECT,
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

/** A payout the provider couldn't send goes back to the provider. */
export async function retryPayout(actor: Actor, id: string) {
  assertAllowed(actor, "payout", "approve");
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findFirst({ where: { ...whereFor(actor, "payout", "approve"), id }, select: PAYOUT_SELECT });
    if (!row) throw new ForbiddenError("payout", "approve");
    if (row.state !== "FAILED") throw new PayoutError("Only a payout the provider couldn't send can be retried.");
    const updated = await tx.payout.update({
      /* tenant-scope: the row just loaded through whereFor(payout, approve). */
      where: { id: row.id }, data: { state: "APPROVED", failureReason: null }, select: PAYOUT_SELECT,
    });
    await audit(tx, actor, "payout.retry", "Payout", row.id, { before: { state: "FAILED" }, after: { state: "APPROVED" } });
    await enqueue(tx, row.tenantId, "payouts.send", { payoutId: row.id });
    return payoutView(updated);
  });
}

/* ── the provider's side (worker jobs) ────────────────────────────────── */

/**
 * Hand an approved payout to the provider. With no provider connected it
 * waits, APPROVED, and says so on every screen. The stand-in "sends" it;
 * its confirmation follows as a separate job (`confirmPayoutPaid`).
 */
export async function sendPayout(payoutId: string, now = new Date()): Promise<{ sent: boolean }> {
  const provider = providerName();
  if (provider === "none") return { sent: false };
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the job this server enqueued on approval. */
      where: { id: payoutId }, select: { id: true, tenantId: true, state: true },
    });
    if (!row || row.state !== "APPROVED") return { sent: false };
    await tx.payout.update({
      /* tenant-scope: the row just loaded by id. */
      where: { id: row.id }, data: { state: "SENDING", provider, providerRef: standinRef("po"), sentAt: now }, select: { id: true },
    });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.send", "Payout", row.id, { after: { provider } });
    return { sent: true };
  });
}

/** The provider confirms the money arrived: PAID, the PAYOUT journals, and the payee's email. Idempotent. */
export async function confirmPayoutPaid(payoutId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the provider's confirmation job. */
      where: { id: payoutId }, select: PAYOUT_SELECT,
    });
    if (!row || row.state !== "SENDING") return { paid: false };
    const payee: Payee = { payeeType: row.payeeType as PayeeType, payeeId: row.payeeId, payeeTenantId: row.payeeTenantId };
    await tx.payout.update({
      /* tenant-scope: the row just loaded by id. */
      where: { id: row.id }, data: { state: "PAID", paidAt: now }, select: { id: true },
    });
    await postPayout(tx, row.tenantId, row.id, payee, row.lines);
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.paid", "Payout", row.id, { after: { amountCents: row.amountCents } });
    await notifyPayee(tx, { ...row, ...payee }, "payout.paid", { orders: row.lines.map((l) => `${orderRef(l.orderId)} — ${usd(l.amountCents)}`).join("\n") });
    return { paid: true };
  });
}

/** The provider couldn't send it: FAILED, with the reason BTG sees. */
export async function failPayout(payoutId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.payout.findUnique({
      /* tenant-scope: the payout named by the provider's failure. */
      where: { id: payoutId }, select: { id: true, tenantId: true, state: true },
    });
    if (!row || row.state !== "SENDING") return { failed: false };
    await tx.payout.update({
      /* tenant-scope: the row just loaded by id. */
      where: { id: row.id }, data: { state: "FAILED", failureReason: reason.slice(0, 500) }, select: { id: true },
    });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "payout.fail", "Payout", row.id, { after: { reason } });
    return { failed: true };
  });
}
