import { funnelDetail } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   SponsorReport — the serializable model the export island renders to PDF
   or XLSX without knowing where numbers came from (its fixture builder left
   with the old sponsor dashboard, P1-ART-23; buildReportFunnel stays, the
   campaign report uses it). §22 rides along: every KPI carries its provenance, and the exporters
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
