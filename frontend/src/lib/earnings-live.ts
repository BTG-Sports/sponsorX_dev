import type { EarningState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   P7-FE-01 / P7-FE-02 — earnings as GET /earnings answers them, and the pure
   arithmetic both the athlete page and the finance workspace draw from.

   STATUS ONLY. No money moves through SponsorX in Phase 1: an earning's state
   is a record of where the payout is, not a transfer. There is no bank or tax
   field anywhere in this shape (§26, Addendum A6) — the API doesn't have one
   to send.

   CAREER TOTAL, HONESTLY. "Career earnings" is what the athlete's signed
   orders are worth (every earning raised, net of adjustments) EXCEPT disputed
   ones, which are not yet owed; the paid part is stated beside it rather than
   blended in, so "earned" never reads as "received".
   -------------------------------------------------------------------------- */

export type ApiEarning = {
  id: string;
  state: EarningState;
  taxYear: number;
  paidAt: string | null;
  reference: string | null;
  athlete: { id: string; displayName: string };
  order: {
    id: string;
    jobId: string;
    jobName: string;
    acceptedAt: string | null;
    campaignId: string;
    campaignName: string;
    sponsorName: string;
    deliverables: { verified: number; total: number };
  };
  /** cents, net of adjustments — absent where §7.1 denies it. */
  amount?: number;
  gross?: number;
  adjustment?: number;
  /** Finance / BTG only. */
  sellPrice?: number;
  commission?: number;
};

export type ApiReconciliation = {
  campaignId: string;
  name: string;
  sponsorName: string;
  contracted: number;
  invoiced: number;
  invoicePaid: number;
  earningsRaised: number;
  earningsPaid: number;
  invoices: {
    number: string | null;
    zohoInvoiceId: string;
    status: string;
    amount: number;
    paidAt: string | null;
    issuedAt: string | null;
    dueAt: string | null;
  }[];
};

export const STATES: EarningState[] = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"];

export function buckets(rows: ApiEarning[]): Record<EarningState, { amount: number; count: number }> {
  const out = Object.fromEntries(STATES.map((s) => [s, { amount: 0, count: 0 }])) as Record<
    EarningState,
    { amount: number; count: number }
  >;
  for (const r of rows) {
    out[r.state].amount += r.amount ?? 0;
    out[r.state].count += 1;
  }
  return out;
}

export function career(rows: ApiEarning[]): { raised: number; paid: number; onTheWay: number } {
  const b = buckets(rows);
  return {
    raised: STATES.filter((s) => s !== "DISPUTED").reduce((n, s) => n + b[s].amount, 0),
    paid: b.PAID.amount,
    onTheWay: b.APPROVED_FOR_PAYOUT.amount,
  };
}

/** Paid, by the month it was paid, for one year — twelve points. */
export function paidByMonth(rows: ApiEarning[], year: number): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  for (const r of rows) {
    if (r.state !== "PAID" || !r.paidAt) continue;
    const d = new Date(r.paidAt);
    if (d.getUTCFullYear() === year) months[d.getUTCMonth()] += r.amount ?? 0;
  }
  return months;
}

/** "Oct 20" — when this earning last changed that we know of. */
export function lastChange(r: ApiEarning): string {
  const iso = r.paidAt ?? r.order.acceptedAt;
  return iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "—";
}

/** The explorer's item shape (activity-explorer.tsx). */
export function toActivityItem(r: ApiEarning) {
  return {
    id: r.id,
    athlete: r.athlete.displayName,
    campaign: r.order.campaignName,
    jobId: r.order.jobId,
    jobName: r.order.jobName,
    amount: r.amount ?? 0,
    state: r.state,
    reference: r.reference,
    updatedAt: lastChange(r),
  };
}

/** Invoice age buckets for what is still owed (not paid, not void), by days
 *  past due — the aging panel. An invoice with no due date is "not yet due". */
export function agingBuckets(
  recon: ApiReconciliation[],
  now: Date,
): { label: string; value: number; display: string }[] {
  const labels = ["Not yet due", "1–30 days", "31–60 days", "> 60 days"];
  const sums = [0, 0, 0, 0];
  for (const c of recon) {
    for (const i of c.invoices) {
      const st = i.status.toLowerCase();
      if (st === "paid" || st === "void") continue;
      const late = i.dueAt ? Math.floor((now.getTime() - Date.parse(i.dueAt)) / 86_400_000) : -1;
      sums[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3] += i.amount;
    }
  }
  const total = sums.reduce((a, b) => a + b, 0);
  return labels.map((label, k) => ({
    label,
    value: total ? Math.round((100 * sums[k]) / total) : 0,
    display: `${(sums[k] / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
  }));
}
