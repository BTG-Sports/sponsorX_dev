import { z } from "zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";
import { SPONSOR_REQUEST_STATES } from "../domain/sponsor-request-rules";

/* 2S1-BE-05 — BTG's decision on a business asking to sponsor. Approving
   opens the account; the business type BTG picks is what the clash check
   uses. Declining needs a note the business reads. */

export const SponsorRequestListQuery = z
  .object({
    state: z.enum(SPONSOR_REQUEST_STATES).optional(),
    /* The house pager (lib/paging.ts): present → one page and its count. */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "SponsorRequestListQuery", description: "Which tab of BTG's queue: NEW (waiting, the default), APPROVED, DECLINED or REJECTED." });

export const SponsorRequestDecisionInput = z
  .discriminatedUnion("decision", [
    z.object({
      decision: z.literal("APPROVE"),
      categories: z.array(z.enum(BRAND_CATEGORIES)).min(1).max(10),
      /* Link to a sponsor that already exists (e.g. synced in from Zoho) instead of creating one. */
      linkSponsorId: z.string().min(1).nullable().optional(),
      /* Confirms a same-named sponsor is a different business. */
      newSponsor: z.boolean().optional(),
    }).strict(),
    z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(2000) }).strict(),
    /* 2S1-BE-17 — after approval (automatic or not): switch the sponsor's logins off, with a reason the business reads. */
    z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(1).max(2000) }).strict(),
    z.object({ decision: z.literal("REINSTATE") }).strict(),
  ])
  .meta({
    id: "SponsorRequestDecisionInput",
    description: "APPROVE with the business type (and optionally a sponsor to link to), or DECLINE with a note the business reads. After approval: REJECT with a note (logins switched off) or, once rejected, REINSTATE.",
  });

/* 2S1-BE-17 — the applicant's proof of business, uploaded with the request token. */
export const SponsorDocumentInput = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    bytes: z.number().int().min(1),
  })
  .strict()
  .meta({ id: "SponsorDocumentInput", description: "A proof of business — registration, permit or license — as PDF, JPEG or PNG." });

export const SponsorEmailConfirmInput = z
  .object({ token: z.string().min(1).max(500) })
  .strict()
  .meta({ id: "SponsorEmailConfirmInput", description: "The token from the confirmation email's link." });
