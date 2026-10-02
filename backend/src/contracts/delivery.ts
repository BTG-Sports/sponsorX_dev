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
  .object({ decision: z.enum(["CONFIRM", "REFUND", "KEEP"]), note: note.describe("Emailed to the sponsor and the seller") })
  .strict()
  .meta({
    id: "DeliveryResolutionInput",
    description: "BTG's decision on an issue the seller and the sponsor couldn't settle (escalated only). A problem or an overdue line: CONFIRM delivered (the hold ends), or REFUND the line in full. A sponsor's request to cancel (2S4-BE-12): REFUND (cancelled and refunded) or KEEP (it goes ahead as booked). Any other pairing is 422.",
  });

/* 2S4-BE-12 — cancelling a paid line. */
export const DeliveryCancelInput = z
  .object({
    reason: z.string().trim().max(2000).nullable().optional()
      .describe("Why — optional before the free cut-off (3 days before the first date); required after it, when the seller is asked (the seller reads it, and BTG if it comes to them)"),
    expect: z.enum(["FREE", "ASK"]).optional()
      .describe("What the sponsor's dialog showed: FREE (cancel and refund now) or ASK (ask the seller). If the terms no longer match — the free cut-off passed while it was open — 409 `cancel_terms_changed` and nothing is done"),
  })
  .strict()
  .meta({ id: "DeliveryCancelInput", description: "The buying sponsor's admin cancels a paid line not yet delivered: free (refunded at once) until 3 days before its first date; after that, until the first date starts, the seller is asked to agree." });

export const SaleCancelInput = z
  .object({ reason: note.describe("Why you can't deliver it — the sponsor reads this") })
  .strict()
  .meta({ id: "SaleCancelInput", description: "The seller cancels a paid line it can't deliver (any time while it is in delivery). The sponsor is refunded in full at once. Two seller cancellations in 90 days and BTG checks the seller's new listings." });

export const CancellationAnswerInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("ACCEPT"), reason: z.string().trim().max(2000).nullable().optional().describe("Optional") }).strict(),
    z.object({ decision: z.literal("DECLINE"), reason: note.describe("Why it can't be cancelled — the sponsor reads it, and BTG decides") }).strict(),
  ])
  .meta({
    id: "CancellationAnswerInput",
    description: "The seller's answer to the sponsor's request to cancel, before its deadline: ACCEPT (the line is refunded in full) or DECLINE with a reason (BTG decides — refund or keep).",
  });

/* 2S4-BE-11 — a reported problem, settled between the seller and the sponsor. */
const proofLink = z.url({ protocol: /^https$/ }).max(500).nullable().optional().describe("A link to the post, video or page — https only");

export const ProblemAnswerInput = z
  .discriminatedUnion("answer", [
    z.object({
      answer: z.literal("DELIVER_AGAIN"),
      newDate: z.iso.date().describe("The date you'll deliver it again on — today or later, within 90 days"),
      note: note.describe("What you'll do — the sponsor reads it"),
    }).strict(),
    z.object({
      answer: z.literal("REFUND"),
      note: z.string().trim().max(2000).nullable().optional().describe("Optional — the sponsor reads it"),
    }).strict(),
    z.object({
      answer: z.literal("DISAGREE"),
      note: note.describe("Why you think it was delivered — the sponsor reads it, and BTG if it comes to them"),
      proofKey: z.string().min(1).max(300).nullable().optional().describe("The key POST /sales/{id}/proof returned, once the photo is uploaded"),
      proofLink,
    }).strict(),
  ])
  .meta({
    id: "ProblemAnswerInput",
    description: "The seller's answer to a problem the sponsor reported, within 72 hours: DELIVER_AGAIN (a new date and a note), REFUND (the whole line — partial refunds are out of scope), or DISAGREE (a note, an optional photo or https link). The sponsor then has 72 hours to accept or reject it.",
  });

export const ReplyAnswerInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("ACCEPT") }).strict(),
    z.object({ decision: z.literal("REJECT"), note: note.describe("Why — BTG reads it when they decide") }).strict(),
  ])
  .meta({
    id: "ReplyAnswerInput",
    description: "The sponsor's answer to the seller's answer, within 72 hours: ACCEPT settles it (deliver again, refund, or the disagreement accepted — the line is confirmed); REJECT, with a note, sends it to BTG.",
  });

export const DeliveryProofQuery = z
  .object({
    issue: z.string().min(1).max(64).optional().describe("A problem on this line (its id, from the exchange) — its photo instead of the current delivery's"),
    photo: z.enum(["answer", "marked"]).optional().describe("With issue: the seller's answer photo (default), or the delivery photo the sponsor disputed"),
  })
  .meta({ id: "DeliveryProofQuery", description: "Which photo: the line's current delivery photo, or one from a problem's exchange." });

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
