/**
 * Sponsor enquiries — P8-INT-06, §18 row 3, field-mapping §7.3.
 *
 * PUBLIC: a prospective sponsor has no account yet. So, like /join, the
 * tenant is configuration, the endpoint is rate-limited, and the only thing
 * it does is write one row and queue the Lead push in the same transaction.
 * The row is also the request BTG reviews in SponsorX (2S1-BE-05).
 * Zoho is never called from here — if it is down, the enquiry is still
 * taken and the Lead follows when it recovers.
 *
 * A sponsor enquiry, not a fan: capturing fans as leads needs a consent
 * option that is Phase 2 (`2S6-BE-03` / `2S6-INT-03`).
 */
import { Router, type RequestHandler } from "express";

import { prisma } from "../../db/client";
import { enqueue } from "../../db/outbox";
import { env } from "../../config/env";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { InquiryInput } from "../../contracts/zoho";
import { SponsorDocumentInput, SponsorEmailConfirmInput } from "../../contracts/sponsor-requests";
import {
  confirmSponsorDocumentUpload, confirmSponsorEmail, requestSponsorDocumentUpload, sponsorRequestStatus,
} from "../../domain/sponsor-requests";
import { categoryText, sponsorNameFor } from "../../domain/sponsor-request-rules";
import { send } from "../../lib/email";
import { issueSponsorEmailToken, issueSponsorRequestToken } from "../../lib/sponsor-request-token";

export const inquiriesRouter = Router();

export const submitInquiry: RequestHandler = async (req, res) => {
  await limit("inquiry", clientIp(req), 10, 60 * 60);
  const input = InquiryInput.parse(req.body ?? {});
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;

  const inquiry = await prisma.$transaction(async (tx) => {
    const row = await tx.inquiry.create({
      data: {
        tenantId,
        companyName: input.companyName ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        message: input.message ?? null,
        source: "web-form",
        /* 2S1-BE-05 — the business's own words for what it is, for BTG's review. */
        categoryText: categoryText(input.message ?? null),
        /* 2S1-BE-17 — what the system checks before opening the account by itself. */
        businessType: input.businessType ?? null,
        businessTypeOther: input.businessType === "OTHER" ? input.businessTypeOther ?? null : null,
      },
      select: { id: true },
    });
    await enqueue(tx, tenantId, "zoho.pushLead", { inquiryId: row.id });
    /* The link that proves the contact reads this mailbox — automatic approval's first condition. */
    await send(tx, tenantId, {
      template: "sponsor.confirmEmail", to: input.email, idempotencyKey: `sponsor.confirmEmail:${row.id}`,
      data: {
        firstName: input.firstName ?? input.lastName,
        businessName: sponsorNameFor({ companyName: input.companyName ?? null, firstName: input.firstName ?? null, lastName: input.lastName }),
        confirmUrl: `${env.APP_URL.replace(/\/+$/, "")}/sponsor-request/confirm?t=${encodeURIComponent(issueSponsorEmailToken(row.id))}`,
      },
    });
    return row;
  });

  /* requestToken lets this browser upload the proof of business and read the status — nothing else. */
  res.status(201).json({ id: inquiry.id, received: true, requestToken: issueSponsorRequestToken(inquiry.id) });
};

inquiriesRouter.post("/public/inquiries", submitInquiry);

/* ── 2S1-BE-17 — the applicant's side of automatic approval ─────────────── */

const status: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("sponsor-request:read", clientIp(req), 120, 3600);
  res.json(await sponsorRequestStatus(req.params.token));
};
const upload: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("sponsor-request:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestSponsorDocumentUpload(req.params.token, SponsorDocumentInput.parse(req.body ?? {})));
};
const confirmUpload: RequestHandler<{ token: string; documentId: string }> = async (req, res) => {
  await limit("sponsor-request:document", clientIp(req), 30, 3600);
  res.json(await confirmSponsorDocumentUpload(req.params.token, req.params.documentId));
};
const confirmEmail: RequestHandler = async (req, res) => {
  await limit("sponsor-request:confirm", clientIp(req), 30, 3600);
  res.json(await confirmSponsorEmail(SponsorEmailConfirmInput.parse(req.body ?? {}).token));
};

inquiriesRouter.get("/public/sponsor-requests/:token", status);
inquiriesRouter.post("/public/sponsor-requests/:token/documents", upload);
inquiriesRouter.post("/public/sponsor-requests/:token/documents/:documentId/confirm", confirmUpload);
inquiriesRouter.post("/public/sponsor-requests/confirm-email", confirmEmail);
