import { z } from "./zod";

/* 2S1-BE-16 — the public contact form. Strict: a name, an email, one of four
   topics, a message, and at most three attachments declared up front (each
   is then uploaded straight to the private bucket). */

export const SUPPORT_TOPICS = ["GUARDIANSHIP", "ACCOUNT", "PAYMENT", "OTHER"] as const;
/* POL-BE-43 — the help desk's eight topics, in the form's order. The first
   four keys are the contact form's, so every message already stored keeps
   its topic; GET /public/support still lists only those four (the form as
   it was), and GET /public/support/cases lists all eight with their cases. */
export const HELPDESK_TOPICS = ["ACCOUNT", "PAYMENT", "GUARDIANSHIP", "CAMPAIGNS", "SHOP", "REWARDS", "NEXT", "OTHER"] as const;
/* A case ID as the help desk stores it: ACC-30, PAY-81, OTH-01. */
export const HELPDESK_CASE_ID = /^[A-Z]{3}-\d{2}$/;
export const MAX_HELPDESK_CASES = 30;
export const SUPPORT_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_SUPPORT_ATTACHMENTS = 3;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/* 2S0-SEC-01 (O2) — how long an attachment is kept: after its message reached
   the desk, and after a message that was never sent was started. */
export const SUPPORT_ATTACHMENT_RETENTION_DAYS = 90;
export const ABANDONED_SUPPORT_DRAFT_DAYS = 30;

export const SupportAttachmentInput = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.enum(SUPPORT_ATTACHMENT_TYPES),
    bytes: z.number().int().min(1).max(MAX_SUPPORT_ATTACHMENT_BYTES),
  })
  .strict()
  .meta({ id: "SupportAttachmentInput", description: "An attachment to a support message: PDF, JPEG or PNG, at most 10 MB." });

export const SupportMessageInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    topic: z.enum(HELPDESK_TOPICS),
    /* POL-BE-43 — the ticked cases. With at least one ticked, the text is
       needed only if "Something else" (OTH-01) is among them; with none, the
       text is the message, as the form always was. */
    cases: z.array(z.string().trim().regex(HELPDESK_CASE_ID, "a case ID like ACC-30")).max(MAX_HELPDESK_CASES).optional(),
    message: z.string().trim().max(5000).optional(),
    attachments: z.array(SupportAttachmentInput).max(MAX_SUPPORT_ATTACHMENTS).optional(),
  })
  .strict()
  .meta({
    id: "SupportMessageInput",
    description: "A message to BTG support (2S1-BE-16) from the help desk form (POL-BE-43): a topic, the ticked case IDs, and text when nothing is ticked or \"Something else\" (OTH-01) is. Sent while signed in, it is linked to that account and only that role's cases may be ticked; otherwise only public ones. With no attachments it is queued at once; with attachments, each gets a presigned PUT and the message is queued by /send once they have arrived.",
  });

export const HelpdeskCasesQuery = z
  .object({ topic: z.enum(HELPDESK_TOPICS).optional() })
  .meta({ id: "HelpdeskCasesQuery", description: "One topic's cases, or every topic's." });

/* POL-BE-41 — BTG's support inbox. */
export const SUPPORT_STATUSES = ["NEW", "ANSWERED", "CLOSED"] as const;

export const SupportMessageListQuery = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    /* POL-BE-43 — only messages with this case ticked, or on this topic. */
    case: z.string().trim().regex(HELPDESK_CASE_ID).optional(),
    topic: z.enum(HELPDESK_TOPICS).optional(),
    /* The house pager (lib/paging.ts): present → one page and its count. */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "SupportMessageListQuery", description: "Which tab of BTG's support inbox: NEW (the default), ANSWERED or CLOSED; optionally only one case (?case=ACC-30) or one topic." });

export const SupportReplyInput = z
  .object({ body: z.string().trim().min(1).max(5000) })
  .strict()
  .meta({ id: "SupportReplyInput", description: "BTG's reply to a support message: kept with it and emailed to the sender from noreply@ (POL-BE-41)." });
