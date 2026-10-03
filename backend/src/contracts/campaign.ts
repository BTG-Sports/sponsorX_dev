import { INT4_MAX, z } from "./zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";
import { BRIEF_STATES } from "../domain/brief-state";
import { CAMPAIGN_STATES } from "../domain/campaign-state";
import { INVITE_STATES } from "../domain/invite-state";
import { ORDER_STATES } from "../domain/order-state";

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
    budget: z.int().min(0).max(INT4_MAX).describe("Budget in cents"),
    packageId: z.string().nullable().optional(),
    /** SponsorX NEXT (P9-BE-07): the student code the sponsor arrived with at
     *  /s/[code]. A sale on this brief is credited to that student. */
    studentCode: z.string().min(1).max(64).nullable().optional(),
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
  .object({
    to: BriefState,
    /** P4-FE-07 — required when BTG staff close a brief; shown back on the queue. */
    reason: z.string().trim().min(1).max(500).optional(),
  })
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
    offered: z.int().min(0).max(INT4_MAX).describe("Offer to the athlete, in cents"),
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
    /* P4-FE-02 — present only for callers the matrix lets read them. */
    city: z.string().nullable().optional(),
    score: z
      .object({ value: z.int(), factors: z.unknown(), method: z.string(), scoredAt: z.string() })
      .nullable()
      .optional()
      .describe("Latest §14 snapshot; null when unscored. Absent when §7 denies athleteScore.value."),
    reach: z.object({ followers: z.int().nullable(), verified: z.boolean() }).optional(),
    rates: z
      .array(z.object({ jobId: z.string(), amount: z.int() }))
      .optional()
      .describe("Current athlete rate per job, cents. Absent when §7 denies athleteRate.amount."),
    /* P4-BE-08 — the brief's rank and its reasons. */
    matchScore: z.int().min(0).max(100).optional()
      .describe("How well this athlete fits the brief, 0–100 (sport 30, state 20, verified past work 20, rate fit 20, recent activity 10). Not §14's score."),
    reasons: z
      .array(z.object({
        key: z.enum(["sport", "state", "work", "rate", "recent"]),
        text: z.string(),
        points: z.int().min(0),
      }))
      .optional()
      .describe("Every signal behind matchScore, strongest first. A signal the caller may not read (rates; other campaigns' orders) is absent."),
  })
  .meta({ id: "EligibleAthlete", description: "A shortlisted athlete. Phase 1 shortlists; a person chooses." });

export type CampaignBriefInput = z.infer<typeof CampaignBriefInput>;
export type InvitationInput = z.infer<typeof InvitationInput>;
export type EligibleAthlete = z.infer<typeof EligibleAthlete>;

/* --- rate cards and orders — P3-BE-09, P5-BE-01, P5-BE-02 -------------- */

export const OrderState = z.enum(ORDER_STATES).meta({ id: "OrderState" });

export const AthleteRateInput = z
  .object({
    jobId: z.string().min(1),
    /** Cents paid to the athlete. Never the sponsor price. */
    amount: z.int().min(0).max(INT4_MAX).describe("Athlete compensation in cents"),
  })
  .meta({ id: "AthleteRateInput", description: "Set manually by a network manager — §6 does not compute it." });

export const AthleteTierInput = z
  .object({ tier: z.enum(["EMERGING", "CREATOR", "PREMIUM", "ANCHOR"]) })
  .meta({ id: "AthleteTierInput" });

export const CampaignOrderInput = z
  .object({
    athleteId: z.string().min(1),
    jobId: z.string().min(1),
    compensation: z.int().min(0).max(INT4_MAX).describe("Athlete compensation in cents"),
    /** What the sponsor pays for this line, in cents. Refused below
     *  compensation x 1.4 (P3-BE-12). */
    sellPrice: z.int().min(0).max(INT4_MAX).describe("Sponsor price for this line, in cents"),
    usageRights: z.string().min(1).max(2000),
    exclusivity: z.string().max(2000).nullable().optional(),
    dueDate: z.iso.date(),
  })
  .meta({
    id: "CampaignOrderInput",
    description: "Terms are frozen on this record when it is sent, never read live from the rate card.",
  });

export const OrderTransitionInput = z.object({ to: OrderState }).meta({ id: "OrderTransitionInput" });

export const OrderAcceptanceInput = z
  .object({
    agreementId: z.string().min(1),
    bodyHashShown: z.string().min(1).describe("Hash of the contract text as rendered to the signer"),
  })
  .meta({
    id: "OrderAcceptanceInput",
    description: "The signer, IP and user agent come from the request, never the body (§12).",
  });

/* --------------------------------------------------------------------------
   P4-BE-09 / P6-BE-09 — campaigns move on their own; rewards follow them.
   -------------------------------------------------------------------------- */

export const CampaignNextStep = z
  .strictObject({
    who: z.enum(["BTG", "SYSTEM", "ATHLETES", "SPONSOR"]),
    text: z.string().describe("Plain words, e.g. \"Waiting for 2 athletes to accept\" or \"Ready for BTG to launch\". BTG's staff get the desk's wording; everyone else the plain one, which names no invitation or offer."),
  })
  .meta({ id: "CampaignNextStep", description: "What happens next on a campaign, and who it waits for (P4-BE-09)." });

export const CampaignStageChange = z
  .strictObject({
    state: CampaignState,
    at: z.iso.datetime(),
    movedAutomatically: z.boolean().describe("True when the system made the move (no actor on the audit row, `automatic: true`)."),
    reason: z.string().nullable().optional().describe("Why the system moved it — BTG's staff only."),
  })
  .meta({ id: "CampaignStageChange", description: "A stage change, read from the audit log (P4-BE-09)." });

export const CampaignStageFields = z
  .strictObject({
    nextStep: CampaignNextStep.nullable(),
    stageChange: CampaignStageChange.nullable().describe("The latest stage change."),
    stageHistory: z.array(CampaignStageChange).optional().describe("Every stage change, newest first — GET /campaigns/{id}, BTG's staff only."),
  })
  .meta({ id: "CampaignStageFields", description: "What every campaign read adds (P4-BE-09)." });

export const CampaignLaunchResult = z
  .strictObject({
    id: z.string(),
    state: CampaignState,
    ordersActivated: z.number().int(),
    rewards: z.strictObject({
      activated: z.number().int().describe("Draft rewards that went live with the launch, as the system (P6-BE-09)."),
      leftInDraft: z
        .array(z.strictObject({ id: z.string(), offerText: z.string(), reason: z.string() }))
        .describe("Drafts that could not go live, and why — they stay DRAFT."),
    }),
  })
  .meta({ id: "CampaignLaunchResult" });
