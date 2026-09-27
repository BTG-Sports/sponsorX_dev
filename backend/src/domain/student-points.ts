/**
 * Student points — P9-BE-15, spec §5.5.
 *
 * The reason vocabulary and its fixed values. VIEWS_BONUS is the one reason
 * whose value is set per accrual (it scales with an edition's readership).
 *
 * Points are recognition, not wages: nothing here is money, nothing here
 * relates to Earning, and nothing converts points into anything. Redemption
 * is absent by design — a separate, gated task once §14 gate 2 is answered.
 */

export const POINT_VALUES = {
  ARTICLE: 50,
  INTERVIEW: 25,
  PHOTO: 25,
  APPOINTMENT: 25,
  SALES_500: 100,
} as const;

export type PointReason = keyof typeof POINT_VALUES | "VIEWS_BONUS";
export const POINT_REASONS: readonly PointReason[] = [...(Object.keys(POINT_VALUES) as (keyof typeof POINT_VALUES)[]), "VIEWS_BONUS"];

/** One SALES_500 per full $500 of attributed sales. */
export const SALES_POINTS_STEP_CENTS = 50_000;

export class PointsValueError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "PointsValueError";
  }
}

/** The points an accrual carries. Fixed reasons ignore any value passed. */
export function pointsFor(reason: PointReason, bonus?: number): number {
  if (reason === "VIEWS_BONUS") {
    if (!Number.isInteger(bonus) || (bonus as number) <= 0 || (bonus as number) > 1000) {
      throw new PointsValueError("VIEWS_BONUS needs a whole number of points between 1 and 1000.");
    }
    return bonus as number;
  }
  return POINT_VALUES[reason];
}

/** How many SALES_500 accruals a new sale earns, given the student's
 *  attributed total before and after it. */
export function salesMilestonesCrossed(beforeCents: number, afterCents: number): number {
  return Math.floor(afterCents / SALES_POINTS_STEP_CENTS) - Math.floor(beforeCents / SALES_POINTS_STEP_CENTS);
}
