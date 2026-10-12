import { STATES, type ApiEarning, type ApiInvoiceRow } from "@/lib/earnings-live";
import type { ApiFinanceOverview } from "@/lib/finance-overview-live";
import { adminFinanceX, adminOps, earningItems, INVOICE_COPY, sponsorInvoices, type InvoiceStatus } from "@/lib/fixtures";
import { textParam, type SearchParams } from "@/lib/list-query";
import type { Books } from "./books";

/* --------------------------------------------------------------------------
   The Treasury's sample books and overview (P1-ART-25 split, 2026-10-12):
   every figure derived from the existing fixtures, in the live shapes, for
   ?demo= and signed-out visitors. Carved out of page.tsx (P1-ART-25 review,
   745 lines).
   -------------------------------------------------------------------------- */

const one = <T,>(n: T[]) => ({ page: 1, size: 12, total: n.length, pages: 1 });

/** A sample overview, every figure derived from the existing fixtures (no new
 *  literals): earnings by step from `earningItems`; money in one week per
 *  sample invoice (`sponsorInvoices`); money out the sample PAID earnings
 *  dealt across those weeks — the same earnings the Paid out tile sums, so
 *  the chart's Out and the tile never disagree (P1-ART-25 review); invoices
 *  from `adminOps` / `adminFinanceX`. Illustrative, and marked Sample. */
export function demoOverview(): ApiFinanceOverview {
  const byState = Object.fromEntries(
    STATES.map((st) => {
      const rows = earningItems.filter((e) => e.state === st);
      return [st, { count: rows.length, amount: rows.reduce((n, e) => n + e.amount, 0) }];
    }),
  ) as ApiFinanceOverview["earningsByState"];
  const raised = STATES.reduce((n, st) => n + byState[st].amount, 0);
  const paid = byState.PAID.amount;
  const owed = byState.PENDING.amount + byState.ELIGIBLE.amount + byState.APPROVED_FOR_PAYOUT.amount;
  const moneyIn = sponsorInvoices.reduce((n, i) => n + i.amount, 0);
  const now = new Date();
  const day = (weeksAgo: number) => new Date(now.getTime() - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10);
  const weeks = sponsorInvoices.length;
  const paidItems = earningItems.filter((e) => e.state === "PAID");
  return {
    readAt: now.toISOString(),
    range: { key: "30d", from: day(weeks), to: day(0), days: 30, bucket: "week" },
    moneyIn: { cents: moneyIn, prev: null },
    paidOut: { cents: paid, prev: null },
    owed: { cents: owed },
    kept: { cents: Math.max(0, moneyIn - raised), prev: null },
    series: sponsorInvoices.map((inv, i) => ({
      day: day(weeks - 1 - i),
      inCents: inv.amount,
      outCents: paidItems.filter((_, k) => k % weeks === i).reduce((n, e) => n + e.amount, 0),
    })),
    split: { athletes: raised, properties: 0, platform: Math.max(0, moneyIn - raised), management: 0, processing: 0, referral: 0, reserve: 0 },
    settled: { paidCents: paid, owedCents: owed, rate: paid + owed > 0 ? paid / (paid + owed) : null },
    earningsByState: byState,
    needsYou: {
      payouts: { count: byState.APPROVED_FOR_PAYOUT.count, cents: byState.APPROVED_FOR_PAYOUT.amount, oldestAt: null },
      refunds: { count: 0, cents: 0, oldestAt: null },
      disputes: { count: byState.DISPUTED.count, cents: byState.DISPUTED.amount },
      events: { count: 0 },
    },
    invoices: {
      invoicedCents: adminOps.invoicedCents,
      collectedCents: adminOps.collectedCents,
      rate: adminFinanceX.collectionRatePct,
      aging: adminFinanceX.aging.map((a) => a.value),
    },
  };
}

/** The sample books: the earnings and invoice fixtures in the live shapes. The
 *  sample data has no per-campaign reconciliation, so the sample has no By
 *  campaign tab and ?tab=campaigns reads as the earnings one. */
export function demoBooks(sp: SearchParams): Books {
  const tab = textParam(sp, "tab") === "invoices" ? "invoices" : "earnings";
  if (tab === "invoices") {
    const invoices = sponsorInvoices.map((i) => ({
      zohoInvoiceId: i.id,
      number: i.ref,
      status: INVOICE_COPY[i.status as InvoiceStatus],
      amount: i.amount,
      sponsor: i.sponsor,
      campaign: i.campaign,
    })) as unknown as ApiInvoiceRow[];
    return { tab, invoices: { invoices, page: one(invoices) } };
  }
  const earnings = earningItems.map((e) => ({
    id: e.id,
    state: e.state,
    amount: e.amount,
    reference: e.reference,
    athlete: { displayName: e.athlete },
    order: { campaignName: e.campaign, jobId: e.jobId },
  })) as unknown as ApiEarning[];
  return { tab, earnings: { earnings, page: one(earnings) } };
}
