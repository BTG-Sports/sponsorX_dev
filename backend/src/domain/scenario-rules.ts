/**
 * The scenario planner's rules — 3S7-BE-01 (documentation/SponsorX-Scenarios.md).
 *
 * Pure: no database, no clock. scenario-engine.ts gathers the facts.
 *
 * WHAT IF a sponsor spends this budget at this price per 1,000 views, on
 * this audience, split across these formats?
 *
 *   1. What it buys. Each format's share of the budget ÷ its price per post
 *      (the tenant's median booked sell price for that format, or the NIL
 *      job catalogue's sell band midpoint before anything is booked).
 *   2. What that delivers. Posts × the audience's verified views per post —
 *      low (25th percentile), likely (median), high (75th) — from the
 *      matching athletes' feature snapshots; the whole tenant's when fewer
 *      than MIN_SEGMENT_ATHLETES match.
 *   3. What is sold. Budget ÷ the CPM × 1,000: the views the sponsor would
 *      be promised.
 *   4. The chance it delivers in full: a normal approximation, the spread
 *      taken from the 25th–75th percentile band — the forecast's method
 *      (3S4-BE-01).
 *   5. Expected revenue (user, 2026-10-15): the budget, reduced in
 *      proportion when the likely delivery falls short of what is sold —
 *      that reduction is what a make-good would cost.
 */
import { normalCdf } from "./forecast-rules";

export const SCENARIO_MODEL_VERSION = "scenario-rules@1.0.0";
/** The formats the planner can price and measure in views. */
export const SCENARIO_FORMATS = [
  { key: "SOCIAL_POST", label: "Social post", jobs: ["SX-01", "SX-02"] },
  { key: "VIDEO", label: "Video", jobs: ["SX-03", "SX-04", "SX-06"] },
] as const;
export type ScenarioFormat = (typeof SCENARIO_FORMATS)[number]["key"];
/** Fewer matching athletes than this and the whole tenant's history is used. */
export const MIN_SEGMENT_ATHLETES = 3;
/** z for the 25th and 75th percentiles. */
const Z_QUARTILE = 0.6745;

export type ScenarioInputs = {
  budgetCents: number;
  cpmCents: number;
  audience: { sport?: string; stateCodes?: string[]; ageBand?: string };
  mix: Array<{ format: string; share: number }>;
};

export type ViewsPerPost = { p25: number; median: number; p75: number; athletes: number; basis: "segment" | "tenant" | "none" };
export type UnitPrice = { cents: number; basis: "booked" | "catalogue" };

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

/** The value at percentile p (0..1) of sorted numbers, interpolated. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** What is wrong with these inputs, in words; [] when the engine can take them. */
export function inputProblems(i: ScenarioInputs): string[] {
  const out: string[] = [];
  const known = new Set<string>(SCENARIO_FORMATS.map((f) => f.key));
  if (!Number.isInteger(i.budgetCents) || i.budgetCents <= 0) out.push("Set a budget above zero.");
  if (!Number.isInteger(i.cpmCents) || i.cpmCents <= 0) out.push("Set a CPM above zero.");
  if (!i.mix.length) out.push("Add at least one inventory format.");
  const formats = i.mix.map((l) => l.format);
  if (new Set(formats).size !== formats.length) out.push("Each format appears once in the mix.");
  const unknown = formats.filter((f) => !known.has(f));
  if (unknown.length) out.push(`The planner can't price ${unknown.join(", ")}.`);
  if (i.mix.some((l) => !Number.isFinite(l.share) || l.share < 0 || l.share > 1)) out.push("Each format's share is between 0% and 100%.");
  else if (i.mix.length && Math.abs(i.mix.reduce((t, l) => t + l.share, 0) - 1) > 0.001) out.push("The mix must add up to 100%.");
  if ((i.audience.stateCodes ?? []).some((c) => !/^[A-Z]{2}$/.test(c))) out.push("State codes are two capital letters.");
  return out;
}

export type ScenarioResult = {
  expectedImpressions: { low: number; mid: number; high: number };
  expectedRevenueCents: number;
  deliveryProbability: number;
  stamp: { modelVersion: string; confidence: number; computedAt: string };
  notes: string[];
};

/** The planner's answer to one set of inputs. */
export function calculate(i: ScenarioInputs, facts: { prices: Record<string, UnitPrice>; views: ViewsPerPost }, computedAt: string): ScenarioResult {
  const notes: string[] = [];
  const sold = (i.budgetCents / i.cpmCents) * 1000;
  let posts = 0;
  for (const line of i.mix) {
    const price = facts.prices[line.format]!;
    const units = (i.budgetCents * line.share) / price.cents;
    posts += units;
    if (price.basis === "catalogue") notes.push(`No ${line.format === "VIDEO" ? "videos" : "social posts"} booked yet: priced at the catalogue's ${usd(price.cents)} a post.`);
  }
  const v = facts.views;
  let low: number; let mid: number; let high: number; let probability: number; let confidence: number;
  if (v.basis === "none") {
    /* Nothing to judge delivery by: what is bought is assumed to deliver what is sold, and the chance is a coin toss. */
    low = mid = high = Math.round(sold);
    probability = 0.5;
    confidence = 0.2;
    notes.push("No verified delivery history yet: the views are assumed to match the price, and the chance of delivering is unknown (shown as 50%).");
  } else {
    low = Math.round(posts * v.p25);
    mid = Math.round(posts * v.median);
    high = Math.round(posts * v.p75);
    const sd = (high - low) / (2 * Z_QUARTILE);
    probability = sd > 0 ? round4(normalCdf((mid - sold) / sd)) : mid >= sold ? 1 : 0;
    confidence = v.basis === "segment" ? 0.8 : 0.6;
    if (v.basis === "tenant") notes.push(`Fewer than ${MIN_SEGMENT_ATHLETES} athletes with a delivery record match this audience: every athlete's history is used instead.`);
    else notes.push(`Based on ${v.athletes} matching athletes' verified views per post.`);
  }
  notes.unshift(`The budget buys about ${n(posts)} post(s); at this CPM the sponsor is sold ${n(sold)} views.`);
  if (mid < sold) notes.push(`Likely delivery is ${n(sold - mid)} views short of what is sold: revenue is reduced by what a make-good would cost.`);
  return {
    expectedImpressions: { low, mid, high },
    expectedRevenueCents: Math.round(i.budgetCents * Math.min(1, sold > 0 ? mid / sold : 0)),
    deliveryProbability: probability,
    stamp: { modelVersion: SCENARIO_MODEL_VERSION, confidence, computedAt },
    notes,
  };
}
