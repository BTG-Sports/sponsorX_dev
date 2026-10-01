/**
 * Contacting BTG support — 2S1-BE-16. PUBLIC and rate-limited (by address
 * and by sender), like /public/inquiries. Nothing here sends mail: each
 * message is queued through the worker (domain/support.ts).
 *
 *   GET  /public/support                                       the support address, whether it is live, the topics
 *   POST /public/support/messages                              a message (and its attachments' upload grants)
 *   POST /public/support/messages/:token/send                  attachments uploaded: queue it
 *   POST /public/support/messages/:token/attachments/:attachmentId/drop   send without a file that won't upload
 */
import { Router, type RequestHandler } from "express";

import { SupportMessageInput } from "../../contracts/support";
import { dropSupportAttachment, sendSupportMessage, submitSupportMessage, supportContact } from "../../domain/support";
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

supportRouter.get("/public/support", contact);
supportRouter.post("/public/support/messages", submit);
supportRouter.post("/public/support/messages/:token/send", finish);
supportRouter.post("/public/support/messages/:token/attachments/:attachmentId/drop", drop);
