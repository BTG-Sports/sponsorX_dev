import type { ModelStamp } from "@/lib/intelligence";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's contract and pure helpers.

   PROPOSED CONTRACT (3S7-BE-01 scenario planning is not built yet; it waits
   on 3S4-BE-01 delivery forecast — this is what the screen is built
   against). Roles: the page's own (SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR,
   SALES), tenant scoped.

   GET  /intelligence/scenarios?page&size → ApiScenarioDesk
        The saved scenarios (one page, newest first), the starting inputs
        the engine suggests, and the choices it can calculate for (formats,
        sports, states, age bands) — so the planner never offers a format the
        engine can't price.
   POST /intelligence/scenarios/calculate { inputs } → ScenarioResult
        Pure what-if: nothing is stored.
   POST /intelligence/scenarios { name, inputs } → ApiSavedScenario
        Calculates and stores; the stored result keeps its model stamp.

   MONEY in integer cents. A mix is the share of the budget per inventory
   format; shares are 0..1 and sum to 1 (normaliseMix makes them).

   Every figure on the planner is the engine's answer to these inputs. The
   only arithmetic here is the A-vs-B difference of two engine answers —
   and the dev-only sample calculator, which exists for `?demo=sample` and
   the tests and is labelled as such everywhere it shows.
   -------------------------------------------------------------------------- */

export type MixLine = { format: string; share: number };

export type ScenarioAudience = { sport?: string; stateCodes?: string[]; ageBand?: string };

export type ScenarioInputs = {
  budgetCents: number;
  cpmCents: number;
  audience: ScenarioAudience;
  mix: MixLine[];
};

export type ScenarioResult = {
  expectedImpressions: { low: number; mid: number; high: number };
  expectedRevenueCents: number;
  /** 0..1 — the chance the plan delivers in full (3S4-BE-01's forecast). */
  deliveryProbability: number;
  stamp: ModelStamp;
  /** The engine's caveats, in words. */
  notes: string[];
};

export type ApiSavedScenario = {
  id: string;
  name: string;
  inputs: ScenarioInputs;
  result: ScenarioResult;
  savedAt: string;
  /** The saver's display name. */
  savedBy?: string;
};

export type ScenarioOptions = {
  formats: { key: string; label: string }[];
  sports: string[];
  stateCodes: string[];
  ageBands: string[];
};

export type ApiScenarioDesk = {
  scenarios: ApiSavedScenario[];
  page: PageInfo;
  defaults: ScenarioInputs;
  options: ScenarioOptions;
};

export const SCENARIOS_PATH = "/admin/intelligence/scenarios";

/** Slider ranges — UI bounds, not figures. Typed fields may go past them. */
export const BUDGET_RANGE = { min: 1_000_00, max: 250_000_00, step: 500_00 } as const;
export const CPM_RANGE = { min: 1_00, max: 60_00, step: 25 } as const;

/* -------------------------------------------------------------------- mix */

export function mixTotal(mix: readonly MixLine[]): number {
  return mix.reduce((s, l) => s + (Number.isFinite(l.share) && l.share > 0 ? l.share : 0), 0);
}

/**
 * A clean mix: one line per format (duplicates merged), no empty or
 * non-positive shares, scaled to sum to exactly 1. An all-zero mix is [].
 */
export function normaliseMix(mix: readonly MixLine[]): MixLine[] {
  const merged = new Map<string, number>();
  for (const l of mix) {
    const f = l.format?.trim();
    if (!f || !Number.isFinite(l.share) || l.share <= 0) continue;
    merged.set(f, (merged.get(f) ?? 0) + l.share);
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const lines = [...merged].map(([format, share]) => ({ format, share: Math.round((share / total) * 10_000) / 10_000 }));
  /* Rounding drift goes to the largest line, so the sum is exactly 1. */
  const drift = 1 - lines.reduce((s, l) => s + l.share, 0);
  const big = lines.reduce((bi, l, i) => (l.share > lines[bi].share ? i : bi), 0);
  lines[big] = { ...lines[big], share: Math.round((lines[big].share + drift) * 10_000) / 10_000 };
  return lines;
}

/**
 * Move one format's slider: it takes `share` (clamped 0..1) and the others
 * share what's left in their current proportions — evenly when they were
 * all at zero. The slider the planner drags, so the mix always sums to 1.
 */
export function rebalanceMix(mix: readonly MixLine[], format: string, share: number): MixLine[] {
  const s = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  const others = mix.filter((l) => l.format !== format);
  if (others.length === 0) return [{ format, share: 1 }];
  const rest = 1 - s;
  const otherTotal = mixTotal(others);
  const scaled = others.map((l) => ({
    format: l.format,
    share: otherTotal > 0 ? (Math.max(0, l.share) / otherTotal) * rest : rest / others.length,
  }));
  return mix.map((l) => (l.format === format ? { format, share: s } : scaled.find((o) => o.format === l.format)!));
}

/** Add a format at an even share, the rest scaled down to make room. */
export function addFormat(mix: readonly MixLine[], format: string): MixLine[] {
  if (mix.some((l) => l.format === format)) return [...mix];
  return rebalanceMix([...mix, { format, share: 0 }], format, 1 / (mix.length + 1));
}

/** Drop a format; the rest scale up to fill its share. */
export function removeFormat(mix: readonly MixLine[], format: string): MixLine[] {
  const rest = mix.filter((l) => l.format !== format);
  if (rest.length === 0) return [];
  const clean = normaliseMix(rest);
  /* Every remaining share was zero: split evenly rather than drop them all. */
  return clean.length > 0 ? clean : normaliseMix(rest.map((l) => ({ ...l, share: 1 })));
}

/* ------------------------------------------------------------- validation */

/** What's wrong with these inputs, in words; [] when the engine can take them. */
export function validateInputs(i: ScenarioInputs): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(i.budgetCents) || i.budgetCents <= 0) issues.push("Set a budget above zero.");
  if (!Number.isInteger(i.cpmCents) || i.cpmCents <= 0) issues.push("Set a CPM above zero.");
  if (i.mix.length === 0) issues.push("Add at least one inventory format.");
  else {
    const formats = i.mix.map((l) => l.format);
    if (new Set(formats).size !== formats.length) issues.push("Each format appears once in the mix.");
    if (i.mix.some((l) => !Number.isFinite(l.share) || l.share < 0 || l.share > 1)) issues.push("Each format's share is between 0% and 100%.");
    else if (Math.abs(mixTotal(i.mix) - 1) > 0.001) issues.push("The mix must add up to 100%.");
  }
  for (const c of i.audience.stateCodes ?? []) {
    if (!/^[A-Z]{2}$/.test(c)) {
      issues.push(`“${c}” isn't a two-letter state code.`);
      break;
    }
  }
  return issues;
}

/** The inputs the engine is sent: mix normalised, empty audience keys dropped. */
export function cleanInputs(i: ScenarioInputs): ScenarioInputs {
  const audience: ScenarioAudience = {};
  if (i.audience.sport) audience.sport = i.audience.sport;
  if (i.audience.ageBand) audience.ageBand = i.audience.ageBand;
  const states = [...new Set((i.audience.stateCodes ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
  if (states.length) audience.stateCodes = states;
  return { budgetCents: Math.round(i.budgetCents), cpmCents: Math.round(i.cpmCents), audience, mix: normaliseMix(i.mix) };
}

/** "tx, ok  KS" → ["KS", "OK", "TX"], kept only if the engine offers them. */
export function parseStateCodes(text: string, allowed?: readonly string[]): string[] {
  const codes = text
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((c) => c.length === 2);
  const ok = allowed ? codes.filter((c) => allowed.includes(c)) : codes;
  return [...new Set(ok)].sort();
}

/** A stable key for "same inputs" — skips recalculating what's on screen. */
export function inputsKey(i: ScenarioInputs): string {
  return JSON.stringify(cleanInputs(i));
}

/* ------------------------------------------------------------- comparison */

export type Delta = { delta: number; ratio: number | null };

export type ScenarioDiff = {
  impressionsMid: Delta;
  impressionsLow: Delta;
  impressionsHigh: Delta;
  revenueCents: Delta;
  /** Percentage points, B − A (0.08 = 8 pp). */
  deliveryProbability: number;
};

const delta = (a: number, b: number): Delta => ({ delta: b - a, ratio: a !== 0 ? (b - a) / a : null });

/** B against A — every difference is B − A. */
export function diffResults(a: ScenarioResult, b: ScenarioResult): ScenarioDiff {
  return {
    impressionsMid: delta(a.expectedImpressions.mid, b.expectedImpressions.mid),
    impressionsLow: delta(a.expectedImpressions.low, b.expectedImpressions.low),
    impressionsHigh: delta(a.expectedImpressions.high, b.expectedImpressions.high),
    revenueCents: delta(a.expectedRevenueCents, b.expectedRevenueCents),
    deliveryProbability: b.deliveryProbability - a.deliveryProbability,
  };
}

/* ------------------------------------------------------------- formatting */

/** 1.24M / 860K / 940 — impressions on a screen share. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${Number((n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2))}M`;
  if (a >= 10_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toLocaleString("en-US");
}

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");

export function signedCompact(n: number): string {
  return `${sign(n)}${compact(Math.abs(n))}`;
}

export function signedUsd(cents: number): string {
  return `${sign(cents)}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

/** +8 pp — a change in a probability. */
export function signedPoints(fraction: number): string {
  const v = Math.round(fraction * 100);
  return `${sign(v)}${Math.abs(v)} pp`;
}

export function signedRatio(r: number | null): string {
  if (r === null) return "—";
  const v = Math.round(r * 100);
  return `${sign(v)}${Math.abs(v)}%`;
}

export function utcMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

/* ------------------------------------------------------------------ SAMPLE */

/* `?demo=sample` only (development preview + tests). Never a live figure. */

export const SAMPLE_MODEL = "scenario-sample@0.0.0";

const SAMPLE_REACH: Record<string, number> = { SOCIAL_POST: 1.15, VIDEO: 1.3, SIGNAGE: 0.85, APPEARANCE: 0.6, TICKETS: 0.5 };

/**
 * The sample "engine" — a toy formula so the dev preview reacts to the
 * sliders. Not a model: budget ÷ CPM × 1000, nudged by the mix, with a fixed
 * band. Stamped SAMPLE_MODEL so it can never pass for an engine answer.
 */
export function sampleResult(inputs: ScenarioInputs): ScenarioResult {
  const i = cleanInputs(inputs);
  const base = i.cpmCents > 0 ? (i.budgetCents / i.cpmCents) * 1000 : 0;
  const reach = i.mix.reduce((s, l) => s + l.share * (SAMPLE_REACH[l.format] ?? 1), 0) || 1;
  const narrow = (i.audience.sport ? 0.9 : 1) * (i.audience.stateCodes?.length ? 0.85 : 1) * (i.audience.ageBand ? 0.92 : 1);
  const mid = Math.round(base * reach * narrow);
  const probability = Math.max(0.2, Math.min(0.97, 0.95 - mid / 40_000_000 - (1 - narrow) * 0.3));
  return {
    expectedImpressions: { low: Math.round(mid * 0.82), mid, high: Math.round(mid * 1.14) },
    expectedRevenueCents: Math.round(i.budgetCents * probability + i.budgetCents * (1 - probability) * 0.6),
    deliveryProbability: Math.round(probability * 100) / 100,
    stamp: { modelVersion: SAMPLE_MODEL, confidence: 0.6, computedAt: "2026-10-13T09:00:00.000Z" },
    notes: ["Sample figures from a toy formula — not an engine answer."],
  };
}

const SAMPLE_DEFAULTS: ScenarioInputs = {
  budgetCents: 25_000_00,
  cpmCents: 12_00,
  audience: { sport: "Football", stateCodes: ["TX"] },
  mix: [
    { format: "SOCIAL_POST", share: 0.5 },
    { format: "VIDEO", share: 0.3 },
    { format: "SIGNAGE", share: 0.2 },
  ],
};

const SAMPLE_B: ScenarioInputs = {
  budgetCents: 40_000_00,
  cpmCents: 10_50,
  audience: { sport: "Football", stateCodes: ["OK", "TX"], ageBand: "18-24" },
  mix: [
    { format: "VIDEO", share: 0.6 },
    { format: "SOCIAL_POST", share: 0.4 },
  ],
};

export const SAMPLE_SCENARIO_DESK: ApiScenarioDesk = {
  scenarios: [
    { id: "sc_sample_1", name: "Texas football — starter", inputs: SAMPLE_DEFAULTS, result: sampleResult(SAMPLE_DEFAULTS), savedAt: "2026-10-12T15:00:00.000Z", savedBy: "Sample Salesperson" },
    { id: "sc_sample_2", name: "Two-state video push", inputs: SAMPLE_B, result: sampleResult(SAMPLE_B), savedAt: "2026-10-12T15:20:00.000Z", savedBy: "Sample Salesperson" },
  ],
  page: { page: 1, size: 12, total: 2, pages: 1 },
  defaults: SAMPLE_DEFAULTS,
  options: {
    formats: [
      { key: "SOCIAL_POST", label: "Social post" },
      { key: "VIDEO", label: "Video" },
      { key: "SIGNAGE", label: "Signage" },
      { key: "APPEARANCE", label: "Appearance" },
      { key: "TICKETS", label: "Tickets" },
    ],
    sports: ["Basketball", "Football", "Soccer", "Volleyball"],
    stateCodes: ["KS", "OK", "TX"],
    ageBands: ["18-24", "25-34", "35-44", "45+"],
  },
};
