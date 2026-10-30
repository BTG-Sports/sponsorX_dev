/** P8-BE-12 — cancel and change a campaign, and BTG's decision on a held request. */
import { z } from "./zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");

export const CampaignChangeProposal = z
  .object({
    name: z.string().max(120).optional(),
    startDate: day.optional(),
    endDate: day.optional(),
    budget: z.number().int().min(0).optional(),
  })
  .strict()
  .meta({ id: "CampaignChangeProposal", description: "What to change; only the fields sent change. Budget in cents." });

export const CampaignChangeInput = CampaignChangeProposal.extend({ reason: z.string().max(1000).optional() })
  .strict()
  .meta({ id: "CampaignChangeInput", description: "The change, and optionally why." });

export const CampaignCancelInput = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict()
  .meta({ id: "CampaignCancelInput", description: "Why the campaign is cancelled — kept with it, and read by BTG when it is held." });

export const CampaignRequestDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("APPROVE") }).strict(),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(1000) }).strict(),
  ])
  .meta({ id: "CampaignRequestDecisionInput", description: "Approve (applied after the impact is read again) or decline with a note the requester reads." });
