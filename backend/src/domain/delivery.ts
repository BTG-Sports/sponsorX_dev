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
 * is therefore held until BTG resolves it — confirmed, or refunded through
 * the order's own refund (the whole order when it is the last live line, else
 * that line's journals reversed — ledger.ts `reverseOrder(…, lineId)`).
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
/** A seller is reminded once, this many days after a line's last date. */
export const OVERDUE_AFTER_DAYS = 1;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DeliveryState = "UNPAID" | "IN_DELIVERY" | "DELIVERED" | "CONFIRMED" | "PROBLEM" | "REFUNDED" | "CANCELLED";
/** Done with: nothing more happens to the line. */
const SETTLED = new Set<DeliveryState>(["CONFIRMED", "REFUNDED", "CANCELLED"]);
/** Orders whose sponsor has paid — the point the sponsor's contact appears. */
const PAID_STATES = new Set(["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"]);

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
      entry.lines.push(`${d.line.title} — ${d.line.quantity} × · ${lineDates(d.line.startsOn, d.line.endsOn).join(" to ")}`);
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
 * REFUNDED end every open line; FULFILLED by hand (BTG closing it out)
 * confirms what is left as BTG's — but never over a reported problem, which
 * is resolved on the delivery-issues desk.
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
  if (to === "FULFILLED") {
    const problem = await tx.orderLineDelivery.count({
      /* tenant-scope: this order's own delivery rows, named by its id. */
      where: { orderId, state: "PROBLEM" },
    });
    if (problem) throw new DeliveryError("A sponsor reported a problem with a line on this order — resolve it on the Delivery issues desk first.");
    await tx.orderLineDelivery.updateMany({
      where: { orderId, state: { in: ["IN_DELIVERY", "DELIVERED"] } },
      data: { state: "CONFIRMED", confirmedAt: now, confirmedBy: actor.userId ?? "system", confirmedHow: "BTG" },
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

const SALE_SELECT = {
  id: true, tenantId: true, orderId: true, lineId: true, sponsorId: true, propertyId: true, athleteId: true, state: true,
  paidAt: true, deliveredAt: true, deliveredByName: true, note: true, proofKey: true, proofLink: true, confirmDueAt: true,
  confirmedAt: true, confirmedHow: true, problemAt: true, problemNote: true, resolvedAt: true, resolution: true, resolutionNote: true,
  remindedAt: true, createdAt: true,
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
    overdue: isOverdue({ state: r.state, endsOn: r.line.endsOn }, now),
    canMarkDelivered: r.state === "IN_DELIVERY",
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
  return saleView(row, names, shares.get(row.lineId) ?? 0, now);
}

/** The key a line's proof is uploaded under — built here, never taken from the caller. */
const proofPrefix = (tenantId: string, lineId: string) => `t/${tenantId}/delivery/${lineId}/`;

/** A presigned PUT for the optional proof photo, straight to the private bucket. */
export async function requestProofUpload(actor: Actor, lineId: string, input: { contentType: keyof typeof PROOF_TYPES; bytes: number }) {
  sellerScope(actor, "write");
  if (!(input.contentType in PROOF_TYPES)) throw new DeliveryError("A photo (JPEG or PNG) or a PDF.", 422);
  if (input.bytes > PROOF_MAX_BYTES) throw new DeliveryError("Up to 10 MB.", 422);
  const row = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: { id: true, tenantId: true, lineId: true, state: true },
  });
  if (!row) throw new ForbiddenError("orderDelivery", "write");
  if (row.state !== "IN_DELIVERY") throw new DeliveryError("Proof is added when you mark the line delivered.");
  const key = `${proofPrefix(row.tenantId, row.lineId)}${randomUUID()}.${PROOF_TYPES[input.contentType]}`;
  const uploadUrl = await presignPrivateUpload(actor, key, input.contentType, { entity: "OrderLineDelivery", entityId: row.id });
  return { uploadUrl, key, contentType: input.contentType };
}

export type MarkDeliveredInput = { note: string; proofKey?: string | null; proofLink?: string | null };

/** 2S4-BE-07 — the seller marks its own line delivered, with a note; the sponsor's 24 hours start. */
export async function markDelivered(actor: Actor, lineId: string, input: MarkDeliveredInput, now = new Date()) {
  sellerScope(actor, "write");
  const note = input.note?.trim() ?? "";
  if (!note) throw new DeliveryError("Say what was delivered — the sponsor reads this note.", 422);
  const found = await prisma.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId }, select: { id: true, tenantId: true, lineId: true },
  });
  if (!found) throw new ForbiddenError("orderDelivery", "write");
  const proofKey = input.proofKey?.trim() || null;
  if (proofKey) {
    if (!proofKey.startsWith(proofPrefix(found.tenantId, found.lineId))) throw new DeliveryError("That photo wasn't uploaded for this line.", 422);
    if ((await privateObjectSize(proofKey)) === null) throw new DeliveryError("The photo hasn't arrived in storage yet — upload it again, or mark delivered without it.", 422);
  }
  const proofLink = input.proofLink?.trim() || null;
  if (proofLink && !/^https:\/\//i.test(proofLink)) throw new DeliveryError("A link starts with https://", 422);

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
    await audit(tx, actor, "orderDelivery.markDelivered", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: "IN_DELIVERY" }, after: { lineId, state: "DELIVERED", confirmDueAt: confirmDueAt.toISOString(), proof: Boolean(proofKey || proofLink) },
    });
    const sponsor = await sponsorRecipient(tx, row.line.order);
    if (sponsor) {
      await tell(tx, sponsor, "delivery.marked", lineId, {
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
    lines: rows.map((r) => ({
      lineId: r.lineId,
      title: r.line.title,
      state: r.state as DeliveryState,
      seller: (r.propertyId ? names.team.get(r.propertyId) : null) ?? (r.athleteId ? names.athlete.get(r.athleteId) : null) ?? "The seller",
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
    })),
  };
}

/** The buying sponsor's own line, for its answer. */
async function sponsorLine(tx: Tx, actor: Actor, lineId: string) {
  const scope = assertAllowed(actor, "orderDelivery", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("orderDelivery", "write");
  const row = await tx.orderLineDelivery.findFirst({
    where: { ...whereFor(actor, "orderDelivery", "write"), lineId },
    select: {
      id: true, orderId: true, lineId: true, state: true, confirmDueAt: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, tenantId: true,
      line: { select: { title: true } },
    },
  });
  if (!row) throw new ForbiddenError("orderDelivery", "write");
  return row;
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

/** The sponsor reports a problem — only inside the 24 hours. The line's money is held. */
export async function reportProblem(actor: Actor, lineId: string, note: string, now = new Date()) {
  const text = note?.trim() ?? "";
  if (!text) throw new DeliveryError("Say what went wrong — BTG and the seller read this.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await sponsorLine(tx, actor, lineId);
    if (row.state !== "DELIVERED") throw new DeliveryError(`This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for your answer.`);
    if (!canAnswer(row, now)) {
      throw new DeliveryError(`The ${CONFIRM_WINDOW_HOURS} hours to report a problem have passed, so this line counts as confirmed. If something is wrong, contact BTG support.`);
    }
    await tx.orderLineDelivery.update({
      /* tenant-scope: the row just loaded through whereFor(orderDelivery, write). */
      where: { id: row.id }, data: { state: "PROBLEM", problemAt: now, problemBy: actor.userId, problemNote: text.slice(0, 2000) }, select: { id: true },
    });
    await audit(tx, actor, "orderDelivery.reportProblem", "MarketplaceOrder", row.orderId, { before: { lineId, state: "DELIVERED" }, after: { lineId, state: "PROBLEM" } });
    const sponsor = await tx.sponsor.findFirst({ where: { tenantId: row.tenantId, id: actor.sponsorId! }, select: { name: true } });
    for (const admin of await btgAdmins(tx, row.tenantId)) {
      await tell(tx, { tenantId: row.tenantId, email: admin.email }, "delivery.problem", lineId, {
        sponsorName: sponsor?.name ?? "A sponsor", title: row.line.title, orderRef: orderRef(row.orderId), problem: text.slice(0, 500),
        issueUrl: appUrl(`/admin/delivery-issues/${lineId}`),
      });
    }
    for (const r of await sellerRecipients(tx, row)) {
      await tell(tx, r, "delivery.onHold", lineId, {
        firstName: r.firstName, sponsorName: sponsor?.name ?? "The sponsor", title: row.line.title, orderRef: orderRef(row.orderId),
        problem: text.slice(0, 500), saleUrl: appUrl(salePath(r, lineId)),
      });
    }
    return { lineId, state: "PROBLEM" as const };
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

/* ── the sweep — 2S4-BE-07 (silence) and 2S4-BE-08 (reminders, auto-close) ── */

/**
 * The worker's delivery sweep. Three passes, each idempotent by its own
 * state guard — running it twice changes nothing:
 *   1. a line marked delivered whose 24 hours have passed is CONFIRMED (SILENCE);
 *   2. a line still in delivery a day after its last date reminds its seller
 *      and the team's manager, once (remindedAt);
 *   3. an order FULFILLED 30 days ago (its last line confirmed then) CLOSES,
 *      releasing the reserve (ledger.ts `releaseReserve`, through the order's machine).
 * Each row in its own transaction, so one failure is retried next run and stops nothing else.
 */
export async function sweepDeliveries(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { confirmed: 0, reminded: 0, closed: 0, failed: 0 };
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

  const late = await prisma.orderLineDelivery.findMany({
    /* tenant-scope: the system sweep — every tenant's lines still in delivery a day past their last date, not yet reminded. */
    where: { ...books, state: "IN_DELIVERY", remindedAt: null, line: { endsOn: { lte: new Date(now.getTime() - OVERDUE_AFTER_DAYS * DAY) } } }, select: { id: true }, take: 500,
  });
  for (const { id } of late) {
    try {
      if (await remindIn(id, now, { userId: null }, "once")) out.reminded++;
    } catch (error) {
      out.failed++;
      console.error(`[delivery] reminding ${id} failed, will retry:`, error);
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

/** Remind a late seller (and their team's manager). "once" — the sweep; "again" — BTG's button, once a day. */
async function remindIn(id: string, now: Date, by: { userId: string | null }, mode: "once" | "again") {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.orderLineDelivery.updateMany({
      /* tenant-scope: the row named by the sweep (or loaded by BTG through whereFor), by id, only while still in delivery. */
      where: { id, state: "IN_DELIVERY", ...(mode === "once" ? { remindedAt: null } : {}) }, data: { remindedAt: now },
    });
    if (!moved.count) return false;
    const row = await tx.orderLineDelivery.findUniqueOrThrow({
      /* tenant-scope: the row just stamped, by id. */
      where: { id }, select: { tenantId: true, orderId: true, lineId: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true, line: { select: { title: true, endsOn: true } } },
    });
    await audit(tx, { userId: by.userId, tenantId: row.tenantId }, "orderDelivery.remind", "MarketplaceOrder", row.orderId, { after: { lineId: row.lineId, mode } });
    const sponsorRow = await tx.marketplaceOrder.findUniqueOrThrow({
      /* tenant-scope: the order named by the row just stamped. */
      where: { id: row.orderId }, select: { sponsorId: true },
    });
    const sponsor = await tx.sponsor.findFirst({ where: { tenantId: row.tenantId, id: sponsorRow.sponsorId }, select: { name: true } });
    for (const r of await sellerRecipients(tx, row)) {
      await tell(tx, r, "delivery.overdue", `${row.lineId}:${mode === "once" ? "first" : day(now)}`, {
        firstName: r.firstName, title: row.line.title, orderRef: orderRef(row.orderId), sponsorName: sponsor?.name ?? "the sponsor",
        lastDate: day(row.line.endsOn), saleUrl: appUrl(salePath(r, row.lineId)),
      });
    }
    return true;
  });
}

/* ── BTG's desk — 2S4-BE-07 (problems), 2S4-BE-08 (overdue) ─────────────── */

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

function issueView(r: SaleRow, names: Awaited<ReturnType<typeof namesFor>>, hold?: { athleteCents: number; teamCents: number }) {
  const team = r.propertyId ? names.team.get(r.propertyId) ?? null : null;
  const athlete = r.athleteId ? names.athlete.get(r.athleteId) ?? null : null;
  const seller = athlete ? { name: athlete, sub: team } : { name: team ?? "Seller", sub: null };
  const units = `${r.line.quantity} ${unitOf(names.kind.get(r.line.inventoryItemId))}${r.line.quantity === 1 ? "" : "s"}`;
  const history: { at: Date; text: string }[] = [];
  if (r.paidAt) history.push({ at: r.paidAt, text: "Paid · confirmed by the payment provider" });
  if (r.deliveredAt) history.push({ at: r.deliveredAt, text: `Marked delivered by ${r.deliveredByName ?? seller.name}` });
  if (r.problemAt) history.push({ at: r.problemAt, text: `Problem reported by ${r.line.order.billingName ?? names.sponsor.get(r.sponsorId) ?? "the sponsor"} · payout put on hold` });
  if (r.remindedAt) history.push({ at: r.remindedAt, text: "Reminder sent to the seller" });
  if (r.resolvedAt) history.push({ at: r.resolvedAt, text: r.resolution === "REFUNDED" ? "Cancelled and refunded by BTG" : "Delivery confirmed by BTG" });
  return {
    id: r.lineId,
    orderId: r.orderId,
    orderRef: orderRef(r.orderId),
    state: r.state as DeliveryState,
    line: r.line.title,
    quantity: units,
    unitPriceCents: r.line.unitPriceCents,
    dates: lineDates(r.line.startsOn, r.line.endsOn),
    lastDate: day(r.line.endsOn),
    seller,
    sponsor: { name: names.sponsor.get(r.sponsorId) ?? "Sponsor", sub: r.line.order.billingName ?? null },
    sponsorMessage: r.problemAt && r.problemNote ? { text: r.problemNote, at: r.problemAt } : null,
    sellerNote: r.deliveredAt && r.note ? { text: r.note, at: r.deliveredAt, proofCount: r.proofKey ? 1 : 0, link: r.proofLink } : null,
    hold: { sellerShareCents: athlete ? hold?.athleteCents ?? 0 : hold?.teamCents ?? 0, teamShareCents: athlete ? hold?.teamCents ?? 0 : 0, sponsorPaidCents: r.line.lineTotalCents },
    remindedAt: r.remindedAt,
    history: history.sort((a, b) => a.at.getTime() - b.at.getTime()),
  };
}

/** BTG's Delivery issues desk: problems reported, and lines whose last date has passed unmarked. */
export async function deliveryIssues(actor: Actor, now = new Date()) {
  assertDesk(actor);
  const [problems, overdue] = await Promise.all([
    prisma.orderLineDelivery.findMany({ where: { ...whereFor(actor, "orderDelivery", "approve"), state: "PROBLEM" }, select: SALE_SELECT, orderBy: { problemAt: "asc" }, take: 200 }),
    prisma.orderLineDelivery.findMany({
      where: { ...whereFor(actor, "orderDelivery", "approve"), state: "IN_DELIVERY", line: { endsOn: { lt: now } } }, select: SALE_SELECT, orderBy: { createdAt: "asc" }, take: 200,
    }),
  ]);
  const names = await namesFor([...problems, ...overdue]);
  const hold = await holdFor(actor, problems.map((p) => p.lineId));
  return {
    confirmWindowHours: CONFIRM_WINDOW_HOURS,
    problems: problems.map((r) => issueView(r, names, hold.get(r.lineId))),
    overdue: overdue.map((r) => issueView(r, names)),
  };
}

export async function deliveryIssue(actor: Actor, lineId: string) {
  assertDesk(actor);
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "approve"), lineId }, select: SALE_SELECT });
  if (!row) throw new ForbiddenError("orderDelivery", "approve");
  const [names, hold] = await Promise.all([namesFor([row]), holdFor(actor, [row.lineId])]);
  return issueView(row, names, hold.get(row.lineId));
}

/**
 * BTG resolves a reported problem: CONFIRM (the line is delivered; its money
 * is released on the usual rules) or REFUND (the order's own refund — the
 * whole order when no other line is still live, else this line's journals
 * reversed and its stock released). A note is required: everyone reads it.
 */
export async function resolveIssue(actor: Actor, lineId: string, decision: "CONFIRM" | "REFUND", note: string, now = new Date()) {
  assertDesk(actor);
  const text = note?.trim() ?? "";
  if (!text) throw new DeliveryError("Add a note — the sponsor and the seller both read it.", 422);
  return prisma.$transaction(async (tx) => {
    const row = await tx.orderLineDelivery.findFirst({
      where: { ...whereFor(actor, "orderDelivery", "approve"), lineId },
      select: {
        id: true, tenantId: true, orderId: true, lineId: true, state: true, propertyId: true, propertyTenantId: true, athleteId: true, athleteTenantId: true,
        line: { select: { title: true, inventoryItemId: true, startsOn: true, endsOn: true, order: { select: { tenantId: true, createdBy: true, billingEmail: true, billingName: true } } } },
      },
    });
    if (!row) throw new ForbiddenError("orderDelivery", "approve");
    if (row.state !== "PROBLEM") throw new DeliveryError(`This line is ${row.state.toLowerCase().replace("_", " ")}, not waiting for a decision.`);
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
      const live = await tx.orderLineDelivery.count({
        /* tenant-scope: this order's own delivery rows, named by its id. */
        where: { orderId: row.orderId, state: { notIn: ["REFUNDED", "CANCELLED"] } },
      });
      if (live === 0) {
        /* The last live line: the order's own refund — reversal, stock released, Zoho told. */
        await moveOrderIn(tx, actor, row.orderId, "REFUNDED", now);
      } else {
        /* One line of several: that line's journals mirrored, its stock handed back. */
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
    }
    await audit(tx, actor, "orderDelivery.resolve", "MarketplaceOrder", row.orderId, {
      before: { lineId, state: "PROBLEM" }, after: { lineId, state: decision === "CONFIRM" ? "CONFIRMED" : "REFUNDED", note: text.slice(0, 500) },
    });
    await maybeFulfil(tx, row.orderId, now);

    const data = { title: row.line.title, orderRef: orderRef(row.orderId), decision: decision === "CONFIRM" ? "confirmed as delivered" : "cancelled and refunded", note: text.slice(0, 1000) };
    const sponsor = await sponsorRecipient(tx, row.line.order);
    if (sponsor) await tell(tx, sponsor, "delivery.resolved", lineId, { ...data, firstName: sponsor.firstName, link: appUrl(`/sponsor/orders/${row.orderId}`) });
    for (const r of await sellerRecipients(tx, row)) await tell(tx, r, "delivery.resolved", lineId, { ...data, firstName: r.firstName, link: appUrl(salePath(r, lineId)) });
    return { lineId, state: decision === "CONFIRM" ? ("CONFIRMED" as const) : ("REFUNDED" as const) };
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

/** The seller's photo: for the seller, the buying sponsor and BTG — through a 5-minute audited link. */
export async function proofLink(actor: Actor, lineId: string) {
  assertAllowed(actor, "orderDelivery", "read");
  const row = await prisma.orderLineDelivery.findFirst({ where: { ...whereFor(actor, "orderDelivery", "read"), lineId }, select: { id: true, proofKey: true } });
  if (!row) throw new ForbiddenError("orderDelivery", "read");
  if (!row.proofKey) throw new DeliveryError("No photo was added to this line.", 404);
  const url = await presignPrivateDownload(actor, row.proofKey, { entity: "OrderLineDelivery", entityId: row.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}
