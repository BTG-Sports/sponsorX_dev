import { z } from "./zod";

import { DECISIONS, ONBOARDING_STATES, ORG_TYPES } from "../domain/onboarding-rules";

/* --------------------------------------------------------------------------
   External property onboarding on the wire — 2S1-BE-01, 2S1-BE-03.
   The per-type business details are validated by the domain's own strict
   schemas (onboarding-rules.ts), so a field nobody asked for is refused there.
   -------------------------------------------------------------------------- */

export const OrgType = z.enum(ORG_TYPES).meta({ id: "OrgType", description: "Becomes Property.kind on approval." });
export const OnboardingState = z.enum(ONBOARDING_STATES).meta({
  id: "OnboardingState",
  description: "DRAFT → PENDING_REVIEW → APPROVED / CHANGES_REQUESTED / REJECTED; APPROVED ⇄ SUSPENDED (Phase 2 state machines §1).",
});

export const OnboardingStartInput = z
  .object({ orgType: OrgType, orgName: z.string().trim().min(1).max(200) })
  .meta({ id: "OnboardingStartInput" });

export const OnboardingStepInput = z
  .discriminatedUnion("step", [
    z.object({ step: z.literal("organisation"), orgName: z.string().trim().min(1).max(200).optional(), stateCode: z.string().length(2).optional() }),
    z.object({ step: z.literal("contacts"), contacts: z.array(z.record(z.string(), z.unknown())).min(1).max(10) }),
    z.object({ step: z.literal("business"), details: z.record(z.string(), z.unknown()) }),
    /* Payout and tax details go to the payment provider. This step records
       only that the applicant was told so and agreed. */
    z.object({ step: z.literal("payout"), acknowledged: z.literal(true) }),
    z.object({ step: z.literal("agreements"), agreementId: z.string().min(1), bodyHashShown: z.string().length(64) }),
  ])
  .meta({ id: "OnboardingStepInput", description: "One wizard step, saved on its own so partial progress survives." });

export const OnboardingDecisionInput = z
  .object({
    decision: z.enum(Object.keys(DECISIONS) as [keyof typeof DECISIONS, ...(keyof typeof DECISIONS)[]]),
    notes: z.string().max(4000).nullable().optional(),
  })
  .meta({ id: "OnboardingDecisionInput", description: "REQUEST_CHANGES, REJECT and SUSPEND need notes." });
