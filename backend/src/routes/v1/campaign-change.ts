/**
 * P8-BE-12 — cancel and change a campaign, and BTG's queue of held requests.
 * No business rule lives here; see domain/campaign-change.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { CampaignCancelInput, CampaignChangeInput, CampaignChangeProposal, CampaignRequestDecisionInput } from "../../contracts/campaign-change";
import {
  cancelCampaign, changeCampaign, decideCampaignRequest, listCampaignRequests, readCancelImpact, readChangeImpact,
} from "../../domain/campaign-change";

export const campaignChangeRouter = Router();
type Id = { id: string };

/** "YYYY-MM-DD" → that day at 00:00 UTC (campaign dates are days). */
const toProposal = (b: { name?: string; startDate?: string; endDate?: string; budget?: number }) => ({
  ...(b.name !== undefined ? { name: b.name } : {}),
  ...(b.startDate ? { startDate: new Date(`${b.startDate}T00:00:00Z`) } : {}),
  ...(b.endDate ? { endDate: new Date(`${b.endDate}T00:00:00Z`) } : {}),
  ...(b.budget !== undefined ? { budget: b.budget } : {}),
});

const cancelImpact: RequestHandler<Id> = async (req, res) => { res.json(await readCancelImpact(req.actor!, req.params.id)); };
const changeImpact: RequestHandler<Id> = async (req, res) => {
  res.json(await readChangeImpact(req.actor!, req.params.id, toProposal(CampaignChangeProposal.parse(req.body ?? {}))));
};
const cancel: RequestHandler<Id> = async (req, res) => {
  res.json(await cancelCampaign(req.actor!, req.params.id, CampaignCancelInput.parse(req.body ?? {}).reason));
};
const change: RequestHandler<Id> = async (req, res) => {
  const b = CampaignChangeInput.parse(req.body ?? {});
  res.json(await changeCampaign(req.actor!, req.params.id, { ...toProposal(b), ...(b.reason !== undefined ? { reason: b.reason } : {}) }));
};
const requests: RequestHandler = async (req, res) => {
  const state = typeof req.query.state === "string" && ["HELD", "APPLIED", "DECLINED"].includes(req.query.state) ? req.query.state : undefined;
  res.json(await listCampaignRequests(req.actor!, { state }));
};
const decide: RequestHandler<Id> = async (req, res) => {
  res.json(await decideCampaignRequest(req.actor!, req.params.id, CampaignRequestDecisionInput.parse(req.body ?? {})));
};

campaignChangeRouter.get("/campaigns/:id/cancel-impact", requireActor, cancelImpact);
campaignChangeRouter.post("/campaigns/:id/change-impact", requireActor, changeImpact);
campaignChangeRouter.post("/campaigns/:id/cancel", requireActor, cancel);
campaignChangeRouter.post("/campaigns/:id/change", requireActor, change);
campaignChangeRouter.get("/campaign-requests", requireActor, requests);
campaignChangeRouter.post("/campaign-requests/:id/decision", requireActor, decide);
