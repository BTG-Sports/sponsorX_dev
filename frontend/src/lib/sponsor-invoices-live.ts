/* --------------------------------------------------------------------------
   POL-FE-13 — the sponsor's invoices screen (/sponsor/invoices): every
   invoice BTG has sent them, its status, and how to pay it. Pure: the wire
   shapes, the words, the sort and the totals. No React, no fetch.

   The invoices are Zoho Books' own, MIRRORED (backend/src/domain/invoice.ts
   `invoicesForCampaign`, GET /campaigns/:id/invoices — the only invoice
   read a sponsor role may make; /earnings/invoices needs `earning` read,
   which a sponsor hasn't). Zoho's status string comes verbatim
   (draft | sent | overdue | paid | void, lowercased here), and the mirror
   carries no pay URL: the secure pay link lives in the invoice email Zoho
   sent, so "Pay" here opens a note to BTG's support address quoting the
   invoice number — never a link SponsorX would have to invent.
   -------------------------------------------------------------------------- */

import type { Word } from "@/lib/sponsor-words";

/** GET /campaigns/:id/invoices — one row, as Zoho last described it. */
export type ApiCampaignInvoice = {
  id: string;
  zohoInvoiceId: string;
  number: string | null;
  status: string;
  /** cents */
  amount: number;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  syncedAt: string;
};

export type InvoiceRow = ApiCampaignInvoice & { campaignId: string; campaign: string };

export type InvoiceStanding = "paid" | "overdue" | "due" | "draft" | "void";

const DAY = 24 * 60 * 60 * 1000;

/** Zoho's status, plus the calendar: a `sent` invoice past its due date is
 *  overdue here even before Zoho's own sweep says so. */
export function invoiceStanding(i: Pick<ApiCampaignInvoice, "status" | "dueAt">, now: Date): InvoiceStanding {
  const s = i.status.trim().toLowerCase();
  if (s === "paid") return "paid";
  if (s === "void") return "void";
  if (s === "draft") return "draft";
  if (s === "overdue") return "overdue";
  if (i.dueAt && new Date(i.dueAt).getTime() < now.getTime()) return "overdue";
  return "due";
}

/** The chip: Zoho's state in a sponsor's words (never the raw string). */
export function invoiceWord(standing: InvoiceStanding): Word {
  switch (standing) {
    case "paid": return { text: "Paid", tone: "done" };
    case "overdue": return { text: "Overdue", tone: "late" };
    case "due": return { text: "To pay", tone: "you" };
    case "draft": return { text: "Being prepared by BTG", tone: "info" };
    case "void": return { text: "Withdrawn", tone: "done" };
  }
}

/** A standing a sponsor still has to pay. */
export const toPay = (s: InvoiceStanding) => s === "due" || s === "overdue";

/** "INV-000042", or the Zoho id when Zoho gave no number yet. */
export function invoiceLabel(i: Pick<ApiCampaignInvoice, "number" | "zohoInvoiceId">): string {
  return i.number?.trim() || `Invoice ${i.zohoInvoiceId}`;
}

/** Days past due, for the overdue line; 0 when not past. */
export function daysOverdue(i: Pick<ApiCampaignInvoice, "dueAt">, now: Date): number {
  if (!i.dueAt) return 0;
  const past = now.getTime() - new Date(i.dueAt).getTime();
  return past > 0 ? Math.floor(past / DAY) : 0;
}

/**
 * The rows of the page: every campaign's invoices, withdrawn ones left out
 * (a void invoice is nothing a sponsor pays or paid), newest issued first,
 * and within a day by number so two reads print the same order.
 */
export function invoiceRows(campaigns: { id: string; name: string; invoices: ApiCampaignInvoice[] }[]): InvoiceRow[] {
  const rows: InvoiceRow[] = campaigns.flatMap((c) =>
    c.invoices.filter((i) => i.status.trim().toLowerCase() !== "void").map((i) => ({ ...i, campaignId: c.id, campaign: c.name })),
  );
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : -Infinity);
  return rows.sort((a, b) => t(b.issuedAt) - t(a.issuedAt) || invoiceLabel(a).localeCompare(invoiceLabel(b)));
}

export type InvoiceTotals = {
  /** Open invoices (sent or overdue): how many and how much. */
  owedCount: number;
  owedCents: number;
  overdueCount: number;
  paidCents: number;
};

/** The tiles — summed over the rows ON THIS PAGE, which the tile says. */
export function invoiceTotals(rows: readonly InvoiceRow[], now: Date): InvoiceTotals {
  const out: InvoiceTotals = { owedCount: 0, owedCents: 0, overdueCount: 0, paidCents: 0 };
  for (const r of rows) {
    const s = invoiceStanding(r, now);
    if (s === "paid") out.paidCents += r.amount;
    if (toPay(s)) {
      out.owedCount += 1;
      out.owedCents += r.amount;
    }
    if (s === "overdue") out.overdueCount += 1;
  }
  return out;
}

/**
 * "Pay": a note to BTG's support address with the invoice named, since the
 * secure Zoho pay link is in the invoice email and the mirror never has
 * it. Null for an invoice that isn't payable (paid, draft, withdrawn).
 */
export function payHref(i: InvoiceRow, standing: InvoiceStanding, supportEmail: string): string | null {
  if (!toPay(standing)) return null;
  const subject = `Paying ${invoiceLabel(i)} — ${i.campaign}`;
  const body = `Hello BTG,\n\nI'd like to pay ${invoiceLabel(i)} for ${i.campaign}. Please resend the invoice's pay link, or tell me how to pay it.\n\nThanks`;
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The sentence under the table: how paying works, in one line. */
export const HOW_TO_PAY = "Each invoice's secure pay link is in the email BTG sent with it. If you can't find the email, Pay here opens a note to BTG naming the invoice and they'll resend it.";
