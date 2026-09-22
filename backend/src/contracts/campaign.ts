import { z } from "./zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";
import { BRIEF_STATES } from "../domain/brief-state";
import { CAMPAIGN_STATES } from "../domain/campaign-state";
import { INVITE_STATES } from "../domain/invite-state";

/* --------------------------------------------------------------------------
   Briefs, campaigns and invitations on the wire — P4-BE-02…06, §21, §26.

   Every enum here is built from the domain's own list rather than retyped.
   The matching vocabulary in particular has to be identical on both sides:
   a brief's `categories` are compared against an athlete's
   `restrictedCategories`, and a contract that accepted a category the domain
   has never heard of would publish a filter that silently matches nobody.
   -------------------------------------------------------------------------- */

export const BrandCategory = z.enum(BRAND_CATEGORIES).meta({
  id: "BrandCategory",
  description:
    "The shared category vocabulary. A sponsor's categories and an athlete's restrictions are drawn from this one list so they can be compared (§26).",
});

export const BriefState = z.enum(BRIEF_STATES).meta({ id: "BriefState" });
export const CampaignState = z.enum(CAMPAIGN_STATES).meta({ id: "CampaignState" });
export const InviteState = z.enum(INVITE_STATES).meta({ id: "InviteState" });

export const CampaignBriefInput = z
  .object({
    sponsorId: z.string().min(1),
    objective: z.string().min(1).max(2000),
    /** Cents. The column is cents and so is this — a budget in dollars
     *  reaching a cents column is a hundredfold error nobody notices until
     *  invoicing. */
    budget: z.int().min(0).describe("Budget in cents"),
    packageId: z.string().nullable().optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    sports: z.array(z.string().min(1).max(60)).max(20).default([]),
    stateCodes: z.array(z.string().length(2)).max(60).default([]),
    /** Targeting AND the conflict input. An athlete restricting any of these
     *  is excluded from matching and refused at the invitation. */
    categories: z.array(BrandCategory).max(25).default([]),
  })
  .meta({ id: "CampaignBriefInput", description: "What a sponsor asks for, before BTG turns it into a campaign." });

export const BriefTransitionInput = z
  .object({ to: BriefState })
  .meta({ id: "BriefTransitionInput" });

export const CampaignFromBriefInput = z
  .object({ name: z.string().min(1).max(160) })
  .meta({ id: "CampaignFromBriefInput", description: "Create the campaign an APPROVED brief becomes." });

export const CampaignTransitionInput = z
  .object({ to: CampaignState })
  .meta({ id: "CampaignTransitionInput" });

export const InvitationInput = z
  .object({
    athleteId: z.string().min(1),
    jobId: z.string().min(1).describe("NIL job code, e.g. SX-02"),
    /** Cents offered to the athlete. */
    offered: z.int().min(0).describe("Offer to the athlete, in cents"),
    expiresAt: z.iso.datetime().optional(),
  })
  .meta({ id: "InvitationInput", description: "One job on one campaign offered to one athlete." });

export const InvitationResponseInput = z
  .object({ to: InviteState })
  .meta({ id: "InvitationResponseInput" });

export const EligibleAthlete = z
  .object({
    id: z.string(),
    displayName: z.string(),
    sport: z.string(),
    stateCode: z.string().nullable(),
    tier: z.string().nullable(),
    /** Why this athlete is on the list, so the desk sees the match rather
     *  than trusting it. */
    matched: z.object({ sport: z.boolean(), geography: z.boolean() }),
  })
  .meta({ id: "EligibleAthlete", description: "A shortlisted athlete. Phase 1 shortlists; a person chooses." });

export type CampaignBriefInput = z.infer<typeof CampaignBriefInput>;
export type InvitationInput = z.infer<typeof InvitationInput>;
export type EligibleAthlete = z.infer<typeof EligibleAthlete>;
