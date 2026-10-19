# 2026-10-19

## HeckerCreatives — the seven remaining Phase 3 screens reconciled with their engines and walked live (3S5-FE-01, 3S6-FE-01, 3S7-FE-01/02/03, 3S8-FE-01/02)

Branch `feature/3S5-FE-01-3S8-FE-02-engine-walk`, cut after pulling `main` and `main_development` (both at #252: 3S6-BE-02/03/04, 3S9-QA-01/02, 3S9-OPS-01, 3S1-OPS-02, the Phase 4/5 split, 4S0–4S2). Local: Docker up, the ten migrations since 10-15 applied, Prisma client regenerated, API + worker on :4000 from `npm start`, `next dev` on :3000.

**What was still open.** The three engines of 10-14 (pricing, matching, forecasting) were walked on 10-15. The other seven screens had engines mounted on 10-15/16 (make-goods, attribution, both hubs, scenarios, anomalies, models) but were still built against the *proposed* shapes in `SponsorX-Phase3-Screen-Contracts.md`, so each would have shown `EnginePending` or, worse, rendered the real payload wrongly. Every lib was compared field by field with the engine's actual presenter (`views()`, `toViews()`, `modelView`, `attribution-desk.ts`, the two hub files, `scenario-engine.ts`) and its backend tests.

**One shared fix.** `lib/intelligence.ts` `routeMissing`: a switched-off feature now answers `403 { code: "feature_off" }` (3S8-OPS-01), not 501; the screen treated that as a real error. It is now "pending", and only that 403 — a plain 403 stays a refusal. Test added.

**Per screen — the mismatches that would have shown wrong on live data:**

- **3S5 make-goods.** `status`, `automatic { approved, heldBecause[] }`, `decision.automatic / runsFrom / runsUntil` were missing from the type. Rows now say "Held for a person · N reasons" or "SponsorX · automatic / approved automatically / Runs Oct 20 – Nov 2"; the drawer lists `heldBecause`; the note rule is the API's one sentence (8–2,000, trimmed).
- **3S6 attribution.** A refund's negative amount printed as "$-43"; `kind`, `keysGiven`, `dismissed`, `occurredAt` were missing; the redemption tile said "$0 reward value"; an unknown `?campaign` (404 with a message) went to the error boundary. Refunds are their own row ("Refund — taken off the total"), the queue shows key *names* and dismissed rows with who/when/why, and **Dismiss is live** for BTG admins (`attribution/actions.ts`, `components/attribution-dismiss.tsx`, reason 10–500); others read-only.
- **3S7-FE-01 sponsor hub.** `ESTIMATED_MEDIA_VALUE.amountCents` is `null` without a benchmark and rendered as "$0 estimated" — now a dash with the reason. `costPerResultCents` of 0 ranked as best value at "$0.00" — now "no spend booked in this period". `renewals[].ended` was missing; `AD_SLOT` labelled "Edition ad"; `segments: []` reads "No sourced audience yet".
- **3S7-FE-02 property hub.** Shapes matched, words did not: opportunity is unsold items *at listed price*, sell-through counts items not units, rates are the roster's items only; a 0 fit prints "Not a fit" with the engine's reason.
- **3S7-FE-03 scenarios.** `savedBy` required; age bands are record keys (`18_PLUS`) and needed labels; the planner's own validation diverged from the engine's `inputProblems` words and only showed the first problem — it now repeats them word for word (pinned against the backend test) and pre-empts the integer bounds the API answers with a wordless 400; name cap 120 (was 80).
- **3S8-FE-01 anomalies.** `rule.version` is the registry stamp (`anomaly-rules@1.0.0`) — `ruleLabel` would have printed `duplicate.post@anomaly-rules@1.0.0`; `asOf` is the epoch until the rules first run and would have shown "as of Jan 1, 1970"; `disposition.automatic` was missing. The sample's rule ids and subject types now match the engine's seven real rules.
- **3S8-FE-02 models.** The largest: versions are bare numbers, `settings` and `backtest` per version, `benchmarkValidation` missing entirely, `thresholds` units, `factors` only for matching in points, `benchmarkMinSample` 10 not 30, ten flags not seven, `rollouts` always empty. The settings editor *blocked* out-of-range values client-side, so the engine's hold-for-a-second-person path was unreachable — it now warns, saves, and shows `{ version, status, heldBecause }`; a held draft gets a **Validate** button (new `validateVersionAction`) with the second-person rule; reasons are 10–500 (the shared intel-admin helper said 8 and let a 9-character reason through to a 422).

**Docs:** each section of `SponsorX-Phase3-Screen-Contracts.md` ends with a "Reconciled and walked 2026-10-19" note; the header says every shape has landed; the liveness table records the 403.

**Walk (live, dev servers, 2026-10-19).** Data: `forecasts:refresh` (3 campaigns), `makegoods:refresh` (1 shortfall, approved automatically), `anomalies:refresh` (1 `manual.over_measured` flag), `models:backtest --simulate` (forecast 2.0.0, 900 simulated campaigns), `benchmarks:validate` (0 of 0; "The nightly fact check has not run yet."). A temporary Playwright spec (`pageAs` as `qa7-admin`, `qa7-sponsor`, `qa7-pm-b` → `seed_prop_hawks`) registered a generic-webhook partner through the API and delivered a token-matched $45 sale, its $15 refund by order id and an unknown-token sale, then:
- make-goods open + approved (SponsorX · automatic, run window);
- attribution events (refund row, $30 net) and queue ("Carried reward token" → dismissed with a reason by the admin);
- scenarios: live calculate at $25k, "Set a budget above zero." verbatim, saved with `savedBy`; then the `scenarios` flag off via `PATCH /intelligence/flags` → `EnginePending`, on → live;
- anomalies: the flag reviewed, "Confirmed issue" with a note → final on Resolved;
- models: six models, forecast 2.0.0's "(simulated)" backtest in the table, benchmarks empty with the reconciliation verdict, flags incl. "Zoho intelligence sync";
- sponsor hub (30d and 90d) and property hub as their own roles;
- phone (390px): make-goods, models, attribution — no horizontal overflow.
- **10/10 checks, 0 console errors, 0 page errors, 0 5xx**, screenshots reviewed by eye (desktop + phone). The partner, its rows, the saved scenario and the flag row were deleted afterwards; the anomaly's decision stays (local only). Spec deleted.
- Harness notes: `getByText(/refund/i)` first hits the hidden sidebar's "Refunds to send" — match the row's full sentence; a `<p role="alert">` that renders only with text is the one to assert, not `getByRole("alert").first()`.

**Verified:** frontend vitest **140 files / 1,587 tests** (was 1,541), `tsc` clean, `eslint --max-warnings=0` clean on all 32 touched files, `next build` green. Backend untouched.

**Tracker:** the seven rows stay Done; Notes record the reconciliation and the walk. Stage Progress: the 2026-10-19 row appended from the live block.

**Not started, deliberately:** the Phase 4 web-application screens (4S1-FE-01/02/03, 4S2-FE-01) — their engines landed on 10-16 (`/virtual/*`), but every row is ⏸ behind `4S0-ART-01`, the owner's design task, and no screen or contract exists yet. That is new screen work, not integration.
