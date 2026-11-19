/**
 * /api/v1/deal-chats — Deal Chat between an order's sponsor and one seller
 * (2S4-BE-16; the final amount and calling off, 2S4-BE-15), and BTG's desk of held and reported messages. The rules live
 * in domain/deal-chat.ts. Every write that changed a chat is announced on the
 * socket afterwards (realtime/deal-chat-socket.ts: a chat id, never its content).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import {
  DealChatAcceptInput, DealChatAmountInput, DealChatCallOffInput, DealChatListQuery, DealChatOfferInput, DealChatPickInput, DealChatReasonInput, DealChatTextInput,
} from "../../contracts/deal-chat";
import {
  acceptDealOffer, callOffDeal, confirmDealAmount, declineDealOffer, keepBackDealChatMessage, listDealChatReviews, listDealChats, makeDealOffer,
  markDealChatRead, pickDealCard, postDealChatMessage, readDealChat, releaseDealChatMessage, replyToDealOffer, reportDealChatMessage,
} from "../../domain/deal-chat";
import { announceDealChat } from "../../realtime/deal-chat-socket";

export const dealChatsRouter = Router();

type Id = { id: string };
type Ex = { id: string; exchangeId: string };

const list: RequestHandler = async (req, res) => {
  res.json(await listDealChats(req.actor!, DealChatListQuery.parse(req.query ?? {})));
};
const read: RequestHandler<Id> = async (req, res) => {
  res.json(await readDealChat(req.actor!, req.params.id));
};
const markRead: RequestHandler<Id> = async (req, res) => {
  res.json(await markDealChatRead(req.actor!, req.params.id));
  announceDealChat({ chatId: req.params.id });
};
const message: RequestHandler<Id> = async (req, res) => {
  res.status(201).json(await postDealChatMessage(req.actor!, req.params.id, DealChatTextInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const pick: RequestHandler<{ id: string; cardKey: string }> = async (req, res) => {
  res.json(await pickDealCard(req.actor!, req.params.id, req.params.cardKey, DealChatPickInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const offer: RequestHandler<Id> = async (req, res) => {
  res.status(201).json(await makeDealOffer(req.actor!, req.params.id, DealChatOfferInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const reply: RequestHandler<Ex> = async (req, res) => {
  res.status(201).json(await replyToDealOffer(req.actor!, req.params.id, req.params.exchangeId, DealChatTextInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const accept: RequestHandler<Ex> = async (req, res) => {
  res.json(await acceptDealOffer(req.actor!, req.params.id, req.params.exchangeId, DealChatAcceptInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const decline: RequestHandler<Ex> = async (req, res) => {
  res.json(await declineDealOffer(req.actor!, req.params.id, req.params.exchangeId));
  announceDealChat({ chatId: req.params.id });
};
const amount: RequestHandler<Id> = async (req, res) => {
  res.json(await confirmDealAmount(req.actor!, req.params.id, DealChatAmountInput.parse(req.body ?? {})));
  announceDealChat({ chatId: req.params.id });
};
const callOff: RequestHandler<Id> = async (req, res) => {
  const chat = await callOffDeal(req.actor!, req.params.id, DealChatCallOffInput.parse(req.body ?? {}));
  res.json(chat);
  /* Calling off closes every chat on the order, so each of them is announced. */
  announceDealChat({ orderId: chat.orderId });
};
const report: RequestHandler<Id> = async (req, res) => {
  res.json(await reportDealChatMessage(req.actor!, req.params.id, DealChatReasonInput.parse(req.body ?? {})));
  announceDealChat({ messageId: req.params.id });
};
const reviews: RequestHandler = async (req, res) => {
  res.json(await listDealChatReviews(req.actor!));
};
const release: RequestHandler<Id> = async (req, res) => {
  res.json(await releaseDealChatMessage(req.actor!, req.params.id));
  announceDealChat({ messageId: req.params.id });
};
const keepBack: RequestHandler<Id> = async (req, res) => {
  res.json(await keepBackDealChatMessage(req.actor!, req.params.id, DealChatReasonInput.parse(req.body ?? {})));
  announceDealChat({ messageId: req.params.id });
};

dealChatsRouter.get("/deal-chats", requireActor, list);
dealChatsRouter.get("/deal-chats/:id", requireActor, read);
dealChatsRouter.post("/deal-chats/:id/read", requireActor, markRead);
dealChatsRouter.post("/deal-chats/:id/messages", requireActor, message);
dealChatsRouter.put("/deal-chats/:id/picks/:cardKey", requireActor, pick);
dealChatsRouter.post("/deal-chats/:id/offers", requireActor, offer);
dealChatsRouter.post("/deal-chats/:id/exchanges/:exchangeId/reply", requireActor, reply);
dealChatsRouter.post("/deal-chats/:id/exchanges/:exchangeId/accept", requireActor, accept);
dealChatsRouter.post("/deal-chats/:id/exchanges/:exchangeId/decline", requireActor, decline);
dealChatsRouter.put("/deal-chats/:id/amount", requireActor, amount);
dealChatsRouter.post("/deal-chats/:id/call-off", requireActor, callOff);
dealChatsRouter.post("/deal-chat-messages/:id/report", requireActor, report);
dealChatsRouter.get("/deal-chat-reviews", requireActor, reviews);
dealChatsRouter.post("/deal-chat-messages/:id/release", requireActor, release);
dealChatsRouter.post("/deal-chat-messages/:id/keep-back", requireActor, keepBack);
