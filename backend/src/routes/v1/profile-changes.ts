/**
 * /api/v1/profile-changes — P3-BE-16, reshaped by 2S1-BE-14 (2026-10-01).
 *
 * BTG no longer approves profile edits, so the review desk's approve and
 * decline are gone. What is left addresses a change by its own id: BTG's
 * list of sensitive edits (what New sign-ups shows) and the five-minute
 * view of a legal-name change's ID, its answer to a legal name the ID check
 * held (P8-BE-11) and sending that ID back (P8-BE-10); the athlete's confirm
 * of that ID upload and their withdraw of a legal name still waiting for it. Making an edit
 * is POST /athletes/:id/profile-changes (athletes.ts).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { DocumentSendBackInput, LegalNameDecisionInput } from "../../contracts/documents";
import {
  confirmLegalNameDocument,
  decideHeldLegalName,
  listSensitiveEditsPage,
  sendBackLegalNameDocument,
  viewLegalNameDocument,
  withdrawProfileChange,
} from "../../domain/athlete-profile-change";
import { pageRequest } from "../../lib/paging";

export const profileChangesRouter = Router();

/** GET /profile-changes?page=&size= — sensitive edits, newest first. */
const list: RequestHandler = async (req, res) => {
  /* Always paged — a desk never renders the whole tenant's history. */
  res.json(await listSensitiveEditsPage(req.actor!, pageRequest({ ...req.query, page: req.query.page ?? 1 })!));
};

const withdraw: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await withdrawProfileChange(req.actor!, req.params.id));
};

const confirmId: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await confirmLegalNameDocument(req.actor!, req.params.id));
};

const viewId: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await viewLegalNameDocument(req.actor!, req.params.id));
};

/* P8-BE-11 — BTG answers a new legal name the ID check held. */
const decide: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await decideHeldLegalName(req.actor!, req.params.id, LegalNameDecisionInput.parse(req.body ?? {})));
};

/* P8-BE-10 — BTG sends the ID back; the change is declined and the athlete asked to submit again. */
const sendBackId: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await sendBackLegalNameDocument(req.actor!, req.params.id, DocumentSendBackInput.parse(req.body ?? {}).reason));
};

profileChangesRouter.get("/", requireActor, list);
profileChangesRouter.post("/:id/withdraw", requireActor, withdraw);
profileChangesRouter.post("/:id/id-document/confirm", requireActor, confirmId);
profileChangesRouter.get("/:id/id-document", requireActor, viewId);
profileChangesRouter.post("/:id/id-document/send-back", requireActor, sendBackId);
profileChangesRouter.post("/:id/decision", requireActor, decide);

export { list as listProfileChanges };
