/**
 * The match engine's rules — 3S3-BE-02 and 3S3-BE-03
 * (documentation/SponsorX-Match-Engine.md).
 *
 * Pure: no database, no clock unless one is passed. The engine
 * (match-engine.ts) gathers the facts; these rules decide.
 *
 * FIRST THE FILTER (3S3-BE-03). A candidate that cannot be sold to this brief
 * is removed before anything is scored, and only counted:
 *
 *   unavailable       not bookable (an athlete not active; an item not
 *                     active, or not available on any of the brief's days;
 *                     a property with nothing available)
 *   categoryConflict  held exclusively in one of the brief's categories, or
 *                     tied in the last 12 months to a category the brief
 *                     excludes
 *   brandSafety       a restriction on one of the brief's categories (the
 *                     athlete's own, a league or school rule, a team's), an
 *                     item restricted from it, or a minor or a school in a
 *                     sensitive (age-gated) category
 *
 * A candidate is counted once, under the first that applies, in that order.
 *
 * THEN THE SCORE (3S3-BE-02). Eight factors, out of 100 (user, 2026-10-14):
 * audience 15, geography 15, category 15, history 15, budget 15, format 10,
 * sponsor history 10, quality 5. Each earns a fit from 0 to 1 and a
 * sentence. A factor that does not apply to a kind (a venue's audience, a
 * venue's delivery record) is "not applicable": weight 0, and the others'
 * weights are scaled to fill the 100, so a venue is not marked down for
 * having no followers. The score is the sum of the contributions, exactly.
 */
import { SENSITIVE_CATEGORIES } from "./brand-categories";
import { overlaps } from "./restriction-window";

export const MATCH_MODEL_VERSION = "match-rules@2.0.0";
export const MATCH_KINDS = ["athlete", "property", "inventory"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export const MATCH_FACTORS = [
  { key: "audience", label: "Audience fit", points: 15 },
  { key: "geography", label: "Geography", points: 15 },
  { key: "format", label: "Format", points: 10 },
  { key: "category", label: "Category affinity", points: 15 },
  { key: "history", label: "Historical performance", points: 15 },
  { key: "budget", label: "Budget fit", points: 15 },
  { key: "sponsorHistory", label: "Sponsor history", points: 10 },
  { key: "quality", label: "Inventory quality", points: 5 },
] as const;
export type FactorKey = (typeof MATCH_FACTORS)[number]["key"];

/** Tied to an excluded category within this many days counts as a conflict. */
export const EXCLUDED_LOOKBACK_DAYS = 365;

export type BriefForMatch = {
  sponsorId: string;
  sports: readonly string[];
  stateCodes: readonly string[];
  categories: readonly string[];
  excludedCategories: readonly string[];
  channels: readonly string[];
  audienceTiers: readonly string[];
  audienceMinFollowers: number | null;
  /** cents */
  budget: number;
  /** How many the budget is split across (the package's maximum roster); 1 without a package. */
  slots: number;
  startDate: Date;
  endDate: Date;
};

export type Restriction = { category: string; type: string; startsOn: Date | null; endsOn: Date | null };

/** What the filter needs to know about one candidate. */
export type EligibilityFacts = {
  bookable: boolean;
  /** Why not, in words, when not bookable. */
  unavailableNote?: string;
  /** The item's availability window; null ends are open. Items only. */
  window?: { from: Date | null; until: Date | null };
  /** Restrictions on the candidate (and its owner, and its team), any category. */
  restrictions: readonly Restriction[];
  /** The athlete's own restricted categories (an open-ended refusal). */
  profileRestricted: readonly string[];
  /** The item's own restricted categories. */
  itemRestricted: readonly string[];
  /** A minor athlete, or a school — never matched to a sensitive category. */
  youth: boolean;
  /** Categories the candidate was tied to in the lookback (its sponsors' categories; an item's own). */
  tiedCategories: readonly string[];
};

export type Availability = { state: "AVAILABLE" | "LIMITED"; note?: string };
export type FilterOutcome =
  | { eligible: true; availability: Availability }
  | { eligible: false; reason: "unavailable" | "categoryConflict" | "brandSafety" };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The filter, for one candidate against one brief. */
export function filterCandidate(f: EligibilityFacts, b: BriefForMatch): FilterOutcome {
  if (!f.bookable) return { eligible: false, reason: "unavailable" };
  let availability: Availability = { state: "AVAILABLE" };
  if (f.window) {
    const { from, until } = f.window;
    if ((from && from > b.endDate) || (until && until < b.startDate)) return { eligible: false, reason: "unavailable" };
    if (from && from > b.startDate) availability = { state: "LIMITED", note: `Available from ${isoDay(from)}, after the brief starts` };
    else if (until && until < b.endDate) availability = { state: "LIMITED", note: `Available until ${isoDay(until)}, before the brief ends` };
  }
  const wanted = new Set(b.categories);
  const live = f.restrictions.filter((r) => wanted.has(r.category) && overlaps(r, { startsOn: b.startDate, endsOn: b.endDate }));
  if (live.some((r) => r.type === "EXCLUSIVITY")) return { eligible: false, reason: "categoryConflict" };
  if (f.tiedCategories.some((c) => b.excludedCategories.includes(c))) return { eligible: false, reason: "categoryConflict" };
  if (live.length || f.profileRestricted.some((c) => wanted.has(c)) || f.itemRestricted.some((c) => wanted.has(c))) {
    return { eligible: false, reason: "brandSafety" };
  }
  if (f.youth && b.categories.some((c) => (SENSITIVE_CATEGORIES as readonly string[]).includes(c))) return { eligible: false, reason: "brandSafety" };
  return { eligible: true, availability };
}

/* ───────────────────────────── scoring ───────────────────────────── */

/** What scoring knows about one candidate. A field left undefined is a factor that does not apply to it. */
export type ScoreFacts = {
  stateCode: string | null;
  /** Athlete (or the item's athlete): tier and the largest account's followers. */
  audience?: { tier: string | null; maxFollowers: number | null };
  /** Channels it can deliver on (MATCH_CHANNELS). */
  channels: readonly string[];
  /** Category affinity: campaigns or sales in the brief's categories (athletes), or categories it is listed for (items, venues). */
  category: { pastInCategories: number } | { listedFor: readonly string[] };
  /** The athlete's delivery record, from the latest feature snapshot. */
  history?: { dueByToday: number; onTimeRate: number | null; engagementRate: number | null; medianEngagementRate: number | null };
  /** What the sponsor would pay for it, cents; null when nothing is on file. */
  priceCents: number | null;
  /** How the price was reached, for the sentence ("Rate for the package's jobs at the 1.4× floor"). */
  priceBasis: string;
  /** Completed campaigns or sales with this brief's sponsor. */
  withSponsor: number;
  /** Two quality marks: the first worth 60% of the factor, the second 40%; each says what it is when met and when not. */
  quality: [QualityMark, QualityMark];
};

export type QualityMark = { met: boolean; yes: string; no: string };

export type Fit = { fit: number | null; reason: string };
export type Factor = { key: FactorKey; label: string; weight: number; contribution: number; reason: string };
export type Scored = { score: number; factors: Factor[]; reasons: string[]; confidence: number };

const n = (x: number) => x.toLocaleString("en-US");
const usd = (cents: number) => `$${n(Math.round(cents / 100))}`;
const words = (c: string) => c.toLowerCase().replaceAll("_", " ");

function audience(f: ScoreFacts, b: BriefForMatch): Fit {
  if (!f.audience) return { fit: null, reason: "Not applicable: no audience of its own." };
  const { tier, maxFollowers } = f.audience;
  const tierFit = !b.audienceTiers.length ? 1 : tier && b.audienceTiers.includes(tier) ? 1 : 0;
  const min = b.audienceMinFollowers;
  const sizeFit = min === null || min === 0 ? 1 : maxFollowers === null ? 0 : Math.min(1, maxFollowers / min);
  const has = `${tier ? `${tier.charAt(0)}${tier.slice(1).toLowerCase()} tier` : "No tier"}, ${maxFollowers === null ? "no audience on file" : `${n(maxFollowers)} followers`}`;
  const asks = [b.audienceTiers.length ? b.audienceTiers.map((t) => t.toLowerCase()).join(" or ") : null, min ? `${n(min)}+ followers` : null].filter(Boolean);
  return { fit: (tierFit + sizeFit) / 2, reason: asks.length ? `${has}; the brief asks ${asks.join(", ")}.` : `${has}; the brief has no audience preference.` };
}

function geography(f: ScoreFacts, b: BriefForMatch): Fit {
  if (!b.stateCodes.length) return { fit: 1, reason: `Based in ${f.stateCode ?? "an unknown state"}; the brief has no state preference.` };
  if (f.stateCode && b.stateCodes.includes(f.stateCode)) return { fit: 1, reason: `Based in ${f.stateCode}, a state the brief names.` };
  return { fit: 0, reason: `Based in ${f.stateCode ?? "an unknown state"}; the brief names ${b.stateCodes.join(", ")}.` };
}

function format(f: ScoreFacts, b: BriefForMatch): Fit {
  if (!b.channels.length) return { fit: 1, reason: "The brief has no channel preference." };
  const covered = b.channels.filter((c) => f.channels.includes(c));
  return covered.length
    ? { fit: covered.length / b.channels.length, reason: `Delivers on ${covered.map(words).join(", ")} — ${covered.length} of the ${b.channels.length} channel(s) the brief wants.` }
    : { fit: 0, reason: `Does not deliver on ${b.channels.map(words).join(", ")}.` };
}

function category(f: ScoreFacts, b: BriefForMatch): Fit {
  if (!b.categories.length) return { fit: null, reason: "Not applicable: the brief names no category." };
  if ("pastInCategories" in f.category) {
    const k = f.category.pastInCategories;
    return k >= 3 ? { fit: 1, reason: `${k} past campaigns in ${b.categories.map(words).join(", ")}.` }
      : k >= 1 ? { fit: 0.7, reason: `${k} past campaign(s) in ${b.categories.map(words).join(", ")}.` }
      : { fit: 0.3, reason: `No campaigns in ${b.categories.map(words).join(", ")} yet.` };
  }
  const listed = f.category.listedFor;
  const shared = listed.filter((c) => b.categories.includes(c));
  return shared.length ? { fit: 1, reason: `Listed for ${shared.map(words).join(", ")}.` }
    : listed.length ? { fit: 0.3, reason: `Listed for ${listed.map(words).join(", ")}, not the brief's categories.` }
    : { fit: 0.5, reason: "Not listed for any category." };
}

function history(f: ScoreFacts): Fit {
  if (!f.history) return { fit: null, reason: "Not applicable: no delivery record for this kind." };
  const h = f.history;
  if (h.dueByToday < 3 || h.onTimeRate === null) return { fit: 0.4, reason: "No track record yet (fewer than 3 deliverables due)." };
  const engagement = h.engagementRate !== null && h.medianEngagementRate ? Math.min(1, h.engagementRate / h.medianEngagementRate) : 0.5;
  return { fit: 0.7 * h.onTimeRate + 0.3 * engagement,
    reason: `${Math.round(h.onTimeRate * 100)}% of deliverables on time${h.engagementRate !== null ? `, ${(h.engagementRate * 100).toFixed(1)}% engagement` : ""}.` };
}

function budget(f: ScoreFacts, b: BriefForMatch): Fit {
  const share = b.budget / Math.max(1, b.slots);
  if (f.priceCents === null) return { fit: 0, reason: "No price on file, so the fit cannot be judged." };
  if (share <= 0) return { fit: 0, reason: "The brief has no budget." };
  const r = f.priceCents / share;
  const fit = r <= 1 ? 1 : r >= 2 ? 0 : 2 - r;
  return { fit, reason: `${f.priceBasis} ${usd(f.priceCents)}, against a ${usd(share)} share of the budget.` };
}

function sponsorHistory(f: ScoreFacts): Fit {
  return f.withSponsor > 0 ? { fit: 1, reason: `Worked with this sponsor ${f.withSponsor} time(s) before.` } : { fit: 0, reason: "Not worked with this sponsor yet." };
}

function quality(f: ScoreFacts): Fit {
  const [a, b] = f.quality;
  const said = [a.met ? a.yes : a.no, b.met ? b.yes : b.no];
  return { fit: (a.met ? 0.6 : 0) + (b.met ? 0.4 : 0), reason: `${said[0]!.charAt(0).toUpperCase()}${said[0]!.slice(1)}; ${said[1]}.` };
}

/**
 * The score. Weights are the factors' points over the points that apply;
 * contributions are whole points, rounded so they sum to the score exactly
 * (largest remainder), and the score is out of 100.
 */
export function scoreCandidate(f: ScoreFacts, b: BriefForMatch): Scored {
  const fits: Record<FactorKey, Fit> = {
    audience: audience(f, b), geography: geography(f, b), format: format(f, b), category: category(f, b),
    history: history(f), budget: budget(f, b), sponsorHistory: sponsorHistory(f), quality: quality(f),
  };
  const applicable = MATCH_FACTORS.filter((m) => fits[m.key].fit !== null);
  const total = applicable.reduce((t, m) => t + m.points, 0);
  const raw = MATCH_FACTORS.map((m) => {
    const fit = fits[m.key].fit;
    const weight = fit === null ? 0 : m.points / total;
    return { m, weight, exact: fit === null ? 0 : weight * 100 * fit };
  });
  const target = Math.round(raw.reduce((t, r) => t + r.exact, 0));
  const floors = raw.map((r) => Math.floor(r.exact + 1e-9));
  let left = target - floors.reduce((t, x) => t + x, 0);
  const order = raw.map((r, i) => ({ i, frac: r.exact - floors[i]! })).sort((x, y) => y.frac - x.frac || x.i - y.i);
  for (const o of order) { if (left <= 0) break; floors[o.i]! += 1; left--; }
  const factors: Factor[] = raw.map((r, i) => ({
    key: r.m.key, label: r.m.label, weight: Math.round(r.weight * 10_000) / 10_000, contribution: floors[i]!, reason: fits[r.m.key].reason,
  }));
  const reasons = factors.filter((x) => x.weight > 0).sort((x, y) => y.contribution - x.contribution).map((x) => x.reason);
  /* Confidence: the share of the 100 points that rest on real data — not "not applicable", not a no-data default. */
  const known = MATCH_FACTORS.filter((m) => {
    const fit = fits[m.key];
    if (fit.fit === null) return false;
    if (m.key === "history" && fit.reason.startsWith("No track record")) return false;
    if (m.key === "budget" && f.priceCents === null) return false;
    if (m.key === "audience" && f.audience?.maxFollowers === null) return false;
    return true;
  }).reduce((t, m) => t + m.points, 0);
  return { score: target, factors, reasons, confidence: Math.round(known) / 100 };
}

/** The ranking's order: score high to low, then name, then id — code-unit comparison, so every page agrees. */
export function byScore(x: { score: number; name: string; refId: string }, y: { score: number; name: string; refId: string }): number {
  if (x.score !== y.score) return y.score - x.score;
  if (x.name !== y.name) return x.name < y.name ? -1 : 1;
  return x.refId < y.refId ? -1 : x.refId > y.refId ? 1 : 0;
}
