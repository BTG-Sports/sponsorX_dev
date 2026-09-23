/**
 * P7-BE-04 — "Invoice and payment status flow Zoho → SponsorX and attach to
 * the campaign; SponsorX never becomes the invoice system of record."
 *
 * The second clause is the interesting one, because it is a claim about what
 * the code CANNOT do. It is tested the only way such a claim can be: by
 * asserting the absence of any way to originate an invoice — no create, no
 * edit, no void, no totalling, and no route that writes one.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

let campaign: Record<string, unknown> | null;
let existing: Record<string, unknown> | null;
let upserts: { create: Record<string, unknown>; update: Record<string, unknown> }[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/db/client", () => {
  const tx = {
    campaign: {
      findUnique: () => Promise.resolve(campaign),
      findFirst: () => Promise.resolve(campaign),
    },
    campaignInvoice: {
      findUnique: () => Promise.resolve(existing),
      upsert: (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args);
        return Promise.resolve({ id: "inv_1", status: args.create.status });
      },
      findMany: () => Promise.resolve(invoiceRows),
    },
  };
  return { prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

let invoiceRows: Record<string, unknown>[] = [];

const { ingestZohoInvoice, payloadHash, paymentStatusForCampaign, UnknownDealError } =
  await import("../src/domain/invoice");

const actor = () =>
  ({ userId: "u", tenantId: "t1", roles: ["FINANCE"], sponsorId: null,
     athleteId: null, guardianId: null, propertyId: null }) as never;

/* ingestZohoInvoice takes the CALLER'S transaction — it is invoked from
   inside one by the worker — so the test supplies a tx-shaped stub rather
   than reaching through the mocked client. */
const tx = () => ({
  campaign: { findUnique: () => Promise.resolve(campaign) },
  campaignInvoice: {
    findUnique: () => Promise.resolve(existing),
    upsert: (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      upserts.push(args);
      return Promise.resolve({ id: "inv_1", status: args.create.status });
    },
  },
}) as never;

const payload = (over: Record<string, unknown> = {}) => ({
  invoiceId: "zinv_1", dealId: "zdeal_1", status: "sent",
  amount: 500000, number: "INV-42", ...over,
}) as never;

beforeEach(() => {
  campaign = { id: "cmp_1", tenantId: "t1" };
  existing = null;
  upserts = [];
  invoiceRows = [];
});

describe("invoices flow in from Zoho", () => {
  it("attaches the invoice to the campaign carrying that deal", async () => {
    const out = await ingestZohoInvoice(tx(), payload());
    expect(out).toMatchObject({ applied: true });
    expect(upserts[0]!.create).toMatchObject({
      campaignId: "cmp_1", tenantId: "t1", status: "sent", amount: 500000,
    });
  });

  it("records Zoho as the origin, with a hash for §18 loop prevention", async () => {
    await ingestZohoInvoice(tx(), payload());
    expect(upserts[0]!.create.lastSyncOrigin).toBe("ZOHO");
    expect(String(upserts[0]!.create.lastSyncHash)).toHaveLength(64);
  });

  /* Zoho retries on any non-2xx, so redelivery is the normal case. */
  it("is idempotent — an identical redelivery writes nothing", async () => {
    existing = { id: "inv_1", lastSyncHash: payloadHash(payload()) };
    const out = await ingestZohoInvoice(tx(), payload());
    expect(out).toEqual({ applied: false, reason: "identical payload already applied" });
    expect(upserts).toEqual([]);
  });

  it("applies a genuine change to the same invoice", async () => {
    existing = { id: "inv_1", lastSyncHash: payloadHash(payload()) };
    const out = await ingestZohoInvoice(tx(), payload({ status: "paid" }));
    expect(out).toMatchObject({ applied: true });
    expect(upserts[0]!.update).toMatchObject({ status: "paid" });
  });

  it("hashes stably regardless of key order", () => {
    const a = payloadHash({ invoiceId: "i", dealId: "d", status: "paid", amount: 1 } as never);
    const b = payloadHash({ amount: 1, status: "paid", dealId: "d", invoiceId: "i" } as never);
    expect(a).toBe(b);
  });

  /* An invoice on the wrong campaign is worse than one visibly unattached. */
  it("refuses a deal no campaign carries, rather than guessing", async () => {
    campaign = null;
    await expect(ingestZohoInvoice(tx(), payload())).rejects.toThrow(UnknownDealError);
    expect(upserts).toEqual([]);
  });

  it("keeps Zoho's own status string rather than mapping it", async () => {
    await ingestZohoInvoice(tx(), payload({ status: "partially_paid" }));
    expect(upserts[0]!.create.status).toBe("partially_paid");
  });
});

describe("payment status is strict", () => {
  const inv = (status: string, amount = 1000) =>
    ({ id: "i", zohoInvoiceId: "z", number: null, status, amount,
       currency: "USD", issuedAt: null, dueAt: null, paidAt: null, syncedAt: new Date() });

  it("is paid only when every live invoice is paid", async () => {
    invoiceRows = [inv("paid"), inv("paid")];
    await expect(paymentStatusForCampaign(actor(), "cmp_1")).resolves.toMatchObject({ paid: true });
  });

  /* A finance screen that rounded this up produces a wrong answer that only
     surfaces in a conversation with the sponsor. */
  it("is NOT paid when one invoice is overdue", async () => {
    invoiceRows = [inv("paid"), inv("overdue")];
    const out = await paymentStatusForCampaign(actor(), "cmp_1");
    expect(out.paid).toBe(false);
    expect(out.outstanding).toBe(1000);
  });

  it("excludes void invoices from both totals", async () => {
    invoiceRows = [inv("paid", 1000), inv("void", 9999)];
    const out = await paymentStatusForCampaign(actor(), "cmp_1");
    expect(out.invoiced).toBe(1000);
    expect(out.outstanding).toBe(0);
    expect(out.count).toBe(1);
    expect(out.paid).toBe(true);
  });

  it("is not paid when there are no invoices at all", async () => {
    invoiceRows = [];
    await expect(paymentStatusForCampaign(actor(), "cmp_1")).resolves.toMatchObject({
      paid: false, count: 0,
    });
  });

  it("compares status case-insensitively — Zoho's casing is not ours to rely on", async () => {
    invoiceRows = [inv("PAID")];
    await expect(paymentStatusForCampaign(actor(), "cmp_1")).resolves.toMatchObject({ paid: true });
  });
});

/**
 * THE SECOND CLAUSE: SponsorX never becomes the invoice system of record.
 * Tested as an absence, because that is what the claim is.
 */
describe("SponsorX cannot originate an invoice", () => {
  const domain = readFileSync(new URL("../src/domain/invoice.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../src/routes/v1/metrics.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  it("exports no way to create, amend or void one", () => {
    for (const verb of ["createInvoice", "updateInvoice", "voidInvoice", "issueInvoice"]) {
      expect(domain).not.toContain(verb);
    }
  });

  it("exposes only reads over HTTP", () => {
    /* The two invoice routes are GETs; nothing POSTs or PATCHes an invoice. */
    expect(routes).toContain('metricsRouter.get("/campaigns/:id/invoices"');
    expect(routes).not.toMatch(/post\("\/campaigns\/:id\/invoices"/);
    expect(routes).not.toMatch(/patch\(".*invoice/i);
  });

  it("has no line items or tax fields to build one from", () => {
    const model = schema.slice(
      schema.indexOf("model CampaignInvoice {"),
      schema.indexOf("}", schema.indexOf("model CampaignInvoice {")),
    );
    for (const field of ["lineItem", "taxRate", "taxTotal", "subTotal"]) {
      expect(model.toLowerCase()).not.toContain(field.toLowerCase());
    }
    /* The Zoho record is the identity — which is what makes ingestion
       idempotent and the mirror unable to invent a row of its own. */
    expect(model).toContain("zohoInvoiceId");
    expect(model).toMatch(/zohoInvoiceId\s+String\s+@unique/);
  });
});
