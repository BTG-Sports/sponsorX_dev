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
 *
 * CANCELLING A PAID LINE (2S4-BE-12, programme owner 2026-10-02). Only a line
 * still IN_DELIVERY (paid, not yet marked delivered, no open issue) — anything
 * later is the problem flow above, unchanged.
 *   - The SPONSOR cancels for free until the cut-off: the start of the line's
 *     first date (UTC) less 3 days. The line is refunded at once through the
 *     line refund (the whole order when it is the last live line). After the
 *     cut-off, until the first date starts, the sponsor ASKS the seller (a
 *     reason required): a CANCELLATION issue, SELLER_TO_ANSWER until the
 *     earlier of 72 hours or the first date's start. The seller ACCEPTs (the
 *     line is refunded — SETTLED) or DECLINEs with a reason; a decline, or no
 *     answer (the sweep), goes to BTG, which REFUNDs or KEEPs (the line stays
 *     IN_DELIVERY), with a note to both sides. On or after the first date the
 *     sponsor can't cancel: 409, "Report a problem".
 *   - The SELLER cancels a line it can't deliver, any time while it is
 *     IN_DELIVERY (after its date too). The sponsor is refunded in full at
 *     once and emailed. Recorded on the line (cancelledBy SELLER, the seller
 *     it counts against) so the standing rule (2 in 90 days → new listings
 *     held for BTG, listing-rules.ts) is a count.
 *   - None of these stops the sponsor's spending limit rising (spending-limit.ts).
 *   - Every refund leaves a RefundDue row (refunds.ts, 2S4-BE-13).
 * Every move here takes the order's row lock first (marketplace-order.ts
 * `lockOrder`) and is made by a state-guarded update, so two clicks — or a
 * click racing the sweep — refund once.
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, scopeOf, whereFor, type Scope } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { send, type EmailTemplate } from "../lib/email";
import { presignPrivateDownload, presignPrivateUpload, privateObjectSize, SENSITIVE_DOCUMENT_TTL_SECONDS } from "../lib/storage";
import { reverseOrder } from "./ledger";
import { lockOrder, moveOrderAsSystem, moveOrderIn, OrderStateConflictError } from "./marketplace-order";
import { usd } from "./marketplace-order-rules";
import { recordRefund, refundsForOrders, type RefundCause, type RefundContext, type SponsorRefund } from "./refunds";
import { SELLER_CANCELLATION_LIMIT, SELLER_CANCELLATION_WINDOW_DAYS } from "./listing-rules";
import { sellerCancellationCount, sellerOfLine } from "./seller-standing";

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
/** 2S4-BE-12 — a sponsor cancels a paid line for free until this many days before its first date… */
export const FREE_CANCEL_DAYS = 3;
/** …after that the seller has this long (or until the first date starts, if sooner) to agree. */
export const CANCEL_ANSWER_HOURS = 72;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DeliveryState = "UNPAID" | "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED";
/** Done with: nothing more happens to the line. */
const SETTLED = new Set<DeliveryState>(["CONFIRMED", "REFUNDED", "CANCELLED"]);
/** Orders whose sponsor has paid — the point the sponsor's contact appears. */
const PAID_STATES = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);

export type IssueKind = "PROBLEM" | "OVERDUE" | "CANCELLATION";
export type IssueStage = "SELLER_TO_ANSWER" | "SPONSOR_TO_ANSWER" | "ESCALATED" | "SETTLED" | "RESOLVED" | "CLOSED";
/** A problem's answers — and (2S4-BE-12) a cancellation request's: ACCEPT or DECLINE. */
export type SellerAnswer = "DELIVER_AGAIN" | "REFUND" | "DISAGREE" | "ACCEPT" | "DECLINE";
export type SponsorAnswer = "ACCEPT" | "REJECT";
export type EscalationReason =
  | "SPONSOR_REJECTED" | "SELLER_NO_ANSWER" | "SPONSOR_NO_ANSWER" | "NOT_DELIVERED" | "REPORTED_TO_BTG"
  | "SELLER_DECLINED_CANCELLATION" | "SELLER_DIDNT_ANSWER_CANCELLATION";
export type IssueOutcome = "REDELIVER" | "REFUNDED" | "CONFIRMED" | "MARKED_DELIVERED" | "ORDER_ENDED" | "KEPT" | "SELLER_CANCELLED";
/** Who cancelled a paid line (2S4-BE-12). */
export type CancelledBy = "SPONSOR" | "SELLER" | "AGREED" | "BTG";
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
    case "SELLER_DECLINED_CANCELLATION": return "The seller declined the sponsor's request to cancel";
    case "SELLER_DIDNT_ANSWER_CANCELLATION": return "The seller didn't answer the sponsor's request to cancel in time";
    default: return "Reported before sellers answered problems themselves, so BTG decides";
  }
}

/** The seller's answer, in the sponsor's words. Pure. */
export function answerWords(answer: SellerAnswer, redeliverOn?: Date | null): string {
  if (answer === "DELIVER_AGAIN") return `deliver it again on ${redeliverOn ? day(redeliverOn) : "a new date"}`;
  if (answer === "REFUND") return "refund the line in full";
  if (answer === "ACCEPT") return "agree to cancel — the line is refunded in full";
  if (answer === "DECLINE") return "decline to cancel";
  return "disagree — they say it was delivered";
}

/* ── cancelling a paid line — 2S4-BE-12 ─────────────────────────────────── */

/** The start of a line's first date (UTC), and the free cut-off 3 days before it. Pure. */
export function cancelCutoff(startsOn: Date) {
  const firstDateStart = new Date(`${day(startsOn)}T00:00:00.000Z`);
  return { firstDate: day(startsOn), firstDateStart, freeUntil: new Date(firstDateStart.getTime() - FREE_CANCEL_DAYS * DAY) };
}

/** Lines a paid order can have cancelled: the order paid, the line still waiting to be delivered. */
const PAID_ORDER = new Set(["PAID", "IN_DELIVERY"]);

export type CancellationTerms = {
  canCancel: boolean;
  free: boolean;
  freeUntil: Date;
  firstDate: string;
  refundCents: number;
  needsSellerAgreement: boolean;
  /** When the seller would have to answer by, if the sponsor asked now. */
  sellerAnswerBy: Date | null;
  blockedReason: string | null;
  /** A request already made: where it stands. */
  request: { issueId: string; stage: IssueStage; sellerDueAt: Date | null } | null;
};

/**
 * What the sponsor may do about cancelling this line now, and why not. Pure.
 * Free until `freeUntil` (the first date's start less 3 days); then, until
 * the first date starts, only with the seller's agreement (the seller has
 * until the earlier of 72 hours or the first date's start); on or after the
 * first date, not at all — it is "Report a problem" once delivered.
 */
export function cancellationTerms(
  x: { orderState: string; state: string; startsOn: Date; refundCents: number; openIssue: { id: string; kind: string; stage: string; sellerDueAt: Date | null } | null },
  now: Date,
): CancellationTerms {
  const { firstDate, firstDateStart, freeUntil } = cancelCutoff(x.startsOn);
  const base = { freeUntil, firstDate, refundCents: x.refundCents, request: null as CancellationTerms["request"] };
  const no = (blockedReason: string, extra: Partial<CancellationTerms> = {}): CancellationTerms =>
    ({ ...base, canCancel: false, free: false, needsSellerAgreement: false, sellerAnswerBy: null, blockedReason, ...extra });
  if (x.state === "UNPAID" || (x.state === "IN_DELIVERY" && !PAID_ORDER.has(x.orderState))) {
    return no("This order isn't paid yet — cancel the order itself instead.");
  }
  if (x.state === "REFUNDED") return no("This line has already been refunded.");
  if (x.state === "CANCELLED") return no("This line was cancelled with its order.");
  if (x.state !== "IN_DELIVERY") {
    return no("This line has been marked delivered, so it can't be cancelled. If something is wrong with it, use Report a problem.");
  }
  if (x.openIssue?.kind === "CANCELLATION") {
    const request = { issueId: x.openIssue.id, stage: x.openIssue.stage as IssueStage, sellerDueAt: x.openIssue.sellerDueAt };
    return no(
      x.openIssue.stage === "ESCALATED" ? "You asked the seller to cancel and it's with BTG now — they'll decide and email you."
        : `You've asked the seller to cancel — they have until ${x.openIssue.sellerDueAt ? utc(x.openIssue.sellerDueAt) : "the first date"} to answer.`,
      { request },
    );
  }
  if (x.openIssue) return no("This line is with BTG — they'll decide what happens to it.");
  if (now >= firstDateStart) {
    return no(`The first date (${firstDate}) has started, so this line can't be cancelled. If something goes wrong with it, use Report a problem.`);
  }
  if (now < freeUntil) return { ...base, canCancel: true, free: true, needsSellerAgreement: false, sellerAnswerBy: null, blockedReason: null };
  const sellerAnswerBy = new Date(Math.min(now.getTime() + CANCEL_ANSWER_HOURS * HOUR, firstDateStart.getTime()));
  return { ...base, canCancel: true, free: false, needsSellerAgreement: true, sellerAnswerBy, blockedReason: null };
}

/** 2S4-BE-12 — a line with nothing open on it (a cancellation request waiting, or with BTG, holds the overdue steps). */
const noOpenIssue = { issues: { none: { stage: { in: OPEN_STAGES } } } } satisfies Prisma.OrderLineDeliveryWhereInput;

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
  /* 2S4-BE-12 — a paid line cancelled: when, by whom, why. */
  cancelledAt: true, cancelledBy: true, cancelNote: true,
  /* 2S4-BE-11 — the line's problems and how each went, oldest first. */
  issues: { select: ISSUE_SELECT, orderBy: { openedAt: "asc" } },
  line: {
    select: {
      title: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true, lineTotalCents: true, inventoryItemId: true,
      order: { select: { id: true, state: true, createdAt: true, contractedAt: true, billingName: true, billingEmail: true, totalCents: true } },
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
  | "ESCALATED" | "SETTLED" | "BTG_DECIDED" | "CLOSED" | "REMINDED" | "CONFIRMED"
  /* 2S4-BE-12 — a cancellation: asked for, the seller's answer, or made outright by the sponsor or the seller. */
  | "CANCELLATION_REQUESTED" | "CANCELLATION_ACCEPTED" | "CANCELLATION_DECLINED" | "CANCELLED";
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
/** 2S4-BE-12 — a cancellation the seller agreed to. */
const CANCEL_AGREED_WORDS = "Settled between them — the seller agreed to cancel; the line is refunded in full";
const settledWords = (i: { kind: string; outcome: string | null }) =>
  i.kind === "CANCELLATION" ? CANCEL_AGREED_WORDS : SETTLED_WORDS[i.outcome ?? ""] ?? "Settled between them";

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
    if (i.kind === "CANCELLATION") {
      out.push(item({ at: i.openedAt, kind: "CANCELLATION_REQUESTED", by: "SPONSOR", name: who.sponsor, text: `${who.sponsor} asked to cancel`, note: i.problemNote, issueId: i.id }));
      if (i.sellerAnswer && i.sellerAnsweredAt) {
        const accepted = i.sellerAnswer === "ACCEPT";
        out.push(item({
          at: i.sellerAnsweredAt, kind: accepted ? "CANCELLATION_ACCEPTED" : "CANCELLATION_DECLINED", by: "SELLER", name: i.sellerAnsweredByName,
          text: `${i.sellerAnsweredByName ?? who.seller} ${accepted ? "agreed to cancel" : "declined to cancel"}`, note: i.sellerNote, issueId: i.id, answer: i.sellerAnswer as SellerAnswer,
        }));
      }
    }
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
          at: i.closedAt, kind: "BTG_DECIDED", by: "BTG",
          text: outcome === "REFUNDED" ? "Cancelled and refunded by BTG" : outcome === "KEPT" ? "BTG kept the line — it goes ahead as booked" : "Delivery confirmed by BTG",
          note: i.closingNote, issueId: i.id, outcome,
        }));
      } else if (i.stage === "SETTLED") {
        out.push(item({ at: i.closedAt, kind: "SETTLED", by: "SYSTEM", text: settledWords(i), issueId: i.id, outcome }));
      } else {
        out.push(item({
          at: i.closedAt, kind: "CLOSED", by: "SYSTEM", issueId: i.id, outcome,
          text: outcome === "MARKED_DELIVERED" ? "Marked delivered late · taken off BTG's desk"
            : outcome === "SELLER_CANCELLED" ? "Closed · the seller cancelled the line"
            : "Closed · the order was cancelled or refunded",
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
  /* 2S4-BE-12 — cancelled outright (an agreed or BTG-decided cancellation reads from its issue above). */
  if (r.cancelledAt && (r.cancelledBy === "SPONSOR" || r.cancelledBy === "SELLER")) {
    const bySponsor = r.cancelledBy === "SPONSOR";
    out.push(item({
      at: r.cancelledAt, kind: "CANCELLED", by: bySponsor ? "SPONSOR" : "SELLER", name: bySponsor ? who.sponsor : who.seller,
      text: `Cancelled by ${bySponsor ? who.sponsor : who.seller} · refunded in full`, note: r.cancelNote,
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

/** 2S4-BE-12 — what the seller is told before cancelling: cancelling 2 in 90 days means BTG checks their new listings. Pure. */
export function sellerCancelWarning(cancellationsLast90Days: number): string {
  return cancellationsLast90Days + 1 >= SELLER_CANCELLATION_LIMIT
    ? `You've cancelled ${cancellationsLast90Days} sold ${cancellationsLast90Days === 1 ? "line" : "lines"} in the last ${SELLER_CANCELLATION_WINDOW_DAYS} days. Cancelling this one means BTG checks your new listings before they go live.`
    : `Cancelling ${SELLER_CANCELLATION_LIMIT} sold lines in ${SELLER_CANCELLATION_WINDOW_DAYS} days means BTG checks your new listings before they go live.`;
}

/** The open issue on a line, if any — at most one (DeliveryIssue_one_open_per_line). */
const openOf = (issues: IssueRow[]) => issues.find((i) => OPEN_STAGES.includes(i.stage as IssueStage)) ?? null;

/** Whether the seller may cancel this line now (2S4-BE-12): paid, still waiting to be delivered, nothing with BTG but an overdue hand-over. */
const sellerMayCancel = (r: Pick<SaleRow, "state" | "issues"> & { line: { order: { state: string } } }) => {
  const open = openOf(r.issues);
  return r.state === "IN_DELIVERY" && PAID_ORDER.has(r.line.order.state) && (!open || open.kind === "OVERDUE");
};

function saleView(r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>, shareCents: number, now: Date, cancellationsLast90Days = 0) {
  const order = r.line.order;
  const paid = PAID_STATES.has(order.state);
  const contact = names.contact.get(r.sponsorId);
  const team = r.propertyId ? names.team.get(r.propertyId) ?? null : null;
  const athlete = r.athleteId ? names.athlete.get(r.athleteId) ?? null : null;
  const issue = currentIssue(r.issues);
  const open = openOf(r.issues);
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
    /* Not while the sponsor's request to cancel waits for an answer, or is with BTG (2S4-BE-12). */
    canMarkDelivered: r.state === "IN_DELIVERY" && open?.kind !== "CANCELLATION",
    issue: issue ? issueSummary(issue, now) : null,
    /* The seller's move: answer the sponsor's problem within the 72 hours. */
    canAnswerProblem: r.state === "PROBLEM" && sellerCanAnswer(issue, now),
    /* 2S4-BE-12 — the sponsor asked to cancel: accept or decline before the deadline. */
    canAnswerCancellation: open?.kind === "CANCELLATION" && sellerCanAnswer(open, now),
    cancellation: {
      canCancel: sellerMayCancel(r),
      cancellationsLast90Days,
      limit: SELLER_CANCELLATION_LIMIT,
      windowDays: SELLER_CANCELLATION_WINDOW_DAYS,
      warning: sellerCancelWarning(cancellationsLast90Days),
      cancelled: r.cancelledAt ? { at: r.cancelledAt, by: r.cancelledBy as CancelledBy, note: r.cancelNote } : null,
    },
  };
}

/** Each seller's own cancellations in the last 90 days, for the rows' sellers. */
async function cancellationCounts(rows: Array<{ propertyId: string | null; athleteId: string | null }>, now: Date) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const seller = sellerOfLine(r);
    if (!seller || out.has(`${seller.type}:${seller.id}`)) continue;
    out.set(`${seller.type}:${seller.id}`, await sellerCancellationCount(prisma, seller, now));
  }
  return (r: { propertyId: string | null; athleteId: string | null }) => {
    const seller = sellerOfLine(r);
    return seller ? out.get(`${seller.type}:${seller.id}`) ?? 0 : 0;
  };
}

/** 2S4-BE-06 — the seller's Orders page: every line it sells, newest first, its own share only. */
export async function mySales(actor: Actor, now = new Date()) {
  sellerScope(actor, "read");
  const rows = await prisma.orderLineDelivery.findMany({
    where: whereFor(actor, "orderDelivery", "read"), select: SALE_SELECT, orderBy: { createdAt: "desc" }, take: 200,
  });
  const [names, shares, counts] = await Promise.all([namesFor(rows), sharesFor(actor, rows.map((r) => r.lineId)), cancellationCounts(rows, now)]);
  return { sales: rows.map((r) => saleView(r, names, shares.get(r.lineId) ?? 0, now, counts(r))) };
}

export async function mySale(actor: Actor, lineId: string, now = new Date()) {
  sellerScope(actor, "read");
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "read"), lineId }, select: SALE_SELECT });
  if (!row) throw new ForbiddenError("orderDelivery", "read");
  const [names, shares, counts] = await Promise.all([namesFor([row]), sharesFor(actor, [row.lineId]), cancellationCounts([row], now)]);
  return { ...saleView(row, names, shares.get(row.lineId) ?? 0, now, counts(row)), timeline: timelineOf(row, whoOf(row, names)) };
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
    /* The order's row lock first (2S4-BE-12): a cancellation of this line, or the order moving, waits — or is waited for and read. */
    const found = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: { orderId: true } });
    if (!found) throw new ForbiddenError("orderDelivery", "write");
    await lockOrder(tx, found.orderId);
    const row = await tx.orderLineDelivery.findFirst({
      where: { ...whereFor(actor, "orderDelivery", "write"), lineId },
      select: {
        id: true, orderId: true, state: true,
        issues: { where: { stage: { in: OPEN_STAGES } }, select: { kind: true, stage: true } },
        line: { select: { title: true, order: { select: { tenantId: true, state: true, createdBy: true, billingEmail: true, billingName: true } } } },
      },
    });
    if (!row) throw new ForbiddenError("orderDelivery", "write");
    if (row.state !== "IN_DELIVERY") {
      throw new DeliveryError(row.state === "UNPAID" ? "You can mark it delivered once the sponsor has paid." : `This line is ${row.state.toLowerCase().replace("_", " ")} — it can't be marked delivered now.`);
    }
    const asked = row.issues.find((i) => i.kind === "CANCELLATION");
    if (asked) {
      throw new DeliveryError(asked.stage === "ESCALATED"
        ? "The sponsor asked to cancel this line and BTG is deciding — it can be marked delivered if BTG keeps it."
        : "The sponsor asked to cancel this line — accept or decline their request first.");
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
/** What cancelling a line gives back: the line's total — or, when it is the order's last live line, what is left of the order's total (the fee too). Pure. */
export function refundCentsFor(
  line: { lineId: string; lineTotalCents: number; orderTotalCents: number },
  siblings: Array<{ lineId: string; state: string }>, refundedCents: number,
): number {
  const othersLive = siblings.filter((x) => x.lineId !== line.lineId && x.state !== "REFUNDED" && x.state !== "CANCELLED").length;
  return othersLive === 0 ? Math.max(0, line.orderTotalCents - refundedCents) : line.lineTotalCents;
}

/** A line's own refund, else (refunded with its order) the order's whole-order refund. */
const refundOfLine = (lineId: string, state: string, refunds: SponsorRefund[]) =>
  refunds.find((x) => x.lineId === lineId) ?? (state === "REFUNDED" ? refunds.find((x) => x.lineId === null) ?? null : null);

/** Readers who see the sponsor's side of an order (its cancellation terms, its refunds): the sponsor, and BTG. */
const sponsorSide = (scope: Scope) => scope === "own-sponsor" || scope === "own-tenant" || scope === "any";

export async function orderDeliveries(actor: Actor, orderId: string, now = new Date()) {
  const readScope = assertAllowed(actor, "orderDelivery", "read");
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
  /* 2S4-BE-12 / -13 — the sponsor's side only: what cancelling each line would do, and each refund's state. */
  const sponsorView = sponsorSide(readScope);
  const refunds = sponsorView ? (await refundsForOrders(prisma, [orderId])).get(orderId) ?? [] : [];
  const refunded = refunds.reduce((sum, x) => sum + x.amountCents, 0);
  const mayCancel = can(actor, "orderDelivery", "write") && scopeOf(actor, "orderDelivery", "write") === "own-sponsor";
  const termsOf = (r: SaleRow) => {
    const t = cancellationTerms({
      orderState: r.line.order.state, state: r.state, startsOn: r.line.startsOn, openIssue: openOf(r.issues),
      refundCents: refundCentsFor({ lineId: r.lineId, lineTotalCents: r.line.lineTotalCents, orderTotalCents: r.line.order.totalCents }, rows, refunded),
    }, now);
    return mayCancel || !t.canCancel ? t : { ...t, canCancel: false, blockedReason: "Only the sponsor's admin can cancel a line." };
  };
  return {
    orderId,
    confirmWindowHours: CONFIRM_WINDOW_HOURS,
    answerWindowHours: ANSWER_WINDOW_HOURS,
    freeCancelDays: FREE_CANCEL_DAYS,
    refunds,
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
      /* 2S4-BE-12 — cancelling it (null for a seller reading its own lines). */
      cancellation: sponsorView ? termsOf(r) : null,
      cancelled: r.cancelledAt ? { at: r.cancelledAt, by: r.cancelledBy as CancelledBy, note: r.cancelNote } : null,
      /* 2S4-BE-13 — its refund: on its way, or sent on a date. */
      refund: sponsorView ? refundOfLine(r.lineId, r.state, refunds) : null,
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
  line: {
    select: {
      title: true, inventoryItemId: true, startsOn: true, endsOn: true, lineTotalCents: true,
      order: { select: { tenantId: true, state: true, totalCents: true, createdBy: true, billingEmail: true, billingName: true } },
    },
  },
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

/**
 * The buying sponsor's own line, read again under its order's row lock — for
 * an answer that may move the line or the order (2S4-BE-12: every such move
 * takes the order's lock first, so it serialises with a cancellation, the
 * seller's mark and the sweep).
 */
async function lockedSponsorLine(tx: Tx, actor: Actor, lineId: string) {
  const found = await sponsorLine(tx, actor, lineId);
  await lockOrder(tx, found.orderId);
  return tx.orderLineDelivery.findUniqueOrThrow({
    /* tenant-scope: the row just loaded through whereFor(orderDelivery, write), re-read under its order's lock. */
    where: { id: found.id }, select: EXCHANGE_ROW,
  });
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
    const row = await lockedSponsorLine(tx, actor, lineId);
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
    const row = await lockedSponsorLine(tx, actor, lineId);
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
  await refundLine(tx, actor, row, now, { cause: "PROBLEM_AGREED", lineId: row.lineId, cancellation: false });
  await maybeFulfil(tx, row.orderId, now);
  return "REFUNDED";
}

/**
 * A line already marked REFUNDED gets its money back: the order's own refund
 * when no other line is still live (reversal, stock released, Zoho told),
 * else this line's journals mirrored and its stock handed back. The whole
 * line, always — partial refunds are out of scope. Either way (2S4-BE-13) a
 * RefundDue row for Finance, naming what started it (`ctx`); the caller holds
 * the order's row lock, so two lines refunded at once still end the order.
 */
async function refundLine(
  tx: Tx, actor: AuditActor & { tenantId: string }, row: { id: string; orderId: string; lineId: string; line: { inventoryItemId: string; startsOn: Date; endsOn: Date } },
  now: Date, ctx: RefundContext,
) {
  const live = await tx.orderLineDelivery.count({
    /* tenant-scope: this order's own delivery rows, named by its id. */
    where: { orderId: row.orderId, state: { notIn: ["REFUNDED", "CANCELLED"] } },
  });
  if (live === 0) {
    /* The order's own refund records the RefundDue (the rest of its total), as this line's. */
    await moveOrderIn(tx, actor, row.orderId, "REFUNDED", now, ctx);
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
  await recordRefund(tx, actor, row.orderId, ctx, { whole: false }, now);
}

/** 2S4-BE-12 — the two ways a cancellation request reaches BTG. */
const CANCELLATION_REASONS = new Set<EscalationReason>(["SELLER_DECLINED_CANCELLATION", "SELLER_DIDNT_ANSWER_CANCELLATION"]);

/**
 * Hand an issue to BTG — only from the stages named (so a second run, or a
 * race with an answer, changes nothing). Stores why; tells BTG's admins and
 * both sides. `extra` carries the sponsor's rejection (or the seller's
 * decline), written with it. `sponsorTold` — the sponsor already has an
 * email saying so (the seller's declined answer), so only the sellers hear it.
 */
async function escalate(
  tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, issueId: string, from: IssueStage[], reason: EscalationReason, now: Date,
  extra: Prisma.DeliveryIssueUpdateManyMutationInput = {}, opts: { sponsorTold?: boolean } = {},
) {
  const text = escalationWords(reason, lastDateOf(row));
  const moved = await tx.deliveryIssue.updateMany({
    /* tenant-scope: an issue of a delivery row the caller loaded through whereFor (or the sweep found by id). */
    where: { id: issueId, stage: { in: from } },
    data: { ...extra, stage: "ESCALATED", escalatedAt: now, escalationReason: reason, escalationNote: text },
  });
  if (!moved.count) return false;
  await announceEscalation(tx, actor, row, issueId, reason, text, opts);
  return true;
}

/** Audit a hand-over to BTG, and tell BTG's admins and both sides why. */
async function announceEscalation(
  tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, issueId: string, reason: EscalationReason, text: string, opts: { sponsorTold?: boolean } = {},
) {
  await audit(tx, actor, "orderDelivery.escalate", "MarketplaceOrder", row.orderId, { after: { lineId: row.lineId, issueId, reason } });
  const [sponsorName, sellerName] = await Promise.all([sponsorNameOf(tx, row), sellerNameIn(tx, row)]);
  const cancellation = CANCELLATION_REASONS.has(reason);
  const issue = cancellation
    ? await tx.deliveryIssue.findUniqueOrThrow({
        /* tenant-scope: the issue just handed over, of a row the caller loaded through whereFor (or the sweep found by id). */
        where: { id: issueId }, select: { problemNote: true, sellerNote: true },
      })
    : null;
  for (const admin of await btgAdmins(tx, row.tenantId)) {
    const to = { tenantId: row.tenantId, email: admin.email };
    const data = { sponsorName, sellerName, title: row.line.title, orderRef: orderRef(row.orderId), reason: text, issueUrl: appUrl(`/admin/delivery-issues/${row.lineId}`) };
    if (issue) {
      await tell(tx, to, "delivery.cancellationEscalated", issueId, {
        ...data, firstDate: day(row.line.startsOn), sponsorReason: issue.problemNote.slice(0, 500), sellerReason: issue.sellerNote?.slice(0, 500) ?? "",
      });
    } else {
      await tell(tx, to, "delivery.escalated", issueId, data);
    }
  }
  const words = { title: row.line.title, orderRef: orderRef(row.orderId), reason: text, ...(cancellation ? { what: "refund and cancel the line, or keep it going ahead as booked" } : {}) };
  if (opts.sponsorTold) {
    for (const r of await sellerRecipients(tx, row)) await tell(tx, r, "delivery.withBtg", issueId, { ...words, firstName: r.firstName, link: appUrl(salePath(r, row.lineId)) });
  } else {
    await tellBothSides(tx, row, "delivery.withBtg", issueId, words);
  }
}

/* ── cancelling a paid line — 2S4-BE-12 ─────────────────────────────────── */

type Db = Tx | typeof prisma;

/** The line's terms as they stand, read in `db` (under the order's lock when about to act on them). */
async function termsIn(db: Db, row: ExchangeRow, now: Date) {
  const siblings = await db.orderLineDelivery.findMany({
    /* tenant-scope: this order's own delivery rows, named by its id (the row was loaded through the caller's scope). */
    where: { orderId: row.orderId }, select: { lineId: true, state: true },
  });
  const refunded = await db.refundDue.aggregate({
    /* tenant-scope: this order's own refunds, named by its id. */
    where: { orderId: row.orderId }, _sum: { amountCents: true },
  });
  const open = await db.deliveryIssue.findFirst({
    /* tenant-scope: the open issue of the row the caller loaded through its scope. */
    where: { deliveryId: row.id, stage: { in: OPEN_STAGES } }, select: { id: true, kind: true, stage: true, sellerDueAt: true },
  });
  return cancellationTerms({
    orderState: row.line.order.state, state: row.state, startsOn: row.line.startsOn, openIssue: open,
    refundCents: refundCentsFor({ lineId: row.lineId, lineTotalCents: row.line.lineTotalCents, orderTotalCents: row.line.order.totalCents }, siblings, refunded._sum.amountCents ?? 0),
  }, now);
}

/** The refund this line's cancellation recorded — the line's own row (the last line's carries the rest of the order). */
async function refundOf(tx: Tx, row: { orderId: string; lineId: string }) {
  const r = await tx.refundDue.findFirst({
    /* tenant-scope: this order's own refund for this line, by the unique pair. */
    where: { orderId: row.orderId, lineId: row.lineId }, select: { id: true, amountCents: true, state: true, sentOn: true },
  });
  return r ? { id: r.id, amountCents: r.amountCents, state: r.state as "OPEN" | "SENT", sentOn: r.sentOn ? day(r.sentOn) : null } : null;
}

const refundHow = (r: { state: string } | null) =>
  !r ? "" : r.state === "SENT" ? "It has gone back to the card you paid with." : "BTG sends it back to you the way you paid — we'll email you when it's sent.";

/**
 * GET /deliveries/{id}/cancellation — the terms for the sponsor (and BTG):
 * may it be cancelled now, free or only with the seller's agreement, until
 * when it is free, what comes back, and why not. A line outside the
 * caller's reach is 404.
 */
export async function cancellationFor(actor: Actor, lineId: string, now = new Date()) {
  const scope = assertAllowed(actor, "orderDelivery", "read");
  if (!sponsorSide(scope)) throw new ForbiddenError("orderDelivery", "read");
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "read"), lineId }, select: EXCHANGE_ROW });
  if (!row) throw new DeliveryError("No such line.", 404);
  const t = await termsIn(prisma, row, now);
  const mayCancel = scopeOf(actor, "orderDelivery", "write") === "own-sponsor";
  return {
    lineId: row.lineId, orderId: row.orderId, title: row.line.title, freeCancelDays: FREE_CANCEL_DAYS, answerWindowHours: CANCEL_ANSWER_HOURS,
    ...(mayCancel || !t.canCancel ? t : { ...t, canCancel: false, blockedReason: "Only the sponsor's admin can cancel a line." }),
  };
}

/**
 * Cancel a line still IN_DELIVERY and refund it — the caller holds the
 * order's lock. Guarded on the state, so a second click (or a race) finds it
 * moved and changes nothing. Anything still open on the line ends with it
 * (an overdue hand-over the seller's cancellation answers).
 */
async function cancelAndRefund(
  tx: Tx, actor: AuditActor & { tenantId: string }, row: ExchangeRow, c: { by: Exclude<CancelledBy, "BTG">; note: string | null; cause: RefundCause }, now: Date,
) {
  const seller = sellerOfLine(row);
  const moved = await tx.orderLineDelivery.updateMany({
    /* tenant-scope: the row the caller loaded through whereFor(orderDelivery, write), only while still waiting to be delivered. */
    where: { id: row.id, state: "IN_DELIVERY" },
    data: {
      state: "REFUNDED", cancelledAt: now, cancelledBy: c.by, cancelledByUser: actor.userId, cancelNote: c.note ? c.note.slice(0, 2000) : null,
      ...(c.by === "SELLER" && seller ? { cancelledSellerType: seller.type, cancelledSellerId: seller.id } : {}),
    },
  });
  if (!moved.count) throw new DeliveryError("This line has just changed — reload to see where it stands.");
  await tx.deliveryIssue.updateMany({
    /* tenant-scope: the issues of the row just moved, by its id. */
    where: { deliveryId: row.id, stage: { in: OPEN_STAGES } },
    data: { stage: "CLOSED", outcome: c.by === "SELLER" ? "SELLER_CANCELLED" : "ORDER_ENDED", closedAt: now, closedBy: actor.userId ?? "system" },
  });
  await refundLine(tx, actor, row, now, { cause: c.cause, lineId: row.lineId, cancellation: true });
  await maybeFulfil(tx, row.orderId, now);
  return refundOf(tx, row);
}

/** The caller's own line, found through its scope (404 otherwise), its order locked, and read again under the lock. */
async function lockedLine(tx: Tx, actor: Actor, lineId: string, action: "write" | "approve") {
  const found = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", action), lineId }, select: { id: true, orderId: true } });
  if (!found) throw new DeliveryError("No such line.", 404);
  await lockOrder(tx, found.orderId);
  return tx.orderLineDelivery.findUniqueOrThrow({
    /* tenant-scope: the row just loaded through whereFor(orderDelivery, …), re-read under its order's lock. */
    where: { id: found.id }, select: EXCHANGE_ROW,
  });
}

/**
 * POST /deliveries/{id}/cancel — the buying sponsor's admin cancels a paid
 * line. Before the cut-off (the first date's start less 3 days): refunded at
 * once, the reason optional, both sides told. After it, until the first date
 * starts: a reason is required and the SELLER is asked — they have until
 * the earlier of 72 hours or the first date's start. On or after the first
 * date: 409, "Report a problem".
 */
export async function cancelLine(actor: Actor, lineId: string, input: { reason?: string | null }, now = new Date()) {
  const scope = assertAllowed(actor, "orderDelivery", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("orderDelivery", "write");
  const reason = input.reason?.trim() ?? "";
  return prisma.$transaction(async (tx) => {
    const row = await lockedLine(tx, actor, lineId, "write");
    const terms = await termsIn(tx, row, now);
    if (!terms.canCancel) throw new DeliveryError(terms.blockedReason ?? "This line can't be cancelled now.");
    const sponsorName = await sponsorNameOf(tx, row);
    const sponsor = await sponsorRecipient(tx, row.line.order);

    if (terms.free) {
      const refund = await cancelAndRefund(tx, actor, row, { by: "SPONSOR", note: reason || null, cause: "SPONSOR_CANCELLED" }, now);
      await audit(tx, actor, "orderDelivery.cancel", "MarketplaceOrder", row.orderId, {
        before: { lineId, state: "IN_DELIVERY" }, after: { lineId, state: "REFUNDED", by: "SPONSOR", free: true, refundId: refund?.id ?? null, refundCents: refund?.amountCents ?? 0 },
      });
      if (sponsor) {
        await tell(tx, sponsor, "delivery.cancelConfirmed", lineId, {
          firstName: sponsor.firstName, title: row.line.title, orderRef: orderRef(row.orderId), amount: usd(refund?.amountCents ?? terms.refundCents),
          refundHow: refundHow(refund), orderUrl: appUrl(`/sponsor/orders/${row.orderId}`),
        });
      }
      for (const r of await sellerRecipients(tx, row)) {
        await tell(tx, r, "sale.lineCancelled", lineId, {
          firstName: r.firstName, sponsorName, title: row.line.title, orderRef: orderRef(row.orderId), firstDate: terms.firstDate,
          how: `${sponsorName} cancelled it more than ${FREE_CANCEL_DAYS} days before its first date, so there's nothing to deliver.${reason ? ` Their reason: "${reason.slice(0, 500)}"` : ""}`,
          saleUrl: appUrl(salePath(r, lineId)),
        });
      }
      return { outcome: "REFUNDED" as const, lineId, orderId: row.orderId, state: "REFUNDED" as const, refundCents: refund?.amountCents ?? terms.refundCents, refund };
    }

    if (!reason) throw new DeliveryError("Say why you want to cancel — the seller reads this, and BTG too if it comes to them.", 422);
    const sellerDueAt = terms.sellerAnswerBy!;
    const issue = await tx.deliveryIssue.create({
      data: {
        tenantId: row.tenantId, orderId: row.orderId, lineId: row.lineId, deliveryId: row.id, kind: "CANCELLATION", stage: "SELLER_TO_ANSWER",
        openedAt: now, openedBy: actor.userId, problemNote: reason.slice(0, 2000), sellerDueAt,
      },
      select: { id: true },
    });
    await audit(tx, actor, "orderDelivery.askCancel", "MarketplaceOrder", row.orderId, {
      after: { lineId, issueId: issue.id, stage: "SELLER_TO_ANSWER", sellerDueAt: sellerDueAt.toISOString(), reason: reason.slice(0, 500) },
    });
    for (const r of await sellerRecipients(tx, row)) {
      await tell(tx, r, "sale.cancellationRequested", issue.id, {
        firstName: r.firstName, sponsorName, title: row.line.title, orderRef: orderRef(row.orderId), firstDate: terms.firstDate,
        reason: reason.slice(0, 500), answerBy: utc(sellerDueAt), saleUrl: appUrl(salePath(r, lineId)),
      });
    }
    return {
      outcome: "ASKED_SELLER" as const, lineId, orderId: row.orderId, state: "IN_DELIVERY" as const, issueId: issue.id,
      stage: "SELLER_TO_ANSWER" as const, sellerAnswerBy: sellerDueAt, refundCents: terms.refundCents,
    };
  });
}

/**
 * POST /sales/{id}/cancellation-answer — the seller answers the sponsor's
 * request to cancel, before its deadline. ACCEPT: the line is refunded
 * (settled between them). DECLINE, with a reason: BTG decides. Either way
 * the sponsor is emailed the answer.
 */
export async function answerCancellation(actor: Actor, lineId: string, input: { decision: "ACCEPT" | "DECLINE"; reason?: string | null }, now = new Date()) {
  sellerScope(actor, "write");
  if (input.decision !== "ACCEPT" && input.decision !== "DECLINE") throw new DeliveryError("Answer ACCEPT or DECLINE.", 422);
  const reason = input.reason?.trim() ?? "";
  if (input.decision === "DECLINE" && !reason) throw new DeliveryError("Say why you can't cancel it — the sponsor reads this, and BTG decides.", 422);
  const byName = await markerName(actor);
  return prisma.$transaction(async (tx) => {
    const row = await lockedLine(tx, actor, lineId, "write");
    const issue = await openIssue(tx, row.id);
    if (!issue || issue.kind !== "CANCELLATION") throw new DeliveryError("There's no request to cancel this line waiting for your answer.");
    if (issue.stage === "ESCALATED") throw new DeliveryError("This request is with BTG now — they'll decide it.");
    if (!sellerCanAnswer(issue, now)) throw new DeliveryError("The time to answer has passed, so this request goes to BTG.");
    const answered = {
      sellerAnswer: input.decision, sellerAnsweredAt: now, sellerAnsweredBy: actor.userId, sellerAnsweredByName: byName, sellerNote: reason ? reason.slice(0, 2000) : null,
    };
    const sponsor = await sponsorRecipient(tx, row.line.order);
    const tellSponsor = (answer: string) => sponsor
      ? tell(tx, sponsor, "delivery.cancellationAnswered", issue.id, {
          firstName: sponsor.firstName, sellerName: byName, title: row.line.title, orderRef: orderRef(row.orderId), answer, orderUrl: appUrl(`/sponsor/orders/${row.orderId}`),
        })
      : Promise.resolve();

    if (input.decision === "ACCEPT") {
      const moved = await tx.deliveryIssue.updateMany({
        /* tenant-scope: the open issue of the row just loaded through whereFor(orderDelivery, write), only while still the seller's turn. */
        where: { id: issue.id, stage: "SELLER_TO_ANSWER" },
        data: { ...answered, stage: "SETTLED", outcome: "REFUNDED", closedAt: now, closedBy: actor.userId },
      });
      if (!moved.count) throw new DeliveryError("This request has moved on — reload to see where it stands.");
      const refund = await cancelAndRefund(tx, actor, row, { by: "AGREED", note: issue.problemNote, cause: "CANCELLATION_AGREED" }, now);
      await audit(tx, actor, "orderDelivery.answerCancellation", "MarketplaceOrder", row.orderId, {
        before: { lineId, issueId: issue.id, stage: "SELLER_TO_ANSWER", state: "IN_DELIVERY" },
        after: { lineId, issueId: issue.id, stage: "SETTLED", decision: "ACCEPT", state: "REFUNDED", refundId: refund?.id ?? null },
      });
      await tellSponsor(`agreed to cancel it, so it is refunded in full (${usd(refund?.amountCents ?? row.line.lineTotalCents)}). ${refundHow(refund)}`.trim());
      return { lineId, issueId: issue.id, decision: "ACCEPT" as const, stage: "SETTLED" as const, state: "REFUNDED" as DeliveryState, refund };
    }

    const sent = await escalate(tx, actor, row, issue.id, ["SELLER_TO_ANSWER"], "SELLER_DECLINED_CANCELLATION", now, answered, { sponsorTold: true });
    if (!sent) throw new DeliveryError("This request has moved on — reload to see where it stands.");
    await audit(tx, actor, "orderDelivery.answerCancellation", "MarketplaceOrder", row.orderId, {
      before: { lineId, issueId: issue.id, stage: "SELLER_TO_ANSWER" }, after: { lineId, issueId: issue.id, stage: "ESCALATED", decision: "DECLINE" },
    });
    await tellSponsor(`declined to cancel it: "${reason.slice(0, 500)}". BTG will decide — refund it, or keep it going ahead as booked — and email you.`);
    return { lineId, issueId: issue.id, decision: "DECLINE" as const, stage: "ESCALATED" as const, state: "IN_DELIVERY" as DeliveryState, refund: null };
  });
}

/**
 * POST /sales/{id}/cancel — the seller cancels a line it can't deliver, any
 * time while it is IN_DELIVERY (after its date too, if it never delivered).
 * A reason is required. The sponsor is refunded in full at once and emailed.
 * It counts against the seller: 2 in 90 days and BTG checks its new listings.
 */
export async function sellerCancel(actor: Actor, lineId: string, reason: string, now = new Date()) {
  sellerScope(actor, "write");
  const text = reason?.trim() ?? "";
  if (!text) throw new DeliveryError("Say why you can't deliver it — the sponsor reads this.", 422);
  const byName = await markerName(actor);
  const out = await prisma.$transaction(async (tx) => {
    const row = await lockedLine(tx, actor, lineId, "write");
    if (row.state !== "IN_DELIVERY") {
      throw new DeliveryError(
        row.state === "UNPAID" ? "The sponsor hasn't paid for this yet, so there's nothing to cancel."
          : row.state === "REFUNDED" || row.state === "CANCELLED" ? "This line has already been cancelled or refunded."
          : "This line has been marked delivered, so it can't be cancelled — the sponsor's answer decides it now.",
      );
    }
    if (!PAID_ORDER.has(row.line.order.state)) throw new DeliveryError("This order isn't paid and in delivery, so the line can't be cancelled.");
    const open = await openIssue(tx, row.id);
    if (open?.kind === "CANCELLATION") {
      throw new DeliveryError(open.stage === "ESCALATED"
        ? "The sponsor asked to cancel this line and BTG is deciding it — BTG will refund it or keep it."
        : "The sponsor has asked to cancel this line — accept their request instead.");
    }
    const refund = await cancelAndRefund(tx, actor, row, { by: "SELLER", note: text, cause: "SELLER_CANCELLED" }, now);
    await audit(tx, actor, "orderDelivery.sellerCancel", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: "IN_DELIVERY" },
      after: { lineId, state: "REFUNDED", by: "SELLER", seller: sellerOfLine(row), refundId: refund?.id ?? null, refundCents: refund?.amountCents ?? 0, ...(open ? { closedIssueId: open.id } : {}) },
    });
    const sponsor = await sponsorRecipient(tx, row.line.order);
    if (sponsor) {
      await tell(tx, sponsor, "delivery.sellerCancelled", lineId, {
        firstName: sponsor.firstName, sellerName: byName, title: row.line.title, orderRef: orderRef(row.orderId), reason: text.slice(0, 500),
        amount: usd(refund?.amountCents ?? row.line.lineTotalCents), refundHow: refundHow(refund), orderUrl: appUrl(`/sponsor/orders/${row.orderId}`),
      });
    }
    return { lineId, orderId: row.orderId, state: "REFUNDED" as const, refund, seller: sellerOfLine(row) };
  });
  const cancellationsLast90Days = out.seller ? await sellerCancellationCount(prisma, out.seller, now) : 0;
  return {
    lineId: out.lineId, orderId: out.orderId, state: out.state, refund: out.refund, cancellationsLast90Days,
    /* The standing rule just reached: BTG now checks the seller's new listings. */
    listingsChecked: cancellationsLast90Days >= SELLER_CANCELLATION_LIMIT,
  };
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
    where: { ...books, state: "DELIVERED", confirmDueAt: { lte: now } }, select: { id: true, orderId: true }, take: 500,
  });
  for (const { id, orderId } of due) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        /* The order's row lock first, as every move of its lines takes it (a cancellation racing this pass waits, or is waited for). */
        await lockOrder(tx, orderId);
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
      where: { ...books, stage, [dueField]: { lte: now } }, select: { id: true, deliveryId: true, kind: true }, take: 500,
    });
    for (const { id, deliveryId, kind } of waiting) {
      try {
        const sent = await prisma.$transaction(async (tx) => {
          const row = await tx.orderLineDelivery.findUniqueOrThrow({
            /* tenant-scope: the delivery row of the issue the sweep found, by id. */
            where: { id: deliveryId }, select: EXCHANGE_ROW,
          });
          /* 2S4-BE-12 — a request to cancel the seller didn't answer in time. */
          const why: EscalationReason = kind === "CANCELLATION" ? "SELLER_DIDNT_ANSWER_CANCELLATION" : reason;
          return escalate(tx, { userId: null, tenantId: row.tenantId }, row, id, [stage], why, now);
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
    where: { ...books, state: "IN_DELIVERY", overdueEscalatedAt: null, ...noOpenIssue, ...dueBy(new Date(now.getTime() - ESCALATE_OVERDUE_DAYS * DAY)) }, select: { id: true }, take: 500,
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
        ...books, state: "IN_DELIVERY", overdueEscalatedAt: null, ...noOpenIssue, ...(mode === "second" ? { secondRemindedAt: null } : { remindedAt: null, secondRemindedAt: null }),
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
      /* Moved meanwhile (refunded): nothing was written — not a failure. */
      if (error instanceof OrderStateConflictError) continue;
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
      /* tenant-scope: the row named by the sweep, by id, only while still unmarked, not yet handed over, and with nothing open on it. */
      where: { id, state: "IN_DELIVERY", overdueEscalatedAt: null, ...noOpenIssue }, data: { overdueEscalatedAt: now },
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
  /* The problem being decided (the open issue's own words — 2S4-BE-12: or the sponsor's reason for asking to cancel), else the row's. */
  const problem = issue?.kind === "PROBLEM" || issue?.kind === "CANCELLATION"
    ? { text: issue.problemNote, at: issue.openedAt } : r.problemAt && r.problemNote ? { text: r.problemNote, at: r.problemAt } : null;
  const marked = issue?.kind === "CANCELLATION"
    ? issue.sellerNote && issue.sellerAnsweredAt ? { text: issue.sellerNote, at: issue.sellerAnsweredAt, proofCount: 0, link: null } : null
    : issue?.kind === "PROBLEM" && issue.markedAt
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
    /* 2S4-BE-12 — what BTG may decide: a request to cancel is REFUND or KEEP; a problem or an overdue line, CONFIRM or REFUND. */
    decisions: issue?.stage !== "ESCALATED" ? [] : issue.kind === "CANCELLATION" ? ["REFUND", "KEEP"] as const : ["CONFIRM", "REFUND"] as const,
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
      where: { ...where, state: "IN_DELIVERY", overdueEscalatedAt: null, ...noOpenIssue, OR: [{ redeliverOn: null, line: { endsOn: { lt: now } } }, { redeliverOn: { lt: now } }] },
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
      settlement: { issueId: i.id, kind: i.kind as IssueKind, outcome: i.outcome as IssueOutcome, at: i.closedAt, text: settledWords(i), answer: i.sellerAnswer as SellerAnswer },
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
 * ESCALATED one). A problem or an overdue line: CONFIRM (the line is
 * delivered; its money is released on the usual rules) or REFUND (the line's
 * own refund — the whole order when no other line is still live, else this
 * line's journals reversed and its stock released). A sponsor's request to
 * cancel (2S4-BE-12): REFUND (cancelled and refunded — a cancellation refund,
 * which doesn't stop the sponsor's limit rising) or KEEP (the request closes;
 * the line goes ahead, IN_DELIVERY). A note is required: everyone reads it.
 */
export async function resolveIssue(actor: Actor, lineId: string, decision: "CONFIRM" | "REFUND" | "KEEP", note: string, now = new Date()) {
  assertDesk(actor);
  const text = note?.trim() ?? "";
  if (!text) throw new DeliveryError("Add a note — the sponsor and the seller both read it.", 422);
  return prisma.$transaction(async (tx) => {
    const found = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: { orderId: true } });
    if (!found) throw new ForbiddenError("orderDelivery", "approve");
    /* The order's row lock first: a decision and a cancellation, a mark or the sweep serialise. */
    await lockOrder(tx, found.orderId);
    const row = await tx.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: EXCHANGE_ROW });
    if (!row) throw new ForbiddenError("orderDelivery", "approve");
    const issue = await openIssue(tx, row.id);
    if (!issue || issue.stage !== "ESCALATED") {
      throw new DeliveryError(
        issue ? "The seller and the sponsor are still settling this between them — it comes to BTG only if they can't."
          : `This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for a decision.`,
      );
    }
    const cancellation = issue.kind === "CANCELLATION";
    if (cancellation && decision === "CONFIRM") throw new DeliveryError("A request to cancel is decided REFUND (cancel and refund the line) or KEEP (it goes ahead).", 422);
    if (!cancellation && decision === "KEEP") throw new DeliveryError("A delivery problem is decided CONFIRM (delivered) or REFUND (the line refunded).", 422);
    const outcome: IssueOutcome = decision === "CONFIRM" ? "CONFIRMED" : decision === "KEEP" ? "KEPT" : "REFUNDED";
    /* The issue first, so a whole-order refund (followOrder) finds nothing of it left open. */
    const closed = await tx.deliveryIssue.updateMany({
      /* tenant-scope: the open issue of the row just loaded through whereFor(orderDelivery, approve), only while still with BTG. */
      where: { id: issue.id, stage: "ESCALATED" }, data: { stage: "RESOLVED", outcome, closedAt: now, closedBy: actor.userId, closingNote: text.slice(0, 2000) },
    });
    if (!closed.count) throw new DeliveryError("This issue has just been decided — reload to see how.");
    const stamp = { resolvedAt: now, resolvedBy: actor.userId, resolutionNote: text.slice(0, 2000) };
    let state = row.state as DeliveryState;
    if (decision === "CONFIRM") {
      await tx.orderLineDelivery.update({
        /* tenant-scope: the row just loaded through whereFor(orderDelivery, approve). */
        where: { id: row.id }, data: { ...stamp, state: "CONFIRMED", resolution: "CONFIRMED", confirmedAt: now, confirmedBy: actor.userId, confirmedHow: "BTG" }, select: { id: true },
      });
      state = "CONFIRMED";
    } else if (decision === "REFUND") {
      const moved = await tx.orderLineDelivery.updateMany({
        /* tenant-scope: the row just loaded through whereFor(orderDelivery, approve), only while still in the state it was decided in. */
        where: { id: row.id, state: row.state },
        data: {
          ...stamp, state: "REFUNDED", resolution: "REFUNDED",
          /* 2S4-BE-12 — BTG's REFUND of a request to cancel is a cancellation (it doesn't stop the sponsor's limit rising). */
          ...(cancellation ? { cancelledAt: now, cancelledBy: "BTG", cancelledByUser: actor.userId, cancelNote: text.slice(0, 2000) } : {}),
        },
      });
      if (!moved.count) throw new DeliveryError("This line has just changed — reload to see where it stands.");
      await refundLine(tx, actor, row, now, { cause: "BTG_DECIDED", lineId: row.lineId, cancellation });
      state = "REFUNDED";
    }
    await audit(tx, actor, "orderDelivery.resolve", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: row.state, issueId: issue.id, kind: issue.kind, stage: "ESCALATED" },
      after: { lineId, state, issueId: issue.id, stage: "RESOLVED", decision, note: text.slice(0, 500) },
    });
    await maybeFulfil(tx, row.orderId, now);

    const words = decision === "CONFIRM" ? "confirmed as delivered" : decision === "KEEP" ? "kept — it goes ahead as booked" : "cancelled and refunded";
    const data = { title: row.line.title, orderRef: orderRef(row.orderId), decision: words, note: text.slice(0, 1000) };
    /* Keyed by the issue: a line can come to BTG more than once over its life. */
    await tellBothSides(tx, row, "delivery.resolved", issue.id, data);
    return { lineId, issueId: issue.id, kind: issue.kind as IssueKind, decision, state };
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
