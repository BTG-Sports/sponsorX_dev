/**
 * What our inventory is actually worth — P7-DATA-03, §15.
 *
 * SponsorX sells fixed-price jobs from a rate card. Nobody buys impressions,
 * so nothing in the sale itself says whether SX-03 at $300 is cheap or dear.
 * The implied CPM is the number that tells us — computed for every line,
 * including the fixed-price ones, precisely because those are the ones with
 * no price signal of their own.
 *
 * THE PROJECTION IS USUALLY SELF-REPORTED, AND THAT TRAVELS WITH IT. An
 * athlete's follower count is something they typed. An implied CPM resting on
 * it is a useful planning number and a terrible thing to quote to a sponsor as
 * though it were measured, so `projectionSource` carries §22's label onto the
 * derived figure and every reader gets it whether they asked or not.
 *
 * WHY AVERAGE VIEWS AND NOT FOLLOWERS. A follower count is an audience that
 * might see something; average views is roughly how many did. Where both
 * exist, views is the honest basis; followers is the fallback, discounted,
 * because treating every follower as an impression overstates reach by an
 * order of magnitude on most platforms.
 */

import type { MetricSource } from "./metric-source";

/** Fallback when only a follower count exists — see the note above. */
export const FOLLOWER_TO_IMPRESSION_RATE = 0.1;

export type SocialSignal = {
  followers: number | null;
  avgViews: number | null;
  source: MetricSource;
};

export type Projection = {
  impressions: number;
  source: MetricSource;
  basis: "avgViews" | "followers";
};

/**
 * Project the impressions one line is expected to reach.
 *
 * Returns null rather than zero when there is nothing to go on. A zero would
 * assert that the line reaches nobody, which is a different claim from "we
 * do not know", and it would turn the CPM into a division by zero.
 *
 * Where an athlete has several accounts the strongest single signal is used
 * rather than the sum: posting the same deliverable to two platforms does not
 * reach the combined audience, and adding them is how a projection becomes
 * fiction.
 */
export function projectImpressions(socials: SocialSignal[]): Projection | null {
  const withViews = socials.filter((s) => (s.avgViews ?? 0) > 0);
  if (withViews.length > 0) {
    const best = withViews.reduce((a, b) => ((a.avgViews ?? 0) >= (b.avgViews ?? 0) ? a : b));
    return { impressions: best.avgViews!, source: best.source, basis: "avgViews" };
  }

  const withFollowers = socials.filter((s) => (s.followers ?? 0) > 0);
  if (withFollowers.length > 0) {
    const best = withFollowers.reduce(
      (a, b) => ((a.followers ?? 0) >= (b.followers ?? 0) ? a : b));
    return {
      impressions: Math.round(best.followers! * FOLLOWER_TO_IMPRESSION_RATE),
      source: best.source,
      basis: "followers",
    };
  }

  return null;
}

/**
 * Cost per thousand projected impressions, in cents.
 *
 * Rounded to the cent. Null where there is no projection — the caller stores
 * null rather than inventing a figure.
 */
export function impliedCpm(sellPrice: number, impressions: number | null): number | null {
  if (!impressions || impressions <= 0) return null;
  return Math.round((sellPrice / impressions) * 1000);
}

/** Both halves at once, as they are stored together on the order. */
export function projectLine(
  sellPrice: number,
  socials: SocialSignal[],
): { projectedImpressions: number | null; impliedCpm: number | null; projectionSource: MetricSource | null } {
  const projection = projectImpressions(socials);
  if (!projection) {
    return { projectedImpressions: null, impliedCpm: null, projectionSource: null };
  }
  return {
    projectedImpressions: projection.impressions,
    impliedCpm: impliedCpm(sellPrice, projection.impressions),
    projectionSource: projection.source,
  };
}
