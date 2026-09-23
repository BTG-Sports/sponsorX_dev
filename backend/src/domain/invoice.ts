/**
 * Invoice and payment status, mirrored from Zoho — P7-BE-04, §18.
 *
 * SPONSORX NEVER BECOMES THE INVOICE SYSTEM OF RECORD. That is the task's
 * acceptance and it is enforced by omission: this module has an ingest and
 * two reads, and no create, no edit, no void, no totalling. There is no code
 * path by which an invoice can come into existence here without Zoho having
 * made one first, and the schema has no line items or tax fields to make one
 * out of.
 *
 * WHEN THE TWO DISAGREE, ZOHO IS RIGHT. Every ingest overwrites the mirror
 * wholesale rather than merging — a field we no longer receive is a field
 * Zoho cleared, and preserving our copy of it would be this table quietly
 * asserting something Zoho does not say.
 *
 * WHY MIRROR AT ALL. §18 keeps Zoho off every request path. "Has this
 * campaign been paid?" appears on the finance workspace and in the sponsor
 * report, and answering it with an outbound API call would mean both pages
 * go down whenever Zoho does.
 */

import { createHash } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

export class UnknownDealError extends Error {
  readonly status = 422;
  constructor(dealId: string) {
    super(
      `No campaign carries Zoho deal ${dealId}. The invoice is kept in the ` +
        `delivery log rather than attached to a guess — an invoice on the ` +
        `wrong campaign is worse than one that is visibly unattached.`,
    );
    this.name = "UnknownDealError";
  }
}

/** What a Zoho invoice webhook gives us, narrowed to what we mirror. */
export type ZohoInvoicePayload = {
  invoiceId: string;
  dealId: string;
  number?: string | null;
  status: string;
  /** cents */
  amount: number;
  currency?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
};

/**
 * A stable hash of what Zoho sent — §18's loop prevention.
 *
 * Keys are sorted so that a payload whose fields arrive in a different order
 * hashes the same; otherwise a redelivery would look like a change and the
 * row would be rewritten for nothing.
 */
export function payloadHash(payload: ZohoInvoicePayload): string {
  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (payload as Record<string, unknown>)[k];
        return acc;
      }, {}),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export type IngestOutcome =
  | { applied: true; invoiceId: string; status: string }
  | { applied: false; reason: string };

/**
 * Apply one Zoho invoice to the mirror.
 *
 * Idempotent by hash: a webhook redelivered three times writes once. Zoho
 * retries on any non-2xx, so redelivery is the normal case rather than an
 * edge one.
 */
export async function ingestZohoInvoice(
  tx: Prisma.TransactionClient,
  payload: ZohoInvoicePayload,
): Promise<IngestOutcome> {
  const campaign = await tx.campaign.findUnique({
    where: { zohoDealId: payload.dealId },
    select: { id: true, tenantId: true },
  });
  if (!campaign) throw new UnknownDealError(payload.dealId);

  const hash = payloadHash(payload);

  const existing = await tx.campaignInvoice.findUnique({
    where: { zohoInvoiceId: payload.invoiceId },
    select: { id: true, lastSyncHash: true },
  });
  if (existing?.lastSyncHash === hash) {
    return { applied: false, reason: "identical payload already applied" };
  }

  const data = {
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    number: payload.number ?? null,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency ?? "USD",
    issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : null,
    dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
    paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
    /* ZOHO, always. Nothing in SponsorX writes an invoice, so this column can
       only ever say Zoho — it is recorded anyway because §18's loop
       prevention reads it uniformly across the bi-directional models, and a
       column that is always the same value is easier to reason about than one
       that is sometimes absent. */
    lastSyncOrigin: "ZOHO" as const,
    lastSyncHash: hash,
    syncedAt: new Date(),
  };

  const row = await tx.campaignInvoice.upsert({
    where: { zohoInvoiceId: payload.invoiceId },
    create: { zohoInvoiceId: payload.invoiceId, ...data },
    /* Wholesale, not a merge — see the note at the top of this file. */
    update: data,
    select: { id: true, status: true },
  });

  return { applied: true, invoiceId: row.id, status: row.status };
}

/* ────────────────────────────────────────────────────────────────────────────
   Reads
   ──────────────────────────────────────────────────────────────────────────── */

export type InvoiceView = {
  id: string;
  zohoInvoiceId: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  syncedAt: Date;
};

/** One campaign's invoices, as Zoho last described them. */
export async function invoicesForCampaign(
  actor: Actor,
  campaignId: string,
): Promise<InvoiceView[]> {
  /* GATED ON `campaign`, NOT ON AN `invoice` RESOURCE — because §15 has no
     invoice row. The RBAC matrix names `sponsor.billingReference` as a
     field-level rule and gives FINANCE own-tenant reach across the finance
     resources, but it has no resource for invoices at all, and `policy.ts` is
     a transcription of that document: inventing a resource here would put a
     permission in the code that no reviewed policy authorises.

     An invoice is a fact ABOUT A CAMPAIGN, so campaign read is the honest
     gate — BTG and FINANCE reach the tenant, a sponsor reaches their own
     campaigns and therefore their own invoices, which is correct since they
     are the party being invoiced.

     This is raised on the pull request: §15 should gain an `invoice` row, and
     when it does this line changes to match it. */
  assertAllowed(actor, "campaign", "read");

  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true },
  });
  if (!campaign) throw new ForbiddenError("invoice", "read");

  return prisma.campaignInvoice.findMany({
    where: { campaignId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true, zohoInvoiceId: true, number: true, status: true,
      amount: true, currency: true, issuedAt: true, dueAt: true,
      paidAt: true, syncedAt: true,
    },
  });
}

/**
 * Whether a campaign is paid, and how much is outstanding.
 *
 * `paid` is deliberately strict: every invoice Zoho has issued is in a paid
 * state. A campaign with one paid invoice and one overdue one is NOT paid,
 * and a finance screen that rounded that up would be the kind of wrong that
 * only surfaces in a conversation with the sponsor.
 */
export async function paymentStatusForCampaign(
  actor: Actor,
  campaignId: string,
): Promise<{ paid: boolean; invoiced: number; outstanding: number; count: number }> {
  const invoices = await invoicesForCampaign(actor, campaignId);

  /* Zoho's own vocabulary, lowercased for comparison. "void" is neither paid
     nor outstanding — it is an invoice that was withdrawn. */
  const isPaid = (s: string) => s.toLowerCase() === "paid";
  const isVoid = (s: string) => s.toLowerCase() === "void";

  const live = invoices.filter((i) => !isVoid(i.status));
  const invoiced = live.reduce((n, i) => n + i.amount, 0);
  const outstanding = live.filter((i) => !isPaid(i.status)).reduce((n, i) => n + i.amount, 0);

  return {
    paid: live.length > 0 && live.every((i) => isPaid(i.status)),
    invoiced,
    outstanding,
    count: live.length,
  };
}
