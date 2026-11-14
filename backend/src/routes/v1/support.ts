/**
 * Contacting BTG support — 2S1-BE-16. PUBLIC and rate-limited (by address
 * and by sender), like /public/inquiries. Nothing here sends mail: each
 * message is queued through the worker (domain/support.ts).
 *
 *   GET  /public/support                                       the support address, whether it is live, the topics
 *   POST /public/support/messages                              a message (and its attachments' upload grants)
 *   POST /public/support/messages/:token/send                  attachments uploaded: queue it
 *   POST /public/support/messages/:token/attachments/:attachmentId/drop   send without a file that won't upload
 *
 * BTG's support desk (2S0-SEC-01, POL-BE-41) — the mailbox's notice links here:
 *   GET  /support-messages                                     the inbox: one status tab (NEW by default) and every tab's count
 *   GET  /support-messages/:id                                 one message: text, status, replies, attachments' names, the sender's records
 *   POST /support-messages/:id/replies                         a reply, kept and emailed to the sender from noreply@
 *   POST /support-messages/:id/close                           "Mark closed"
 *   GET  /support-messages/:id/attachments/:attachmentId       one attachment: a five-minute, audited link
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { SupportMessageInput, SupportMessageListQuery, SupportReplyInput } from "../../contracts/support";
import { pageRequest } from "../../lib/paging";
import {
  closeSupportMessage, dropSupportAttachment, getSupportMessage, listSupportMessages, replyToSupportMessage, sendSupportMessage, submitSupportMessage,
  supportContact, viewSupportAttachment,
} from "../../domain/support";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const supportRouter = Router();

const contact: RequestHandler = async (_req, res) => {
  res.json(supportContact());
};

const submit: RequestHandler = async (req, res) => {
  await limit("support:message", clientIp(req), 5, 3600);
  const input = SupportMessageInput.parse(req.body ?? {});
  await limit("support:message:sender", input.email.toLowerCase(), 5, 3600);
  res.status(201).json(await submitSupportMessage(input));
};

const finish: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("support:send", clientIp(req), 20, 3600);
  res.json(await sendSupportMessage(req.params.token));
};

const drop: RequestHandler<{ token: string; attachmentId: string }> = async (req, res) => {
  await limit("support:send", clientIp(req), 20, 3600);
  res.json(await dropSupportAttachment(req.params.token, req.params.attachmentId));
};

const list: RequestHandler = async (req, res) => {
  /* ?page= turns on the house pager (lib/paging.ts); without it the newest 200. */
  res.json(await listSupportMessages(req.actor!, SupportMessageListQuery.parse(req.query).status, pageRequest(req.query as Record<string, unknown>) ?? undefined));
};

const reply: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await replyToSupportMessage(req.actor!, req.params.id, SupportReplyInput.parse(req.body ?? {}).body));
};

const close: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await closeSupportMessage(req.actor!, req.params.id));
};

const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getSupportMessage(req.actor!, req.params.id));
};

const attachment: RequestHandler<{ id: string; attachmentId: string }> = async (req, res) => {
  res.json(await viewSupportAttachment(req.actor!, req.params.id, req.params.attachmentId));
};

supportRouter.get("/public/support", contact);
supportRouter.post("/public/support/messages", submit);
supportRouter.post("/public/support/messages/:token/send", finish);
supportRouter.post("/public/support/messages/:token/attachments/:attachmentId/drop", drop);
supportRouter.get("/support-messages", requireActor, list);
supportRouter.get("/support-messages/:id", requireActor, one);
supportRouter.post("/support-messages/:id/replies", requireActor, reply);
supportRouter.post("/support-messages/:id/close", requireActor, close);
supportRouter.get("/support-messages/:id/attachments/:attachmentId", requireActor, attachment);
