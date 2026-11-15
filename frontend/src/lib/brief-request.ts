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
import { addDays, parseDay } from "./day-range";

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

/** The 50 states and DC by name, for the drawer's Geography options (POL-FE-51). */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** A state code in words: "MD" → "Maryland"; an unknown code stays as sent. */
export const stateName = (code: string) => STATE_NAMES[code] ?? code;

/** GET /catalogue/targeting — the sports and state codes live athletes cover (POL-FE-51). */
export type Targeting = { sports: string[]; stateCodes: string[] };

/**
 * POL-FE-51 — the drawer's Sport and Geography options from the live pool:
 * a sport as the API spells it (matching is an exact match on the word), a
 * state as its code, labelled by name. Only US states — the brief targets
 * nothing else (`stateCodesFor`), so any other code would be a silent no-op.
 */
export function targetingOptions(t: Targeting): { sports: { value: string; label: string }[]; geos: { value: string; label: string }[] } {
  return {
    sports: [...new Set(t.sports)].filter(Boolean).map((s) => ({ value: s, label: s })),
    geos: [...new Set(t.stateCodes)]
      .filter((c) => US_STATES.has(c))
      .map((c) => ({ value: c, label: stateName(c) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const pad2 = (n: number) => String(n).padStart(2, "0");

/* --- the start date (POL-FE-51) -------------------------------------------

   The API holds a brief whose start isn't strictly in the future
   (brief-readiness-rules.ts), and a start is sent as midnight UTC. So
   "today" is the LATER of the viewer's own calendar day and UTC's: a
   sponsor in Maryland at 9 pm is already on tomorrow in UTC, and their
   "tomorrow" would be held. The day after that is always safe. */

/** The latest calendar day it is for this brief: the viewer's or UTC's. */
export function briefToday(now = new Date()): string {
  const local = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const utc = day(now);
  return local > utc ? local : utc;
}

/** The earliest start a sponsor may pick: the day after `briefToday`. */
export function earliestStart(now = new Date()): string {
  return addDays(briefToday(now), 1);
}

/** What the drawer shows when it opens — the same day a blank start is sent
 *  as (UTC today + 14, `toBriefBody`), so the screen and the brief agree. */
export function defaultStart(now = new Date()): string {
  return day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14)));
}

export const START_AFTER_TODAY = "The start date must be after today";

/** Why a start date can't be sent, or null. A blank one becomes `defaultStart`. */
export function startDateProblem(start: string, now = new Date()): string | null {
  if (!start) return null;
  if (!parseDay(start)) return "That start date is not a date.";
  return start <= briefToday(now) ? START_AFTER_TODAY : null;
}

export function toBriefBody(r: BriefRequest, today = new Date()): BriefBody {
  const objective = r.objective.trim();
  if (!objective) throw new BriefRequestInvalid("Say what the campaign should achieve.");
  const start = new Date(`${r.start || defaultStart(today)}T00:00:00Z`);
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
