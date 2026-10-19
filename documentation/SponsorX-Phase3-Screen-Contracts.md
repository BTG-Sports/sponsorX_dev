# SponsorX — Phase 3 screen contracts

**What this is.** The API each Phase 3 screen reads, written down so the
engines can be built against it. The screens were built first, on
2026-10-13, with the owner's decision **"FE only, honest empty states"**:
every screen is live code that reads its engine, and until the engine's
route is mounted it says so — by name, with the tasks it waits on — and
shows no number at all.

**Status of these shapes: landed, every one.** The three engines of 2026-10-14
were walked on 2026-10-15; the seven that mounted on 2026-10-15/16 were
reconciled field by field against their engines and walked live on
2026-10-19 (each section ends with what changed). They were the frontend's side of the
contract. The engine author (backend chain: 3S2-BE … 3S8-BE) owns the final
shape; if it moves, change the screen's `lib/*-live.ts` types and this file
in the same pull request. The full TypeScript types live in each screen's
lib, named below — this document is the summary, the lib is the truth.

**How a screen decides "not live yet"** (`frontend/src/server/engine.ts`,
`routeMissing` in `frontend/src/lib/intelligence.ts`):

| API answer | Screen shows |
|---|---|
| 2xx | The live screen |
| `404 { error: { code: "not_found" } }` with **no message** (the API's catch-all for an unmounted route) | `EnginePending` — no figures |
| `501`, or `403 { error: { code: "feature_off" } }` (engine mounted but switched off for the tenant — 3S8-OPS-01's per-tenant flag answers the 403) | `EnginePending` marked **Switched off** — "a BTG admin switched this feature off for this organisation", never "not built yet"; a write answers the API's own sentence |
| A mounted route's own 404 **with a message** | "Not found" state on detail screens; an error elsewhere |
| Anything else (401, 403, 409, 5xx …) | The page's error boundary — an outage is never shown as "coming soon" |

So an engine author needs to do nothing special: mount the route and the
screen lights up. Answer `501` to keep a screen dark deliberately.

**Rules every response follows** (Phase 3 acceptance criteria, Spec §22):

- Every model output carries a `stamp: { modelVersion, confidence (0..1), computedAt }` — `ModelStamp` in `lib/intelligence.ts`.
- Every figure has a retrieval path and a provenance label. Nothing estimated is ever labelled verified.
- The four attribution classes — `VERIFIED_REDEMPTION`, `VERIFIED_TRANSACTION`, `MODELLED`, `ESTIMATED_MEDIA_VALUE` — are returned and shown **separately**, never summed (3S0-PMO-01).
- Lists are server-paged: `?page&size` in, `page: { page, size, total, pages }` out (`lib/list-query.ts`).
- Money is integer cents. Dates are ISO strings. All reads are tenant-scoped; sponsor and property reads are scoped to the caller's own org by the API — the request never carries an org id.

**Development preview.** Every screen accepts `?demo=sample` outside
production: its live layout fed by the lib's `SAMPLE_*` object, under a
"Sample data" banner. Production never renders it.

---

## 3S2-FE-01 · Pricing intelligence panel — `/admin/intelligence/pricing`

Engine: Dynamic CPM engine (3S2-BE-01/02/03). Types: `frontend/src/lib/pricing-live.ts`.
Roles: read SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES; override decided by the API through `canOverride` (BTG admins).

**Landed 2026-10-14** (`backend/src/domain/pricing-engine.ts`, `routes/v1/intelligence.ts`); screen walked against it 2026-10-15. As proposed, with these facts: v1 prices **athlete items only** (`seller.kind` is always `ATHLETE`); suggestions are stored nightly and the reads serve the latest stored one; the detail's 404 is `not_priced` with a message (the screen's "absent" state); an override below the floor is 422 `override_below_floor` and the attempt is audited. After the QA pass of 2026-10-15: an override above $10,000 CPM (`OVERRIDE_MAX_CENTS`) is 400 on the wire, as the screen already refused it; an unknown `view` is 400, like an unknown `kind` or `risk`.

- `GET /intelligence/pricing?page&size&q&view=above|below|low` → `{ items, page, summary }`
  - item: `inventoryId, title, kind, seller { kind: ATHLETE|PROPERTY, id, name }, recommendationId, currentCpmCents | null, recommendedCpmCents, override (the one in force) | null, stamp`
  - `summary: { priced, above, below, atRate, lowConfidence }` — over every item, not the page (the KPI tiles read it).
- `GET /intelligence/pricing/:inventoryId` → `{ inventory (incl. listed priceCents), recommendation, overrides, canOverride }`
  - recommendation: `id, currentCpmCents, recommendedCpmCents, baseCpmCents, floorCpmCents | null, factors[{ key, label, effect (signed fraction), impactCents, explanation }], range { p25Cents, medianCents, p75Cents, sampleSize, basis } | null, stamp`
  - overrides, newest first: `{ id, cpmCents, reason, by, at }`
- `POST /intelligence/pricing/recommendations/:recommendationId/overrides { cpmCents, reason }` → 201. 403 without permission; 422 below the floor or without a reason. **Never edits the recommendation** (acceptance #2).

Screen policy to confirm: under 10 comparable sales is shown as a small sample; an override reason is 10–500 characters; an override below the floor is refused.

## 3S3-FE-01 · Sponsor match explorer — `/admin/intelligence/matching`

Engine: Match scoring (3S3-BE-01/02/03). Types: `frontend/src/lib/match-explorer-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, NETWORK_MGR, SALES. The brief picker reads the existing, live `GET /briefs`.

**Landed 2026-10-14** (`backend/src/domain/match-engine.ts`; `documentation/SponsorX-Match-Engine.md`); screen walked against it 2026-10-15. As proposed, with one change: **Sales reads but does not save a shortlist** (`briefMatch` write is BTG admins, campaign managers and network managers; the API answers Sales' save with 403), so the screen offers the picks and Save only to those roles (`canSaveShortlist`). A ranking is reused for ten minutes so its pages agree. The brief gained the engine's inputs — `excludedCategories`, `channels`, `audienceTiers`, `audienceMinFollowers` — and the sponsor's brief drawer sends them (`lib/brief-request.ts`). BTG reads them in words ("Sponsor asks": tiers · channels · minimum audience · avoid) on the brief desk, the Matching Studio header and above the explorer's ranking (`briefAsksLine`, QA 2026-10-15). Network managers read briefs since 2026-10-15 (`campaignBrief` read, own-tenant — the matrix's brief row had left them out while §29 had them saving shortlists, so both matching desks were dead ends for the role). A list sent with repeats (`channels`, `audienceTiers`, `excludedCategories`) is stored as a set.

- `GET /intelligence/briefs/:briefId/matches?kind=athlete|property|inventory&page&size` → `{ briefId, kind, counts { athlete, property, inventory }, filteredOut { unavailable, categoryConflict, brandSafety }, matches, page, shortlist | null, run { modelVersion, computedAt } }`
  - match: `id, kind, refId, name, sub, rank, score (0..100 = Σ contributions), factors[{ key, label, weight, contribution (0..weight×100), reason }], reasons[] (salesperson words), availability { state: AVAILABLE|LIMITED, note? }, stamp`
  - Unavailable and category-conflicted candidates are **never** in `matches` (acceptance #3); the screen shows only the `filteredOut` counts.
- `POST /intelligence/briefs/:briefId/shortlist { entryIds }` → replaces the brief's shortlist; `{ id, briefId, entries[{ matchId, kind, name, score }], savedAt, savedBy }`.

## 3S4-FE-01 · Campaign forecast dashboard — `/admin/intelligence/forecasts`

Engine: Delivery forecast (3S4-DATA-01, 3S4-BE-01/02). Types: `frontend/src/lib/forecast-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES read; BTG_ADMIN and CAMPAIGN_MGR set a guarantee.

**Landed 2026-10-14** (`backend/src/domain/forecast-engine.ts`; `documentation/SponsorX-Forecasting.md`); screen walked against it 2026-10-15. As proposed, plus one write the proposal didn't have:

- `PUT /intelligence/forecasts/:campaignId/guarantee { metric, value }` → `{ campaignId, guarantee | null }` — what the campaign is promised by its end date; `{ metric: null }` clears it, and the engine then paces against every deliverable booked (the default). Audited as `campaign.guaranteeSet`. The detail page has the control (`ForecastGuaranteeForm`, `canSetGuarantee`); the forecast is made nightly, so a new guarantee shows from the next one.
- The detail's 404 is `forecast_not_found` with a message (the screen's "absent" state).
- After the end date the guarantee is refused (422 `guarantee`, "This campaign ended on …"): nothing forecasts it any more, so a promise set then would never be paced (QA 2026-10-15).

- `GET /intelligence/forecasts?risk=all|at_risk|watch|on_track&page&size` → `{ counts { active, at_risk, watch, on_track }, campaigns, page }`
  - row: `campaignId, campaignName, sponsorName, startsAt, endsAt, elapsed (0..1), guarantee { metric, value }, delivered, deliveredSource (VERIFIED_*), projectedFinal { low, mid, high }, probabilityOfGuarantee, risk, stamp` — ordered by risk, then lowest probability, then soonest end.
- `GET /intelligence/forecasts/:campaignId` → the row plus `pacing[{ date, delivered, expected }], projection[{ date, low, mid, high }], riskFactors[{ key, label, detail }], actions[{ kind, label, detail }], alert { raisedAt, risk, threshold } | null, history[{ forecastAt, projectedMid, probability, modelVersion }]` (newest first — acceptance #5 persists every forecast).
  - `actions[].kind`: accelerate content, add a deliverable, change channel, reserve make-good inventory (3S4-BE-02). An alert must be raised before the campaign ends (acceptance #6).

- **QA 2026-10-19 (round three):** the detail read carries `makeGoods` (3S5-BE-02, for those who may read `makeGood`); the screen now renders them as a **Make-goods** card — what is open and held for a person, and what was approved, by whom, and when it runs — with the link into the make-good centre on this campaign. `lib/forecast-live.ts` `ForecastDetail.makeGoods?: Shortfall[]`.

## 3S5-FE-01 · Make-good recommendation centre — `/admin/intelligence/make-goods`

Engine: Make-good engine (3S5-BE-01/02). Types: `frontend/src/lib/makegood-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR (read and approve).

- `GET /intelligence/make-goods?status=open|approved&campaign&page&size` → `{ counts { open, approved, openValueCents, approvedThisPeriod, period { from, to } }, shortfalls, page }`
  - shortfall: `id, campaign { id, name }, sponsorName, metric, sold, projected, shortfall, shortfallValueCents, endsAt, stamp, options, decision { optionId, by, at, note } | null`
  - option: `id, inventoryName, propertyName, format, equivalencyScore (0..1), estimatedDelivery, costImpactCents (signed), checks { available, exclusivityClear, meetsTarget }, reason` (acceptance #7).
- `POST /intelligence/make-goods/:id/approve { optionId, note }` — 409 when the option fails a check or the shortfall is already decided; 422 on a blank note. Recorded, audited and reflected in the campaign (3S5-BE-02).
- **Mounted 2026-10-15** (3S5-BE-01/02, [SponsorX-Make-Goods.md](./SponsorX-Make-Goods.md)) as proposed. Fields beyond the contract:
  - each shortfall adds `status` and `automatic { approved, heldBecause[] }`. SponsorX approves on its own when every safety check passes; otherwise these are the reasons it waits for a person.
  - the decision adds `automatic`, `runsFrom` and `runsUntil`.
  - a note under 8 characters is a 422.

- **Reconciled and walked 2026-10-19.** `lib/makegood-live.ts` now matches `views()` in `makegood-engine.ts` exactly (`status`, `automatic`, `decision.automatic/runsFrom/runsUntil`). An open shortfall SponsorX did not approve is marked "Held for a person · N reasons" in its row, and the drawer lists `automatic.heldBecause` under "Waiting for a person" before the reviewer picks a substitute. An approved shortfall says whether SponsorX ("SponsorX · automatic") or a person (`decision.by`, the API's `email (Role)`) decided it, the date, and "Runs Oct 20 – Nov 2". The approve form enforces the API's note rule client-side (trimmed, 8–2,000 characters) with the API's own 422 sentence; a 409 is shown as the API's message. Walked: the one local shortfall, approved automatically.

## 3S6-FE-01 · Attribution dashboard — `/admin/intelligence/attribution`

Engine: Attribution framework (3S0-PMO-01, 3S6-BE-01…04). Types: `frontend/src/lib/attribution-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES.

- `GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size` → `{ asOf, scope { campaign { id, name } | null }, totals: Record<AttributionClass, { count, amountCents }>, counts { events, unmatched }, events? | unmatched?, page }`
  - event: `id, source { partner, adapter }, class, method: deterministic|probabilistic, matchKey: token|order_id|click_id | null, windowDays, confidence, modelVersion | null, amountCents | null, occurredAt, campaign | null, athlete | null`
  - unmatched (the 3S6-BE-04 reconciliation queue, read-only here): `id, source, reference, reason: no_match|ambiguous|outside_window|unknown_token, candidates | null, amountCents | null, receivedAt`
- The four totals are four tiles, each with its own claim sentence, never summed (acceptance #8). **Guard:** the screen shows a row as verified only when it is deterministic *and* names a match key; a probabilistic row the API labels verified is shown as modelled, with a warning on the row.

**Mounted 2026-10-16** by 3S6-BE-02/03/04 ([SponsorX-Attribution-Matching.md](./SponsorX-Attribution-Matching.md) §4). As proposed, with these facts:
- events are partner sales only (`VERIFIED_TRANSACTION`, `MODELLED`); filtering by the other two classes returns no rows, and their figures are the tiles';
- a refund's `amountCents` is negative, and each row also carries `kind: sale|refund`;
- the totals count sales and take refunds off the amount; `VERIFIED_REDEMPTION.amountCents` is 0 (no reward value is held);
- the queue is the whole tenant's whatever `campaign` says (an unmatched sale has no campaign); open first, then dismissed ones, each with `dismissed: { by, at, reason } | null`, `kind`, `occurredAt` and `keysGiven` (the key names, never their values);
- an unknown `campaign` is 404 `attribution_not_found`;
- dismissing is `POST /intelligence/attribution/unmatched/:id/dismiss { reason }` (BTG admins; the screen stays read-only until it wants the button).

- **Reconciled and walked 2026-10-19.** Events render as partner sales only; a refund is its own row (`kind: refund`, amount negative, "Refund — taken off the total"); the redemption tile is a count with no money line. The queue shows each sale's key *names* (`keysGiven`, "Carried reward token"), when it happened, open rows first then dismissed ones marked "Dismissed by {by} · {date}" with the reason. **Dismiss is live:** BTG admins (`SUPER_ADMIN`, `BTG_ADMIN`, `canDismiss`) get a per-row form posting `{ reason }` (10–500 characters, the API's bounds); campaign managers and Sales see the queue read-only. An unknown `?campaign` (404 `attribution_not_found`) renders a not-found state. Walked with a generic-webhook partner: a token-matched $45 sale, its $15 refund by order id, and an unknown-token sale dismissed from the queue.
- **QA 2026-10-19 (engine side, same pass):** `dismissed.by` is now words — "email (Role)" or "a former user" — never a user id; dismissing a sale that is already dismissed, or that the nightly retry matched meanwhile, is `409 attribution_decided` with the reason, while an id that exists nowhere stays 404. Round three: a dismissal that loses the race to another person's (or the nightly retry's) is also `409 attribution_decided`, never 404.

## 3S7-FE-01 · Sponsor intelligence hub — `/sponsor/intelligence`

Engine: Sponsor intelligence. Types: `frontend/src/lib/sponsor-intelligence-live.ts`.
Scoped by the API to the caller's sponsor org.

- `GET /intelligence/sponsor?range=7d|30d|90d|all` → `{ asOf, range, campaigns { count, active }, totals: Record<AttributionClass, { count, amountCents | null }>, formats, partners, segments, renewals }`
  - format: `format (inventory kind), campaigns, deliveredImpressions, redemptions, costPerResultCents | null (contracted spend ÷ verified redemptions), provenance`
  - partner: `kind: athlete|property, id, name, campaigns, score (0..1), provenance, stamp`
  - segment: `label, share, source, provenance` — a segment with no `source` is dropped, never shown.
  - renewal: `campaignId, campaignName, endsAt, renewalScore, recommendation: RENEW|ADJUST|LET_END, reasons[], stamp`

**Gap: no backend task builds this read.** 3S7-FE-01 depends on 3S1-DATA-02 (the warehouse facts), but nothing on the board serves them to a sponsor. Raised as **3S7-BE-02** on 2026-10-13.

**Mounted 2026-10-15** by 3S7-BE-02 ([SponsorX-Hub-Intelligence.md](./SponsorX-Hub-Intelligence.md) §1):
- read from the fact ledger, not the warehouse;
- `VERIFIED_TRANSACTION` and `MODELLED` are 0 until partner-store data exists;
- `segments` is empty until a sourced audience exists;
- formats include `AD_SLOT` for edition ads.

- **Reconciled and walked 2026-10-19.** `renewals[]` carries `ended` (the screen falls back to `endsAt` vs `asOf`). `totals.ESTIMATED_MEDIA_VALUE.amountCents` is `null` with no tenant benchmark: the tile shows a dash and says why, never $0. A format's `costPerResultCents` of 0 (redemptions inside the window, booking outside) prints "no spend booked in this period", not $0.00. `AD_SLOT` reads "Edition ad"; `segments: []` reads "No sourced audience yet". The sample mirrors the engine (`sponsor-intel@1.0.0`, `renewal-rules@1.0.0`). Walked as the QA sponsor: 3 campaigns, 1 redemption, the walk's matched sale net of its refund ($30), two renewal recommendations.

## 3S7-FE-02 · Property intelligence hub — `/property/intelligence`

Engine: Property intelligence. Types: `frontend/src/lib/property-intelligence-live.ts`.
Scoped by the API to the caller's property.

- `GET /intelligence/property` → `{ asOf, rates, opportunity, sellThrough, categoryFit, quality }`
  - rate: `inventoryId, name, format, currentCpmCents | null, recommendedCpmCents, stamp, topFactors[{ label, effect }]`
  - `opportunity: { openValueCents, unsoldItems, provenance: "ESTIMATED" }`
  - sellThrough: `[{ format, sold, listed, rate | null }]`
  - `categoryFit: { stamp, categories[{ category, fit (0..1), reason }] }` — the engine filters or flags sensitive categories for school properties.
  - `quality: { score (0..100), components[{ label, score, detail }], stamp }`

Same gap as the sponsor hub: served by **3S7-BE-02**, on top of 3S2-BE-02.

**Mounted 2026-10-15** by 3S7-BE-02 ([SponsorX-Hub-Intelligence.md](./SponsorX-Hub-Intelligence.md) §2). Notes:
- suggested prices cover the roster's items, because the CPM engine prices athletes' items;
- category fit returns every brand category: age-gated ones fit 0 for a school, with the reason.

- **Reconciled and walked 2026-10-19.** Shapes matched; wording did not: opportunity is unsold active items **at listed price** over 12 months, sell-through counts **items** (not units) with a sale in 12 months, and rates are the **roster's** items only (the empty state says so). Category fit lists every brand category; a 0 prints "Not a fit" with the engine's reason. Sample stamps are `property-intel@1.0.0`; quality parts are the engine's three. The whole-screen empty state is only for a property with no items and no rates. Walked as the Hawks' manager: 2 items, $2,100 open opportunity, 26 categories, quality 50/100.

## 3S7-FE-03 · Scenario planner — `/admin/intelligence/scenarios`

Engine: Scenario planning (3S7-BE-01, on 3S4-BE-01). Types: `frontend/src/lib/scenarios-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES.

- `GET /intelligence/scenarios?page&size` → `{ scenarios, page, defaults (inputs), options { formats[{ key, label }], sports, stateCodes, ageBands } }` — the planner offers only what the engine can price. This read is also the screen's liveness check.
- `POST /intelligence/scenarios/calculate { inputs }` → result; stores nothing. Called live (debounced) as the inputs move.
  - inputs: `budgetCents, cpmCents, audience { sport?, stateCodes?, ageBand? }, mix[{ format, share }]` (shares sum to 1)
  - result: `expectedImpressions { low, mid, high }, expectedRevenueCents, deliveryProbability, stamp, notes[]`
- `POST /intelligence/scenarios { name, inputs }` → the saved scenario `{ id, name, inputs, result, savedAt }`.
- **Mounted 2026-10-15** (3S7-BE-01, [SponsorX-Scenarios.md](./SponsorX-Scenarios.md)) as proposed, with these differences:
  - the formats are social posts and videos: the ones it can both price and measure in views;
  - a saved scenario adds `savedBy`;
  - bad inputs are a 422 with the problems in words.

- **Reconciled and walked 2026-10-19.** `savedBy` is a required string (the saver's email, or "a former user"). Formats, sports, states and age bands come from `options` only; age bands arrive as `UNDER_16 | 16_17 | 18_PLUS` and are labelled on screen while the key is posted. The 422 `scenario_inputs` message is every problem joined by a space, shown verbatim beside the inputs; `validateInputs` in `lib/scenarios-live.ts` repeats `inputProblems`' words and order (pinned against the backend's test case) and pre-empts the contract's integer bounds (budget ≤ $20M, CPM ≤ $100k, ≤ 10 formats, name ≤ 120), which the API would otherwise answer with a wordless 400. Walked: live calculate, "Set a budget above zero.", a saved scenario with its saver, and the `scenarios` flag off → `EnginePending` ("Switched off"), on → live again.
- **QA 2026-10-19 (engine side):** the contract's `budgetCents` / `cpmCents` floor is 0, not 1, so a zero reaches the engine and comes back as the 422 sentence rather than a wordless 400; negatives and the ceilings are still the contract's.

## 3S8-FE-01 · Data quality and anomaly console — `/admin/intelligence/anomalies`

Engine: Anomaly detection (3S8-DATA-01, on 3S1-DATA-02). Types: `frontend/src/lib/anomalies-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR.

- `GET /intelligence/anomalies?tab=open|resolved&kind&page&size` → `{ asOf, counts { open, resolved, openByKind }, anomalies, page }`
  - anomaly: `id, kind: spike|duplicate|bot|redemption|manual_entry, severity, subject { type: campaign|athlete|reward|metric_stream, … }, detectedAt, rule { id, version }, evidence[{ label, value }], disposition { outcome, note, by, at } | null`
- `POST /intelligence/anomalies/:id/disposition { outcome: confirmed_issue|false_positive|excluded_from_reporting, note }` — a note (8+ characters) for every outcome.
- Acceptance #10: seeded duplicate, bot and redemption patterns must appear here.
- **Mounted 2026-10-15** (3S8-DATA-01, [SponsorX-Anomalies.md](./SponsorX-Anomalies.md)) as proposed, with these additions:
  - a disposition adds `automatic`: SponsorX excludes a duplicate post on its own, and a person may replace that;
  - a person's decision is final (409 after);
  - a note under 8 characters is a 422.

- **Reconciled and walked 2026-10-19.** `rule.version` is the registry stamp (`anomaly-rules@1.0.0`), not a bare semver; the screen prints `rule.id · stamp`. `asOf` is the epoch until the nightly rules first run for the tenant — the screen then shows no time and says so. `disposition.automatic` is surfaced: SponsorX's duplicate-post exclusion sits on Resolved tagged "automatic" with the form beneath to replace it; a person's decision is shown as final with no form. Note bounds and wording (8–2,000, the API's sentence) are enforced client-side; a 409 `anomaly_decided` is shown in the API's words. The sample's rule ids and subject types are the engine's seven real rules. Walked: the one local `manual.over_measured` flag, decided by a person, shown final on Resolved.

## 3S8-FE-02 · Model and rule administration — `/admin/intelligence/models`

Engine: Model registry (3S0-PMO-02, 3S8-BE-01; flags 3S8-OPS-01). Types: `frontend/src/lib/models-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN.

- `GET /intelligence/models` → `{ asOf, models, benchmarks, benchmarkMinSample, flags, rollouts }`
  - model: `key: pricing|matching|forecast|makegood|attribution|anomalies, name, activeVersion, versions[{ version, status: draft|validated|active|retired, createdAt, createdBy, notes, metrics[{ label, value, unit?, better?: higher|lower }] }], thresholds[{ key, label, value, unit, min, max }], factors?[{ key, label, weight }]`
  - benchmark: `segment, p25, median, p75 (CPM cents), sampleSize, refreshedAt` — below `benchmarkMinSample` shown as a small sample.
  - flag: `feature, tenantId, tenantName, enabled`; rollout: `model, version, stage: internal|pilot|general, tenants[{ id, name }]`
- Writes — **every one carries a `reason`** (governance, 3S0-PMO-02):
  - `POST /intelligence/models/:key/versions/:version/activate { reason }` — offered only for a *validated* version
  - `POST /intelligence/models/:key/rollback { toVersion, reason }` — offered only to a *retired* version
  - `PATCH /intelligence/models/:key/thresholds { values, reason }`
  - `PATCH /intelligence/flags { feature, tenantId, enabled, reason }` (acceptance #12)
- Acceptance #11: activate, roll back and compare with no deploy. The version rules above are the screen's reading of 3S0-PMO-02, which is not written yet — confirm them there.
- **Mounted 2026-10-15** (3S8-BE-01, 3S8-OPS-01). The version rules match the policy, now written ([SponsorX-Model-Governance.md](./SponsorX-Model-Governance.md)). Fields beyond the contract:
  - each version carries its `settings`, for comparing;
  - its metrics are "Outputs made" until back-tests (3S9-QA-01) add theirs;
  - a settings change answers `{ version, status, heldBecause, model }`. Inside the safe ranges it is active at once; outside them it is held as a draft;
  - **extra endpoint:** `POST /intelligence/models/{key}/versions/{version}/validate { reason }` lets a second person validate a held draft. The screen needs a button for it;
  - `rollouts` is empty: settings are per tenant, with no staged rollout;
  - flags also include `scenarios` and `zohoIntelligence`;
  - a switched-off feature's reads answer 403 `feature_off`.

- **Reconciled and walked 2026-10-19.** Versions are bare numbers (`2.1.0`); each carries `settings` and `backtest { ranAt, simulated, sampleSize, calibration }`, its metrics being "Outputs made" plus the latest backtest's (suffixed "(simulated)"). The compare view shows settings first, then metrics. The settings editor only refuses what the API refuses (≤ 0, a share > 1); a value outside its safe range is saved and **held** — the screen warns before, and after the save shows `{ version, status, heldBecause }`. A held draft gets a **Validate** button with the second-person rule stated; the API's 409 to the proposer is surfaced as-is. `benchmarkValidation` renders as a Verdict column (status + every reason) and a Reconciliation card; `benchmarkMinSample` is 10. `factors` exist only for `matching` and are points. `rollouts` is always empty and the block says so. Reasons are 10–500 characters (`modelReasonError`), not intel-admin's 8. Walked: six models, forecast 2.0.0 with its simulated backtest, "No benchmarks yet" with the reconciliation verdict "The nightly fact check has not run yet.", ten flags × three tenants.
- **QA 2026-10-19 (both sides, same pass):** each threshold carries `integer` and the editor refuses a fraction with the API's sentence ("… is a whole number.") instead of offering a save the API refuses; each `benchmarkValidation.benchmarks[]` check carries `label`, the same string its benchmark row has as `segment`, and the screen joins on that rather than rebuilding the label. The held-draft → second-person Validate → Activate → roll back path was exercised end to end through the API and the screen. Round three: `PATCH …/thresholds` is idempotent under a double submit — the live version's own values are `422` "Nothing changed", and a draft's values return that draft rather than a third version; two parallel validates answer one 200 and one 409.

---

*Written 2026-10-13 with the Phase 3 screens (branch `feature/3S-FE-phase3-screens`). Plan of record: [SponsorX-Phase3-Intelligence-Attribution.md](./SponsorX-Phase3-Intelligence-Attribution.md).*
