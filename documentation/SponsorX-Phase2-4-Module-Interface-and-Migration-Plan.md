# SponsorX — Phase 2–4 Module Interface and Migration Plan

| | |
|---|---|
| **Task** | `P8-PMO-03` · Write the Phase 2–4 module interface and migration plan (§32, §38) |
| **Date** | 2026-09-28 |
| **Status** | Draft for engineering review |
| **Acceptance** | The seams Phase 2 will extend are documented — listings, carts, payments, payouts, Wallet |
| **Audience** | Engineers who will build Phases 2–4 |
| **Companion** | [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md) (`P8-PMO-04`) covers the Phase 4 contract in depth. This document covers it only briefly (§9). |
| **Source of truth** | The code. Every "exists today" claim below cites a path. Anything not in code is labelled **planned**. Where this document and the code disagree, the code wins and this document is wrong. |

---

## 0 · How to read this

Phase 1 is a **managed** marketplace. BTG staff match athletes, price the work,
check conflicts and invoice through Zoho. Phase 2 adds self-service commerce:
external properties onboard themselves, list inventory, sponsors check out,
money moves through a payment provider, and payouts go out.

The goal of this document is to make Phase 2 an **extension** of Phase 1, not
a rewrite. Each of the five seams the acceptance names — **listings, carts,
payments, payouts, Wallet** — gets the same six headings:

1. **Exists today.** Models, routes, domain modules, state machines and jobs, with file paths.
2. **The extension point.** Where the new code attaches.
3. **What must not change.** Invariants.
4. **Migration steps.** Schema additions, backfills and flags, in order.
5. **Phase 2 tasks it serves.** The task IDs from [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md).
6. **Open questions.** Where they exist.

Paths are relative to the repo root. `backend/` is the Express API, the
pg-boss worker and Prisma (Addendum B in `.claude/stack-decision.md`).
`frontend/` is the Next.js app. The frontend has **no database access** —
every read goes through `/api/v1` (see the comment on the removed second
generator in `backend/prisma/schema.prisma`).

---

## 1 · Phase 2 has already started — honestly stated

Phase 2 backend work started on 2026-09-28 in commit `27397ec`, "first Phase 2
backend batch". What landed, and where each row sits on the board:

| Task | What exists | Where |
|---|---|---|
| `2S0-PMO-01` Marketplace state machines | A decision document for seven machines. **Its status is "SIMULATED — for BTG to confirm."** Only onboarding is implemented; listing, reservation, order, payment, payout and dispute are working designs. | `documentation/SponsorX-Phase2-State-Machines.md` |
| `2S1-BE-01` Property onboarding model + wizard API | `PropertyOnboarding` model and `OnboardingState` enum. A public wizard keyed by an HMAC resume token. Strict per-organisation-type Zod schemas that **refuse any field not asked for**, so no tax ID or bank field can sneak in. | `backend/prisma/schema.prisma` (`PropertyOnboarding`), `backend/src/domain/onboarding.ts`, `backend/src/domain/onboarding-rules.ts`, `backend/src/lib/onboarding-token.ts`, `backend/src/routes/v1/onboarding.ts`, migration `20260928120000_property_onboarding` |
| `2S1-BE-03` Verification queue + decisions | `GET /onboarding` (queue), `GET /onboarding/:id`, and `POST /onboarding/:id/decision` taking one of APPROVE, REQUEST_CHANGES, REJECT, SUSPEND or REINSTATE. Approving creates a `Property` and stamps `Property.listingAccessAt`. Suspending clears it; reinstating restores it. Every decision is audited as `onboarding.<decision>`. | same files; RBAC Matrix §16 |
| `2S6-BE-03` Sponsor-contact consent | A second, separately versioned consent purpose (`sponsor-contact`, version `2026-09-28`), captured by an unticked checkbox. Leads are readable only through a consent-filtered query. | `backend/src/domain/fan-consent.ts`, `backend/src/domain/fan-leads.ts`, `GET /campaigns/:id/leads`, migration `20260928100000_fan_sponsor_contact` |
| `2S6-INT-03` Consent-gated Zoho lead push | A claim carrying sponsor-contact consent enqueues `zoho.pushLead`. Consent is re-checked when the push runs. | `backend/src/domain/reward.ts`, `backend/worker/jobs/zoho-sync.mts` |
| `2S7-BE-02` Report render worker job | `report.render`: the screen-12 builder produces HTML, Chromium turns it into a PDF, and the PDF goes to the private bucket as a `ReportFile`. It runs on campaign completion or on request. | `backend/src/domain/report-render.ts`, `backend/src/domain/report-files.ts`, `backend/worker/jobs/render-report.mts`, migration `20260928110000_report_files` |

**What does not exist yet.** There is no model, route or job for listings,
carts, reservations, marketplace orders, payments, payouts, disputes, a
ledger, commission rules or wallet passes. The `payout` resource exists in
`backend/src/auth/policy.ts` with **no model behind it**. The onboarding
wizard UI (`2S1-FE-01`) and the verification-queue screen (`2S1-FE-02`) are
not built either. Onboarding is reachable through the API only.

**Doc drift to be aware of.** The Phase 2 plan file still shows every task
above as `⏸ Blocked`. The tracker xlsx has them at Code review. The tracker
is the working truth for status; the plan file is the truth for definitions.

---

## 2 · The invariants every seam inherits

These hold across all five seams. A Phase 2 change that needs to break one
is a **decision**: write it down and get it approved before coding. Do not
code around it.

| # | Invariant | Where it lives today | What it means for Phase 2 |
|---|---|---|---|
| I-1 | **The Zoho boundary.** Zoho knows who we sell to and whether they paid. SponsorX knows what was promised, who delivers it and whether it worked. | `CLAUDE.md`; `backend/src/domain/zoho-sync.ts`; `backend/src/domain/zoho-mapping.ts` | Marketplace orders are pushed to Zoho as Deals (`2S7-INT-01`). Zoho never becomes the order system. Payment *status* from the provider lives in SponsorX; Zoho Books stays the invoice record for managed deals. |
| I-2 | **Zoho never touches a request path.** Outbound calls are queued; inbound webhooks land in the queue. | `backend/src/db/outbox.ts` (`enqueue(tx, …)`); `backend/src/routes/v1/zoho-webhooks.ts` answers 202 and enqueues | Same rule for the payment provider's **webhooks**. The provider call that *creates* a hosted checkout session is the one unavoidable synchronous vendor call. Keep it inside one adapter, and never inside a database transaction. |
| I-3 | **A job is written in the same transaction as its cause** (transactional outbox). | `backend/src/db/outbox.ts`; drained by `backend/worker/index.mts` every 1 s with `FOR UPDATE SKIP LOCKED` | Every Phase 2 side effect goes through `enqueue(tx, …)`: payment-captured follow-ups, payout execution, wallet pass updates, notifications. Never call `boss.send()` from a request. |
| I-4 | **Tenant scoping on every protected record.** The tenant comes from the actor (Postgres `User.tenantId`), never from the request. | `backend/src/auth/scope.ts` (`whereFor`, `tenantScoped`, `BUILDERS`); `backend/src/auth/actor.ts` | Every new model carries `tenantId`. Every new resource gets a `POLICY` row and a `BUILDERS` entry. A resource with no builder throws `ScopeNotImplementedError`, which is the safe failure. The cross-tenant sweep in `backend/tests/tenant-isolation.test.ts` gets a mapping for each new route. |
| I-5 | **Default deny.** New resources arrive denied to every role until the RBAC matrix adds a row. | `backend/src/auth/policy.ts` (`scopeFor` → `"deny"`); `documentation/SponsorX-RBAC-Matrix.md` §1 | Add the matrix row by pull request **first**, then transcribe it into `policy.ts`. Where the two disagree, the document wins. |
| I-6 | **Field-level denials.** Athlete pay is invisible to sponsors; sell price and margin are invisible to athletes. | `backend/src/auth/fields.ts` (`FIELD_DENIALS`, 19 fields) | Listing prices, commission snapshots, ledger lines and payout amounts each need a field decision. The two Phase 1 rules (RBAC §12 D2 and its reverse) do not loosen because a marketplace is self-service. |
| I-7 | **The audit log is append-only and written in the same transaction.** Nobody writes it through the matrix. | `backend/src/db/audit.ts` (`audit(tx, …)`, `AUDIT_ACTIONS`, `changedFields`); `GET /audit-log` | `2S5-SEC-01` requires "immutable audit history for all financial and admin changes". Add `payment.*`, `payout.*`, `ledger.*`, `listing.*` and `commission.*` actions to `AUDIT_ACTIONS`. Pass only changed fields — `before` and `after` are JSON and will store whatever they are given. |
| I-8 | **No bank details. No tax IDs.** | `documentation/SponsorX-Phase1-Payment-Policy.md` §3; `backend/src/domain/earning.ts` header ("NOTHING HERE MOVES MONEY"); `PropertyOnboarding.payoutAcknowledgedAt` (the applicant is told these go to the provider) | Phase 2 stores **provider account IDs and readiness status only** (`2S5-INT-03`: "SponsorX stores status only, never credentials"). Whether SponsorX must collect tax data is `2S0-LEG-02`'s question. **The payment policy must be formally replaced before any tax field is added.** |
| I-9 | **Money is integer cents.** | Every money column is `Int` (for example `CampaignOrder.compensation`, `sellPrice`, `AdSlot.soldCents`, `RevenueSplit.amountCents`). Only `CampaignInvoice` carries `currency`. | Keep integer minor units. Add an explicit `currency` column to every new money-bearing model. Do not reintroduce "USD by implication". **Known trap:** see §10 (the `NilJob` bands). |
| I-10 | **Schema-first contracts.** Zod → OpenAPI 3.1, served live at `GET /api/v1/openapi.json`. | `backend/src/contracts/*.ts`, `backend/src/contracts/registry.ts` (`PATHS`); `backend/tests/openapi.coverage.test.ts` checks the spec against the live routes in both directions | Every new route needs a `PATHS` row, or CI fails. |
| I-11 | **The §39 loop is protected.** | `CLAUDE.md` "Scope reality" | The managed loop keeps working unchanged alongside self-service. Phase 2 **adds** a second path into `Campaign`; it does not replace the brief → match → invite → Campaign Order path. |
| I-12 | **Race-safe guarantees live in the database, not in application logic.** | `backend/prisma/sql/reward_single_redeem.sql`, `invite_one_open.sql`, `adslot_inventory.sql`, `sales_attribution_immutable.sql` | Reservation exclusivity, "one captured payment per order" and "one payout per ledger line" should all be partial unique indexes or CHECK constraints in `backend/prisma/sql/`, following the same pattern. |

---

## 3 · The spine Phase 2 plugs into

Phase 1 has one delivery chain. Phase 2's job is to feed new orders **into**
it, not to build a second one:

```
CampaignBrief ──▶ Campaign ──▶ CampaignInvite ──▶ CampaignOrder ──▶ Deliverable ──▶ (VERIFIED) ──▶ Earning
  brief-state      campaign-state   invite-state     order-state      deliverable-state            earning-state
                      │                                                    │
                      ├──▶ Reward ──▶ RewardToken ──▶ RewardEvent (SCAN/LANDING/CLAIM/REDEEM)
                      ├──▶ AdSlot (NEXT editions)                          └──▶ TrackingLink ──▶ LinkEvent
                      └──▶ CampaignInvoice (read-only Zoho Books mirror)        MetricDaily (provenance-labelled)
```

State machines (each a pure `TRANSITIONS` table plus an `Illegal*TransitionError`):

| Machine | File | States |
|---|---|---|
| Brief | `backend/src/domain/brief-state.ts` | DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED; CLOSED from any non-terminal state |
| Campaign | `backend/src/domain/campaign-state.ts` | DRAFT → STAFFING → APPROVAL → ACTIVE → REPORTING → COMPLETED; CANCELLED before REPORTING. An ad-only campaign may go DRAFT → APPROVAL. |
| Invitation | `backend/src/domain/invite-state.ts` | INVITED → VIEWED → ACCEPTED \| DECLINED \| EXPIRED |
| Campaign Order | `backend/src/domain/order-state.ts` | DRAFT → SENT → ACCEPTED → ACTIVE → COMPLETED; REJECTED from SENT; CANCELLED before COMPLETED |
| Deliverable | `backend/src/domain/deliverable-state.ts` | NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → (SPONSOR_REVIEW →) APPROVED → PUBLISHED → VERIFIED; a revision returns to DRAFT_SUBMITTED |
| Earning | `backend/src/domain/earning-state.ts` | PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID; HELD and DISPUTED side states |
| Reward | `backend/src/domain/reward-state.ts` | DRAFT → ACTIVE ⇄ PAUSED → EXPIRED → ARCHIVED |
| Edition (NEXT) | `backend/src/domain/edition-state.ts` | PLANNING → SELLING → CLOSED → IN_PRODUCTION → PUBLISHED_DIGITAL → PRINTED → DISTRIBUTED; CANCELLED early |
| Property onboarding (Phase 2) | `backend/src/domain/onboarding-rules.ts` | DRAFT → PENDING_REVIEW → APPROVED \| CHANGES_REQUESTED \| REJECTED; APPROVED ⇄ SUSPENDED |

**A naming collision to settle before `2S4-BE-03`.** Phase 1's
`CampaignOrder` is the **athlete-facing** commitment: one athlete, one job,
their pay, the sell price and the frozen terms. Phase 2's "order" is the
**sponsor-facing** commercial order: cart lines, fees, totals and payment.
They are different things.

**Recommendation:** name the new model `MarketplaceOrder` (or
`CommerceOrder`). Link it 1:1 to the `Campaign` it creates, so the whole
delivery spine above is reused. Do **not** add payment states to
`OrderState`.

---

## 4 · Seam 1 — Listings

### Exists today

| Piece | What it is | Path |
|---|---|---|
| `SponsorPackage` | The fixed §7 package catalogue plus the NEXT products: `code`, `priceLow` / `priceHigh`, `athleteCountMin` / `Max`, `lineItems Json`, `includes Json?`, `exclusivity`, `durationWeeks`, `active`. BTG-owned reference data, seeded by the worker. | `schema.prisma`; `backend/src/domain/sponsor-packages.ts`; `backend/worker/jobs/seed-catalogue.mts` |
| `NilJob` | The NIL job catalogue (SX-01…SX-07): base (athlete) band, sell band, per-tier sell floors. The id is the job code. | `schema.prisma`; `backend/src/domain/nil-jobs.ts` |
| `AthleteRate` | Versioned per-athlete, per-job rate in cents, unique on (athleteId, jobId, version). BTG sets it in Phase 1. | `schema.prisma`; `POST/GET /athletes/:id/rates` in `backend/src/routes/v1/campaigns.ts` |
| Catalogue reads | `GET /public/catalogue/packages` (no login), `GET /catalogue/packages`, `GET /catalogue/jobs`. Sponsor prices only — athlete pay never leaves (`catalogue.ts` header; `tests/sponsor-field-authz.test.ts`). | `backend/src/domain/catalogue.ts`, `backend/src/routes/v1/catalogue.ts` |
| Pricing rules | `TIER_MULTIPLIERS`, `MARGIN_FLOOR = 1.4`, `minimumSellPrice`; `lineFloor`, `assertLineClearsFloor` (422 `LineFloorError`). | `backend/src/domain/pricing.ts`, `backend/src/domain/margin-floor.ts` |
| Conflict model | `Athlete.restrictedCategories String[]` (indexed), applied as a query filter in matching; `brand-categories.ts` holds the vocabulary. | `backend/src/domain/matching.ts`, `backend/src/domain/brand-categories.ts`; `tests/conflict-enforcement.test.ts` |
| **A working listing-and-sale prototype** | NEXT `AdSlot`: sellable inventory per edition (`slotCode`, `kind`, rack `priceCents`, `quantity`), sold by attaching a `campaignId` and freezing `soldCents` / `soldAt`. Postgres constraints stop double-selling. | `schema.prisma` (`AdSlot`); `backend/src/domain/edition.ts`; `POST /editions/:id/slots`, `POST /editions/:id/sales`; `backend/prisma/sql/adslot_inventory.sql` |
| The listing gate | `Property.listingAccessAt DateTime?`. Set on onboarding APPROVE, cleared on SUSPEND. The schema comment says listing creation (`2S3-BE-01`) requires it. | `schema.prisma`; `backend/src/domain/onboarding.ts` |

### Extension point

- **Planned** `InventoryItem` (`2S2-BE-01`): owned by an athlete or a property.
  - It references a `NilJob` code where one applies, so the job catalogue stays the shared vocabulary.
  - It carries its own price, availability window, restricted categories and package rules.
- **Planned** `Listing` (`2S3-BE-01`): the public face of one or more inventory items.
  - It follows the state machine in `SponsorX-Phase2-State-Machines.md` §2: `DRAFT → PENDING_APPROVAL → PUBLISHED ⇄ PAUSED → ARCHIVED`.
  - Creating one requires the owning property to have a non-null `listingAccessAt`, or be an `ACTIVE` athlete.
- **Planned** `ListingPackage` (`2S3-BE-02`): a bundle sold as one cart line. Model it on `SponsorPackage.lineItems` so bundles and §7 packages read the same way.
- **Availability and conflict service** (`2S3-BE-03`): one domain function, reused by cart, checkout and the managed matcher. It combines:
  - `matching.ts`'s conflict filter
  - `margin-floor.ts`'s sub-floor rejection
  - a date-overlap and quantity check modelled on `adslot_inventory.sql`
- **Search** (`2S3-BE-04`): a new `whereFor(actor, "listing", "read")` builder. Visibility is part of the scope, not a post-filter.

### What must not change

- `SponsorPackage` and `NilJob` stay BTG reference data. **Do not make them tenant-writable.** An external property's prices live on its own `InventoryItem`, never by editing the shared catalogue.
- `AthleteRate` versioning stays append-only. Phase 2 athlete self-pricing writes a **new version**; it does not update in place. Open `CampaignOrder`s keep the rate they were created with (`2S2-BE-03` requires this).
- The 1.4× margin floor applies to managed orders. Whether marketplace listings inherit it or use the commission engine (`2S5-BE-01`) is a pricing decision. **Record it; do not decide it silently in code.**
- The catalogue's sponsor-price-only rule (I-6).

### Migration steps

1. Add the RBAC Matrix rows for `inventoryItem`, `listing` and `listingPackage` (I-5), then transcribe them into `policy.ts` and `scope.ts`.
2. Migration `…_inventory_listings`: `InventoryItem`, `Listing`, `ListingPackage`, enum `ListingState`, `currency` columns, and indexes on (tenantId, state) and (ownerKind, ownerId).
3. Raw SQL in `backend/prisma/sql/`: a CHECK that a `PUBLISHED` listing's owner property has `listingAccessAt` set (or enforce it in the domain and test it), plus exclusivity constraints.
4. Domain: `listing-state.ts` (pure) and `listing.ts` (Postgres), following the pattern of `onboarding-rules.ts` and `onboarding.ts`.
5. Onboarding hook: suspending a property pauses its `PUBLISHED` listings in the same transaction (State Machines doc, dependency table row 1).
6. **Backfill: none required.** Optionally, present `SponsorPackage` rows as BTG-tenant listings via a read-side view rather than copying them. Copying creates two sources of truth for price.

---

## 5 · Seam 2 — Carts and reservations

### Exists today

Nothing called a cart. The managed equivalents are:

| Piece | Why it matters to Phase 2 | Path |
|---|---|---|
| `CampaignBrief` | The managed "basket": a sponsor names a package, budget, dates, sports, states and categories. The brief lifecycle `DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED` is BTG's approval gate — the direct precedent for `2S4-BE-05` ("BTG approval gate on orders"). | `backend/src/domain/brief.ts`, `brief-state.ts`; `POST /briefs`, `POST /briefs/:id/transition`, `POST /briefs/:id/campaign` |
| `CampaignInvite.expiresAt` and the hourly expiry sweep | A time-limited hold that releases itself — the pattern for a 15-minute reservation. | `backend/worker/jobs/expire-invitations.mts` |
| One-open-invite partial unique index | "At most one live claim per thing", in the database — the pattern for "two HELD reservations on the same exclusive inventory" (State Machines doc §3). | `backend/prisma/sql/invite_one_open.sql` |
| `CampaignOrder` frozen terms | `compensation`, `sellPrice`, `usageRights`, `exclusivity`, `projectedImpressions`, `impliedCpm` and `projectionSource` are fixed when the order is drafted and sent. This is the precedent for `2S4-BE-04`'s financial snapshot. | `backend/src/domain/campaign-order.ts` |
| Edition sale | `POST /editions/:id/sales` books slots against a campaign atomically and refuses a sale once ads have closed (`assertCanSell`). | `backend/src/domain/edition.ts`, `edition-state.ts` |

### Extension point

- **Planned** `Cart` and `CartLine` (`2S4-BE-01`): sponsor-scoped (`own-sponsor`), with a `currency`, an `expiresAt`, and lines pointing at a `Listing` or `ListingPackage`.
- **Planned** `Reservation` (`2S4-BE-02`): `HELD → CONVERTED | EXPIRED | RELEASED`, with a 15-minute hold.
  - Exclusivity is a partial unique index on (inventory item, window) where the state is `HELD` or `CONVERTED`.
  - Expiry is a worker sweep. Copy the hourly-timer shape of `expire-invitations.mts`, but run it at a shorter interval, **or** use pg-boss `startAfter` on a per-reservation job enqueued in the same transaction.
- **Planned** `MarketplaceOrder` (`2S4-BE-03`, see §3): created only from a `CONVERTED` reservation.
  - `PENDING_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → IN_DELIVERY → FULFILLED → CLOSED`.
  - On `APPROVED` it creates (or attaches to) a `Campaign` in the same transaction, then `CampaignOrder`s per athlete line.
- **Financial snapshot** (`2S4-BE-04`): an immutable `OrderFinancialSnapshot`, one row per order line, written at `APPROVED`. It follows the ledger order in `2S0-PMO-02`: gross → discounts → platform fee → management fee → processing → property share → referral → reserve → available.

### What must not change

- A marketplace order must land in the **same** `Campaign → CampaignOrder → Deliverable → Earning` chain. The delivery desk, content approvals, rewards and the sponsor report must not need a "marketplace mode".
- `CampaignOrder` terms stay frozen after `SENT`. `PATCH /orders/:id` is DRAFT-only today; keep it that way.
- A brief stays the managed path's entry. Self-service checkout is an additional entry, not a replacement.

### Migration steps

1. Add RBAC rows for `cart`, `reservation` and `marketplaceOrder`.
2. Migration `…_cart_reservation_order`: the models and enums above, plus `Campaign.marketplaceOrderId String? @unique` (**additive** — a null value means a managed campaign).
3. Raw SQL: the reservation exclusivity index, and "an order is created only from a CONVERTED reservation" (a foreign key plus a CHECK, or enforcement in the domain).
4. Outbox jobs: `reservation.expire` (if per-row), `notify.email` templates for order approval and rejection, and `zoho.pushDeal` for the marketplace order (`2S7-INT-01`, reusing `zoho-mapping.ts`).
5. **Backfill: none.** Existing campaigns have `marketplaceOrderId = null`.

---

## 6 · Seam 3 — Payments

### Exists today

| Piece | What it is | Path |
|---|---|---|
| **No payment code** | SponsorX does not take payment in Phase 1. Money moves outside the system. | `documentation/SponsorX-Phase1-Payment-Policy.md` §1 |
| `CampaignInvoice` | A read-only mirror of Zoho Books invoices: `zohoInvoiceId` (unique), `status` (Zoho's own value), `amount` (cents), `currency` (default USD), `paidAt`, `lastSyncHash`. Nothing in SponsorX creates, edits or voids an invoice. | `backend/src/domain/invoice.ts`; `GET /campaigns/:id/invoices`, `GET /campaigns/:id/payment-status` |
| **The inbound-webhook pattern** | `POST /webhooks/zoho/invoice`: rate-limited, HMAC-SHA256 in `x-zoho-signature` with a constant-time compare, a `WebhookDelivery` row, `enqueue("zoho.ingestInvoice")`, and a **202** response. The worker applies it; the apply step skips a payload whose hash matches `lastSyncHash`. | `backend/src/routes/v1/zoho-webhooks.ts`; `backend/worker/jobs/ingest-invoice.mts` |
| `WebhookDelivery` | `source`, `externalId` (**not unique**), `signatureOk`, `payload`, and `status` (RECEIVED \| APPLIED \| REJECTED \| FAILED). Rejected rows are stored redacted and truncated to 4 KB. | `schema.prisma` |
| Vendor-isolation pattern | One file imports each vendor: `backend/src/auth/clerk.ts` (Clerk), `backend/src/lib/email.ts` / `worker/jobs/send-email.mts` (Resend), `backend/src/lib/zoho.ts` (Zoho). | — |
| Integration health | Webhook and worker-job counts over the last 7 days, and outbox lag. | `backend/src/domain/integration-health.ts`; `GET /operations/integration-health` |

### Extension point

- **Planned** provider adapter, `backend/src/lib/payments.ts`: the **only** file that imports the provider SDK (`2S0-PMO-03`: "the adapter interface agreed so it stays swappable"). Suggested interface:

  ```ts
  interface PaymentProvider {
    createCheckout(order: { id: string; lines: …; currency: string; successUrl: string; cancelUrl: string }): Promise<{ sessionId: string; url: string }>;
    verifyWebhook(rawBody: Buffer, headers: Headers): ProviderEvent;   // throws on a bad signature
    refund(paymentRef: string, amountMinor: number): Promise<void>;     // called from the worker only
  }
  ```

- **Planned** `Payment` model (`2S5-INT-01`), following State Machines doc §5: `CREATED → AUTHORIZED → CAPTURED → (PARTIALLY_REFUNDED →) REFUNDED`, with `FAILED` reachable before `CAPTURED`.
  - It stores the provider's payment or intent id and amounts. It **never** stores card data (hosted or embedded flow only).
- **Planned** route `POST /webhooks/<provider>`, identical in shape to the Zoho invoice route: verify → `WebhookDelivery` → enqueue `payment.ingest` → 202.
  - **Only the webhook moves a payment** (State Machines doc §5). No client-set state.
- **Planned** `Refund` and `Dispute` models (`2S5-BE-03`, State Machines doc §7). A dispute opening holds every payout on its order.

### What must not change

- Zoho Books stays the invoice system for **managed** deals. A marketplace sale is pushed to Zoho as a Deal with its payment status (I-1). It is **not** invoiced a second time in Books unless finance decides so in writing.
- Webhook handlers stay queue-first (I-2), so a provider outage delays state and never breaks a request.
- No card, bank or tax data in Postgres (I-8).

### Migration steps

1. **Fix before reusing the pattern.** `zoho-webhooks.ts` computes its HMAC over `JSON.stringify(req.body)` — the parsed body re-serialised — because `backend/src/app.ts` mounts plain `express.json()`. Payment providers sign the **raw bytes**. Add a raw-body capture, e.g. `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })`, before the first provider route. Consider moving the Zoho route onto it too.
2. Migration `…_payments`:
   - `Payment`, `PaymentState`, `Refund`, `Dispute`, `DisputeState`.
   - A **partial unique index on `WebhookDelivery (source, externalId)`** where `externalId` is not null, so the provider event id is idempotent at intake (`2S5-INT-02`). This is additive: existing Zoho rows use composite externalIds that are unique in practice. Verify this before applying.
3. Outbox job names: `payment.ingest`, `payment.refund`, `zoho.pushPayment` (or fold into `zoho.pushDeal`). Add each to `JobName` and to the worker's `HANDLED_JOBS`. The drain refuses unknown names by design.
4. `AUDIT_ACTIONS`: `payment.capture`, `payment.refund`, `dispute.open`, `dispute.decide`.
5. Integration health: add the provider as a row, alongside the Zoho and webhook counts.
6. Env: provider secret key and webhook secret. Add a production boot guard like the one for `ZOHO_WEBHOOK_SECRET` (`backend/src/config/env.ts`).

---

## 7 · Seam 4 — Payouts

### Exists today

| Piece | What it is | Path |
|---|---|---|
| `Earning` | One per `CampaignOrder` (`orderId @unique`): `gross`, `adjustment` (cents), `state EarningState`, `taxYear`, `paidAt?`, `reference?` (a Zoho or bank reference string only — not an account). | `schema.prisma`; `backend/src/domain/earning.ts` |
| Earning lifecycle | `PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID`, plus HELD and DISPUTED. The earning is created PENDING inside `acceptOrder`. `maybeMakeEligible` moves it to ELIGIBLE, in the same transaction as the verify, once every deliverable on the order is VERIFIED. | `backend/src/domain/earning-state.ts`, `earning.ts`, `deliverable.ts` |
| Earning routes | `GET /earnings`, `GET /earnings/:id`, `POST /earnings/:id/transition`, `POST /earnings/:id/adjustment` (reason required). FINANCE: read, write, approve. | `backend/src/routes/v1/earnings.ts`; `policy.ts` |
| Earning audit | `earning.markEligible`, `approveForPayout`, `markPaid`, `hold`, `dispute`, `create`, `adjust`. | `backend/src/db/audit.ts`; `tests/financial-audit-coverage.test.ts` |
| `payout` RBAC resource | In the policy with **no model**. Phase 1 tracks payout *status* on `Earning`. | `policy.ts`; RBAC Matrix §11 |
| NEXT revenue split | `RevenueSplit` (bps + amountCents) is computed at edition close by `allocateSplit` (largest-remainder rounding, so the parts sum exactly). **Explicitly not a payout and not an earning.** | `backend/src/domain/revenue-split.ts`; `SchoolPoolAllocation` |
| Payout acknowledgement | `PropertyOnboarding.payoutAcknowledgedAt`: the applicant confirms that payout and tax details go to the payment provider, not to SponsorX. | `onboarding.ts` |

### Extension point

- **Planned** `ConnectedAccount` (`2S5-INT-03`): the owner (property or athlete), the provider account id, and a readiness status. **Status only**; onboarding happens in the provider's hosted flow.
- **Planned** `CommissionRule` (`2S5-BE-01`): versioned by scope and priority. Editing a rule creates a new version, and a closed payout never re-reads it.
- **Planned** `LedgerEntry` (`2S5-BE-02`): debit, credit, type, status, currency and a source reference (order line, payment, refund, payout).
  - A refund **reverses** with new entries. It never edits an entry (State Machines doc, last row).
  - Enforce append-only the way `sales_attribution_immutable.sql` does.
- **Planned** `Payout` (`2S5-BE-04` / `-05`), following State Machines doc §6: `NOT_ELIGIBLE → ELIGIBLE → REQUESTED → APPROVED → PAID`, with FAILED → REQUESTED and HELD.
  - Eligibility checks all five conditions every time: payment settled, deliverables complete, account ready, no open dispute, holding period elapsed.
  - Execution is a worker job, `payout.execute`.
- **The bridge to `Earning`.** Keep `Earning` as the athlete's **entitlement** record — the thing the athlete portal and the payment policy already describe. A marketplace payout references the ledger lines it settles and, for athlete lines, the `Earning` rows. `Earning.state` moves to PAID when its payout reaches PAID, in the same transaction and audited.

### What must not change

- **The payment policy is a gate, not a guideline.** `SponsorX-Phase1-Payment-Policy.md` §3 says tax IDs and bank details "must not be added to the platform without replacing this policy". `2S0-LEG-02` produces the replacement. Until it is signed, `ConnectedAccount` holds a provider id and a status, nothing more.
- Managed (Phase 1) earnings keep working exactly as today: status tracked by BTG finance, money moved outside the system. A managed earning must never be swept into a provider payout by accident.
- `RevenueSplit` stays an allocation, never a payout (`/admin/next/splits` says so on screen).
- Forbidden overlap (Phase 4 file, "Do not overlap"): **do not launch marketplace payouts before** commission snapshots, reconciliation, refund and dispute behaviour and audit logs are fully tested.

### Migration steps

1. **Replace the payment policy first** (`2S0-LEG-02` → a new policy version). This is a document gate, not code.
2. Migration `…_ledger_payouts`: `ConnectedAccount`, `CommissionRule`, `LedgerEntry`, `Payout`, `PayoutState`.
3. **Additive columns on `Earning`:**
   - `currency String @default("USD")`. The policy says each earning "records the amount, the currency…", but the column does not exist today.
   - `settlement String @default("MANUAL")`, taking MANUAL \| PROVIDER. This is the flag that keeps managed earnings out of provider payouts.
   - `payoutId String?`.
4. **Backfill:** set `settlement = 'MANUAL'` on every existing earning (the column default already does this). **Do not** backfill ledger entries for Phase 1 campaigns — their money never moved through SponsorX, and a synthetic ledger would reconcile to nothing.
5. RBAC: give `payout` its model-backed scope builders. Add `ledgerEntry` and `commissionRule` rows. Add field denials for payout and ledger amounts to non-finance roles, as `revenueSplit.amount` does.
6. Outbox: `payout.execute`, `payout.ingest` (provider webhook), and `notify.email` templates.
7. Tests: extend `tests/financial-audit-coverage.test.ts` to the new financial actions.

---

## 8 · Seam 5 — Wallet

"Wallet" in Phase 2 means **Apple Wallet and Google Wallet passes** for fan
rewards (`2S6-INT-01`, `-02`, `2S6-BE-01`, `2S6-FE-01`). It is **not** a
stored-value balance. Nothing in any phase document asks SponsorX to hold
customer funds.

### Exists today

| Piece | What it is | Path |
|---|---|---|
| `Reward` | `campaignId`, `offerText`, `terms`, `singleUse`, `expiresAt`, `state RewardState`. **P6-BE-08 (landed 2026-09-28):** `eligibility RewardEligibility` (ANYONE, AGE_18_PLUS, AGE_21_PLUS, TICKET_HOLDERS; shown to the fan and to booth staff, **not enforced by the API**), `eligibilityNote?`, `redemptionCap Int?` (enforced race-safely in the redeem transaction; a spent cap answers 410), `landingHeadline?`, `landingSubhead?`. There is no edit route yet — the fields are set at creation. | `schema.prisma`; `backend/src/domain/reward.ts`, `reward-state.ts` (`redemptionsLeft`); migration `20260928130000_reward_limits_landing` |
| `RewardToken` | One per athlete per reward: `token` (unique; the fan's `/r/<token>` link), `qrKey` (a PNG in the private bucket). | `schema.prisma`; `backend/worker/jobs/generate-qr.mts` (`reward.generateQr`) |
| `RewardEvent` | Four separate events — SCAN, LANDING, CLAIM, REDEEM — with geo resolved in the worker (the IP is discarded), versioned consent and sponsor-contact consent with withdrawal timestamps. | `backend/src/domain/reward.ts`, `fan-consent.ts`, `tracking.ts`; `backend/worker/jobs/resolve-geo.mts` |
| Single-use redemption | A database-level guarantee, not application logic. | `backend/prisma/sql/reward_single_redeem.sql` |
| Public fan routes (no login) | `GET /public/rewards/:token`; `POST …/scan`, `/landing`, `/claim`, `/redeem`; `POST /public/unsubscribe/:token`. | `backend/src/routes/v1/rewards.ts` |
| Notifications | `notify.email` via Resend, deduplicated by `EmailSendLog.idempotencyKey` (e.g. `reward.claimed:<tokenId>`). There is no per-user preference model (that is `2S6-BE-02`). | `backend/src/lib/email.ts`; `backend/worker/jobs/send-email.mts` |

### Extension point

- **Planned** `WalletPass`: `rewardTokenId`, `provider` (APPLE \| GOOGLE), `serialNumber` (unique), `authToken` (the pass web-service token), `state`, `lastPushedAt`.
- **Planned** `WalletDeviceRegistration` (`2S6-BE-01`): device library id and push token per pass (the Apple pass web service protocol).
- **Planned** adapter, `backend/src/lib/wallet.ts`: `issue(pass)`, `update(pass)` and `expire(pass)`, with Apple and Google as two implementations of one interface (`2S6-INT-01`: "Google Wallet is a second implementation, not a rewrite").
- **Triggering.** Reward-state transitions (ACTIVE → PAUSED / EXPIRED / ARCHIVED) and REDEEM events enqueue `wallet.updatePass` **in the same transaction** as the transition. The pass mirrors `RewardState`; it never becomes a second source of truth.
- **Pass web-service routes** (Apple's protocol): `/public/wallet/v1/…`. They are unauthenticated in the SponsorX sense and authorised by the per-pass token.
- **In-world rewards** (Phase 4 `4S6-INT-01`) reuse this same path: completion → `RewardToken` → claim link → optional pass. See the companion document.

### What must not change

- **Fans have no login and no role** (RBAC Matrix §1: "There is no Fan role… Do not re-add it"). A wallet pass is bearer access to one token, exactly like the QR.
- `RewardEvent` stays the only source of truth for scan, claim and redeem counts, and stays **aggregate-only** for every staff role (RBAC Matrix §10). The one exception is the consent-gated sponsor lead.
- Consent is versioned centrally (`fan-consent.ts`), never per reward or per pass.
- Single-use and redemption-cap enforcement stay in the redeem transaction. A pass tap goes through `POST /public/rewards/:token/redeem` like any other redemption.

### Migration steps

1. Migration `…_wallet_passes`: `WalletPass`, `WalletDeviceRegistration`, enum `WalletProvider`.
2. RBAC: `walletPass` — BTG_ADMIN and CAMPAIGN_MGR own-tenant read/write, SERVICE own-tenant write, following `reward`'s row.
3. Outbox: `wallet.issuePass`, `wallet.updatePass`. Add both to `JobName` and `HANDLED_JOBS`.
4. **Backfill: none.** Passes are issued on demand, for tokens created after launch or when a fan asks.
5. Signing certificates (Apple) and issuer credentials (Google) go in env with production boot guards.

---

## 9 · Other Phase 2 seams, briefly

| Area | Exists | Extension |
|---|---|---|
| External tenants (`2S1-BE-04`) | Everything is tenant-scoped (I-4). Today there is one tenant in practice (`PUBLIC_INTAKE_TENANT_ID`, default `seed_tenant_btg`); public routes write into it. | **Decide first:** is an approved property a **new tenant**, or a property inside BTG's tenant? The onboarding code today creates a `Property` inside the reviewer's tenant. `2S1-BE-04`'s acceptance ("an approved property's users see only their own tenant's data") reads as new tenants. If so, public intake needs a tenant-resolution rule other than one env var. |
| Notification preferences (`2S6-BE-02`) | `notify.email` has one handler and the template is in the payload (`backend/src/db/outbox.ts` comment). | Check preferences in the `send-email.mts` handler, not at enqueue time, so a mute takes effect on already-queued jobs. |
| Property analytics (`2S7-DATA-01`) | `GET /operations/analytics`, `/delivery-health`, `/network-metrics`, `/job-economics` (tenant-wide, BTG roles). | Add property-scoped variants through `whereFor(…, "own-property")`, not new tenant-wide endpoints. |
| White-label branding (`2S7-BE-01`) | `Tenant` has only `id` and `name`. | Additive `Tenant.branding Json?`. The report renderer (`report-render.ts`) reads it. |
| Feature flags | **None exist.** `backend/src/config/env.ts` has no flag variables; the nearest thing is behaviour keyed on whether Zoho is configured. | Phase 3 `3S8-OPS-01` requires per-tenant flags. Introduce one mechanism, a `TenantFeature` table read through a single `isEnabled(tenantId, flag)` helper, **before** Phase 2 ships, so marketplace checkout and payouts can be switched off per tenant. |

---

## 10 · Phase 3 seams (Intelligence & Attribution), briefly

| Phase 3 need | The Phase 1 hook it attaches to | Path |
|---|---|---|
| Provenance on every number (`3S6-BE-02`: modelled revenue is never labelled verified) | `MetricSource` enum: VERIFIED_API, VERIFIED_MANUAL, SELF_REPORTED, ESTIMATED, **ATTRIBUTED** (already reserved). The report renderer carries `SOURCE_LABEL` onto every figure. | `schema.prisma`; `backend/src/domain/metric-source.ts`; `report-render.ts`; `documentation/SponsorX-Metric-Provenance-Taxonomy.md` |
| Dynamic CPM (`3S2-BE-02`) | `CampaignOrder.projectedImpressions`, `impliedCpm` and `projectionSource` are frozen per line. The implied-CPM learning module exists. | `backend/src/domain/pricing-learning.ts` |
| Match scoring (`3S3-BE-02`), eligibility-first filter (`3S3-BE-03`) | `matching.ts` shortlists; it deliberately does not rank or auto-invite. Conflict is a query filter. `AthleteScore.method` ("rules-v1") and `factors Json` are designed so Phase 3 **replaces the method, not the model**. | `backend/src/domain/matching.ts`, `content-value-score.ts`, `content-value-rules.ts` |
| Pacing and forecasting (`3S4-*`) | `delivery-health.ts` already separates WORK not delivered from REACH below projection (70% shortfall line). | `backend/src/domain/delivery-health.ts` |
| Warehouse ingestion (`3S1-DATA-01`) | Event tables with timestamps and tenant: `RewardEvent`, `LinkEvent`, `EditionEvent`, `MetricDaily`, `AuditLog`, `SalesAttribution` (immutable). | `schema.prisma` |
| Pushing intelligence into Zoho (`3S7-INT-01`) | The outbound Zoho path: `zoho.pushDeal`, `zoho.pushRenewal`, `zoho.pushTask`. | `backend/worker/jobs/zoho-sync.mts` |
| Per-tenant feature flags (`3S8-OPS-01`) | None — see §9. | — |

**Phase 3 invariant.** The warehouse **reads** from Postgres, via a replica or
CDC. It never becomes a write path back into product tables. Recommendations
(pricing, make-good) are stored as recommendation records next to the thing
they recommend on. An override records a reason (`3S2-BE-03`) and **never
edits the recommendation**.

---

## 11 · Phase 4 seams (INFINEX), pointer

The full contract is in
[`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md).
In one paragraph:

- A virtual placement becomes a `VirtualPlacement` joined to a sellable inventory record, the same `InventoryItem` / `Listing` Phase 2 builds.
- A creative deployment ties a `Campaign`, a placement and an asset version together.
- A completed activation issues a `RewardToken` through the existing reward engine.
- Telemetry lands in a raw event table and aggregates into provenance-labelled metrics.

Two Phase 1 gaps block Phase 4 no matter what Phase 2 does. Both are additive
changes and are listed in the companion document:

- There is **no machine authentication for the `SERVICE` role**.
- There is **no outbound event or webhook mechanism**.

---

## 12 · Gaps and contradictions found while writing this

These are recorded here so they are fixed deliberately, not discovered by accident.

1. **`NilJob` units.**
   - The schema comment says "Bands are integer cents."
   - `backend/src/domain/nil-jobs.ts` says "All figures are whole US dollars" and seeds SX-01 at `baseLow: 25`.
   - The frontend converts ×100 in `lib/matching-live.ts` (Memory 2026-09-28).
   - Fix the schema comment. Then check that every consumer (floor derivation, catalogue, Zoho mapping) agrees, before Phase 2 compares listing prices against catalogue bands.
2. **`Earning` has no `currency`**, though the Phase 1 payment policy §2 says each earning records one. Additive fix in §7.
3. **The webhook HMAC is computed over re-serialised JSON, not the raw body** (`zoho-webhooks.ts`). It works for Zoho as long as the byte order survives. Payment providers will not tolerate it. Fix in §6 step 1.
4. **`WebhookDelivery.externalId` is not unique.** Dedupe happens at apply time. Phase 2's provider-event idempotency wants it at intake (§6).
5. **The outbox has no dedupe key** (`OutboxJob` has name, payload and dispatchedAt only), and pg-boss runs with default retry settings (`boss.send` with no options). Handlers must be idempotent. Phase 2 financial handlers must key on the provider event id or the ledger line id.
6. **Three job names are enqueued but consumed by nothing:** `notify.campaignLive`, `notify.deliverableDue` and `zoho.pushAthlete`. They wait in the outbox and are logged by `reportWaiting()`. Harmless, but they inflate "waiting" on the Integrations screen.
7. **`2S1-BE-04` tenancy is undecided in code.** Onboarding approval creates a `Property` in the reviewer's tenant, not a new tenant (§9).
8. **The Phase 2 plan file shows `⏸ Blocked` on tasks that are at Code review** in the tracker (§1).
9. **`.claude/stack-decision.md` Addendum B3 is stale.** It says Prisma "declares two generator blocks" and the frontend "still reads Postgres directly". The schema says the second generator was removed on 2026-09-21, and `frontend/` has no Prisma dependency. `Memory/Initial Memory/02-confirmed-tech-stack.md` is staler still: it describes Next route handlers as the API and "no Redis".
10. **No feature-flag mechanism exists** (§9). Phase 3 requires per-tenant flags; Phase 2 would benefit from them.
