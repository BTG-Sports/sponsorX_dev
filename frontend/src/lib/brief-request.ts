/* --------------------------------------------------------------------------
   From the marketplace's brief drawer to POST /api/v1/briefs — P4-FE-01.

   Pure, so the exact body the frontend sends is testable on its own — and
   the backend's contract suite parses this function's output with the real
   CampaignBriefInput, so a drift between the two fails a build rather than a
   sponsor's request.

   The rules are the API's: budget in CENTS (the form shows dollars), dates as
   calendar dates, categories from the closed vocabulary. Phase 1 is a managed
   marketplace: this is a request BTG qualifies and prices, not a purchase.

   3S3-BE-01 (2026-10-14) gave the brief the match engine's inputs — the
   categories to avoid, the channels, the audience tiers and a minimum
   audience — so the drawer asks for them and they travel as columns, not as
   lines in the objective. The vocabularies mirror the backend's
   match-vocabulary.ts; the API is the enforcement.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, type BrandCategory } from "./brand-categories";

/** backend/src/domain/match-vocabulary.ts MATCH_CHANNELS, in its order. */
export const MATCH_CHANNELS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "FACEBOOK", "IN_PERSON"] as const;
export type MatchChannel = (typeof MATCH_CHANNELS)[number];
export const CHANNEL_LABEL: Record<MatchChannel, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  FACEBOOK: "Facebook",
  IN_PERSON: "In person",
};

/** backend/src/domain/match-vocabulary.ts AUDIENCE_TIERS — the athlete tiers. */
export const AUDIENCE_TIERS = ["EMERGING", "CREATOR", "PREMIUM", "ANCHOR"] as const;
export type AudienceTier = (typeof AUDIENCE_TIERS)[number];
export const TIER_LABEL: Record<AudienceTier, string> = { EMERGING: "Emerging", CREATOR: "Creator", PREMIUM: "Premium", ANCHOR: "Anchor" };

export type BriefRequest = {
  sponsorId: string;
  objective: string;
  /** As typed — "$1,500–$3,000", "1500", "$750". */
  budget: string;
  /** yyyy-mm-dd, or "" for "as soon as BTG can". */
  start: string;
  durationWeeks: number;
  sport: string;
  geo: string;
  /** One preferred tier as a word ("Creator") — the older single pick; a
   *  known one becomes `audienceTiers`, an unknown one a line in the objective. */
  tier: string;
  category: string;
  message: string;
  packageId?: string | null;
  jobName?: string | null;
  /** The match engine's inputs (3S3-BE-01). Each may be left out. */
  excludedCategories?: string[];
  channels?: string[];
  audienceTiers?: string[];
  /** As typed — "10,000", "10k", "1.5m", or "" for no minimum. */
  minFollowers?: string;
};

export type BriefBody = {
  sponsorId: string;
  objective: string;
  budget: number;
  packageId: string | null;
  startDate: string;
  endDate: string;
  sports: string[];
  stateCodes: string[];
  categories: BrandCategory[];
  excludedCategories: BrandCategory[];
  channels: MatchChannel[];
  audienceTiers: AudienceTier[];
  audienceMinFollowers: number | null;
};

export class BriefRequestInvalid extends Error {}

/** "10,000" → 10000, "10k" → 10000, "1.5m" → 1500000; "" → null (no minimum). */
export function followersCount(text: string): number | null {
  const t = (text ?? "").trim().toLowerCase().replace(/,/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
  if (!m) throw new BriefRequestInvalid("Give the minimum audience as a number of followers, e.g. 10,000 or 10k.");
  const n = Math.round(Number(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1));
  if (n > 2_147_483_647) throw new BriefRequestInvalid("That minimum audience is larger than any account.");
  return n;
}

const inVocabulary = <T extends string>(list: readonly T[], values: readonly string[] | undefined): T[] =>
  [...new Set((values ?? []).filter((v): v is T => (list as readonly string[]).includes(v)))];

/** The first dollar amount in the text, in cents. A band's LOWER bound — the
 *  brief records what the sponsor is prepared to start at; BTG prices it. */
export function budgetCents(text: string): number {
  const m = text.replace(/,/g, "").match(/\d+(\.\d{1,2})?/);
  if (!m) throw new BriefRequestInvalid("Enter a budget in dollars, e.g. 1500.");
  return Math.round(Number(m[0]) * 100);
}

/** The 50 states and DC — NIL is US law, and targeting is by US state. */
const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH " +
    "NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);

/** "DMV" → DC, MD, VA; "Baltimore, MD" → MD; outside the US → no state. */
export function stateCodesFor(geo: string): string[] {
  const g = geo.trim();
  if (!g) return [];
  if (/^dmv$/i.test(g)) return ["DC", "MD", "VA"];
  const code = g.match(/,\s*([A-Z]{2})$/)?.[1] ?? (/^[A-Z]{2}$/.test(g) ? g : null);
  return code && US_STATES.has(code) ? [code] : [];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function toBriefBody(r: BriefRequest, today = new Date()): BriefBody {
  const objective = r.objective.trim();
  if (!objective) throw new BriefRequestInvalid("Say what the campaign should achieve.");
  const start = r.start ? new Date(`${r.start}T00:00:00Z`) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14));
  if (Number.isNaN(start.getTime())) throw new BriefRequestInvalid("That start date is not a date.");
  const end = new Date(start.getTime() + Math.max(1, r.durationWeeks) * 7 * 864e5);

  /* The single "Preferred tier" pick is a column now when it names a tier the
     API knows; any other wording still travels in the objective. */
  const tierPick = r.tier.trim().toUpperCase();
  const audienceTiers = inVocabulary(AUDIENCE_TIERS, [...(r.audienceTiers ?? []), tierPick]);
  const tierLine = r.tier && !(AUDIENCE_TIERS as readonly string[]).includes(tierPick) ? `Preferred tier: ${r.tier}` : "";

  /* The API keeps objective only; everything else the sponsor typed that has
     no column of its own travels with it, so BTG reads it at qualification. */
  const extras = [
    r.jobName ? `Requested job: ${r.jobName}` : "",
    tierLine,
    r.message.trim() ? `Note: ${r.message.trim()}` : "",
  ].filter(Boolean);

  const category = r.category as BrandCategory;
  const categories = (BRAND_CATEGORIES as readonly string[]).includes(category) ? [category] : [];
  const excludedCategories = inVocabulary(BRAND_CATEGORIES, r.excludedCategories);
  /* The API refuses a category both wanted and avoided (match-vocabulary.ts);
     say so here, in the drawer's words, rather than send it. */
  if (excludedCategories.some((c) => categories.includes(c))) {
    throw new BriefRequestInvalid("Your own category can't also be one to avoid.");
  }
  return {
    sponsorId: r.sponsorId,
    objective: [objective, ...extras].join("\n\n").slice(0, 2000),
    budget: budgetCents(r.budget),
    packageId: r.packageId ?? null,
    startDate: day(start),
    endDate: day(end),
    sports: r.sport ? [r.sport] : [],
    stateCodes: stateCodesFor(r.geo),
    categories,
    excludedCategories,
    channels: inVocabulary(MATCH_CHANNELS, r.channels),
    audienceTiers,
    audienceMinFollowers: followersCount(r.minFollowers ?? ""),
  };
}
