/**
 * The campaign an APPROVED brief becomes — the one body BTG's
 * `createCampaignFromBrief` (campaign.ts) and the automatic brief approval
 * (brief-auto.ts, P4-BE-11) both run, inside the caller's transaction.
 *
 * The caller has found the brief through its scope and holds its row lock
 * (brief-moves.ts `lockBrief`). Here: the campaign, the brief's move to
 * CAMPAIGN_CREATED (claimed on APPROVED, so a second attempt cannot fork a
 * second campaign — `briefId` is @unique besides), the audit, and the Zoho
 * push that marks the Deal won.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { CampaignState } from "./campaign-state";
import { BriefStateConflictError } from "./brief-moves";

export type BriefForCampaign = {
  id: string;
  tenantId: string;
  sponsorId: string;
  budget: number;
  startDate: Date;
  endDate: Date;
};

export async function createCampaignIn(
  tx: Prisma.TransactionClient,
  by: AuditActor,
  brief: BriefForCampaign,
  name: string,
  opts: { automatic?: boolean } = {},
): Promise<{ id: string; state: CampaignState }> {
  const claimed = await tx.campaignBrief.updateMany({
    /* tenant-scope: the brief the caller found through its scope and locked, by id and tenant. */
    where: { id: brief.id, tenantId: brief.tenantId, state: "APPROVED" },
    data: { state: "CAMPAIGN_CREATED" },
  });
  if (claimed.count !== 1) throw new BriefStateConflictError();

  const campaign = await tx.campaign.create({
    data: {
      tenantId: brief.tenantId,
      sponsorId: brief.sponsorId,
      briefId: brief.id,
      name,
      budget: brief.budget,
      startDate: brief.startDate,
      endDate: brief.endDate,
    },
    select: { id: true, state: true },
  });

  await audit(tx, by, "campaign.create", "Campaign", campaign.id, {
    after: { state: "DRAFT", briefId: brief.id, sponsorId: brief.sponsorId, ...(opts.automatic ? { automatic: true } : {}) },
  });

  /* The brief's Deal is now won (§7.4: CAMPAIGN_CREATED → Closed Won), and
     the campaign takes over as the row that owns it. */
  await enqueue(tx, brief.tenantId, "zoho.pushDeal", { campaignId: campaign.id });

  return { id: campaign.id, state: campaign.state as CampaignState };
}
