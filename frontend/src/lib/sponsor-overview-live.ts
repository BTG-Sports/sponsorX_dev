/* --------------------------------------------------------------------------
   The sponsor dashboard's overview read (P1-ART-23): GET /sponsor/overview
   (backend/src/domain/sponsor-overview.ts) — the type, copied verbatim, and
   the pure helpers the page draws from it. Data in, plain words out.
   -------------------------------------------------------------------------- */

import type { SearchParams } from "@/lib/list-query";

export type MetricSource = "VERIFIED_API" | "VERIFIED_MANUAL" | "SELF_REPORTED" | "ESTIMATED" | "ATTRIBUTED";

export const RANGE_KEYS = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type DailyPoint = { day: string; views: number; clicks: number; redeems: number };

export type SponsorOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  reach: {
    verifiedViews: number;
    verifiedEngagements: number;
    otherViews: number;
    prev: { verifiedViews: number; verifiedEngagements: number } | null;
    bySource: Record<MetricSource, number>;
  };
  clicks: { total: number; prev: number | null };
  fans: { scan: number; landing: number; claim: number; redeem: number; prevRedeem: number | null };
  daily: DailyPoint[];
  today: { views: number; redeems: number };
  delivery: { due: number; delivered: number; late: number; nextDueAt: string | null };
  topAthletes: { athleteId: string; name: string; sport: string | null; views: number }[];
  topCities: { city: string; region: string | null; redeems: number }[];
  /** Absent when the role can't read campaign value; invoiced / paid absent when it can't read invoices. */
  money?: { contractedCents: number; invoicedCents?: number; paidCents?: number };
  costPer1000Cents: number | null;
  /** POL-BE-71 — requestsInReview: the sponsor's requests BTG is still looking at. */
  needsYou: { postsToReview: number; ordersToPay: number; invoicesUnpaid?: number; requestsInReview?: number };
  /** POL-BE-72 — false while card payment is closed. Absent on an older API. */
  paymentsOpen?: boolean;
  campaigns: { total: number; running: number };
};

export type NeedsYouItem = { key: string; title: string; sub: string; count: number; href: string };

/** The "Needs you" rows: things that can't move until the sponsor acts. */
export function needsYouItems(n: SponsorOverview["needsYou"], paymentsOpen?: boolean): NeedsYouItem[] {
  /* POL-FE-72 — while card payment is closed an approved order isn't the sponsor's move. */
  const orders = paymentsOpen === false
    ? { key: "orders", title: "Approved orders", sub: "Card payment isn't open yet — BTG tells you when you can pay", count: n.ordersToPay, href: "/sponsor/orders?tab=to_pay" }
    : { key: "orders", title: "Orders to pay", sub: "Approved and ready for payment", count: n.ordersToPay, href: "/sponsor/orders?tab=to_pay" };
  return [
    { key: "posts", title: "Posts waiting for your OK", sub: "Open a running campaign to look at them", count: n.postsToReview, href: "/sponsor/campaigns?review=1" },
    orders,
    /* POL-FE-13 — opens the invoices screen, where each one can be paid. */
    ...(n.invoicesUnpaid !== undefined ? [{ key: "invoices", title: "Invoices to pay", sub: "Sent to you by BTG", count: n.invoicesUnpaid, href: "/sponsor/invoices" }] : []),
  ];
}

/** POL-FE-71 — a sponsor with no campaign yet can still have a Shop order on
 *  its pay-by clock, or a request with BTG. The empty dashboard shows these
 *  above "No campaigns yet" instead of hiding them. */
export function emptyDashboardRows(n: SponsorOverview["needsYou"], paymentsOpen?: boolean): NeedsYouItem[] {
  const rows = needsYouItems(n, paymentsOpen).filter((i) => i.count > 0);
  if (n.requestsInReview) {
    rows.push({
      key: "requests",
      title: n.requestsInReview === 1 ? "1 request with BTG" : `${n.requestsInReview} requests with BTG`,
      sub: "BTG is reviewing it — nothing to do yet. Open it to see where it is.",
      count: n.requestsInReview,
      href: "/sponsor/requests",
    });
  }
  return rows;
}

/** ?range — one of the four windows; anything else is the default 30 days. */
export function rangeParam(sp: SearchParams): RangeKey {
  const v = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  return (RANGE_KEYS as readonly string[]).includes(v ?? "") ? (v as RangeKey) : "30d";
}

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** The LED ticker's facts, in plain words; any zero fact is left out. */
export function tickerFacts(o: SponsorOverview): string[] {
  const facts: string[] = [];
  if (o.campaigns.running) facts.push(`${plural(o.campaigns.running, "campaign", "campaigns")} running`);
  if (o.today.views) facts.push(`${n(o.today.views)} people reached today`);
  if (o.needsYou.postsToReview) facts.push(`${plural(o.needsYou.postsToReview, "post", "posts")} waiting for your OK`);
  if (o.today.redeems) facts.push(`${plural(o.today.redeems, "fan", "fans")} redeemed today`);
  if (o.topCities[0]) facts.push(`Top city: ${o.topCities[0].city}`);
  return facts;
}

/** The "Money spent" tile: invoiced, paid, what's still owed and the paid
 *  share. Null when the role can't read invoices — the tile then makes way
 *  for "Posts delivered" rather than show a figure the API withheld. */
export function campaignMoney(
  m: SponsorOverview["money"],
): { invoicedCents: number; paidCents: number; owedCents: number; share: number } | null {
  if (!m || m.invoicedCents === undefined) return null;
  const invoicedCents = m.invoicedCents;
  const paidCents = m.paidCents ?? 0;
  return { invoicedCents, paidCents, owedCents: Math.max(0, invoicedCents - paidCents), share: invoicedCents ? paidCents / invoicedCents : 0 };
}
