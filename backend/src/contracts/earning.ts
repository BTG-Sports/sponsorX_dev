import { INT4_MAX, z } from "./zod";

import { EARNING_STATES } from "../domain/earning-state";

/* --------------------------------------------------------------------------
   Earnings on the wire — P7-BE-01, P7-BE-03, §21, Addendum A6.

   NOTHING HERE CARRIES A TAX ID OR A BANK DETAIL, and that is a contract as
   much as a schema: the published OpenAPI document is what §8's service
   account and INFINEX read, so the absence is visible to every consumer
   rather than being an internal convention. `reference` is a pointer to a
   record in Zoho or a bank statement — not enough to move anything.
   -------------------------------------------------------------------------- */

export const EarningState = z.enum(EARNING_STATES).meta({
  id: "EarningState",
  description:
    "PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID, with HELD and DISPUTED reachable from any live state. Phase 1 tracks status only; no payment is initiated from this system (Addendum A6).",
});

export const EarningTransitionInput = z
  .object({
    to: EarningState,
    /** Only meaningful when moving to PAID: a Zoho or bank reference. */
    reference: z.string().max(200).nullable().optional(),
  })
  .meta({ id: "EarningTransitionInput" });

export const EarningAdjustmentInput = z
  .object({
    /** cents, positive or negative. */
    adjustment: z.int().min(-INT4_MAX).max(INT4_MAX),
    /** Mandatory — an unexplained change to what someone is owed is not
     *  auditable, and §26 requires this one to be. */
    reason: z.string().min(1).max(2000),
  })
  .meta({ id: "EarningAdjustmentInput" });

export const EarningBreakdown = z
  .object({
    id: z.string(),
    state: EarningState,
    gross: z.int().describe("cents — athlete compensation before adjustments"),
    adjustment: z.int().describe("cents — corrections, positive or negative"),
    net: z.int().describe("cents — what the athlete ends up with"),
    sellPrice: z.int().describe("cents — what the sponsor paid for this line"),
    margin: z.int().describe("cents — BTG's margin"),
    marginRate: z.number().describe("margin as a share of the sponsor price"),
    clearsFloor: z
      .boolean()
      .describe(
        "Whether the line still clears §5's athlete-cost x 1.4 floor. Reported, never enforced here — P3-BE-12 blocks an underwater line at creation.",
      ),
  })
  .meta({ id: "EarningBreakdown" });
