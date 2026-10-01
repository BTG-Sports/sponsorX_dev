/**
 * /api/v1 — BTG reviews businesses asking to sponsor (2S1-BE-05). Rules live
 * in domain/sponsor-requests.ts; this file only parses and hands over.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { SponsorRequestDecisionInput, SponsorRequestListQuery } from "../../contracts/sponsor-requests";
import { decideSponsorRequest, getSponsorRequest, listSponsorRequests } from "../../domain/sponsor-requests";

export const sponsorRequestsRouter = Router();
type Id = { id: string };

sponsorRequestsRouter.get("/sponsor-requests", requireActor, (async (req, res) => {
  res.json(await listSponsorRequests(req.actor!, SponsorRequestListQuery.parse(req.query).state));
}) as RequestHandler);
sponsorRequestsRouter.get("/sponsor-requests/:id", requireActor, (async (req, res) => {
  res.json(await getSponsorRequest(req.actor!, req.params.id));
}) as RequestHandler<Id>);
sponsorRequestsRouter.post("/sponsor-requests/:id/decision", requireActor, (async (req, res) => {
  res.json(await decideSponsorRequest(req.actor!, req.params.id, SponsorRequestDecisionInput.parse(req.body)));
}) as RequestHandler<Id>);
