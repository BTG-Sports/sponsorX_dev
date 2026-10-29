import { describe, expect, it } from "vitest";

import {
  daysOverdue,
  invoiceLabel,
  invoiceRows,
  invoiceStanding,
  invoiceTotals,
  invoiceWord,
  payHref,
  toPay,
  type ApiCampaignInvoice,
} from "@/lib/sponsor-invoices-live";

/* POL-FE-13 — the sponsor's invoices screen: Zoho's mirrored rows in a
   sponsor's words, newest first, with the page's totals and a way to pay. */

const NOW = new Date("2026-10-29T12:00:00.000Z");

const inv = (over: Partial<ApiCampaignInvoice> & { id: string }): ApiCampaignInvoice => ({
  zohoInvoiceId: `zoho-${over.id}`,
  number: null,
  status: "sent",
  amount: 100_000,
  currency: "USD",
  issuedAt: "2026-10-01T00:00:00.000Z",
  dueAt: "2026-10-31T00:00:00.000Z",
  paidAt: null,
  syncedAt: "2026-10-29T00:00:00.000Z",
  ...over,
});

describe("standing and words", () => {
  it("reads Zoho's status, whatever its case, and the calendar", () => {
    expect(invoiceStanding(inv({ id: "a", status: "Paid" }), NOW)).toBe("paid");
    expect(invoiceStanding(inv({ id: "b", status: "VOID" }), NOW)).toBe("void");
    expect(invoiceStanding(inv({ id: "c", status: "draft" }), NOW)).toBe("draft");
    expect(invoiceStanding(inv({ id: "d", status: "overdue" }), NOW)).toBe("overdue");
    expect(invoiceStanding(inv({ id: "e", status: "sent" }), NOW)).toBe("due");
    /* Sent but past its due date is overdue here before Zoho's sweep says so. */
    expect(invoiceStanding(inv({ id: "f", status: "sent", dueAt: "2026-10-20T00:00:00.000Z" }), NOW)).toBe("overdue");
    expect(invoiceStanding(inv({ id: "g", status: "sent", dueAt: null }), NOW)).toBe("due");
  });

  it("every standing is in a sponsor's words, never Zoho's string", () => {
    expect(invoiceWord("due")).toEqual({ text: "To pay", tone: "you" });
    expect(invoiceWord("overdue")).toEqual({ text: "Overdue", tone: "late" });
    expect(invoiceWord("paid")).toEqual({ text: "Paid", tone: "done" });
    expect(invoiceWord("draft").text).toBe("Being prepared by BTG");
    expect(invoiceWord("void").text).toBe("Withdrawn");
    expect(toPay("due")).toBe(true);
    expect(toPay("overdue")).toBe(true);
    expect(toPay("paid")).toBe(false);
    expect(toPay("draft")).toBe(false);
  });

  it("labels by Zoho's number, or the Zoho id before one is issued; counts days late", () => {
    expect(invoiceLabel({ number: "INV-000042", zohoInvoiceId: "z1" })).toBe("INV-000042");
    expect(invoiceLabel({ number: "  ", zohoInvoiceId: "z1" })).toBe("Invoice z1");
    expect(daysOverdue({ dueAt: "2026-10-20T00:00:00.000Z" }, NOW)).toBe(9);
    expect(daysOverdue({ dueAt: "2026-10-31T00:00:00.000Z" }, NOW)).toBe(0);
    expect(daysOverdue({ dueAt: null }, NOW)).toBe(0);
  });
});

describe("the rows and the totals", () => {
  const campaigns = [
    { id: "c1", name: "Spring push", invoices: [inv({ id: "a", number: "INV-2", issuedAt: "2026-10-05T00:00:00.000Z" }), inv({ id: "v", status: "void" })] },
    { id: "c2", name: "Fall launch", invoices: [inv({ id: "b", number: "INV-1", issuedAt: "2026-10-05T00:00:00.000Z", status: "paid", paidAt: "2026-10-10T00:00:00.000Z", amount: 50_000 }), inv({ id: "c", number: "INV-3", issuedAt: "2026-10-20T00:00:00.000Z", status: "sent", dueAt: "2026-10-25T00:00:00.000Z", amount: 25_000 }), inv({ id: "n", issuedAt: null, status: "draft" })] },
  ];

  it("flattens every campaign's invoices, drops withdrawn ones, newest issued first, then by number", () => {
    const rows = invoiceRows(campaigns);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a", "n"]);
    expect(rows[0]).toMatchObject({ campaignId: "c2", campaign: "Fall launch" });
  });

  it("totals the page: owed (sent + overdue), overdue count, paid", () => {
    expect(invoiceTotals(invoiceRows(campaigns), NOW)).toEqual({ owedCount: 2, owedCents: 125_000, overdueCount: 1, paidCents: 50_000 });
    expect(invoiceTotals([], NOW)).toEqual({ owedCount: 0, owedCents: 0, overdueCount: 0, paidCents: 0 });
  });

  it("Pay opens a note to BTG naming the invoice — only for one that can be paid", () => {
    const rows = invoiceRows(campaigns);
    const due = rows.find((r) => r.id === "c")!;
    const href = payHref(due, "overdue", "support@sponsorx.net")!;
    expect(href.startsWith("mailto:support@sponsorx.net?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toMatch(/Paying INV-3 — Fall launch/);
    expect(payHref(rows.find((r) => r.id === "b")!, "paid", "support@sponsorx.net")).toBeNull();
    expect(payHref(rows.find((r) => r.id === "n")!, "draft", "support@sponsorx.net")).toBeNull();
  });
});
