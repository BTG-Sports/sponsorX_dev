import type { ApiSponsorReport, Sourced } from "@/lib/report-live";
import type { RangeKey } from "@/lib/sponsor-overview-live";
import { RESULTS_NOTE } from "@/lib/sponsor-intelligence-live";
import { jobName } from "@/lib/job-names";
import { FUNNEL_WORDS, campaignWord, deliverableWord, orderWord, sourceWord } from "@/lib/sponsor-words";

/* --------------------------------------------------------------------------
   CampaignResultsReport — the export model behind "Export report" on a REAL
   campaign's results page (§9 screen 12). Staging dry run, 2026-10-26: the
   PDF / Excel export only rendered for the sample campaigns, so a sponsor
   had no way to download their own report.

   Built from the very reads the page draws — GET /campaigns/{id}/report and,
   when the caller may see it, the overview's best athletes — so the file
   says what the screen says, in the screen's words. The sample campaigns
   export through here too, from the sample report the page draws, labelled
   as a sample (QA pass 3: their old fixture export named a different
   campaign than the page showed, and still carried a "return multiple").

   The provenance rules travel with the numbers (§22): reach is listed per
   source, side by side, never summed into one total; the cost per 1,000 is
   an estimate and says how it was worked out; link clicks are our own
   counter. Pure — the page builds it on the server, the export island
   renders it in the browser.
   -------------------------------------------------------------------------- */

export type CampaignResultsReport = {
  meta: {
    title: string;
    campaign: string;
    campaignId: string;
    status: string;
    period: string;
    objective: string | null;
    /** Download filename without extension. */
    fileStem: string;
    footnote: string;
  };
  headline: {
    /** Checked reach (platform + BTG checks). */
    reached: number;
    /** Reach from other sources — shown apart, never added in. */
    otherReach: number;
    engagements: number;
    /** Engagements ÷ checked reach as a fraction, null with no reach. */
    engagementRate: number | null;
    redeemed: number;
    issued: number;
    /** Cents per 1,000 people reached; null with no checked reach. */
    costPerThousandCents: number | null;
    costBasis: string;
  };
  /** Reach by source, each on its own (views and engagements). */
  sources: { label: string; checked: boolean; views: number; engagements: number }[];
  funnel: { stage: string; fans: number }[];
  /** The overview's best athletes over the window the page was showing;
   *  null when the caller can't read the overview. */
  bestAthletes: { window: string; rows: { rank: number; name: string; sport: string | null; reached: number }[] } | null;
  /** One line per Campaign Order, as on screen: an athlete on two jobs is two lines. */
  athletes: { name: string; job: string; order: string; checked: number; total: number }[];
  posts: { title: string; status: string; publishedAt: string | null; url: string | null; clicks: number }[];
  placements: { positions: number; printScans: number; digitalClicks: number } | null;
  observations: string[];
  notes: string[];
};

const SOURCE_ORDER: (keyof Sourced)[] = ["VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED"];
const CHECKED = new Set<keyof Sourced>(["VERIFIED_API", "VERIFIED_MANUAL"]);

const WINDOW_WORDS: Record<RangeKey, string> = { "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", all: "all time" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A filename-safe stem: letters, digits and dashes only. */
function stem(name: string, asOf: Date): string {
  const safe = name.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "Campaign";
  return `SponsorX-Results-${safe}-${asOf.toISOString().slice(0, 10)}`;
}

export function buildCampaignResultsReport(
  r: ApiSponsorReport,
  best: { window: RangeKey; athletes: { name: string; sport?: string | null; views: number }[] } | null,
  asOf: Date = new Date(),
  opts: { sample?: boolean } = {},
): CampaignResultsReport {
  const reached = r.performance.verifiedViews;
  const engagements = r.performance.verifiedEngagements;
  const otherReach = r.performance.views.SELF_REPORTED + r.performance.views.ESTIMATED;
  const costPerThousandCents = reached > 0 ? r.mediaValue.amount : null;

  return {
    meta: {
      title: opts.sample ? "Campaign Results (sample)" : "Campaign Results",
      campaign: r.campaign.name,
      campaignId: r.campaign.id,
      status: campaignWord(r.campaign.state).text,
      period: `${day(r.campaign.startDate)} – ${day(r.campaign.endDate)}`,
      objective: r.objective,
      fileStem: opts.sample ? `${stem(r.campaign.name, asOf)}-SAMPLE` : stem(r.campaign.name, asOf),
      footnote: opts.sample
        ? "Sample data — not a real campaign. It shows how your results report is laid out. Checked reach is never added to reach from other sources."
        : `Figures as read ${asOf.toISOString().slice(0, 16).replace("T", " ")} UTC, all time. Checked reach is never added to reach from other sources.`,
    },
    headline: {
      reached,
      otherReach,
      engagements,
      engagementRate: reached > 0 ? engagements / reached : null,
      redeemed: r.redemption.redeemed,
      issued: r.redemption.issued,
      costPerThousandCents,
      costBasis:
        "What you've spent divided by the people your posts reached that we could check, times 1,000. Numbers athletes reported themselves aren't counted. An estimate.",
    },
    sources: SOURCE_ORDER.filter((s) => r.performance.views[s] > 0 || r.performance.engagements[s] > 0).map((s) => ({
      label: sourceWord(s),
      checked: CHECKED.has(s),
      views: r.performance.views[s],
      engagements: r.performance.engagements[s],
    })),
    funnel: [
      { stage: FUNNEL_WORDS.scan, fans: r.funnel.SCAN },
      { stage: FUNNEL_WORDS.landing, fans: r.funnel.LANDING },
      { stage: FUNNEL_WORDS.claim, fans: r.funnel.CLAIM },
      { stage: FUNNEL_WORDS.redeem, fans: r.funnel.REDEEM },
    ],
    bestAthletes: best
      ? {
          window: WINDOW_WORDS[best.window],
          rows: best.athletes.map((a, i) => ({ rank: i + 1, name: a.name, sport: a.sport ?? null, reached: a.views })),
        }
      : null,
    athletes: r.roster.map((a) => ({
      name: a.athleteName,
      job: jobName(a.jobId),
      order: orderWord(a.orderState).text,
      checked: a.deliverablesVerified,
      total: a.deliverablesTotal,
    })),
    posts: r.deliveredAssets.map((a) => ({
      title: a.title,
      status: deliverableWord(a.state).text,
      publishedAt: a.publishedAt ? day(a.publishedAt) : null,
      url: a.publishedUrl,
      clicks: a.trackedClicks,
    })),
    placements:
      r.adPlacements.length > 0 && r.editionEngagement
        ? {
            positions: r.adPlacements.length,
            printScans: r.editionEngagement.print.QR_SCAN,
            digitalClicks: r.editionEngagement.digital.LINK_CLICK,
          }
        : null,
    observations: r.observations,
    notes: [
      "People reached counts views checked by the platform or by BTG. Views the athletes reported themselves, and estimates, are listed apart and never added in.",
      "Link clicks are taps on your tracked link, counted by SponsorX.",
      "The fan journey counts SponsorX's own scan, open, claim and redeem events.",
      RESULTS_NOTE,
    ],
  };
}
