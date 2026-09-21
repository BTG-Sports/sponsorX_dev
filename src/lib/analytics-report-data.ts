import {
  analyticsRanges,
  athleteLeaderboard,
  topLocations,
  type RangeKey,
} from "@/lib/fixtures";
import {
  athleteInsight,
  funnelInsight,
  headlineInsight,
  locationInsight,
  offerInsight,
  type Insight,
} from "@/lib/analytics-insights";

/* --------------------------------------------------------------------------
   AdminAnalyticsReport — the serializable model behind "Export report" on
   the admin analytics guided story. Same contract as SponsorReport /
   CampaignRoiReport / AthleteEarningsReport: built from the exact fixtures
   and insight derivations the page renders (so the report can never
   disagree with the screen), printed with every §22 provenance label
   intact. Built CLIENT-side (unlike the other three) because the range
   pills are client state — you export the range you are looking at.
   -------------------------------------------------------------------------- */

export type AdminAnalyticsReport = {
  meta: {
    title: string;
    period: string;
    presentedBy: string;
    /** Download filename without extension. */
    fileStem: string;
    footnote: string;
  };
  kpis: {
    label: string;
    value: number;
    /** count → integer; money → value is cents. */
    kind: "count" | "money";
    /** Display delta vs previous period, e.g. "+18.2%"; null for derived rows. */
    delta: string | null;
    source: string;
  }[];
  /** The page's five computed insight sentences, flattened. */
  findings: string[];
  funnel: {
    stages: {
      stage: string;
      blurb: string;
      count: number;
      /** Conversion from the previous stage (fraction); null for Scan. */
      fromPrev: number | null;
      /** Cumulative conversion from Scan (fraction). */
      ofScans: number;
      /** Fans lost vs the previous stage; null for Scan. */
      dropOff: number | null;
    }[];
    /** Scan → Redeem (fraction). */
    overallRate: number;
    /** Stage with the lowest step conversion. */
    weakestStage: string;
  };
  trend: {
    label: string;
    claims: number;
    redemptions: number;
    /** redemptions / claims at this point (fraction). */
    rate: number;
    /** claims − redemptions at this point. */
    gap: number;
  }[];
  locations: { place: string; share: number }[]; // fraction of scans
  offers: {
    offer: string;
    redemptions: number;
    /** Fraction of the funnel's TOTAL redemptions (not of the listed top offers). */
    share: number;
  }[];
  athletes: {
    rows: {
      name: string;
      sport: string;
      /** §22 data-quality label for views/engagement. */
      quality: string;
      views: number;
      engagementPct: number;
      claims: number;
      redemptions: number;
      /** redemptions / claims (fraction). */
      conversion: number;
      score: number;
    }[];
    totals: {
      views: number;
      claims: number;
      redemptions: number;
      /** Roster-average conversion (fraction). */
      conversion: number;
    };
  };
  methodology: string[];
};

const QUALITY: Record<string, string> = {
  VERIFIED_API: "verified",
  SELF_REPORTED: "self-reported",
  ESTIMATED: "estimated",
};

const flat = (i: Insight) => `${i.pre}${i.hot}${i.post}`;

export function buildAnalyticsReport(range: RangeKey): AdminAnalyticsReport {
  const d = analyticsRanges[range];
  const scan = d.funnel[0].value;
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;

  const athletes = athleteLeaderboard.map((a) => ({
    ...a,
    views: Math.round(a.views * d.athleteFactor),
    claims: Math.round(a.claims * d.athleteFactor),
    redeemed: Math.round(a.redeemed * d.athleteFactor),
  }));
  const totViews = athletes.reduce((s, a) => s + a.views, 0);
  const totClaims = athletes.reduce((s, a) => s + a.claims, 0);
  const totRedeemed = athletes.reduce((s, a) => s + a.redeemed, 0);

  let weakest = 1;
  for (let i = 2; i < d.funnel.length; i++) {
    const rate = d.funnel[i].value / d.funnel[i - 1].value;
    if (rate < d.funnel[weakest].value / d.funnel[weakest - 1].value)
      weakest = i;
  }

  return {
    meta: {
      title: "Fan & Reward Analytics",
      period: d.label,
      presentedBy: "BTG Sports Group",
      fileStem: `SponsorX-Analytics-Report-${d.label.replace(/\s+/g, "-")}`,
      footnote:
        "Demo dataset — figures shaped to §16 RewardEvent rows, platform metric APIs and Zoho Books, provenance-labelled per §22.",
    },
    kpis: [
      { label: "QR scans", value: scan, kind: "count", delta: `+${d.deltas.scans}`, source: "POSTGRES · §16 scan events" },
      { label: "Offers claimed", value: claims, kind: "count", delta: `+${d.deltas.claims}`, source: "POSTGRES · §16 claim events" },
      { label: "Rewards redeemed", value: redeemed, kind: "count", delta: `+${d.deltas.redeemed}`, source: "POSTGRES · §16 redeem events" },
      { label: "Unredeemed claims", value: claims - redeemed, kind: "count", delta: null, source: "Derived — claims − redemptions" },
      { label: "Revenue attributed", value: d.revenue * 100, kind: "money", delta: `+${d.deltas.revenue}`, source: "ATTRIBUTED · merchant-validated coupons (§16)" },
    ],
    findings: [
      headlineInsight(d),
      funnelInsight(d),
      locationInsight(topLocations),
      offerInsight(d),
      athleteInsight(athletes),
    ].map(flat),
    funnel: {
      stages: d.funnel.map((s, i) => ({
        stage: s.stage,
        blurb: s.blurb,
        count: s.value,
        fromPrev: i === 0 ? null : s.value / d.funnel[i - 1].value,
        ofScans: s.value / scan,
        dropOff: i === 0 ? null : d.funnel[i - 1].value - s.value,
      })),
      overallRate: redeemed / scan,
      weakestStage: d.funnel[weakest].stage,
    },
    trend: d.series.map((p) => ({
      label: p.label,
      claims: p.b,
      redemptions: p.a,
      rate: p.a / p.b,
      gap: p.b - p.a,
    })),
    locations: topLocations.map((l) => ({ place: l.place, share: l.pct / 100 })),
    offers: d.offers.map((o) => ({
      offer: o.offer,
      redemptions: o.count,
      share: o.count / redeemed,
    })),
    athletes: {
      rows: athletes.map((a) => ({
        name: a.name,
        sport: a.sport,
        quality: QUALITY[a.source] ?? a.source,
        views: a.views,
        engagementPct: a.engagement,
        claims: a.claims,
        redemptions: a.redeemed,
        conversion: a.redeemed / a.claims,
        score: a.score,
      })),
      totals: {
        views: totViews,
        claims: totClaims,
        redemptions: totRedeemed,
        conversion: totRedeemed / totClaims,
      },
    },
    methodology: [
      "Scan, landing, claim and redeem are separate §16 RewardEvent rows in Postgres — each funnel stage is a count of real events, never an estimate.",
      "Revenue is ATTRIBUTED through merchant-validated coupon redemptions, never payment-network data (§16); it is reported beside the counts and never summed with any other value.",
      "Athlete views and engagement come from platform APIs and carry a per-row data-quality label (verified / self-reported / estimated) per §22; claims and redemptions per athlete are our own event rows.",
      "Locations are resolved in the background worker at city level; the fan's IP address is never stored.",
      "Deltas compare against the previous period of the same length.",
      "Insight sentences are computed from the same dataset the tables print — they are derivations, not editorial copy.",
    ],
  };
}
