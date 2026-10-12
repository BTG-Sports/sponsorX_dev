# SponsorX Warehouse Schema and Semantic Layer

**Task `3S0-DATA-02` · Version 1.0 · 2026-10-12 · Phase 3, Sprint 0 · Draft for review**

Phase 3's benchmarks, pricing, forecasting and dashboards read from an
analytical model kept **separate from the product database**, so analytical
queries never slow the product (Spec §15, §19, §20). This document designs that
model: where it lives, its layers, every dimension, the daily campaign fact
table in full, the companion facts, the semantic layer's metric definitions,
and the reconciliation that proves it right (Spec §22).

It is built on [`SponsorX-Event-Taxonomy-Audit.md`](./SponsorX-Event-Taxonomy-Audit.md)
(`3S0-DATA-01`), which inventories every source. `3S1-DATA-01` (ingestion)
and `3S1-DATA-02` (fact and dimension tables) build what is specified here;
`3S1-QA-01` automates §8.

**Done when** (Phase 3 plan): *warehouse schema designed and reviewed; the
daily campaign fact table and its dimensions are specified.* The fact is §5,
the dimensions §4, the review §10.

---

## 1 · Decisions

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | What one row of the daily campaign fact means | **campaign × athlete × channel × inventory × day** | A campaign spans many athletes, properties and channels, so every dimension attaches directly and campaign-per-day totals are a plain sum. Inventory joins the key because an athlete can hold several jobs on one campaign (`CampaignOrder` is unique on campaign + athlete + job); without it a row could have two jobs and the inventory key would not be single-valued. Chosen by the user 2026-10-12 as "campaign × athlete × channel × day"; inventory added for that reason. |
| D2 | Where the warehouse lives | **A separate Postgres database on the same Railway project**, fed by the worker | Matches the stack (`.claude/stack-decision.md`), costs least at this size, private networking already exists. The SQL below stays portable (no Postgres-only features in the marts except `text[]`, noted where used). `3S0-OPS-01` confirms and costs it. |
| D3 | What a dimension keeps when an entity changes | **History** (slowly changing dimension, type 2) for sponsor, property and athlete | Last season's benchmarks keep last season's market, tier and property. Campaign, channel, inventory, market and date are type 1 (current values), for the reasons given on each. |

Out of scope here, and why:

- **The operational Phase 3 tables of Spec §19** (`pricing_recommendations`,
  `pricing_overrides`, `match_scores`, `campaign_forecasts`,
  `make_good_recommendations`, `attribution_events`, `attribution_rules`,
  `anomaly_events`, `model_registry`, `feature_snapshots`, `scenario_runs`) are
  **product tables**. They are written by the Sprint 2–8 services in the product
  database, with tenant scope and audit, and are designed by their own tasks.
  The warehouse ingests them later as sources. Only `warehouse_fact_campaign_daily`
  and the `warehouse_dim_*` tables of §19 belong here.
- **`benchmark_metrics`** is produced by `3S1-DATA-03` from this model; its
  shape is sketched in §7 so the fact supports it.

## 2 · Architecture

```
 product Postgres (Railway)                 warehouse Postgres (Railway, separate database)
 ┌──────────────────────┐   worker job,    ┌──────────────────────────────────────────────┐
 │ RewardEvent, LinkEvent│  read-only role  │ raw   — append-only copies, _ingested_at       │
 │ EditionEvent, Metric- │ ───────────────► │ stg   — typed, renamed, audit names mapped     │
 │ Daily, AuditLog, …    │  (3S1-DATA-01)   │ dw    — dimensions and facts (this document)   │
 └──────────────────────┘                   │ sem   — views: the semantic layer (§6)         │
                                            └──────────────────────────────────────────────┘
```

- **The product never reads the warehouse on a request path**, and the
  warehouse never writes the product. Ingestion uses a dedicated **read-only
  role** on the product database. Intelligence screens (`3S7-*`) read `sem`
  views through the API, never `raw` or `stg`.
- **raw** keeps every ingested version of a mutable row with `_ingested_at`.
  That is how history is kept from now on for anything the product updates in
  place: `MetricDaily` corrections, ledger and payment status (audit gaps G7,
  G8). A day's knowledge is "the latest raw version with `_ingested_at` at or
  before that day".
- **Transformation** is plain SQL files run in order (`stg` then `dw`), kept in
  the repository and versioned like code. Whether that is dbt or a small runner
  is `3S0-OPS-01`'s call; the files are the same either way.
- **Idempotent by day.** Ingestion and transformation rebuild a **date range**
  inside one transaction: delete the facts for those dates, insert them again.
  A re-run never double-counts (`3S1-DATA-01`'s acceptance). The default range
  is the last 7 days, so late-arriving rows (a metric entered days later, a
  geo lookup, a correction) are picked up; a full rebuild is the same job with
  a wider range.

## 3 · Conventions

- **Keys.** Every dimension has a surrogate key `<dim>_key bigint` (identity)
  and keeps its source id as `<entity>_id text`. Every dimension has an
  **unknown member** at key `0` ("Unattributed" / "Unknown"), so a fact never
  has a null key.
- **History (type 2).** `valid_from date`, `valid_to date` (`9999-12-31` while
  current), `is_current boolean`. A fact row takes the dimension version valid
  **on the fact's date**.
- **Tenant.** Every dimension and fact row carries `tenant_id text`. The
  semantic layer filters on it; no view returns rows across tenants. `LedgerEntry`'s
  `partyTenantId` is carried as `party_tenant_id` where a payee's view needs it.
- **Time.** Every date is a **UTC calendar date** (`date`). An event's day is
  the UTC date of its `at` / `createdAt`.
- **Money.** Integer **cents** (`bigint`), with the currency where the source
  has one. Never floating point.
- **Provenance.** Figures from different sources are **separate columns**,
  never one blended number (`SponsorX-Metric-Provenance-Taxonomy.md`). A sum
  across labels exists only as a named semantic metric that discloses it.
- **No personal data.** No email, legal name, phone, birth date, fan email or
  IP. Athletes appear by display name, age band and an `is_minor` flag. This
  keeps the warehouse outside the PII review that the product database is
  under.
- **Names.** `snake_case`; facts `fact_*`, dimensions `dim_*`, bridges
  `bridge_*`, snapshots `snap_*`.

## 4 · Dimensions

### `dim_date` — type 1, static

One row per calendar day from 2026-01-01 to 2030-12-31.

| Column | Type | Notes |
|---|---|---|
| `date_key` | `int` | `yyyymmdd`, e.g. `20261012` |
| `date` | `date` | |
| `year`, `quarter`, `month`, `iso_week`, `day_of_week` | `smallint` | |
| `month_start`, `week_start` | `date` | for roll-ups |
| `season` | `text` | US school-sport season label, `FALL` / `WINTER` / `SPRING` / `SUMMER`, by month (seasonality factor for `3S2-BE-02`) |

### `dim_sponsor` — type 2

| Column | Type | Source |
|---|---|---|
| `sponsor_key` | `bigint` | |
| `tenant_id`, `sponsor_id` | `text` | `Sponsor.tenantId`, `Sponsor.id` |
| `name` | `text` | `Sponsor.name` |
| `ownership` | `text` | `Sponsor.ownership` |
| `categories` | `text[]` | `Sponsor.categories` (Postgres array; a `bridge_sponsor_category` with one row per category is generated for engines without arrays) |
| `valid_from`, `valid_to`, `is_current` | | |

A new version is written when `name`, `ownership` or `categories` change.

### `dim_property` — type 2

| Column | Type | Source |
|---|---|---|
| `property_key` | `bigint` | |
| `tenant_id`, `property_id` | `text` | `Property` |
| `name`, `kind` | `text` | `Property.name`, `Property.kind` (e.g. `SCHOOL`) |
| `city`, `state_code` | `text` | `Property.city`, `Property.stateCode` |
| `valid_from`, `valid_to`, `is_current` | | |

### `dim_athlete` — type 2

| Column | Type | Source |
|---|---|---|
| `athlete_key` | `bigint` | |
| `tenant_id`, `athlete_id` | `text` | `Athlete` |
| `display_name` | `text` | `Athlete.displayName` (public) |
| `sport`, `position`, `level`, `school` | `text` | `Athlete` |
| `grad_year` | `smallint` | `Athlete.gradYear` |
| `tier` | `text` | `Athlete.tier` (`EMERGING` / `CREATOR` / `PREMIUM` / `ANCHOR`) |
| `age_band` | `text` | `Athlete.ageBand` — never the birth date |
| `is_minor` | `boolean` | the product's minor rule (`requiresGuardian`: under the athlete's age of majority by birth date, or a minor age band), evaluated on the version date; the birth date itself is not copied |
| `city`, `state_code` | `text` | `Athlete.city`, `Athlete.stateCode` — the **registered market** |
| `property_id` | `text` | `Athlete.propertyId` — resolved to `dim_property` on the fact |
| `valid_from`, `valid_to`, `is_current` | | |

A new version is written when tier, city, state, property, sport, level,
school or minor status change. Display-name changes overwrite in place
(type 1 on that column): a name is not an analytical attribute.

### `dim_campaign` — type 1

Campaign attributes that analysis groups by are fixed when it is sold; its
state moves daily and lives on the fact's activity, not here.

| Column | Type | Source |
|---|---|---|
| `campaign_key` | `bigint` | |
| `tenant_id`, `campaign_id` | `text` | `Campaign` |
| `name` | `text` | |
| `sponsor_id` | `text` | `Campaign.sponsorId` |
| `start_date`, `end_date` | `date` | |
| `budget_cents` | `bigint` | `Campaign.budget` |
| `brief_categories` | `text[]` | `CampaignBrief.categories` via `briefId` |
| `brief_state_codes` | `text[]` | `CampaignBrief.stateCodes` — the markets it targeted |
| `current_state` | `text` | `Campaign.state`, for filtering only |
| `launched_on`, `completed_on` | `date` | first `campaign.launch` / `campaign.complete` audit row |

### `dim_channel` — type 1, static

**Where the activity happened.** No product table has a channel or platform
column (`Deliverable` has none; the job catalogue is format-only), so channel
is **derived** during staging by these rules, in order:

| `channel_code` | Group | Rule |
|---|---|---|
| `SOCIAL_INSTAGRAM`, `SOCIAL_TIKTOK`, `SOCIAL_YOUTUBE`, `SOCIAL_X`, `SOCIAL_FACEBOOK` | `SOCIAL` | a deliverable's `publishedUrl` host (`instagram.com`, `tiktok.com`, `youtube.com`/`youtu.be`, `x.com`/`twitter.com`, `facebook.com`) |
| `SOCIAL_OTHER` | `SOCIAL` | a published deliverable whose URL host is none of the above |
| `IN_PERSON` | `IN_PERSON` | a deliverable with no URL whose job is in-person (`SX-05` Local Appearance, `SX-06` Content Day) |
| `UNPUBLISHED` | `SOCIAL` | a deliverable not yet published (no URL) — counts due/submitted only |
| `REWARD_QR` | `FAN` | `RewardEvent` rows (the fan reward funnel) |
| `TRACKING_LINK` | `FAN` | `LinkEvent` rows |
| `EDITION_PRINT` | `EDITION` | `EditionEvent` of type `QR_SCAN`; ad-slot sales |
| `EDITION_DIGITAL` | `EDITION` | `EditionEvent` of other types |
| `CAMPAIGN` | `CAMPAIGN` | campaign-level money with no athlete (invoices) |

**Open item O1:** deriving the platform from the URL is reliable for the
listed hosts but is still an inference. If platform matters to pricing,
a `platform` column on `Deliverable` (set at publish) is a small backend task;
the rule above is then only the fallback for older rows.

### `dim_inventory` — type 1 with version

**What was sold.** Three kinds, one dimension:

| Column | Type | Notes |
|---|---|---|
| `inventory_key` | `bigint` | |
| `tenant_id` | `text` | |
| `inventory_kind` | `text` | `NIL_JOB` (managed campaigns: `CampaignOrder.jobId` → `NilJob`), `LISTING_ITEM` (marketplace `InventoryItem`), `AD_SLOT` (NEXT `AdSlot`) |
| `source_id` | `text` | the `NilJob`, `InventoryItem` or `AdSlot` id |
| `name` | `text` | job name, item title, or slot code |
| `format` | `text` | job code (`SX-01`…), item `kind`, or slot `kind` (`QUARTER`…`PRESENTING`) |
| `list_low_cents`, `list_high_cents` | `bigint` | `NilJob.sellLow`/`sellHigh` ×100 (dollars in source — see audit note on units), item `priceCents` (both), slot `priceCents` (both) |
| `source_version` | `int` | `InventoryItem.version`; 1 otherwise |

Type 1: list prices are a reference, not what was paid — what was paid is on
the fact (`booked_sell_cents`). The version column says which revision a row
was copied from.

### `dim_market` — type 1

**Where the market is**, by the rule set in the audit (§6 there): from
registration, never from IP.

| Column | Type | Notes |
|---|---|---|
| `market_key` | `bigint` | |
| `state_code` | `text` | US state; `ZZ` for unknown |
| `city` | `text` | normalised (trimmed, title case); `''` for state-only |
| `region` | `text` | US Census region of the state (`NORTHEAST`, `MIDWEST`, `SOUTH`, `WEST`) |

Which market a fact row takes is a rule on the fact (§5), not on the
athlete: a reward's venue, when it has one, beats the athlete's registration.

## 5 · `fact_campaign_daily`

**Grain:** one row per **campaign × athlete × channel × inventory × day** that
had any activity. A row with all measures zero is not written.

**Additive:** every measure is a count or cents for that day only, so any
roll-up (campaign per day, campaign to date, athlete per month) is a `SUM`.
Ratios are never stored (§6).

### Keys

| Column | Type | Rule |
|---|---|---|
| `date_key` | `int` | the UTC day of the activity |
| `tenant_id` | `text` | the campaign's tenant |
| `campaign_key` | `bigint` | |
| `sponsor_key` | `bigint` | the campaign's sponsor, version valid on the day |
| `athlete_key` | `bigint` | the athlete on the order / token; `0` for campaign-level rows and reward tokens with no athlete |
| `property_key` | `bigint` | the athlete's property on the day; `0` if none |
| `channel_key` | `bigint` | §4 rules |
| `inventory_key` | `bigint` | the order's job for social / in-person / fan rows; the ad slot for edition rows; `0` for campaign-level rows |
| `market_key` | `bigint` | `REWARD_QR` rows: the reward's venue (`Reward.venueCity`/`venueStateCode`) if set, else the athlete's registered city/state; every other row: the athlete's registered city/state; campaign-level rows: unknown |

Primary key: (`date_key`, `campaign_key`, `athlete_key`, `channel_key`, `inventory_key`).

### Measures — delivery and performance

| Column | Type | Source (day = UTC date of …) |
|---|---|---|
| `deliverables_due` | `int` | `Deliverable` with `dueDate` that day |
| `deliverables_published` | `int` | `Deliverable.publishedAt` |
| `deliverables_verified` | `int` | `deliverable.verify` audit row `at` |
| `revisions_requested` | `int` | `deliverable.requestRevision` + `deliverable.systemRevision` audit rows |
| `views_verified_api`, `views_verified_manual`, `views_self_reported`, `views_estimated`, `views_attributed` | `bigint` | `MetricDaily.views` by `source`, for its `day` (latest raw version) |
| `engagements_verified_api`, `engagements_verified_manual`, `engagements_self_reported`, `engagements_estimated`, `engagements_attributed` | `bigint` | `MetricDaily.engagements` by `source` |
| `metric_corrections` | `int` | raw versions of a `MetricDaily` row beyond the first, by `updatedAt` day — a data-quality signal |

### Measures — fan funnel

| Column | Type | Source |
|---|---|---|
| `qr_scans`, `qr_landings`, `qr_claims`, `qr_redemptions` | `int` | `RewardEvent` by `type` (`SCAN`, `LANDING`, `CLAIM`, `REDEEM`); athlete from `RewardToken.athleteId`; campaign from `Reward.campaignId` |
| `qr_refused_redeems` | `int` | change in `RewardToken.refusedRedeems` between ingested versions, dated by `lastRefusedRedeemAt` (`3S0-BE-04`) |
| `link_clicks` | `int` | `LinkEvent`; athlete and job via `TrackingLink` → `Deliverable` → `CampaignOrder` |
| `edition_print_scans`, `edition_digital_engagements` | `int` | `EditionEvent` with `targetKind = AD_SLOT` on a slot sold to this campaign (`AdSlot.campaignId`) |

### Measures — money (cents)

| Column | Type | Source |
|---|---|---|
| `booked_sell_cents` | `bigint` | `CampaignOrder.sellPrice` on the day the order was accepted (`acceptedAt`) |
| `booked_compensation_cents` | `bigint` | `CampaignOrder.compensation`, same day |
| `cancelled_sell_cents` | `bigint` | the order's `sellPrice` on the day of its `order.cancel` audit row, if it had been accepted (negative effect is applied in the semantic metric, not by a negative row) |
| `earnings_paid_cents` | `bigint` | `Earning.gross + Earning.adjustment` on `paidAt` |
| `ad_slot_sold_cents` | `bigint` | `AdSlot.soldCents` on `soldAt` (edition rows) |
| `invoiced_cents`, `invoice_paid_cents` | `bigint` | `CampaignInvoice.amount` on `issuedAt` / `paidAt` (campaign-level rows: athlete `0`, channel `CAMPAIGN`) |

### Activity dating, in one sentence

Every measure lands on **the day its own event happened**, never on the day
the warehouse saw it, and never spread across days: a booking on its
acceptance day, a payment on its paid day, a view on the metric's day. That is
what makes the table additive and what makes §8's reconciliation exact.

## 6 · The semantic layer (`sem` views)

The definitions every screen, report and model uses. One definition per name;
a screen that needs a different number needs a different name.

| Metric | Definition |
|---|---|
| `views_verified` | `views_verified_api + views_verified_manual` — the figure SponsorX stands behind |
| `views_all_labels` | sum of all five `views_*`, **always shown with its label mix** (provenance taxonomy §4.2) |
| `engagement_rate_verified` | `SUM(engagements_verified_*) / NULLIF(SUM(views_verified_*), 0)` — computed at read time |
| `claim_rate` | `SUM(qr_claims) / NULLIF(SUM(qr_landings), 0)` |
| `redemption_rate` | `SUM(qr_redemptions) / NULLIF(SUM(qr_claims), 0)` |
| `scan_to_landing_gap` | `1 - SUM(qr_landings) / NULLIF(SUM(qr_scans), 0)` — an operational finding (reward taxonomy) |
| `booked_net_cents` | `SUM(booked_sell_cents) - SUM(cancelled_sell_cents)` |
| `margin_cents` | `booked_net_cents - SUM(booked_compensation_cents)` on the same orders |
| `effective_cpm_cents` | `booked_net_cents * 1000 / NULLIF(views_verified, 0)` — verified views only |
| `delivery_on_time_rate` | deliverables published on or before due ÷ deliverables due (by order) |

Rules the views enforce:

- **Ratios over sums, never averages of ratios**, so a small campaign does not
  weigh as much as a large one.
- **A derived value takes the weakest provenance of its inputs**
  (provenance taxonomy §4.1): `effective_cpm_cents` is verified only because it
  uses verified views; a variant over all labels is named `…_all_labels`.
- **Tenant filter on every view.** Views take the caller's tenant; there is no
  cross-tenant view.
- **Old audit names map to current ones** in `stg` (audit §6):
  `listing.archived` → `listing.archive`.

## 7 · Companion facts and snapshots

Specified to the level `3S1-DATA-02` needs to plan; their columns follow the
same conventions.

| Table | Grain | Why it is separate |
|---|---|---|
| `fact_marketplace_order_line` | one row per marketplace order line | Marketplace orders are sponsor purchases of listings and **belong to no campaign** (`MarketplaceOrder` has no campaign link). Keys: date (contracted), sponsor, property / seller athlete, inventory (`LISTING_ITEM`), market. Measures from `MarketplaceOrderLine` and `OrderLineFinancials`: gross, discount, net, platform fee, management fee, processing, property share, referral, reserve — all cents. |
| `snap_ledger_daily` | one row per party × account × status × day | `LedgerEntry.status` changes in place (audit G8). A daily snapshot of balances by `PENDING` / `AVAILABLE` / `PAID` / `REVERSED` keeps the history. |
| `snap_payment_status_daily` | one row per payment attempt / payout / refund × day while open | Same reason, for `PaymentAttempt`, `Payout`, `RefundDue`. |
| `benchmark_metrics` (`3S1-DATA-03`) | dimension type × dimension id × metric × period | p25, median, p75 and `sample_size` of per-campaign or per-athlete values, computed from `fact_campaign_daily` by sport, market, format (inventory) and audience (tier). A small sample stays visibly small. |

## 8 · Reconciliation (for `3S1-QA-01`)

The warehouse is right when these hold, per tenant, run nightly over all time
and over the last 7 days:

| Check | Warehouse | Product | Tolerance |
|---|---|---|---|
| Booked value | `SUM(booked_sell_cents)` per campaign | `SUM(CampaignOrder.sellPrice)` where `acceptedAt` is set | **exact** |
| Compensation | `SUM(booked_compensation_cents)` per campaign | `SUM(CampaignOrder.compensation)`, same orders | exact |
| Earnings paid | `SUM(earnings_paid_cents)` per campaign | `SUM(gross + adjustment)` of `Earning` with `paidAt` | exact |
| Invoices | `SUM(invoiced_cents)`, `SUM(invoice_paid_cents)` per campaign | `CampaignInvoice` amounts by `issuedAt` / `paidAt` | exact |
| Marketplace | `SUM(net)` of `fact_marketplace_order_line` | `SUM(OrderLineFinancials.netCents)` | exact |
| Ledger | `snap_ledger_daily` for today | `SUM(debitCents - creditCents)` of `LedgerEntry` by party, account, status | exact |
| Fan funnel | `SUM(qr_*)` per reward-day | `COUNT(*)` of `RewardEvent` by type and UTC day | exact |
| Clicks | `SUM(link_clicks)` | `COUNT(*)` of `LinkEvent` | exact |
| Views | `SUM(views_<label>)` per deliverable-day | `MetricDaily` latest version | exact |

**Every tolerance is zero.** The fact is built from the same rows with
integer arithmetic and day dating, so any difference is a defect, not
rounding. The only expected lag is ingestion's schedule: checks compare
against the product **as of the ingestion run's start**. Drift raises an
alert (`3S1-QA-01`) with the check name, tenant and the two totals.

## 9 · Open items

| # | Item | Owner |
|---|---|---|
| O1 | Social platform is inferred from the published URL (§4 `dim_channel`). A `platform` field on `Deliverable` would make it a fact. | backend, if pricing needs it |
| O2 | `NilJob` prices are whole dollars while every other amount is cents (audit, Phase 2–4 plan note 1); `dim_inventory` multiplies by 100. Confirm before `3S2-BE-02` reads list prices. | backend |
| O3 | Ingestion cadence: hourly for `raw` events, nightly for the full transform and reconciliation, is the starting point. `3S0-OPS-01` costs it. | ops |
| O4 | Retention in the warehouse: same as the product's (it holds no personal data, so no shorter PII clock applies). Confirm with the data-retention owner. | PMO |

## 10 · Review

| | |
|---|---|
| **Reviewed and accepted** | Yes / with changes below |
| **By** | |
| **Date** | |
| **Changes requested** | |

---

## Appendix A · Table definitions (SQL)

Postgres dialect. Run against an empty database on 2026-10-12 to check it is
valid; `3S1-DATA-02` creates these through the transformation layer. The
`raw` and `stg` schemas are `3S1-DATA-01`'s and are not defined here.

```sql
CREATE SCHEMA IF NOT EXISTS dw;

CREATE TABLE dw.dim_date (
  date_key     int PRIMARY KEY,
  date         date NOT NULL UNIQUE,
  year         smallint NOT NULL,
  quarter      smallint NOT NULL,
  month        smallint NOT NULL,
  iso_week     smallint NOT NULL,
  day_of_week  smallint NOT NULL,
  month_start  date NOT NULL,
  week_start   date NOT NULL,
  season       text NOT NULL CHECK (season IN ('FALL','WINTER','SPRING','SUMMER'))
);

CREATE TABLE dw.dim_sponsor (
  sponsor_key  bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id    text NOT NULL,
  sponsor_id   text NOT NULL,
  name         text NOT NULL,
  ownership    text,
  categories   text[] NOT NULL DEFAULT '{}',
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (sponsor_id, valid_from)
);

CREATE TABLE dw.bridge_sponsor_category (
  sponsor_key  bigint NOT NULL REFERENCES dw.dim_sponsor (sponsor_key),
  category     text NOT NULL,
  PRIMARY KEY (sponsor_key, category)
);

CREATE TABLE dw.dim_property (
  property_key bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id    text NOT NULL,
  property_id  text NOT NULL,
  name         text NOT NULL,
  kind         text,
  city         text,
  state_code   text,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (property_id, valid_from)
);

CREATE TABLE dw.dim_athlete (
  athlete_key  bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id    text NOT NULL,
  athlete_id   text NOT NULL,
  display_name text NOT NULL,
  sport        text,
  position     text,
  level        text,
  school       text,
  grad_year    smallint,
  tier         text CHECK (tier IN ('EMERGING','CREATOR','PREMIUM','ANCHOR')),
  age_band     text,
  is_minor     boolean NOT NULL,
  city         text,
  state_code   text,
  property_id  text,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL,
  UNIQUE (athlete_id, valid_from)
);

CREATE TABLE dw.dim_campaign (
  campaign_key      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id         text NOT NULL,
  campaign_id       text NOT NULL UNIQUE,
  name              text NOT NULL,
  sponsor_id        text NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  budget_cents      bigint NOT NULL,
  brief_categories  text[] NOT NULL DEFAULT '{}',
  brief_state_codes text[] NOT NULL DEFAULT '{}',
  current_state     text NOT NULL,
  launched_on       date,
  completed_on      date
);

CREATE TABLE dw.dim_channel (
  channel_key   bigint PRIMARY KEY,
  channel_code  text NOT NULL UNIQUE,
  channel_group text NOT NULL CHECK (channel_group IN ('SOCIAL','IN_PERSON','FAN','EDITION','CAMPAIGN','UNKNOWN'))
);

CREATE TABLE dw.dim_inventory (
  inventory_key   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id       text NOT NULL,
  inventory_kind  text NOT NULL CHECK (inventory_kind IN ('NIL_JOB','LISTING_ITEM','AD_SLOT','UNKNOWN')),
  source_id       text NOT NULL,
  name            text NOT NULL,
  format          text,
  list_low_cents  bigint,
  list_high_cents bigint,
  source_version  int NOT NULL DEFAULT 1,
  UNIQUE (inventory_kind, source_id)
);

CREATE TABLE dw.dim_market (
  market_key  bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  state_code  text NOT NULL,
  city        text NOT NULL DEFAULT '',
  region      text NOT NULL CHECK (region IN ('NORTHEAST','MIDWEST','SOUTH','WEST','UNKNOWN')),
  UNIQUE (state_code, city)
);

-- Unknown members (key 0) so a fact never carries a null key.
INSERT INTO dw.dim_sponsor  (sponsor_key, tenant_id, sponsor_id, name, valid_from, is_current) OVERRIDING SYSTEM VALUE VALUES (0, '', '', 'Unattributed', '2000-01-01', true);
INSERT INTO dw.dim_property (property_key, tenant_id, property_id, name, valid_from, is_current) OVERRIDING SYSTEM VALUE VALUES (0, '', '', 'No property', '2000-01-01', true);
INSERT INTO dw.dim_athlete  (athlete_key, tenant_id, athlete_id, display_name, is_minor, valid_from, is_current) OVERRIDING SYSTEM VALUE VALUES (0, '', '', 'Unattributed', false, '2000-01-01', true);
INSERT INTO dw.dim_inventory (inventory_key, tenant_id, inventory_kind, source_id, name) OVERRIDING SYSTEM VALUE VALUES (0, '', 'UNKNOWN', '', 'Unknown');
INSERT INTO dw.dim_market   (market_key, state_code, city, region) OVERRIDING SYSTEM VALUE VALUES (0, 'ZZ', '', 'UNKNOWN');
INSERT INTO dw.dim_channel (channel_key, channel_code, channel_group) VALUES
  (0, 'UNKNOWN', 'UNKNOWN'),
  (1, 'SOCIAL_INSTAGRAM', 'SOCIAL'), (2, 'SOCIAL_TIKTOK', 'SOCIAL'), (3, 'SOCIAL_YOUTUBE', 'SOCIAL'),
  (4, 'SOCIAL_X', 'SOCIAL'), (5, 'SOCIAL_FACEBOOK', 'SOCIAL'), (6, 'SOCIAL_OTHER', 'SOCIAL'),
  (7, 'UNPUBLISHED', 'SOCIAL'), (8, 'IN_PERSON', 'IN_PERSON'),
  (9, 'REWARD_QR', 'FAN'), (10, 'TRACKING_LINK', 'FAN'),
  (11, 'EDITION_PRINT', 'EDITION'), (12, 'EDITION_DIGITAL', 'EDITION'),
  (13, 'CAMPAIGN', 'CAMPAIGN');

CREATE TABLE dw.fact_campaign_daily (
  date_key       int    NOT NULL REFERENCES dw.dim_date (date_key),
  tenant_id      text   NOT NULL,
  campaign_key   bigint NOT NULL REFERENCES dw.dim_campaign (campaign_key),
  sponsor_key    bigint NOT NULL REFERENCES dw.dim_sponsor (sponsor_key),
  athlete_key    bigint NOT NULL REFERENCES dw.dim_athlete (athlete_key),
  property_key   bigint NOT NULL REFERENCES dw.dim_property (property_key),
  channel_key    bigint NOT NULL REFERENCES dw.dim_channel (channel_key),
  inventory_key  bigint NOT NULL REFERENCES dw.dim_inventory (inventory_key),
  market_key     bigint NOT NULL REFERENCES dw.dim_market (market_key),

  deliverables_due        int NOT NULL DEFAULT 0,
  deliverables_published  int NOT NULL DEFAULT 0,
  deliverables_verified   int NOT NULL DEFAULT 0,
  revisions_requested     int NOT NULL DEFAULT 0,
  views_verified_api      bigint NOT NULL DEFAULT 0,
  views_verified_manual   bigint NOT NULL DEFAULT 0,
  views_self_reported     bigint NOT NULL DEFAULT 0,
  views_estimated         bigint NOT NULL DEFAULT 0,
  views_attributed        bigint NOT NULL DEFAULT 0,
  engagements_verified_api    bigint NOT NULL DEFAULT 0,
  engagements_verified_manual bigint NOT NULL DEFAULT 0,
  engagements_self_reported   bigint NOT NULL DEFAULT 0,
  engagements_estimated       bigint NOT NULL DEFAULT 0,
  engagements_attributed      bigint NOT NULL DEFAULT 0,
  metric_corrections      int NOT NULL DEFAULT 0,

  qr_scans                int NOT NULL DEFAULT 0,
  qr_landings             int NOT NULL DEFAULT 0,
  qr_claims               int NOT NULL DEFAULT 0,
  qr_redemptions          int NOT NULL DEFAULT 0,
  qr_refused_redeems      int NOT NULL DEFAULT 0,
  link_clicks             int NOT NULL DEFAULT 0,
  edition_print_scans     int NOT NULL DEFAULT 0,
  edition_digital_engagements int NOT NULL DEFAULT 0,

  booked_sell_cents         bigint NOT NULL DEFAULT 0,
  booked_compensation_cents bigint NOT NULL DEFAULT 0,
  cancelled_sell_cents      bigint NOT NULL DEFAULT 0,
  earnings_paid_cents       bigint NOT NULL DEFAULT 0,
  ad_slot_sold_cents        bigint NOT NULL DEFAULT 0,
  invoiced_cents            bigint NOT NULL DEFAULT 0,
  invoice_paid_cents        bigint NOT NULL DEFAULT 0,

  _built_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date_key, campaign_key, athlete_key, channel_key, inventory_key)
);
CREATE INDEX fact_campaign_daily_tenant_date ON dw.fact_campaign_daily (tenant_id, date_key);
CREATE INDEX fact_campaign_daily_athlete     ON dw.fact_campaign_daily (athlete_key, date_key);

CREATE SCHEMA IF NOT EXISTS sem;

CREATE VIEW sem.campaign_daily AS
SELECT f.tenant_id, d.date, c.campaign_id, c.name AS campaign_name, ch.channel_code, ch.channel_group,
       f.views_verified_api + f.views_verified_manual             AS views_verified,
       f.engagements_verified_api + f.engagements_verified_manual AS engagements_verified,
       f.qr_scans, f.qr_landings, f.qr_claims, f.qr_redemptions, f.link_clicks,
       f.booked_sell_cents - f.cancelled_sell_cents               AS booked_net_cents
  FROM dw.fact_campaign_daily f
  JOIN dw.dim_date d      ON d.date_key = f.date_key
  JOIN dw.dim_campaign c  ON c.campaign_key = f.campaign_key
  JOIN dw.dim_channel ch  ON ch.channel_key = f.channel_key;
```

*References: Spec §15, §19, §20, §22; `SponsorX-Event-Taxonomy-Audit.md`;
`SponsorX-Metric-Provenance-Taxonomy.md`; `SponsorX-Reward-Event-Taxonomy.md`;
`SponsorX-Phase2-Ledger-Design.md`; `.claude/stack-decision.md`.*
