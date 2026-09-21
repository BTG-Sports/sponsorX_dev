import {
  efficiency,
  formatInsight,
  formatPerformance,
  geoInsight,
  geoMarkets,
  platformSplit,
  roiDelivery,
  roiGauge,
  roiRecommendation,
  roiReport,
  roiTimeline,
  topContentX,
} from "@/lib/fixtures";
import { buildReportFunnel, type ReportFunnel } from "@/lib/report-data";

/* --------------------------------------------------------------------------
   CampaignRoiReport — the serializable model behind "Export report" on the
   campaign ROI screen (§9 screen 12). Same contract as SponsorReport: the
   server page builds it (fixtures today, P7-BE-05's real assembly later) and
   the renderers print it with every §22 provenance label intact. Revenue is
   ATTRIBUTED (merchant-validated coupons, not payment-network data — §16),
   media value stays ESTIMATED, and the two must never merge into one "value"
   figure.
   -------------------------------------------------------------------------- */

export type CampaignRoiReport = {
  meta: {
    title: string;
    campaign: string;
    campaignId: string;
    presentedBy: string;
    period: string;
    /** Download filename without extension. */
    fileStem: string;
    footnote: string;
  };
  returns: {
    /** e.g. "2.73×" */
    multiple: string;
    investedCents: number;
    attributedCents: number;
    mediaValueCents: number;
    breakEvenNote: string;
  };
  timeline: { date: string; multiple: number }[];
  formats: { rows: { label: string; job: string; views: number }[]; insight: string };
  platforms: {
    rows: { label: string; views: number; share: number }[];
    insight: string;
  };
  markets: { rows: { label: string; pct: number }[]; insight: string };
  funnel: ReportFunnel;
  efficiency: { label: string; value: string; benchDeltaPct: number | null }[];
  delivery: {
    views: number;
    engagements: number;
    deliverablesDone: number;
    deliverablesTotal: number;
    onTimePct: number;
    leads: number;
  };
  topContent: {
    rank: number;
    title: string;
    athlete: string;
    format: string;
    platform: string;
    views: number;
    engagementRate: number;
  }[];
  recommendation: { body: string; liftPct: number };
  methodology: string[];
};

export function buildCampaignRoiReport(campaignId: string): CampaignRoiReport {
  const platformTotal = platformSplit.segments.reduce((n, s) => n + s.value, 0);

  return {
    meta: {
      title: "Campaign ROI Report",
      campaign: roiReport.campaign,
      campaignId,
      presentedBy: roiReport.presentedBy,
      period: roiReport.period,
      fileStem: `SponsorX-ROI-Report-${roiReport.campaign.replace(/\s+/g, "-")}-2026-05`,
      footnote:
        "Demo dataset — figures shaped to MetricDaily, RewardEvent, Deliverable and Zoho Books, provenance-labelled per §22.",
    },
    returns: {
      multiple: roiGauge.value,
      investedCents: roiGauge.invested,
      attributedCents: roiGauge.attributed,
      mediaValueCents: roiGauge.mediaValue,
      breakEvenNote: `Break-even (${roiTimeline.breakEvenLabel}) — attributed revenue crossed the invested amount.`,
    },
    timeline: roiTimeline.series.map((p) => ({ date: p.label, multiple: p.a })),
    formats: {
      rows: formatPerformance.map((f) => ({
        label: f.label,
        job: f.sub,
        views: f.value,
      })),
      insight: formatInsight,
    },
    platforms: {
      rows: platformSplit.segments.map((s) => ({
        label: s.label,
        views: s.value,
        share: s.value / platformTotal,
      })),
      insight: platformSplit.insight,
    },
    markets: {
      rows: geoMarkets.map((g) => ({ label: g.label, pct: g.value })),
      insight: geoInsight,
    },
    funnel: buildReportFunnel(),
    efficiency: efficiency.map((e) => ({
      label: e.label,
      value: e.value,
      benchDeltaPct: e.benchDeltaPct,
    })),
    delivery: { ...roiDelivery },
    topContent: topContentX.map((c) => ({
      rank: c.rank,
      title: c.title,
      athlete: c.athlete,
      format: c.format,
      platform: c.platform,
      views: c.views,
      engagementRate: c.engagementRate,
    })),
    recommendation: { ...roiRecommendation },
    methodology: [
      "Return divides attributed revenue by invoiced investment from Zoho Books; revenue is attributed through merchant-validated coupon redemptions, never payment-network data (§16).",
      "Estimated media value prices delivered views at BTG-curated CPMs and is ESTIMATED — it is context, not revenue, and is never added to the return figure.",
      "Format and platform composition group MetricDaily rows by deliverable; geo markets come from RewardEvent city-level resolution — no IP addresses are stored.",
      "Efficiency benchmarks compare against BTG-curated category medians and are ESTIMATED.",
      "On-time delivery compares each Deliverable's due date against its published timestamp.",
      "The renewal recommendation's projected lift is ESTIMATED from this campaign's format-level views-per-dollar.",
    ],
  };
}
