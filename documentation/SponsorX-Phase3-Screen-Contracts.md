# SponsorX — Phase 3 screen contracts

**What this is.** The API each Phase 3 screen reads, written down so the
engines can be built against it. The screens were built first, on
2026-10-13, with the owner's decision **"FE only, honest empty states"**:
every screen is live code that reads its engine, and until the engine's
route is mounted it says so — by name, with the tasks it waits on — and
shows no number at all.

**Status of these shapes: proposed.** They are the frontend's side of the
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
| `501` (engine mounted but switched off, e.g. a per-tenant flag, 3S8-OPS-01) | `EnginePending` |
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
Roles: read SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES; override decided by the API through `canOverride` (proposed: BTG admins).

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

- `GET /intelligence/briefs/:briefId/matches?kind=athlete|property|inventory&page&size` → `{ briefId, kind, counts { athlete, property, inventory }, filteredOut { unavailable, categoryConflict, brandSafety }, matches, page, shortlist | null, run { modelVersion, computedAt } }`
  - match: `id, kind, refId, name, sub, rank, score (0..100 = Σ contributions), factors[{ key, label, weight, contribution (0..weight×100), reason }], reasons[] (salesperson words), availability { state: AVAILABLE|LIMITED, note? }, stamp`
  - Unavailable and category-conflicted candidates are **never** in `matches` (acceptance #3); the screen shows only the `filteredOut` counts.
- `POST /intelligence/briefs/:briefId/shortlist { entryIds }` → replaces the brief's shortlist; `{ id, briefId, entries[{ matchId, kind, name, score }], savedAt, savedBy }`.

## 3S4-FE-01 · Campaign forecast dashboard — `/admin/intelligence/forecasts`

Engine: Delivery forecast (3S4-DATA-01, 3S4-BE-01/02). Types: `frontend/src/lib/forecast-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES.

- `GET /intelligence/forecasts?risk=all|at_risk|watch|on_track&page&size` → `{ counts { active, at_risk, watch, on_track }, campaigns, page }`
  - row: `campaignId, campaignName, sponsorName, startsAt, endsAt, elapsed (0..1), guarantee { metric, value }, delivered, deliveredSource (VERIFIED_*), projectedFinal { low, mid, high }, probabilityOfGuarantee, risk, stamp` — ordered by risk, then lowest probability, then soonest end.
- `GET /intelligence/forecasts/:campaignId` → the row plus `pacing[{ date, delivered, expected }], projection[{ date, low, mid, high }], riskFactors[{ key, label, detail }], actions[{ kind, label, detail }], alert { raisedAt, risk, threshold } | null, history[{ forecastAt, projectedMid, probability, modelVersion }]` (newest first — acceptance #5 persists every forecast).
  - `actions[].kind`: accelerate content, add a deliverable, change channel, reserve make-good inventory (3S4-BE-02). An alert must be raised before the campaign ends (acceptance #6).

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

## 3S6-FE-01 · Attribution dashboard — `/admin/intelligence/attribution`

Engine: Attribution framework (3S0-PMO-01, 3S6-BE-01…04). Types: `frontend/src/lib/attribution-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES.

- `GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size` → `{ asOf, scope { campaign { id, name } | null }, totals: Record<AttributionClass, { count, amountCents }>, counts { events, unmatched }, events? | unmatched?, page }`
  - event: `id, source { partner, adapter }, class, method: deterministic|probabilistic, matchKey: token|order_id|click_id | null, windowDays, confidence, modelVersion | null, amountCents | null, occurredAt, campaign | null, athlete | null`
  - unmatched (the 3S6-BE-04 reconciliation queue, read-only here): `id, source, reference, reason: no_match|ambiguous|outside_window|unknown_token, candidates | null, amountCents | null, receivedAt`
- The four totals are four tiles, each with its own claim sentence, never summed (acceptance #8). **Guard:** the screen shows a row as verified only when it is deterministic *and* names a match key; a probabilistic row the API labels verified is shown as modelled, with a warning on the row.

## 3S7-FE-01 · Sponsor intelligence hub — `/sponsor/intelligence`

Engine: Sponsor intelligence. Types: `frontend/src/lib/sponsor-intelligence-live.ts`.
Scoped by the API to the caller's sponsor org.

- `GET /intelligence/sponsor?range=7d|30d|90d|all` → `{ asOf, range, campaigns { count, active }, totals: Record<AttributionClass, { count, amountCents | null }>, formats, partners, segments, renewals }`
  - format: `format (inventory kind), campaigns, deliveredImpressions, redemptions, costPerResultCents | null (contracted spend ÷ verified redemptions), provenance`
  - partner: `kind: athlete|property, id, name, campaigns, score (0..1), provenance, stamp`
  - segment: `label, share, source, provenance` — a segment with no `source` is dropped, never shown.
  - renewal: `campaignId, campaignName, endsAt, renewalScore, recommendation: RENEW|ADJUST|LET_END, reasons[], stamp`

**Gap: no backend task builds this read.** 3S7-FE-01 depends on 3S1-DATA-02 (the warehouse facts), but nothing on the board serves them to a sponsor. Raised as **3S7-BE-02** on 2026-10-13.

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

## 3S7-FE-03 · Scenario planner — `/admin/intelligence/scenarios`

Engine: Scenario planning (3S7-BE-01, on 3S4-BE-01). Types: `frontend/src/lib/scenarios-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR, SALES.

- `GET /intelligence/scenarios?page&size` → `{ scenarios, page, defaults (inputs), options { formats[{ key, label }], sports, stateCodes, ageBands } }` — the planner offers only what the engine can price. This read is also the screen's liveness check.
- `POST /intelligence/scenarios/calculate { inputs }` → result; stores nothing. Called live (debounced) as the inputs move.
  - inputs: `budgetCents, cpmCents, audience { sport?, stateCodes?, ageBand? }, mix[{ format, share }]` (shares sum to 1)
  - result: `expectedImpressions { low, mid, high }, expectedRevenueCents, deliveryProbability, stamp, notes[]`
- `POST /intelligence/scenarios { name, inputs }` → the saved scenario `{ id, name, inputs, result, savedAt }`.

## 3S8-FE-01 · Data quality and anomaly console — `/admin/intelligence/anomalies`

Engine: Anomaly detection (3S8-DATA-01, on 3S1-DATA-02). Types: `frontend/src/lib/anomalies-live.ts`.
Roles: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR.

- `GET /intelligence/anomalies?tab=open|resolved&kind&page&size` → `{ asOf, counts { open, resolved, openByKind }, anomalies, page }`
  - anomaly: `id, kind: spike|duplicate|bot|redemption|manual_entry, severity, subject { type: campaign|athlete|reward|metric_stream, … }, detectedAt, rule { id, version }, evidence[{ label, value }], disposition { outcome, note, by, at } | null`
- `POST /intelligence/anomalies/:id/disposition { outcome: confirmed_issue|false_positive|excluded_from_reporting, note }` — a note (8+ characters) for every outcome.
- Acceptance #10: seeded duplicate, bot and redemption patterns must appear here.

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

---

*Written 2026-10-13 with the Phase 3 screens (branch `feature/3S-FE-phase3-screens`). Plan of record: [SponsorX-Phase3-Intelligence-Attribution.md](./SponsorX-Phase3-Intelligence-Attribution.md).*
