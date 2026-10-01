import { z } from "./zod";

import { GUARDIAN_RELATIONSHIPS } from "../domain/guardian-rules";
import { GUARDIAN_PROOF_KINDS, MAX_ID_DOCUMENT_BYTES } from "../domain/signup-rules";
import { MAX_MAJORITY_AGE, MIN_MAJORITY_AGE } from "../domain/age-of-majority-rules";

/* --------------------------------------------------------------------------
   Athletes and guardians signing up — 2S1-BE-09, -10, -12.

   The applicant's identity-document upload and email confirmation, the
   guardian's own set-up page, the coming-of-age upload, BTG's New sign-ups
   decisions, and the sign-up rules BTG keeps (the age-of-majority table and
   "BTG staff confirm minors before approval"). Strict: unknown keys — and
   so any tax or bank field — are refused.
   -------------------------------------------------------------------------- */

const file = {
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  bytes: z.number().int().min(1).max(MAX_ID_DOCUMENT_BYTES),
};

export const AthleteDocumentInput = z
  .object({ kind: z.enum(["GOVERNMENT_ID", "SCHOOL_ID"]), ...file })
  .strict()
  .meta({ id: "AthleteDocumentInput", description: "An adult's government ID, or a minor's school ID — PDF, JPEG or PNG, at most 10 MB." });

export const GuardianDocumentInput = z
  .object({ kind: z.enum(["GUARDIAN_ID", "GUARDIANSHIP_PROOF"]), proofKind: z.enum(GUARDIAN_PROOF_KINDS).optional(), ...file })
  .strict()
  .meta({
    id: "GuardianDocumentInput",
    description: "The guardian's government ID, or their proof of guardianship (proofKind: a birth certificate naming them, a court order or a school record) — PDF, JPEG or PNG, at most 10 MB.",
  });

export const IdDocumentInput = z
  .object(file)
  .strict()
  .meta({ id: "IdDocumentInput", description: "A government ID — PDF, JPEG or PNG, at most 10 MB." });

export const SignupTokenInput = z
  .object({ token: z.string().min(1).max(500) })
  .strict()
  .meta({ id: "SignupTokenInput", description: "The token from an emailed link." });

export const GuardianDetailsInput = z
  .object({
    legalName: z.string().trim().min(1).max(120),
    relationship: z.enum(GUARDIAN_RELATIONSHIPS),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
  })
  .strict()
  .meta({ id: "GuardianDetailsInput", description: "The guardian's own details, from their set-up page." });

export const GuardianAgreementInput = z
  .object({ agreementId: z.string().min(1).max(100), bodyHashShown: z.string().min(1).max(200) })
  .strict()
  .meta({ id: "GuardianAgreementInput", description: "The guardian agreement version shown, and the hash of the text on screen (§12)." });

export const SignupRejectInput = z
  .object({ note: z.string().trim().min(1).max(2000) })
  .strict()
  .meta({ id: "SignupRejectInput", description: "Why — the person is emailed it exactly as written." });

export const AgeRowInput = z
  .object({
    countryCode: z.string().regex(/^[A-Za-z]{2}$/),
    regionCode: z.string().regex(/^[A-Za-z0-9]{0,3}$/).optional(),
    age: z.number().int().min(MIN_MAJORITY_AGE).max(MAX_MAJORITY_AGE),
  })
  .strict()
  .meta({ id: "AgeRowInput", description: "A place (a country, or a state within it) and its age of majority." });

export const SignupSettingsInput = z
  .object({ staffConfirmMinors: z.boolean() })
  .strict()
  .meta({ id: "SignupSettingsInput", description: "\"BTG staff confirm minors before approval\" — off by default." });
