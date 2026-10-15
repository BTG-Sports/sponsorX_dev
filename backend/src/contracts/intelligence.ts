import { z } from "./zod";

import { MATCH_KINDS } from "../domain/match-rules";
import { GUARANTEE_METRICS } from "../domain/forecast-rules";
import { SHORTLIST_MAX } from "../domain/match-vocabulary";
import { NOTE_MAX } from "../domain/makegood-rules";
import { RANGES } from "../domain/overview-window";
import { OVERRIDE_MAX_CENTS } from "../domain/pricing-engine";

/* --------------------------------------------------------------------------
   The intelligence engines on the wire (Phase 3). Rules live in the domain
   files: pricing in domain/pricing-engine.ts.
   -------------------------------------------------------------------------- */

export const PricingDeskQuery = z
  .object({
    view: z.enum(["above", "below", "low"]).optional().describe("Only the items recommended above or below their current rate, or under the medium confidence band"),
    q: z.string().max(200).optional().describe("Item title or seller name"),
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "PricingDeskQuery", description: "The pricing desk's page (3S2-BE-02). An unknown view is refused, not ignored." });

export const PricingOverrideInput = z
  .object({
    cpmCents: z.number().int().positive().max(OVERRIDE_MAX_CENTS).describe("The BTG admin's own price per 1,000 impressions, in cents — never below the sell floor, never above $10,000"),
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

const ScenarioInputsSchema = z
  .object({
    budgetCents: z.int().min(1).max(2_000_000_000).describe("What the sponsor would spend, in cents"),
    cpmCents: z.int().min(1).max(10_000_000).describe("The price per 1,000 views the sponsor would pay, in cents"),
    audience: z.object({
      sport: z.string().max(80).optional(),
      stateCodes: z.array(z.string().max(2)).max(60).optional(),
      ageBand: z.string().max(20).optional(),
    }).strict().default({}),
    mix: z.array(z.object({ format: z.string().min(1).max(40), share: z.number().min(0).max(1) }).strict()).min(1).max(10)
      .describe("Each format's share of the budget, summing to 1"),
  })
  .strict()
  .meta({ id: "ScenarioInputs", description: "A what-if for the scenario planner (3S7-BE-01)." });

export const ScenarioCalculateInput = z.object({ inputs: ScenarioInputsSchema }).strict()
  .meta({ id: "ScenarioCalculateInput", description: "Calculate a what-if; nothing is stored (3S7-BE-01)." });

export const ScenarioSaveInput = z.object({ name: z.string().min(1).max(120), inputs: ScenarioInputsSchema }).strict()
  .meta({ id: "ScenarioSaveInput", description: "Calculate and keep a scenario with its answer and model stamp (3S7-BE-01)." });

export const AnomaliesQuery = z
  .object({
    tab: z.enum(["open", "resolved"]).default("open").describe("Flags to review, or decided ones"),
    kind: z.enum(["spike", "duplicate", "bot", "redemption", "manual_entry"]).optional(),
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "AnomaliesQuery", description: "Anomaly flags (3S8-DATA-01)." });

export const AnomalyDispositionInput = z
  .object({
    outcome: z.enum(["confirmed_issue", "false_positive", "excluded_from_reporting"]),
    note: z.string().max(2200).describe("Why — 8 to 2,000 characters, kept on the record and in the audit log"),
  })
  .strict()
  .meta({ id: "AnomalyDispositionInput", description: "Decide an anomaly flag, with a note (3S8-DATA-01)." });

const reason = z.string().max(600).describe("Why — 10 to 500 characters, kept on the version and in the audit log");

export const ModelSettingsInput = z
  .object({ values: z.record(z.string().max(60), z.number()).describe("The settings to change, by key; the rest keep the active version's values"), reason })
  .strict()
  .meta({ id: "ModelSettingsInput", description: "Save new settings as the model's next version (3S8-BE-01). Inside the safe ranges: active at once; outside: held as a draft for a second person." });

export const ModelReasonInput = z.object({ reason }).strict()
  .meta({ id: "ModelReasonInput", description: "Validate or activate a model version, with a reason (3S8-BE-01)." });

export const ModelRollbackInput = z.object({ toVersion: z.string().min(1).max(20), reason }).strict()
  .meta({ id: "ModelRollbackInput", description: "Make a retired version active again (3S8-BE-01)." });

export const FlagInput = z
  .object({ feature: z.string().min(1).max(40), tenantId: z.string().min(1).max(200), enabled: z.boolean(), reason })
  .strict()
  .meta({ id: "FlagInput", description: "Switch one intelligence feature on or off for one tenant (3S8-OPS-01)." });

export const PartnerInput = z
  .object({
    name: z.string().max(200).describe("The partner's name, 2 to 120 characters"),
    adapter: z.string().min(1).max(60).describe("The adapter key, e.g. generic-webhook-v1"),
  })
  .strict()
  .meta({ id: "PartnerInput", description: "Add an attribution partner (3S6-BE-01). Its token is returned once." });

export const PartnerDeliveryInput = z
  .object({ events: z.array(z.record(z.string(), z.unknown())).min(1).max(500).describe("The partner's events, in its adapter's format") })
  .meta({ id: "PartnerDeliveryInput", description: "A partner's delivery (generic-webhook-v1: { events: [{ id, type, occurred_at, amount_cents?, currency?, reward_token?, order_id?, click_id? }] }). Bearer token required." });
