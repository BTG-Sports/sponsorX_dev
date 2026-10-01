import { z } from "./zod";

import { DECISIONS, ONBOARDING_STATES, ORG_TYPES } from "../domain/onboarding-rules";
import { DOCUMENT_KINDS, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "../domain/onboarding-documents";

/* --------------------------------------------------------------------------
   External property onboarding on the wire — 2S1-BE-01, 2S1-BE-03.
   The per-type business details are validated by the domain's own strict
   schemas (onboarding-rules.ts), so a field nobody asked for is refused there.
   -------------------------------------------------------------------------- */

export const OrgType = z.enum(ORG_TYPES).meta({ id: "OrgType", description: "Becomes Property.kind on approval." });
export const OnboardingState = z.enum(ONBOARDING_STATES).meta({
  id: "OnboardingState",
  description: "DRAFT → PENDING_REVIEW → APPROVED (automatically, or by BTG) / CHANGES_REQUESTED / REJECTED; APPROVED ⇄ SUSPENDED; APPROVED → REJECTED → APPROVED (Reject after approval, Reinstate) (Phase 2 state machines §1).",
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

/* 2S1-BE-02 — a verification document, uploaded straight to the private bucket. */
const documentFields = {
  kind: z.enum(DOCUMENT_KINDS),
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum([...DOCUMENT_TYPES] as [string, ...string[]]),
  bytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  /* 2S1-BE-08 — the state a business registration is for (an agency needs one per state). */
  stateCode: z.string().length(2).nullable().optional(),
  /* 2S1-BE-07 — "valid until", when the paper has a date. */
  expiresOn: z.iso.date().nullable().optional(),
};
export const OnboardingDocumentInput = z
  .object(documentFields)
  .strict()
  .meta({ id: "OnboardingDocumentInput", description: "Proof of rights, business registration, identity or a representation agreement — PDF, JPEG or PNG, up to 20 MB (an ID up to 10 MB)." });

/* 2S1-BE-06 — the link in the confirmation email. */
export const OnboardingConfirmEmailInput = z
  .object({ token: z.string().min(10).max(400) })
  .strict()
  .meta({ id: "OnboardingConfirmEmailInput", description: "The token from the confirmation email's link — proves the primary contact reads that mailbox." });

export const OnboardingList = z.enum(["auto", "flagged"]).meta({
  id: "OnboardingList",
  description: "auto — organisations the system approved, newest first (spot checks); flagged — approved organisations a document change flagged.",
});

/* 2S1-BE-07 — an approved organisation's own manager adds or replaces a paper. */
export const OrganizationDocumentInput = z
  .object({ ...documentFields, replacesId: z.string().min(1).max(60).nullable().optional() })
  .strict()
  .meta({ id: "OrganizationDocumentInput", description: "A new or replacement document (replacesId names the one on file). The earlier file is kept as history." });
