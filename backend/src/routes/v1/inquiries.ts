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
import { categoryText } from "../../domain/sponsor-request-rules";

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
      },
      select: { id: true },
    });
    await enqueue(tx, tenantId, "zoho.pushLead", { inquiryId: row.id });
    return row;
  });

  res.status(201).json({ id: inquiry.id, received: true });
};

inquiriesRouter.post("/public/inquiries", submitInquiry);
