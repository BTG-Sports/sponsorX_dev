import {
  funnelDetail,
  metricTrust,
  roiGauge,
  sponsor,
  sponsorBudget,
  sponsorCampaigns,
  sponsorCampaignsX,
  sponsorHero,
  sponsorInsights,
  sponsorStats,
  topAthletes,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   SponsorReport — the serializable model behind "Export report" on the
   sponsor dashboard. The server page builds it (today from fixtures, later
   from MetricDaily / RewardEvent / Deliverable / Zoho Books queries) and the
   export island renders it to PDF or XLSX without knowing where numbers came
   from. §22 rides along: every KPI carries its provenance, and the exporters
   must print it — a figure that loses its VER/EST/ATT tag in the export is a
   figure the client will misquote.

   Money stays in cents here, exactly as the fixtures and future API keep it;
   each exporter converts at the last moment (Excel wants real numbers with a
   currency format, the PDF wants formatted strings).
   -------------------------------------------------------------------------- */

export type ReportKpi = {
  label: string;
  value: string;
  detail: string;
  provenance: string;
};

/** Shape shared by every exported report's funnel section. */
export type ReportFunnel = {
  stages: {
    stage: string;
    count: number;
    /** Share of the first stage (scans), 0–1. */
    ofScans: number;
    /** Conversion from the previous stage, 0–1; null for the first. */
    fromPrev: number | null;
  }[];
  overallPct: number;
  medianRedeemHours: number;
  leadsPushed: number;
};

export type SponsorReport = {
  meta: {
    title: string;
    sponsor: string;
    contact: string;
    period: string;
    /** e.g. "2026-05" — stable filename fragment for the download. */
    periodSlug: string;
    /** Download filename without extension. */
    fileStem: string;
    campaignCount: number;
    footnote: string;
  };
  kpis: ReportKpi[];
  insights: string[];
  daily: {
    rows: { date: string; views: number; engagements: number }[];
    /** Dashed tail of the hero chart — always labelled ESTIMATED. */
    projection: { date: string; views: number }[];
    breakEvenNote: string;
  };
  funnel: ReportFunnel;
  campaigns: {
    rows: {
      name: string;
      pkg: string;
      athletes: number;
      done: number;
      total: number;
      views: number;
      spendCents: number;
      pacing: "On track" | "Behind";
      state: string;
      timeline: string;
    }[];
    totals: { athletes: number; views: number; spendCents: number };
  };
  athletes: {
    rank: number;
    name: string;
    views: number;
    /** Share of total delivered views, 0–1. */
    share: number;
    flag: string | null;
  }[];
  trust: { label: string; pct: number }[];
  methodology: string[];
};

const CAMPAIGN_STATE_COPY = {
  ACTIVE: "Active",
  REPORTING: "Reporting",
  STAFFING: "Staffing",
  COMPLETED: "Completed",
} as const;

/** Both reports print §16's four-stage funnel with the same derived rates. */
export function buildReportFunnel(): ReportFunnel {
  const scans = funnelDetail.stages[0].value;
  return {
    stages: funnelDetail.stages.map((s, i) => ({
      stage: s.label,
      count: s.value,
      ofScans: s.value / scans,
      fromPrev: i === 0 ? null : s.value / funnelDetail.stages[i - 1].value,
    })),
    overallPct: funnelDetail.overallPct,
    medianRedeemHours: funnelDetail.medianRedeemHours,
    leadsPushed: funnelDetail.leadsPushed,
  };
}

export function buildSponsorReport(): SponsorReport {
  const redeemed = sponsorStats.find((s) => s.label === "Rewards Redeemed");
  const spentPct = Math.round(
    (sponsorBudget.spent / sponsorBudget.contracted) * 100,
  );
  const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const rows = sponsorCampaigns.map((c) => {
    const x = sponsorCampaignsX[c.id];
    const [done, total] = c.deliverables;
    return {
      name: c.name,
      pkg: c.pkg,
      athletes: c.athletes,
      done,
      total,
      views: x.views,
      spendCents: c.spend,
      pacing: (x.pacing === "BEHIND" ? "Behind" : "On track") as
        | "On track"
        | "Behind",
      state: CAMPAIGN_STATE_COPY[c.state],
      timeline: x.endsIn,
    };
  });

  return {
    meta: {
      title: "Campaign Performance Report",
      sponsor: sponsor.name,
      contact: `${sponsor.contactName} · ${sponsor.role}`,
      period: sponsor.dateRange,
      periodSlug: "2026-05",
      fileStem: `SponsorX-Campaign-Report-${sponsor.name.replace(/\s+/g, "-")}-2026-05`,
      campaignCount: sponsorCampaigns.length,
      footnote:
        "Demo dataset — figures shaped to MetricDaily, RewardEvent, Deliverable and Zoho Books, provenance-labelled per §22.",
    },
    kpis: [
      {
        label: "Views delivered",
        value: sponsorHero.views.toLocaleString("en-US"),
        detail: `▲ ${sponsorHero.deltaPct}% vs April`,
        provenance: "VERIFIED · MetricDaily",
      },
      {
        label: "Engagements",
        value: "42,815",
        detail: "▲ 8.7% vs April · 5.2% avg rate",
        provenance: "VERIFIED · MetricDaily",
      },
      {
        label: "Rewards redeemed",
        value: redeemed?.value ?? "1,870",
        detail: `▲ ${redeemed?.delta ?? "15.2%"} vs April · median ${funnelDetail.medianRedeemHours}h to redeem`,
        provenance: "VERIFIED · RewardEvent",
      },
      {
        label: "Spend to date",
        value: money(sponsorBudget.spent),
        detail: `${spentPct}% of ${money(sponsorBudget.contracted)} contracted`,
        provenance: "Zoho Books",
      },
      {
        label: "Return — Player of the Week",
        value: roiGauge.value,
        detail: `${money(roiGauge.attributed)} attributed ÷ ${money(roiGauge.invested)} spend`,
        provenance: "ATTRIBUTED · RewardEvent × Zoho Books",
      },
      {
        label: "Season pacing",
        value: `${sponsorHero.pacingPct}%`,
        detail: `of ${(sponsorHero.target / 1_000_000).toLocaleString("en-US")}M season target · on pace for ${sponsorHero.projectedTotal} by season end`,
        provenance: "ESTIMATED · linear projection",
      },
    ],
    insights: sponsorInsights.map((i) => i.text),
    daily: {
      rows: sponsorHero.series.map((p) => ({
        date: p.label,
        views: p.a,
        engagements: p.b,
      })),
      projection: sponsorHero.projection.map((p) => ({
        date: p.label,
        views: p.a,
      })),
      breakEvenNote: `Attributed value crossed spend on May 14 (${sponsorHero.breakEvenLabel}).`,
    },
    funnel: buildReportFunnel(),
    campaigns: {
      rows,
      totals: {
        athletes: rows.reduce((n, r) => n + r.athletes, 0),
        views: rows.reduce((n, r) => n + r.views, 0),
        spendCents: rows.reduce((n, r) => n + r.spendCents, 0),
      },
    },
    athletes: topAthletes.map((a) => ({
      rank: a.rank,
      name: a.name,
      views: a.views,
      share: a.views / sponsorHero.views,
      flag: a.flag,
    })),
    trust: metricTrust.map((t) => ({ label: t.label, pct: t.pct })),
    methodology: [
      "Views and engagements are daily MetricDaily rows summed cumulatively across the period; deltas compare against the equivalent April window.",
      "Pacing compares delivery progress against elapsed campaign time (Deliverable dates); campaigns flagged Behind are already with the campaign manager (§9.9).",
      "The season projection extends the May run-rate linearly and is ESTIMATED — it is a planning aid, not a commitment.",
      "Return divides attributed revenue (QR reward redemptions matched to sales) by invoiced spend from Zoho Books; break-even is the day the ratio crossed 1.0×.",
      "Data trust shows the provenance mix of every metric in this report: verified API, verified manual, attributed, and estimated shares (§22).",
    ],
  };
}
