/**
 * P8-BE-02 / P8-BE-03 (P0-LEG-06) — the athlete's own rules, and a complaint
 * that pauses a deal. Domain: rules-attestation.ts and deal-disputes.ts.
 */
import { z } from "zod";

export const RulesAttestationInput = z
  .object({ version: z.string().trim().min(1).max(40) })
  .strict()
  .meta({
    id: "RulesAttestationInput",
    description: "Confirm the rules wording (GET /public/rules-attestation) by its version. A version that isn't current is refused (422 `rules_attestation_stale`).",
  });

export const DEAL_DISPUTE_SOURCES = ["SCHOOL", "LEAGUE", "PARENT", "SPONSOR", "OTHER"] as const;

export const DealDisputeOpenInput = z
  .object({
    source: z.enum(DEAL_DISPUTE_SOURCES),
    sourceName: z.string().trim().min(1).max(160).nullable().optional(),
    reason: z.string().trim().min(5).max(2000),
    documentsRequested: z.string().trim().min(5).max(2000),
  })
  .strict()
  .meta({
    id: "DealDisputeOpenInput",
    description: "Who raised the concern, what it is, and what the athlete is asked to send. The athlete (or a minor's guardian) reads the reason and the request.",
  });

export const DealDisputeDocumentInput = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(100),
    bytes: z.int().min(1),
  })
  .strict()
  .meta({ id: "DealDisputeDocumentInput", description: "The file about to be uploaded: a PDF, JPEG, PNG or WebP, at most 10 MB." });

export const DealDisputeResolveInput = z
  .object({
    outcome: z.enum(["RESUME", "CANCEL"]),
    note: z.string().trim().min(3).max(2000),
  })
  .strict()
  .meta({
    id: "DealDisputeResolveInput",
    description: "RESUME lifts the pause (the earning goes back to where it was); CANCEL cancels the order and leaves its earning held for Finance. The athlete reads the note.",
  });

export const DealDisputeListQuery = z
  .object({ state: z.enum(["OPEN", "DOCUMENTS_IN", "RESUMED", "CANCELLED"]).optional() })
  .strict()
  .meta({ id: "DealDisputeListQuery", description: "Only disputes in this state; all of them without it." });
