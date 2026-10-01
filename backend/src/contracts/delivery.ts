import { z } from "./zod";

import { PROOF_MAX_BYTES, PROOF_TYPES } from "../domain/delivery";

/* --------------------------------------------------------------------------
   Sellers' orders and delivery (2S4-BE-06, -07, -08) and team invitations
   (2S2-BE-05) on the wire. Rules live in domain/delivery.ts and
   domain/team-invitations.ts; these are only what a request may carry. None
   names its actor — the seller, the sponsor and the team are always the
   caller.
   -------------------------------------------------------------------------- */

const note = z.string().trim().min(1).max(2000);

export const MarkDeliveredInput = z
  .object({
    note: note.describe("What was delivered — the sponsor reads it"),
    proofKey: z.string().min(1).max(300).nullable().optional().describe("The key POST /sales/{id}/proof returned, once the photo is uploaded"),
    proofLink: z.url({ protocol: /^https$/ }).max(500).nullable().optional().describe("A link to the post, video or page — https only"),
  })
  .strict()
  .meta({ id: "MarkDeliveredInput", description: "The seller marks its line delivered, with a note and an optional photo or link; the sponsor then has 24 hours to confirm or report a problem." });

export const ProofUploadInput = z
  .object({ contentType: z.enum(Object.keys(PROOF_TYPES) as [keyof typeof PROOF_TYPES]), bytes: z.number().int().min(1).max(PROOF_MAX_BYTES) })
  .strict()
  .meta({ id: "ProofUploadInput", description: "A delivery photo (JPEG or PNG) or PDF, up to 10 MB — to the private bucket." });

export const DeliveryProblemInput = z
  .object({ note: note.describe("What went wrong — BTG and the seller read it") })
  .strict()
  .meta({ id: "DeliveryProblemInput", description: "The sponsor reports a problem with a delivered line, within 24 hours of it being marked." });

export const DeliveryResolutionInput = z
  .object({ decision: z.enum(["CONFIRM", "REFUND"]), note: note.describe("Emailed to the sponsor and the seller") })
  .strict()
  .meta({ id: "DeliveryResolutionInput", description: "BTG's decision on a reported problem: CONFIRM delivered (the hold ends), or REFUND the line." });

export const TeamInvitationInput = z
  .object({ athleteId: z.string().min(1), teamShareBps: z.number().int().min(0).max(10_000) })
  .strict()
  .meta({ id: "TeamInvitationInput", description: "Invite an approved athlete with no team, at a proposed team share (basis points). Nobody is linked until they accept." });

export const TeamInvitationResponseInput = z
  .object({ decision: z.enum(["ACCEPT", "DECLINE"]) })
  .strict()
  .meta({ id: "TeamInvitationResponseInput", description: "The athlete accepts (joins at the share shown) or declines." });

export const InvitableAthletesQuery = z
  .object({ q: z.string().max(80).optional() })
  .meta({ id: "InvitableAthletesQuery", description: "A name to search for — at least two letters." });
