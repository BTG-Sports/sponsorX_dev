/**
 * The words a sponsor brief and the match engine share — 3S3-BE-01.
 *
 * Pure: the brief's contract, the brief's domain and the match engine all
 * read these lists, so a brief can never ask for a channel the engine has
 * never heard of.
 */

/** Where a sponsor wants to be seen. The social platforms are the deliverable platforms; IN_PERSON is an appearance, a camp, a venue. */
export const MATCH_CHANNELS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "FACEBOOK", "IN_PERSON"] as const;
export type MatchChannel = (typeof MATCH_CHANNELS)[number];

/** The athlete tiers a brief can target (AthleteTier). */
export const AUDIENCE_TIERS = ["EMERGING", "CREATOR", "PREMIUM", "ANCHOR"] as const;
export type AudienceTier = (typeof AUDIENCE_TIERS)[number];

/** A brief's shortlist holds at most this many matches. */
export const SHORTLIST_MAX = 100;

/** A brief cannot both want and exclude a category. */
export class CategoryWantedAndExcludedError extends Error {
  readonly status = 422;
  readonly code = "category_wanted_and_excluded";
  constructor(readonly categories: readonly string[]) {
    super(`A category cannot be both the brief's and excluded: ${categories.join(", ")}.`);
    this.name = "CategoryWantedAndExcludedError";
  }
}

export function assertNoWantedExcluded(categories: readonly string[], excluded: readonly string[]): void {
  const both = categories.filter((c) => excluded.includes(c));
  if (both.length) throw new CategoryWantedAndExcludedError(both);
}
