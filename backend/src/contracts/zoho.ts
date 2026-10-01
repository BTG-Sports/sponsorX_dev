import { z } from "./zod";
import { BUSINESS_TYPES } from "../domain/sponsor-request-rules";

/* --------------------------------------------------------------------------
   Zoho CRM inbound, and the sponsor enquiry — P8-INT-03, P8-INT-06, §18.
   -------------------------------------------------------------------------- */

/**
 * A Zoho CRM Notifications API callback. It names records, it does not carry
 * them: the worker fetches each id, so the route has nothing to trust beyond
 * the channel token and never needs to call Zoho back.
 */
export const ZohoCrmNotification = z
  .object({
    module: z.string().min(1).max(60),
    ids: z.array(z.string().min(1).max(40)).min(1).max(200),
    operation: z.string().min(1).max(20),
    channel_id: z.union([z.string(), z.number()]).transform(String),
    token: z.string().max(200).optional(),
    server_time: z.union([z.string(), z.number()]).optional(),
    resource_uri: z.string().max(500).optional(),
    affected_fields: z.array(z.unknown()).optional(),
    query_params: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: "ZohoCrmNotification" });

export type ZohoCrmNotification = z.infer<typeof ZohoCrmNotification>;

/** A prospective sponsor asking to talk. Becomes a Zoho Lead (§7.3). */
export const InquiryInput = z
  .object({
    companyName: z.string().trim().min(1).max(200).optional(),
    firstName: z.string().trim().min(1).max(40).optional(),
    lastName: z.string().trim().min(1).max(80),
    email: z.email().max(100),
    phone: z.string().trim().min(3).max(30).optional(),
    message: z.string().trim().max(4000).optional(),
    /* 2S1-BE-17 — what the business is: one of the list, or OTHER with its own words. */
    businessType: z.enum(BUSINESS_TYPES).optional(),
    businessTypeOther: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .refine((v) => v.businessType !== "OTHER" || Boolean(v.businessTypeOther), { path: ["businessTypeOther"], message: "Say what your business does." })
  .meta({ id: "InquiryInput" });

export type InquiryInput = z.infer<typeof InquiryInput>;
