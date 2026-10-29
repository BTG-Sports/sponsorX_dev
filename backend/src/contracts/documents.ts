/**
 * Document checks — P8-BE-10 (BTG sends a document back) and P8-BE-11 (BTG
 * answers a new legal name the ID check held).
 */
import { z } from "zod";

export const DocumentSendBackInput = z
  .object({ reason: z.string().trim().min(5).max(1000) })
  .meta({ id: "DocumentSendBackInput", description: "Why BTG is sending the document back. The person reads it in the email that asks for a new one." });

export const LegalNameDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("APPLY") }),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(1000) }),
  ])
  .meta({ id: "LegalNameDecisionInput", description: "BTG's answer to a profile change held for it — a new legal name the ID check held, or a date of birth or move that would make a minor an adult (POL-BE-02): APPLY makes it live; DECLINE closes it with a note the athlete reads." });
