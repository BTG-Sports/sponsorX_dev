/**
 * Campaigns — P4-BE-06, §21, §18.
 *
 * BTG's object, created from an approved brief. `briefId` is `@unique`, so a
 * brief yields at most one campaign and the link cannot fork.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canTransitionCampaign,
  IllegalCampaignTransitionError,
  type CampaignState,
} from "./campaign-state";
import { transitionBrief } from "./brief";
import {
  activateRewardsOnLaunch,
  applyStageMove,
  CAMPAIGN_AUDIT_ACTIONS,
  CAMPAIGN_FOR_MOVE,
  CampaignStateConflictError,
  lockCampaign,
  type RewardsOnLaunch,
} from "./campaign-stages";
import type { BriefState } from "./brief-state";
import { lockBrief } from "./brief-moves";
import { createCampaignIn } from "./campaign-create";

export class LaunchNeedsFullTransitionError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "A campaign cannot be moved to ACTIVE through the generic transition. " +
        "Going live also activates every accepted order and queues the Zoho " +
        "push and the launch notification — use launchCampaign, which does " +
        "all of it in one transaction.",
    );
    this.name = "LaunchNeedsFullTransitionError";
  }
}

export class BriefNotApprovedError extends Error {
  readonly status = 409;
  constructor(state: BriefState) {
    super(
      `A campaign is created from an APPROVED brief; this one is ${state}. ` +
        `Creating one from an unapproved brief would put work on the books ` +
        `nobody agreed to sell.`,
    );
    this.name = "BriefNotApprovedError";
  }
}

/**
 * Create the campaign a brief becomes.
 *
 * One transaction: the campaign, the brief's move to CAMPAIGN_CREATED, and
 * the audit. A campaign whose brief still reads APPROVED would be a second
 * live object for the same ask, and a brief marked CAMPAIGN_CREATED with no
 * campaign is worse.
 */
export async function createCampaignFromBrief(
  actor: Actor,
  briefId: string,
  name: string,
): Promise<{ id: string; state: CampaignState }> {
  assertAllowed(actor, "campaign", "write");

  return prisma.$transaction(async (tx) => {
    const found = await tx.campaignBrief.findFirst({
      where: { ...whereFor(actor, "campaignBrief", "read"), id: briefId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("campaign", "write");

    /* P4-BE-11 — the brief's row lock first, as every brief move takes it:
       the automatic approval creating this same campaign waits, or is
       waited for, and the loser sees the brief already CAMPAIGN_CREATED. */
    await lockBrief(tx, found.id, found.tenantId);
    const brief = await tx.campaignBrief.findFirstOrThrow({
      /* tenant-scope: the brief found through whereFor(campaignBrief, read) and locked. */
      where: { id: found.id, tenantId: found.tenantId },
      select: {
        id: true, tenantId: true, state: true, sponsorId: true, budget: true,
        startDate: true, endDate: true, campaign: { select: { id: true } },
      },
    });
    if (brief.campaign) throw new BriefNotApprovedError(brief.state as BriefState);
    if (brief.state !== "APPROVED") throw new BriefNotApprovedError(brief.state as BriefState);

    return createCampaignIn(tx, actor, brief, name);
  });
}

/**
 * Move a campaign through §21, or refuse.
 *
 * Reaching ACTIVE queues the Zoho push rather than performing it. §18 keeps
 * Zoho off the request path entirely: if Zoho is down a campaign still goes
 * live and the sync waits.
 */
export async function transitionCampaign(
  actor: Actor,
  campaignId: string,
  to: CampaignState,
): Promise<{ id: string; state: CampaignState }> {
  /* ACTIVE IS NOT REACHABLE HERE. Going live is four writes that must commit
     together — the campaign, its accepted orders, the Zoho push and the
     notification — and this path did only two of them. A campaign that
     reached ACTIVE through here left its orders sitting at ACCEPTED, so the
     athletes were live on paper and had nothing to deliver against, and
     nobody was told. `launchCampaign` is the only door (P5-BE-04). */
  if (to === "ACTIVE") throw new LaunchNeedsFullTransitionError();

  assertAllowed(actor, "campaign", "write");

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: campaignId },
      select: {
        ...CAMPAIGN_FOR_MOVE,
        /* P9-BE-09 — an ad-only campaign may skip STAFFING. */
        _count: { select: { orders: true, adSlots: true } },
      },
    });
    if (!campaign) throw new ForbiddenError("campaign", "write");

    /* P4-BE-09 — decided on the state read under the row lock, so an
       automatic move racing this one has either finished (and this sees its
       result) or waits for this one. */
    const from = await lockCampaign(tx, campaignId);
    if (!from) throw new ForbiddenError("campaign", "write");
    if (!canTransitionCampaign(from, to, campaign._count)) {
      throw new IllegalCampaignTransitionError(from, to);
    }

    /* The claim, the audit, and §18's side effects (P8-INT-01 / -06), shared
       with the automatic moves — see campaign-stages.ts. */
    await applyStageMove(tx, actor, campaign, from, to, { shape: campaign._count });

    return { id: campaign.id, state: to };
  });
}

/**
 * Take a campaign live — P5-BE-04, Guide §05.
 *
 * Five things happen together or none do: the campaign moves to ACTIVE, every
 * ACCEPTED order on it moves to ACTIVE, the Zoho push is queued, the
 * "campaign live" notification is queued, and the audit row is written.
 *
 * WHY THE ORDERS MOVE HERE AND NOT ON A TIMER. An ACCEPTED order is a signed
 * contract that has not started; an ACTIVE one is work in progress, and the
 * deliverables hanging off it are now genuinely owed. Launching the campaign
 * is the event that makes that true for every athlete at once, so one
 * transaction is also the only way they all agree about when work began.
 *
 * WHY ONLY ACCEPTED ORDERS. A DRAFT or SENT order is an offer nobody has
 * signed, and a REJECTED or CANCELLED one is settled. Sweeping those to
 * ACTIVE would manufacture contracts out of offers. The filter is on state,
 * not on "everything attached to this campaign".
 *
 * BOTH JOBS ARE QUEUED, NEVER CALLED. §18 keeps Zoho off the request path:
 * if Zoho is down the campaign still goes live and the sync waits.
 */
export async function launchCampaign(
  actor: Actor,
  campaignId: string,
  now = new Date(),
): Promise<{ id: string; state: CampaignState; ordersActivated: number; rewards: RewardsOnLaunch }> {
  /* Launching is an approval, not an edit — §15 gives CAMPAIGN_MGR and above
     `campaign.approve`, and that is the gate the old path used too. */
  assertAllowed(actor, "campaign", "approve");

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "approve"), id: campaignId },
      select: { id: true, state: true, tenantId: true },
    });
    if (!campaign) throw new ForbiddenError("campaign", "approve");

    /* P4-BE-09 — the row lock every stage change takes, then the state under it. */
    const from = await lockCampaign(tx, campaignId);
    if (!from) throw new ForbiddenError("campaign", "approve");
    if (!canTransitionCampaign(from, "ACTIVE")) {
      throw new IllegalCampaignTransitionError(from, "ACTIVE");
    }

    const claimed = await tx.campaign.updateMany({
      /* tenant-scope: the campaign loaded above through whereFor and locked; claimed on the state read under the lock. */
      where: { id: campaignId, state: from },
      data: { state: "ACTIVE" as Prisma.CampaignUpdateManyMutationInput["state"] },
    });
    if (claimed.count !== 1) throw new CampaignStateConflictError(from, "ACTIVE");

    const activated = await tx.campaignOrder.updateMany({
      where: { campaignId, state: "ACCEPTED" },
      data: { state: "ACTIVE" },
    });

    await audit(tx, actor, CAMPAIGN_AUDIT_ACTIONS.ACTIVE, "Campaign", campaignId, {
      before: { state: from },
      after: { state: "ACTIVE", ordersActivated: activated.count },
    });

    await enqueue(tx, actor.tenantId, "zoho.pushDeal", { campaignId });
    await enqueue(tx, actor.tenantId, "notify.campaignLive", { campaignId });

    /* P6-BE-09 — the campaign's complete draft rewards go live with it, as
       the system; an incomplete one stays a draft, and the result says why. */
    const rewards = await activateRewardsOnLaunch(tx, { id: campaignId, tenantId: campaign.tenantId }, now);

    return {
      id: campaignId,
      state: "ACTIVE" as CampaignState,
      ordersActivated: activated.count,
      rewards,
    };
  });
}

export { CAMPAIGN_AUDIT_ACTIONS, transitionBrief };
export * from "./campaign-state";
