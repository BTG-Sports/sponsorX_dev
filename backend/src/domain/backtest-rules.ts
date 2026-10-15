/**
 * Backtest arithmetic and the simulated history — 3S9-QA-01
 * (documentation/SponsorX-Backtest.md §2–§4).
 *
 * Pure: no database. backtest-engine.ts gathers real history and stores runs.
 *
 * "Run the models against historical campaigns and check whether they would
 * actually have been right." Two questions per model:
 *
 *   ACCURACY      how far its answers were from what happened;
 *   CALIBRATION   whether its stated confidence meant what it said — of the
 *                 campaigns the forecast gave a 70% chance, did about 70% make
 *                 it? Does a price stated with high confidence miss by less?
 *
 * THE FORECAST is judged on campaigns that have ended: each forecast made
 * while the campaign ran, against the delivery it actually reached.
 * THE PRICING ENGINE is judged on orders booked after a suggestion existed:
 * the suggested CPM against the CPM the order actually achieved (net sell ×
 * 1,000 ÷ verified views).
 *
 * SIMULATED HISTORY. Until real campaigns end, the forecast is also run over
 * a simulated history (user rule, 2026-09-24: simulate rather than wait) —
 * seeded, so the same run gives the same numbers, and always labelled
 * simulated. Pricing is not simulated: an invented "actual" CPM would only
 * measure the simulator's own assumptions.
 */
import { forecastFlow } from "./forecast-rules";

export type Metric = { label: string; value: number; unit?: string; better?: "higher" | "lower" };
export type CalibrationBand = { band: string; n: number; predicted: number; observed: number };

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

/* ───────────────────────────── the forecast ───────────────────────────── */

export type ForecastPoint = { probability: number; mid: number; final: number; guarantee: number; elapsed: number };

export const PROBABILITY_BANDS = [
  { band: "under 50%", lo: 0, hi: 0.5 },
  { band: "50% to 80%", lo: 0.5, hi: 0.8 },
  { band: "80% or more", lo: 0.8, hi: 1.0001 },
] as const;

/** Accuracy of the projected final and calibration of the probability of the guarantee. */
export function scoreForecasts(points: readonly ForecastPoint[]): { sampleSize: number; metrics: Metric[]; calibration: CalibrationBand[] } {
  const usable = points.filter((p) => p.final > 0);
  const errors = usable.map((p) => Math.abs(p.mid - p.final) / p.final);
  const hits = points.map((p) => (p.final >= p.guarantee ? 1 : 0));
  const brier = mean(points.map((p, i) => (p.probability - hits[i]!) ** 2));
  const late = usable.filter((p) => p.elapsed >= 0.5);
  return {
    sampleSize: points.length,
    metrics: [
      { label: "Forecasts judged", value: points.length },
      { label: "Mean error of the projected final", value: round(mean(errors) * 100, 1), unit: "%", better: "lower" },
      { label: "Within 10% of the final", value: round((errors.filter((e) => e <= 0.1).length / Math.max(1, errors.length)) * 100, 1), unit: "%", better: "higher" },
      { label: "Mean error, second half of the flight", value: round(mean(late.map((p) => Math.abs(p.mid - p.final) / p.final)) * 100, 1), unit: "%", better: "lower" },
      { label: "Brier score of the probability", value: round(brier, 4), better: "lower" },
    ],
    calibration: PROBABILITY_BANDS.map((b) => {
      const inBand = points.map((p, i) => ({ p, hit: hits[i]! })).filter((x) => x.p.probability >= b.lo && x.p.probability < b.hi);
      return { band: b.band, n: inBand.length, predicted: round(mean(inBand.map((x) => x.p.probability)), 3), observed: round(mean(inBand.map((x) => x.hit)), 3) };
    }),
  };
}

/* ───────────────────────────── pricing ───────────────────────────── */

export type PricingPoint = { recommendedCpmCents: number; actualCpmCents: number; confidence: number };

export const CONFIDENCE_BANDS = [
  { band: "low (under 50%)", lo: 0, hi: 0.5 },
  { band: "medium (50% to 75%)", lo: 0.5, hi: 0.75 },
  { band: "high (75% or more)", lo: 0.75, hi: 1.0001 },
] as const;

/** Accuracy of the suggested CPM against what orders achieved, and whether confidence tracks accuracy. */
export function scorePricing(points: readonly PricingPoint[]): { sampleSize: number; metrics: Metric[]; calibration: CalibrationBand[] } {
  const usable = points.filter((p) => p.actualCpmCents > 0);
  const err = (p: PricingPoint) => Math.abs(p.recommendedCpmCents - p.actualCpmCents) / p.actualCpmCents;
  return {
    sampleSize: usable.length,
    metrics: [
      { label: "Orders judged", value: usable.length },
      { label: "Mean error of the suggested CPM", value: round(mean(usable.map(err)) * 100, 1), unit: "%", better: "lower" },
      { label: "Within 20% of the achieved CPM", value: round((usable.filter((p) => err(p) <= 0.2).length / Math.max(1, usable.length)) * 100, 1), unit: "%", better: "higher" },
    ],
    /* For pricing, "observed" is the share within 20% in each confidence band: it should rise with confidence. */
    calibration: CONFIDENCE_BANDS.map((b) => {
      const inBand = usable.filter((p) => p.confidence >= b.lo && p.confidence < b.hi);
      return { band: b.band, n: inBand.length, predicted: round(mean(inBand.map((p) => p.confidence)), 3), observed: round(inBand.filter((p) => err(p) <= 0.2).length / Math.max(1, inBand.length), 3) };
    }),
  };
}

/* ───────────────────────────── the simulated history ───────────────────────────── */

/** A small seeded generator (mulberry32): the same seed, the same history. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return { next, normal, between: (lo: number, hi: number) => lo + (hi - lo) * next() };
}

export const SIMULATED_CAMPAIGNS = 300;
export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;

/**
 * A simulated history for the forecast: campaigns with a guarantee, a true
 * daily rate somewhere between 60% and 130% of plan, noisy days, slow starts
 * (posts lag the flight) and, for one in five, a change of pace mid-flight —
 * forecast at a quarter, half and three quarters of the way, with the given
 * trust share, and judged against where each actually ended.
 */
export function simulateForecastHistory(seed = 20261015, fullTrust?: number): ForecastPoint[] {
  const r = seeded(seed);
  const out: ForecastPoint[] = [];
  for (let c = 0; c < SIMULATED_CAMPAIGNS; c++) {
    const total = Math.round(r.between(20, 60));
    const guarantee = Math.round(r.between(10_000, 100_000));
    let rate = (guarantee / total) * r.between(0.6, 1.3);
    const shiftAt = r.next() < 0.2 ? Math.round(r.between(0.3, 0.7) * total) : -1;
    const shiftBy = r.between(0.5, 1.5);
    const daily: number[] = [];
    for (let d = 0; d < total; d++) {
      if (d === shiftAt) rate *= shiftBy;
      const slowStart = d < total * 0.2 && r.next() < 0.3;
      daily.push(slowStart ? 0 : Math.max(0, Math.round(rate * (1 + 0.5 * r.normal()))));
    }
    const final = daily.reduce((t, x) => t + x, 0);
    for (const at of CHECKPOINTS) {
      const gone = Math.max(1, Math.round(total * at));
      const p = forecastFlow(guarantee, daily.slice(0, gone), total, fullTrust);
      out.push({ probability: p.probability, mid: p.mid, final, guarantee, elapsed: gone / total });
    }
  }
  return out;
}
