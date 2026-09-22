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
  assertAllowed(actor, "campaign", to === "ACTIVE" ? "approve" : "write");

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

    if (to === "ACTIVE") {
      await enqueue(tx, actor.tenantId, "zoho.pushCampaign", { campaignId });
    }

    return { id: updated.id, state: updated.state as CampaignState };
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
