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

export class DealChatNotGreenError extends Error {
  readonly status = 409;
  constructor(notYet: readonly string[]) {
    super(`Not everything in the Deal Chat is agreed yet: ${notYet.join("; ")}.`);
    this.name = "DealChatNotGreenError";
  }
}

/** The chat's status, from its picks, exchanges, held messages and its agreement. */
export async function loadDealStatus(tx: Tx, chat: { id: string; tenantId: string; forms: readonly string[]; dealAgreementId: string | null }): Promise<DealStatus> {
  /* tenant-scope: every read below is pinned to this chat (reached by the caller through whereFor) and its books. */
  const inChat = { tenantId: chat.tenantId, chatId: chat.id };
  const [picks, exchanges, messages, heldCount, agreement] = await Promise.all([
    tx.dealChatPick.findMany({ where: { ...inChat, tenantId: chat.tenantId }, select: { cardKey: true, side: true, value: true } }),
    tx.dealChatExchange.findMany({
      where: { ...inChat, tenantId: chat.tenantId }, orderBy: { createdAt: "asc" },
      select: { id: true, cardKey: true, state: true, latestMessageId: true, sponsorAcceptedMessageId: true, sellerAcceptedMessageId: true },
    }),
    tx.dealChatMessage.findMany({
      where: { ...inChat, tenantId: chat.tenantId, exchangeId: { not: null } },
      select: { id: true, exchangeId: true, side: true, state: true, body: true },
    }),
    tx.dealChatMessage.count({ where: { ...inChat, tenantId: chat.tenantId, state: "HELD" } }),
    chat.dealAgreementId
      ? tx.dealAgreement.findFirst({
          where: { tenantId: chat.tenantId, id: chat.dealAgreementId },
          select: { id: true, state: true, sponsorAcceptanceId: true, sellerAcceptanceId: true },
        })
      : null,
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
    select: { id: true, tenantId: true, forms: true, dealAgreementId: true, state: true },
  });
  if (!chat) return; // an agreement opened outside a chat (before the switch) keeps 2S4-BE-14's rules
  if (chat.state !== "OPEN") throw new DealChatNotGreenError(["the chat is closed"]);
  if (chat.dealAgreementId !== agreement.id) throw new DealChatNotGreenError(["this is not the form the chat posted"]);
  const status = await loadDealStatus(tx, chat);
  if (!status.allGreen) throw new DealChatNotGreenError(status.notYet);
}
