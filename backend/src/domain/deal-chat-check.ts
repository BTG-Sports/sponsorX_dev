/**
 * Deal Chat — where a chat stands, read from the database (2S4-BE-16).
 *
 * Shared by the chat (deal-chat.ts) and by signing (deal-agreement.ts): the
 * server checks that everything is green right before each signature, not
 * only when the form is posted (owner, 2026-11-18: "the system should double
 * check before the signature if all is green").
 */
import type { Prisma } from "../generated/prisma/client";
import type { DealForm } from "./deal-cards";
import { dealStatus, type DealStatus, type Side } from "./deal-chat-rules";

type Tx = Prisma.TransactionClient;

/** The chat fields the status needs. */
export type StatusChat = {
  id: string; tenantId: string; orderId: string; forms: readonly string[]; lineIds: readonly string[]; dealAgreementId: string | null;
  sponsorAmountCents: number | null; sellerAmountCents: number | null;
};
export const STATUS_CHAT = {
  id: true, tenantId: true, orderId: true, forms: true, lineIds: true, dealAgreementId: true, sponsorAmountCents: true, sellerAmountCents: true,
} as const;

/** The order's amount for the chat's lines, before any change: what the final amount is pre-filled with. */
export async function originalAmount(tx: Tx, c: { tenantId: string; orderId: string; lineIds: readonly string[] }): Promise<number> {
  const deal = await tx.dealAgreement.findFirst({
    /* tenant-scope: the chat's own order's agreements, in its books. Once one is posted it recorded the original. */
    where: { tenantId: c.tenantId, orderId: c.orderId, lineIds: { hasSome: [...c.lineIds] } }, orderBy: { createdAt: "asc" }, select: { originalAmountCents: true },
  });
  if (deal) return deal.originalAmountCents;
  const lines = await tx.marketplaceOrderLine.findMany({
    /* tenant-scope: the chat's own lines, in the order's books. */
    where: { tenantId: c.tenantId, orderId: c.orderId, id: { in: [...c.lineIds] } }, select: { lineTotalCents: true },
  });
  return lines.reduce((s, l) => s + l.lineTotalCents, 0);
}

export class DealChatNotGreenError extends Error {
  readonly status = 409;
  constructor(notYet: readonly string[]) {
    super(`Not everything in the Deal Chat is agreed yet: ${notYet.join("; ")}.`);
    this.name = "DealChatNotGreenError";
  }
}

/** The chat's status, from its picks, exchanges, held messages and its agreement. */
export async function loadDealStatus(tx: Tx, chat: StatusChat): Promise<DealStatus> {
  /* tenant-scope: every read below is pinned to this chat (reached by the caller through whereFor) and its books. */
  const inChat = { tenantId: chat.tenantId, chatId: chat.id };
  const [picks, exchanges, messages, heldCount, agreement, originalCents] = await Promise.all([
    tx.dealChatPick.findMany({ where: { ...inChat, tenantId: chat.tenantId }, select: { cardKey: true, side: true, value: true } }),
    tx.dealChatExchange.findMany({
      where: { ...inChat, tenantId: chat.tenantId }, orderBy: { createdAt: "asc" },
      select: { id: true, cardKey: true, state: true, latestMessageId: true, sponsorAcceptedMessageId: true, sellerAcceptedMessageId: true },
    }),
    tx.dealChatMessage.findMany({
      where: { ...inChat, tenantId: chat.tenantId, exchangeId: { not: null } }, orderBy: { createdAt: "asc" },
      select: { id: true, exchangeId: true, side: true, state: true, body: true },
    }),
    tx.dealChatMessage.count({ where: { ...inChat, tenantId: chat.tenantId, state: "HELD" } }),
    chat.dealAgreementId
      ? tx.dealAgreement.findFirst({
          where: { tenantId: chat.tenantId, id: chat.dealAgreementId },
          select: { id: true, state: true, sponsorAcceptanceId: true, sellerAcceptanceId: true },
        })
      : null,
    originalAmount(tx, chat),
  ]);
  const byId = new Map(messages.map((m) => [m.id, m]));
  return dealStatus({
    forms: chat.forms as DealForm[],
    picks: picks.map((p) => ({ cardKey: p.cardKey, side: p.side as Side, value: p.value })),
    exchanges: exchanges.map((x) => {
      const latest = x.latestMessageId ? byId.get(x.latestMessageId) : undefined;
      return {
        id: x.id, cardKey: x.cardKey, state: x.state,
        latest: latest ? { id: latest.id, side: latest.side as Side, held: latest.state === "HELD" } : null,
        sponsorAcceptedMessageId: x.sponsorAcceptedMessageId, sellerAcceptedMessageId: x.sellerAcceptedMessageId,
        texts: messages.filter((m) => m.exchangeId === x.id && m.state === "VISIBLE").map((m) => m.body),
      };
    }),
    heldCount,
    amount: { originalCents, sponsorCents: chat.sponsorAmountCents, sellerCents: chat.sellerAmountCents },
    agreement: agreement
      ? { id: agreement.id, state: agreement.state, sponsorSigned: !!agreement.sponsorAcceptanceId, sellerSigned: !!agreement.sellerAcceptanceId }
      : null,
  });
}

/**
 * Right before a signature: the agreement's chat, if it has one, must be all
 * green and must have posted this very form. Throws DealChatNotGreenError.
 */
export async function assertDealChatGreen(
  tx: Tx,
  agreement: { id: string; tenantId: string; orderId: string; athleteId: string | null; propertyId: string | null },
): Promise<void> {
  const sellerKey = agreement.propertyId ? `property:${agreement.propertyId}` : `athlete:${agreement.athleteId}`;
  const chat = await tx.dealChat.findFirst({
    /* tenant-scope: the chat of the agreement being signed, in the order's books. */
    where: { tenantId: agreement.tenantId, orderId: agreement.orderId, sellerKey },
    select: { ...STATUS_CHAT, state: true },
  });
  if (!chat) return; // an agreement opened outside a chat (before the switch) keeps 2S4-BE-14's rules
  if (chat.state !== "OPEN") throw new DealChatNotGreenError(["the chat is closed"]);
  if (chat.dealAgreementId !== agreement.id) throw new DealChatNotGreenError(["this is not the form the chat posted"]);
  const status = await loadDealStatus(tx, chat);
  if (!status.allGreen) throw new DealChatNotGreenError(status.notYet);
}

export class DealNotSignedError extends Error {
  readonly status = 409;
  constructor() {
    super("The deal agreement isn't signed by both sides yet. Payment opens once it is.");
    this.name = "DealNotSignedError";
  }
}

/**
 * 2S4-BE-15 — the payment gate: every Deal Chat on the order has an agreement
 * signed by both. Orders with no chat (placed before the switch) pass.
 * Hiding the Pay button is not the gate; this is.
 */
export async function assertDealsSigned(tx: Tx, order: { id: string; tenantId: string }): Promise<void> {
  const chats = await tx.dealChat.findMany({
    /* tenant-scope: the chats of the order being paid, in its books. */
    where: { tenantId: order.tenantId, orderId: order.id }, select: { dealAgreementId: true },
  });
  if (!chats.length) return;
  const ids = chats.map((c) => c.dealAgreementId).filter((x): x is string => !!x);
  if (ids.length < chats.length) throw new DealNotSignedError();
  const signed = await tx.dealAgreement.count({
    /* tenant-scope: the agreements those chats posted, in the order's books. */
    where: { tenantId: order.tenantId, id: { in: ids }, state: "SIGNED" },
  });
  if (signed < chats.length) throw new DealNotSignedError();
}
