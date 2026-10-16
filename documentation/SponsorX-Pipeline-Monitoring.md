# SponsorX Pipeline Monitoring

**Task `3S9-OPS-01` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 9**

"Job failures, model drift, pipeline lag and data freshness all need alerts.
A silently stale forecast is worse than none."

## 1 · What is recorded

Every night (from 19:00 UTC) the worker runs one chain:
1. the fact check;
2. benchmarks, and their validation;
3. feature snapshots;
4. suggested prices;
5. forecasts;
6. make-goods;
7. anomalies;
8. the attribution queue's retry (3S6-BE-03/04, `attribution`);
9. backtests;
10. the Zoho intelligence queue.

**Each step records how it ended** (`PipelineRun`): one row per step per
night, ok or failed, with its summary or error. A retry the same night
replaces it. **A failed step doesn't stop the chain;** it is recorded and the
next step runs, as before.

## 2 · What turns health "degraded"

`/health/full` gains a **`pipeline`** check (`system-health.ts evaluatePipeline`).
**On Railway it fails when:**

| Signal | Rule |
|---|---|
| Job failure | The latest record of any step is `failed` |
| Pipeline lag | Nothing in the chain succeeded in the last **26 hours** |
| Data freshness | There are active campaigns, but no forecast was made in the last 26 hours |
| Model drift | A model version's newest real backtest error is **half again** its previous one, and at least **5 points** higher |
| Unreadable | The record can't be read |

- **Before the first night,** nothing has run, and that isn't a failure.
- **Off Railway** (locally and in CI) the chain never runs, so the check
  always passes there.

## 3 · Who is told

**The uptime monitor** (`health-monitor.yml`, 2S8-OPS-01) checks
`/api/v1/public/health` every 15 minutes for staging and production. It
already alerts on any change from ok to failing, and says so again on
recovery, so the pipeline's failures reach the same channel as an outage,
**with nothing new to set up.** The check names the failing steps, the hours
since success, the forecast freshness and any drift.

## 4 · Where it lives

- `backend/src/domain/pipeline-runs.ts`: `recordStep`, and `runStep`, which wraps each step.
- `backend/worker/index.mts`: the chain.
- `backend/src/domain/system-health.ts`: `readPipeline` and `evaluatePipeline`.
- **Migration:** `20261016090000_pipeline_runs`.
- **Proof:** `backend/tests/pipeline-runs.test.ts` and `backend/tests/health-full.test.ts`, which cover a failed step, lag, stale forecasts, drift, healthy, off Railway and unreadable.
