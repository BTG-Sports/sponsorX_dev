/**
 * Order approval, automated — 2S4-BE-09: the seller's step, and BTG's daily
 * summary of what was approved on its own.
 *
 * THE SELLER'S STEP. "The listing asks for approval" (`packageRules.
 * requiresApproval`) now asks the SELLER, not BTG. When such an order is
 * placed (marketplace-order.ts `placeOrder`), each seller asked — the team,
 * through its manager; or the independent athlete, or the guardian acting
 * for a minor — gets one OrderSellerApproval covering their asking lines,
 * and an email with a link. They accept, or decline with a reason the
 * sponsor reads, within 48 hours. The seller reaches the row in THEIR OWN
 * tenant (orderSellerApproval scope, like a sold line): only the lines it
 * covers and the sponsor's business name, never the order, its total or
 * another seller's lines.
 *
 *   - Every seller accepted → the order moves on (`afterSellersAccepted`):
 *     above the sponsor's limit it waits for BTG; within it, policy approves
 *     it and the payment window opens. The sponsor is emailed either way.
 *   - One seller declined → the order is CANCELLED (SELLER_DECLINED), its
 *     stock released, the other sellers' questions closed, and the sponsor
 *     emailed the reason.
 *   - Nobody answered in 48 hours → the worker's sweep (`sweepSellerApprovals`)
 *     declines for them: CANCELLED (SELLER_NO_ANSWER), stock released, the
 *     sponsor and the silent seller emailed.
 *
 * TWO SELLERS AT ONCE. Each answer takes the ORDER's row lock before it
 * writes (marketplace-order.ts `lockOrder`), so answers to one order
 * serialize: the second reads the first's, and whichever is last sees no
 * question left open and moves the order on. (Without it, two accepts each
 * counted the other still PENDING under READ COMMITTED and neither moved it
 * — the order stuck in PENDING_SELLER.) As a backstop the sweep also picks up
 * any PENDING_SELLER order with no question left open.
 *
 * THE DAILY SUMMARY. One email a day per BTG tenant to its admins, listing
 * the orders approved automatically since the last summary
 * (`sendOrderApprovalDigests`) — the same shape as listing.ts
 * `sendListingDigests`, idempotent on an OrderApprovalDigest row.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor, type Scope } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { send } from "../lib/email";
import { assertMayCommit } from "./guardian-acts";
import { afterSellersAccepted, cancelOrderAsSystem, lockOrder } from "./marketplace-order";
import { SELLER_APPROVAL_HOURS, usd } from "./marketplace-order-rules";
import { appUrl, btgAdmins, orderRef, sellerRecipients, sponsorRecipient, tell, utc, type SellerParty } from "./order-mail";
import { logError } from "../lib/redact";

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export class SellerApprovalError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SellerApprovalError";
    this.status = status;
  }
}

export type SellerApprovalState = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CLOSED";

/* ── opening the step (inside placeOrder's transaction) ────────────────── */

type PlacedOrder = {
  id: string; tenantId: string; sponsorId: string;
  lines: Array<{ id: string; listingId: string; propertyId: string | null; sellerAthleteId: string | null; title: string; quantity: number; startsOn: Date; endsOn: Date; lineTotalCents: number }>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const lineText = (l: { title: string; quantity: number; startsOn: Date; endsOn: Date }) =>
  `${l.title} (×${l.quantity}) · ${day(l.startsOn)}${day(l.endsOn) !== day(l.startsOn) ? ` to ${day(l.endsOn)}` : ""}`;
const approvalPath = (portal: "athlete" | "property", id: string) => `/${portal}/sales/approvals/${id}`;

/**
 * One question per seller whose listing on this order asks for approval:
 * the team (in its tenant) or the independent athlete (in theirs), with the
 * asking lines and 48 hours. Each seller's people are emailed a link.
 */
export async function openSellerApprovals(tx: Tx, order: PlacedOrder, askingListingIds: ReadonlySet<string>, now: Date) {
  const asking = order.lines.filter((l) => askingListingIds.has(l.listingId));
  const propertyIds = [...new Set(asking.map((l) => l.propertyId).filter((x): x is string => Boolean(x)))];
  const athleteIds = [...new Set(asking.map((l) => (l.propertyId ? null : l.sellerAthleteId)).filter((x): x is string => Boolean(x)))];
  const properties = propertyIds.length
    ? await tx.property.findMany({
        /* tenant-scope: the teams this order's own lines name; each is reached in its own tenant. */
        where: { id: { in: propertyIds } }, select: { id: true, tenantId: true },
      })
    : [];
  const athletes = athleteIds.length
    ? await tx.athlete.findMany({
        /* tenant-scope: the independent sellers this order's own lines name; each is reached in their own tenant. */
        where: { id: { in: athleteIds } }, select: { id: true, tenantId: true },
      })
    : [];
  const sponsor = await tx.sponsor.findFirst({
    /* tenant-scope: the order's own sponsor, in the order's books. */
    where: { tenantId: order.tenantId, id: order.sponsorId }, select: { name: true },
  });
  const dueAt = new Date(now.getTime() + SELLER_APPROVAL_HOURS * HOUR);
  const parties: Array<SellerParty & { lines: typeof asking }> = [
    ...properties.map((p) => ({ propertyId: p.id, propertyTenantId: p.tenantId, athleteId: null, athleteTenantId: null, lines: asking.filter((l) => l.propertyId === p.id) })),
    ...athletes.map((a) => ({ propertyId: null, propertyTenantId: null, athleteId: a.id, athleteTenantId: a.tenantId, lines: asking.filter((l) => !l.propertyId && l.sellerAthleteId === a.id) })),
  ];
  if (!parties.length) throw new SellerApprovalError("This order asks its seller for approval, but the seller could not be found.", 409);
  for (const party of parties) {
    const { lines, ...seller } = party;
    const row = await tx.orderSellerApproval.create({
      data: { tenantId: order.tenantId, orderId: order.id, sponsorId: order.sponsorId, ...seller, lineIds: lines.map((l) => l.id), dueAt },
      select: { id: true },
    });
    await audit(tx, { userId: null, tenantId: order.tenantId }, "orderSellerApproval.open", "OrderSellerApproval", row.id, {
      after: { orderId: order.id, ...seller, lineIds: lines.map((l) => l.id), dueAt: dueAt.toISOString() },
    });
    for (const r of await sellerRecipients(tx, seller)) {
      await tell(tx, r, "sale.approvalRequested", row.id, {
        firstName: r.firstName, sponsorName: sponsor?.name ?? "A sponsor", orderRef: orderRef(order.id),
        lines: lines.map(lineText).join("\n"), total: usd(lines.reduce((s, l) => s + l.lineTotalCents, 0)),
        answerBy: utc(dueAt), approvalUrl: appUrl(approvalPath(r.portal, row.id)),
      });
    }
  }
}

/* ── what each side reads ──────────────────────────────────────────────── */

const SELECT = {
  id: true, tenantId: true, orderId: true, sponsorId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true,
  lineIds: true, state: true, dueAt: true, decidedAt: true, decidedBy: true, reason: true, createdAt: true,
  order: { select: { state: true } },
} as const;
type Row = Prisma.OrderSellerApprovalGetPayload<{ select: typeof SELECT }>;

/** Names for the rows: the sponsors' businesses and the sellers. */
async function namesFor(rows: Array<{ sponsorId: string; propertyId: string | null; athleteId: string | null }>) {
  const [sponsors, properties, athletes] = await Promise.all([
    prisma.sponsor.findMany({
      /* tenant-scope: the sponsors named on approval rows the caller loaded through its own scope. */
      where: { id: { in: [...new Set(rows.map((r) => r.sponsorId))] } }, select: { id: true, name: true },
    }),
    prisma.property.findMany({
      /* tenant-scope: the teams named on approval rows the caller loaded through its own scope. */
      where: { id: { in: [...new Set(rows.map((r) => r.propertyId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true },
    }),
    prisma.athlete.findMany({
      /* tenant-scope: the athletes named on approval rows the caller loaded through its own scope. */
      where: { id: { in: [...new Set(rows.map((r) => r.athleteId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true },
    }),
  ]);
  return {
    sponsor: new Map(sponsors.map((s) => [s.id, s.name])),
    property: new Map(properties.map((p) => [p.id, p.name])),
    athlete: new Map(athletes.map((a) => [a.id, a.displayName])),
  };
}
type Names = Awaited<ReturnType<typeof namesFor>>;

const sellerOf = (r: { propertyId: string | null; athleteId: string | null }, n: Names) =>
  r.propertyId ? { type: "PROPERTY" as const, id: r.propertyId, name: n.property.get(r.propertyId) ?? "Team" } : { type: "ATHLETE" as const, id: r.athleteId!, name: n.athlete.get(r.athleteId!) ?? "Athlete" };

/** The seller's answer as the sponsor and BTG read it on the order. */
export async function approvalsForOrders(orderIds: string[]) {
  const out = new Map<string, Array<{ id: string; seller: ReturnType<typeof sellerOf>; lineIds: string[]; state: string; dueAt: Date; decidedAt: Date | null; reason: string | null }>>();
  if (!orderIds.length) return out;
  const rows = await prisma.orderSellerApproval.findMany({
    /* tenant-scope: the approval rows of orders the caller just loaded through whereFor(marketplaceOrder, read), named by their ids. */
    where: { orderId: { in: orderIds } }, select: SELECT, orderBy: { createdAt: "asc" },
  });
  const names = await namesFor(rows);
  for (const r of rows) {
    out.set(r.orderId, [...(out.get(r.orderId) ?? []), { id: r.id, seller: sellerOf(r, names), lineIds: r.lineIds, state: r.state, dueAt: r.dueAt, decidedAt: r.decidedAt, reason: r.reason }]);
  }
  return out;
}

/** A seller's scope — the team (own-property) or the athlete / acting guardian (own). */
function sellerScope(actor: Actor, action: "read" | "write"): Scope {
  const scope = assertAllowed(actor, "orderSellerApproval", action);
  if (scope === "own-property" && actor.propertyId) return scope;
  if (scope === "own" && actor.athleteId) return scope;
  throw new ForbiddenError("orderSellerApproval", action);
}

async function sellerViews(rows: Row[], now: Date) {
  const lines = rows.length
    ? await prisma.marketplaceOrderLine.findMany({
        /* tenant-scope: only the lines the seller's own approval rows name (loaded through whereFor(orderSellerApproval)) — never the order's others. */
        where: { id: { in: rows.flatMap((r) => r.lineIds) } },
        select: { id: true, title: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true, lineTotalCents: true },
      })
    : [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const names = await namesFor(rows);
  return rows.map((r) => {
    const mine = r.lineIds.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
    const open = r.state === "PENDING" && r.order.state === "PENDING_SELLER" && now < r.dueAt;
    return {
      id: r.id,
      orderRef: orderRef(r.orderId),
      state: r.state as SellerApprovalState,
      /** Still open to answer: pending, inside the 48 hours, and the order still waiting on sellers. */
      canAnswer: open,
      dueAt: r.dueAt,
      hoursLeft: open ? Math.max(0, Math.ceil((r.dueAt.getTime() - now.getTime()) / HOUR)) : 0,
      decidedAt: r.decidedAt,
      reason: r.reason,
      /** Whether the order went ahead, in the seller's words — never its other lines or its total. */
      orderOutcome: r.order.state === "PENDING_SELLER" ? "WAITING" : r.order.state === "CANCELLED" ? "CANCELLED" : r.order.state === "PENDING_APPROVAL" ? "WITH_BTG" : "APPROVED",
      sponsorName: names.sponsor.get(r.sponsorId) ?? "Sponsor",
      seller: sellerOf(r, names),
      lines: mine,
      totalCents: mine.reduce((s, l) => s + l.lineTotalCents, 0),
      createdAt: r.createdAt,
    };
  });
}

/** GET /seller-approvals — the seller's orders waiting for their answer (open first, soonest due), then the answered ones. */
export async function mySellerApprovals(actor: Actor, now = new Date()) {
  sellerScope(actor, "read");
  const rows = await prisma.orderSellerApproval.findMany({
    where: whereFor(actor, "orderSellerApproval", "read"), select: SELECT, orderBy: [{ createdAt: "desc" }], take: 200,
  });
  const views = await sellerViews(rows, now);
  return { approvals: [...views.filter((v) => v.canAnswer).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()), ...views.filter((v) => !v.canAnswer)] };
}

/** GET /seller-approvals/:id — one of the seller's own. */
export async function mySellerApproval(actor: Actor, id: string, now = new Date()) {
  sellerScope(actor, "read");
  const row = await prisma.orderSellerApproval.findFirst({ where: { ...whereFor(actor, "orderSellerApproval", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("orderSellerApproval", "read");
  return (await sellerViews([row], now))[0]!;
}

/**
 * POST /seller-approvals/:id/decision — the seller accepts, or declines with
 * a reason the sponsor reads. Within the 48 hours, while the order still
 * waits on its sellers. A minor's answer comes from their guardian
 * (guardian-acts.ts `assertMayCommit`); the audit names who answered.
 */
export async function decideSellerApproval(actor: Actor, id: string, decision: "ACCEPT" | "DECLINE", reason?: string | null, now = new Date()) {
  sellerScope(actor, "write");
  const why = reason?.trim() ?? "";
  if (decision === "DECLINE" && !why) throw new SellerApprovalError("Declining needs a reason — the sponsor reads it.", 422);
  await prisma.$transaction(async (tx) => {
    const found = await tx.orderSellerApproval.findFirst({ where: { ...whereFor(actor, "orderSellerApproval", "write"), id }, select: { orderId: true } });
    if (!found) throw new ForbiddenError("orderSellerApproval", "write");
    /* The order's row lock before anything is written: answers to one order
       serialize, so the count below sees every other answer already made. */
    await lockOrder(tx, found.orderId);
    const row = await tx.orderSellerApproval.findFirst({ where: { ...whereFor(actor, "orderSellerApproval", "write"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("orderSellerApproval", "write");
    await assertMayCommit(tx, actor, decision === "ACCEPT" ? "accept" : "manage");
    if (row.state !== "PENDING") {
      throw new SellerApprovalError(
        row.state === "CLOSED" ? "This order has ended — there is nothing to answer."
        : row.state === "EXPIRED" ? "The 48 hours to answer are over, so the order was cancelled."
        : "You have already answered this order.",
      );
    }
    if (row.order.state !== "PENDING_SELLER") throw new SellerApprovalError("This order is no longer waiting for your answer.");
    if (now >= row.dueAt) throw new SellerApprovalError("The 48 hours to answer are over, so the order is cancelled.");
    const next = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    const claimed = await tx.orderSellerApproval.updateMany({
      /* tenant-scope: the row just loaded through whereFor(orderSellerApproval, write); conditional, so a second answer finds nothing. */
      where: { id: row.id, state: "PENDING" }, data: { state: next, decidedAt: now, decidedBy: actor.userId, reason: decision === "DECLINE" ? why : null },
    });
    if (claimed.count === 0) throw new SellerApprovalError("You have already answered this order.");
    await audit(tx, actor, decision === "ACCEPT" ? "orderSellerApproval.accept" : "orderSellerApproval.decline", "OrderSellerApproval", row.id, {
      before: { state: "PENDING" }, after: { state: next, orderId: row.orderId, ...(decision === "DECLINE" ? { reason: why } : {}), ...(actor.actingFor ? { actingForAthleteId: actor.actingFor.athleteId } : {}) },
    });
    const names = await namesFor([row]);
    const seller = sellerOf(row, names);
    if (decision === "ACCEPT") {
      const waiting = await tx.orderSellerApproval.count({
        /* tenant-scope: this order's own approval rows, named by its id. */
        where: { orderId: row.orderId, state: "PENDING" },
      });
      if (waiting) return;
      await sellersAccepted(tx, row.orderId, seller.name, now);
      return;
    }
    const order = await cancelOrderAsSystem(tx, row.orderId, "SELLER_DECLINED", now);
    const sponsor = await sponsorRecipient(tx, order);
    if (sponsor) {
      await tell(tx, sponsor, "order.sellerDeclined", order.id, {
        firstName: sponsor.firstName, orderRef: orderRef(order.id), sellerName: seller.name, reason: why, orderUrl: appUrl(`/sponsor/orders/${order.id}`),
      });
    }
  });
  return mySellerApproval(actor, id, now);
}

/**
 * Every seller asked has accepted: the order moves on (`afterSellersAccepted`).
 * Within the limit it is approved now and the sponsor gets the "approved —
 * pay by" email; above it, they are told BTG is checking. Under the order's
 * row lock (the caller's).
 */
async function sellersAccepted(tx: Tx, orderId: string, sellerName: string, now: Date) {
  const order = await afterSellersAccepted(tx, orderId, now);
  if (order.state === "PENDING_APPROVAL") {
    const sponsor = await sponsorRecipient(tx, order);
    if (sponsor) await tell(tx, sponsor, "order.sellerAccepted", order.id, { firstName: sponsor.firstName, orderRef: orderRef(order.id), sellerName, orderUrl: appUrl(`/sponsor/orders/${order.id}`) });
  }
  return order;
}

/* ── the 48 hours — the worker's sweep ─────────────────────────────────── */

/**
 * Every seller question whose 48 hours are over, unanswered: EXPIRED, the
 * order CANCELLED (SELLER_NO_ANSWER) and its stock released, the sponsor and
 * the silent seller emailed. Per order, in its own transaction; conditional
 * on the row still being PENDING, so overlapping runs and retries do
 * nothing twice. `tenantIds` limits the pass to named order books (a test,
 * or a re-run for one marketplace); the worker passes none — every one.
 *
 * And the backstop: an order still PENDING_SELLER with no question left open
 * is settled from its answers — every seller accepted → moved on as the last
 * answer would have; one declined → cancelled (SELLER_DECLINED); one expired
 * → cancelled (SELLER_NO_ANSWER). Under the order's row lock, so it never
 * races a seller answering.
 */
export async function sweepSellerApprovals(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const due = await prisma.orderSellerApproval.findMany({
    /* tenant-scope: the worker's sweep across every tenant (or the named ones); each order is ended in its own books. */
    where: { state: "PENDING", dueAt: { lte: now }, ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    select: { orderId: true }, orderBy: { dueAt: "asc" }, take: 500,
  });
  let expired = 0;
  let cancelled = 0;
  let failed = 0;
  let movedOn = 0;
  for (const orderId of [...new Set(due.map((d) => d.orderId))]) {
    await prisma.$transaction(async (tx) => {
      /* The order's row lock first, as a seller's answer takes it. */
      await lockOrder(tx, orderId);
      const silent = await tx.orderSellerApproval.findMany({
        /* tenant-scope: this order's own approval rows, named by its id. */
        where: { orderId, state: "PENDING", dueAt: { lte: now } }, select: SELECT,
      });
      const claimed = await tx.orderSellerApproval.updateMany({
        /* tenant-scope: this order's own approval rows, named by its id; conditional, so a second pass finds nothing. */
        where: { orderId, state: "PENDING", dueAt: { lte: now } }, data: { state: "EXPIRED" },
      });
      if (claimed.count === 0) return;
      expired += claimed.count;
      for (const r of silent) {
        await audit(tx, { userId: null, tenantId: r.tenantId }, "orderSellerApproval.expire", "OrderSellerApproval", r.id, { before: { state: "PENDING" }, after: { state: "EXPIRED", dueAt: r.dueAt.toISOString() } });
      }
      const state = silent[0]?.order.state;
      if (state !== "PENDING_SELLER") return;
      const order = await cancelOrderAsSystem(tx, orderId, "SELLER_NO_ANSWER", now);
      cancelled++;
      const names = await namesFor(silent);
      const sponsor = await sponsorRecipient(tx, order);
      if (sponsor) {
        await tell(tx, sponsor, "order.sellerNoAnswer", order.id, {
          firstName: sponsor.firstName, orderRef: orderRef(order.id), sellerName: silent.map((r) => sellerOf(r, names).name).join(", "),
          orderUrl: appUrl(`/sponsor/orders/${order.id}`),
        });
      }
      for (const r of silent) {
        for (const s of await sellerRecipients(tx, r)) {
          await tell(tx, s, "sale.approvalExpired", r.id, { firstName: s.firstName, orderRef: orderRef(orderId), sponsorName: names.sponsor.get(r.sponsorId) ?? "The sponsor", approvalUrl: appUrl(approvalPath(s.portal, r.id)) });
        }
      }
    }).catch((error: unknown) => {
      failed++;
      logError(`[seller approvals] order ${orderId} failed, will retry next pass:`, error);
    });
  }

  /* The backstop: waiting on its sellers, with nothing left to wait for. */
  const stranded = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the worker's sweep across every tenant (or the named ones); each order is settled in its own books. */
    where: { state: "PENDING_SELLER", sellerApprovals: { some: {}, none: { state: "PENDING" } }, ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    select: { id: true }, orderBy: { createdAt: "asc" }, take: 500,
  });
  for (const { id: orderId } of stranded) {
    await prisma.$transaction(async (tx) => {
      if ((await lockOrder(tx, orderId)) !== "PENDING_SELLER") return;
      const answers = await tx.orderSellerApproval.findMany({
        /* tenant-scope: this order's own approval rows, named by its id. */
        where: { orderId }, select: SELECT,
      });
      if (!answers.length || answers.some((a) => a.state === "PENDING")) return;
      const names = await namesFor(answers);
      const declined = answers.find((a) => a.state === "DECLINED");
      const silent = answers.filter((a) => a.state === "EXPIRED");
      if (declined) {
        const order = await cancelOrderAsSystem(tx, orderId, "SELLER_DECLINED", now);
        cancelled++;
        const sponsor = await sponsorRecipient(tx, order);
        if (sponsor) await tell(tx, sponsor, "order.sellerDeclined", order.id, { firstName: sponsor.firstName, orderRef: orderRef(order.id), sellerName: sellerOf(declined, names).name, reason: declined.reason ?? "", orderUrl: appUrl(`/sponsor/orders/${order.id}`) });
        return;
      }
      if (silent.length) {
        const order = await cancelOrderAsSystem(tx, orderId, "SELLER_NO_ANSWER", now);
        cancelled++;
        const sponsor = await sponsorRecipient(tx, order);
        if (sponsor) await tell(tx, sponsor, "order.sellerNoAnswer", order.id, { firstName: sponsor.firstName, orderRef: orderRef(order.id), sellerName: silent.map((r) => sellerOf(r, names).name).join(", "), orderUrl: appUrl(`/sponsor/orders/${order.id}`) });
        return;
      }
      if (answers.every((a) => a.state === "ACCEPTED")) {
        await sellersAccepted(tx, orderId, answers.map((a) => sellerOf(a, names).name).join(", "), now);
        await audit(tx, { userId: null, tenantId: answers[0]!.tenantId }, "orderSellerApproval.settledBySweep", "MarketplaceOrder", orderId, { after: { approvals: answers.map((a) => a.id) } });
        movedOn++;
      }
    }).catch((error: unknown) => {
      failed++;
      logError(`[seller approvals] settling order ${orderId} failed, will retry next pass:`, error);
    });
  }
  return { expired, cancelled, failed, movedOn };
}

/* ── BTG's daily summary of orders approved automatically ─────────────── */

/** The worker sends the day's summary at the first pass from this UTC hour (13:00 UTC — the US morning), as for listings. */
export const ORDER_DIGEST_HOUR_UTC = 13;

/**
 * ONE email a day per BTG tenant to its admins: the orders approved
 * automatically (by policy — decidedBy "system") since the last summary, at
 * most the last 24 hours, each with a link — not one email per order.
 * Idempotent: the day's OrderApprovalDigest row is written with the email
 * (one per tenant per UTC date) and the email's key is the tenant, the date
 * and the admin, so a second pass that day, or a retried send, adds nothing.
 * A day with nothing approved sends nothing. `only` limits the pass to the
 * named BTG tenants; the worker passes none.
 */
export async function sendOrderApprovalDigests(now = new Date(), only?: readonly string[]) {
  const rows = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the worker's daily sweep across every tenant (or the named ones); each summary goes to the order's own books. */
    where: { decidedBy: "system", decidedAt: { gt: new Date(now.getTime() - DAY), lte: now }, ...(only ? { tenantId: { in: [...only] } } : {}) },
    select: { id: true, tenantId: true, sponsorId: true, totalCents: true, spendingLimitCents: true, decidedAt: true, state: true },
    orderBy: [{ decidedAt: "desc" }, { id: "asc" }],
  });
  const byBtg = new Map<string, typeof rows>();
  for (const r of rows) byBtg.set(r.tenantId, [...(byBtg.get(r.tenantId) ?? []), r]);
  const today = day(now);
  let tenants = 0;
  let orders = 0;
  let failed = 0;
  for (const [btg, list] of byBtg) {
    /* One tenant's failure leaves the others' summaries to go out; it is retried next hour (no row was written). */
    const sent = await prisma.$transaction(async (tx) => {
      const last = await tx.orderApprovalDigest.findFirst({
        /* tenant-scope: this BTG tenant's own summaries. */
        where: { tenantId: btg }, orderBy: { windowEnd: "desc" }, select: { day: true, windowEnd: true },
      });
      if (last?.day === today) return 0;
      const floor = new Date(now.getTime() - DAY);
      const start = last && last.windowEnd > floor ? last.windowEnd : floor;
      const fresh = list.filter((o) => o.decidedAt! > start);
      if (!fresh.length) return 0;
      const made = await tx.orderApprovalDigest.createMany({
        data: [{ tenantId: btg, day: today, windowStart: start, windowEnd: now, orders: fresh.length }], skipDuplicates: true,
      });
      if (made.count === 0) return 0;
      const sponsors = await tx.sponsor.findMany({
        /* tenant-scope: the sponsors of this BTG tenant's own orders. */
        where: { tenantId: btg, id: { in: [...new Set(fresh.map((o) => o.sponsorId))] } }, select: { id: true, name: true },
      });
      const name = new Map(sponsors.map((s) => [s.id, s.name]));
      const total = fresh.reduce((s, o) => s + o.totalCents, 0);
      const lines = fresh.map((o) => `• ${orderRef(o.id)} — ${name.get(o.sponsorId) ?? "Sponsor"} — ${usd(o.totalCents)}${o.spendingLimitCents !== null ? ` (limit ${usd(o.spendingLimitCents)})` : ""}${o.state === "CANCELLED" ? " (since cancelled)" : ""}\n  ${appUrl(`/admin/marketplace/orders/${o.id}`)}`);
      for (const u of await btgAdmins(tx, btg)) {
        await send(tx, btg, {
          template: "order.autoApprovedDigest", to: u.email, idempotencyKey: `order.autoApprovedDigest:${btg}:${today}:${u.id}`,
          data: { count: String(fresh.length), day: today, total: usd(total), orders: lines.join("\n"), consoleUrl: appUrl("/admin/marketplace") },
        });
      }
      return fresh.length;
    }).catch((error: unknown) => {
      failed++;
      logError(`[order digest] tenant ${btg} failed, will retry next hour:`, error);
      return 0;
    });
    if (sent) { tenants++; orders += sent; }
  }
  return { tenants, orders, failed };
}
