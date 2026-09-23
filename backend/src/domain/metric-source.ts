/**
 * Where a number came from — P7-DATA-01, §22, P0-DATA-01.
 *
 * THIS IS THE PRODUCT'S BIGGEST CREDIBILITY RISK, stated as such in the task.
 * A sponsor who discovers that a "verified" figure was actually the athlete's
 * own estimate does not quietly downgrade their confidence in that number —
 * they stop believing the report. So every metric row carries exactly one of
 * these five labels, and nothing in this codebase adds two of them together
 * into a single figure without saying which is which.
 *
 * The five, from strongest evidence to weakest:
 *
 * - `VERIFIED_API`    — read from the platform's own API. Nobody typed it.
 * - `VERIFIED_MANUAL` — a BTG staff member looked at the post and recorded
 *                       what they saw. A person vouches for it.
 * - `SELF_REPORTED`   — the athlete told us. Usually true, occasionally
 *                       optimistic, never independently checked.
 * - `ESTIMATED`       — we calculated it from something else. Honest
 *                       arithmetic, not an observation.
 * - `ATTRIBUTED`      — measured by us, at one remove: a tracking click or a
 *                       QR scan we recorded ourselves, attributed to a piece
 *                       of work.
 *
 * WHY `ATTRIBUTED` IS NOT `VERIFIED_API`. We did observe it, so it is not an
 * estimate — but we observed our own link being used, not the platform's view
 * count. Presenting a click total beside an impressions figure as though both
 * came from Instagram would be exactly the conflation §22 forbids.
 */

export type MetricSource =
  | "VERIFIED_API"
  | "VERIFIED_MANUAL"
  | "SELF_REPORTED"
  | "ESTIMATED"
  | "ATTRIBUTED";

export const METRIC_SOURCES: readonly MetricSource[] = [
  "VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED",
] as const;

/** The two labels a sponsor may be shown as "verified" without qualification. */
export const VERIFIED_SOURCES: readonly MetricSource[] = [
  "VERIFIED_API", "VERIFIED_MANUAL",
] as const;

export function isVerified(source: MetricSource): boolean {
  return VERIFIED_SOURCES.includes(source);
}

/**
 * The short label a number must carry when it is displayed.
 *
 * `null` for the verified pair: a verified figure is shown plainly. Everything
 * else is qualified on screen, every time. This is the retrieval-path rule
 * from P0-DATA-01 made concrete — a number the UI cannot label is a number the
 * UI must not show.
 */
export function displayLabel(source: MetricSource): string | null {
  switch (source) {
    case "VERIFIED_API":
    case "VERIFIED_MANUAL":
      return null;
    case "SELF_REPORTED":
      return "SELF-REPORTED";
    case "ESTIMATED":
      return "EST";
    case "ATTRIBUTED":
      return "ATTRIBUTED";
  }
}

/**
 * A count per label. Never a single number.
 *
 * The shape is the enforcement: a caller cannot accidentally read a blended
 * total because there is no blended total to read. Anything that wants one
 * has to ask for `verifiedTotal` and thereby state what it is excluding.
 */
export type SourcedTotals = Record<MetricSource, number>;

export function emptyTotals(): SourcedTotals {
  return {
    VERIFIED_API: 0,
    VERIFIED_MANUAL: 0,
    SELF_REPORTED: 0,
    ESTIMATED: 0,
    ATTRIBUTED: 0,
  };
}

/** The sum of the two verified labels, and nothing else. */
export function verifiedTotal(totals: SourcedTotals): number {
  return VERIFIED_SOURCES.reduce((sum, s) => sum + totals[s], 0);
}

/**
 * Every label's figure summed together.
 *
 * DELIBERATELY AWKWARD TO REACH, and named so that no reader mistakes it for
 * a verified number. It exists because "how much reach did this campaign have
 * in total" is a real question — but a caller that uses it is obliged to show
 * the breakdown beside it, which is why the breakdown is what the readers in
 * `metric.ts` return and this is a separate opt-in.
 */
export function blendedTotalRequiringDisclosure(totals: SourcedTotals): number {
  return METRIC_SOURCES.reduce((sum, s) => sum + totals[s], 0);
}

export class UnknownMetricSourceError extends Error {
  readonly status = 422;
  constructor(value: string) {
    super(
      `"${value}" is not a §22 provenance label. Every metric must be one of: ` +
        `${METRIC_SOURCES.join(", ")}. A number with no stated origin cannot ` +
        `be shown to a sponsor.`,
    );
    this.name = "UnknownMetricSourceError";
  }
}

export function assertMetricSource(value: string): MetricSource {
  if (!(METRIC_SOURCES as readonly string[]).includes(value)) {
    throw new UnknownMetricSourceError(value);
  }
  return value as MetricSource;
}
