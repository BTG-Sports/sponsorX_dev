/**
 * /api/v1/profile-changes — BTG's review of post-approval profile edits
 * (P3-BE-16). The athlete-side routes (propose, list mine) hang off
 * /athletes in athletes.ts; this file is the desk and the two decisions,
 * plus the athlete's withdraw, which addresses the change by its own id.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { z } from "../../contracts/zod";
import { ProfileChangeDecisionInput } from "../../contracts/profile-change";
import {
  CHANGE_STATES,
  decideProfileChange,
  listProfileChangesPage,
  withdrawProfileChange,
} from "../../domain/athlete-profile-change";
import { allowedList, pageRequest } from "../../lib/paging";

export const profileChangesRouter = Router();

const ListQuery = z.object({ state: z.string().optional() });

/** GET /profile-changes?page=&size=&state=PENDING,DECLINED */
const list: RequestHandler = async (req, res) => {
  const q = ListQuery.parse(req.query);
  const states = allowedList(q.state, CHANGE_STATES);
  /* Always paged — a desk never renders the whole tenant's history. */
  res.json(await listProfileChangesPage(req.actor!, pageRequest({ ...req.query, page: req.query.page ?? 1 })!, { states }));
};

const approve: RequestHandler<{ id: string }> = async (req, res) => {
  const b = ProfileChangeDecisionInput.parse(req.body ?? {});
  res.json(await decideProfileChange(req.actor!, req.params.id, "APPROVED", b.reviewerNotes));
};

const decline: RequestHandler<{ id: string }> = async (req, res) => {
  const b = ProfileChangeDecisionInput.parse(req.body ?? {});
  res.json(await decideProfileChange(req.actor!, req.params.id, "DECLINED", b.reviewerNotes));
};

const withdraw: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await withdrawProfileChange(req.actor!, req.params.id));
};

profileChangesRouter.get("/", requireActor, list);
profileChangesRouter.post("/:id/approve", requireActor, approve);
profileChangesRouter.post("/:id/decline", requireActor, decline);
profileChangesRouter.post("/:id/withdraw", requireActor, withdraw);

export { list as listProfileChanges, approve as approveProfileChange, decline as declineProfileChange };
