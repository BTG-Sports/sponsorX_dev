import { z } from "./zod";

import { MATCH_KINDS } from "../domain/match-rules";
import { SHORTLIST_MAX } from "../domain/match-vocabulary";

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
