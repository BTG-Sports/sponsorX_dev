import { z } from "./zod";

/* --------------------------------------------------------------------------
   Invoices on the wire — P7-BE-04, §18.

   Two shapes, and the asymmetry is the point: there is an INPUT for what Zoho
   sends us and an OUTPUT for what we show, and no input anywhere that creates
   or amends an invoice. SponsorX is not the invoice system of record, and the
   published contract says so by having no verb for it.
   -------------------------------------------------------------------------- */

export const ZohoInvoiceWebhook = z
  .object({
    invoiceId: z.string().min(1).max(120),
    /** The Zoho Deal this invoice belongs to; maps to `Campaign.zohoDealId`. */
    dealId: z.string().min(1).max(120),
    number: z.string().max(120).nullable().optional(),
    /** Zoho's own word — draft | sent | overdue | paid | void. Not mapped
     *  onto an enum of ours: a status we fail to recognise must stay visible
     *  rather than being coerced into the nearest one we know. */
    status: z.string().min(1).max(40),
    amount: z.int().describe("cents"),
    currency: z.string().length(3).nullable().optional(),
    issuedAt: z.iso.datetime().nullable().optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    paidAt: z.iso.datetime().nullable().optional(),
  })
  .meta({ id: "ZohoInvoiceWebhook" });

export const Invoice = z
  .object({
    id: z.string(),
    zohoInvoiceId: z.string(),
    number: z.string().nullable(),
    status: z.string(),
    amount: z.int().describe("cents"),
    currency: z.string(),
    issuedAt: z.iso.datetime().nullable(),
    dueAt: z.iso.datetime().nullable(),
    paidAt: z.iso.datetime().nullable(),
    syncedAt: z.iso.datetime().describe("When Zoho last told us this"),
  })
  .meta({
    id: "Invoice",
    description:
      "A mirror of a Zoho Books invoice. Read-only here: when the two disagree, Zoho is right and the next sync corrects this copy.",
  });

export const PaymentStatus = z
  .object({
    paid: z
      .boolean()
      .describe("Every live invoice is paid. One overdue invoice makes this false."),
    invoiced: z.int().describe("cents, excluding void invoices"),
    outstanding: z.int().describe("cents not yet paid"),
    count: z.int().min(0),
  })
  .meta({ id: "PaymentStatus" });
