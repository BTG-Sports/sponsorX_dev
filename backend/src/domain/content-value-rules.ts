/**
 * Content Value Score v1 — P3-BE-10, §14, P0-DATA-03.
 *
 * A number a BTG staffer can defend to an athlete's face, which is the whole
 * reason the factors are stored and not just the total. "Your score is 62" is
 * unanswerable; "your reliability is 40 and it is 15% of the score" is a
 * conversation about something the athlete can change.
 *
 * Pure, like `athlete-state.ts` and `guardian-rules.ts`: it imports
 * nothing, so the arithmetic is testable without a database and will not
 * quietly stop being tested when one is unavailable. The persistence lives
 * in `content-value-score.ts`.
 *
 * PHASE 1 IS RULES, NOT MODELLING. Each factor is assessed 0-100 by the
 * Athlete Network Manager from the inputs §14 lists. `method: "rules-v1"` is
 * stamped on every snapshot so Phase 3 can replace the method without
 * replacing the model, and so an old score is never silently reinterpreted
 * under a new one.
 *
 * A MISSING FACTOR IS NOT ZERO. This is the rule most likely to be got wrong,
 * and it changes the answer a lot. A zero is an assessment — "we looked, and
 * it is bad". An absence is "we have not looked". A new athlete with no
 * sponsor-performance history scored as zero is punished for having no
 * history, which is exactly backwards for a network trying to recruit. So an
 * absent factor is dropped and the score is computed over the weights that
 * remain, with the gap recorded alongside it.
 */

/** §14's seven factors and their weights. They total 100. */
export const SCORE_WEIGHTS = {
  engagement: 25,
  contentQuality: 20,
  audience: 15,
  reliability: 15,
  geography: 10,
  sportBrandFit: 10,
  sponsorPerformance: 5,
} as const;

export type ScoreFactor = keyof typeof SCORE_WEIGHTS;
export const SCORE_FACTORS = Object.keys(SCORE_WEIGHTS) as ScoreFactor[];

/** The method stamped on every snapshot. Phase 3 replaces this, not the model. */
export const SCORE_METHOD = "rules-v1" as const;

/** An assessment per factor, 0-100. Omit a factor that has not been assessed
 *  — do not send zero. */
export type FactorAssessment = Partial<Record<ScoreFactor, number>>;

export type ScoreBreakdown = {
  score: number;
  method: typeof SCORE_METHOD;
  factors: Array<{
    factor: ScoreFactor;
    value: number | null;
    weight: number;
    /** The weight actually applied after absences are redistributed. */
    effectiveWeight: number;
    contribution: number;
  }>;
  /** Share of §14's weight that could not be assessed, 0-100. A score with a
   *  large gap is a weak score and the number says so out loud. */
  assessedGapPercent: number;
};

export class NoFactorsAssessedError extends Error {
  readonly status = 422;
  constructor() {
    super(
      "A score needs at least one assessed factor. Scoring an athlete nobody " +
        "has looked at would produce a number with no assessment behind it.",
    );
    this.name = "NoFactorsAssessedError";
  }
}

export class FactorOutOfRangeError extends Error {
  readonly status = 422;
  constructor(factor: string, value: number) {
    super(`Factor ${factor} is ${value}; every factor is assessed 0-100 (§14).`);
    this.name = "FactorOutOfRangeError";
  }
}

/**
 * Compute the score and the breakdown behind it. Pure — no database, so the
 * arithmetic is testable without one, which is the same split `athlete-state`
 * and `guardian-rules` use.
 */
export function computeScore(assessment: FactorAssessment): ScoreBreakdown {
  for (const factor of SCORE_FACTORS) {
    const value = assessment[factor];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new FactorOutOfRangeError(factor, value);
    }
  }

  const present = SCORE_FACTORS.filter((f) => assessment[f] !== undefined);
  if (present.length === 0) throw new NoFactorsAssessedError();

  const presentWeight = present.reduce((sum, f) => sum + SCORE_WEIGHTS[f], 0);

  const factors = SCORE_FACTORS.map((factor) => {
    const value = assessment[factor] ?? null;
    const weight = SCORE_WEIGHTS[factor];
    /* Redistribution, not substitution: the remaining factors carry the
       absent one's weight in proportion to their own. */
    const effectiveWeight = value === null ? 0 : (weight / presentWeight) * 100;
    return {
      factor,
      value,
      weight,
      effectiveWeight: Math.round(effectiveWeight * 100) / 100,
      contribution: value === null ? 0 : Math.round(value * effectiveWeight) / 100,
    };
  });

  const score = Math.round(
    factors.reduce((sum, f) => sum + (f.value ?? 0) * (f.effectiveWeight / 100), 0),
  );

  return {
    score,
    method: SCORE_METHOD,
    factors,
    assessedGapPercent: 100 - presentWeight,
  };
}

