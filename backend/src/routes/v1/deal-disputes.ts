/**
 * P8-BE-03 (P0-LEG-06) — a concern raised about a deal pauses it until BTG decides.
 *
 *   POST /orders/:id/disputes                               BTG opens one: the deal pauses, its earning is held
 *   GET  /deal-disputes                                     BTG's list, or the athlete's own
 *   GET  /deal-disputes/:id                                 one, with the documents in
 *   POST /deal-disputes/:id/documents                       the athlete starts a document upload (private PUT)
 *   POST /deal-disputes/:id/documents/:documentId/confirm   …and confirms it arrived
 *   GET  /deal-disputes/:id/documents/:documentId           BTG opens it (five-minute, audited link)
 *   POST /deal-disputes/:id/resolve                         BTG resumes or cancels the deal
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { DealDisputeDocumentInput, DealDisputeListQuery, DealDisputeOpenInput, DealDisputeResolveInput } from "../../contracts/deal-disputes";
import {
  finishDealDisputeDocument, getDealDispute, listDealDisputes, openDealDispute, resolveDealDispute, startDealDisputeDocument,
  viewDealDisputeDocument,
} from "../../domain/deal-disputes";

export const dealDisputesRouter = Router();
type Id = { id: string };
type Doc = { id: string; documentId: string };

dealDisputesRouter.post("/orders/:id/disputes", requireActor, (async (req, res) => {
  res.status(201).json(await openDealDispute(req.actor!, req.params.id, DealDisputeOpenInput.parse(req.body ?? {})));
}) as RequestHandler<Id>);

dealDisputesRouter.get("/deal-disputes", requireActor, (async (req, res) => {
  res.json(await listDealDisputes(req.actor!, DealDisputeListQuery.parse(req.query)));
}) as RequestHandler);

dealDisputesRouter.get("/deal-disputes/:id", requireActor, (async (req, res) => {
  res.json(await getDealDispute(req.actor!, req.params.id));
}) as RequestHandler<Id>);

dealDisputesRouter.post("/deal-disputes/:id/documents", requireActor, (async (req, res) => {
  res.status(201).json(await startDealDisputeDocument(req.actor!, req.params.id, DealDisputeDocumentInput.parse(req.body ?? {})));
}) as RequestHandler<Id>);

dealDisputesRouter.post("/deal-disputes/:id/documents/:documentId/confirm", requireActor, (async (req, res) => {
  res.json(await finishDealDisputeDocument(req.actor!, req.params.id, req.params.documentId));
}) as RequestHandler<Doc>);

dealDisputesRouter.get("/deal-disputes/:id/documents/:documentId", requireActor, (async (req, res) => {
  res.json(await viewDealDisputeDocument(req.actor!, req.params.id, req.params.documentId));
}) as RequestHandler<Doc>);

dealDisputesRouter.post("/deal-disputes/:id/resolve", requireActor, (async (req, res) => {
  res.json(await resolveDealDispute(req.actor!, req.params.id, DealDisputeResolveInput.parse(req.body ?? {})));
}) as RequestHandler<Id>);
