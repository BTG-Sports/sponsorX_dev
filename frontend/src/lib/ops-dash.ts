/* --------------------------------------------------------------------------
   POL-FE-105 — the admin dashboard's pure pieces. /admin is drawn as a
   card-grid dashboard on the Mission Control stage (components/ops-dash.tsx);
   every figure here comes from one of the board's live reads:

   - GET /operations/board            the queues waiting on BTG
   - GET /operations/delivery-health  live campaigns, deliverables done / due
   - GET /operations/analytics?days=  fan scans, claims and redemptions
   - GET /operations/network-metrics  active athletes, bookings, earnings
   - GET /operations/integration-health, GET /deliverables (review queue)

   Nothing is invented: a card whose read the role can't make is left out.
   -------------------------------------------------------------------------- */

import type { ApiDeliveryHealth, QueueCard } from "./ops-board-live";

/* ------------------------------------------------------------------ period */

/** The windows the fan numbers can cover; the queues and campaigns are always "now". */
export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: PeriodDays = 30;

/** `?days=7|30|90`; anything else is the default. */
export function parsePeriod(raw: string | string[] | undefined): PeriodDays {
  const v = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PERIODS as readonly number[]).includes(v) ? (v as PeriodDays) : DEFAULT_PERIOD;
}

const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Last 30 days (Oct 18 – Nov 17)". */
export function periodWords(days: number, from: string, to: string): string {
  return `Last ${days} days (${day(from)} – ${day(to)})`;
}

/* ----------------------------------------------------------------- changes */

/**
 * The change from the previous window, as a fraction (0.25 = up 25%).
 * Null when there is nothing to compare against (the previous window was
 * empty and this one isn't) — "up from nothing" has no percent.
 */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/* -------------------------------------------------------------- fan series */

export type ActivityPoint = { day: string; claims: number; redeems: number };

/**
 * The analytics series as chart points. Up to 31 days it is day by day; a
 * longer window is grouped into weeks, counted back from the latest day so
 * the newest week is whole (the oldest may be short). Each week is labelled
 * by its first day.
 */
export function activityPoints(series: { day: string; CLAIM: number; REDEEM: number }[]): { points: ActivityPoint[]; bucket: "day" | "week" } {
  const daily = series.map((s) => ({ day: s.day, claims: s.CLAIM, redeems: s.REDEEM }));
  if (daily.length <= 31) return { points: daily, bucket: "day" };
  const weeks: ActivityPoint[] = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const chunk = daily.slice(Math.max(0, end - 7), end);
    weeks.unshift({
      day: chunk[0]!.day,
      claims: chunk.reduce((n, p) => n + p.claims, 0),
      redeems: chunk.reduce((n, p) => n + p.redeems, 0),
    });
  }
  return { points: weeks, bucket: "week" };
}

/** The chart's axis top: four equal whole-number steps of 1, 2, 3 or 5 × 10ⁿ
 *  that reach `max` (0–4 when everything is 0), so every gridline label is exact. */
export function niceMax(max: number): number {
  const want = Math.max(1, max / 4);
  const p = 10 ** Math.floor(Math.log10(want));
  for (const m of [1, 2, 3, 5, 10]) if (m * p >= want) return m * p * 4;
  return 40 * p;
}

/* ---------------------------------------------------------------- delivery */

export type DeliverySummary = {
  /** Live campaigns the summary covers (the read's page, at most 100). */
  campaigns: number;
  due: number;
  done: number;
  overdue: number;
  /** Campaigns with at least one overdue deliverable. */
  behind: number;
  /** done / due, or null when nothing is due yet. */
  share: number | null;
};

export function deliverySummary(rows: ApiDeliveryHealth[]): DeliverySummary {
  const due = rows.reduce((n, r) => n + r.deliverablesTotal, 0);
  const done = rows.reduce((n, r) => n + r.deliverablesVerified, 0);
  return {
    campaigns: rows.length,
    due,
    done,
    overdue: rows.reduce((n, r) => n + r.deliverablesOverdue, 0),
    behind: rows.filter((r) => r.deliverablesOverdue > 0).length,
    share: due ? done / due : null,
  };
}

/* ----------------------------------------------------------------- network */

export type NetworkRead = {
  activeAthletes: number;
  participatingAthletes: number;
  participationRate: number;
  utilisationRate: number;
  totalEarnings: number;
  totalPaid: number;
};

export type AthleteSplit = { working: number; bookedBefore: number; notBooked: number; active: number };

/**
 * Active athletes in three parts that add up: working on a campaign now
 * (utilisation), booked before but not now (participation minus that), and
 * not booked yet. Utilisation comes back as a rate, so its count is rounded
 * and held inside participation.
 */
export function athleteSplit(n: NetworkRead): AthleteSplit {
  const active = Math.max(0, n.activeAthletes);
  const booked = Math.min(active, Math.max(0, n.participatingAthletes));
  const working = Math.min(booked, Math.max(0, Math.round(n.utilisationRate * active)));
  return { working, bookedBefore: booked - working, notBooked: active - booked, active };
}

/* ------------------------------------------------------------------- to-do */

/** The queues with something waiting, oldest wait first (the cards' order).
 *  An empty queue is not a to-do row. */
export function todoRows(cards: QueueCard[]): QueueCard[] {
  return cards.filter((c) => c.count > 0);
}

/* ---------------------------------------------------------------- formats */

/** "$12,450" from cents; "$1.2M" past a million so it fits a card. */
export function dollars(cents: number): string {
  const d = cents / 100;
  if (Math.abs(d) >= 1_000_000) return `$${(d / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `$${Math.round(d).toLocaleString("en-US")}`;
}

/** 0.4567 → "46%". */
export const pct = (share: number) => `${Math.round(share * 100)}%`;
