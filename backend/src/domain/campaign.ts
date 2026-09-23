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
import type { BriefState } from "./brief-state";

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
    const brief = await tx.campaignBrief.findFirst({
      where: { ...whereFor(actor, "campaignBrief", "read"), id: briefId },
      select: {
        id: true, state: true, sponsorId: true, budget: true,
        startDate: true, endDate: true, campaign: { select: { id: true } },
      },
    });
    if (!brief) throw new ForbiddenError("campaign", "write");
    if (brief.campaign) throw new BriefNotApprovedError(brief.state as BriefState);
    if (brief.state !== "APPROVED") throw new BriefNotApprovedError(brief.state as BriefState);

    const campaign = await tx.campaign.create({
      data: {
        tenantId: actor.tenantId,
        sponsorId: brief.sponsorId,
        briefId: brief.id,
        name,
        budget: brief.budget,
        startDate: brief.startDate,
        endDate: brief.endDate,
      },
      select: { id: true, state: true },
    });

    await tx.campaignBrief.update({
      where: { id: briefId },
      data: { state: "CAMPAIGN_CREATED" },
      select: { id: true },
    });

    await audit(tx, actor, "campaign.create", "Campaign", campaign.id, {
      after: { state: "DRAFT", briefId, sponsorId: brief.sponsorId },
    });

    return { id: campaign.id, state: campaign.state as CampaignState };
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
      select: { id: true, state: true },
    });
    if (!campaign) throw new ForbiddenError("campaign", "write");

    const from = campaign.state as CampaignState;
    if (!canTransitionCampaign(from, to)) throw new IllegalCampaignTransitionError(from, to);

    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: { state: to as Prisma.CampaignUpdateInput["state"] },
      select: { id: true, state: true },
    });

    await audit(tx, actor, CAMPAIGN_AUDIT_ACTIONS[to], "Campaign", campaignId, {
      before: { state: from },
      after: { state: to },
    });

    return { id: updated.id, state: updated.state as CampaignState };
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
): Promise<{ id: string; state: CampaignState; ordersActivated: number }> {
  /* Launching is an approval, not an edit — §15 gives CAMPAIGN_MGR and above
     `campaign.approve`, and that is the gate the old path used too. */
  assertAllowed(actor, "campaign", "approve");

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "approve"), id: campaignId },
      select: { id: true, state: true },
    });
    if (!campaign) throw new ForbiddenError("campaign", "approve");

    const from = campaign.state as CampaignState;
    if (!canTransitionCampaign(from, "ACTIVE")) {
      throw new IllegalCampaignTransitionError(from, "ACTIVE");
    }

    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: { state: "ACTIVE" as Prisma.CampaignUpdateInput["state"] },
      select: { id: true, state: true },
    });

    const activated = await tx.campaignOrder.updateMany({
      where: { campaignId, state: "ACCEPTED" },
      data: { state: "ACTIVE" },
    });

    await audit(tx, actor, CAMPAIGN_AUDIT_ACTIONS.ACTIVE, "Campaign", campaignId, {
      before: { state: from },
      after: { state: "ACTIVE", ordersActivated: activated.count },
    });

    await enqueue(tx, actor.tenantId, "zoho.pushCampaign", { campaignId });
    await enqueue(tx, actor.tenantId, "notify.campaignLive", { campaignId });

    return {
      id: updated.id,
      state: updated.state as CampaignState,
      ordersActivated: activated.count,
    };
  });
}

const CAMPAIGN_AUDIT_ACTIONS: Record<CampaignState, `${string}.${string}`> = {
  DRAFT: "campaign.draft",
  STAFFING: "campaign.staff",
  APPROVAL: "campaign.submitForApproval",
  ACTIVE: "campaign.launch",
  REPORTING: "campaign.report",
  COMPLETED: "campaign.complete",
  CANCELLED: "campaign.cancel",
};

export { CAMPAIGN_AUDIT_ACTIONS, transitionBrief };
export * from "./campaign-state";
