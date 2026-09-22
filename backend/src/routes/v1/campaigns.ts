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
import { setAthleteRate, setAthleteTier, readRateCard } from "../../domain/athlete-rate";
import { acceptOrder, createOrder, transitionOrder, updateOrderTerms } from "../../domain/campaign-order";
import {
  AthleteRateInput, AthleteTierInput, CampaignOrderInput,
  OrderAcceptanceInput, OrderTransitionInput,
} from "../../contracts/campaign";

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

/* --- rate cards (P3-BE-09) ------------------------------------------- */

/** PUT /athletes/:id/tier — a network manager's judgement, recorded. */
const setTier: RequestHandler<{ id: string }> = async (req, res) => {
  const { tier } = AthleteTierInput.parse(req.body ?? {});
  res.json(await setAthleteTier(req.actor!, req.params.id, tier));
};

/** POST /athletes/:id/rates — a NEW VERSION, never an update. The response
 *  carries the minimum sell price the rate implies, so the floor is seen when
 *  the rate is set rather than discovered by a refused order. */
const setRate: RequestHandler<{ id: string }> = async (req, res) => {
  const body = AthleteRateInput.parse(req.body ?? {});
  res.status(201).json(await setAthleteRate(req.actor!, req.params.id, body.jobId, body.amount));
};

/** GET /athletes/:id/rates — the current card: newest version per job. */
const rateCard: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ rates: await readRateCard(req.actor!, req.params.id) });
};

/* --- campaign orders (P5-BE-01, P5-BE-02) ----------------------------- */

/** POST /campaigns/:id/orders — starts in DRAFT; sending freezes the terms. */
const addOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const body = CampaignOrderInput.parse(req.body ?? {});
  res.status(201).json(
    await createOrder(req.actor!, {
      campaignId: req.params.id,
      athleteId: body.athleteId,
      jobId: body.jobId,
      compensation: body.compensation,
      sellPrice: body.sellPrice,
      usageRights: body.usageRights,
      exclusivity: body.exclusivity ?? null,
      dueDate: new Date(body.dueDate),
    }),
  );
};

/** PATCH /orders/:id — change the terms, refused once the order is sent. */
const editOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const body = CampaignOrderInput.partial().parse(req.body ?? {});
  res.json(
    await updateOrderTerms(req.actor!, req.params.id, {
      ...(body.compensation !== undefined ? { compensation: body.compensation } : {}),
      ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
      ...(body.usageRights !== undefined ? { usageRights: body.usageRights } : {}),
      ...(body.exclusivity !== undefined ? { exclusivity: body.exclusivity } : {}),
      ...(body.dueDate !== undefined ? { dueDate: new Date(body.dueDate) } : {}),
    }),
  );
};

/** POST /orders/:id/transition — send, activate, complete, cancel. */
const moveOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = OrderTransitionInput.parse(req.body ?? {});
  res.json(await transitionOrder(req.actor!, req.params.id, to));
};

/**
 * POST /orders/:id/accept — the athlete signs.
 *
 * Refused unless the order is SENT and, for a minor, the guardian is
 * verified. The evidence comes from the request, not the body.
 */
const accept: RequestHandler<{ id: string }> = async (req, res) => {
  const body = OrderAcceptanceInput.parse(req.body ?? {});
  res.status(201).json(
    await acceptOrder(req.actor!, req.params.id, {
      agreementId: body.agreementId,
      bodyHashShown: body.bodyHashShown,
      ip: req.ip ?? "",
      userAgent: req.get("user-agent") ?? "",
    }),
  );
};

campaignsRouter.put("/athletes/:id/tier", requireActor, setTier);
campaignsRouter.post("/athletes/:id/rates", requireActor, setRate);
campaignsRouter.get("/athletes/:id/rates", requireActor, rateCard);
campaignsRouter.post("/campaigns/:id/orders", requireActor, addOrder);
campaignsRouter.patch("/orders/:id", requireActor, editOrder);
campaignsRouter.post("/orders/:id/transition", requireActor, moveOrder);
campaignsRouter.post("/orders/:id/accept", requireActor, accept);

campaignsRouter.post("/briefs", requireActor, submitBrief);
campaignsRouter.post("/briefs/:id/transition", requireActor, moveBrief);
campaignsRouter.get("/briefs/:id/eligible-athletes", requireActor, shortlist);
campaignsRouter.post("/briefs/:id/campaign", requireActor, createCampaign);
campaignsRouter.post("/campaigns/:id/transition", requireActor, moveCampaign);
campaignsRouter.post("/campaigns/:id/invitations", requireActor, invite);
campaignsRouter.post("/invitations/:id/respond", requireActor, respond);

export {
  submitBrief, moveBrief, shortlist, createCampaign, moveCampaign, invite, respond,
  setTier, setRate, rateCard, addOrder, editOrder, moveOrder, accept,
};
