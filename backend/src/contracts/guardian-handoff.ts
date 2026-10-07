import { z } from "./zod";

/* 2S1-BE-15 — changing a minor's guardian. The new guardian's side is public
   (no login): they identify the athlete by the athlete's email, give their
   details, confirm their own email, upload a government ID and proof of
   guardianship, and accept the guardian agreement. The current guardian's
   answer is behind a login: Hand off or Decline. */

export const HANDOFF_RELATIONSHIPS = ["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"] as const;
export const HANDOFF_DOCUMENT_KINDS = ["GUARDIAN_ID", "GUARDIANSHIP_PROOF"] as const;
export const GUARDIANSHIP_PROOF_KINDS = ["BIRTH_CERTIFICATE", "COURT_ORDER", "SCHOOL_RECORD"] as const;

export const HandoffLookupQuery = z
  .object({ athleteEmail: z.email().max(254) })
  .meta({ id: "HandoffLookupQuery", description: "The athlete's email — the way the new guardian identifies them." });

export const HandoffStartInput = z
  .object({
    athleteEmail: z.email().max(254),
    name: z.string().trim().min(1).max(160),
    email: z.email().max(254),
    phone: z.string().trim().min(1).max(40).optional(),
    relationship: z.enum(HANDOFF_RELATIONSHIPS),
  })
  .strict()
  .meta({ id: "HandoffStartInput", description: "The new guardian starts a request: which athlete (by their email), and who they are. A confirmation email follows." });

export const HandoffEmailConfirmInput = z
  .object({ token: z.string().min(1).max(500) })
  .strict()
  .meta({ id: "HandoffEmailConfirmInput", description: "The token from the new guardian's confirmation email." });

export const HandoffDocumentInput = z
  .object({
    kind: z.enum(HANDOFF_DOCUMENT_KINDS),
    proofKind: z.enum(GUARDIANSHIP_PROOF_KINDS).optional(),
    filename: z.string().trim().min(1).max(200),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    bytes: z.number().int().min(1),
  })
  .strict()
  .meta({ id: "HandoffDocumentInput", description: "A government ID (GUARDIAN_ID) or proof of guardianship (GUARDIANSHIP_PROOF, with what it is): PDF, JPEG or PNG, at most 10 MB." });

export const HandoffSubmitInput = z
  .object({ acceptAgreement: z.literal(true) })
  .strict()
  .meta({ id: "HandoffSubmitInput", description: "Accept the guardian agreement and send the request to the current guardian." });

export const HandoffDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("HAND_OFF") }).strict(),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().max(1000).optional() }).strict(),
  ])
  .meta({ id: "HandoffDecisionInput", description: "The current guardian's answer: HAND_OFF (the switch happens at once — or, when BTG staff confirm minors, waits for BTG) or DECLINE." });

/** 2S1-BE-15 — BTG's answer to a handoff waiting for staff confirmation (HANDED_OFF). */
export const HandoffStaffDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({ decision: z.literal("CONFIRM") }).strict(),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(1000) }).strict(),
  ])
  .meta({ id: "HandoffStaffDecisionInput", description: "BTG's answer to a handed-off request waiting for staff confirmation: CONFIRM (the switch) or DECLINE, with a reason the requester reads." });

/** 2S1-FE-12 — the groups of BTG's Guardian handoffs desk, one tab each. */
export const HANDOFF_GROUPS = ["WAITING_FOR_BTG", "IN_PROGRESS", "SWITCHED", "DECLINED", "CANCELLED"] as const;

export const HandoffListQuery = z
  .object({
    group: z.enum(HANDOFF_GROUPS).optional(),
    /* The house pager (lib/paging.ts): present → one page and its count. */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({
    id: "HandoffListQuery",
    description: "One group of requests: WAITING_FOR_BTG (HANDED_OFF), IN_PROGRESS (REQUESTED — BTG only — and WAITING), SWITCHED, DECLINED or CANCELLED. Omitted: every group.",
  });
