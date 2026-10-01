/**
 * /api/v1/profile-changes — P3-BE-16, reshaped by 2S1-BE-14 (2026-10-01).
 *
 * BTG no longer approves profile edits, so the review desk's approve and
 * decline are gone. What is left addresses a change by its own id: BTG's
 * list of sensitive edits (what New sign-ups shows) and the five-minute
 * view of a legal-name change's ID; the athlete's confirm of that ID upload
 * and their withdraw of a legal name still waiting for it. Making an edit
 * is POST /athletes/:id/profile-changes (athletes.ts).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import {
  confirmLegalNameDocument,
  listSensitiveEditsPage,
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

profileChangesRouter.get("/", requireActor, list);
profileChangesRouter.post("/:id/withdraw", requireActor, withdraw);
profileChangesRouter.post("/:id/id-document/confirm", requireActor, confirmId);
profileChangesRouter.get("/:id/id-document", requireActor, viewId);

export { list as listProfileChanges };
