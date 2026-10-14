import { z } from "./zod";

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
