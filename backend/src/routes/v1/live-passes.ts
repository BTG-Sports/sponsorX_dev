/**
 * /api/v1/live-passes — a pass to the live socket service (2S4-BE-18). No
 * business rule lives here; see domain/live-pass.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { LivePassInput } from "../../contracts/live";
import { requestLivePass } from "../../domain/live-pass";

export const livePassesRouter = Router();

const issue: RequestHandler = async (req, res) => {
  res.status(201).json(await requestLivePass(req.actor!, LivePassInput.parse(req.body ?? {})));
};

livePassesRouter.post("/live-passes", requireActor, issue);
