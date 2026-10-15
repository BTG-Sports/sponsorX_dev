import { z } from "./zod";

import { MATCH_KINDS } from "../domain/match-rules";
import { GUARANTEE_METRICS } from "../domain/forecast-rules";
import { SHORTLIST_MAX } from "../domain/match-vocabulary";
import { NOTE_MAX } from "../domain/makegood-rules";
import { RANGES } from "../domain/overview-window";

/* --------------------------------------------------------------------------
   The intelligence engines on the wire (Phase 3). Rules live in the domain
   files: pricing in domain/pricing-engine.ts.
   -------------------------------------------------------------------------- */

export const PricingOverrideInput = z
  .object({
    cpmCents: z.number().int().positive().describe("The BTG admin's own price per 1,000 impressions, in cents — never below the sell floor"),
    reason: z.string().describe("Why — 10 to 500 characters, kept with the override and in the audit log"),
  })
  .strict()
  .meta({ id: "PricingOverrideInput", description: "A BTG admin's own price for an item (3S2-BE-03). Never edits the suggestion, and never changes the item's listed price." });

export const MatchesQuery = z
  .object({
    kind: z.enum(MATCH_KINDS).default("athlete").describe("Which candidates: athlete, property or inventory"),
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "MatchesQuery", description: "One page of one kind of candidate, ranked best first (3S3-BE-02)." });

export const ShortlistInput = z
  .object({
    entryIds: z.array(z.string().min(1).max(200)).max(SHORTLIST_MAX).describe("Match ids from the brief's current ranking (e.g. athlete:<id>); an empty list clears the shortlist"),
  })
  .strict()
  .meta({ id: "ShortlistInput", description: "Replace a brief's shortlist with exactly these ranked matches (3S3-BE-02)." });

export const ForecastsQuery = z
  .object({
    risk: z.enum(["all", "at_risk", "watch", "on_track"]).default("all").describe("Which active campaigns: all, or one risk level"),
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "ForecastsQuery", description: "Active campaigns' latest forecasts, riskiest first (3S4-BE-01)." });

export const GuaranteeInput = z
  .object({
    metric: z.enum(GUARANTEE_METRICS).nullable().describe("What the campaign is promised: impressions, engagements, redemptions or deliverables. Null clears it (every deliverable booked)."),
    value: z.int().min(1).max(2_000_000_000).nullable().optional().describe("How many, by the end date"),
  })
  .strict()
  .meta({ id: "GuaranteeInput", description: "Set what a campaign is promised to reach by its end date (3S4-BE-01)." });

export const MakeGoodsQuery = z
  .object({
    status: z.enum(["open", "approved"]).default("open").describe("Which shortfalls: open (awaiting a decision) or approved"),
    campaign: z.string().min(1).max(200).optional().describe("One campaign's shortfalls only"),
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "MakeGoodsQuery", description: "Campaigns' shortfalls and their make-good substitutes (3S5-BE-01)." });

export const MakeGoodApproveInput = z
  .object({
    optionId: z.string().min(1).max(200).describe("The substitute to approve, from the shortfall's options"),
    note: z.string().max(NOTE_MAX + 200).describe("Why this substitute — 8 to 2,000 characters, kept on the decision and in the audit log"),
  })
  .strict()
  .meta({ id: "MakeGoodApproveInput", description: "Approve one substitute for a shortfall (3S5-BE-02). Refused (409) when it fails a check now or the shortfall is decided." });

export const SponsorIntelQuery = z
  .object({
    range: z.enum(RANGES).default("30d").describe("The window: 7d, 30d, 90d or all"),
  })
  .meta({ id: "SponsorIntelQuery", description: "The sponsor's own intelligence hub over a window (3S7-BE-02)." });
