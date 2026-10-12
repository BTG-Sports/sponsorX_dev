/* The Treasury's read (P1-ART-25): GET /finance/overview's shape and the
   small pure helpers the page draws with. Server-side fetch lives in the
   page (apiFetch); nothing here touches the network. */
import { EARNING_COPY, type EarningState } from "@/lib/fixtures";

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];
export type { EarningState };
type Split = { athletes: number; properties: number; platform: number; management: number; processing: number; referral: number; reserve: number };
export type NeedsYou = {
  payouts: { count: number; cents: number; oldestAt: string | null };
  refunds: { count: number; cents: number; oldestAt: string | null };
  disputes: { count: number; cents: number };
  events: { count: number };
};

export type ApiFinanceOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  moneyIn: { cents: number; prev: number | null };
  paidOut: { cents: number; prev: number | null };
  owed: { cents: number };
  kept: { cents: number; prev: number | null; campaignCommission?: number };
  series: { day: string; inCents: number; outCents: number }[];
  split: Split;
  settled: { paidCents: number; owedCents: number; rate: number | null };
  earningsByState: Record<EarningState, { count: number; amount: number }>;
  needsYou: NeedsYou;
  invoices?: { invoicedCents: number; collectedCents: number; rate: number | null; aging: number[] };
};

export function rangeParam(sp: Record<string, string | string[] | undefined>): RangeKey {
  const v = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  return (RANGES as readonly string[]).includes(v ?? "") ? (v as RangeKey) : "30d";
}

/** Change vs the previous window as a fraction; null when there is nothing to compare. */
export function delta(now: number, prev: number | null): number | null {
  return prev === null || prev === 0 ? null : (now - prev) / prev;
}

export const needsYouTotal = (n: NeedsYou) => n.payouts.count + n.refunds.count + n.disputes.count + n.events.count;

const SPLIT_LABEL: Record<keyof Split, string> = {
  athletes: "Athletes", properties: "Properties", platform: "BTG platform fee", management: "BTG management fee",
  processing: "Card processing", referral: "Referrals", reserve: "Held in reserve",
};
export function splitRows(s: Split) {
  const total = Object.values(s).reduce((n, v) => n + Math.max(0, v), 0);
  return (Object.keys(SPLIT_LABEL) as (keyof Split)[])
    .map((key) => ({ key, label: SPLIT_LABEL[key], cents: s[key], share: total ? Math.max(0, s[key]) / total : 0 }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

/** "waited 2 days" / "waited 3 hours" / "waited 5 minutes"; "" without a time. */
export function waitedFor(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins >= 2 * 1440) return `waited ${Math.floor(mins / 1440)} days`;
  if (mins >= 1440) return "waited 1 day";
  if (mins >= 120) return `waited ${Math.floor(mins / 60)} hours`;
  if (mins >= 60) return "waited 1 hour";
  return `waited ${mins} minute${mins === 1 ? "" : "s"}`;
}

/** The steps athlete pay goes through, in order, in plain words; Held / Disputed
 *  set apart. Labels reuse the house's EARNING_COPY (fixtures.ts) rather than
 *  minting new ones. */
export const PAY_STEPS: { state: EarningState; label: string; off?: boolean }[] = [
  { state: "PENDING", label: EARNING_COPY.PENDING },
  { state: "ELIGIBLE", label: EARNING_COPY.ELIGIBLE },
  { state: "APPROVED_FOR_PAYOUT", label: EARNING_COPY.APPROVED_FOR_PAYOUT },
  { state: "PAID", label: EARNING_COPY.PAID },
  { state: "HELD", label: EARNING_COPY.HELD, off: true },
  { state: "DISPUTED", label: EARNING_COPY.DISPUTED, off: true },
];
