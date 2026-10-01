/**
 * Changing a minor's guardian — 2S1-BE-15.
 *
 * PUBLIC (the new guardian has no login yet; the request token is the key):
 *   GET  /public/guardian-handoffs/lookup?athleteEmail=     is this the athlete? first names only
 *   POST /public/guardian-handoffs                          start the request — the only way a handoff starts
 *   POST /public/guardian-handoffs/confirm-email            the link in the confirmation email
 *   GET  /public/guardian-handoffs/:token                   where it stands
 *   POST /public/guardian-handoffs/:token/documents         a presigned PUT for the ID or the proof
 *   POST /public/guardian-handoffs/:token/documents/:documentId/confirm
 *   POST /public/guardian-handoffs/:token/submit            accept the agreement; send to the current guardian
 *
 * SIGNED IN (the current guardian answers; the athlete reads):
 *   GET  /guardian-handoffs
 *   GET  /guardian-handoffs/:id
 *   POST /guardian-handoffs/:id/decision                    HAND_OFF | DECLINE
 *   POST /guardian-handoffs/:id/staff-decision              BTG: CONFIRM | DECLINE, when staff confirm minors
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import {
  HandoffDecisionInput, HandoffDocumentInput, HandoffStaffDecisionInput, HandoffEmailConfirmInput, HandoffLookupQuery, HandoffStartInput, HandoffSubmitInput,
} from "../../contracts/guardian-handoff";
import {
  confirmHandoffDocumentUpload, confirmHandoffEmail, decideHandoff, decideStaffHandoff, getHandoff, handoffStatus, listHandoffs, lookupAthleteForHandoff,
  requestHandoffDocumentUpload, startHandoff, submitHandoff,
} from "../../domain/guardian-handoff";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const guardianHandoffsRouter = Router();

const lookup: RequestHandler = async (req, res) => {
  /* Tight: each answer says whether a minor uses that email. */
  await limit("handoff:lookup", clientIp(req), 10, 3600);
  const q = HandoffLookupQuery.parse(req.query);
  res.json(await lookupAthleteForHandoff(q.athleteEmail));
};
const start: RequestHandler = async (req, res) => {
  await limit("handoff:start", clientIp(req), 5, 3600);
  res.status(201).json(await startHandoff(HandoffStartInput.parse(req.body ?? {})));
};
const confirmEmail: RequestHandler = async (req, res) => {
  await limit("handoff:confirm", clientIp(req), 30, 3600);
  res.json(await confirmHandoffEmail(HandoffEmailConfirmInput.parse(req.body ?? {}).token));
};
const status: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("handoff:read", clientIp(req), 120, 3600);
  res.json(await handoffStatus(req.params.token));
};
const upload: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("handoff:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestHandoffDocumentUpload(req.params.token, HandoffDocumentInput.parse(req.body ?? {})));
};
const confirmUpload: RequestHandler<{ token: string; documentId: string }> = async (req, res) => {
  await limit("handoff:document", clientIp(req), 30, 3600);
  res.json(await confirmHandoffDocumentUpload(req.params.token, req.params.documentId));
};
const submit: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("handoff:submit", clientIp(req), 20, 3600);
  HandoffSubmitInput.parse(req.body ?? {});
  res.json(await submitHandoff(req.params.token));
};

const list: RequestHandler = async (req, res) => {
  res.json(await listHandoffs(req.actor!));
};
const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getHandoff(req.actor!, req.params.id));
};
const decide: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await decideHandoff(req.actor!, req.params.id, HandoffDecisionInput.parse(req.body ?? {})));
};
const staffDecide: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await decideStaffHandoff(req.actor!, req.params.id, HandoffStaffDecisionInput.parse(req.body ?? {})));
};

guardianHandoffsRouter.get("/public/guardian-handoffs/lookup", lookup);
guardianHandoffsRouter.post("/public/guardian-handoffs", start);
guardianHandoffsRouter.post("/public/guardian-handoffs/confirm-email", confirmEmail);
guardianHandoffsRouter.get("/public/guardian-handoffs/:token", status);
guardianHandoffsRouter.post("/public/guardian-handoffs/:token/documents", upload);
guardianHandoffsRouter.post("/public/guardian-handoffs/:token/documents/:documentId/confirm", confirmUpload);
guardianHandoffsRouter.post("/public/guardian-handoffs/:token/submit", submit);

guardianHandoffsRouter.get("/guardian-handoffs", requireActor, list);
guardianHandoffsRouter.get("/guardian-handoffs/:id", requireActor, one);
guardianHandoffsRouter.post("/guardian-handoffs/:id/decision", requireActor, decide);
guardianHandoffsRouter.post("/guardian-handoffs/:id/staff-decision", requireActor, staffDecide);
