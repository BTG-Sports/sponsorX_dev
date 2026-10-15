# SponsorX Backtests and Benchmark Validation

**Tasks `3S9-QA-01`, `3S9-QA-02` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 9**

Are the engines right, and are the numbers they stand on sound? Each night
SponsorX checks the benchmarks (§1) and backtests every model version that
has real history (§2–§3). The results sit beside each version on the models
screen (`/admin/intelligence/models`), where versions are compared (`3S8-BE-01`).

## 1 · Benchmark and reconciliation validation (`3S9-QA-02`)

**A benchmark is fit to price from only when all four hold.** Otherwise it is
flagged with every reason:

| Check | Fails when |
|---|---|
| In order | Its quartiles aren't above zero and in order (p25 ≤ median ≤ p75) |
| Fresh | It wasn't refreshed in the last 2 days (it refreshes nightly) |
| Sample size | Fewer than 10 orders are behind it (`BENCHMARK_MIN_SAMPLE`) |
| Spread | Its middle half spans more than 4× (p75 ÷ p25), too wide to price from |

The pricing engine already prefers the most specific benchmark with enough
orders. This says which ones are sound.

**Reconciliation** is the nightly fact check (`3S1-QA-01`): the daily
summaries equal the facts, and the facts equal the app's records.
- **The tolerance is exact.** Any difference fails.
- **The check must have run in the last 2 days.**
- **The warehouse** is being retired (`3S1-OPS-02`, on hold), so the ledger in the app database is what's reconciled.

**Where it shows:**
- the models screen's `benchmarkValidation`;
- the worker's nightly log ("N of M valid to price from");
- `npm run benchmarks:validate -- [--tenant <id>]`.

## 2 · How the engines are judged (`3S9-QA-01`)

**The forecast,** on campaigns that have ended: every forecast made while one
ran, against where it actually finished.

| Metric | Better |
|---|---|
| Mean error of the projected final, against the final | lower |
| Share within 10% of the final | higher |
| Mean error in the second half of the flight | lower |
| Brier score of the probability of the guarantee | lower |
| Calibration: of forecasts in each probability band (under 50%, 50–80%, 80%+), the share that reached the guarantee, against the average probability given | close together |

**The pricing engine,** on orders booked after a suggestion existed: the
athlete's latest suggested CPM on or before the booking, against the CPM the
order achieved (net sell × 1,000 ÷ verified views).

| Metric | Better |
|---|---|
| Mean error of the suggested CPM | lower |
| Share within 20% of the achieved CPM | higher |
| Calibration: the share within 20% in each confidence band (low, medium, high) | should rise with confidence |

- **Judged per version.** Each version is judged on the outputs it stamped.
- **Kept per run** (`BacktestRun`). Nightly runs cover real history; a run with none stores nothing.
- **By hand:** `npm run models:backtest -- [--tenant <id>] [--simulate]`.

## 3 · Real history: none yet

**No campaign has ended with a forecast, and no order has been booked since
suggestions began** (2026-10-14). So there is no real backtest yet. The
nightly run will fill it in as campaigns end.

## 4 · The forecast on a simulated history

Until then, the forecast is judged on a **simulated history** (user,
2026-09-24: simulate rather than wait). The history is seeded, so it is the
same every run, and it is always labelled simulated.

**The simulated campaigns:**
- **300 campaigns** of 20–60 days, with guarantees of 10,000–100,000.
- **A true pace** between 60% and 130% of plan.
- **Daily noise** of ±50%.
- **Slow starts:** in the first fifth, 30% of days deliver nothing.
- **A change of pace mid-flight** for one campaign in five.
- **Each is forecast** at a quarter, half and three quarters of the way.

Pricing is not simulated: an invented "achieved" CPM would only measure the
simulator's own assumptions.

**Results for `forecast-rules@1.0.0`** (built-in settings, 900 forecasts, 29%
of campaigns reaching their guarantee):

| | All | At ¼ of the flight | At ½ | At ¾ |
|---|---|---|---|---|
| Mean error of the projected final | 10.8% | 18.2% | 9.5% | 4.7% |
| Within 10% of the final | 60% | 32% | 60% | 89% |
| Brier score | 0.108 | 0.177 | | |

**Calibration of the probability:**

| Band | Average given | Reached the guarantee | At ¼ given / reached | At ¾ given / reached |
|---|---|---|---|---|
| Under 50% | 4.6% | 14.0% | 4.9% / 21.9% | 4.1% / 5.9% |
| 50% to 80% | 66.7% | 83.3% | 64.3% / 82.4% | 69.4% / 82.4% |
| 80% or more | 95.7% | 89.5% | 95.3% / 73.9% | 96.3% / 96.8% |

### What it says

- **The projection is good and gets better as the flight goes on:** under 5%
  error at three quarters of the way.
- **The probability is too sure of itself early on.**
  - At a quarter of the flight, campaigns given a 95% chance made it only 74%
    of the time.
  - Those given about 5% made it 22% of the time.
  - By three quarters it is well calibrated.
- **The cause:** the spread is taken from the daily figures alone. It misses
  slow starts and changes of pace, so early on it is too narrow.

### Recommendations — decided 2026-10-15

**The owner approved recommendation 2**: a new forecast version with a wider early spread, backtested on this same history before it goes live. Recommendation 1 is not applied on its own.


1. **A settings change, available today:** raise "observed rate fully trusted
   from" (`fullTrustElapsed`) from 0.3 to 0.45, inside its safe range. On the
   simulated history:
   - mean error goes from 10.8% to 9.4% overall, and from 18.2% to 14.0% at a quarter;
   - the Brier score goes from 0.108 to 0.106.

   It barely touches the overconfidence.
2. **A rule change, as a new forecast version:** widen the early spread, for
   example by allowing for a change of pace in proportion to the flight still
   to go. This is a code change, and it is backtested on this same history
   before it goes live.

The alert thresholds are unaffected: "at risk" is already conservative at
50%.

## 5 · Forecast 2.0.0: the approved fix

**What changed** (built-in `forecast-rules@2.0.0`, 2026-10-15):
- **The pace itself is uncertain.** The remaining days get a second spread: rate × `paceUncertainty` × (share of the flight still to go) × days left, shared across those days.
- **It is widest early and gone at the end.** It doesn't move the projected final.
- **`paceUncertainty` is a setting** on the models screen ("Allowance for a change of pace"), built in at **0.6**, with a safe range of 0.2–1.0.

**How 0.6 was chosen:** on two separate seeded histories (the one above,
`20261015`, and a held-out one, `777`), 0.6 gave the lowest Brier score on
both:

| | 1.0.0 (none) | 0.5 | **0.6** | 0.8 |
|---|---|---|---|---|
| Brier, history 20261015 | 0.108 | 0.097 | **0.096** | 0.097 |
| Brier, held-out history 777 | 0.115 | 0.099 | **0.099** | 0.099 |

**Calibration at 0.6** (history 20261015), given / reached:

| Band | All checkpoints | At ¼ of the flight |
|---|---|---|
| Under 50% | 10.9% / 14.0% | 16.3% / 21.9% |
| 50% to 80% | 64.2% / 80.9% | 60.7% / 77.5% |
| 80% or more | 94.1% / 97.4% | none given (was 95.3% / 73.9%) |

- **The overconfidence is gone.** Early on, the forecast no longer says
  "95%" for campaigns that then miss. It says "watch" until the evidence is in.
- **The middle band is now a little cautious:** given 64%, reached 81%. A
  cautious alert is safer than a missed one.
- **The projected-final accuracy is unchanged** (§4), because the fix widens
  only the uncertainty.

The nightly backtest judges 2.0.0 on real campaigns as they end, and the
models screen shows it beside 1.0.0.
