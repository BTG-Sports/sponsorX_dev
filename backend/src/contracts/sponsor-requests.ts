import { z } from "zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";

/* 2S1-BE-05 — BTG's decision on a business asking to sponsor. Approving
   opens the account; the business type BTG picks is what the clash check
   uses. Declining needs a note the business reads. */

export const SponsorRequestListQuery = z
  .object({ state: z.enum(["NEW", "APPROVED", "DECLINED"]).optional() })
  .meta({ id: "SponsorRequestListQuery", description: "Which tab of BTG's queue: NEW (waiting, the default), APPROVED or DECLINED." });

export const SponsorRequestDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({
      decision: z.literal("APPROVE"),
      categories: z.array(z.enum(BRAND_CATEGORIES)).min(1).max(10),
      /* Link to a sponsor that already exists (e.g. synced in from Zoho) instead of creating one. */
      linkSponsorId: z.string().min(1).nullable().optional(),
      /* Confirms a same-named sponsor is a different business. */
      newSponsor: z.boolean().optional(),
    }).strict(),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(2000) }).strict(),
  ])
  .meta({ id: "SponsorRequestDecisionInput", description: "APPROVE with the business type (and optionally a sponsor to link to), or DECLINE with a note the business reads." });
