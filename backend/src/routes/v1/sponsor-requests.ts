/**
 * /api/v1 — BTG reviews businesses asking to sponsor (2S1-BE-05). Rules live
 * in domain/sponsor-requests.ts; this file only parses and hands over.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { pageRequest } from "../../lib/paging";
import { SponsorRequestDecisionInput, SponsorRequestListQuery } from "../../contracts/sponsor-requests";
import { decideSponsorRequest, getSponsorRequest, listSponsorRequests, viewSponsorDocument } from "../../domain/sponsor-requests";

export const sponsorRequestsRouter = Router();
type Id = { id: string };
type DocId = { id: string; documentId: string };

sponsorRequestsRouter.get("/sponsor-requests", requireActor, (async (req, res) => {
  /* ?page= turns on the house pager (lib/paging.ts); without it the old whole list. */
  res.json(await listSponsorRequests(req.actor!, SponsorRequestListQuery.parse(req.query).state, pageRequest(req.query as Record<string, unknown>) ?? undefined));
}) as RequestHandler);
sponsorRequestsRouter.get("/sponsor-requests/:id", requireActor, (async (req, res) => {
  res.json(await getSponsorRequest(req.actor!, req.params.id));
}) as RequestHandler<Id>);
sponsorRequestsRouter.post("/sponsor-requests/:id/decision", requireActor, (async (req, res) => {
  res.json(await decideSponsorRequest(req.actor!, req.params.id, SponsorRequestDecisionInput.parse(req.body)));
}) as RequestHandler<Id>);
/* 2S1-BE-17 — BTG reads a proof of business through a five-minute, audited link. */
sponsorRequestsRouter.get("/sponsor-requests/:id/documents/:documentId", requireActor, (async (req, res) => {
  res.json(await viewSponsorDocument(req.actor!, req.params.id, req.params.documentId));
}) as RequestHandler<DocId>);
