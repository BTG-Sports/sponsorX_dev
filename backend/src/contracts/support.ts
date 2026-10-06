import { z } from "./zod";

/* 2S1-BE-16 — the public contact form. Strict: a name, an email, one of four
   topics, a message, and at most three attachments declared up front (each
   is then uploaded straight to the private bucket). */

export const SUPPORT_TOPICS = ["GUARDIANSHIP", "ACCOUNT", "PAYMENT", "OTHER"] as const;
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
    topic: z.enum(SUPPORT_TOPICS),
    message: z.string().trim().min(1).max(5000),
    attachments: z.array(SupportAttachmentInput).max(MAX_SUPPORT_ATTACHMENTS).optional(),
  })
  .strict()
  .meta({
    id: "SupportMessageInput",
    description: "A message to BTG support (2S1-BE-16). With no attachments it is queued at once; with attachments, each gets a presigned PUT and the message is queued by /send once they have arrived.",
  });
