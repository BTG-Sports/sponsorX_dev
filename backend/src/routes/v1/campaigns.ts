/**
 * /api/v1 — briefs, campaigns, matching and invitations (P4-BE-02…06).
 *
 * The B3 domain functions had no endpoints when they were written, which is
 * the same defect this codebase already found three times in B1: a task
 * closes against its acceptance, the acceptance names a domain function, and
 * the capability stays unreachable. These are the routes.
 *
 * No business rule lives here. The conflict check, §37's guardian gate and
 * every state guard are in the domain, so §8's service account and any
 * internal caller meet the same rules as a browser.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import {
  BriefTransitionInput,
  CampaignBriefInput,
  CampaignFromBriefInput,
  CampaignTransitionInput,
  InvitationInput,
  InvitationResponseInput,
} from "../../contracts/campaign";
import { createBrief, transitionBrief } from "../../domain/brief";
import { createCampaignFromBrief, transitionCampaign } from "../../domain/campaign";
import { eligibleForBrief } from "../../domain/matching";
import { inviteAthlete, transitionInvite } from "../../domain/invitation";

export const campaignsRouter = Router();

/** POST /briefs — a sponsor asks. Always lands in DRAFT: qualification is
 *  BTG's act, so nothing a sponsor sends can arrive already qualified. */
const submitBrief: RequestHandler = async (req, res) => {
  const body = CampaignBriefInput.parse(req.body ?? {});
  res.status(201).json(
    await createBrief(req.actor!, {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    }),
  );
};

/** POST /briefs/:id/transition — qualify, approve or close. */
const moveBrief: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = BriefTransitionInput.parse(req.body ?? {});
  res.json(await transitionBrief(req.actor!, req.params.id, to));
};

/**
 * GET /briefs/:id/eligible-athletes — the shortlist.
 *
 * Advisory by design. It applies the same conflict rule the invitation
 * enforces, but the invitation asks again: a desk working from a stale list
 * must not be able to make an offer the rule forbids.
 */
const shortlist: RequestHandler<{ id: string }> = async (req, res) => {
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  res.json({ athletes: await eligibleForBrief(req.actor!, req.params.id, limit) });
};

/** POST /briefs/:id/campaign — the campaign an APPROVED brief becomes. */
const createCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  const { name } = CampaignFromBriefInput.parse(req.body ?? {});
  res.status(201).json(await createCampaignFromBrief(req.actor!, req.params.id, name));
};

/** POST /campaigns/:id/transition — §21. Reaching ACTIVE queues the Zoho
 *  push; it never calls Zoho on the request path (§18). */
const moveCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = CampaignTransitionInput.parse(req.body ?? {});
  res.json(await transitionCampaign(req.actor!, req.params.id, to));
};

/** POST /campaigns/:id/invitations — offer one job to one athlete. */
const invite: RequestHandler<{ id: string }> = async (req, res) => {
  const body = InvitationInput.parse(req.body ?? {});
  res.status(201).json(
    await inviteAthlete(req.actor!, {
      campaignId: req.params.id,
      athleteId: body.athleteId,
      jobId: body.jobId,
      offered: body.offered,
      ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
    }),
  );
};

/** POST /invitations/:id/respond — the athlete opens, accepts or declines. */
const respond: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = InvitationResponseInput.parse(req.body ?? {});
  res.json(await transitionInvite(req.actor!, req.params.id, to));
};

campaignsRouter.post("/briefs", requireActor, submitBrief);
campaignsRouter.post("/briefs/:id/transition", requireActor, moveBrief);
campaignsRouter.get("/briefs/:id/eligible-athletes", requireActor, shortlist);
campaignsRouter.post("/briefs/:id/campaign", requireActor, createCampaign);
campaignsRouter.post("/campaigns/:id/transition", requireActor, moveCampaign);
campaignsRouter.post("/campaigns/:id/invitations", requireActor, invite);
campaignsRouter.post("/invitations/:id/respond", requireActor, respond);

export { submitBrief, moveBrief, shortlist, createCampaign, moveCampaign, invite, respond };
