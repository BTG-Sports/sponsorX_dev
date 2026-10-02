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
  /** 2S5-BE-08 — approved for payout by the rule, as it became ELIGIBLE. Optional: older reads. */
  approvedAutomatically?: boolean;
  /** Why it was left ELIGIBLE for Finance — Finance and BTG admin only. */
  reviewReasons?: string[];
};

/**
 * 2S5-FE-06 — Finance's note on a Phase 1 earning: "Approved automatically"
 * on one the rule approved (and still approved or paid), the reasons on one
 * left ELIGIBLE for Finance. Pure.
 */
export function earningApprovalNote(e: Pick<ApiEarning, "state" | "approvedAutomatically" | "reviewReasons">): { badge: string | null; reasons: string[] } {
  const badge = e.approvedAutomatically && (e.state === "APPROVED_FOR_PAYOUT" || e.state === "PAID") ? "Approved automatically" : null;
  const reasons = e.state === "ELIGIBLE" ? (e.reviewReasons ?? []) : [];
  return { badge, reasons };
}

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
  const sums = [0, 0, 0, 0];
  for (const c of recon) {
    for (const i of c.invoices) {
      const st = i.status.toLowerCase();
      if (st === "paid" || st === "void") continue;
      const late = i.dueAt ? Math.floor((now.getTime() - Date.parse(i.dueAt)) / 86_400_000) : -1;
      sums[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3] += i.amount;
    }
  }
  return agingRows(sums);
}

/** The aging panel's rows from the four bucket sums (cents) — what
 *  GET /earnings/reconciliation's `totals.aging` answers. */
export function agingRows(sums: number[]): { label: string; value: number; display: string }[] {
  const labels = ["Not yet due", "1–30 days", "31–60 days", "> 60 days"];
  const total = sums.reduce((a, b) => a + b, 0);
  return labels.map((label, k) => ({
    label,
    value: total ? Math.round((100 * (sums[k] ?? 0)) / total) : 0,
    display: `${((sums[k] ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
  }));
}

/* --------------------------------------------------------------------------
   Server-paged reads (2026-09-29). The pages no longer fetch every earning
   and total it in the browser: the list is one page (GET /earnings?page=),
   the totals come from GET /earnings/summary, and Finance's reconciliation
   and invoice tables are their own paged routes. A figure the API withheld
   is ABSENT from these shapes, never 0.
   -------------------------------------------------------------------------- */

export type ApiPage = { page: number; size: number; total: number; pages: number };

export type ApiEarningsSummary = {
  count: number;
  byState: Record<EarningState, { count: number; amount?: number }>;
  deliverables: { verified: number; total: number };
  jobNames: string[];
  career?: { raised: number; paid: number; onTheWay: number };
  paidByMonth?: { year: number; months: number[] };
  sell?: { sellPrice: number; commission: number };
};

export type ApiReconciliationPage = {
  campaigns: ApiReconciliation[];
  page: ApiPage;
  totals: { invoiced: number; collected: number; rate: number | null; aging: number[] };
};

export type ApiInvoiceRow = ApiReconciliation["invoices"][number] & {
  campaignId: string;
  campaign: string;
  sponsor: string;
};

/** The summary's per-state figures in `buckets()`'s shape (a withheld
 *  amount reads as 0 here — only for drawing, never re-sent). */
export function summaryBuckets(s: ApiEarningsSummary): Record<EarningState, { amount: number; count: number }> {
  return Object.fromEntries(
    STATES.map((st) => [st, { amount: s.byState[st]?.amount ?? 0, count: s.byState[st]?.count ?? 0 }]),
  ) as Record<EarningState, { amount: number; count: number }>;
}

/** `?page=&size=` plus every non-empty extra, for a paged API route. */
export function pagedQuery(p: { page: number; size: number }, extras: Record<string, string> = {}): string {
  const u = new URLSearchParams({ page: String(p.page), size: String(p.size) });
  for (const [k, v] of Object.entries(extras)) if (v) u.set(k, v);
  return `?${u}`;
}

const MONTH_CODES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The explorer's URL date ("May-10") as the API's day ("2026-05-10") in
 *  `year`, or "" when it isn't one. */
export function codeToDay(code: string, year: number): string {
  const m = /^([A-Za-z]{3})-(\d{1,2})$/.exec(code);
  if (!m) return "";
  const mon = MONTH_CODES.indexOf(m[1]!.slice(0, 1).toUpperCase() + m[1]!.slice(1).toLowerCase());
  const day = Number(m[2]);
  if (mon < 0 || day < 1 || new Date(Date.UTC(year, mon, day)).getUTCMonth() !== mon) return "";
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The API extras for the athlete activity list, from the explorer's URL
 *  (?q ?status ?type ?from ?to). `to` without a valid `from` is dropped, as
 *  the explorer drops it; a lone `from` is that single day. */
export function activityExtras(
  f: { q: string; status: string; type: string; from: string; to: string },
  year: number,
): Record<string, string> {
  const from = codeToDay(f.from, year);
  let to = from ? codeToDay(f.to, year) : "";
  if (from && (!to || to < from)) to = from;
  return {
    q: f.q.trim(),
    state: (STATES as string[]).includes(f.status) ? f.status : "",
    type: f.type.trim(),
    from,
    to,
  };
}
