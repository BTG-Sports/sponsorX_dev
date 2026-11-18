import { z } from "./zod";

/* --------------------------------------------------------------------------
   Deal Chat on the wire — 2S4-BE-16 (feature spec §3.1–§3.4, §6, §7).
   -------------------------------------------------------------------------- */

const Side = z.enum(["SPONSOR", "SELLER"]);
const text = z.string().min(1).max(4000);

export const DealChatListQuery = z
  .object({ orderId: z.string().optional() })
  .meta({ id: "DealChatListQuery", description: "Narrow the chats to one order." });

export const DealChatTextInput = z
  .object({ text })
  .meta({ id: "DealChatTextInput", description: "A message or a reply: plain text. One with contact details, outside payment or a restricted word waits for BTG before the other side sees it." });

export const DealChatOfferInput = z
  .object({ text, cardKey: z.string().nullable().optional() })
  .meta({ id: "DealChatOfferInput", description: "A free-text offer, about a question card or not. Text only: there is no price or option field (owner, 2026-11-17)." });

export const DealChatPickInput = z
  .object({ value: z.union([z.string(), z.array(z.string()).min(1)]) })
  .meta({ id: "DealChatPickInput", description: "The caller's side's answer to a card: one value, or several for a tick-all card. Refused once both sides agreed the card." });

export const DealChatAcceptInput = z
  .object({ messageId: z.string() })
  .meta({ id: "DealChatAcceptInput", description: "Accept the exchange as it stands: the latest message the caller read. Refused (409) when a newer message has arrived." });

export const DealChatReasonInput = z
  .object({ reason: z.string().max(2000).optional() })
  .meta({ id: "DealChatReasonInput", description: "Why: the report's reason (optional), or the reason BTG keeps a message back (required; the sender reads it)." });

export const DealChatAmountInput = z
  .object({ amountCents: z.int().min(1).max(100_000_000) })
  .meta({ id: "DealChatAmountInput", description: "2S4-BE-15 — the final amount the caller's side confirms (the original, pre-filled) or types over, in cents. Agreed when both sides' match, and then locked; for a minor only the guardian confirms it." });

export const DealChatCallOffInput = z
  .object({ reason: z.string().min(1).max(2000) })
  .meta({ id: "DealChatCallOffInput", description: "2S4-BE-15 — why the deal is called off: the other side reads it." });

const Status = z.object({
  cards: z.array(z.object({
    key: z.string(), question: z.string(), multi: z.boolean(),
    answers: z.array(z.object({ value: z.string(), label: z.string() })),
    sponsor: z.array(z.string()).nullable(), seller: z.array(z.string()).nullable(), agreed: z.boolean(),
  })),
  agreedCount: z.int(), cardCount: z.int(),
  amount: z.object({
    originalCents: z.int(), sponsorCents: z.int().nullable(), sellerCents: z.int().nullable(), agreed: z.boolean(), agreedCents: z.int().nullable(),
  }),
  openExchanges: z.array(z.object({ id: z.string(), cardKey: z.string().nullable(), waitingOn: z.enum(["SPONSOR", "SELLER", "BTG"]).nullable() })),
  heldForBtg: z.int(),
  allGreen: z.boolean(),
  notYet: z.array(z.string()),
  turn: z.array(z.enum(["SPONSOR", "SELLER", "BTG"])),
  moneyFigures: z.array(z.string()),
});

export const DealChat = z
  .object({
    id: z.string(), orderId: z.string(), orderRef: z.string(), state: z.enum(["OPEN", "CLOSED"]),
    forms: z.array(z.string()), lineIds: z.array(z.string()), sponsorName: z.string(), sellerName: z.string(),
    yourSide: Side.nullable(), mayAccept: z.boolean(), unread: z.int(),
    status: Status, moneyNudge: z.string().nullable(),
    agreement: z.object({ id: z.string(), downloadPath: z.string() }).nullable(),
    orderState: z.string(), signingDeadline: z.string().nullable(),
    calledOff: z.object({ side: Side, reason: z.string(), at: z.string() }).nullable(),
    exchanges: z.array(z.object({
      id: z.string(), cardKey: z.string().nullable(), state: z.enum(["OPEN", "AGREED", "DECLINED"]), startedBy: Side,
      latestMessageId: z.string().nullable(), sponsorAccepted: z.boolean(), sellerAccepted: z.boolean(),
    })),
    messages: z.array(z.object({
      id: z.string(), kind: z.enum(["TEXT", "OFFER", "REPLY"]), side: Side, exchangeId: z.string().nullable(), body: z.string(),
      createdAt: z.string(), byGuardian: z.boolean(), state: z.enum(["VISIBLE", "HELD", "KEPT_BACK"]), keptBackReason: z.string().nullable(),
      heldReasons: z.array(z.string()).optional(), reported: z.boolean().optional(), reportReason: z.string().nullable().optional(),
    })),
    createdAt: z.string(), lastActionAt: z.string(),
  })
  .meta({
    id: "DealChat",
    description: "A Deal Chat between an order's sponsor and one seller: the checklist (`status`: which cards are agreed, the final amount (`status.amount`), which offers are open, whose turn it is, whether everything is green), the offers and the messages the caller may see, the agreement once it is posted, the order's stage with its signing deadline while IN_CHAT, and who called the deal off and why.",
  });

export const DealChatSummary = z
  .object({
    id: z.string(), orderId: z.string(), orderRef: z.string(), state: z.enum(["OPEN", "CLOSED"]), forms: z.array(z.string()),
    dealAgreementId: z.string().nullable(), unread: z.int(), lastActionAt: z.string(), createdAt: z.string(),
  })
  .meta({ id: "DealChatSummary", description: "A Deal Chat in a list: its order, unread count for the caller's side, and its agreement once posted." });

export const DealChatReviewItem = z
  .object({
    messageId: z.string(), chatId: z.string(), orderId: z.string(), orderRef: z.string(), kind: z.enum(["TEXT", "OFFER", "REPLY"]), side: Side,
    body: z.string(), createdAt: z.string(), state: z.enum(["VISIBLE", "HELD"]), heldReasons: z.array(z.string()),
    reported: z.boolean(), reportReason: z.string().nullable(), reportedAt: z.string().nullable(),
  })
  .meta({ id: "DealChatReviewItem", description: "A Deal Chat message waiting for BTG: held before delivery (with why), or reported by a side." });
