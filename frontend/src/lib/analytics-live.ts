import type { AnalyticsDataset, AthleteLeaderRow } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   P6-FE-03 / P7-FE-04 — the analytics story's live translation:
   GET /operations/analytics?days= → the dataset shape the story renders.
   Pure. One entry per range pill (7d / 30d / 90d).

   Honesty rules carried into the shape:
   - Deltas compare against the previous window of the same length; with no
     previous events the delta is "new", never an invented percentage.
   - There is no attributed-revenue source in Phase 1, so live `revenue` is
     null and the story swaps that KPI for unredeemed claims (a real count).
   - An athlete's reach shows the best provenance they have — verified if
     any, else self-reported, else estimated — with its label; engagement is
     computed within that same provenance, never across two.
   - Unscored athletes carry score null (a dashed ring), never 0.
   -------------------------------------------------------------------------- */

export type Funnel = { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
type Sourced = { verified: number; selfReported: number; estimated: number };

export type ApiAnalytics = {
  days: number;
  from: string;
  to: string;
  funnel: Funnel;
  previous: Funnel;
  series: { day: string; CLAIM: number; REDEEM: number }[];
  locations: { place: string; scans: number }[];
  offers: { rewardId: string; offer: string; sponsor: string; redeemed: number; claims: number }[];
  athletes: {
    athleteId: string;
    name: string;
    sport: string;
    school: string | null;
    scans: number;
    claims: number;
    redeemed: number;
    views: Sourced;
    engagements: Sourced;
    clicks: number;
    reliability: { onTime: number; due: number } | null;
    revisionRate: { revisions: number; submitted: number } | null;
    score: number | null;
  }[];
};

export type LiveAthleteRow = Omit<AthleteLeaderRow, "score" | "source"> & {
  score: number | null;
  source: "VERIFIED_MANUAL" | "SELF_REPORTED" | "ESTIMATED" | null;
  clicks: number;
  /** Whole percent on time, null when nothing was due. */
  reliability: number | null;
  /** Revisions per submitted deliverable, to one place; null with none submitted. */
  revisionRate: number | null;
};

export type LiveStory = {
  dataset: Omit<AnalyticsDataset, "revenue"> & { revenue: null; unredeemed: number };
  locations: { place: string; pct: number }[];
  athletes: LiveAthleteRow[];
};

const LABELS: Record<number, string> = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };
const BLURBS = ["fan opened the QR", "reward page loaded", "reward saved to phone", "shown at the venue"];

/** "12.5%", "−4%", "new" (nothing to compare), "0%". */
export function delta(now: number, before: number): string {
  if (before === 0) return now === 0 ? "0%" : "new";
  const pct = ((now - before) / before) * 100;
  const r = Math.round(pct * 10) / 10;
  return r < 0 ? `−${Math.abs(r)}%` : `${r}%`;
}

function reach(v: Sourced): { views: number; source: LiveAthleteRow["source"]; key: keyof Sourced | null } {
  /* The backend's "verified" bucket is VERIFIED_API + VERIFIED_MANUAL summed
     (reward-analytics.ts bucket()), so one badge must show the weakest part —
     "verified · manual" — never "verified · platform" (taxonomy §4.2,
     P7-QA-02). Splitting the bucket server-side would let API-only rows earn
     the stronger label. */
  if (v.verified > 0) return { views: v.verified, source: "VERIFIED_MANUAL", key: "verified" };
  if (v.selfReported > 0) return { views: v.selfReported, source: "SELF_REPORTED", key: "selfReported" };
  if (v.estimated > 0) return { views: v.estimated, source: "ESTIMATED", key: "estimated" };
  return { views: 0, source: null, key: null };
}

export function toLiveStory(a: ApiAnalytics): LiveStory {
  const f = a.funnel;
  let claims = 0;
  let redeems = 0;
  const series = a.series.map((p) => {
    claims += p.CLAIM;
    redeems += p.REDEEM;
    return {
      label: new Date(`${p.day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      a: redeems,
      b: claims,
    };
  });
  const totalScans = a.locations.reduce((n, l) => n + l.scans, 0);

  return {
    dataset: {
      label: LABELS[a.days] ?? `Last ${a.days} days`,
      funnel: [
        { stage: "Scan", value: f.SCAN, blurb: BLURBS[0] },
        { stage: "Landing", value: f.LANDING, blurb: BLURBS[1] },
        { stage: "Claim", value: f.CLAIM, blurb: BLURBS[2] },
        { stage: "Redeem", value: f.REDEEM, blurb: BLURBS[3] },
      ],
      deltas: {
        scans: delta(f.SCAN, a.previous.SCAN),
        claims: delta(f.CLAIM, a.previous.CLAIM),
        redeemed: delta(f.REDEEM, a.previous.REDEEM),
        revenue: "—",
      },
      revenue: null,
      unredeemed: Math.max(0, f.CLAIM - f.REDEEM),
      series,
      offers: a.offers.filter((o) => o.redeemed > 0 || o.claims > 0).map((o) => ({ id: o.rewardId, offer: `${o.offer} · ${o.sponsor}`, count: o.redeemed })),
      athleteFactor: 1,
    },
    locations: a.locations.map((l) => ({
      place: l.place,
      pct: totalScans ? Math.round((100 * l.scans) / totalScans) : 0,
    })),
    athletes: a.athletes.map((x) => {
      const r = reach(x.views);
      const eng = r.key ? x.engagements[r.key] : 0;
      return {
        name: x.name,
        sport: [x.sport, x.school].filter(Boolean).join(" · "),
        views: r.views,
        engagement: r.views ? Math.round((1000 * eng) / r.views) / 10 : 0,
        claims: x.claims,
        redeemed: x.redeemed,
        score: x.score,
        source: r.source,
        clicks: x.clicks,
        reliability: x.reliability && x.reliability.due ? Math.round((100 * x.reliability.onTime) / x.reliability.due) : null,
        revisionRate: x.revisionRate && x.revisionRate.submitted
          ? Math.round((10 * x.revisionRate.revisions) / x.revisionRate.submitted) / 10
          : null,
      };
    }),
  };
}
