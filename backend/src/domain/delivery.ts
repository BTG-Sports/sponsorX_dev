/**
 * Sellers' orders and delivery — 2S4-BE-06, 2S4-BE-07 and 2S4-BE-08.
 *
 * 2S4-BE-06: "The team manager and the athlete (or the athlete alone) read
 * the order lines they sell: number, sponsor business, item, quantity, dates,
 * status, their own share only. Emailed when a sale is approved and paid. The
 * sponsor contact is visible once paid."
 * 2S4-BE-07: "Per order line: paid → In delivery automatically; the seller
 * marks it delivered with a note (proof optional); the sponsor confirms or
 * reports a problem, and silence for 24 HOURS confirms. Only confirmed lines
 * are payable (after the holding period). A problem holds that line's payout
 * until BTG confirms delivery or cancels and refunds."
 * 2S4-BE-08: "A daily job: reminds a seller the day after a line's last date
 * if it isn't marked delivered, and lists overdue lines for BTG; closes an
 * order automatically 30 days after its last line is confirmed, releasing the
 * reserve."
 *
 * THE ROW. An order line never changes (marketplace_order_immutable.sql), so
 * each contracted line gets an OrderLineDelivery, written in the approval's
 * own transaction (`openDeliveries`). It names who may read it — the sponsor,
 * the team in ITS tenant, the athlete whose item it is in THEIRS — which is
 * what the `orderDelivery` scope filters on. A seller is never given the
 * order: only the lines it sells, and its share read from its OWN ledger
 * entries (whereFor(ledgerEntry)), so the other party's share and BTG's
 * commission are never in reach.
 *
 * THE ORDER FOLLOWS ITS LINES. Paid → every line IN_DELIVERY. The first line
 * marked delivered moves a PAID order to IN_DELIVERY; the last line confirmed
 * (or refunded) moves it to FULFILLED, which starts the 30 days to CLOSED.
 * Every order move still goes through marketplace-order.ts's machine.
 *
 * MONEY. payouts.ts releases a payee's money line by line: only a CONFIRMED
 * line, past the holding period from its confirmation. A PROBLEM line's money
 * is therefore held while the problem is open — until it is confirmed, or
 * refunded through the order's own refund (the whole order when it is the
 * last live line, else that line's journals reversed — ledger.ts
 * `reverseOrder(…, lineId)`).
 *
 * 2S4-BE-11 (programme owner, 2026-10-02): "BTG only steps in when the two
 * sides can't settle it." A reported problem is a DeliveryIssue, and the line
 * stays PROBLEM (its money held) until the issue ends:
 *
 *   SELLER_TO_ANSWER  — 72 hours: DELIVER_AGAIN (a new date and a note),
 *                       REFUND (the whole line), or DISAGREE (a note, and an
 *                       optional photo or https link);
 *   SPONSOR_TO_ANSWER — 72 hours: ACCEPT settles it — deliver again (the line
 *                       goes back to IN_DELIVERY for the new date, and its
 *                       next mark restarts the sponsor's 24 hours), refund
 *                       (the line's own refund), or the disagreement accepted
 *                       (the line is CONFIRMED by the sponsor); REJECT (a
 *                       note) sends it to BTG;
 *   ESCALATED         — BTG's issues desk (resolveIssue: CONFIRM or REFUND),
 *                       reached ONLY by a rejection, or by either side not
 *                       answering in its 72 hours (the sweep). Why is stored.
 *   SETTLED | RESOLVED | CLOSED — settled between them; decided by BTG; or
 *                       ended by something else (the order cancelled, or an
 *                       overdue line marked delivered late).
 *
 * Partial refunds are out of scope: REFUND always refunds the whole line.
 *
 * OVERDUE (2S4-BE-08, extended by 2S4-BE-11): a line still unmarked reminds
 * its seller a day after its last date and again at 3 days; at 7 days it is
 * handed to BTG as an OVERDUE issue ("no delivery marked 7 days after <date>").
 * A redelivery's agreed date replaces the line's own last date for all three.
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor, type Scope } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { send, type EmailTemplate } from "../lib/email";
import { presignPrivateDownload, presignPrivateUpload, privateObjectSize, SENSITIVE_DOCUMENT_TTL_SECONDS } from "../lib/storage";
import { reverseOrder } from "./ledger";
import { moveOrderAsSystem, moveOrderIn } from "./marketplace-order";

type Tx = Prisma.TransactionClient;

export class DeliveryError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "DeliveryError";
    this.status = status;
  }
}

/* ── the rules ─────────────────────────────────────────────────────────── */

/** The sponsor's window to confirm or report a problem (programme owner, 2026-10-01). */
export const CONFIRM_WINDOW_HOURS = 24;
/** An order closes itself this many days after its last line is confirmed. */
export const AUTO_CLOSE_DAYS = 30;
/** A seller is reminded this many days after a line's last date… */
export const OVERDUE_AFTER_DAYS = 1;
/** …again at this many (2S4-BE-11)… */
export const SECOND_REMINDER_DAYS = 3;
/** …and the line goes to BTG at this many with nothing marked (2S4-BE-11). */
export const ESCALATE_OVERDUE_DAYS = 7;
/** Each side's window in a reported problem: the seller to answer, then the sponsor (2S4-BE-11). */
export const ANSWER_WINDOW_HOURS = 72;
/** How far ahead a redelivery date may be. */
export const REDELIVER_MAX_DAYS = 90;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DeliveryState = "UNPAID" | "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED";
/** Done with: nothing more happens to the line. */
const SETTLED = new Set<DeliveryState>(["CONFIRMED", "REFUNDED", "CANCELLED"]);
/** Orders whose sponsor has paid — the point the sponsor's contact appears. */
const PAID_STATES = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);

export type IssueKind = "PROBLEM" | "OVERDUE";
export type IssueStage = "SELLER_TO_ANSWER" | "SPONSOR_TO_ANSWER" | "ESCALATED" | "SETTLED" | "RESOLVED" | "CLOSED";
export type SellerAnswer = "DELIVER_AGAIN" | "REFUND" | "DISAGREE";
export type SponsorAnswer = "ACCEPT" | "REJECT";
export type EscalationReason = "SPONSOR_REJECTED" | "SELLER_NO_ANSWER" | "SPONSOR_NO_ANSWER" | "NOT_DELIVERED" | "REPORTED_TO_BTG";
export type IssueOutcome = "REDELIVER" | "REFUNDED" | "CONFIRMED" | "MARKED_DELIVERED" | "ORDER_ENDED";
/** An issue still being worked: one per line at most (DeliveryIssue_one_open_per_line). */
const OPEN_STAGES: IssueStage[] = ["SELLER_TO_ANSWER", "SPONSOR_TO_ANSWER", "ESCALATED"];

/** Proof photos (or a PDF), to the private bucket. */
export const PROOF_TYPES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const;
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

const orderRef = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;
const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The unit an item kind is sold in, for "2 sessions × $500". */
const UNIT: Record<string, string> = {
  SOCIAL_POST: "post", VIDEO: "video", APPEARANCE: "appearance", AUTOGRAPH: "session", CAMP: "session",
  SIGNAGE: "sign", TICKETS: "ticket", PACKAGE: "package",
};
export const unitOf = (kind: string | null | undefined) => (kind && UNIT[kind]) || "unit";

/** The days a line covers, as calendar dates: one, or its first and last. Pure. */
export function lineDates(startsOn: Date, endsOn: Date): string[] {
  const a = day(startsOn);
  const b = day(endsOn);
  return a === b ? [a] : [a, b];
}

/** When a seller is late: a line still in delivery whose last date is a day gone. Pure. */
export function isOverdue(d: { state: string; endsOn: Date }, now: Date, afterDays = OVERDUE_AFTER_DAYS): boolean {
  return d.state === "IN_DELIVERY" && d.endsOn.getTime() + afterDays * DAY <= now.getTime();
}

/** Whether the sponsor may still answer a delivered line. Pure. */
export function canAnswer(d: { state: string; confirmDueAt: Date | null }, now: Date): boolean {
  return d.state === "DELIVERED" && !!d.confirmDueAt && now < d.confirmDueAt;
}

/** The date a line is due by: the redelivery date agreed, else the line's own last date. Pure. */
export function lastDateOf(d: { redeliverOn: Date | null; line: { endsOn: Date } }): Date {
  return d.redeliverOn ?? d.line.endsOn;
}

/** Whether the seller may still answer a reported problem. Pure. */
export function sellerCanAnswer(i: { stage: string; sellerDueAt: Date | null } | null | undefined, now: Date): boolean {
  return !!i && i.stage === "SELLER_TO_ANSWER" && !!i.sellerDueAt && now < i.sellerDueAt;
}

/** Whether the sponsor may still accept or reject the seller's answer. Pure. */
export function sponsorCanAnswer(i: { stage: string; sponsorDueAt: Date | null } | null | undefined, now: Date): boolean {
  return !!i && i.stage === "SPONSOR_TO_ANSWER" && !!i.sponsorDueAt && now < i.sponsorDueAt;
}

/** Why an issue went to BTG, in the words everyone reads. Pure. */
export function escalationWords(reason: EscalationReason, lastDate?: Date): string {
  switch (reason) {
    case "SPONSOR_REJECTED": return "The sponsor rejected the seller's answer";
    case "SELLER_NO_ANSWER": return `The seller didn't answer within ${ANSWER_WINDOW_HOURS} hours`;
    case "SPONSOR_NO_ANSWER": return `The sponsor didn't accept or reject the seller's answer within ${ANSWER_WINDOW_HOURS} hours`;
    case "NOT_DELIVERED": return `No delivery marked ${ESCALATE_OVERDUE_DAYS} days after ${lastDate ? day(lastDate) : "the last date"}`;
    default: return "Reported before sellers answered problems themselves, so BTG decides";
  }
}

/** The seller's answer, in the sponsor's words. Pure. */
export function answerWords(answer: SellerAnswer, redeliverOn?: Date | null): string {
  if (answer === "DELIVER_AGAIN") return `deliver it again on ${redeliverOn ? day(redeliverOn) : "a new date"}`;
  if (answer === "REFUND") return "refund the line in full";
  return "disagree — they say it was delivered";
}

/** A line due on or before `cutoff` — its redelivery date if agreed, else its own last date. */
const dueBy = (cutoff: Date): Prisma.OrderLineDeliveryWhereInput => ({
  OR: [{ redeliverOn: null, line: { endsOn: { lte: cutoff } } }, { redeliverOn: { lte: cutoff } }],
});

/* ── who to tell ───────────────────────────────────────────────────────── */

type Party = { propertyId: string | null; propertyTenantId: string | null; athleteId: string | null; athleteTenantId: string | null };
type Recipient = { tenantId: string; email: string; firstName: string; portal: "athlete" | "property" };

/** A sold line's sellers: the team's manager(s) and the athlete — each in their own tenant. */
async function sellerRecipients(tx: Tx, d: Party): Promise<Recipient[]> {
  const out: Recipient[] = [];
  if (d.propertyId && d.propertyTenantId) {
    const managers = await tx.user.findMany({
      /* tenant-scope: the team's own managers, in the team's own tenant (recorded on the delivery row). */
      where: { tenantId: d.propertyTenantId, propertyId: d.propertyId, roles: { has: "PROPERTY_MGR" }, disabledAt: null },
      select: { email: true }, orderBy: { createdAt: "asc" },
    });
    const team = await tx.property.findFirst({
      /* tenant-scope: the team named on the delivery row, in its own tenant. */
      where: { tenantId: d.propertyTenantId, id: d.propertyId }, select: { name: true },
    });
    for (const m of managers) out.push({ tenantId: d.propertyTenantId, email: m.email, firstName: team?.name ?? "there", portal: "property" });
  }
  if (d.athleteId && d.athleteTenantId) {
    const athlete = await tx.athlete.findFirst({
      /* tenant-scope: the athlete named on the delivery row, in their own tenant. */
      where: { tenantId: d.athleteTenantId, id: d.athleteId }, select: { displayName: true, legalName: true, email: true },
    });
    const login = await tx.user.findFirst({
      /* tenant-scope: the athlete's own login, in their own tenant. */
      where: { tenantId: d.athleteTenantId, athleteId: d.athleteId, disabledAt: null }, select: { email: true },
    });
    const email = login?.email ?? athlete?.email;
    const name = athlete?.legalName || athlete?.displayName || "there";
    if (email) out.push({ tenantId: d.athleteTenantId, email, firstName: name.split(/\s+/)[0] ?? name, portal: "athlete" });
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.email.toLowerCase()) ? false : (seen.add(r.email.toLowerCase()), true)));
}

/** The sponsor who placed the order, else the billing contact they named. */
async function sponsorRecipient(tx: Tx, order: { tenantId: string; createdBy: string | null; billingEmail: string | null; billingName: string | null }) {
  const placer = order.createdBy
    ? await tx.user.findFirst({
        /* tenant-scope: the sponsor user recorded on the order, in the order's own tenant. */
        where: { tenantId: order.tenantId, id: order.createdBy }, select: { email: true },
      })
    : null;
  const email = placer?.email ?? order.billingEmail;
  return email ? { tenantId: order.tenantId, email, firstName: (order.billingName ?? "").split(/\s+/)[0] || "there" } : null;
}

/** BTG's admins in the order's books — who a reported problem goes to. */
async function btgAdmins(tx: Tx, tenantId: string) {
  return tx.user.findMany({
    /* tenant-scope: the BTG admins of the order's own books. */
    where: { tenantId, roles: { has: "BTG_ADMIN" }, disabledAt: null }, select: { email: true },
  });
}

async function tell(tx: Tx, to: { tenantId: string; email: string }, template: EmailTemplate, key: string, data: Record<string, string>) {
  await send(tx, to.tenantId, { template, to: to.email, idempotencyKey: `${template}:${key}:${to.email.toLowerCase()}`, data });
}

const salePath = (r: Recipient, lineId?: string) => `/${r.portal === "athlete" ? "athlete" : "property"}/sales${lineId ? `/${lineId}` : ""}`;

/* ── opening and following the order ───────────────────────────────────── */

/**
 * At contract time (marketplace-order.ts `contract`, inside the approval's
 * transaction): one delivery row per line, and each seller told of the sale.
 */
export async function openDeliveries(tx: Tx, orderId: string) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the approval just loaded through whereFor(marketplaceOrder, …). */
    where: { id: orderId },
    select: {
      id: true, tenantId: true, sponsorId: true,
      lines: { select: { id: true, title: true, quantity: true, propertyId: true, sellerAthleteId: true, inventoryItemId: true, startsOn: true }, orderBy: { startsOn: "asc" } },
    },
  });
  const items = await tx.inventoryItem.findMany({
    /* tenant-scope: the items this order's own lines name. */
    where: { id: { in: order.lines.map((l) => l.inventoryItemId) } }, select: { id: true, athleteId: true, athlete: { select: { tenantId: true } } },
  });
  const properties = await tx.property.findMany({
    /* tenant-scope: the properties this order's own lines name. */
    where: { id: { in: order.lines.map((l) => l.propertyId).filter((x): x is string => Boolean(x)) } }, select: { id: true, tenantId: true },
  });
  const sellerAthletes = await tx.athlete.findMany({
    /* tenant-scope: the independent sellers this order's own lines name. */
    where: { id: { in: order.lines.map((l) => l.sellerAthleteId).filter((x): x is string => Boolean(x)) } }, select: { id: true, tenantId: true },
  });
  const byItem = new Map(items.map((i) => [i.id, i]));
  const propertyTenant = new Map(properties.map((p) => [p.id, p.tenantId]));
  const athleteTenant = new Map(sellerAthletes.map((a) => [a.id, a.tenantId]));
  const rows = order.lines.map((l) => {
    const item = byItem.get(l.inventoryItemId);
    const athleteId = l.sellerAthleteId ?? item?.athleteId ?? null;
    return {
      tenantId: order.tenantId, orderId: order.id, lineId: l.id, sponsorId: order.sponsorId,
      propertyId: l.propertyId, propertyTenantId: l.propertyId ? propertyTenant.get(l.propertyId) ?? null : null,
      athleteId, athleteTenantId: athleteId ? (l.sellerAthleteId ? athleteTenant.get(athleteId) : item?.athlete?.tenantId) ?? null : null,
    };
  }).filter((r) => (r.propertyId && r.propertyTenantId) || (r.athleteId && r.athleteTenantId));
  await tx.orderLineDelivery.createMany({ data: rows, skipDuplicates: true });
  await notifySellers(tx, order.id, "sale.approved");
}

/** Each seller of the order, once per template, with only their own lines. */
async function notifySellers(tx: Tx, orderId: string, template: "sale.approved" | "sale.paid") {
  const rows = await tx.orderLineDelivery.findMany({
    /* tenant-scope: this order's own delivery rows, named by its id. */
    where: { orderId }, select: { lineId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, sponsorId: true, line: { select: { title: true, quantity: true, startsOn: true, endsOn: true } } },
  });
  if (!rows.length) return;
  const sponsor = await tx.sponsor.findFirst({
    /* tenant-scope: the sponsor recorded on this order's own delivery rows. */
    where: { id: rows[0]!.sponsorId }, select: { name: true },
  });
  const byRecipient = new Map<string, { r: Recipient; lines: string[]; firstLine: string }>();
  for (const d of rows) {
    for (const r of await sellerRecipients(tx, d)) {
      const k = r.email.toLowerCase();
      const entry = byRecipient.get(k) ?? { r, lines: [], firstLine: d.lineId };
      entry.lines.push(`${d.line.title} (×${d.line.quantity}) · ${lineDates(d.line.startsOn, d.line.endsOn).join(" to ")}`);
      byRecipient.set(k, entry);
    }
  }
  for (const { r, lines, firstLine } of byRecipient.values()) {
    await tell(tx, r, template, orderId, {
      firstName: r.firstName, orderRef: orderRef(orderId), sponsorName: sponsor?.name ?? "A sponsor",
      lines: lines.join("\n"), ordersUrl: appUrl(lines.length === 1 ? salePath(r, firstLine) : salePath(r)),
    });
  }
}

/**
 * The order moved (marketplace-order.ts `moveIn`, in its transaction): its
 * lines follow. PAID opens delivery and tells the sellers; CANCELLED and
 * REFUNDED end every open line (and close any open issue); FULFILLED by hand
 * (BTG closing it out) confirms what is left as BTG's — but never over a
 * reported problem, which the two sides settle or BTG decides (2S4-BE-11).
 */
export async function followOrder(tx: Tx, actor: AuditActor, orderId: string, to: string, now: Date) {
  /* tenant-scope (every call below): this order's own delivery rows, named by its id. */
  if (to === "PAID") {
    const opened = await tx.orderLineDelivery.updateMany({ where: { orderId, state: "UNPAID" }, data: { state: "IN_DELIVERY", paidAt: now } });
    if (opened.count) await notifySellers(tx, orderId, "sale.paid");
  }
  if (to === "CANCELLED") {
    await tx.orderLineDelivery.updateMany({ where: { orderId, state: { in: ["UNPAID", "IN_DELIVERY", "DELIVERED", "PROBLEM"] } }, data: { state: "CANCELLED" } });
  }
  if (to === "REFUNDED") {
    await tx.orderLineDelivery.updateMany({ where: { orderId, state: { notIn: ["REFUNDED", "CANCELLED"] } }, data: { state: "REFUNDED" } });
  }
  if (to === "CANCELLED" || to === "REFUNDED") {
    /* 2S4-BE-11 — an issue still open on the order ends with it. (An issue
       settled or decided as part of this refund was closed first, by its caller.) */
    await tx.deliveryIssue.updateMany({
      where: { orderId, stage: { in: OPEN_STAGES } }, data: { stage: "CLOSED", outcome: "ORDER_ENDED", closedAt: now, closedBy: actor.userId ?? "system" },
    });
  }
  if (to === "FULFILLED") {
    const problem = await tx.orderLineDelivery.count({
      /* tenant-scope: this order's own delivery rows, named by its id. */
      where: { orderId, state: "PROBLEM" },
    });
    if (problem) {
      throw new DeliveryError("A sponsor reported a problem with a line on this order that isn't settled yet — the seller and the sponsor settle it between them, or BTG decides it on the Delivery issues desk.");
    }
    /* Fulfilled by hand only once every line is settled — the seller marked it
       delivered and the sponsor's 24 hours are over. Never over a line the
       seller hasn't marked, or one the sponsor can still answer (2S4-BE-07). */
    const open = await tx.orderLineDelivery.count({
      /* tenant-scope: this order's own delivery rows, named by its id. */
      where: { orderId, OR: [{ state: { in: ["UNPAID", "IN_DELIVERY"] } }, { state: "DELIVERED", confirmDueAt: { gt: now } }] },
    });
    if (open) throw new DeliveryError("A line on this order isn't settled yet — the seller marks it delivered, then the sponsor has 24 hours to confirm or report a problem.");
    /* A delivered line whose 24 hours are over is confirmed by silence — the sweep would do the same. */
    await tx.orderLineDelivery.updateMany({
      where: { orderId, state: "DELIVERED", confirmDueAt: { lte: now } },
      data: { state: "CONFIRMED", confirmedAt: now, confirmedBy: "system", confirmedHow: "SILENCE" },
    });
  }
}

/** Every line settled → the order is delivered (2S4-BE-07: "the order is delivered when all its lines are"). */
async function maybeFulfil(tx: Tx, orderId: string, now: Date) {
  const rows = await tx.orderLineDelivery.findMany({
    /* tenant-scope: this order's own delivery rows, named by its id. */
    where: { orderId }, select: { state: true },
  });
  if (!rows.length || rows.some((r) => !SETTLED.has(r.state as DeliveryState)) || !rows.some((r) => r.state === "CONFIRMED")) return;
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order named by its own delivery rows. */
    where: { id: orderId }, select: { state: true },
  });
  if (order.state === "PAID") await moveOrderAsSystem(tx, orderId, "IN_DELIVERY", now);
  if (order.state === "PAID" || order.state === "IN_DELIVERY") await moveOrderAsSystem(tx, orderId, "FULFILLED", now);
}

/* ── the seller's side — 2S4-BE-06, 2S4-BE-07 ──────────────────────────── */

const ISSUE_SELECT = {
  id: true, kind: true, stage: true, openedAt: true, problemNote: true,
  markedAt: true, markedByName: true, markedNote: true, markedProofKey: true, markedProofLink: true,
  sellerDueAt: true, sellerAnswer: true, sellerAnsweredAt: true, sellerAnsweredByName: true, sellerNote: true, redeliverOn: true,
  sellerProofKey: true, sellerProofLink: true,
  sponsorDueAt: true, sponsorAnswer: true, sponsorAnsweredAt: true, sponsorNote: true,
  escalatedAt: true, escalationReason: true, escalationNote: true, outcome: true, closedAt: true, closingNote: true,
} as const;
type IssueRow = Prisma.DeliveryIssueGetPayload<{ select: typeof ISSUE_SELECT }>;

const SALE_SELECT = {
  id: true, tenantId: true, orderId: true, lineId: true, sponsorId: true, propertyId: true, athleteId: true, state: true,
  paidAt: true, deliveredAt: true, deliveredByName: true, note: true, proofKey: true, proofLink: true, confirmDueAt: true,
  confirmedAt: true, confirmedHow: true, problemAt: true, problemNote: true, resolvedAt: true, resolution: true, resolutionNote: true,
  remindedAt: true, secondRemindedAt: true, overdueEscalatedAt: true, redeliverOn: true, createdAt: true,
  /* 2S4-BE-11 — the line's problems and how each went, oldest first. */
  issues: { select: ISSUE_SELECT, orderBy: { openedAt: "asc" } },
  line: {
    select: {
      title: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true, lineTotalCents: true, inventoryItemId: true,
      order: { select: { id: true, state: true, createdAt: true, contractedAt: true, billingName: true, billingEmail: true } },
    },
  },
} as const;
type SaleRow = Prisma.OrderLineDeliveryGetPayload<{ select: typeof SALE_SELECT }>;

/** A seller's scope — the team (own-property) or the athlete (own). Anyone else has their own reads. */
function sellerScope(actor: Actor, action: "read" | "write"): Scope {
  const scope = assertAllowed(actor, "orderDelivery", action);
  if (scope === "own-property" && actor.propertyId) return scope;
  if (scope === "own" && actor.athleteId) return scope;
  throw new ForbiddenError("orderDelivery", action);
}

const confirmedByWord = (how: string | null) => (how === "SILENCE" ? "NO_ANSWER" : how === "BTG" ? "BTG" : how === "SPONSOR" ? "SPONSOR" : null);

/** Names for the rows: sponsors, teams, athletes, item kinds. */
async function namesFor(rows: SaleRow[]) {
  const ids = (f: (r: SaleRow) => string | null) => [...new Set(rows.map(f).filter((x): x is string => Boolean(x)))];
  const [sponsors, properties, athletes, items, contacts] = await Promise.all([
    prisma.sponsor.findMany({
      /* tenant-scope: the sponsors named on delivery rows the caller loaded through whereFor(orderDelivery). */
      where: { id: { in: ids((r) => r.sponsorId) } }, select: { id: true, name: true },
    }),
    prisma.property.findMany({
      /* tenant-scope: the teams named on delivery rows the caller loaded through whereFor(orderDelivery). */
      where: { id: { in: ids((r) => r.propertyId) } }, select: { id: true, name: true },
    }),
    prisma.athlete.findMany({
      /* tenant-scope: the athletes named on delivery rows the caller loaded through whereFor(orderDelivery). */
      where: { id: { in: ids((r) => r.athleteId) } }, select: { id: true, displayName: true, legalName: true },
    }),
    prisma.inventoryItem.findMany({
      /* tenant-scope: the items named by the lines of delivery rows the caller loaded through whereFor(orderDelivery). */
      where: { id: { in: ids((r) => r.line.inventoryItemId) } }, select: { id: true, kind: true },
    }),
    prisma.sponsorContact.findMany({
      /* tenant-scope: the primary contacts of sponsors named on delivery rows the caller loaded through whereFor(orderDelivery). */
      where: { sponsorId: { in: ids((r) => r.sponsorId) }, isPrimary: true }, select: { sponsorId: true, name: true, email: true, phone: true },
    }),
  ]);
  return {
    sponsor: new Map(sponsors.map((s) => [s.id, s.name])),
    team: new Map(properties.map((p) => [p.id, p.name])),
    athlete: new Map(athletes.map((a) => [a.id, a.legalName || a.displayName])),
    kind: new Map(items.map((i) => [i.id, i.kind])),
    contact: new Map(contacts.map((c) => [c.sponsorId, c])),
  };
}

/* ── the exchange — 2S4-BE-11 ──────────────────────────────────────────── */

/** The issue a line is in now — the open one, else its most recent. */
function currentIssue(issues: IssueRow[]): IssueRow | null {
  return issues.find((i) => OPEN_STAGES.includes(i.stage as IssueStage)) ?? issues[issues.length - 1] ?? null;
}

const outcomeBy = (stage: string) => (stage === "RESOLVED" ? "BTG" : stage === "SETTLED" ? "SELLER_AND_SPONSOR" : "SYSTEM");

/** One issue as every reader sees it: the problem, each side's answer and deadline, the escalation, the outcome. */
function issueSummary(i: IssueRow, now: Date) {
  return {
    id: i.id,
    kind: i.kind as IssueKind,
    stage: i.stage as IssueStage,
    open: OPEN_STAGES.includes(i.stage as IssueStage),
    problem: { text: i.problemNote, at: i.openedAt },
    sellerDueAt: i.sellerDueAt,
    sellerCanAnswer: sellerCanAnswer(i, now),
    sellerAnswer: i.sellerAnswer
      ? {
          answer: i.sellerAnswer as SellerAnswer, words: answerWords(i.sellerAnswer as SellerAnswer, i.redeliverOn),
          note: i.sellerNote, newDate: i.redeliverOn ? day(i.redeliverOn) : null, by: i.sellerAnsweredByName, at: i.sellerAnsweredAt,
          proof: { photo: Boolean(i.sellerProofKey), link: i.sellerProofLink },
        }
      : null,
    sponsorDueAt: i.sponsorDueAt,
    sponsorCanAnswer: sponsorCanAnswer(i, now),
    sponsorAnswer: i.sponsorAnswer ? { decision: i.sponsorAnswer as SponsorAnswer, note: i.sponsorNote, at: i.sponsorAnsweredAt } : null,
    escalation: i.escalatedAt ? { at: i.escalatedAt, reason: i.escalationReason as EscalationReason, text: i.escalationNote ?? "" } : null,
    outcome: i.outcome ? { outcome: i.outcome as IssueOutcome, at: i.closedAt, by: outcomeBy(i.stage), note: i.closingNote } : null,
  };
}

export type TimelineKind =
  | "PAID" | "MARKED_DELIVERED" | "PROBLEM_REPORTED" | "SELLER_ANSWERED" | "SPONSOR_ACCEPTED" | "SPONSOR_REJECTED"
  | "ESCALATED" | "SETTLED" | "BTG_DECIDED" | "CLOSED" | "REMINDED" | "CONFIRMED";
export type TimelineItem = {
  at: Date;
  kind: TimelineKind;
  by: "SELLER" | "SPONSOR" | "BTG" | "SYSTEM";
  name: string | null;
  text: string;
  note: string | null;
  /** The issue this step belongs to — the key for its photo (GET /deliveries/{id}/proof?issue=…&photo=…). */
  issueId: string | null;
  answer: SellerAnswer | SponsorAnswer | null;
  newDate: string | null;
  reason: EscalationReason | null;
  outcome: IssueOutcome | null;
  proof: { photo: boolean; link: string | null; photoOf: "marked" | "answer" | "current" } | null;
};

const SETTLED_WORDS: Record<string, string> = {
  REDELIVER: "Settled between them — the seller delivers again",
  REFUNDED: "Settled between them — the line is refunded in full",
  CONFIRMED: "Settled between them — the sponsor accepted it was delivered",
};

/**
 * The full exchange, oldest first — the same steps for the seller, the
 * buying sponsor and BTG: paid, each mark, each problem, each side's answer,
 * the escalation and how it ended, reminders, confirmation. Never money.
 */
function timelineOf(r: SaleRow, who: { sponsor: string; seller: string }): TimelineItem[] {
  const out: TimelineItem[] = [];
  const item = (x: Partial<TimelineItem> & Pick<TimelineItem, "at" | "kind" | "by" | "text">): TimelineItem => ({
    name: null, note: null, issueId: null, answer: null, newDate: null, reason: null, outcome: null, proof: null, ...x,
  });
  if (r.paidAt) out.push(item({ at: r.paidAt, kind: "PAID", by: "SYSTEM", text: "Paid · confirmed by the payment provider" }));
  const marks = new Set<number>();
  for (const i of r.issues) {
    if (i.kind === "PROBLEM") {
      if (i.markedAt) {
        marks.add(i.markedAt.getTime());
        out.push(item({
          at: i.markedAt, kind: "MARKED_DELIVERED", by: "SELLER", name: i.markedByName, text: `Marked delivered by ${i.markedByName ?? who.seller}`,
          note: i.markedNote, issueId: i.id, proof: i.markedProofKey || i.markedProofLink ? { photo: Boolean(i.markedProofKey), link: i.markedProofLink, photoOf: "marked" } : null,
        }));
      }
      out.push(item({ at: i.openedAt, kind: "PROBLEM_REPORTED", by: "SPONSOR", name: who.sponsor, text: `Problem reported by ${who.sponsor} · payout put on hold`, note: i.problemNote, issueId: i.id }));
      if (i.sellerAnswer && i.sellerAnsweredAt) {
        out.push(item({
          at: i.sellerAnsweredAt, kind: "SELLER_ANSWERED", by: "SELLER", name: i.sellerAnsweredByName,
          text: `${i.sellerAnsweredByName ?? who.seller} answered: ${answerWords(i.sellerAnswer as SellerAnswer, i.redeliverOn)}`,
          note: i.sellerNote, issueId: i.id, answer: i.sellerAnswer as SellerAnswer, newDate: i.redeliverOn ? day(i.redeliverOn) : null,
          proof: i.sellerProofKey || i.sellerProofLink ? { photo: Boolean(i.sellerProofKey), link: i.sellerProofLink, photoOf: "answer" } : null,
        }));
      }
      if (i.sponsorAnswer && i.sponsorAnsweredAt) {
        const accepted = i.sponsorAnswer === "ACCEPT";
        out.push(item({
          at: i.sponsorAnsweredAt, kind: accepted ? "SPONSOR_ACCEPTED" : "SPONSOR_REJECTED", by: "SPONSOR", name: who.sponsor,
          text: `${who.sponsor} ${accepted ? "accepted" : "rejected"} the answer`, note: i.sponsorNote, issueId: i.id, answer: i.sponsorAnswer as SponsorAnswer,
        }));
      }
    }
    if (i.escalatedAt) {
      out.push(item({
        at: i.escalatedAt, kind: "ESCALATED", by: "SYSTEM", text: `Sent to BTG · ${i.escalationNote ?? ""}`.trim(), issueId: i.id, reason: i.escalationReason as EscalationReason,
      }));
    }
    if (i.closedAt && i.outcome) {
      const outcome = i.outcome as IssueOutcome;
      if (i.stage === "RESOLVED") {
        out.push(item({
          at: i.closedAt, kind: "BTG_DECIDED", by: "BTG", text: outcome === "REFUNDED" ? "Cancelled and refunded by BTG" : "Delivery confirmed by BTG",
          note: i.closingNote, issueId: i.id, outcome,
        }));
      } else if (i.stage === "SETTLED") {
        out.push(item({ at: i.closedAt, kind: "SETTLED", by: "SYSTEM", text: SETTLED_WORDS[outcome] ?? "Settled between them", issueId: i.id, outcome }));
      } else {
        out.push(item({
          at: i.closedAt, kind: "CLOSED", by: "SYSTEM", issueId: i.id, outcome,
          text: outcome === "MARKED_DELIVERED" ? "Marked delivered late · taken off BTG's desk" : "Closed · the order was cancelled or refunded",
        }));
      }
    }
  }
  if (r.deliveredAt && !marks.has(r.deliveredAt.getTime())) {
    out.push(item({
      at: r.deliveredAt, kind: "MARKED_DELIVERED", by: "SELLER", name: r.deliveredByName, text: `Marked delivered by ${r.deliveredByName ?? who.seller}`,
      note: r.note, proof: r.proofKey || r.proofLink ? { photo: Boolean(r.proofKey), link: r.proofLink, photoOf: "current" } : null,
    }));
  }
  if (r.secondRemindedAt) out.push(item({ at: r.secondRemindedAt, kind: "REMINDED", by: "SYSTEM", text: "Second reminder sent to the seller" }));
  if (r.remindedAt) out.push(item({ at: r.remindedAt, kind: "REMINDED", by: "SYSTEM", text: "Reminder sent to the seller" }));
  /* A confirmation an issue's own ending already shows isn't repeated. */
  const ended = new Set(r.issues.map((i) => i.closedAt?.getTime()).filter((x): x is number => x !== undefined));
  if (r.state === "CONFIRMED" && r.confirmedAt && !ended.has(r.confirmedAt.getTime())) {
    out.push(item({
      at: r.confirmedAt, kind: "CONFIRMED", by: r.confirmedHow === "SPONSOR" ? "SPONSOR" : r.confirmedHow === "BTG" ? "BTG" : "SYSTEM",
      name: r.confirmedHow === "SPONSOR" ? who.sponsor : null,
      text: r.confirmedHow === "SILENCE" ? `Counted as confirmed — no answer within ${CONFIRM_WINDOW_HOURS} hours` : r.confirmedHow === "BTG" ? "Confirmed by BTG" : `Confirmed by ${who.sponsor}`,
    }));
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const sellerNameOf = (r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>) =>
  (r.athleteId ? names.athlete.get(r.athleteId) : null) ?? (r.propertyId ? names.team.get(r.propertyId) : null) ?? "The seller";
const whoOf = (r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>) => ({
  sponsor: r.line.order.billingName ?? names.sponsor.get(r.sponsorId) ?? "the sponsor", seller: sellerNameOf(r, names),
});

/** The caller's own share of each line — from its OWN ledger entries, never anyone else's. */
async function sharesFor(actor: Actor, lineIds: string[]) {
  if (!lineIds.length) return new Map<string, number>();
  const entries = await prisma.ledgerEntry.findMany({
    where: { ...whereFor(actor, "ledgerEntry", "read"), lineId: { in: lineIds }, entryType: "BOOKING" },
    select: { lineId: true, creditCents: true },
  });
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.lineId!, (out.get(e.lineId!) ?? 0) + e.creditCents);
  return out;
}

function saleView(r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>, shareCents: number, now: Date) {
  const order = r.line.order;
  const paid = PAID_STATES.has(order.state);
  const contact = names.contact.get(r.sponsorId);
  const team = r.propertyId ? names.team.get(r.propertyId) ?? null : null;
  const athlete = r.athleteId ? names.athlete.get(r.athleteId) ?? null : null;
  const issue = currentIssue(r.issues);
  return {
    id: r.lineId,
    orderId: order.id,
    ref: orderRef(order.id),
    state: r.state as DeliveryState,
    orderState: order.state,
    sponsor: {
      name: names.sponsor.get(r.sponsorId) ?? "Sponsor",
      /* 2S4-BE-06 — "the sponsor contact appears only once paid". */
      contact: paid
        ? { name: order.billingName ?? contact?.name ?? "", email: order.billingEmail ?? contact?.email ?? "", phone: contact?.phone ?? null }
        : null,
    },
    line: {
      title: r.line.title, quantity: r.line.quantity, unit: unitOf(names.kind.get(r.line.inventoryItemId)), unitPriceCents: r.line.unitPriceCents,
      startsOn: r.line.startsOn, endsOn: r.line.endsOn, dates: lineDates(r.line.startsOn, r.line.endsOn),
      soldBy: team ?? athlete ?? "",
      athlete,
    },
    /* The caller's own share of this line — nobody else's. */
    shareCents,
    placedAt: order.createdAt,
    paidAt: r.paidAt,
    markedAt: r.deliveredAt,
    markedBy: r.deliveredByName,
    deliveryNote: r.note,
    proof: { photo: Boolean(r.proofKey), link: r.proofLink },
    confirmDueAt: r.confirmDueAt,
    confirmedAt: r.confirmedAt,
    confirmedBy: confirmedByWord(r.confirmedHow),
    problem: r.problemAt && r.problemNote ? { reportedAt: r.problemAt, text: r.problemNote } : null,
    resolution: r.resolution ? { decision: r.resolution, note: r.resolutionNote, at: r.resolvedAt } : null,
    /* 2S4-BE-11 — the date it is due by now (a redelivery's, else the line's own), and the problem exchange. */
    lastDate: day(lastDateOf(r)),
    redeliverOn: r.redeliverOn ? day(r.redeliverOn) : null,
    overdue: isOverdue({ state: r.state, endsOn: lastDateOf(r) }, now),
    canMarkDelivered: r.state === "IN_DELIVERY",
    issue: issue ? issueSummary(issue, now) : null,
    /* The seller's move: answer the sponsor's problem within the 72 hours. */
    canAnswerProblem: r.state === "PROBLEM" && sellerCanAnswer(issue, now),
  };
}

/** 2S4-BE-06 — the seller's Orders page: every line it sells, newest first, its own share only. */
export async function mySales(actor: Actor, now = new Date()) {
  sellerScope(actor, "read");
  const rows = await prisma.orderLineDelivery.findMany({
    where: whereFor(actor, "orderDelivery", "read"), select: SALE_SELECT, orderBy: { createdAt: "desc" }, take: 200,
  });
  const [names, shares] = await Promise.all([namesFor(rows), sharesFor(actor, rows.map((r) => r.lineId))]);
  return { sales: rows.map((r) => saleView(r, names, shares.get(r.lineId) ?? 0, now)) };
}

export async function mySale(actor: Actor, lineId: string, now = new Date()) {
  sellerScope(actor, "read");
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "read"), lineId }, select: SALE_SELECT });
  if (!row) throw new ForbiddenError("orderDelivery", "read");
  const [names, shares] = await Promise.all([namesFor([row]), sharesFor(actor, [row.lineId])]);
  return { ...saleView(row, names, shares.get(row.lineId) ?? 0, now), timeline: timelineOf(row, whoOf(row, names)) };
}

/** The key a line's proof is uploaded under — built here, never taken from the caller. */
const proofPrefix = (tenantId: string, lineId: string) => `t/${tenantId}/delivery/${lineId}/`;

/** A presigned PUT for the optional proof photo, straight to the private bucket. */
export async function requestProofUpload(actor: Actor, lineId: string, input: { contentType: keyof typeof PROOF_TYPES; bytes: number }) {
  sellerScope(actor, "write");
  if (!(input.contentType in PROOF_TYPES)) throw new DeliveryError("A photo (JPEG or PNG) or a PDF.", 422);
  if (input.bytes > PROOF_MAX_BYTES) throw new DeliveryError("Up to 10 MB.", 422);
  const row = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId },
    select: { id: true, tenantId: true, lineId: true, state: true, issues: { where: { stage: "SELLER_TO_ANSWER" }, select: { id: true } } },
  });
  if (!row) throw new ForbiddenError("orderDelivery", "write");
  /* When marking it delivered — or (2S4-BE-11) with an answer to a problem the sponsor reported. */
  const answering = row.state === "PROBLEM" && row.issues.length > 0;
  if (row.state !== "IN_DELIVERY" && !answering) throw new DeliveryError("Proof is added when you mark the line delivered, or when you answer a problem.");
  const key = `${proofPrefix(row.tenantId, row.lineId)}${randomUUID()}.${PROOF_TYPES[input.contentType]}`;
  const uploadUrl = await presignPrivateUpload(actor, key, input.contentType, { entity: "OrderLineDelivery", entityId: row.id });
  return { uploadUrl, key, contentType: input.contentType };
}

export type MarkDeliveredInput = { note: string; proofKey?: string | null; proofLink?: string | null };

/** The optional photo (uploaded under this line's own key, and arrived) and https link. */
async function checkProof(row: { tenantId: string; lineId: string }, input: { proofKey?: string | null; proofLink?: string | null }, without: string) {
  const proofKey = input.proofKey?.trim() || null;
  if (proofKey) {
    if (!proofKey.startsWith(proofPrefix(row.tenantId, row.lineId)) || proofKey.includes("..") || proofKey.includes("//")) {
      throw new DeliveryError("That photo wasn't uploaded for this line.", 422);
    }
    if ((await privateObjectSize(proofKey)) === null) throw new DeliveryError(`The photo hasn't arrived in storage yet — upload it again, or ${without} without it.`, 422);
  }
  const proofLink = input.proofLink?.trim() || null;
  if (proofLink && !/^https:\/\//i.test(proofLink)) throw new DeliveryError("A link starts with https://", 422);
  return { proofKey, proofLink };
}

/** 2S4-BE-07 — the seller marks its own line delivered, with a note; the sponsor's 24 hours start. */
export async function markDelivered(actor: Actor, lineId: string, input: MarkDeliveredInput, now = new Date()) {
  sellerScope(actor, "write");
  const note = input.note?.trim() ?? "";
  if (!note) throw new DeliveryError("Say what was delivered — the sponsor reads this note.", 422);
  const found = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: { id: true, tenantId: true, lineId: true },
  });
  if (!found) throw new ForbiddenError("orderDelivery", "write");
  const { proofKey, proofLink } = await checkProof(found, input, "mark delivered");

  const byName = await markerName(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.orderLineDelivery.findFirst({
      where: { ...whereFor(actor, "orderDelivery", "write"), lineId },
      select: {
        id: true, orderId: true, state: true,
        line: { select: { title: true, order: { select: { tenantId: true, state: true, createdBy: true, billingEmail: true, billingName: true } } } },
      },
    });
    if (!row) throw new ForbiddenError("orderDelivery", "write");
    if (row.state !== "IN_DELIVERY") {
      throw new DeliveryError(row.state === "UNPAID" ? "You can mark it delivered once the sponsor has paid." : `This line is ${row.state.toLowerCase().replace("_", " ")} — it can't be marked delivered now.`);
    }
    const confirmDueAt = new Date(now.getTime() + CONFIRM_WINDOW_HOURS * HOUR);
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row just loaded through whereFor(orderDelivery, write). */
      where: { id: row.id },
      data: { state: "DELIVERED", deliveredAt: now, deliveredBy: actor.userId, deliveredByName: byName, note: note.slice(0, 2000), proofKey, proofLink, confirmDueAt },
      select: { id: true },
    });
    /* The order follows its first delivered line. */
    if (row.line.order.state === "PAID") await moveOrderAsSystem(tx, row.orderId, "IN_DELIVERY", now);
    /* 2S4-BE-11 — marked late, after it went to BTG for being overdue: it
       comes off BTG's desk, and the sponsor's 24 hours decide it as usual. */
    const late = await tx.deliveryIssue.updateMany({
      /* tenant-scope: the issues of the row just loaded through whereFor(orderDelivery, write). */
      where: { deliveryId: row.id, kind: "OVERDUE", stage: "ESCALATED" },
      data: { stage: "CLOSED", outcome: "MARKED_DELIVERED", closedAt: now, closedBy: actor.userId },
    });
    await audit(tx, actor, "orderDelivery.markDelivered", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: "IN_DELIVERY" },
      after: { lineId, state: "DELIVERED", confirmDueAt: confirmDueAt.toISOString(), proof: Boolean(proofKey || proofLink), ...(late.count ? { overdueIssueClosed: true } : {}) },
    });
    const sponsor = await sponsorRecipient(tx, row.line.order);
    if (sponsor) {
      /* Keyed by the mark itself: a redelivery's mark is a new email (2S4-BE-11). */
      await tell(tx, sponsor, "delivery.marked", `${lineId}:${now.getTime()}`, {
        firstName: sponsor.firstName, sellerName: byName, title: row.line.title, orderRef: orderRef(row.orderId), note: note.slice(0, 500),
        confirmBy: utc(confirmDueAt), orderUrl: appUrl(`/sponsor/orders/${row.orderId}`),
      });
    }
    return { lineId, state: "DELIVERED" as const, confirmDueAt };
  });
}

/** Who marked it, in the words the sponsor reads: the athlete's name, or the team's. */
async function markerName(actor: Actor): Promise<string> {
  if (actor.athleteId) {
    const a = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.athleteId }, select: { legalName: true, displayName: true } });
    if (a) return a.legalName || a.displayName;
  }
  if (actor.propertyId) {
    const p = await prisma.property.findFirst({ where: { tenantId: actor.tenantId, id: actor.propertyId }, select: { name: true } });
    if (p) return p.name;
  }
  return "The seller";
}

/* ── the sponsor's side — 2S4-BE-07 ────────────────────────────────────── */

/** An order's lines and how each delivery stands — the sponsor's order page (and BTG's). No shares. */
export async function orderDeliveries(actor: Actor, orderId: string, now = new Date()) {
  assertAllowed(actor, "orderDelivery", "read");
  const rows = await prisma.orderLineDelivery.findMany({
    where: { ...whereFor(actor, "orderDelivery", "read"), orderId }, select: SALE_SELECT, orderBy: { createdAt: "asc" },
  });
  /* An order the caller can't see is refused, never answered empty: the
     sponsor and BTG through the order's own scope; a seller only when it
     sells one of the lines. */
  if (!rows.length) {
    const order = can(actor, "marketplaceOrder", "read")
      ? await prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), id: orderId }, select: { id: true } })
      : null;
    if (!order) throw new ForbiddenError("orderDelivery", "read");
  }
  const names = await namesFor(rows);
  return {
    orderId,
    confirmWindowHours: CONFIRM_WINDOW_HOURS,
    answerWindowHours: ANSWER_WINDOW_HOURS,
    lines: rows.map((r) => ({
      lineId: r.lineId,
      title: r.line.title,
      state: r.state as DeliveryState,
      seller: (r.propertyId ? names.team.get(r.propertyId) : null) ?? (r.athleteId ? names.athlete.get(r.athleteId) : null) ?? "The seller",
      lastDate: day(lastDateOf(r)),
      redeliverOn: r.redeliverOn ? day(r.redeliverOn) : null,
      markedAt: r.deliveredAt,
      markedBy: r.deliveredByName,
      note: r.note,
      proof: { photo: Boolean(r.proofKey), link: r.proofLink },
      confirmDueAt: r.confirmDueAt,
      confirmedAt: r.confirmedAt,
      confirmedBy: confirmedByWord(r.confirmedHow),
      problem: r.problemAt && r.problemNote ? { reportedAt: r.problemAt, text: r.problemNote } : null,
      resolution: r.resolution ? { decision: r.resolution, note: r.resolutionNote, at: r.resolvedAt } : null,
      canAnswer: canAnswer(r, now),
      /* 2S4-BE-11 — the problem exchange: where it stands, and the whole of it. */
      issue: (() => { const i = currentIssue(r.issues); return i ? issueSummary(i, now) : null; })(),
      /* The sponsor's move: accept or reject the seller's answer within the 72 hours. */
      canAnswerSellerReply: r.state === "PROBLEM" && sponsorCanAnswer(currentIssue(r.issues), now),
      timeline: timelineOf(r, whoOf(r, names)),
    })),
  };
}

/**
 * 2S4-BE-11 — one line's whole exchange, for any of its readers: the seller
 * (own-property / own), the buying sponsor (own-sponsor) and BTG (own-tenant).
 * Every issue the line has had, each side's answer, the escalation and how
 * it ended — never anyone's share.
 */
export async function deliveryExchange(actor: Actor, lineId: string, now = new Date()) {
  assertAllowed(actor, "orderDelivery", "read");
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "read"), lineId }, select: SALE_SELECT });
  if (!row) throw new ForbiddenError("orderDelivery", "read");
  const names = await namesFor([row]);
  const issue = currentIssue(row.issues);
  return {
    lineId: row.lineId,
    orderId: row.orderId,
    orderRef: orderRef(row.orderId),
    title: row.line.title,
    state: row.state as DeliveryState,
    seller: sellerNameOf(row, names),
    sponsor: names.sponsor.get(row.sponsorId) ?? "Sponsor",
    lastDate: day(lastDateOf(row)),
    redeliverOn: row.redeliverOn ? day(row.redeliverOn) : null,
    answerWindowHours: ANSWER_WINDOW_HOURS,
    issue: issue ? issueSummary(issue, now) : null,
    issues: row.issues.map((i) => issueSummary(i, now)),
    timeline: timelineOf(row, whoOf(row, names)),
  };
}

/** A delivery row as the exchange needs it: who to tell, what was marked, what the line was. */
const EXCHANGE_ROW = {
  id: true, tenantId: true, orderId: true, lineId: true, state: true, sponsorId: true,
  propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true,
  deliveredAt: true, deliveredByName: true, note: true, proofKey: true, proofLink: true, confirmDueAt: true, redeliverOn: true,
  line: { select: { title: true, inventoryItemId: true, startsOn: true, endsOn: true, order: { select: { tenantId: true, createdBy: true, billingEmail: true, billingName: true } } } },
} as const;
type ExchangeRow = Prisma.OrderLineDeliveryGetPayload<{ select: typeof EXCHANGE_ROW }>;

/** The buying sponsor's own line, for its answer. */
async function sponsorLine(tx: Tx, actor: Actor, lineId: string) {
  const scope = assertAllowed(actor, "orderDelivery", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("orderDelivery", "write");
  const row = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: EXCHANGE_ROW });
  if (!row) throw new ForbiddenError("orderDelivery", "write");
  return row;
}

/** The line's open issue, if any (at most one — DeliveryIssue_one_open_per_line). */
async function openIssue(tx: Tx, deliveryId: string) {
  return tx.deliveryIssue.findFirst({
    /* tenant-scope: the issues of a delivery row the caller loaded through whereFor(orderDelivery) (or the sweep found by id). */
    where: { deliveryId, stage: { in: OPEN_STAGES } },
    select: { ...ISSUE_SELECT, tenantId: true, deliveryId: true },
  });
}

/** The sponsor's business name, from the order's own books. */
async function sponsorNameOf(tx: Tx, row: { tenantId: string; sponsorId: string }) {
  const s = await tx.sponsor.findFirst({ where: { tenantId: row.tenantId, id: row.sponsorId }, select: { name: true } });
  return s?.name ?? "The sponsor";
}

/** The seller's name, as the sponsor reads it: the athlete's, else the team's. */
async function sellerNameIn(tx: Tx, row: Party) {
  if (row.athleteId && row.athleteTenantId) {
    const a = await tx.athlete.findFirst({ where: { tenantId: row.athleteTenantId, id: row.athleteId }, select: { legalName: true, displayName: true } });
    if (a) return a.legalName || a.displayName;
  }
  if (row.propertyId && row.propertyTenantId) {
    const p = await tx.property.findFirst({ where: { tenantId: row.propertyTenantId, id: row.propertyId }, select: { name: true } });
    if (p) return p.name;
  }
  return "The seller";
}

/** Both sides of a line — the sponsor and every seller — each with their own link. */
async function tellBothSides(tx: Tx, row: ExchangeRow, template: EmailTemplate, key: string, data: Record<string, string>) {
  const sponsor = await sponsorRecipient(tx, row.line.order);
  if (sponsor) await tell(tx, sponsor, template, key, { ...data, firstName: sponsor.firstName, link: appUrl(`/sponsor/orders/${row.orderId}`) });
  for (const r of await sellerRecipients(tx, row)) await tell(tx, r, template, key, { ...data, firstName: r.firstName, link: appUrl(salePath(r, row.lineId)) });
}

/** The sponsor confirms a delivered line. */
export async function confirmDelivery(actor: Actor, lineId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await sponsorLine(tx, actor, lineId);
    if (row.state !== "DELIVERED") throw new DeliveryError(`This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for your answer.`);
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row just loaded through whereFor(orderDelivery, write). */
      where: { id: row.id }, data: { state: "CONFIRMED", confirmedAt: now, confirmedBy: actor.userId, confirmedHow: "SPONSOR" }, select: { id: true },
    });
    await audit(tx, actor, "orderDelivery.confirm", "MarketplaceOrder", row.orderId, { before: { lineId, state: "DELIVERED" }, after: { lineId, state: "CONFIRMED", how: "SPONSOR" } });
    await tellConfirmed(tx, row, "SPONSOR");
    await maybeFulfil(tx, row.orderId, now);
    return { lineId, state: "CONFIRMED" as const };
  });
}

/**
 * The sponsor reports a problem — only inside the 24 hours. The line's money
 * is held, and (2S4-BE-11) the SELLER has 72 hours to answer it: BTG is not
 * involved unless the two of them can't settle it.
 */
export async function reportProblem(actor: Actor, lineId: string, note: string, now = new Date()) {
  const text = note?.trim() ?? "";
  if (!text) throw new DeliveryError("Say what went wrong — the seller reads this, and BTG too if it comes to them.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await sponsorLine(tx, actor, lineId);
    if (row.state !== "DELIVERED") throw new DeliveryError(`This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for your answer.`);
    if (!canAnswer(row, now)) {
      throw new DeliveryError(`The ${CONFIRM_WINDOW_HOURS} hours to report a problem have passed, so this line counts as confirmed. If something is wrong, contact BTG support.`);
    }
    const sellerDueAt = new Date(now.getTime() + ANSWER_WINDOW_HOURS * HOUR);
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row just loaded through whereFor(orderDelivery, write). */
      where: { id: row.id }, data: { state: "PROBLEM", problemAt: now, problemBy: actor.userId, problemNote: text.slice(0, 2000) }, select: { id: true },
    });
    const issue = await tx.deliveryIssue.create({
      data: {
        tenantId: row.tenantId, orderId: row.orderId, lineId: row.lineId, deliveryId: row.id, kind: "PROBLEM", stage: "SELLER_TO_ANSWER",
        openedAt: now, openedBy: actor.userId, problemNote: text.slice(0, 2000),
        /* What the sponsor is disputing, as it stood — a redelivery's mark replaces it on the row. */
        markedAt: row.deliveredAt, markedByName: row.deliveredByName, markedNote: row.note, markedProofKey: row.proofKey, markedProofLink: row.proofLink,
        sellerDueAt,
      },
      select: { id: true },
    });
    await audit(tx, actor, "orderDelivery.reportProblem", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: "DELIVERED" }, after: { lineId, state: "PROBLEM", issueId: issue.id, sellerDueAt: sellerDueAt.toISOString() },
    });
    const sponsorName = await sponsorNameOf(tx, row);
    for (const r of await sellerRecipients(tx, row)) {
      await tell(tx, r, "delivery.problemToAnswer", issue.id, {
        firstName: r.firstName, sponsorName, title: row.line.title, orderRef: orderRef(row.orderId),
        problem: text.slice(0, 500), answerBy: utc(sellerDueAt), saleUrl: appUrl(salePath(r, lineId)),
      });
    }
    return { lineId, state: "PROBLEM" as const, issueId: issue.id, stage: "SELLER_TO_ANSWER" as const, sellerDueAt };
  });
}

async function tellConfirmed(tx: Tx, row: Party & { orderId: string; lineId: string; line: { title: string } }, how: "SPONSOR" | "SILENCE") {
  for (const r of await sellerRecipients(tx, row)) {
    await tell(tx, r, "delivery.confirmed", row.lineId, {
      firstName: r.firstName, title: row.line.title, orderRef: orderRef(row.orderId),
      how: how === "SILENCE" ? `the sponsor didn't answer within ${CONFIRM_WINDOW_HOURS} hours, so it counts as confirmed` : "the sponsor confirmed it",
      saleUrl: appUrl(salePath(r, row.lineId)),
    });
  }
}

/* ── the exchange — 2S4-BE-11 ──────────────────────────────────────────── */

export type ProblemAnswerInput = {
  answer: SellerAnswer;
  note?: string | null;
  /** DELIVER_AGAIN — the new date, YYYY-MM-DD. */
  newDate?: string | null;
  /** DISAGREE — an optional photo (POST /sales/{id}/proof) or https link. */
  proofKey?: string | null;
  proofLink?: string | null;
};

/** A redelivery date: a real calendar date, today or later, at most REDELIVER_MAX_DAYS ahead. Pure. */
export function redeliveryDate(raw: string | null | undefined, now: Date): Date {
  const v = raw?.trim() ?? "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || day(d) !== v) throw new DeliveryError("Give the new date you'll deliver on (YYYY-MM-DD).", 422);
  if (v < day(now)) throw new DeliveryError("The new date can't be in the past.", 422);
  if (v > day(new Date(now.getTime() + REDELIVER_MAX_DAYS * DAY))) throw new DeliveryError(`The new date must be within ${REDELIVER_MAX_DAYS} days.`, 422);
  return d;
}

/**
 * The seller answers the sponsor's problem, within its 72 hours: deliver
 * again (a new date and a note), refund the line in full, or disagree (a
 * note, and an optional photo or link). Nothing happens to the line yet — the
 * sponsor then has 72 hours to accept or reject the answer.
 */
export async function answerProblem(actor: Actor, lineId: string, input: ProblemAnswerInput, now = new Date()) {
  sellerScope(actor, "write");
  const answer = input.answer;
  if (!["DELIVER_AGAIN", "REFUND", "DISAGREE"].includes(answer)) throw new DeliveryError("Answer DELIVER_AGAIN, REFUND or DISAGREE.", 422);
  const note = input.note?.trim() ?? "";
  if (answer !== "REFUND" && !note) {
    throw new DeliveryError(answer === "DELIVER_AGAIN" ? "Add a note — say what you'll do differently this time." : "Add a note — say why you think it was delivered.", 422);
  }
  const redeliverOn = answer === "DELIVER_AGAIN" ? redeliveryDate(input.newDate, now) : null;
  const found = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: { id: true, tenantId: true, lineId: true },
  });
  if (!found) throw new ForbiddenError("orderDelivery", "write");
  const { proofKey, proofLink } = answer === "DISAGREE" ? await checkProof(found, input, "answer") : { proofKey: null, proofLink: null };
  const byName = await markerName(actor);

  return prisma.$transaction(async (tx) => {
    const row = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: EXCHANGE_ROW });
    if (!row) throw new ForbiddenError("orderDelivery", "write");
    const issue = row.state === "PROBLEM" ? await openIssue(tx, row.id) : null;
    if (!issue || issue.kind !== "PROBLEM") throw new DeliveryError("There's no problem on this line waiting for your answer.");
    if (issue.stage === "SPONSOR_TO_ANSWER") throw new DeliveryError("You've answered — it's with the sponsor now.");
    if (issue.stage === "ESCALATED") throw new DeliveryError("This problem is with BTG now — they'll decide it.");
    if (!sellerCanAnswer(issue, now)) throw new DeliveryError(`The ${ANSWER_WINDOW_HOURS} hours to answer have passed, so this problem goes to BTG.`);
    const sponsorDueAt = new Date(now.getTime() + ANSWER_WINDOW_HOURS * HOUR);
    const moved = await tx.deliveryIssue.updateMany({
      /* tenant-scope: the open issue of the row just loaded through whereFor(orderDelivery, write), only while still the seller's turn. */
      where: { id: issue.id, stage: "SELLER_TO_ANSWER" },
      data: {
        stage: "SPONSOR_TO_ANSWER", sellerAnswer: answer, sellerAnsweredAt: now, sellerAnsweredBy: actor.userId, sellerAnsweredByName: byName,
        sellerNote: note ? note.slice(0, 2000) : null, redeliverOn, sellerProofKey: proofKey, sellerProofLink: proofLink, sponsorDueAt,
      },
    });
    if (!moved.count) throw new DeliveryError("This problem has moved on — reload to see where it stands.");
    await audit(tx, actor, "orderDelivery.answerProblem", "MarketplaceOrder", row.orderId, {
      before: { lineId, issueId: issue.id, stage: "SELLER_TO_ANSWER" },
      after: { lineId, issueId: issue.id, stage: "SPONSOR_TO_ANSWER", answer, ...(redeliverOn ? { newDate: day(redeliverOn) } : {}), proof: Boolean(proofKey || proofLink) },
    });
    const sponsor = await sponsorRecipient(tx, row.line.order);
    if (sponsor) {
      await tell(tx, sponsor, "delivery.sellerAnswered", issue.id, {
        firstName: sponsor.firstName, sellerName: byName, title: row.line.title, orderRef: orderRef(row.orderId),
        answer: answerWords(answer, redeliverOn), note: note.slice(0, 500), answerBy: utc(sponsorDueAt), orderUrl: appUrl(`/sponsor/orders/${row.orderId}`),
      });
    }
    return { lineId, issueId: issue.id, state: "PROBLEM" as const, stage: "SPONSOR_TO_ANSWER" as const, answer, sponsorDueAt };
  });
}

/**
 * The sponsor answers the seller's answer, within its 72 hours. ACCEPT
 * settles it there and then — the line goes back into delivery for the new
 * date, is refunded in full, or (a disagreement accepted) is confirmed.
 * REJECT, with a note, sends it to BTG's issues desk.
 */
export async function answerReply(actor: Actor, lineId: string, input: { decision: SponsorAnswer; note?: string | null }, now = new Date()) {
  const note = input.note?.trim() ?? "";
  if (input.decision !== "ACCEPT" && input.decision !== "REJECT") throw new DeliveryError("Answer ACCEPT or REJECT.", 422);
  if (input.decision === "REJECT" && !note) throw new DeliveryError("Say why you're rejecting it — BTG reads this when they decide.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await sponsorLine(tx, actor, lineId);
    const issue = row.state === "PROBLEM" ? await openIssue(tx, row.id) : null;
    if (!issue || issue.kind !== "PROBLEM") throw new DeliveryError("There's no answer on this line waiting for you.");
    if (issue.stage === "SELLER_TO_ANSWER") throw new DeliveryError("The seller hasn't answered yet.");
    if (issue.stage === "ESCALATED") throw new DeliveryError("This problem is with BTG now — they'll decide it.");
    if (!sponsorCanAnswer(issue, now)) throw new DeliveryError(`The ${ANSWER_WINDOW_HOURS} hours to answer have passed, so this problem goes to BTG.`);
    const answered = { sponsorAnswer: input.decision, sponsorAnsweredAt: now, sponsorAnsweredBy: actor.userId, sponsorNote: note ? note.slice(0, 2000) : null };

    if (input.decision === "REJECT") {
      const sent = await escalate(tx, actor, row, issue.id, ["SPONSOR_TO_ANSWER"], "SPONSOR_REJECTED", now, answered);
      if (!sent) throw new DeliveryError("This problem has moved on — reload to see where it stands.");
      await audit(tx, actor, "orderDelivery.answerReply", "MarketplaceOrder", row.orderId, {
        before: { lineId, issueId: issue.id, stage: "SPONSOR_TO_ANSWER" }, after: { lineId, issueId: issue.id, stage: "ESCALATED", decision: "REJECT" },
      });
      return { lineId, issueId: issue.id, decision: "REJECT" as const, stage: "ESCALATED" as const, state: "PROBLEM" as DeliveryState };
    }

    const sellerAnswer = issue.sellerAnswer as SellerAnswer;
    const outcome: IssueOutcome = sellerAnswer === "DELIVER_AGAIN" ? "REDELIVER" : sellerAnswer === "REFUND" ? "REFUNDED" : "CONFIRMED";
    const moved = await tx.deliveryIssue.updateMany({
      /* tenant-scope: the open issue of the row just loaded through whereFor(orderDelivery, write), only while still the sponsor's turn. */
      where: { id: issue.id, stage: "SPONSOR_TO_ANSWER" },
      data: { ...answered, stage: "SETTLED", outcome, closedAt: now, closedBy: actor.userId },
    });
    if (!moved.count) throw new DeliveryError("This problem has moved on — reload to see where it stands.");
    const state = await settleLine(tx, actor, row, outcome, issue.redeliverOn, now);
    await audit(tx, actor, "orderDelivery.answerReply", "MarketplaceOrder", row.orderId, {
      before: { lineId, issueId: issue.id, stage: "SPONSOR_TO_ANSWER", state: "PROBLEM" }, after: { lineId, issueId: issue.id, stage: "SETTLED", decision: "ACCEPT", outcome, state },
    });
    const words =
      outcome === "REDELIVER" ? `the seller delivers it again on ${day(issue.redeliverOn!)}. When it's marked delivered, the sponsor has ${CONFIRM_WINDOW_HOURS} hours to confirm it or report a problem, as before`
      : outcome === "REFUNDED" ? "the line is refunded in full"
      : "the sponsor accepted it was delivered, so it is confirmed";
    await tellBothSides(tx, row, "delivery.settled", issue.id, { title: row.line.title, orderRef: orderRef(row.orderId), outcome: words });
    return { lineId, issueId: issue.id, decision: "ACCEPT" as const, stage: "SETTLED" as const, outcome, state };
  });
}

/** Settle the line the way the two sides agreed. The issue is already closed, so a whole-order refund leaves it alone. */
async function settleLine(tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, outcome: IssueOutcome, redeliverOn: Date | null, now: Date): Promise<DeliveryState> {
  if (outcome === "REDELIVER") {
    /* Back into delivery for the new date: the old mark is kept on the issue,
       the reminders and the 7-day hand-over count from the new date, and the
       next mark starts the sponsor's 24 hours again. */
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row the caller loaded through whereFor(orderDelivery, write). */
      where: { id: row.id },
      data: {
        state: "IN_DELIVERY", redeliverOn, deliveredAt: null, deliveredBy: null, deliveredByName: null, note: null, proofKey: null, proofLink: null,
        confirmDueAt: null, problemAt: null, problemBy: null, problemNote: null, remindedAt: null, secondRemindedAt: null, overdueEscalatedAt: null,
      },
      select: { id: true },
    });
    return "IN_DELIVERY";
  }
  if (outcome === "CONFIRMED") {
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row the caller loaded through whereFor(orderDelivery, write). */
      where: { id: row.id }, data: { state: "CONFIRMED", confirmedAt: now, confirmedBy: actor.userId, confirmedHow: "SPONSOR" }, select: { id: true },
    });
    await maybeFulfil(tx, row.orderId, now);
    return "CONFIRMED";
  }
  await tx.orderLineDelivery.update({
    /* tenant-scope: the row the caller loaded through whereFor(orderDelivery, write). */
    where: { id: row.id }, data: { state: "REFUNDED" }, select: { id: true },
  });
  await refundLine(tx, actor, row, now);
  await maybeFulfil(tx, row.orderId, now);
  return "REFUNDED";
}

/**
 * A line already marked REFUNDED gets its money back: the order's own refund
 * when no other line is still live (reversal, stock released, Zoho told),
 * else this line's journals mirrored and its stock handed back. The whole
 * line, always — partial refunds are out of scope.
 */
async function refundLine(tx: Tx, actor: AuditActor & { tenantId: string }, row: { id: string; orderId: string; lineId: string; line: { inventoryItemId: string; startsOn: Date; endsOn: Date } }, now: Date) {
  const live = await tx.orderLineDelivery.count({
    /* tenant-scope: this order's own delivery rows, named by its id. */
    where: { orderId: row.orderId, state: { notIn: ["REFUNDED", "CANCELLED"] } },
  });
  if (live === 0) {
    await moveOrderIn(tx, actor, row.orderId, "REFUNDED", now);
    return;
  }
  await reverseOrder(tx, row.orderId, row.lineId);
  const parts = await tx.bundleComponent.findMany({
    /* tenant-scope: the components of the item this line (loaded through whereFor) bought. */
    where: { bundleItemId: row.line.inventoryItemId }, select: { componentItemId: true },
  });
  await tx.inventoryCommitment.updateMany({
    /* tenant-scope: the commitments this order wrote for this line's items and dates, named by the order's id. */
    where: {
      source: "ORDER", sourceId: { startsWith: `${row.orderId}:` }, releasedAt: null,
      inventoryItemId: { in: [row.line.inventoryItemId, ...parts.map((p) => p.componentItemId)] }, startsOn: row.line.startsOn, endsOn: row.line.endsOn,
    },
    data: { releasedAt: now },
  });
}

/**
 * Hand an issue to BTG — only from the stages named (so a second run, or a
 * race with an answer, changes nothing). Stores why; tells BTG's admins and
 * both sides. `extra` carries the sponsor's rejection, written with it.
 */
async function escalate(
  tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, issueId: string, from: IssueStage[], reason: EscalationReason, now: Date,
  extra: Prisma.DeliveryIssueUpdateManyMutationInput = {},
) {
  const text = escalationWords(reason, lastDateOf(row));
  const moved = await tx.deliveryIssue.updateMany({
    /* tenant-scope: an issue of a delivery row the caller loaded through whereFor (or the sweep found by id). */
    where: { id: issueId, stage: { in: from } },
    data: { ...extra, stage: "ESCALATED", escalatedAt: now, escalationReason: reason, escalationNote: text },
  });
  if (!moved.count) return false;
  await announceEscalation(tx, actor, row, issueId, reason, text);
  return true;
}

/** Audit a hand-over to BTG, and tell BTG's admins and both sides why. */
async function announceEscalation(tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, issueId: string, reason: EscalationReason, text: string) {
  await audit(tx, actor, "orderDelivery.escalate", "MarketplaceOrder", row.orderId, { after: { lineId: row.lineId, issueId, reason } });
  const [sponsorName, sellerName] = await Promise.all([sponsorNameOf(tx, row), sellerNameIn(tx, row)]);
  for (const admin of await btgAdmins(tx, row.tenantId)) {
    await tell(tx, { tenantId: row.tenantId, email: admin.email }, "delivery.escalated", issueId, {
      sponsorName, sellerName, title: row.line.title, orderRef: orderRef(row.orderId), reason: text, issueUrl: appUrl(`/admin/delivery-issues/${row.lineId}`),
    });
  }
  await tellBothSides(tx, row, "delivery.withBtg", issueId, { title: row.line.title, orderRef: orderRef(row.orderId), reason: text });
}

/* ── the sweep — 2S4-BE-07 (silence) and 2S4-BE-08 (reminders, auto-close) ── */

/**
 * The worker's delivery sweep. Each pass is idempotent by its own state
 * guard — running it twice changes nothing:
 *   1. a line marked delivered whose 24 hours have passed is CONFIRMED (SILENCE);
 *   2. a problem the seller hasn't answered in 72 hours goes to BTG (2S4-BE-11);
 *   3. a seller's answer the sponsor hasn't accepted or rejected in 72 hours
 *      goes to BTG (2S4-BE-11);
 *   4. a line still unmarked 7 days after its last date goes to BTG — "no
 *      delivery marked 7 days after <date>" (2S4-BE-11);
 *   5. …3 days after, the seller (and the team's manager) are reminded a
 *      second time (secondRemindedAt, 2S4-BE-11);
 *   6. …a day after, they are reminded the first time (remindedAt, 2S4-BE-08);
 *   7. an order FULFILLED 30 days ago (its last line confirmed then) CLOSES,
 *      releasing the reserve (ledger.ts `releaseReserve`, through the order's machine).
 * The overdue passes run latest-first, so a sweep that missed days sends the
 * one message that is due, not all three. "Last date" is a redelivery's
 * agreed date when there is one. Each row in its own transaction, so one
 * failure is retried next run and stops nothing else.
 */
export async function sweepDeliveries(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { confirmed: 0, sellerSilent: 0, sponsorSilent: 0, overdueEscalated: 0, secondReminded: 0, reminded: 0, closed: 0, failed: 0 };
  /* Every tenant's books — or only some, for a test that moves the clock. */
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};

  const due = await prisma.orderLineDelivery.findMany({
    /* tenant-scope: the system sweep — every tenant's lines whose sponsor window has passed; each is handled in its own books. */
    where: { ...books, state: "DELIVERED", confirmDueAt: { lte: now } }, select: { id: true }, take: 500,
  });
  for (const { id } of due) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        const moved = await tx.orderLineDelivery.updateMany({
          /* tenant-scope: the row the sweep found, by id, only while it is still waiting. */
          where: { id, state: "DELIVERED", confirmDueAt: { lte: now } }, data: { state: "CONFIRMED", confirmedAt: now, confirmedBy: "system", confirmedHow: "SILENCE" },
        });
        if (!moved.count) return false;
        const row = await tx.orderLineDelivery.findUniqueOrThrow({
          /* tenant-scope: the row just moved, by id. */
          where: { id }, select: { tenantId: true, orderId: true, lineId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, line: { select: { title: true } } },
        });
        await audit(tx, { userId: null, tenantId: row.tenantId }, "orderDelivery.confirm", "MarketplaceOrder", row.orderId, {
          before: { lineId: row.lineId, state: "DELIVERED" }, after: { lineId: row.lineId, state: "CONFIRMED", how: "SILENCE" },
        });
        await tellConfirmed(tx, row, "SILENCE");
        await maybeFulfil(tx, row.orderId, now);
        return true;
      });
      if (done) out.confirmed++;
    } catch (error) {
      out.failed++;
      console.error(`[delivery] confirming ${id} failed, will retry:`, error);
    }
  }

  /* 2S4-BE-11 — a side that didn't answer in its 72 hours: BTG decides. */
  const silent: [IssueStage, "sellerDueAt" | "sponsorDueAt", EscalationReason, "sellerSilent" | "sponsorSilent"][] = [
    ["SELLER_TO_ANSWER", "sellerDueAt", "SELLER_NO_ANSWER", "sellerSilent"],
    ["SPONSOR_TO_ANSWER", "sponsorDueAt", "SPONSOR_NO_ANSWER", "sponsorSilent"],
  ];
  for (const [stage, dueField, reason, count] of silent) {
    const waiting = await prisma.deliveryIssue.findMany({
      /* tenant-scope: the system sweep — every tenant's issues whose side's 72 hours have passed; each is handed over in its own books. */
      where: { ...books, stage, [dueField]: { lte: now } }, select: { id: true, deliveryId: true }, take: 500,
    });
    for (const { id, deliveryId } of waiting) {
      try {
        const sent = await prisma.$transaction(async (tx) => {
          const row = await tx.orderLineDelivery.findUniqueOrThrow({
            /* tenant-scope: the delivery row of the issue the sweep found, by id. */
            where: { id: deliveryId }, select: EXCHANGE_ROW,
          });
          return escalate(tx, { userId: null, tenantId: row.tenantId }, row, id, [stage], reason, now);
        });
        if (sent) out[count]++;
      } catch (error) {
        out.failed++;
        console.error(`[delivery] handing issue ${id} to BTG failed, will retry:`, error);
      }
    }
  }

  /* 2S4-BE-11 — 7 days past the last date with nothing marked: BTG takes it. */
  const abandoned = await prisma.orderLineDelivery.findMany({
    /* tenant-scope: the system sweep — every tenant's lines still in delivery 7 days past their last date, not yet handed to BTG. */
    where: { ...books, state: "IN_DELIVERY", overdueEscalatedAt: null, ...dueBy(new Date(now.getTime() - ESCALATE_OVERDUE_DAYS * DAY)) }, select: { id: true }, take: 500,
  });
  for (const { id } of abandoned) {
    try {
      if (await escalateOverdue(id, now)) out.overdueEscalated++;
    } catch (error) {
      out.failed++;
      console.error(`[delivery] handing overdue ${id} to BTG failed, will retry:`, error);
    }
  }

  const reminders: ["second" | "once", number, "secondReminded" | "reminded"][] = [["second", SECOND_REMINDER_DAYS, "secondReminded"], ["once", OVERDUE_AFTER_DAYS, "reminded"]];
  for (const [mode, days, count] of reminders) {
    const late = await prisma.orderLineDelivery.findMany({
      /* tenant-scope: the system sweep — every tenant's lines still in delivery this many days past their last date, not yet reminded so. */
      where: {
        ...books, state: "IN_DELIVERY", overdueEscalatedAt: null, ...(mode === "second" ? { secondRemindedAt: null } : { remindedAt: null, secondRemindedAt: null }),
        ...dueBy(new Date(now.getTime() - days * DAY)),
      },
      select: { id: true }, take: 500,
    });
    for (const { id } of late) {
      try {
        if (await remindIn(id, now, { userId: null }, mode)) out[count]++;
      } catch (error) {
        out.failed++;
        console.error(`[delivery] reminding ${id} failed, will retry:`, error);
      }
    }
  }

  const closing = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the system sweep — every tenant's orders fulfilled 30 days ago; each is closed in its own books. */
    where: { ...books, state: "FULFILLED", fulfilledAt: { lte: new Date(now.getTime() - AUTO_CLOSE_DAYS * DAY) } }, select: { id: true }, take: 500,
  });
  for (const { id } of closing) {
    try {
      await prisma.$transaction(async (tx) => {
        const o = await tx.marketplaceOrder.findUniqueOrThrow({
          /* tenant-scope: the order the sweep found, by id. */
          where: { id }, select: { state: true },
        });
        if (o.state === "FULFILLED") await moveOrderAsSystem(tx, id, "CLOSED", now);
      });
      out.closed++;
    } catch (error) {
      out.failed++;
      console.error(`[delivery] closing ${id} failed, will retry:`, error);
    }
  }
  return out;
}

/**
 * Remind a late seller (and their team's manager). "once" — the sweep, a day
 * after the last date; "second" — the sweep, 3 days after (a first not yet
 * sent is then skipped, so a sweep that missed days sends one, not two); "again" —
 * BTG's button, once a day. Keyed by the date it is due by, so a redelivery
 * is reminded afresh.
 */
async function remindIn(id: string, now: Date, by: { userId: string | null }, mode: "once" | "second" | "again") {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.orderLineDelivery.updateMany({
      /* tenant-scope: the row named by the sweep (or loaded by BTG through whereFor), by id, only while still in delivery. */
      where: { id, state: "IN_DELIVERY", ...(mode === "once" ? { remindedAt: null, secondRemindedAt: null } : mode === "second" ? { secondRemindedAt: null } : {}) },
      data: mode === "second" ? { secondRemindedAt: now } : { remindedAt: now },
    });
    if (!moved.count) return false;
    const row = await tx.orderLineDelivery.findUniqueOrThrow({
      /* tenant-scope: the row just stamped, by id. */
      where: { id }, select: { tenantId: true, orderId: true, lineId: true, sponsorId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, redeliverOn: true, line: { select: { title: true, endsOn: true } } },
    });
    await audit(tx, { userId: by.userId, tenantId: row.tenantId }, "orderDelivery.remind", "MarketplaceOrder", row.orderId, { after: { lineId: row.lineId, mode } });
    const last = lastDateOf(row);
    const sponsorName = await sponsorNameOf(tx, row);
    for (const r of await sellerRecipients(tx, row)) {
      await tell(tx, r, "delivery.overdue", `${row.lineId}:${day(last)}:${mode === "once" ? "first" : mode === "second" ? "second" : day(now)}`, {
        firstName: r.firstName, title: row.line.title, orderRef: orderRef(row.orderId), sponsorName,
        lastDate: day(last), nth: mode === "second" ? "second" : "first", handOverOn: day(new Date(last.getTime() + ESCALATE_OVERDUE_DAYS * DAY)),
        saleUrl: appUrl(salePath(r, row.lineId)),
      });
    }
    return true;
  });
}

/** 2S4-BE-11 — a line still unmarked 7 days after its last date: an OVERDUE issue on BTG's desk. Once per due date. */
async function escalateOverdue(id: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.orderLineDelivery.updateMany({
      /* tenant-scope: the row named by the sweep, by id, only while still unmarked and not yet handed over. */
      where: { id, state: "IN_DELIVERY", overdueEscalatedAt: null }, data: { overdueEscalatedAt: now },
    });
    if (!moved.count) return false;
    const row = await tx.orderLineDelivery.findUniqueOrThrow({
      /* tenant-scope: the row just stamped, by id. */
      where: { id }, select: EXCHANGE_ROW,
    });
    const text = escalationWords("NOT_DELIVERED", lastDateOf(row));
    /* Opened already with BTG: there is no mark for the sponsor to dispute, so nothing for the two sides to settle. */
    const issue = await tx.deliveryIssue.create({
      data: {
        tenantId: row.tenantId, orderId: row.orderId, lineId: row.lineId, deliveryId: row.id, kind: "OVERDUE", stage: "ESCALATED",
        openedAt: now, openedBy: null, problemNote: text, escalatedAt: now, escalationReason: "NOT_DELIVERED", escalationNote: text,
      },
      select: { id: true },
    });
    await announceEscalation(tx, { userId: null, tenantId: row.tenantId }, row, issue.id, "NOT_DELIVERED", text);
    return true;
  });
}

/* ── BTG's desk — 2S4-BE-07/-11 (problems the two sides couldn't settle), 2S4-BE-08 (overdue) ── */

function assertDesk(actor: Actor) {
  const scope = assertAllowed(actor, "orderDelivery", "approve");
  if (scope !== "any" && scope !== "own-tenant") throw new ForbiddenError("orderDelivery", "approve");
}

/** Each party's share of a line, as BTG holds it — the desk's "money on hold". */
async function holdFor(actor: Actor, lineIds: string[]) {
  const entries = lineIds.length
    ? await prisma.ledgerEntry.findMany({
        where: { ...whereFor(actor, "ledgerEntry", "read"), lineId: { in: lineIds }, entryType: "BOOKING", partyType: { in: ["ATHLETE", "PROPERTY"] } },
        select: { lineId: true, partyType: true, creditCents: true },
      })
    : [];
  const out = new Map<string, { athleteCents: number; teamCents: number }>();
  for (const e of entries) {
    const h = out.get(e.lineId!) ?? { athleteCents: 0, teamCents: 0 };
    if (e.partyType === "ATHLETE") h.athleteCents += e.creditCents;
    else h.teamCents += e.creditCents;
    out.set(e.lineId!, h);
  }
  return out;
}

function issueView(r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>, now: Date, hold?: { athleteCents: number; teamCents: number }) {
  const team = r.propertyId ? names.team.get(r.propertyId) ?? null : null;
  const athlete = r.athleteId ? names.athlete.get(r.athleteId) ?? null : null;
  const seller = athlete ? { name: athlete, sub: team } : { name: team ?? "Seller", sub: null };
  const units = `${r.line.quantity} ${unitOf(names.kind.get(r.line.inventoryItemId))}${r.line.quantity === 1 ? "" : "s"}`;
  const issue = currentIssue(r.issues);
  const timeline = timelineOf(r, whoOf(r, names));
  /* The problem being decided (the open issue's own words), else the row's. */
  const problem = issue?.kind === "PROBLEM" ? { text: issue.problemNote, at: issue.openedAt } : r.problemAt && r.problemNote ? { text: r.problemNote, at: r.problemAt } : null;
  const marked = issue?.kind === "PROBLEM" && issue.markedAt
    ? { text: issue.markedNote ?? "", at: issue.markedAt, proofCount: issue.markedProofKey ? 1 : 0, link: issue.markedProofLink }
    : r.deliveredAt && r.note ? { text: r.note, at: r.deliveredAt, proofCount: r.proofKey ? 1 : 0, link: r.proofLink } : null;
  return {
    id: r.lineId,
    orderId: r.orderId,
    orderRef: orderRef(r.orderId),
    state: r.state as DeliveryState,
    line: r.line.title,
    quantity: units,
    unitPriceCents: r.line.unitPriceCents,
    dates: lineDates(r.line.startsOn, r.line.endsOn),
    /* The date it is due by: a redelivery's agreed date, else the line's own last date. */
    lastDate: day(lastDateOf(r)),
    redeliverOn: r.redeliverOn ? day(r.redeliverOn) : null,
    seller,
    sponsor: { name: names.sponsor.get(r.sponsorId) ?? "Sponsor", sub: r.line.order.billingName ?? null },
    sponsorMessage: problem,
    sellerNote: marked,
    hold: { sellerShareCents: athlete ? hold?.athleteCents ?? 0 : hold?.teamCents ?? 0, teamShareCents: athlete ? hold?.teamCents ?? 0 : 0, sponsorPaidCents: r.line.lineTotalCents },
    remindedAt: r.remindedAt,
    secondRemindedAt: r.secondRemindedAt,
    /* 2S4-BE-11 — where the problem stands, why it came to BTG, and the whole exchange. */
    issue: issue ? issueSummary(issue, now) : null,
    escalation: issue?.stage === "ESCALATED" && issue.escalatedAt
      ? { at: issue.escalatedAt, reason: issue.escalationReason as EscalationReason, text: issue.escalationNote ?? "" }
      : null,
    canDecide: issue?.stage === "ESCALATED",
    timeline,
    history: timeline.map((t) => ({ at: t.at, text: t.text })),
  };
}

/**
 * BTG's Delivery issues desk (2S4-BE-11): only what the two sides couldn't
 * settle — `problems`, the escalated issues, oldest hand-over first, each
 * with why it came — plus `settled`, the problems settled between them
 * (most recent first, read-only), and `overdue`, lines past their last date
 * and unmarked that haven't yet been handed over (2S4-BE-08; at 7 days they
 * move to `problems`). A problem still between the seller and the sponsor
 * appears in none of them.
 */
export async function deliveryIssues(actor: Actor, now = new Date()) {
  assertDesk(actor);
  const where = whereFor(actor, "orderDelivery", "approve");
  const [escalated, settledRows, overdue] = await Promise.all([
    prisma.orderLineDelivery.findMany({ where: { ...where, issues: { some: { stage: "ESCALATED" } } }, select: SALE_SELECT, take: 200 }),
    prisma.orderLineDelivery.findMany({ where: { ...where, issues: { some: { stage: "SETTLED" } } }, select: SALE_SELECT, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.orderLineDelivery.findMany({
      where: { ...where, state: "IN_DELIVERY", overdueEscalatedAt: null, OR: [{ redeliverOn: null, line: { endsOn: { lt: now } } }, { redeliverOn: { lt: now } }] },
      select: SALE_SELECT, orderBy: { createdAt: "asc" }, take: 200,
    }),
  ]);
  const names = await namesFor([...escalated, ...settledRows, ...overdue]);
  const hold = await holdFor(actor, escalated.map((p) => p.lineId));
  const escalatedAt = (r: SaleRow) => r.issues.find((i) => i.stage === "ESCALATED")?.escalatedAt?.getTime() ?? 0;
  /* One entry per problem settled between them — a line can have had more than one. */
  const settled = settledRows
    .flatMap((r) => r.issues.filter((i) => i.stage === "SETTLED").map((i) => ({ r, i })))
    .sort((a, b) => (b.i.closedAt?.getTime() ?? 0) - (a.i.closedAt?.getTime() ?? 0))
    .slice(0, 100)
    .map(({ r, i }) => ({
      ...issueView(r, names, now),
      settlement: { issueId: i.id, outcome: i.outcome as IssueOutcome, at: i.closedAt, text: SETTLED_WORDS[i.outcome ?? ""] ?? "Settled between them", answer: i.sellerAnswer as SellerAnswer },
    }));
  return {
    confirmWindowHours: CONFIRM_WINDOW_HOURS,
    answerWindowHours: ANSWER_WINDOW_HOURS,
    problems: escalated.sort((a, b) => escalatedAt(a) - escalatedAt(b)).map((r) => issueView(r, names, now, hold.get(r.lineId))),
    settled,
    overdue: overdue.map((r) => issueView(r, names, now)),
  };
}

export async function deliveryIssue(actor: Actor, lineId: string, now = new Date()) {
  assertDesk(actor);
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: SALE_SELECT });
  if (!row) throw new ForbiddenError("orderDelivery", "approve");
  const [names, hold] = await Promise.all([namesFor([row]), holdFor(actor, [row.lineId])]);
  return issueView(row, names, now, hold.get(row.lineId));
}

/**
 * BTG decides an issue the two sides couldn't settle (2S4-BE-11: only an
 * ESCALATED one): CONFIRM (the line is delivered; its money is released on
 * the usual rules) or REFUND (the line's own refund — the whole order when no
 * other line is still live, else this line's journals reversed and its stock
 * released). A note is required: everyone reads it.
 */
export async function resolveIssue(actor: Actor, lineId: string, decision: "CONFIRM" | "REFUND", note: string, now = new Date()) {
  assertDesk(actor);
  const text = note?.trim() ?? "";
  if (!text) throw new DeliveryError("Add a note — the sponsor and the seller both read it.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: EXCHANGE_ROW });
    if (!row) throw new ForbiddenError("orderDelivery", "approve");
    const issue = await openIssue(tx, row.id);
    if (!issue || issue.stage !== "ESCALATED") {
      throw new DeliveryError(
        issue ? "The seller and the sponsor are still settling this between them — it comes to BTG only if they can't."
          : `This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for a decision.`,
      );
    }
    const outcome = decision === "CONFIRM" ? "CONFIRMED" : "REFUNDED";
    /* The issue first, so a whole-order refund (followOrder) finds nothing of it left open. */
    const closed = await tx.deliveryIssue.updateMany({
      /* tenant-scope: the open issue of the row just loaded through whereFor(orderDelivery, approve), only while still with BTG. */
      where: { id: issue.id, stage: "ESCALATED" }, data: { stage: "RESOLVED", outcome, closedAt: now, closedBy: actor.userId, closingNote: text.slice(0, 2000) },
    });
    if (!closed.count) throw new DeliveryError("This issue has just been decided — reload to see how.");
    const stamp = { resolvedAt: now, resolvedBy: actor.userId, resolutionNote: text.slice(0, 2000) };
    if (decision === "CONFIRM") {
      await tx.orderLineDelivery.update({
        /* tenant-scope: the row just loaded through whereFor(orderDelivery, approve). */
        where: { id: row.id }, data: { ...stamp, state: "CONFIRMED", resolution: "CONFIRMED", confirmedAt: now, confirmedBy: actor.userId, confirmedHow: "BTG" }, select: { id: true },
      });
    } else {
      await tx.orderLineDelivery.update({
        /* tenant-scope: the row just loaded through whereFor(orderDelivery, approve). */
        where: { id: row.id }, data: { ...stamp, state: "REFUNDED", resolution: "REFUNDED" }, select: { id: true },
      });
      await refundLine(tx, actor, row, now);
    }
    await audit(tx, actor, "orderDelivery.resolve", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: row.state, issueId: issue.id, stage: "ESCALATED" }, after: { lineId, state: outcome, issueId: issue.id, stage: "RESOLVED", note: text.slice(0, 500) },
    });
    await maybeFulfil(tx, row.orderId, now);

    const data = { title: row.line.title, orderRef: orderRef(row.orderId), decision: decision === "CONFIRM" ? "confirmed as delivered" : "cancelled and refunded", note: text.slice(0, 1000) };
    /* Keyed by the issue: a line can come to BTG more than once over its life. */
    await tellBothSides(tx, row, "delivery.resolved", issue.id, data);
    return { lineId, issueId: issue.id, state: outcome as DeliveryState };
  });
}

/** BTG's "Remind seller" on an overdue line — at most once a day per line. */
export async function remindSeller(actor: Actor, lineId: string, now = new Date()) {
  assertDesk(actor);
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: { id: true, state: true } });
  if (!row) throw new ForbiddenError("orderDelivery", "approve");
  if (row.state !== "IN_DELIVERY") throw new DeliveryError("Only a line still waiting to be marked delivered can be chased.");
  await remindIn(row.id, now, actor, "again");
  return { lineId, remindedAt: now };
}

/* ── the proof — a 5-minute audited link ───────────────────────────────── */

/**
 * A seller's photo: for the seller, the buying sponsor and BTG — through a
 * 5-minute audited link. With no `issue`, the line's current delivery photo;
 * with one (2S4-BE-11), that issue's `answer` photo (the seller's
 * disagreement) or the `marked` photo the sponsor disputed.
 */
export async function proofLink(actor: Actor, lineId: string, opts: { issue?: string; photo?: "answer" | "marked" } = {}) {
  assertAllowed(actor, "orderDelivery", "read");
  const row = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "read"), lineId },
    select: { id: true, proofKey: true, issues: { where: opts.issue ? { id: opts.issue } : { id: "" }, select: { id: true, markedProofKey: true, sellerProofKey: true } } },
  });
  if (!row) throw new ForbiddenError("orderDelivery", "read");
  let key = row.proofKey;
  if (opts.issue) {
    const issue = row.issues[0];
    if (!issue) throw new DeliveryError("No such problem on this line.", 404);
    key = (opts.photo ?? "answer") === "answer" ? issue.sellerProofKey : issue.markedProofKey;
  }
  if (!key) throw new DeliveryError("No photo was added here.", 404);
  const url = await presignPrivateDownload(actor, key, { entity: "OrderLineDelivery", entityId: row.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}
