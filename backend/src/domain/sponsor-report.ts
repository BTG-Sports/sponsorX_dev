/**
 * The sponsor ROI report — P7-BE-05, §9 screen 12, §22.
 *
 * Assembles what was promised, who delivered it, what it achieved, and what
 * the fans did — with every number's provenance intact.
 *
 * EVERY FIGURE ARRIVES LABELLED OR NOT AT ALL. The report is the artefact the
 * renewal conversation happens over, and §22 names conflated provenance as
 * the product's biggest credibility risk. So this module never returns a bare
 * number for anything it did not measure itself: performance comes back as
 * five labelled totals (`MetricBreakdown`), the funnel comes back as four
 * separate counts, and the one derived figure — media value — carries an
 * explicit basis saying what it was computed from.
 *
 * NOTHING IS INVENTED. Every field traces to a row: the objective to the
 * brief, the roster to campaign orders, delivered assets to deliverables,
 * performance to MetricDaily, the funnel to RewardEvent, redemption to the
 * REDEEM rows. There are no demographics, no sentiment and no benchmark
 * figures, because Phase 1 collects none of those and a plausible-looking
 * number with no source behind it is the failure this whole area guards
 * against.
 *
 * RECOMMENDATIONS ARE NOT INSIGHT. §9's screen calls for them, so they are
 * produced — but only as observations that follow mechanically from the
 * numbers above ("three of eight deliverables are unverified"), never as
 * generated commentary. A sentence the data does not support is the same
 * credibility problem wearing friendlier clothes.
 */

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { foldRows, type MetricBreakdown } from "./metric";
import { type RewardEventType } from "./reward-state";
import { breakdown as moneyBreakdown } from "./earning";
import { foldEngagement, type EditionEngagement } from "./edition";

export class ReportNotAvailableError extends Error {
  readonly status = 409;
  constructor(reason: string) {
    super(`No report can be assembled for this campaign: ${reason}`);
    this.name = "ReportNotAvailableError";
  }
}

export type RosterLine = {
  athleteId: string;
  athleteName: string;
  jobId: string;
  orderState: string;
  deliverablesTotal: number;
  deliverablesVerified: number;
};

export type DeliveredAsset = {
  deliverableId: string;
  title: string;
  state: string;
  publishedUrl: string | null;
  publishedAt: Date | null;
  /** Clicks we recorded ourselves — ATTRIBUTED, never platform-reported. */
  trackedClicks: number;
};

export type MediaValue = {
  /** cents */
  amount: number;
  /**
   * What the figure was computed from, in words. Always present: a media
   * value with no stated basis is the definition of an unfalsifiable number.
   */
  basis: string;
  /** Always ESTIMATED — it is arithmetic, not an observation. */
  source: "ESTIMATED";
};

export type SponsorReport = {
  campaign: {
    id: string;
    name: string;
    state: string;
    startDate: Date;
    endDate: Date;
    /** cents */
    budget: number;
  };
  objective: string | null;
  roster: RosterLine[];
  deliveredAssets: DeliveredAsset[];
  performance: MetricBreakdown;
  funnel: Record<RewardEventType, number>;
  /** SponsorX NEXT (P9-BE-12): the edition positions this campaign bought,
   *  and readers' engagement with them — print and digital kept apart,
   *  because pooling them makes the report say something untrue. Empty and
   *  null for a campaign with no ad placements. */
  adPlacements: Array<{ slotCode: string; kind: string; editionId: string; soldCents: number }>;
  editionEngagement: EditionEngagement | null;
  redemption: { issued: number; redeemed: number; rate: number };
  mediaValue: MediaValue;
  observations: string[];
};

/**
 * Estimated media value.
 *
 * A deliberately transparent calculation: what the sponsor paid, set against
 * what was verifiably seen. It is NOT a rate-card comparison against
 * industry CPMs — Phase 1 holds no benchmark data, and inventing one would
 * put an unsourceable number in the most-quoted box on the page.
 */
export function mediaValueFor(input: {
  spend: number;
  verifiedViews: number;
}): MediaValue {
  if (input.verifiedViews === 0) {
    return {
      amount: 0,
      basis:
        "No verified impressions were recorded, so no media value is claimed. " +
        "Self-reported and estimated figures are shown separately above and " +
        "are deliberately not used here.",
      source: "ESTIMATED",
    };
  }
  /* Cost per thousand verified impressions, to the cent. */
  const cpm = Math.round((input.spend / input.verifiedViews) * 1000);
  return {
    amount: cpm,
    basis:
      `Cost per thousand VERIFIED impressions: ${input.spend} cents of spend ` +
      `against ${input.verifiedViews} impressions from platform APIs and ` +
      `BTG-checked counts only. Self-reported, estimated and attributed ` +
      `figures are excluded.`,
    source: "ESTIMATED",
  };
}

/**
 * Observations that follow mechanically from the numbers.
 *
 * Each one is a statement about a count this report already contains, so a
 * reader can check every sentence against the section above it.
 */
export function observationsFor(report: Omit<SponsorReport, "observations">): string[] {
  const out: string[] = [];

  const totalDeliverables = report.roster.reduce((n, r) => n + r.deliverablesTotal, 0);
  const verified = report.roster.reduce((n, r) => n + r.deliverablesVerified, 0);
  if (totalDeliverables > 0 && verified < totalDeliverables) {
    out.push(
      `${totalDeliverables - verified} of ${totalDeliverables} deliverables ` +
        `are not yet verified; their figures are excluded from verified totals.`,
    );
  }

  const unverifiedViews =
    report.performance.views.SELF_REPORTED + report.performance.views.ESTIMATED;
  if (unverifiedViews > report.performance.verifiedViews) {
    out.push(
      "More impressions are self-reported or estimated than verified. The " +
        "verified figure is the one to rely on.",
    );
  }

  if (report.funnel.SCAN > 0 && report.funnel.REDEEM === 0) {
    out.push(
      `${report.funnel.SCAN} QR scans produced no redemptions. The offer was ` +
        `seen but not taken up.`,
    );
  }

  if (report.redemption.issued > 0 && report.redemption.rate < 0.05) {
    out.push(
      `Redemption ran at ${(report.redemption.rate * 100).toFixed(1)}% of ` +
        `tokens issued.`,
    );
  }

  return out;
}

/** Assemble the whole thing. */
export async function assembleSponsorReport(
  actor: Actor,
  campaignId: string,
): Promise<SponsorReport> {
  assertAllowed(actor, "metricAggregate", "read");

  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: {
      id: true, name: true, state: true, startDate: true, endDate: true, budget: true,
      brief: { select: { objective: true } },
      orders: {
        select: {
          id: true, state: true, jobId: true, athleteId: true,
          compensation: true, sellPrice: true,
          athlete: { select: { displayName: true } },
          deliverables: {
            select: {
              id: true, title: true, state: true,
              publishedUrl: true, publishedAt: true,
              link: { select: { _count: { select: { events: true } } } },
            },
          },
        },
      },
      adSlots: { select: { id: true, slotCode: true, kind: true, editionId: true, soldCents: true } },
      rewards: {
        select: {
          tokens: {
            select: { id: true, events: { select: { type: true } } },
          },
        },
      },
    },
  });
  if (!campaign) throw new ForbiddenError("metricAggregate", "read");

  const roster: RosterLine[] = campaign.orders.map((o) => ({
    athleteId: o.athleteId,
    athleteName: o.athlete.displayName,
    jobId: o.jobId,
    orderState: o.state,
    deliverablesTotal: o.deliverables.length,
    deliverablesVerified: o.deliverables.filter((d) => d.state === "VERIFIED").length,
  }));

  const deliveredAssets: DeliveredAsset[] = campaign.orders.flatMap((o) =>
    o.deliverables.map((d) => ({
      deliverableId: d.id,
      title: d.title,
      state: d.state,
      publishedUrl: d.publishedUrl,
      publishedAt: d.publishedAt,
      trackedClicks: d.link?._count.events ?? 0,
    })),
  );

  const metricRows = await prisma.metricDaily.findMany({
    /* tenant-scope: keyed by the campaign loaded above through whereFor. */
    where: { deliverable: { is: { order: { is: { campaignId } } } } },
    select: { source: true, views: true, engagements: true },
  });
  const performance = foldRows(metricRows);

  const funnel: Record<RewardEventType, number> = {
    SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0,
  };
  let issued = 0;
  for (const reward of campaign.rewards) {
    for (const token of reward.tokens) {
      issued += 1;
      for (const e of token.events) funnel[e.type as RewardEventType] += 1;
    }
  }

  const slotIds = campaign.adSlots.map((s) => s.id);
  const engagementRows = slotIds.length
    ? await prisma.editionEvent.groupBy({
        /* tenant-scope: keyed by the campaign loaded above through whereFor; its slots are its own. */
        where: { targetKind: "AD_SLOT", targetRef: { in: slotIds } },
        by: ["type"],
        _count: true,
      })
    : [];
  const adSpend = campaign.adSlots.reduce((sum, s) => sum + (s.soldCents ?? 0), 0);

  /* Spend is what the SPONSOR paid — including any NEXT ad placements, at
     their frozen sale value (P9-BE-12) — the sell price of every line, not what
     the athletes were paid. A media value computed against athlete cost would
     flatter the number by exactly BTG's margin. */
  const spend = campaign.orders.reduce(
    (sum, o) => sum + moneyBreakdown({ compensation: o.compensation, sellPrice: o.sellPrice }).sellPrice,
    adSpend,
  );

  const withoutObservations: Omit<SponsorReport, "observations"> = {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      state: campaign.state,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      budget: campaign.budget,
    },
    objective: campaign.brief?.objective ?? null,
    roster,
    deliveredAssets,
    performance,
    funnel,
    adPlacements: campaign.adSlots.map((s) => ({
      slotCode: s.slotCode, kind: s.kind, editionId: s.editionId, soldCents: s.soldCents ?? 0,
    })),
    editionEngagement: slotIds.length ? foldEngagement(engagementRows) : null,
    redemption: {
      issued,
      redeemed: funnel.REDEEM,
      rate: issued === 0 ? 0 : Math.round((funnel.REDEEM / issued) * 10000) / 10000,
    },
    mediaValue: mediaValueFor({ spend, verifiedViews: performance.verifiedViews }),
  };

  return { ...withoutObservations, observations: observationsFor(withoutObservations) };
}
