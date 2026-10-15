/**
 * The make-good rules — 3S5-BE-01 and 3S5-BE-02 (documentation/SponsorX-Make-Goods.md).
 *
 * Pure: no database, no clock unless one is passed. makegood-engine.ts
 * gathers the facts; these rules decide.
 *
 * A SHORTFALL is what a campaign was sold (its guarantee) less what the
 * forecast projects it will reach (3S4-BE-01), opened when the forecast says
 * at risk. It is worth that many units at what the sponsor paid per unit:
 * the campaign's sold value ÷ its guarantee.
 *
 * A SUBSTITUTE is an inventory item BTG gives the sponsor to make up the
 * gap, run over the next MAKEGOOD_WINDOW_DAYS from tomorrow (user,
 * 2026-10-15) — past the end date if need be, because a shortfall is only
 * certain near the end. Each one carries three checks (available on the
 * dates, clear of the sponsor's exclusivity, on the sponsor's target), its
 * estimated delivery in the shortfall's metric, how close that is to the gap
 * (equivalency), and what it costs BTG against what the gap is worth.
 *
 * AUTOMATIC APPROVAL (user, 2026-10-15; the Phase 2 rule: automatic when
 * every safety check passes, held for BTG with the reason when one fails).
 * SponsorX approves the best substitute itself only when all of these hold;
 * otherwise the shortfall waits for a BTG admin or campaign manager, with
 * every reason it was held:
 *   - it passes all three checks;
 *   - it covers at least AUTO_MIN_COVERAGE (90%) of the shortfall;
 *   - it costs BTG no more than the shortfall is worth;
 *   - no minor or school is involved, and the sponsor's category is not
 *     age-gated — those always reach a person;
 *   - AUTO_MIN_ELAPSED (80%) of the flight has gone, so the shortfall is
 *     near-certain and not an early dip that recovers;
 *   - the estimate rests on verified figures: the owner's own verified
 *     history, or a benchmark of at least BENCHMARK_MIN_SAMPLE orders.
 *
 * The last two were proposed in the build and approved by the user on
 * 2026-10-15, to be kept noted: the 80% rule stops SponsorX spending BTG's
 * inventory on a slow start that would have recovered; the verified-estimate
 * rule stops a self-reported view count making a substitute look as if it
 * covers the gap when it does not. Both bind only the automatic approval —
 * a person may approve any passing substitute at any time.
 */
import { BENCHMARK_MIN_SAMPLE } from "./benchmarks";
import type { GuaranteeMetric } from "./forecast-rules";

export const MAKEGOOD_MODEL_VERSION = "makegood-rules@1.0.0";
/** A make-good runs over this many days, from tomorrow (user, 2026-10-15). */
export const MAKEGOOD_WINDOW_DAYS = 14;
/** At most this many units of one item are offered as one substitute. */
export const MAX_UNITS = 10;
/** Up to this many substitutes passing every check are shown, best first… */
export const OPTIONS_SHOWN = 5;
/** …and up to this many closer ones failing a check, so BTG sees why they were not picked. */
export const NEAR_MISSES_SHOWN = 2;
/** An athlete's own history needs this many published posts to estimate from. */
export const MIN_POSTS_FOR_HISTORY = 3;
/** Automatic approval: the best substitute covers at least this share of the shortfall. */
export const AUTO_MIN_COVERAGE = 0.9;
/** Automatic approval: at least this share of the flight has gone. */
export const AUTO_MIN_ELAPSED = 0.8;
/** The approval note: at least this long (the screen's MIN_REASON), at most NOTE_MAX. */
export const NOTE_MIN = 8;
export const NOTE_MAX = 2000;

export const SHORTFALL_STATUSES = ["OPEN", "APPROVED", "CLOSED"] as const;
export type ShortfallStatus = (typeof SHORTFALL_STATUSES)[number];

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (cents: number) => `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;

/** The days a make-good decided on `today` runs: tomorrow, for MAKEGOOD_WINDOW_DAYS days. */
export function makeGoodWindow(today: Date, days = MAKEGOOD_WINDOW_DAYS): { startsOn: Date; endsOn: Date } {
  const start = utcDay(today) + DAY_MS;
  return { startsOn: new Date(start), endsOn: new Date(start + (days - 1) * DAY_MS) };
}

/* ───────────────────────────── the estimate ───────────────────────────── */

/** What one unit's estimate rests on. */
export type Basis = "own_history" | "profile" | "benchmark" | "count";

/** How far each basis is trusted — the stamp's confidence is their average over the substitutes shown. */
export const BASIS_WEIGHT: Record<Basis, number> = { own_history: 1, count: 1, benchmark: 0.6, profile: 0.4 };

export type EstimateFacts = {
  /** The item's athlete, from their latest feature snapshot; absent for a venue's or a team's item. */
  athlete?: { published: number; verifiedViews: number; verifiedEngagements: number; profileAvgViews: number };
  priceCents: number;
  /** The tenant's benchmark price per 1,000 verified views (median), and the orders behind it. */
  benchmark: { cpmCents: number; sampleSize: number } | null;
};

export type UnitEstimate = { perUnit: number; basis: Basis; verified: boolean; words: string };

/**
 * One unit's delivery in the shortfall's metric, and what it rests on — or
 * null when nothing on file can estimate it (redemptions; engagements for
 * a venue; anything with no history and no benchmark).
 */
export function unitEstimate(metric: GuaranteeMetric, f: EstimateFacts): UnitEstimate | null {
  if (metric === "deliverables") return { perUnit: 1, basis: "count", verified: true, words: "One deliverable a unit" };
  if (metric === "redemptions") return null;
  const a = f.athlete;
  const posts = a?.published ?? 0;
  if (metric === "engagements") {
    if (a && posts >= MIN_POSTS_FOR_HISTORY && a.verifiedEngagements > 0) {
      const per = a.verifiedEngagements / posts;
      return { perUnit: per, basis: "own_history", verified: true, words: `Their verified average of ${n(per)} engagements a post` };
    }
    return null;
  }
  if (a && posts >= MIN_POSTS_FOR_HISTORY && a.verifiedViews > 0) {
    const per = a.verifiedViews / posts;
    return { perUnit: per, basis: "own_history", verified: true, words: `Their verified average of ${n(per)} impressions a post` };
  }
  if (a && a.profileAvgViews > 0) {
    return { perUnit: a.profileAvgViews, basis: "profile", verified: false, words: `Their profile's average of ${n(a.profileAvgViews)} views a post (not verified)` };
  }
  if (f.benchmark && f.benchmark.cpmCents > 0 && f.priceCents > 0) {
    const per = (f.priceCents * 1000) / f.benchmark.cpmCents;
    const big = f.benchmark.sampleSize >= BENCHMARK_MIN_SAMPLE;
    return {
      perUnit: per, basis: "benchmark", verified: big,
      words: `Its price at the tenant's benchmark of ${usd(f.benchmark.cpmCents)} per 1,000 impressions${big ? "" : " (a small sample)"}`,
    };
  }
  return null;
}

/** How many units cover the shortfall: at least 1, at most MAX_UNITS, within the item's stock and package rules. */
export function unitsFor(shortfall: number, perUnit: number, limits: { quantity: number | null; min?: number | null; max?: number | null }): number {
  let units = perUnit > 0 ? Math.ceil(shortfall / perUnit) : 1;
  units = Math.min(MAX_UNITS, Math.max(1, units));
  if (limits.max != null) units = Math.min(units, limits.max);
  if (limits.quantity != null) units = Math.min(units, Math.max(1, limits.quantity));
  if (limits.min != null) units = Math.max(units, limits.min);
  return units;
}

/** How close a substitute's delivery is to the shortfall, 0..1 — the smaller of the two over the larger. */
export function equivalency(shortfall: number, estimated: number): number {
  if (shortfall <= 0 || estimated <= 0) return 0;
  return round4(Math.min(shortfall, estimated) / Math.max(shortfall, estimated));
}

/** How much of the shortfall a substitute covers (0..1+). */
export const coverageOf = (shortfall: number, estimated: number) => (shortfall > 0 ? estimated / shortfall : 0);

/* ───────────────────────────── the target ───────────────────────────── */

export type Target = {
  stateCodes: readonly string[];
  sports: readonly string[];
  channels: readonly string[];
  audienceTiers: readonly string[];
  audienceMinFollowers: number | null;
};

export type TargetFacts = {
  stateCode: string | null;
  /** The athlete's; null for a venue's or a team's item, where sport, tier and audience do not apply. */
  athlete: { sport: string; tier: string | null; maxFollowers: number | null } | null;
  channels: readonly string[];
};

/** Where a substitute misses the sponsor's target, in words; empty when it is on target (or no target is on file). */
export function targetMisses(t: Target, c: TargetFacts): string[] {
  const out: string[] = [];
  const up = (s: string) => s.trim().toUpperCase();
  if (t.stateCodes.length && !(c.stateCode && t.stateCodes.map(up).includes(up(c.stateCode)))) out.push("outside the sponsor's states");
  if (c.athlete) {
    if (t.sports.length && !t.sports.map(up).includes(up(c.athlete.sport))) out.push("not one of the sponsor's sports");
    if (t.audienceTiers.length && !(c.athlete.tier && t.audienceTiers.includes(c.athlete.tier))) out.push("outside the sponsor's audience tiers");
    if (t.audienceMinFollowers != null && (c.athlete.maxFollowers ?? 0) < t.audienceMinFollowers) out.push("under the sponsor's minimum audience");
  }
  if (t.channels.length && !c.channels.some((ch) => t.channels.includes(ch))) out.push("not on the sponsor's channels");
  return out;
}

/* ───────────────────────────── the options ───────────────────────────── */

export type Checks = { available: boolean; exclusivityClear: boolean; meetsTarget: boolean };

export type OptionDraft = {
  inventoryItemId: string;
  inventoryName: string;
  propertyName: string;
  format: string;
  units: number;
  estimatedDelivery: number;
  basis: Basis;
  /** The estimate rests on verified figures (automatic approval needs it). */
  verifiedEstimate: boolean;
  equivalencyScore: number;
  /** What the units cost BTG, at the item's price. */
  costCents: number;
  /** costCents − the shortfall's value: positive, BTG gives more than fell short. */
  costImpactCents: number;
  checks: Checks;
  /** Every failing check's detail, in words. */
  problems: string[];
  /** A minor athlete, or a school's item. */
  youth: boolean;
  /** Why it was suggested, in a sentence. */
  reason: string;
};

export const allPass = (c: Checks) => c.available && c.exclusivityClear && c.meetsTarget;

const better = (a: OptionDraft, b: OptionDraft) =>
  b.equivalencyScore - a.equivalencyScore || a.costImpactCents - b.costImpactCents || a.inventoryName.localeCompare(b.inventoryName) || a.inventoryItemId.localeCompare(b.inventoryItemId);

/**
 * The substitutes shown: up to OPTIONS_SHOWN passing every check, best first
 * (closest, then cheapest), then up to NEAR_MISSES_SHOWN failing one that are
 * closer than the best passing one — so BTG sees why they were not picked.
 */
export function chooseOptions(drafts: readonly OptionDraft[]): OptionDraft[] {
  const passing = drafts.filter((d) => allPass(d.checks)).sort(better).slice(0, OPTIONS_SHOWN);
  const bar = passing[0]?.equivalencyScore ?? -1;
  const near = drafts.filter((d) => !allPass(d.checks) && d.equivalencyScore > bar).sort(better).slice(0, NEAR_MISSES_SHOWN);
  return [...passing, ...near];
}

/** The best substitute: passing every check, closest, then cheapest. Null when none passes. */
export function bestOption<T extends Pick<OptionDraft, "checks" | "equivalencyScore" | "costImpactCents" | "inventoryName" | "inventoryItemId">>(options: readonly T[]): T | null {
  const ok = options.filter((o) => allPass(o.checks));
  return ok.length ? [...ok].sort((a, b) => better(a as unknown as OptionDraft, b as unknown as OptionDraft))[0]! : null;
}

/** The sentence an option carries. */
export function optionReason(o: Pick<OptionDraft, "estimatedDelivery" | "costImpactCents" | "problems">, shortfall: number, metric: GuaranteeMetric, basisWords: string): string {
  const cover = Math.round(coverageOf(shortfall, o.estimatedDelivery) * 100);
  const cost = Math.round(o.costImpactCents / 100) === 0 ? "even with the shortfall's value"
    : o.costImpactCents > 0 ? `${usd(o.costImpactCents)} more than the shortfall is worth` : `${usd(o.costImpactCents)} under the shortfall's value`;
  const base = `${basisWords}: about ${n(o.estimatedDelivery)} ${metric}, ${cover}% of the shortfall, ${cost}.`;
  return o.problems.length ? `${base} Can't be used: ${o.problems.join("; ")}.` : base;
}

/* ───────────────────────────── automatic approval ───────────────────────────── */

export type AutoFacts = {
  shortfall: number;
  /** The share of the flight gone, from the forecast. */
  elapsed: number;
  /** The sponsor's categories include an age-gated one. */
  sensitive: boolean;
};

export type AutoDecision = { approve: true; option: OptionDraft } | { approve: false; held: string[] };

/** Whether SponsorX approves the best substitute itself, or holds the shortfall for a person with every reason. */
/** The settings behind automatic approval: the built-in ones, or the tenant's active version (3S8-BE-01). */
export type AutoSettings = { autoMinCoverage: number; autoMinElapsed: number };

export function autoDecision(options: readonly OptionDraft[], f: AutoFacts, t: AutoSettings = { autoMinCoverage: AUTO_MIN_COVERAGE, autoMinElapsed: AUTO_MIN_ELAPSED }): AutoDecision {
  const best = bestOption(options);
  const held: string[] = [];
  if (!best) held.push("No substitute passes all three checks.");
  if (f.elapsed < t.autoMinElapsed) held.push(`Only ${Math.round(f.elapsed * 100)}% of the flight has gone; SponsorX approves on its own from ${Math.round(t.autoMinElapsed * 100)}%, when the shortfall is near-certain.`);
  if (f.sensitive) held.push("The sponsor's category is age-gated, so a person decides.");
  if (best) {
    const cover = coverageOf(f.shortfall, best.estimatedDelivery);
    if (cover < t.autoMinCoverage) held.push(`The best substitute covers ${Math.round(cover * 100)}% of the shortfall; SponsorX approves on its own from ${Math.round(t.autoMinCoverage * 100)}%.`);
    if (best.costImpactCents > 0) held.push(`The best substitute costs ${usd(best.costImpactCents)} more than the shortfall is worth.`);
    if (best.youth) held.push("The best substitute involves a minor or a school, so a person decides.");
    if (!best.verifiedEstimate) held.push("The best substitute's estimate rests on unverified or thin figures.");
  }
  return held.length || !best ? { approve: false, held } : { approve: true, option: best };
}

/** The note an automatic approval carries on the audit record and the campaign. */
export function autoNote(o: Pick<OptionDraft, "inventoryName" | "estimatedDelivery" | "costImpactCents" | "equivalencyScore">, shortfall: number, metric: GuaranteeMetric): string {
  return `Approved automatically by SponsorX: ${o.inventoryName} covers about ${n(o.estimatedDelivery)} of the ${n(shortfall)} ${metric} short `
    + `(${Math.round(o.equivalencyScore * 100)}% match), passes every check, and costs BTG no more than the shortfall is worth.`;
}
