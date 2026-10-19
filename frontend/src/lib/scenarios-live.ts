import type { ModelStamp } from "@/lib/intelligence";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's contract and pure helpers.

   THE CONTRACT — mounted 2026-10-15 by 3S7-BE-01 (backend/src/domain/
   scenario-engine.ts + scenario-rules.ts, contracts/intelligence.ts;
   documentation/SponsorX-Scenarios.md), reconciled here 2026-10-19. Roles:
   the page's own (SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES), tenant
   scoped, behind the per-tenant `scenarios` feature flag (a switched-off
   tenant reads 403 `feature_off`, which server/engine.ts shows as pending).

   GET  /intelligence/scenarios?page&size → ApiScenarioDesk
        The saved scenarios (one page, newest first), the starting inputs
        the engine suggests ($10,000, the tenant's benchmark CPM or $20,
        60% posts / 40% videos), and the choices it can calculate for:
        formats, sports, states, age bands. The planner offers ONLY
        options.formats — today social posts and videos, the two the engine
        can both price and measure in views — never a list of its own.
   POST /intelligence/scenarios/calculate { inputs } → ScenarioResult
        Pure what-if: nothing is stored.
   POST /intelligence/scenarios { name, inputs } → 201 ApiSavedScenario
        Calculates and stores; the stored result keeps its model stamp, and
        the record carries `savedBy` (the saver's email).
   Errors: inputs the engine can't take are a 422 `scenario_inputs` whose
        message is the problems in words, joined by a space — the planner
        shows that text verbatim next to the inputs. validateInputs below
        says the same words first, so a half-dragged slider never leaves
        the browser; the contract's integer bounds (a zod 400 with no words
        of its own) are pre-empted the same way.

   MONEY in integer cents (budgetCents, cpmCents). A mix is the share of
   the budget per format; shares are 0..1 and sum to 1 (normaliseMix makes
   them so), one line per format, at most MIX_MAX lines.

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
  /** The budget, reduced in proportion when likely delivery falls short of what is sold. */
  expectedRevenueCents: number;
  /** 0..1 — the chance the plan delivers in full (3S4-BE-01's method). */
  deliveryProbability: number;
  stamp: ModelStamp;
  /** The engine's caveats, in words — every fallback is named here. */
  notes: string[];
};

export type ApiSavedScenario = {
  id: string;
  name: string;
  inputs: ScenarioInputs;
  result: ScenarioResult;
  savedAt: string;
  /** Who saved it: the user's email, or "a former user" once they are gone. */
  savedBy: string;
};

export type ScenarioOptions = {
  /** What the engine can price and measure — the only formats the planner offers. */
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

/** The contract's hard limits (ScenarioInputs / ScenarioSaveInput, contracts/intelligence.ts). */
export const BUDGET_MAX_CENTS = 2_000_000_000;
export const CPM_MAX_CENTS = 10_000_000;
export const MIX_MAX = 10;
export const NAME_MAX = 120;

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

const wholeUsd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * What's wrong with these inputs, in words; [] when the engine can take
 * them. The same words, in the same order, as the engine's own
 * `inputProblems` (scenario-rules.ts) — so whichever side speaks, the
 * planner says one thing. `offered` is options.formats' keys: with it, a
 * format the engine can't price is named here too. The three bound checks
 * are the contract's integer limits, which the API would otherwise refuse
 * with a generic 400.
 */
export function validateInputs(i: ScenarioInputs, offered?: readonly string[]): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(i.budgetCents) || i.budgetCents <= 0) issues.push("Set a budget above zero.");
  else if (i.budgetCents > BUDGET_MAX_CENTS) issues.push(`The budget is at most ${wholeUsd(BUDGET_MAX_CENTS)}.`);
  if (!Number.isInteger(i.cpmCents) || i.cpmCents <= 0) issues.push("Set a CPM above zero.");
  else if (i.cpmCents > CPM_MAX_CENTS) issues.push(`The CPM is at most ${wholeUsd(CPM_MAX_CENTS)} per 1,000 views.`);
  if (!i.mix.length) issues.push("Add at least one inventory format.");
  else if (i.mix.length > MIX_MAX) issues.push(`The mix holds at most ${MIX_MAX} formats.`);
  const formats = i.mix.map((l) => l.format);
  if (new Set(formats).size !== formats.length) issues.push("Each format appears once in the mix.");
  if (offered) {
    const unknown = formats.filter((f) => !offered.includes(f));
    if (unknown.length) issues.push(`The planner can't price ${unknown.join(", ")}.`);
  }
  if (i.mix.some((l) => !Number.isFinite(l.share) || l.share < 0 || l.share > 1)) issues.push("Each format's share is between 0% and 100%.");
  else if (i.mix.length && Math.abs(mixTotal(i.mix) - 1) > 0.001) issues.push("The mix must add up to 100%.");
  if ((i.audience.stateCodes ?? []).some((c) => !/^[A-Z]{2}$/.test(c))) issues.push("State codes are two capital letters.");
  return issues;
}

/** The problems as one line — the form the API's 422 message takes. */
export function problemsText(issues: readonly string[]): string {
  return issues.join(" ");
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

/**
 * An age band as the athlete records keep it (UNDER_16 | 16_17 | 18_PLUS),
 * said for a sponsor. An unknown band shows as it came.
 */
export function ageBandLabel(band: string): string {
  switch (band) {
    case "UNDER_16":
      return "Under 16";
    case "16_17":
      return "16–17";
    case "18_PLUS":
      return "18+";
    default:
      return band;
  }
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

/* `?demo=sample` only (development preview + tests). Never a live figure.
   Shaped like the live desk: the engine's two formats, its age-band keys,
   an email in savedBy. */

export const SAMPLE_MODEL = "scenario-sample@0.0.0";

const SAMPLE_REACH: Record<string, number> = { SOCIAL_POST: 1.15, VIDEO: 1.3 };

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
  budgetCents: 10_000_00,
  cpmCents: 20_00,
  audience: {},
  mix: [
    { format: "SOCIAL_POST", share: 0.6 },
    { format: "VIDEO", share: 0.4 },
  ],
};

const SAMPLE_A: ScenarioInputs = {
  budgetCents: 25_000_00,
  cpmCents: 12_00,
  audience: { sport: "Football", stateCodes: ["TX"] },
  mix: [
    { format: "SOCIAL_POST", share: 0.7 },
    { format: "VIDEO", share: 0.3 },
  ],
};

const SAMPLE_B: ScenarioInputs = {
  budgetCents: 40_000_00,
  cpmCents: 10_50,
  audience: { sport: "Football", stateCodes: ["OK", "TX"], ageBand: "18_PLUS" },
  mix: [
    { format: "VIDEO", share: 0.6 },
    { format: "SOCIAL_POST", share: 0.4 },
  ],
};

export const SAMPLE_SCENARIO_DESK: ApiScenarioDesk = {
  scenarios: [
    { id: "sc_sample_1", name: "Texas football — starter", inputs: SAMPLE_A, result: sampleResult(SAMPLE_A), savedAt: "2026-10-12T15:00:00.000Z", savedBy: "sales@sample.invalid" },
    { id: "sc_sample_2", name: "Two-state video push", inputs: SAMPLE_B, result: sampleResult(SAMPLE_B), savedAt: "2026-10-12T15:20:00.000Z", savedBy: "sales@sample.invalid" },
  ],
  page: { page: 1, size: 12, total: 2, pages: 1 },
  defaults: SAMPLE_DEFAULTS,
  options: {
    formats: [
      { key: "SOCIAL_POST", label: "Social post" },
      { key: "VIDEO", label: "Video" },
    ],
    sports: ["Basketball", "Football", "Soccer", "Volleyball"],
    stateCodes: ["KS", "OK", "TX"],
    ageBands: ["16_17", "18_PLUS"],
  },
};
