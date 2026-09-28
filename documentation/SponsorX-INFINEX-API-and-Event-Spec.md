# SponsorX — INFINEX API and Event Specification

| | |
|---|---|
| **Task** | `P8-PMO-04` · Write the INFINEX API and event specification (§25, §38) |
| **Date** | 2026-09-28 |
| **Status** | Draft contract. Phase 1 documents it **now** so that Phase 4 attaches without redesigning campaigns or inventory. Nothing in this document is built unless marked **exists**. |
| **Acceptance** | The Phase 4 data contract is anticipated so campaigns and inventory need no redesign |
| **Audience** | SponsorX engineers and the INFINEX integration team |
| **Plan of record** | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) (51 tasks, `4S0-*` … `4S9-*`) |
| **Related** | [`SponsorX-Phase2-4-Module-Interface-and-Migration-Plan.md`](./SponsorX-Phase2-4-Module-Interface-and-Migration-Plan.md) (`P8-PMO-03`) · [`SponsorX-RBAC-Matrix.md`](./SponsorX-RBAC-Matrix.md) · live OpenAPI at `GET /api/v1/openapi.json` |

**Labels used throughout:**

- **Exists** — in the code today, with its path.
- **Proposed** — the contract this document recommends; not built.
- **Decision** — must be settled by the named Phase 4 Sprint 0 task before it is built.

---

## 1 · What INFINEX is to SponsorX, in one paragraph

INFINEX worlds are **inventory**. A sponsor buys a billboard in a virtual
stadium the same way they buy an athlete reel or a magazine back cover:
inside a `Campaign`, reported in the same sponsor report, measured with the
same provenance labels.

INFINEX plays three roles:

- **A consumer.** It asks SponsorX "what should I show right now?" — the manifest.
- **A producer.** It reports what was shown and what fans did — telemetry.
- **A trigger.** An in-world challenge that completes produces a SponsorX reward, exactly once.

SponsorX stays the system of record for what was sold, what was approved and
what was delivered. INFINEX stays the system of record for its worlds, its
sessions and its rendering.

### Ground rules carried over from Phase 1

| Rule | Why it binds INFINEX | Source |
|---|---|---|
| The API is served to every consumer on equal terms | `/api/v1` is a standalone Express service so off-web consumers — "the INFINEX game-engine integration in Phase 4 §8, a partner using the API Service Account" — use the same authorisation as the portals | `.claude/stack-decision.md` Addendum B; `backend/src/auth/actor.ts` header (**exists**) |
| Authorisation lives with the data | INFINEX is an actor like any other: tenant-scoped, role-checked, audited | `backend/src/auth/scope.ts`, `policy.ts` (**exists**) |
| Side effects go through the transactional outbox | Every event SponsorX emits is written in the same transaction as its cause | `backend/src/db/outbox.ts` (**exists**) |
| Reward redemption is guaranteed by the database | An in-world completion reuses the same exactly-once guarantee as a QR redeem | `backend/prisma/sql/reward_single_redeem.sql` (**exists**) |
| Numbers carry provenance | Virtual impressions get their own labels, and gross is never presented as viewable | `MetricSource` enum; `documentation/SponsorX-Metric-Provenance-Taxonomy.md` (**exists**) |
| Forbidden overlap | "Do not report virtual impressions to sponsors until viewability and de-duplication criteria are validated against pilot-world telemetry." | Phase 4 file, "Do not overlap" |

---

## 2 · Honest starting point — what exists for INFINEX today

| Capability | State | Detail |
|---|---|---|
| Versioned REST API | **Exists** | `/api/v1` (`backend/src/app.ts`). `GET /api/v1/` returns `{service:"sponsorx-api",version:"v1"}`. |
| Machine-readable contract | **Exists** | `GET /api/v1/openapi.json`: OpenAPI 3.1, generated from the Zod registry on every request, `Cache-Control: no-store` (`backend/src/routes/v1/openapi.ts`, `backend/src/contracts/registry.ts`). A CI test keeps it matched to the live routes (`backend/tests/openapi.coverage.test.ts`). Errors are RFC 9457 `ProblemDetails`. |
| `SERVICE` role in the policy | **Exists** | `Role.SERVICE` in `schema.prisma`; policy rows in `backend/src/auth/policy.ts` (§6 below). |
| **Machine authentication for `SERVICE`** | **Missing** | The only credential the API accepts is a **Clerk user session** (Bearer token or cookie, `backend/src/auth/clerk.ts`). There is no API key, no client-credentials flow and no request-signing verifier. `registry.ts` documents `bearerAuth` "for §8's API Service Account", but nothing implements a separate verifier. **This is the first thing Phase 4 must add** (§6). |
| **Outbound events or webhooks** | **Missing** | Everything outbound today is a Zoho API call or a Resend email, made by the worker. There is no subscriber registry, no event envelope and no delivery signing. The outbox is the right foundation (§5.4). |
| Inbound webhook intake pattern | **Exists** | `POST /webhooks/zoho/invoice`: HMAC-SHA256, constant-time compare, a `WebhookDelivery` row, enqueue, 202 (`backend/src/routes/v1/zoho-webhooks.ts`). This is the template for telemetry intake (§5.3). One caveat: the HMAC is computed over re-serialised JSON, not the raw bytes. |
| Virtual inventory model | **Missing** | "VIRTUAL" exists only as an organisation type in property onboarding (`ORG_TYPES` in `backend/src/domain/onboarding-rules.ts`, with a `platformUrl` detail field), so a world operator can already onboard as a property. There are no world, zone or placement models. |
| INFINEX-specific code | **None** | INFINEX appears only in comments (`actor.ts`, `scope.ts`, `openapi.ts`, `contracts/earning.ts`, `contracts/metric.ts`). |

---

## 3 · The virtual-inventory data model

### 3.1 · Taxonomy

The Phase 4 file (`4S0-PMO-02`) names five levels: **world, district, venue,
zone, surface**. SponsorX needs stable external IDs for each level that
inventory is sold against (`4S0-PMO-01`: "if those churn, the inventory
churns with them").

**Proposed:** model the hierarchy as **two** tables, not five:

- `VirtualWorld`
- `VirtualZone`, self-referencing, with `level` taking DISTRICT \| VENUE \| ZONE

A surface is a `VirtualPlacement`. This keeps a taxonomy change a data
change, not a migration.

### 3.2 · Mapping onto today's models

| INFINEX concept | SponsorX entity | State | Nearest Phase 1 precedent (why no redesign is needed) |
|---|---|---|---|
| World operator (the company running a world) | `Property` with `kind = "VIRTUAL"` | **Exists** (the kind value, and onboarding via `/public/onboarding` → BTG decision → `Property` with `listingAccessAt`) | A property already owns inventory and has a portal (`PROPERTY_MGR`). |
| World | `VirtualWorld { id, tenantId, propertyId, externalId @unique per tenant, name, environment (STAGING\|PRODUCTION), runtimeVersion, status }` | **Proposed** (`4S1-BE-01`) | `Publication` → `Edition`: a property-owned container of sellable positions. |
| District / venue / zone | `VirtualZone { id, tenantId, worldId, parentId?, level, externalId, name, status }` | **Proposed** (`4S1-BE-01`) | — |
| Placement (billboard, LED, naming right, branded room, court, tunnel, kiosk) | `VirtualPlacement { id, tenantId, zoneId, externalId, kind, widthPx?, heightPx?, aspect, allowedCreativeTypes[], constraints Json, viewabilityRuleId, capacity Int, rackPriceCents, currency, testStatus (UNTESTED\|PASSED\|FAILED), state (DRAFT\|AVAILABLE\|RETIRED) }` | **Proposed** (`4S1-BE-02`, `4S3-QA-01`: AVAILABLE only after a staging pass) | **`AdSlot`** (**exists**): `slotCode`, `kind` enum, `priceCents`, `quantity`, `campaignId?`, `soldCents?`, `soldAt?`, with a database constraint against double-selling (`backend/prisma/sql/adslot_inventory.sql`). A placement is an ad slot with a location and a time window instead of an edition. |
| Sellable inventory record | Phase 2's `InventoryItem` / `Listing` (**planned**, `2S2-BE-01`, `2S3-BE-01`), with `VirtualPlacement` as one inventory kind | **Proposed** (`4S1-BE-03`) | `SponsorPackage.lineItems` / `includes` already carries non-athlete inventory as lines (for example the iMC feature, `backend/src/domain/sponsor-packages.ts`). Buying a placement bundle through a §7-style package needs no new purchase path. |
| Availability window | `PlacementWindow { id, tenantId, placementId, startsAt, endsAt, capacity, campaignId?, soldCents?, state (OPEN\|HELD\|SOLD) }`, with a Postgres **exclusion constraint** on `(placementId, tstzrange(startsAt, endsAt))` for SOLD/HELD rows | **Proposed** (`4S1-BE-04`: "overlapping purchases of the same placement are rejected") | `adslot_inventory.sql` and `invite_one_open.sql` (**exist**): "at most one" rules live in the database. |
| Purchase | `PlacementWindow.campaignId` + `soldCents` frozen at sale; `Campaign` unchanged | **Proposed** | Exactly how `POST /editions/:id/sales` books an `AdSlot` to a `Campaign` today (`backend/src/domain/edition.ts`). The campaign state machine already allows an **ad-only** campaign (no athlete orders) to go DRAFT → APPROVAL (`backend/src/domain/campaign-state.ts`, `isAdOnly`). |
| Creative asset (versioned) | `DeploymentAsset { id, tenantId, campaignId, version, r2Key, mime, widthPx, heightPx, bytes, checksum, validatedAt?, validation Json }` | **Proposed** (`4S2-BE-02`: rejected at upload if it fails the placement's constraints) | **`CreativeAsset`** (**exists**): versioned per deliverable, `r2Key` in the private bucket, `derivatives Json`, uploaded direct-to-R2 via presigned URL (`POST /deliverables/:id/uploads`, `/assets`), with an `image.derive` worker job. |
| Creative deployment | `CreativeDeployment { id, tenantId, campaignId, placementWindowId, assetId, assetVersion, state (DRAFT\|APPROVED\|SCHEDULED\|LIVE\|PAUSED\|ROLLED_BACK\|ENDED), startsAt, endsAt, approvedBy?, approvedAt?, sequence BigInt }` | **Proposed** (`4S2-BE-01`, `-05`) | The **deliverable approval chain** (**exists**, `backend/src/domain/deliverable-state.ts`): BTG review → sponsor review → approved, with each step stamped and audited. Virtual creative gets the same review desk before it can be LIVE. |
| Activation (challenge, quest, hunt, skill test, product discovery, booth) | `Activation { id, tenantId, campaignId, worldId, zoneId?, kind, startCondition Json, completionCriteria Json, eligibility Json, rewardId, state (DRAFT\|LIVE\|PAUSED\|ENDED), startsAt, endsAt }` | **Proposed** (`4S6-BE-01`) | **`Reward`** (**exists**): `offerText`, `terms`, `singleUse`, `expiresAt`, `state`, and from P6-BE-08 `eligibility` (ANYONE / AGE_18_PLUS / AGE_21_PLUS / TICKET_HOLDERS), `eligibilityNote`, `redemptionCap` (race-safe, 410 when spent), `landingHeadline` / `landingSubhead`. An activation **references** a reward; it does not reinvent one. |
| Activation completion → reward | `ActivationCompletion { id, tenantId, activationId, sessionRef, subjectRef, completedAt, eventId @unique, rewardTokenId? }`, with a unique index on `(activationId, subjectRef)` per eligibility rule | **Proposed** (`4S6-BE-03`: exactly once) | **`RewardToken` + `RewardEvent`** (**exist**). A completion issues (or binds) a token and records a CLAIM through the same code path the fan QR uses. The fan receives the `/r/<token>` link, and optionally a Wallet pass (Phase 2 `2S6-*`). |
| Raw telemetry | `VirtualEventRaw { eventId (PK, client-scoped), tenantId, clientId, schemaVersion, eventType, occurredAt, receivedAt, worldId, zoneId?, placementId?, deploymentId?, activationId?, sessionRef, dwellMs?, visiblePct?, interactionType?, payload Json, signatureOk, flags[] }`, partitioned by `receivedAt` | **Proposed** (`4S4-BE-01`, `4S4-DATA-01`) | `RewardEvent`, `LinkEvent`, `EditionEvent` (**exist**): raw, append-only, tenant-scoped event rows, aggregated elsewhere. |
| Aggregates | `VirtualMetricDaily { tenantId, deploymentId, day, visits, grossImpressions, viewableImpressions, dwellMsTotal, interactions, uniqueSessions, ruleVersion, source }`, unique on (deploymentId, day, ruleVersion) | **Proposed** (`4S5-DATA-01`) | **`MetricDaily`** (**exists**): unique on (deliverableId, day, source), with `source MetricSource`. Dashboards read aggregates, never raw rows. |
| Viewability rule | `ViewabilityRule { id, version, minVisiblePct, minDwellMs, effectiveAt }`, immutable once used | **Proposed** (`4S5-BE-01`) | `AthleteScore.method` / `content-value-rules.ts` (**exist**): versioned rules stored with every result, so a number can be explained later. |
| Client (game build / server) | `InfinexClient { id, tenantId, worldId?, kind (SERVER\|CLIENT_BUILD), keyId, publicKey or secretHash, schemaVersions[], lastHeartbeatAt?, status }` | **Proposed** (`4S3-INT-02`) | `WebhookDelivery` + integration health (**exist**) for operational visibility. |
| Incident | `DeploymentIncident { id, tenantId, type, severity, openedAt, closedAt?, notes, deploymentIds[] }` | **Proposed** (`4S8-BE-02`) | `AuditLog` (**exists**) records every pause and rollback that causes one. |

### 3.3 · Provenance for virtual numbers

**Proposed:** a separate label set for virtual metrics, rather than stretching
`MetricSource`:

- `VIRTUAL_GROSS` — renders reported by a trusted client
- `VIRTUAL_VIEWABLE` — passes rule version *n*
- `VIRTUAL_UNVALIDATED` — before pilot validation (`4S9-QA-01`)

Before validation, sponsor-facing surfaces **must not** show virtual
impressions at all (the forbidden overlap in §1). The sponsor report builder
(`backend/src/domain/sponsor-report.ts`, **exists**) already refuses to present a
figure without its label, so the new labels slot into `SOURCE_LABEL` in
`report-render.ts`.

---

## 4 · API surface

Base URL `https://<api-host>/api/v1`. JSON throughout. Errors are
`ProblemDetails` (`application/problem+json`). Times are ISO 8601 UTC. Money
is integer minor units plus a `currency` field.

### 4.1 · Existing endpoints INFINEX can use

These exist today. INFINEX reaches them as a `SERVICE` actor **once machine
auth exists** (§6). Access is exactly what `policy.ts` grants `SERVICE` — see
§6.3. An endpoint whose resource has no `SERVICE` row answers 403.

| Endpoint | Purpose for INFINEX | SERVICE access today |
|---|---|---|
| `GET /openapi.json` | Discover the contract | Public |
| `GET /me` | Confirm which tenant and roles a credential resolves to | Yes |
| `GET /campaigns`, `GET /campaigns/:id/ops` | Read campaigns an activation or placement belongs to | `campaign` own-tenant read/write |
| `GET /rewards`, `GET /rewards/:id` | Read the reward an activation triggers | `reward` own-tenant read |
| `GET /rewards/:id/funnel` | Aggregate SCAN/LANDING/CLAIM/REDEEM counts | `rewardEvent` own-tenant read |
| `GET /campaigns/:id/metrics`, `GET /campaigns/:id/report` | Read provenance-labelled delivery | `metricAggregate` own-tenant read |
| `POST /deliverables/:id/metrics` | Record verified metrics (the §10 metrics ingestion path, "`SERVICE` writes here") | `metricEvent` own-tenant write |
| `GET /public/rewards/:token`, `POST /public/rewards/:token/{scan,landing,claim,redeem}` | The fan reward journey (no login) — the same journey an in-world completion hands off to | Public |
| `GET /public/catalogue/packages` | Published package catalogue | Public |

### 4.2 · Proposed endpoints — the Phase 4 surface

All are **proposed**. Paths use an `/infinex` prefix for the machine
surfaces, so they can carry their own rate limits and credential type without
touching portal routes.

**Registry — admin writes, SERVICE reads (`4S1-*`)**

| Method + path | Body / query | Response | Notes |
|---|---|---|---|
| `POST /virtual/worlds` | `{propertyId, externalId, name, environment}` | `201 VirtualWorld` | BTG_ADMIN / PROPERTY_MGR (own-property). Audited as `virtualWorld.create`. |
| `PUT /virtual/worlds/:id/zones` | `[{externalId, parentExternalId?, level, name}]` | `200 {zones}` | Idempotent upsert by `externalId`. A zone is never deleted — it is retired. |
| `POST /virtual/zones/:id/placements` | placement spec (§3.2) | `201 VirtualPlacement` (state DRAFT) | |
| `POST /virtual/placements/:id/test-result` | `{status: PASSED\|FAILED, buildId, evidenceUrl?}` | `200` | SERVICE (staging client) or BTG. PASSED unlocks AVAILABLE (`4S3-QA-01`). |
| `POST /virtual/placements/:id/windows` | `{startsAt, endsAt, capacity, rackPriceCents, currency}` | `201 PlacementWindow` | Overlap → `409 window-overlap`. |
| `POST /virtual/windows/:id/sale` | `{campaignId, soldCents}` | `200` | Mirrors `POST /editions/:id/sales`. Audited `placementWindow.sell`. |

**Creative and deployments (`4S2-*`)**

| Method + path | Notes |
|---|---|
| `POST /campaigns/:id/virtual-assets/uploads` → presigned PUT; then `POST /campaigns/:id/virtual-assets` `{r2Key, version, …}` | Same direct-to-R2 pattern as deliverables. Validation against the placement's constraints runs on the worker (`virtualAsset.validate`); a failure leaves the asset `REJECTED` with reasons. |
| `POST /virtual/deployments` `{campaignId, placementWindowId, assetId, assetVersion, startsAt, endsAt}` | Creates DRAFT. |
| `POST /virtual/deployments/:id/transition` `{to, reason?}` | APPROVE / SCHEDULE / PAUSE / RESUME / ROLLBACK / END. Each transition bumps `sequence`, is audited, and enqueues `infinex.manifestChanged` in the same transaction. |
| `POST /virtual/emergency-pause` `{scope: {sponsorId? , campaignId?, deploymentIds?}, reason}` | Kill switch (`4S8-BE-01`). BTG_ADMIN only, MFA session required. Pauses every matching deployment in one transaction. |

**Manifest — what INFINEX calls at runtime (`4S2-BE-03`)**

`GET /infinex/manifest?worldId=<externalId>&at=<iso8601, default now>`

- Returns only deployments that are **APPROVED or LIVE, in-window for `at`, not paused**, in the requested world (acceptance criterion 2).
- Sends `ETag` and honours `If-None-Match`, answering `304` when nothing changed. Clients poll at the interval the config endpoint gives them (default 60 s) **and** react to `manifest.changed` pushes. Push is a hint; the manifest is the truth.

```json
{
  "worldId": "wld_stadium_east",
  "generatedAt": "2026-10-01T18:00:00Z",
  "manifestVersion": 4812,
  "ttlSeconds": 60,
  "placements": [
    {
      "placementId": "plc_north_led_01",
      "deploymentId": "dep_01J…",
      "sequence": 17,
      "campaignId": "cmp_…",
      "asset": {
        "assetId": "vas_…", "version": 3, "mime": "image/webp",
        "url": "https://cdn…/signed?…", "urlExpiresAt": "2026-10-01T18:10:00Z",
        "checksum": "sha256:…", "widthPx": 3840, "heightPx": 1080
      },
      "window": { "startsAt": "2026-10-01T00:00:00Z", "endsAt": "2026-10-08T00:00:00Z" },
      "activationIds": ["act_…"]
    }
  ]
}
```

- Asset URLs are **signed and short-lived** (`4S2-BE-04`). Today's private-bucket signed reads (`GET /deliverables/:id/assets/:version/url`, `GET /reward-tokens/:id/qr-url`) are the pattern.
- The manifest carries **no sponsor pricing and no athlete pay**. The `FIELD_DENIALS` rules in `backend/src/auth/fields.ts` apply to `SERVICE` like anyone else.

**Client config and heartbeat (`4S3-INT-02`, `-03`)**

| Method + path | Response |
|---|---|
| `GET /infinex/config` | `{schemaVersions: {supported: [1,2], preferred: 2}, telemetry: {maxBatch: 500, maxBytes: 1048576, flushSeconds: 10, sampleRates: {…}}, manifest: {pollSeconds: 60}, flags: {…}}` |
| `POST /infinex/heartbeat` `{clientId, buildId, worldId, manifestVersion, fps?, errors?: […]}` | `204`. A missing heartbeat past its threshold raises an integration-health alert (§5.5). |

**Telemetry and activations (`4S4-*`, `4S6-*`)**

| Method + path | Notes |
|---|---|
| `POST /infinex/telemetry:batch` | §5.3. Signed. Returns per-event results. |
| `POST /infinex/activations/:id/complete` `{eventId, sessionRef, subjectRef, occurredAt, evidence}` | Validates against the activation's eligibility and completion criteria, then in **one transaction**: writes an `ActivationCompletion` (the unique index enforces exactly once) → issues or binds a `RewardToken` → records the event → enqueues `infinex.rewardIssued`. Returns `{rewardTokenId, claimUrl}`. A replay with the same `eventId` returns the **same** result with `200` and header `Idempotent-Replay: true`. |

**Reporting (`4S5-*`, `4S7-*`)**

| Method + path | Notes |
|---|---|
| `GET /campaigns/:id/virtual-metrics?from&to&granularity=day` | Reads `VirtualMetricDaily` only. Gross and viewable are always separate fields, each with its label and rule version. |
| `GET /campaigns/:id/report` | **Exists.** Gains a virtual section when the campaign has deployments. Cross-channel de-duplication (`4S7-DATA-01`) is applied here, not in the client. |

---

## 5 · Event catalogue

### 5.1 · Common envelope

Every event, in both directions, uses one envelope. **Proposed:**

```json
{
  "eventId": "01J9Z6Q3K5…",          // UUIDv7 / ULID, generated by the producer, globally unique per producer
  "schemaVersion": 1,                 // integer, per eventType
  "eventType": "placement.visible",
  "occurredAt": "2026-10-01T18:02:11.482Z",
  "producer": { "kind": "infinex-client", "clientId": "cli_…", "buildId": "2026.10.1" },
  "tenantId": "ten_…",               // outbound only; inbound tenant comes from the credential, never the body
  "subject": { "worldId": "…", "zoneId": "…", "placementId": "…", "deploymentId": "…", "activationId": null },
  "session": { "sessionRef": "ses_…", "subjectRef": "usr_hash_…" },  // pseudonymous — see 5.6
  "sequence": 42,                     // per (producer, sessionRef) for inbound; per aggregate for outbound
  "data": { }
}
```

- **The tenant is never trusted from the body** on inbound events. It comes from the credential, as `actor.tenantId` does today (`backend/src/auth/scope.ts`).
- **A mismatched `schemaVersion` is rejected** with `422 unsupported-schema-version`, and the response names the supported versions (`4S4-BE-02`).

### 5.2 · Inbound events (INFINEX → SponsorX)

| `eventType` | `data` fields | Counts toward | Phase 4 task |
|---|---|---|---|
| `zone.visit` | `{enteredAt, exitedAt?}` | visits, unique sessions | `4S5-DATA-01` |
| `placement.render` | `{assetId, assetVersion, lod?}` | **gross** impressions | `4S4-BE-01` |
| `placement.visible` | `{visiblePct (0–100), dwellMs, viewportPct?, occluded?: bool}` | **viewable** impressions if the rule passes | `4S5-BE-01` |
| `placement.interaction` | `{interactionType: CLICK\|TOUCH\|ENTER\|USE\|SHARE, targetRef?}` | interactions | `4S5-DATA-01` |
| `placement.error` | `{code, message, assetId?, assetVersion?}` | ops console: creative mismatch, load failure | `4S8-FE-01` |
| `activation.start` | `{activationId}` | activation funnel | `4S6-BE-02` |
| `activation.progress` | `{activationId, step, of}` | activation funnel | `4S6-BE-02` |
| `activation.complete` | `{activationId, evidence}` | Sent through the **dedicated** complete endpoint (§4.2), not the batch, because it produces a reward synchronously | `4S6-BE-03` |
| `client.heartbeat` | `{manifestVersion, fps?, errorCount}` | ops console | `4S3-INT-02` |

**Why render and visible are separate events.** Acceptance criterion 6 says
viewable impressions "remain distinct from gross renders". Keeping the two as
different raw facts means a rule change recomputes viewable from raw data
(`4S4-DATA-01`), without asking the client to re-send anything.

### 5.3 · Telemetry intake — `POST /infinex/telemetry:batch`

**Request:**

```
POST /api/v1/infinex/telemetry:batch
Authorization: Bearer <client access token>
SponsorX-Key-Id: key_…
SponsorX-Signature: t=1759341731,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>
Content-Type: application/json
Content-Encoding: gzip            (optional)

{ "events": [ <envelope>, … ] }   // ≤ maxBatch events, ≤ maxBytes
```

**Validation, in order.** Each check rejects the batch or the event — nothing is partially trusted:

1. The credential resolves to an `InfinexClient` in the tenant, and the client is active.
2. **The signature is checked over the raw body.** The timestamp `t` must be within ±300 s, otherwise `401 stale-signature`. **Note:** the existing Zoho route signs re-serialised JSON. This route must capture the raw body instead (`express.json({ verify })`).
3. Size limits.
4. Per event:
   - envelope schema and `schemaVersion`
   - `occurredAt` not more than 5 minutes in the future and not older than the late-arrival window (default 72 h; older events are quarantined, not dropped)
   - the placement belongs to the world the client is registered for
   - the `deploymentId` was LIVE at `occurredAt` (the placement-campaign relationship)
5. **De-duplication.** `(clientId, eventId)` is the primary key of `VirtualEventRaw`, so a duplicate insert is a no-op and returns `duplicate`.

**Response:** `207 Multi-Status`

```json
{ "accepted": 497, "duplicate": 2, "rejected": 1,
  "results": [ { "eventId": "…", "status": "rejected", "problem": { "type": "…/deployment-not-live", "title": "…" } } ] }
```

**Delivery semantics:**

- **At-least-once from the client; exactly-once in the counts.** Clients retry any batch that did not return 2xx, with the same `eventId`s. Duplicates never inflate a sponsor's numbers, because aggregation reads distinct `eventId`s only (acceptance criterion 7, `4S4-BE-03`).
- **No ordering guarantee.** The server orders by `(occurredAt, sequence)` at aggregation time. Aggregates for a day are recomputed when late events arrive inside the window, and a `ruleVersion`-stamped row is replaced, never incremented.
- **Buffering** (`4S4-OPS-01`). The intake handler does the minimum synchronously — verify, validate, insert raw — and enqueues `telemetry.aggregate` through the outbox. **Decision `4S0-PMO-03`:** if the measured volume exceeds what Postgres inserts sustain, put a stream buffer in front of the raw insert. That buffer would be the first non-Postgres queue in the system, so it needs its own stack-decision addendum; Addendum A3/B4 keep the job queue in Postgres.

### 5.4 · Outbound events (SponsorX → INFINEX)

**Delivery mechanism (proposed, built on what exists):**

1. The domain change and an `OutboxJob` named `infinex.deliver` are written **in the same transaction** (`enqueue(tx, tenantId, "infinex.deliver", {event})`, `backend/src/db/outbox.ts`).
2. The worker drain (`backend/worker/index.mts`, every 1 s, `SKIP LOCKED`) hands the job to pg-boss.
3. The `infinex.deliver` handler POSTs to each active subscription for that tenant and event type, and records a `EventDelivery { subscriptionId, eventId, attempt, status, responseCode, nextAttemptAt }` row.
4. **Retries** use exponential backoff: 30 s, 2 min, 10 min, 1 h, 6 h, then a dead-letter row that shows on the Integrations screen. Set `retryLimit` and `retryBackoff` explicitly on `boss.send`; today every job uses pg-boss defaults.

**Headers:**

```
POST <subscriber URL>
SponsorX-Event-Id: 01J…
SponsorX-Event-Type: deployment.paused
SponsorX-Signature: t=<unix>,v1=<hex HMAC-SHA256(subscriptionSecret, t + "." + rawBody)>
SponsorX-Delivery-Attempt: 2
```

**Guarantees:**

- **At-least-once.** The consumer de-duplicates on `SponsorX-Event-Id`.
- **Per-aggregate ordering via `sequence`.** Each deployment, placement and activation carries a monotonically increasing `sequence`. A consumer that receives `sequence` ≤ the last one it applied for that aggregate ignores the event. Cross-aggregate order is **not** guaranteed.
- **Push is advisory for the manifest.** On any doubt — a gap in `sequence` or a missed delivery — the client re-fetches `GET /infinex/manifest`.

**Catalogue:**

| `eventType` | Emitted when (the transaction that writes it) | `data` | Consumer action |
|---|---|---|---|
| `manifest.changed` | Any deployment transition in a world | `{worldId, manifestVersion}` | Re-fetch the manifest |
| `deployment.paused` | `…/transition {to: PAUSE}` | `{deploymentId, sequence, reason}` | Stop rendering within the agreed time target |
| `deployment.rolledBack` | `…/transition {to: ROLLBACK}` | `{deploymentId, sequence, toAssetVersion}` | Render the prior version |
| `emergency.pause` | `POST /virtual/emergency-pause` | `{deploymentIds[], reason, issuedAt}` | Remove immediately; acknowledge via heartbeat `manifestVersion` (`4S8-BE-01`) |
| `placement.statusChanged` | Placement AVAILABLE / RETIRED, or a test result | `{placementId, state, testStatus}` | Registry sync |
| `activation.changed` | Activation LIVE / PAUSED / ENDED | `{activationId, state, sequence}` | Enable or disable the in-world trigger |
| `reward.issued` | Activation completion transaction | `{activationId, completionId, rewardTokenId, claimUrl}` | Show the fan their claim link |
| `reward.stateChanged` | `POST /rewards/:id/transition` (**exists**; would additionally enqueue) | `{rewardId, state}` | Hide the offer when PAUSED / EXPIRED / ARCHIVED |
| `config.changed` | Config edit | `{configVersion}` | Re-fetch `/infinex/config` |

**Proposed** `EventSubscription { id, tenantId, url, eventTypes[], secretHash, secretPrefix, active, createdBy }`.
Managed by BTG_ADMIN, audited as `eventSubscription.*`, and shown on the
Integrations screen. The secret is shown once and stored hashed.

### 5.5 · Health and alerting

The Integrations screen (`/admin/integrations`, backed by
`backend/src/domain/integration-health.ts` — **exists**) already reports webhook
rejections, failed worker jobs and outbox lag. **Proposed additions:**

- heartbeat age per client
- telemetry intake lag, measured as `receivedAt − occurredAt` at p95
- rejected-event rate by reason
- dead-lettered outbound deliveries

These are the ops-console inputs for `4S8-FE-01`.

### 5.6 · Privacy

The same rule as the fan QR page: **no fan identity reaches a sponsor.**

- `sessionRef` and `subjectRef` are **pseudonymous identifiers minted by INFINEX**. `subjectRef` should be a keyed hash that INFINEX can reproduce and SponsorX cannot reverse.
- SponsorX stores no email, name, IP or device identifier from telemetry. Geo, if any, is resolved to city and region and then discarded, as `tracking.resolveGeo` does today.
- `rewardEvent` stays aggregate-only for every staff and sponsor role (RBAC Matrix §10). The one exception remains a fan who explicitly ticks sponsor-contact consent on the SponsorX claim page (`backend/src/domain/fan-consent.ts`, `2S6-BE-03`).
- **Cross-channel de-duplication** (`4S7-DATA-01`: "a fan who scans a QR and completes an in-world challenge is one person") must work on these pseudonymous references — for example, a keyed join inside the warehouse. **Decision `3S0-LEG-01` / `4S0-PMO-01`:** whether any linkage is permitted at all.

---

## 6 · Authentication and authorisation

### 6.1 · The gap

`SERVICE` is a role with policy rows, but **no credential can currently
produce a `SERVICE` actor** except a Clerk *user* session for a `User` row
that carries the role. That is unsuitable for a game server and impossible
for a shipped game client.

### 6.2 · Proposed design (`4S0-SEC-01`)

There are **two trust tiers**, because a game client is not a server:

| Tier | Who | Credential | May call |
|---|---|---|---|
| **INFINEX server** | INFINEX's backend services | OAuth 2.0 client-credentials → short-lived JWT access token (15 min), audience `sponsorx-api`, `sub = <ServiceCredential.id>`. **Decision:** Clerk machine tokens (keeps `backend/src/auth/clerk.ts` the only vendor file) or a SponsorX-issued token signed with a rotating key. | Registry reads, manifest, config, activation complete, telemetry batch, metrics reads |
| **Game client build** | The shipped client, per build or install | A per-build key pair registered as an `InfinexClient`. The client signs telemetry (§5.3). A short-lived access token is minted by the INFINEX server — **never** a long-lived secret in the binary. | Manifest (read), config (read), heartbeat, telemetry batch — **nothing else** |

**Resolution into today's authorisation, with no redesign.** Add a second
branch to `requireActor()` (`backend/src/auth/actor.ts`):

- A verified service token resolves to a `ServiceCredential { id, tenantId, userId, scopes[], revokedAt? }`.
- Its linked `User` row carries `roles: [SERVICE]`.
- `resolveActor` then produces an ordinary `Actor`, so `whereFor`, `assertAllowed`, `FIELD_DENIALS` and `audit()` all work unchanged.
- Roles are still read from Postgres on every request, so revoking takes effect on the next call.
- Audit rows name the service user.

**Scopes narrow; they never widen.** A token's `scopes[]` (for example
`manifest:read`, `telemetry:write`, `activation:complete`) is checked **in
addition to** the role policy. A scope can deny what `SERVICE` could
otherwise do; it can never grant something `policy.ts` denies.

### 6.3 · What `SERVICE` may do today (**exists**, `backend/src/auth/policy.ts`)

| Resource | Read | Write |
|---|---|---|
| `user` | own | own |
| `sponsor`, `sponsorContact` | own-tenant | own-tenant |
| `athlete` | own-tenant | — (explicitly read-only) |
| `campaign` | own-tenant | own-tenant |
| `deliverable`, `trackingLink`, `reward`, `qrCode` | own-tenant | — |
| `rewardEvent`, `metricEvent`, `metricAggregate` | own-tenant | own-tenant |
| `integrationConnection`, `webhookDelivery`, `inquiry`, `syncTask` | own-tenant | own-tenant |
| **everything else** | — | — (default deny) |

**Field denials for `SERVICE`** (`backend/src/auth/fields.ts`):
`sponsor.billingReference`, `athlete.dateOfBirth`, `rewardClaim.fanContact`,
`rewardClaim.sponsorLead`.

**Recommendation.** Much of today's `SERVICE` grant exists for the Zoho sync.
Before INFINEX gets a credential, **split the role**, because "a role that
can write campaigns" is far more than a game server needs:

- Keep `SERVICE` for internal integrations.
- Add `INFINEX_SERVICE` and `INFINEX_CLIENT` rows to the RBAC matrix:
  - read on the new virtual resources, `campaign` and `reward`
  - write on `virtualEvent`, `activationCompletion` and `rewardEvent`
  - no write on `campaign`, `sponsor` or anything commercial

This is a matrix pull request plus an enum migration. Both are additive.

### 6.4 · Tenant

- A service credential belongs to **one** tenant.
- A world operator onboarded as a `Property` in tenant T is served by a credential in tenant T.
- Cross-tenant access is denied by `tenantScoped()` without any INFINEX-specific code.

### 6.5 · Rate limits

Per credential, enforced in Redis (cache and rate limiting only, Addendum B4 —
`backend/src/lib/rate-limit.ts` **exists**):

| Endpoint | Limit |
|---|---|
| Manifest | 10 req/s per world |
| Telemetry | per the config endpoint's `maxBatch` × expected clients, **Decision `4S0-PMO-03`** |
| Everything else | 20 req/s |

---

## 7 · Versioning

| Layer | Rule |
|---|---|
| URL | Major version in the path (`/api/v1`). Within v1, changes are **additive only**: new endpoints, new optional fields, new enum values that consumers must tolerate. A breaking change ships as `/api/v2` alongside v1, with a published sunset of at least 6 months for INFINEX routes. |
| OpenAPI | `info.version` (today `"1.0.0"` in `registry.ts`) becomes semver. Minor bumps for additive changes, patch for documentation. The spec stays generated from Zod, so it cannot drift (**exists**). |
| Event schemas | `schemaVersion` is an integer **per `eventType`**. The server accepts the versions `GET /infinex/config` lists as `supported` — current and previous at minimum — and rejects others with `422` and the supported list. A new version is introduced as `preferred` before the old one is removed. |
| Manifest | `manifestVersion` increases on every change for the world. Clients never need to parse history — they take the latest. |
| Viewability rules | `ruleVersion` is stamped on every aggregate. A rule change produces **new** aggregates; old ones are kept, so a past report is reproducible. |
| Enums | Consumers must treat an unknown enum value as "unknown", not as an error, so SponsorX can add states (for example a new deployment state) without a major version. |

---

## 8 · Why campaigns and inventory need no redesign

Each Phase 4 need, tied to the existing field or seam it attaches to. Where
there is a gap, the change is listed — every one is **additive**: new tables,
new nullable columns, new enum values, new policy rows. None requires
changing an existing column's meaning or a state machine's existing moves.

| # | Phase 4 need (acceptance criterion) | Attaches to (exists) | Additive change |
|---|---|---|---|
| 1 | Register world, zone, placement; map placement to sellable inventory (AC 1) | `Property` (kind VIRTUAL, via onboarding); `AdSlot` pattern; Phase 2 `InventoryItem` / `Listing` | New `VirtualWorld`, `VirtualZone`, `VirtualPlacement`, `PlacementWindow` |
| 2 | Manifest returns only approved, in-window deployments (AC 2) | Deliverable approval chain (`deliverable-state.ts`); `Campaign` state; private-bucket signed URLs | New `CreativeDeployment` + `GET /infinex/manifest` |
| 3 | Client renders the correct asset version (AC 3) | `CreativeAsset.version` pattern | New `DeploymentAsset` (versioned) |
| 4 | Pause or roll back without an INFINEX redeploy (AC 4) | Outbox (`enqueue(tx, …)`) + worker; audit | New outbound event delivery (`infinex.deliver`, `EventSubscription`) |
| 5 | Idempotent telemetry intake that rejects malformed and unauthorised events (AC 5) | Webhook intake pattern (`zoho-webhooks.ts`, `WebhookDelivery`) | New `VirtualEventRaw` with `(clientId, eventId)` PK; raw-body HMAC; **machine auth** (§6) |
| 6 | Viewable ≠ gross, per versioned rule (AC 6) | `MetricSource` labels; versioned-rule pattern (`AthleteScore.method`) | New `ViewabilityRule`, `VirtualMetricDaily`; virtual provenance labels |
| 7 | Duplicates never inflate reports (AC 7) | `MetricDaily` unique key; `EmailSendLog.idempotencyKey` precedent | The primary key on the raw table; aggregation over distinct ids |
| 8 | Activation triggers a reward exactly once (AC 8) | `Reward`, `RewardToken`, `RewardEvent`; `reward_single_redeem.sql`; `redemptionCap` (P6-BE-08) | New `Activation`, `ActivationCompletion` with a unique `(activationId, subjectRef)` |
| 9 | Cross-channel dashboard without double counting (AC 9) | One `Campaign` already holds athlete orders, rewards and ad slots; the sponsor report builder (`sponsor-report.ts`) | Deployments hang off `Campaign` by `campaignId`, like `AdSlot`. De-duplication is a warehouse concern (Phase 3). |
| 10 | Ops console: lag, heartbeat, failures, incidents (AC 10) | `integration-health.ts` + `/admin/integrations` | New `InfinexClient.lastHeartbeatAt`, `DeploymentIncident`, extra health rows |
| 11 | Pilot sponsor report with virtual delivery, reward funnel, creative proof (AC 11) | `report-render.ts` + `report.render` job (`2S7-BE-02`) + `ReportFile` | A virtual section in the report builder |
| 12 | Load targets (AC 12) | Postgres + pg-boss | **Decision `4S0-PMO-03`** on stream buffering (§5.3) |

**The one place redesign risk is real.** `CampaignState` is a single
lifecycle for the whole campaign. A campaign mixing athlete work and virtual
placements goes ACTIVE → REPORTING as a whole. That fits the blueprint's "one
campaign holding real-world, social, athlete, reward and INFINEX inventory"
(`4S7-BE-01`).

**Do not** add per-channel states to `Campaign`. A deployment's own state
machine carries per-placement status, the way `CampaignOrder` and
`Deliverable` already carry per-athlete status beneath one campaign.

---

## 9 · Gaps to close before Phase 4, in order

1. **Machine authentication** (§6): `ServiceCredential`, a second branch in `requireActor`, and a scope check. Blocks every INFINEX call.
2. **Split `SERVICE`** into internal and INFINEX roles in the RBAC matrix (§6.3).
3. **Raw-body capture** for signed endpoints. The existing Zoho HMAC signs re-serialised JSON.
4. **Outbound event delivery**: `EventSubscription`, `EventDelivery`, the `infinex.deliver` job, explicit pg-boss retry and backoff, and dead-lettering visible on Integrations.
5. **Explicit `currency`** on new money-bearing models. Phase 1 assumes USD except on `CampaignInvoice`.
6. **The Phase 2 `InventoryItem` / `Listing` seam** (`P8-PMO-03` §4), so a virtual placement is one inventory kind rather than a parallel purchase path. If Phase 4 must start before the marketplace ships, `PlacementWindow.campaignId` + `soldCents` (the `AdSlot` pattern) is a safe interim that the listing layer can wrap later without migrating data.
7. **Sprint 0 decisions:**
   - `4S0-PMO-01` runtime and identity model, including whether `subjectRef` may ever be linked across channels
   - `4S0-PMO-02` taxonomy
   - `4S0-PMO-03` volume and cost (stream buffer or not)
   - `4S0-SEC-01` client authentication and signing

---

## 10 · Contradictions noted while writing this

- The Phase 4 plan file says "**No spreadsheet is committed to this repository.** `documentation/*.xlsx` is gitignored…". `CLAUDE.md` (changed 2026-09-14) says the tracker **is** committed, at `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`. The same stale paragraph appears in the other phase files' headers.
- `backend/src/contracts/registry.ts` describes `bearerAuth` as the API Service Account's scheme, but no verifier behind it accepts anything other than a Clerk user session (§2, §6.1).
- `frontend/src/server/portal.ts` says `STUDENT` "is not in the Role enum yet". It is (`schema.prisma`, P9-BE-05). The comment is stale; the routing it describes is correct.
