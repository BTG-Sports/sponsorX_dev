/**
 * Deal Chat — the chat between an order's sponsor and one seller
 * (2S4-BE-16, feature spec documentation/SponsorX-Deal-Chat-Feature.md
 * §3.1–§3.4, §6, §7; owner decisions 2026-11-17 and 2026-11-18).
 *
 * One chat per seller on an order, opened when the order is placed (behind
 * the DEAL_CHAT switch). The sponsor and the seller — the athlete, the
 * guardian for a minor, or the team's manager — talk, pick the question
 * cards' answers and trade free-text offers. BTG admins read every chat.
 *
 * - A card is agreed when both picks match; then it is locked.
 * - An offer runs Reply / Accept / Decline; agreed on two accepts of its
 *   latest message, a new reply clearing both.
 * - The final amount (2S4-BE-15): pre-filled with the original, each side
 *   confirms or types over it; agreed when they match, and then locked.
 * - When everything is green (every card and the amount agreed, no offer
 *   open, nothing waiting for BTG) the chat posts the agreement form
 *   (deal-agreement.ts); signing checks it again (deal-chat-check.ts).
 * - Either side calls the deal off before payment, with a reason the other
 *   side reads: the whole order is cancelled (2S4-BE-15).
 * - Signed by both within 10 working days of the order, or it is cancelled;
 *   a last warning 2 working days before (2S4-BE-15, the sweep).
 * - Contact details, outside payment and BTG's restricted words hold a
 *   message for BTG before the other side sees it. BTG releases it, or keeps
 *   it back with a reason the sender reads. Either side can report a message.
 * - For a minor only the guardian accepts an offer, confirms the amount,
 *   signs or calls the deal off (guardian-acts.ts).
 * - Nothing is edited or deleted; every action is audited.
 *
 * Addressed like a DealAgreement (scope.ts `dealChat`): the order's books for
 * the sponsor and BTG, the seller's own tenant for them.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { cardByKey, cardsFor, isValidAnswer, type DealForm } from "./deal-cards";
import {
  addWorkingDays, amountAgreed, cardAgreed, contactReasons, otherSide, signingDeadline,
  DEAL_CHAT_AMOUNT_MAX_CENTS, DEAL_CHAT_REMINDER_WORKING_DAYS, DEAL_CHAT_TEXT_MAX, DEAL_CHAT_UNREAD_DELAY_MS,
  type DealStatus, type Side,
} from "./deal-chat-rules";
import { loadDealStatus } from "./deal-chat-check";
import { callOffOrderIn, cancelOrderAsSystem, lockOrder } from "./marketplace-order";
import { env } from "../config/env";
import { dealFormsOf, openDealAgreement } from "./deal-agreement";
import { usdOf } from "./deal-agreement-render";
import { assertMayCommit } from "./guardian-acts";
import { checkRestricted } from "./restricted-words";
import { restrictedReason } from "./listing-rules";
import { appUrl, btgAdmins, orderRef, sellerRecipients, sponsorRecipient, tell, type Recipient } from "./order-mail";

type Tx = Prisma.TransactionClient;

export class DealChatError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "DealChatError";
    this.status = status;
  }
}

/** Orders in these states have ended: their chats are read-only. */
export const ENDED_ORDER_STATES: ReadonlySet<string> = new Set(["CANCELLED", "CLOSED", "REFUNDED"]);
const REASON_MAX = 2000;

const CHAT = {
  id: true, tenantId: true, orderId: true, sponsorId: true, sellerKey: true,
  athleteId: true, athleteTenantId: true, propertyId: true, propertyTenantId: true,
  lineIds: true, forms: true, state: true, dealAgreementId: true,
  sponsorReadAt: true, sellerReadAt: true, sponsorEmailedAt: true, sellerEmailedAt: true,
  lastActionAt: true, lastRemindedAt: true, createdAt: true,
  sponsorAmountCents: true, sellerAmountCents: true, calledOffBy: true, calledOffReason: true, calledOffAt: true, lastWarnedAt: true,
  order: { select: { state: true, tenantId: true, createdBy: true, billingEmail: true, billingName: true, createdAt: true } },
} as const;
type ChatRow = Prisma.DealChatGetPayload<{ select: typeof CHAT }>;
const EXCHANGE = {
  id: true, cardKey: true, state: true, startedBy: true, latestMessageId: true, sponsorAcceptedMessageId: true, sellerAcceptedMessageId: true,
} as const;

/* ── who is who ────────────────────────────────────────────────────────── */

/** The side this caller is on, or null (BTG, anyone else). The sponsor's analyst reads as the sponsor. */
export function sideOf(actor: Actor, c: { tenantId: string; sponsorId: string; athleteId: string | null; propertyId: string | null }): Side | null {
  if (actor.sponsorId === c.sponsorId && actor.tenantId === c.tenantId && (actor.roles.includes("SPONSOR_ADMIN") || actor.roles.includes("SPONSOR_ANALYST"))) return "SPONSOR";
  if (c.athleteId && actor.athleteId === c.athleteId && actor.roles.includes("ATHLETE")) return "SELLER";
  if (c.propertyId && actor.propertyId === c.propertyId && actor.roles.includes("PROPERTY_MGR")) return "SELLER";
  return null;
}

async function readableChat(actor: Actor, id: string): Promise<ChatRow> {
  assertAllowed(actor, "dealChat", "read");
  const c = await prisma.dealChat.findFirst({ where: { ...whereFor(actor, "dealChat", "read"), id }, select: CHAT });
  if (!c) throw new ForbiddenError("dealChat", "read");
  return c;
}

/**
 * The chat for a party's write, locked so two actions on one chat settle one
 * after the other. Refused when the order has ended, and for anyone not on
 * one of its two sides (BTG writes nothing in a chat).
 */
async function writableChat(tx: Tx, actor: Actor, id: string): Promise<{ chat: ChatRow; side: Side }> {
  assertAllowed(actor, "dealChat", "write");
  const found = await tx.dealChat.findFirst({ where: { ...whereFor(actor, "dealChat", "write"), id }, select: { id: true } });
  if (!found) throw new ForbiddenError("dealChat", "write");
  await tx.$queryRaw`SELECT id FROM "DealChat" WHERE id = ${found.id} FOR UPDATE`;
  const chat = await tx.dealChat.findFirstOrThrow({ /* tenant-scope: the chat found through whereFor(dealChat, write) and locked. */ where: { id: found.id }, select: CHAT });
  const side = sideOf(actor, chat);
  if (!side) throw new ForbiddenError("dealChat", "write");
  if (chat.state !== "OPEN" || ENDED_ORDER_STATES.has(chat.order.state)) throw new DealChatError("This order has ended, so its chat is read-only.");
  return { chat, side };
}

const guardianOf = (actor: Actor, side: Side) => (side === "SELLER" ? actor.actingFor?.guardianId ?? null : null);

function cleanText(text: unknown): string {
  const t = typeof text === "string" ? text.replace(/\r\n?/g, "\n").trim() : "";
  if (!t) throw new DealChatError("Write something first.", 422);
  if (t.length > DEAL_CHAT_TEXT_MAX) throw new DealChatError(`Keep it under ${DEAL_CHAT_TEXT_MAX} characters.`, 422);
  return t;
}

/* ── the watch: what holds a message for BTG ───────────────────────────── */

async function holdReasons(tx: Tx, chat: { tenantId: string }, text: string): Promise<string[]> {
  const tenant = await tx.tenant.findUnique({ where: { id: chat.tenantId }, select: { operatorTenantId: true } });
  /* BTG's list lives in the operating tenant (as for listings, 2S3-BE-06). */
  const words = (await checkRestricted(tx, tenant?.operatorTenantId ?? chat.tenantId, text)).map((m) => m.word);
  const restricted = restrictedReason(words);
  return [...contactReasons(text), ...(restricted ? [restricted] : [])];
}

async function names(tx: Tx, c: { tenantId: string; sponsorId: string; athleteId: string | null; athleteTenantId: string | null; propertyId: string | null; propertyTenantId: string | null }) {
  const sponsor = await tx.sponsor.findFirst({
    /* tenant-scope: the chat's own sponsor, in the order's books. */
    where: { tenantId: c.tenantId, id: c.sponsorId }, select: { name: true },
  });
  const seller = c.propertyId
    ? await tx.property.findFirst({
        /* tenant-scope: the chat's team, in its own tenant (recorded on the row). */
        where: { tenantId: c.propertyTenantId ?? undefined, id: c.propertyId }, select: { name: true },
      })
    : await tx.athlete.findFirst({
        /* tenant-scope: the chat's athlete, in their own tenant (recorded on the row). */
        where: { tenantId: c.athleteTenantId ?? undefined, id: c.athleteId ?? undefined }, select: { displayName: true },
      }).then((a) => (a ? { name: a.displayName } : null));
  return { sponsor: sponsor?.name ?? "The sponsor", seller: seller?.name ?? "The seller" };
}

const sellerParty = (c: ChatRow) => ({ propertyId: c.propertyId, propertyTenantId: c.propertyTenantId, athleteId: c.athleteId, athleteTenantId: c.athleteTenantId });
const chatUrl = (c: { id: string; orderId: string }, side: Side, portal?: "athlete" | "property") =>
  appUrl(side === "SPONSOR" ? `/sponsor/orders/${c.orderId}` : `/${portal ?? "athlete"}/sales/deal-chats/${c.id}`);

/** The people on one side of a chat, for an email. */
async function recipientsOf(tx: Tx, c: ChatRow, side: Side): Promise<Array<Recipient & { portal?: "athlete" | "property" }>> {
  if (side === "SPONSOR") {
    const r = await sponsorRecipient(tx, c.order);
    return r ? [r] : [];
  }
  return sellerRecipients(tx, sellerParty(c));
}

async function tellBtg(tx: Tx, c: ChatRow, messageId: string, why: string) {
  const n = await names(tx, c);
  for (const u of await btgAdmins(tx, c.tenantId)) {
    await tell(tx, { tenantId: c.tenantId, email: u.email }, "dealChat.forReview", `${messageId}:${why}`, {
      orderRef: orderRef(c.orderId), sponsorName: n.sponsor, sellerName: n.seller, why, reviewUrl: appUrl("/admin/deal-chats/review"),
    });
  }
}

/* ── opening (inside the order's placing transaction) ──────────────────── */

/**
 * One chat per seller on a just-placed order, each side emailed a link.
 * A team's lines go to the team; an independent athlete's to them.
 */
export async function openDealChats(tx: Tx, orderId: string, now = new Date(), by: AuditActor | null = null): Promise<string[]> {
  const order = await tx.marketplaceOrder.findUnique({
    /* tenant-scope: the order just placed in this transaction, by id. */
    where: { id: orderId },
    select: {
      id: true, tenantId: true, sponsorId: true, createdBy: true, billingEmail: true, billingName: true,
      lines: { select: { id: true, inventoryItemId: true, itemTenantId: true, propertyId: true, sellerAthleteId: true } },
    },
  });
  if (!order) throw new DealChatError("That order does not exist.", 404);
  const sellers = new Map<string, { athleteId?: string; propertyId?: string; lines: typeof order.lines }>();
  for (const l of order.lines) {
    const key = l.propertyId ? `property:${l.propertyId}` : l.sellerAthleteId ? `athlete:${l.sellerAthleteId}` : null;
    if (!key) continue;
    const s = sellers.get(key) ?? { ...(l.propertyId ? { propertyId: l.propertyId } : { athleteId: l.sellerAthleteId! }), lines: [] };
    s.lines.push(l);
    sellers.set(key, s);
  }
  const ids: string[] = [];
  for (const [sellerKey, s] of sellers) {
    const existing = await tx.dealChat.findFirst({ where: { tenantId: order.tenantId, orderId: order.id, sellerKey }, select: { id: true } });
    if (existing) { ids.push(existing.id); continue; }
    const owner = s.propertyId
      ? await tx.property.findFirst({ /* tenant-scope: the team this order's own line names, read in its own tenant. */ where: { id: s.propertyId }, select: { tenantId: true } })
      : await tx.athlete.findFirst({ /* tenant-scope: the independent seller this order's own line names, read in their own tenant. */ where: { id: s.athleteId }, select: { tenantId: true } });
    if (!owner) continue;
    const forms: DealForm[] = await dealFormsOf(tx, s.lines);
    const chat = await tx.dealChat.create({
      data: {
        tenantId: order.tenantId, orderId: order.id, sponsorId: order.sponsorId, sellerKey,
        ...(s.propertyId ? { propertyId: s.propertyId, propertyTenantId: owner.tenantId } : { athleteId: s.athleteId, athleteTenantId: owner.tenantId }),
        lineIds: s.lines.map((l) => l.id), forms, lastActionAt: now,
      },
      select: CHAT,
    });
    ids.push(chat.id);
    await audit(tx, by ?? { userId: null, tenantId: order.tenantId }, "dealChat.open", "DealChat", chat.id, {
      after: { orderId: order.id, sellerKey, forms, lineIds: chat.lineIds },
    });
    const n = await names(tx, chat);
    for (const side of ["SPONSOR", "SELLER"] as const) {
      for (const r of await recipientsOf(tx, chat, side)) {
        await tell(tx, r, "dealChat.opened", chat.id, {
          firstName: r.firstName, orderRef: orderRef(order.id), otherName: side === "SPONSOR" ? n.seller : n.sponsor, chatUrl: chatUrl(chat, side, r.portal),
        });
      }
    }
  }
  return ids;
}

/* ── what each side reads ──────────────────────────────────────────────── */

export type DealChatMessageView = {
  id: string; kind: string; side: Side; exchangeId: string | null; body: string; createdAt: string; byGuardian: boolean;
  /** VISIBLE, or — to its sender and BTG only — HELD or KEPT_BACK. */
  state: string;
  keptBackReason: string | null;
  /** BTG only. */
  heldReasons?: string[]; reported?: boolean; reportReason?: string | null;
};
export type DealChatExchangeView = {
  id: string; cardKey: string | null; state: string; startedBy: Side; latestMessageId: string | null;
  sponsorAccepted: boolean; sellerAccepted: boolean;
};
export type DealChatView = {
  id: string; orderId: string; orderRef: string; state: string; forms: string[]; lineIds: string[];
  sponsorName: string; sellerName: string;
  /** The caller's side; null for BTG. */
  yourSide: Side | null;
  /** May the caller accept an offer: false for a minor without their guardian, and for BTG and the analyst. */
  mayAccept: boolean;
  unread: number;
  status: DealStatus;
  /** "Your agreed terms mention $150. Is $1,000.00 still right?" — never changes the amount. */
  moneyNudge: string | null;
  agreement: { id: string; downloadPath: string } | null;
  /** 2S4-BE-15 — the order's stage, and while it is IN_CHAT the date it must be signed by both. */
  orderState: string;
  signingDeadline: string | null;
  /** 2S4-BE-15 — the deal called off: by which side, the reason, when. */
  calledOff: { side: Side; reason: string; at: string } | null;
  exchanges: DealChatExchangeView[];
  messages: DealChatMessageView[];
  createdAt: string; lastActionAt: string;
};

/** GET /deal-chats/:id — the chat as the caller may see it. */
export async function readDealChat(actor: Actor, id: string): Promise<DealChatView> {
  const c = await readableChat(actor, id);
  const side = sideOf(actor, c);
  const btg = !side;
  return prisma.$transaction(async (tx) => {
    const [status, n, rows, exchanges, agreement] = await Promise.all([
      loadDealStatus(tx, c),
      names(tx, c),
      tx.dealChatMessage.findMany({
        /* tenant-scope: this chat's messages, in its books. A party sees its own in any state and the other side's once visible. */
        where: { tenantId: c.tenantId, chatId: c.id, ...(side ? { OR: [{ side }, { state: "VISIBLE" }] } : {}) },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, kind: true, side: true, exchangeId: true, body: true, createdAt: true, guardianId: true, state: true,
          keptBackReason: true, heldReasons: true, reportedAt: true, reportClearedAt: true, reportReason: true,
        },
      }),
      tx.dealChatExchange.findMany({ where: { tenantId: c.tenantId, chatId: c.id }, orderBy: { createdAt: "asc" }, select: EXCHANGE }),
      c.dealAgreementId ? tx.dealAgreement.findFirst({ where: { tenantId: c.tenantId, id: c.dealAgreementId }, select: { id: true, amountCents: true } }) : null,
    ]);
    const readAt = side === "SPONSOR" ? c.sponsorReadAt : side === "SELLER" ? c.sellerReadAt : null;
    let mayAccept = false;
    if (side && actor.roles.some((r) => r === "SPONSOR_ADMIN" || r === "ATHLETE" || r === "PROPERTY_MGR")) {
      mayAccept = true;
      if (side === "SELLER" && c.athleteId) {
        try { await assertMayCommit(tx, actor, "accept"); } catch { mayAccept = false; }
      }
    }
    /* §3.7 — the nudge shows while the amount on the table is still the original. */
    const amountNow = agreement?.amountCents ?? status.amount.agreedCents ?? status.amount.originalCents;
    return {
      id: c.id, orderId: c.orderId, orderRef: orderRef(c.orderId), state: c.state, forms: c.forms, lineIds: c.lineIds,
      sponsorName: n.sponsor, sellerName: n.seller, yourSide: side, mayAccept,
      unread: side ? rows.filter((m) => m.side !== side && m.state === "VISIBLE" && (!readAt || m.createdAt > readAt)).length : 0,
      status,
      moneyNudge: status.moneyFigures.length && amountNow === status.amount.originalCents ? `Your agreed terms mention ${status.moneyFigures.join(", ")}. Is ${usdOf(amountNow)} still right?` : null,
      agreement: agreement ? { id: agreement.id, downloadPath: `/api/v1/deal-agreements/${agreement.id}/download` } : null,
      orderState: c.order.state,
      signingDeadline: c.order.state === "IN_CHAT" ? signingDeadline(c.order.createdAt, env.DEAL_CHAT_SIGNING_WORKING_DAYS).deadline.toISOString() : null,
      calledOff: c.calledOffAt && c.calledOffBy ? { side: c.calledOffBy as Side, reason: c.calledOffReason ?? "", at: c.calledOffAt.toISOString() } : null,
      exchanges: exchanges.map((x) => ({
        id: x.id, cardKey: x.cardKey, state: x.state, startedBy: x.startedBy as Side, latestMessageId: x.latestMessageId,
        sponsorAccepted: !!x.latestMessageId && x.sponsorAcceptedMessageId === x.latestMessageId,
        sellerAccepted: !!x.latestMessageId && x.sellerAcceptedMessageId === x.latestMessageId,
      })),
      messages: rows.map((m) => ({
        id: m.id, kind: m.kind, side: m.side as Side, exchangeId: m.exchangeId, body: m.body, createdAt: m.createdAt.toISOString(),
        byGuardian: !!m.guardianId, state: m.state, keptBackReason: m.keptBackReason,
        ...(btg ? { heldReasons: m.heldReasons, reported: !!m.reportedAt && !m.reportClearedAt, reportReason: m.reportReason } : {}),
      })),
      createdAt: c.createdAt.toISOString(), lastActionAt: c.lastActionAt.toISOString(),
    };
  });
}

export type DealChatSummary = {
  id: string; orderId: string; orderRef: string; state: string; forms: string[]; dealAgreementId: string | null;
  unread: number; lastActionAt: string; createdAt: string;
};

/** GET /deal-chats — the chats the caller may read, newest activity first; `orderId` narrows to one order. */
export async function listDealChats(actor: Actor, q: { orderId?: string } = {}): Promise<DealChatSummary[]> {
  assertAllowed(actor, "dealChat", "read");
  const rows = await prisma.dealChat.findMany({
    where: { ...whereFor(actor, "dealChat", "read"), ...(q.orderId ? { orderId: q.orderId } : {}) },
    select: CHAT, orderBy: { lastActionAt: "desc" }, take: 200,
  });
  const out: DealChatSummary[] = [];
  for (const c of rows) {
    const side = sideOf(actor, c);
    const readAt = side === "SPONSOR" ? c.sponsorReadAt : c.sellerReadAt;
    const unread = side
      ? await prisma.dealChatMessage.count({
          where: { tenantId: c.tenantId, chatId: c.id, side: otherSide(side), state: "VISIBLE", ...(readAt ? { createdAt: { gt: readAt } } : {}) },
        })
      : 0;
    out.push({
      id: c.id, orderId: c.orderId, orderRef: orderRef(c.orderId), state: c.state, forms: c.forms, dealAgreementId: c.dealAgreementId,
      unread, lastActionAt: c.lastActionAt.toISOString(), createdAt: c.createdAt.toISOString(),
    });
  }
  return out;
}

/** POST /deal-chats/:id/read — the caller's side has read the chat up to now. */
export async function markDealChatRead(actor: Actor, id: string, now = new Date()): Promise<{ ok: true }> {
  const c = await readableChat(actor, id);
  const side = sideOf(actor, c);
  if (side) {
    await prisma.dealChat.updateMany({
      /* tenant-scope: the chat reached through whereFor(dealChat, read). */
      where: { id: c.id, tenantId: c.tenantId }, data: side === "SPONSOR" ? { sponsorReadAt: now } : { sellerReadAt: now },
    });
  }
  return { ok: true };
}

/* ── after every action: post the form once everything is green ────────── */

async function settle(tx: Tx, chatId: string, now: Date, by: AuditActor) {
  const c = await tx.dealChat.findFirstOrThrow({ /* tenant-scope: the chat locked by the action that called this. */ where: { id: chatId }, select: CHAT });
  if (c.dealAgreementId || c.state !== "OPEN") return;
  const status = await loadDealStatus(tx, c);
  if (!status.allGreen) return;
  const answers = Object.fromEntries(status.cards.map((card) => [card.key, card.multi ? card.sponsor! : card.sponsor![0]!]));
  const agreed = await tx.dealChatExchange.findMany({ where: { tenantId: c.tenantId, chatId: c.id, state: "AGREED" }, orderBy: { createdAt: "asc" }, select: { id: true, cardKey: true } });
  const messages = await tx.dealChatMessage.findMany({
    where: { tenantId: c.tenantId, chatId: c.id, exchangeId: { in: agreed.map((x) => x.id) }, state: "VISIBLE" },
    orderBy: { createdAt: "asc" }, select: { exchangeId: true, side: true, body: true, createdAt: true },
  });
  const specialTerms = agreed.map((x) => ({
    cardKey: x.cardKey,
    messages: messages.filter((m) => m.exchangeId === x.id).map((m) => ({ by: m.side === "SPONSOR" ? ("Sponsor" as const) : ("Seller" as const), at: m.createdAt, text: m.body })),
  }));
  const seller = c.propertyId ? { propertyId: c.propertyId } : { athleteId: c.athleteId! };
  /* 2S4-BE-15 — the final amount both sides confirmed (all green means it is agreed). */
  const form = await openDealAgreement(tx, { orderId: c.orderId, seller, answers, specialTerms, amountCents: status.amount.agreedCents! }, now, by);
  await tx.dealChat.update({ /* tenant-scope: the chat locked by the action that called settle. */ where: { id: c.id }, data: { dealAgreementId: form.id, lastActionAt: now } });
  await audit(tx, by, "dealChat.formPosted", "DealChat", c.id, { after: { dealAgreementId: form.id, bodyHash: form.bodyHash } });
}

async function touch(tx: Tx, chatId: string, now: Date) {
  await tx.dealChat.update({ /* tenant-scope: the chat locked by the action that called touch. */ where: { id: chatId }, data: { lastActionAt: now } });
}

/** A message, offer or reply: screened, stored, BTG told when it is held. */
async function writeMessage(tx: Tx, actor: Actor, chat: ChatRow, side: Side, kind: "TEXT" | "OFFER" | "REPLY", body: string, exchangeId: string | null) {
  const reasons = await holdReasons(tx, chat, body);
  const m = await tx.dealChatMessage.create({
    data: {
      tenantId: chat.tenantId, chatId: chat.id, exchangeId, kind, side, userId: actor.userId, guardianId: guardianOf(actor, side), body,
      state: reasons.length ? "HELD" : "VISIBLE", heldReasons: reasons,
    },
    select: { id: true, state: true },
  });
  if (reasons.length) await tellBtg(tx, chat, m.id, `Held: ${reasons.join("; ")}`);
  return { ...m, reasons };
}

/* ── the parties' actions ──────────────────────────────────────────────── */

/** POST /deal-chats/:id/messages — an ordinary message (not part of the agreement). */
export async function postDealChatMessage(actor: Actor, id: string, input: { text: unknown }, now = new Date()): Promise<DealChatView> {
  const body = cleanText(input.text);
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    const m = await writeMessage(tx, actor, chat, side, "TEXT", body, null);
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.message", "DealChatMessage", m.id, { after: { chatId: chat.id, side, state: m.state, heldReasons: m.reasons } });
  });
  return readDealChat(actor, id);
}

/** PUT /deal-chats/:id/picks/:cardKey — the caller's side's answer to a card, until both sides agree it. */
export async function pickDealCard(actor: Actor, id: string, cardKey: string, input: { value: unknown }, now = new Date()): Promise<DealChatView> {
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    const card = cardByKey(cardKey);
    if (!card || !cardsFor(chat.forms as DealForm[]).some((c) => c.key === cardKey)) throw new DealChatError("This deal doesn't ask that question.", 422);
    const raw = input.value;
    const valid = (typeof raw === "string" || (Array.isArray(raw) && raw.every((v) => typeof v === "string"))) && isValidAnswer(card, raw as string | string[]);
    if (!valid) throw new DealChatError("That isn't one of this question's answers.", 422);
    const value = typeof raw === "string" ? [raw] : [...(raw as string[])];
    const picks = await tx.dealChatPick.findMany({ where: { tenantId: chat.tenantId, chatId: chat.id, cardKey }, select: { side: true, value: true } });
    const mine = picks.find((p) => p.side === side)?.value;
    const theirs = picks.find((p) => p.side === otherSide(side))?.value;
    /* Owner, 2026-11-18: an answer cannot be changed once both parties agreed it. */
    if (cardAgreed(mine, theirs)) throw new DealChatError("Both sides agreed this answer, so it can't be changed.");
    await tx.dealChatPick.upsert({
      where: { chatId_cardKey_side: { chatId: chat.id, cardKey, side } },
      create: { tenantId: chat.tenantId, chatId: chat.id, cardKey, side, value, userId: actor.userId, guardianId: guardianOf(actor, side) },
      update: { value, userId: actor.userId, guardianId: guardianOf(actor, side) },
    });
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.pick", "DealChat", chat.id, {
      before: mine ? { cardKey, value: mine } : undefined,
      after: { cardKey, side, value, agreed: cardAgreed(value, theirs) },
    });
    await settle(tx, chat.id, now, actor);
  });
  return readDealChat(actor, id);
}

/** POST /deal-chats/:id/offers — a free-text offer, about a card or not. Text only: no price field (owner, 2026-11-17). */
export async function makeDealOffer(actor: Actor, id: string, input: { text: unknown; cardKey?: string | null }, now = new Date()): Promise<DealChatView> {
  const body = cleanText(input.text);
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    if (chat.dealAgreementId) throw new DealChatError("Everything is agreed and the agreement form is out, so no new offers.");
    const cardKey = input.cardKey ?? null;
    if (cardKey) {
      if (!cardsFor(chat.forms as DealForm[]).some((c) => c.key === cardKey)) throw new DealChatError("This deal doesn't ask that question.", 422);
      const picks = await tx.dealChatPick.findMany({ where: { tenantId: chat.tenantId, chatId: chat.id, cardKey }, select: { side: true, value: true } });
      if (cardAgreed(picks.find((p) => p.side === "SPONSOR")?.value, picks.find((p) => p.side === "SELLER")?.value)) {
        throw new DealChatError("Both sides already agreed that question.");
      }
    }
    const x = await tx.dealChatExchange.create({ data: { tenantId: chat.tenantId, chatId: chat.id, cardKey, startedBy: side }, select: { id: true } });
    const m = await writeMessage(tx, actor, chat, side, "OFFER", body, x.id);
    await tx.dealChatExchange.update({ /* tenant-scope: an exchange of the locked chat, just created. */ where: { id: x.id }, data: { latestMessageId: m.id } });
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.offer", "DealChatExchange", x.id, { after: { chatId: chat.id, side, cardKey, messageId: m.id, state: m.state, heldReasons: m.reasons } });
  });
  return readDealChat(actor, id);
}

async function openExchange(tx: Tx, chat: ChatRow, exchangeId: string) {
  const x = await tx.dealChatExchange.findFirst({
    /* tenant-scope: an exchange of the locked chat, in its books. */
    where: { tenantId: chat.tenantId, chatId: chat.id, id: exchangeId }, select: EXCHANGE,
  });
  if (!x) throw new DealChatError("That offer isn't in this chat.", 404);
  if (x.state !== "OPEN") throw new DealChatError(x.state === "AGREED" ? "This offer is already agreed." : "This offer was declined.");
  const latest = x.latestMessageId ? await tx.dealChatMessage.findFirst({ where: { tenantId: chat.tenantId, id: x.latestMessageId }, select: { state: true } }) : null;
  if (latest?.state === "HELD") throw new DealChatError("This offer is waiting for a BTG check. You can answer once it is cleared.");
  return x;
}

/** POST /deal-chats/:id/exchanges/:exchangeId/reply — continue the exchange; both accepts are cleared. */
export async function replyToDealOffer(actor: Actor, id: string, exchangeId: string, input: { text: unknown }, now = new Date()): Promise<DealChatView> {
  const body = cleanText(input.text);
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    const x = await openExchange(tx, chat, exchangeId);
    const m = await writeMessage(tx, actor, chat, side, "REPLY", body, x.id);
    await tx.dealChatExchange.update({ /* tenant-scope: the exchange found in the locked chat by openExchange. */ where: { id: x.id }, data: { latestMessageId: m.id, sponsorAcceptedMessageId: null, sellerAcceptedMessageId: null } });
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.reply", "DealChatExchange", x.id, { after: { side, messageId: m.id, state: m.state, heldReasons: m.reasons, acceptsCleared: true } });
  });
  return readDealChat(actor, id);
}

/**
 * POST /deal-chats/:id/exchanges/:exchangeId/accept — accept the exchange as
 * it stands: `messageId` is the latest message the caller read, refused when
 * it is no longer the latest. For a minor only the guardian accepts.
 */
export async function acceptDealOffer(actor: Actor, id: string, exchangeId: string, input: { messageId: unknown }, now = new Date()): Promise<DealChatView> {
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    const x = await openExchange(tx, chat, exchangeId);
    if (typeof input.messageId !== "string" || input.messageId !== x.latestMessageId) {
      throw new DealChatError("The offer changed since you read it. Read the latest message before accepting.");
    }
    if (side === "SELLER" && chat.athleteId) await assertMayCommit(tx, actor, "accept");
    const field = side === "SPONSOR" ? "sponsorAcceptedMessageId" : "sellerAcceptedMessageId";
    const other = side === "SPONSOR" ? x.sellerAcceptedMessageId : x.sponsorAcceptedMessageId;
    if (x[field] === x.latestMessageId) throw new DealChatError("You have already accepted this.");
    const agreed = other === x.latestMessageId;
    await tx.dealChatExchange.update({ /* tenant-scope: the exchange found in the locked chat by openExchange. */ where: { id: x.id }, data: { [field]: x.latestMessageId, ...(agreed ? { state: "AGREED", closedAt: now } : {}) } });
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.accept", "DealChatExchange", x.id, {
      after: { side, messageId: x.latestMessageId, state: agreed ? "AGREED" : "OPEN", ...(actor.actingFor ? { actingForAthleteId: actor.actingFor.athleteId } : {}) },
    });
    await settle(tx, chat.id, now, actor);
  });
  return readDealChat(actor, id);
}

/** POST /deal-chats/:id/exchanges/:exchangeId/decline — the offer ends; its card is open again. */
export async function declineDealOffer(actor: Actor, id: string, exchangeId: string, now = new Date()): Promise<DealChatView> {
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    const x = await openExchange(tx, chat, exchangeId);
    await tx.dealChatExchange.update({ /* tenant-scope: the exchange found in the locked chat by openExchange. */ where: { id: x.id }, data: { state: "DECLINED", closedAt: now } });
    await touch(tx, chat.id, now);
    await audit(tx, actor, "dealChat.decline", "DealChatExchange", x.id, { before: { state: "OPEN" }, after: { side, state: "DECLINED" } });
    await settle(tx, chat.id, now, actor);
  });
  return readDealChat(actor, id);
}

/**
 * PUT /deal-chats/:id/amount — the caller's side confirms the final amount (the
 * original, pre-filled) or types over it (§3.7). Agreed when both sides' match,
 * and then locked. For a minor only the guardian confirms it.
 */
export async function confirmDealAmount(actor: Actor, id: string, input: { amountCents: unknown }, now = new Date()): Promise<DealChatView> {
  const cents = input.amountCents;
  if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || cents > DEAL_CHAT_AMOUNT_MAX_CENTS) {
    throw new DealChatError(`The amount must be a whole number of cents, from 1 to ${DEAL_CHAT_AMOUNT_MAX_CENTS}.`, 422);
  }
  await prisma.$transaction(async (tx) => {
    const { chat, side } = await writableChat(tx, actor, id);
    if (chat.order.state !== "IN_CHAT") throw new DealChatError("The amount can only change while the deal is being agreed.");
    if (amountAgreed(chat.sponsorAmountCents, chat.sellerAmountCents)) throw new DealChatError("Both sides agreed the amount, so it can't be changed.");
    if (side === "SELLER" && chat.athleteId) await assertMayCommit(tx, actor, "accept");
    const mine = side === "SPONSOR" ? chat.sponsorAmountCents : chat.sellerAmountCents;
    const theirs = side === "SPONSOR" ? chat.sellerAmountCents : chat.sponsorAmountCents;
    await tx.dealChat.update({
      /* tenant-scope: the chat found through whereFor(dealChat, write) and locked. */
      where: { id: chat.id }, data: { [side === "SPONSOR" ? "sponsorAmountCents" : "sellerAmountCents"]: cents, lastActionAt: now },
    });
    await audit(tx, actor, "dealChat.amount", "DealChat", chat.id, {
      before: { side, amountCents: mine },
      after: { side, amountCents: cents, agreed: amountAgreed(cents, theirs), ...(actor.actingFor ? { actingForAthleteId: actor.actingFor.athleteId } : {}) },
    });
    await settle(tx, chat.id, now, actor);
  });
  return readDealChat(actor, id);
}

/**
 * POST /deal-chats/:id/call-off — either side calls the deal off before
 * payment, with a reason the other side reads (§3.5). The whole order is
 * cancelled, its stock released and nothing charged; with two sellers it ends
 * for both. Everyone else on the order is emailed the reason. For a minor only
 * the guardian calls it off.
 */
export async function callOffDeal(actor: Actor, id: string, input: { reason?: unknown }, now = new Date()): Promise<DealChatView> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) throw new DealChatError("Give the reason the other side will read.", 422);
  if (reason.length > REASON_MAX) throw new DealChatError(`Keep the reason under ${REASON_MAX} characters.`, 422);
  assertAllowed(actor, "dealChat", "write");
  await prisma.$transaction(async (tx) => {
    const found = await tx.dealChat.findFirst({ where: { ...whereFor(actor, "dealChat", "write"), id }, select: { orderId: true } });
    if (!found) throw new ForbiddenError("dealChat", "write");
    /* The order row first, then the chat — the lock order the sweep and signing keep. */
    await lockOrder(tx, found.orderId);
    const { chat, side } = await writableChat(tx, actor, id);
    if (side === "SELLER" && chat.athleteId) await assertMayCommit(tx, actor, "accept");
    await callOffOrderIn(tx, actor, chat.orderId, now);
    await tx.dealChat.update({
      /* tenant-scope: the chat found through whereFor(dealChat, write) and locked. */
      where: { id: chat.id }, data: { calledOffBy: side, calledOffReason: reason, calledOffAt: now, lastActionAt: now },
    });
    await audit(tx, actor, "dealChat.callOff", "DealChat", chat.id, {
      after: { orderId: chat.orderId, side, reason, ...(actor.actingFor ? { actingForAthleteId: actor.actingFor.athleteId } : {}) },
    });
    /* Every chat on the order closes; everyone but the caller's own side is told why. */
    const all = await tx.dealChat.findMany({
      /* tenant-scope: the chats of the order just cancelled, in its books. */
      where: { tenantId: chat.tenantId, orderId: chat.orderId }, select: CHAT,
    });
    const caller = await names(tx, chat);
    const byName = side === "SPONSOR" ? caller.sponsor : caller.seller;
    const told = new Set((await recipientsOf(tx, chat, side)).map((r) => r.email.toLowerCase()));
    for (const c of all) {
      await tx.dealChat.update({ /* tenant-scope: a chat of the order cancelled above, by its id. */ where: { id: c.id }, data: { state: "CLOSED" } });
      for (const s of ["SPONSOR", "SELLER"] as const) {
        for (const r of await recipientsOf(tx, c, s)) {
          /* One email per person: the sponsor is on every chat of the order; the caller's own side isn't told. */
          if (told.has(r.email.toLowerCase())) continue;
          told.add(r.email.toLowerCase());
          await tell(tx, r, "dealChat.calledOff", `${chat.id}:${c.id}:${s}`, {
            firstName: r.firstName, orderRef: orderRef(chat.orderId), byName, reason, chatUrl: chatUrl(c, s, r.portal),
          });
        }
      }
    }
  });
  return readDealChat(actor, id);
}

/** POST /deal-chat-messages/:id/report — either side (the sponsor's analyst included) reports a message it can see to BTG. */
export async function reportDealChatMessage(actor: Actor, messageId: string, input: { reason?: unknown }, now = new Date()): Promise<{ ok: true }> {
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, REASON_MAX) : "";
  assertAllowed(actor, "dealChat", "read");
  await prisma.$transaction(async (tx) => {
    const m = await tx.dealChatMessage.findFirst({
      /* tenant-scope: a message of a chat the caller reaches through whereFor(dealChat, read). */
      where: { id: messageId, chat: whereFor(actor, "dealChat", "read") },
      select: { id: true, side: true, state: true, reportedAt: true, reportClearedAt: true, chatId: true },
    });
    if (!m) throw new ForbiddenError("dealChat", "read");
    const chat = await tx.dealChat.findFirstOrThrow({ /* tenant-scope: the chat of that message, reached through whereFor above. */ where: { id: m.chatId }, select: CHAT });
    const side = sideOf(actor, chat);
    /* Only the two sides report; a message is reported by whoever can see it. */
    if (!side || (m.side !== side && m.state !== "VISIBLE")) throw new ForbiddenError("dealChat", "read");
    if (m.reportedAt && !m.reportClearedAt) return;
    await tx.dealChatMessage.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: m.id }, data: { reportedAt: now, reportedBy: actor.userId, reportReason: reason || null, reportClearedAt: null } });
    await tellBtg(tx, chat, m.id, `Reported${reason ? `: ${reason}` : ""}`);
    await audit(tx, actor, "dealChat.report", "DealChatMessage", m.id, { after: { chatId: chat.id, side, reason: reason || null } });
  });
  return { ok: true };
}

/* ── BTG's desk: held and reported messages ────────────────────────────── */

export type DealChatReviewItem = {
  messageId: string; chatId: string; orderId: string; orderRef: string; kind: string; side: Side; body: string; createdAt: string;
  state: string; heldReasons: string[]; reported: boolean; reportReason: string | null; reportedAt: string | null;
};

/** GET /deal-chat-reviews — every message waiting for BTG: held before delivery, or reported. Oldest first. */
export async function listDealChatReviews(actor: Actor): Promise<DealChatReviewItem[]> {
  assertAllowed(actor, "dealChatReview", "read");
  const rows = await prisma.dealChatMessage.findMany({
    where: { ...whereFor(actor, "dealChatReview", "read"), OR: [{ state: "HELD" }, { reportedAt: { not: null }, reportClearedAt: null, state: "VISIBLE" }] },
    orderBy: { createdAt: "asc" }, take: 500,
    select: { id: true, chatId: true, kind: true, side: true, body: true, createdAt: true, state: true, heldReasons: true, reportedAt: true, reportReason: true, reportClearedAt: true, chat: { select: { orderId: true } } },
  });
  return rows.map((m) => ({
    messageId: m.id, chatId: m.chatId, orderId: m.chat.orderId, orderRef: orderRef(m.chat.orderId), kind: m.kind, side: m.side as Side, body: m.body,
    createdAt: m.createdAt.toISOString(), state: m.state, heldReasons: m.heldReasons,
    reported: !!m.reportedAt && !m.reportClearedAt, reportReason: m.reportReason, reportedAt: m.reportedAt?.toISOString() ?? null,
  }));
}

async function reviewable(tx: Tx, actor: Actor, messageId: string) {
  assertAllowed(actor, "dealChatReview", "write");
  const m = await tx.dealChatMessage.findFirst({
    where: { ...whereFor(actor, "dealChatReview", "write"), id: messageId },
    select: { id: true, chatId: true, exchangeId: true, kind: true, side: true, userId: true, state: true, reportedAt: true, reportClearedAt: true },
  });
  if (!m) throw new ForbiddenError("dealChatReview", "write");
  await tx.$queryRaw`SELECT id FROM "DealChat" WHERE id = ${m.chatId} FOR UPDATE`;
  const reported = !!m.reportedAt && !m.reportClearedAt;
  if (m.state !== "HELD" && !(m.state === "VISIBLE" && reported)) throw new DealChatError("This message isn't waiting for BTG.");
  const chat = await tx.dealChat.findFirstOrThrow({ /* tenant-scope: the chat of the message found through whereFor(dealChatReview, write), locked above. */ where: { id: m.chatId }, select: CHAT });
  return { m, chat, reported };
}

/** POST /deal-chat-messages/:id/release — BTG lets a held message through, or clears a report. */
export async function releaseDealChatMessage(actor: Actor, messageId: string, now = new Date()): Promise<{ ok: true }> {
  await prisma.$transaction(async (tx) => {
    const { m, chat, reported } = await reviewable(tx, actor, messageId);
    await tx.dealChatMessage.update({
      /* tenant-scope: a row of the chat locked above, by its id. */
      where: { id: m.id },
      data: { state: "VISIBLE", reviewedBy: actor.userId, reviewedAt: now, ...(reported ? { reportClearedAt: now } : {}) },
    });
    await audit(tx, actor, "dealChat.release", "DealChatMessage", m.id, { before: { state: m.state, reported }, after: { state: "VISIBLE" } });
    await settle(tx, chat.id, now, actor);
  });
  return { ok: true };
}

/**
 * POST /deal-chat-messages/:id/keep-back — BTG keeps a message from the other
 * side, with a reason the sender reads. An offer kept back ends its exchange;
 * a reply kept back drops out of it, and the accepts are cleared.
 */
export async function keepBackDealChatMessage(actor: Actor, messageId: string, input: { reason?: unknown }, now = new Date()): Promise<{ ok: true }> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) throw new DealChatError("Give the reason the sender will read.", 422);
  if (reason.length > REASON_MAX) throw new DealChatError(`Keep the reason under ${REASON_MAX} characters.`, 422);
  await prisma.$transaction(async (tx) => {
    const { m, chat, reported } = await reviewable(tx, actor, messageId);
    await tx.dealChatMessage.update({
      /* tenant-scope: a row of the chat locked above, by its id. */
      where: { id: m.id },
      data: { state: "KEPT_BACK", keptBackReason: reason, reviewedBy: actor.userId, reviewedAt: now, ...(reported ? { reportClearedAt: now } : {}) },
    });
    if (m.exchangeId) {
      const x = await tx.dealChatExchange.findFirst({ where: { tenantId: chat.tenantId, id: m.exchangeId }, select: { id: true, state: true } });
      if (x?.state === "OPEN") {
        if (m.kind === "OFFER") {
          await tx.dealChatExchange.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: x.id }, data: { state: "DECLINED", closedAt: now } });
        } else {
          const prev = await tx.dealChatMessage.findFirst({
            where: { tenantId: chat.tenantId, exchangeId: x.id, state: { not: "KEPT_BACK" } }, orderBy: { createdAt: "desc" }, select: { id: true },
          });
          await tx.dealChatExchange.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: x.id }, data: { latestMessageId: prev?.id ?? null, sponsorAcceptedMessageId: null, sellerAcceptedMessageId: null } });
        }
      }
    }
    const sender = await tx.user.findFirst({
      /* tenant-scope: the message's own author, by the id recorded on it (in their own tenant). */
      where: { id: m.userId }, select: { tenantId: true, email: true },
    });
    if (sender) {
      await tell(tx, sender, "dealChat.keptBack", m.id, {
        orderRef: orderRef(chat.orderId), reason, chatUrl: chatUrl(chat, m.side as Side, chat.propertyId ? "property" : "athlete"),
      });
    }
    await audit(tx, actor, "dealChat.keepBack", "DealChatMessage", m.id, { before: { state: m.state, reported }, after: { state: "KEPT_BACK", reason } });
    await settle(tx, chat.id, now, actor);
  });
  return { ok: true };
}

/* ── the worker's sweep: unread email, reminders, ended orders ─────────── */

/**
 * 2S4-BE-15 — the signing limit. An order still IN_CHAT 10 working days
 * (the setting) after it was placed is cancelled, its stock released and both
 * sides of every chat emailed; 2 working days before, both sides get a last
 * warning. Each order is locked first, then its chats.
 */
async function sweepDealDeadlines(now: Date, opts: { tenantIds?: string[] }): Promise<{ warned: number; expired: number }> {
  const out = { warned: 0, expired: 0 };
  const days = env.DEAL_CHAT_SIGNING_WORKING_DAYS;
  const orders = await prisma.marketplaceOrder.findMany({
    /* tenant-scope: the system's sweep over every tenant's orders in the chat (narrowed in tests). */
    where: { state: "IN_CHAT", ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    select: { id: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 1000,
  });
  for (const o of orders) {
    const { deadline, warnAt } = signingDeadline(o.createdAt, days);
    if (now < warnAt) continue;
    await prisma.$transaction(async (tx) => {
      if ((await lockOrder(tx, o.id)) !== "IN_CHAT") return;
      const chats = await tx.dealChat.findMany({
        /* tenant-scope: the chats of the order locked above. */
        where: { orderId: o.id }, select: CHAT,
      });
      const ref = orderRef(o.id);
      const until = deadline.toISOString().slice(0, 10);
      if (now >= deadline) {
        const system = { userId: null, tenantId: chats[0]?.tenantId ?? "" };
        await cancelOrderAsSystem(tx, o.id, "NOT_SIGNED", now);
        for (const c of chats) {
          await tx.dealChat.update({ /* tenant-scope: a chat of the order locked above, by its id. */ where: { id: c.id }, data: { state: "CLOSED" } });
          await audit(tx, { ...system, tenantId: c.tenantId }, "dealChat.expired", "DealChat", c.id, { after: { orderId: o.id, deadline: deadline.toISOString(), workingDays: days } });
          const n = await names(tx, c);
          for (const side of ["SPONSOR", "SELLER"] as const) {
            for (const r of await recipientsOf(tx, c, side)) {
              await tell(tx, r, "dealChat.expired", `${c.id}:${side}`, {
                firstName: r.firstName, orderRef: ref, otherName: side === "SPONSOR" ? n.seller : n.sponsor, days: String(days), chatUrl: chatUrl(c, side, r.portal),
              });
            }
          }
        }
        out.expired++;
        return;
      }
      for (const c of chats) {
        if (c.lastWarnedAt) continue;
        const status = await loadDealStatus(tx, c);
        const n = await names(tx, c);
        for (const side of ["SPONSOR", "SELLER"] as const) {
          for (const r of await recipientsOf(tx, c, side)) {
            await tell(tx, r, "dealChat.lastWarning", `${c.id}:${side}`, {
              firstName: r.firstName, orderRef: ref, otherName: side === "SPONSOR" ? n.seller : n.sponsor, deadline: until,
              waitingFor: status.notYet.join("; ") || "both signatures on the agreement", chatUrl: chatUrl(c, side, r.portal),
            });
          }
        }
        await tx.dealChat.update({ /* tenant-scope: a chat of the order locked above, by its id. */ where: { id: c.id }, data: { lastWarnedAt: now } });
        await audit(tx, { userId: null, tenantId: c.tenantId }, "dealChat.lastWarning", "DealChat", c.id, { after: { orderId: o.id, deadline: deadline.toISOString() } });
        out.warned++;
      }
    });
  }
  return out;
}


/**
 * Every few minutes: close the chats of ended orders; email each side its
 * unread messages once the oldest is 15 minutes old (one email, not one per
 * message); remind whoever's turn it is after every 2 working days without a
 * move, until the agreement is signed.
 */
export async function sweepDealChats(now = new Date(), opts: { tenantIds?: string[] } = {}): Promise<{ closed: number; unread: number; reminders: number; warned: number; expired: number }> {
  const out = { closed: 0, unread: 0, reminders: 0, ...(await sweepDealDeadlines(now, opts)) };
  const chats = await prisma.dealChat.findMany({
    /* tenant-scope: the system's sweep over every tenant's open chats (narrowed in tests). */
    where: { state: "OPEN", ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    select: { id: true }, orderBy: { lastActionAt: "asc" }, take: 1000,
  });
  for (const { id } of chats) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DealChat" WHERE id = ${id} FOR UPDATE`;
      const c = await tx.dealChat.findFirstOrThrow({ /* tenant-scope: one chat of the sweep, locked. */ where: { id }, select: CHAT });
      if (ENDED_ORDER_STATES.has(c.order.state)) {
        await tx.dealChat.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: c.id }, data: { state: "CLOSED" } });
        await audit(tx, { userId: null, tenantId: c.tenantId }, "dealChat.close", "DealChat", c.id, { after: { orderState: c.order.state } });
        out.closed++;
        return;
      }
      const n = await names(tx, c);
      /* Unread, per side. */
      for (const side of ["SPONSOR", "SELLER"] as const) {
        const since = [side === "SPONSOR" ? c.sponsorReadAt : c.sellerReadAt, side === "SPONSOR" ? c.sponsorEmailedAt : c.sellerEmailedAt]
          .filter((d): d is Date => !!d).reduce<Date | null>((a, d) => (!a || d > a ? d : a), null);
        const waiting = await tx.dealChatMessage.findMany({
          where: { tenantId: c.tenantId, chatId: c.id, side: otherSide(side), state: "VISIBLE", ...(since ? { createdAt: { gt: since } } : {}) },
          orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true },
        });
        if (!waiting.length || now.getTime() - waiting[0]!.createdAt.getTime() < DEAL_CHAT_UNREAD_DELAY_MS) continue;
        const newest = waiting[waiting.length - 1]!;
        for (const r of await recipientsOf(tx, c, side)) {
          await tell(tx, r, "dealChat.unread", `${c.id}:${side}:${newest.id}`, {
            firstName: r.firstName, orderRef: orderRef(c.orderId), otherName: side === "SPONSOR" ? n.seller : n.sponsor,
            count: String(waiting.length), chatUrl: chatUrl(c, side, r.portal),
          });
        }
        await tx.dealChat.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: c.id }, data: side === "SPONSOR" ? { sponsorEmailedAt: newest.createdAt } : { sellerEmailedAt: newest.createdAt } });
        out.unread++;
      }
      /* Reminders, to whoever's turn it is. */
      const base = c.lastRemindedAt && c.lastRemindedAt > c.lastActionAt ? c.lastRemindedAt : c.lastActionAt;
      if (now < addWorkingDays(base, DEAL_CHAT_REMINDER_WORKING_DAYS)) return;
      const status = await loadDealStatus(tx, c);
      const due = status.turn.filter((s): s is Side => s !== "BTG");
      if (!due.length) return;
      for (const side of due) {
        for (const r of await recipientsOf(tx, c, side)) {
          await tell(tx, r, "dealChat.reminder", `${c.id}:${base.toISOString()}`, {
            firstName: r.firstName, orderRef: orderRef(c.orderId), otherName: side === "SPONSOR" ? n.seller : n.sponsor,
            waitingFor: status.notYet.join("; ") || "your signature on the agreement", chatUrl: chatUrl(c, side, r.portal),
          });
        }
      }
      await tx.dealChat.update({ /* tenant-scope: a row of the chat locked above, by its id. */ where: { id: c.id }, data: { lastRemindedAt: now } });
      out.reminders++;
    });
  }
  return out;
}
