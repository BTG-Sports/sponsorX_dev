import { z } from "./zod";

import { GUARDIAN_RELATIONSHIPS } from "../domain/guardian-rules";

/* --------------------------------------------------------------------------
   Guardians and agreements over the API — P3-BE-14, §4, §11, §12, §37.

   `linkGuardian`, `verifyGuardian` and `acceptAgreement` were built by
   P3-BE-03 and P3-BE-06 and no endpoint called any of them. These are the
   contracts that make B1's exit reachable — "ACTIVE, with agreements and (if
   minor) verified-guardian captured" is not a claim the API could support
   until now.
   -------------------------------------------------------------------------- */

/** §4 — the relationships a guardian may hold. Mirrors GUARDIAN_RELATIONSHIPS
 *  in the domain, which is the authority; this is the wire vocabulary. */
export const GuardianRelationship = z
  .enum(GUARDIAN_RELATIONSHIPS)
  .meta({
    id: "GuardianRelationship",
    description: "How the authorised adult relates to the minor (§4).",
  });

/* Built from the domain's own list rather than retyped. `linkGuardian`
   validates against GUARDIAN_RELATIONSHIPS, so a contract that admitted a
   fourth value would publish an option the domain refuses — the spec would
   be lying to §8's service account about what the API accepts. */

export const GuardianInput = z
  .object({
    legalName: z.string().min(1).max(120),
    email: z.email(),
    phone: z.string().min(7).max(32).optional(),
    relationship: GuardianRelationship,
    /* 2S1-BE-15 — a BTG admin replacing an existing guardian by hand (a dispute) says why. */
    replaceReason: z.string().min(1).max(1000).optional(),
  })
  .meta({
    id: "GuardianInput",
    description:
      "The adult authorising a minor's participation. Linking is refused for an adult athlete, and for a minor who already has a guardian " +
      "(409 handoff_required — the handoff is the way to change guardian). Only a BTG admin may replace an existing guardian, with a replaceReason.",
  });

/**
 * §37's gate, as a readable answer.
 *
 * Four states rather than a boolean, because "no guardian" and "a guardian we
 * have not verified" need different things done about them, and collapsing
 * them would let an athlete self-declare a parent and proceed.
 */
export const GuardianReadiness = z
  .object({
    status: z.enum(["not-required", "missing", "unverified", "ready"]),
    reason: z.string().optional(),
  })
  .meta({
    id: "GuardianReadiness",
    description: "Whether §37's guardian gate is satisfied for this athlete, evaluated against today's date.",
  });

/**
 * What a signer had on screen.
 *
 * The hash is of the text actually displayed, not of the agreement id — that
 * is the whole point of P3-BE-06. A later edit to the template must not
 * silently change what someone is recorded as having accepted.
 *
 * IP and user agent are deliberately absent: §12 wants them captured, and the
 * server takes them from the request. A caller who can nominate their own
 * evidence is not providing evidence.
 */
export const AgreementAcceptanceInput = z
  .object({
    agreementId: z.string().min(1),
    bodyHashShown: z
      .string()
      .min(1)
      .describe("Hash of the agreement text as rendered to the signer"),
  })
  .meta({
    id: "AgreementAcceptanceInput",
    description: "Accept an agreement. The signer, IP and user agent come from the request, never the body.",
  });

export type GuardianInput = z.infer<typeof GuardianInput>;
export type GuardianReadiness = z.infer<typeof GuardianReadiness>;
export type AgreementAcceptanceInput = z.infer<typeof AgreementAcceptanceInput>;
export type GuardianRelationship = z.infer<typeof GuardianRelationship>;
