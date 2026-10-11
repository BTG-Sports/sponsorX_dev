/* --------------------------------------------------------------------------
   Demo overview for the sponsor dashboard (P1-ART-23) — what anyone who is
   not a signed-in sponsor sees, under a "Sample data" pill. Shaped exactly
   like GET /sponsor/overview and kept coherent with the demo campaign list
   it sits above (`sponsorCampaigns` in lib/fixtures.ts): the campaign count,
   running count, delivery and contracted spend are that list's own sums.

   Deterministic — no Math.random, no `new Date()` — so the server render and
   the client islands (the trend chart, the count-ups) draw the same numbers.
   -------------------------------------------------------------------------- */

import { sponsorCampaigns } from "@/lib/fixtures";
import { pageParams, type PageInfo, type SearchParams } from "@/lib/list-query";
import { isBehind, type ApiCampaign } from "@/lib/sponsor-live";
import type { DailyPoint, RangeKey, SponsorOverview } from "@/lib/sponsor-overview-live";
import type { ApiSponsorRequest } from "@/lib/brief-status";

/** The shape of `/campaigns/summary` and `/briefs`'s `counts` — copied here
 *  (not imported from `server/`, a server-only layer) rather than shared, so
 *  the demo stays a plain, client-safe data module. */
type DemoCampaignSummary = {
  total: number;
  byState: Record<string, number>;
  active: number;
  athletes: number;
  behind: number;
  pacing: never[];
  contracted?: number;
  budget?: number;
};
type DemoBriefCounts = { all: number; held: number } & Partial<Record<"DRAFT" | "QUALIFIED" | "APPROVED" | "CAMPAIGN_CREATED" | "CLOSED", number>>;

const DAY = 86_400_000;
/** "Now" for the demo: a fixed instant, so every render agrees. */
const NOW = Date.UTC(2026, 9, 11, 14, 41);
export const DEMO_NOW = new Date(NOW);
const TODAY = Date.UTC(2026, 9, 11);
const iso = (t: number) => new Date(t).toISOString();
const isoDay = (t: number) => iso(t).slice(0, 10);

/** How the 30-day figures scale to each window, the points it draws and their bucket. */
const SHAPE: Record<RangeKey, { scale: number; points: number; step: number; bucket: "day" | "week" }> = {
  "7d": { scale: 0.24, points: 7, step: 1, bucket: "day" },
  "30d": { scale: 1, points: 30, step: 1, bucket: "day" },
  "90d": { scale: 2.7, points: 90, step: 1, bucket: "day" },
  all: { scale: 5.2, points: 26, step: 7, bucket: "week" },
};

/** A gentle upward curve with a weekly ripple, normalised so the points sum to `total`. */
function spread(total: number, points: number, phase: number): number[] {
  const w = Array.from({ length: points }, (_, i) => {
    const t = points === 1 ? 1 : i / (points - 1);
    return (0.7 + 0.6 * t) * (1 + 0.14 * Math.sin(i * 0.9 + phase));
  });
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((v) => Math.round((v / sum) * total));
  out[points - 1] += total - out.reduce((a, b) => a + b, 0); // rounding lands on the last point
  return out;
}

export function demoOverview(range: RangeKey = "30d"): SponsorOverview {
  const s = SHAPE[range];
  const k = (v: number) => Math.round(v * s.scale);
  const views = k(128_400);
  const clicks = k(2_315);
  const fans = { scan: k(1_940), landing: k(1_203), claim: k(736), redeem: k(412) };
  const allTimeViews = Math.round(128_400 * SHAPE.all.scale);
  const prev = range === "all" ? null : { verifiedViews: k(112_900), verifiedEngagements: k(9_140) };

  const v = spread(views, s.points, 0.3);
  const c = spread(clicks, s.points, 1.1);
  const r = spread(fans.redeem, s.points, 2.4);
  const first = TODAY - (s.points - 1) * s.step * DAY;
  const daily: DailyPoint[] = v.map((views, i) => ({ day: isoDay(first + i * s.step * DAY), views, clicks: c[i], redeems: r[i] }));

  const contractedCents = sponsorCampaigns.reduce((n, x) => n + x.spend, 0);
  const due = sponsorCampaigns.reduce((n, x) => n + x.deliverables[1], 0);
  const delivered = sponsorCampaigns.reduce((n, x) => n + x.deliverables[0], 0);

  return {
    readAt: iso(NOW),
    range: { key: range, from: iso(first), to: iso(TODAY + DAY), days: s.points * s.step, bucket: s.bucket },
    reach: {
      verifiedViews: views,
      verifiedEngagements: k(9_870),
      otherViews: k(6_200),
      prev,
      bySource: { VERIFIED_API: k(104_300), VERIFIED_MANUAL: k(24_100), SELF_REPORTED: k(6_200), ESTIMATED: 0, ATTRIBUTED: 0 },
    },
    clicks: { total: clicks, prev: range === "all" ? null : k(2_390) },
    fans: { ...fans, prevRedeem: range === "all" ? null : k(314) },
    daily,
    // today doesn't depend on the window: it's the 30-day series' last day, whatever the range
    today: { views: spread(128_400, 30, 0.3)[29], redeems: spread(412, 30, 2.4)[29] },
    delivery: { due, delivered, late: 2, nextDueAt: iso(TODAY + 3 * DAY + 17 * 3_600_000) },
    topAthletes: [
      { athleteId: "demo-a1", name: "Shammah Kwizera", sport: "Basketball", views: k(41_800) },
      { athleteId: "demo-a2", name: "Marcus Reed", sport: "Football", views: k(33_250) },
      { athleteId: "demo-a3", name: "Jalen Brooks", sport: "Track & field", views: k(18_900) },
    ],
    topCities: [
      { city: "Austin", region: "TX", redeems: k(164) },
      { city: "Houston", region: "TX", redeems: k(121) },
      { city: "San Antonio", region: "TX", redeems: k(77) },
    ],
    money: { contractedCents, invoicedCents: 1_820_000, paidCents: 1_310_000 },
    costPer1000Cents: Math.round((contractedCents * 1000) / allTimeViews),
    needsYou: { postsToReview: 2, ordersToPay: 1, invoicesUnpaid: 1 },
    campaigns: { total: sponsorCampaigns.length, running: sponsorCampaigns.filter((x) => x.state === "ACTIVE").length },
  };
}

/** Each demo campaign's window, around DEMO_NOW (c3 is the one running behind). */
const WINDOWS: Record<string, [string, string]> = {
  c1: ["2026-09-01", "2026-10-23"],
  c2: ["2026-08-01", "2026-10-05"],
  c3: ["2026-08-20", "2026-10-31"],
  c4: ["2026-06-01", "2026-07-31"],
  c5: ["2026-11-01", "2026-12-15"],
};
const DEMO_ORDER = { newest: (a: ApiCampaign, b: ApiCampaign) => b.startDate.localeCompare(a.startDate), name: (a: ApiCampaign, b: ApiCampaign) => a.name.localeCompare(b.name), ending: (a: ApiCampaign, b: ApiCampaign) => a.endDate.localeCompare(b.endDate) };

/** `sponsorCampaigns` as GET /campaigns rows — shared by `demoCampaignPage`
 *  and `demoCampaignSummary` so the Dashboard and the Campaigns page agree. */
function demoCampaignRows(): ApiCampaign[] {
  return sponsorCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    state: c.state,
    startDate: `${WINDOWS[c.id][0]}T00:00:00.000Z`,
    endDate: `${WINDOWS[c.id][1]}T00:00:00.000Z`,
    sponsorName: "Under Armour",
    package: { code: c.pkg.toUpperCase().replace(/\W+/g, "_"), name: c.pkg },
    athletes: c.athletes,
    deliverables: { done: c.deliverables[0], total: c.deliverables[1] },
    contracted: c.spend,
  }));
}

/** The demo campaigns as GET /campaigns rows, searched, filtered, ordered and
 *  paged the way the API does it — so the demo table behaves like the live
 *  one. `f.state` may be one state or, as the Campaigns page tab for
 *  "Finished" sends, a comma combo — the API's own `?state=A,B` shape. */
export function demoCampaignPage(sp: SearchParams, f: { q: string; state: string; sort: string }): { campaigns: ApiCampaign[]; page: PageInfo } {
  const states = f.state ? f.state.split(",") : [];
  const q = f.q.toLowerCase();
  const hits = demoCampaignRows()
    .filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!states.length || states.includes(c.state)))
    .sort(DEMO_ORDER[f.sort as keyof typeof DEMO_ORDER] ?? DEMO_ORDER.newest);
  const { page, size } = pageParams(sp);
  const pages = Math.max(1, Math.ceil(hits.length / size));
  const at = Math.min(page, pages);
  return { campaigns: hits.slice((at - 1) * size, at * size), page: { page: at, size, total: hits.length, pages } };
}

/** The Campaigns page's tile+tab counts (P1-ART-23 Task 9), shaped like
 *  `GET /campaigns/summary` — computed from the same fixture rows as
 *  `demoCampaignPage`, so a demo tile and a demo tab count always agree.
 *  Budget is a demo-only construct (Phase 1 fixtures hold no real budget
 *  figure): 18% of headroom over the contracted total, just to show the
 *  "Total budget" tile with a believable spent share. */
export function demoCampaignSummary(): DemoCampaignSummary {
  const rows = demoCampaignRows();
  const byState: Record<string, number> = {};
  for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1;
  const contracted = rows.reduce((n, r) => n + (r.contracted ?? 0), 0);
  return {
    total: rows.length,
    byState,
    active: byState.ACTIVE ?? 0,
    athletes: rows.reduce((n, r) => n + r.athletes, 0),
    behind: rows.filter((r) => isBehind(r, DEMO_NOW)).length,
    pacing: [],
    contracted,
    budget: Math.round(contracted * 1.18),
  };
}

/** Each demo request's created date, around DEMO_NOW. */
const REQUEST_ROWS: ApiSponsorRequest[] = [
  { id: "req1", state: "QUALIFIED", objective: "Spring footwear launch across DMV high schools", budget: 320_000, createdAt: iso(TODAY - 2 * DAY), package: null, campaign: null },
  { id: "req2", state: "DRAFT", objective: "Holiday gift-card push with five athletes", budget: 150_000, createdAt: iso(TODAY - DAY), package: null, campaign: null },
  { id: "req3", state: "APPROVED", objective: "Community Campaign refresh — fall semester", budget: 500_000, createdAt: iso(TODAY - 6 * DAY), package: { name: "Community Campaign" }, campaign: null },
  { id: "req4", state: "CAMPAIGN_CREATED", objective: "Player of the Week renewal", budget: 1_920_000, createdAt: iso(TODAY - 40 * DAY), package: { name: "Season Partner" }, campaign: { id: "c1", name: "Player of the Week", state: "ACTIVE" } },
  { id: "req5", state: "CAMPAIGN_CREATED", objective: "Skills Lab Series", budget: 250_000, createdAt: iso(TODAY - 70 * DAY), package: { name: "10-Athlete Blitz" }, campaign: { id: "c4", name: "Skills Lab Series", state: "COMPLETED" } },
  { id: "req6", state: "CLOSED", objective: "Winter pop-up tour", budget: 90_000, createdAt: iso(TODAY - 95 * DAY), package: null, campaign: null },
];

/** The demo requests as GET /briefs rows — searched, filtered to one state
 *  or a comma combo ("DRAFT,QUALIFIED" for "Being matched by BTG"), newest
 *  first and paged like the API; `counts` are always over every fixture
 *  row, never the filtered page, matching the API's own tab counts. */
export function demoRequestPage(sp: SearchParams, f: { q: string; state: string }): { requests: ApiSponsorRequest[]; page: PageInfo; counts: DemoBriefCounts } {
  const states = f.state ? f.state.split(",") : [];
  const q = f.q.toLowerCase();
  const hits = REQUEST_ROWS
    .filter((r) => (!q || r.objective.toLowerCase().includes(q)) && (!states.length || states.includes(r.state)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { page, size } = pageParams(sp);
  const pages = Math.max(1, Math.ceil(hits.length / size));
  const at = Math.min(page, pages);
  const counts: DemoBriefCounts = { all: REQUEST_ROWS.length, held: 0 };
  for (const r of REQUEST_ROWS) counts[r.state as keyof DemoBriefCounts] = (counts[r.state as keyof DemoBriefCounts] ?? 0) + 1;
  return { requests: hits.slice((at - 1) * size, at * size), page: { page: at, size, total: hits.length, pages }, counts };
}
