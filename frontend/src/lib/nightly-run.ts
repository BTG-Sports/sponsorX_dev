/* POL-FE-74 — when the intelligence pages fill in. The worker's nightly chain
   (fact check → benchmarks → features → suggested prices → forecasts → …)
   starts at 19:00 UTC (backend/src/domain/fact-nightly.ts FACT_CHECK_HOUR_UTC).
   A page that waits for it says so, instead of a reason that isn't true. */

export const NIGHTLY_RUN_LINE = "Updated nightly, from 19:00 UTC.";

export const PRICING_EMPTY_HINT =
  "Prices are suggested in the nightly run (from 19:00 UTC) for each item with sold lines to learn from. A new item shows here after the next run.";

export const FORECAST_EMPTY_HINT =
  "Forecasts are made in the nightly run (from 19:00 UTC) for each live campaign with a guarantee to pace against. A campaign that just went live shows here after the next run.";
