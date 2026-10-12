# SponsorX Event Taxonomy Audit — Phases 1 and 2

**Task `3S0-DATA-01` · Version 1.1 · 2026-10-12 · Phase 3, Sprint 0**

> **v1.1 (2026-10-12):** five gaps fixed the same day as `3S0-BE-01`…`05`: G1, G2/G3, G4, G7 and G9. They are marked in §5, and the market-geography rule is in §6.

Phase 3 builds a warehouse, benchmarks, pricing, forecasting and attribution on
top of what Phases 1 and 2 already record. This document lists **every event
type the system emits today**, with its definition, where it comes from and its
known gaps, so that `3S0-DATA-02` (warehouse schema) designs against what the
code really writes rather than what the specs say it should.

**Done when** (Phase 3 plan): *every event type inventoried with its definition,
source and known gaps.* §5 lists the gaps; Appendix A lists every audit action.

---

## 1 · How this was counted

Read from `main_development` at `4659bee` (2026-10-12), backend only:
`backend/src`, `backend/worker`, `backend/scripts` and `backend/prisma/schema.prisma`.

- **Audit actions, jobs and table writes** were found with the TypeScript
  compiler API, not grep. It walks every `audit(…)`, `enqueue(…)`, `boss.work(…)`
  call and every Prisma write to an event table. That way multi-line calls and
  constants such as `AUDIT_ACTIONS.campaign.launch` are resolved to the real
  string.
- **35 call sites build the action name at runtime** (a state map, a ternary or
  a template string). Each was opened and expanded by hand to the names it can
  produce.
- **Raw SQL** in the worker (`INSERT INTO "AuditLog"`, `"OutboxJob"`,
  `"EmailSendLog"`) was checked separately.
- **No client-side analytics exist.** The frontend loads no analytics vendor
  (GA, Plausible, PostHog, Segment and others were searched for). Every event below is
  written by the backend.

## 2 · The event families at a glance

| # | Family | Where it lands | Kind | Written by | Provenance |
|---|---|---|---|---|---|
| A | Fan reward funnel (SCAN, LANDING, CLAIM, REDEEM) | `RewardEvent` | append-only event | public fan routes, `domain/reward.ts` | measured by SponsorX |
| B | Tracking-link clicks | `LinkEvent` | append-only event | public redirect, `domain/tracking.ts` | measured by SponsorX |
| C | Edition engagement (QR_SCAN, LINK_CLICK, PROFILE_VIEW, CAMPAIGN_VIEW, CTA_CLICK) | `EditionEvent` | append-only event | public route, `domain/edition.ts` | measured by SponsorX |
| D | Deliverable performance (views, engagements per day per source) | `MetricDaily` | daily fact, **upserted** | staff entry, `domain/metric.ts` | labelled per row (`MetricSource`) |
| E | Domain changes (≈320 action names, 72 families) | `AuditLog` | append-only event | `audit()` in 77 files plus one raw insert | system of record |
| F | Money movements | `LedgerEntry`, `PaymentAttempt`, `Payout`, `RefundDue`, `SalesAttribution`, `StudentPointAccrual` | journal rows plus mutable state | `domain/ledger.ts`, `payouts.ts`, `refunds.ts`, `student.ts` | system of record |
| G | Inbound provider events | `PaymentEvent` (Stripe), `WebhookDelivery` (Zoho; rejected payment calls) | inbox | `routes/v1/payments.ts`, `routes/v1/zoho-webhooks.ts` | outside system |
| H | Background work | `OutboxJob` → pg-boss (22 job names); 22 interval sweeps | queue | `enqueue()`, `worker/index.mts` | operational |
| I | Transactional email | `EmailSendLog` (≈80 templates) | send claim | `worker/jobs/send-email.mts` | operational |

Families A–D are the **behavioural events**, the raw material for funnels,
benchmarks and forecasting. E and F are the **business events** (state changes,
money). G–I are **plumbing**: Phase 3 needs them for reconciliation and data
quality, not for sponsor-facing numbers.

---

## 3 · Behavioural events

### A · Fan reward funnel — `RewardEvent`

**Defined in** [`SponsorX-Reward-Event-Taxonomy.md`](./SponsorX-Reward-Event-Taxonomy.md) (`P0-DATA-02`). That definition still
holds and is not repeated here.

| Type | Trigger in code | Writer | Dedup |
|---|---|---|---|
| `SCAN` | `POST /public/rewards/:token/scan` | `recordScan` → `writeEvent` | none, by design (one per request) |
| `LANDING` | `POST /public/rewards/:token/landing` | `recordLanding` → `writeEvent` | none (one per rendered page) |
| `CLAIM` | claim form accepted | `writeEvent(…"CLAIM")` | once per fan per reward; a repeat returns the existing claim |
| `REDEEM` | staff or merchant validation | single SQL statement, `reward.ts` ≈L907 | partial unique index `reward_single_redeem` on single-use rewards |

**Columns:** `tenantId`, `tokenId`, `type`, `at`, `city`, `region`, plus consent
fields on CLAIM (`consentVersion`, `consentAt`, `consentPurpose`,
`consentWithdrawnAt`, `sponsorContact*`), `fanEmail` on CLAIM, `zohoLeadId` once
pushed, and `singleUse` on REDEEM.

**Joins to the business model** via `RewardToken` → `Reward` → campaign and athlete.

### B · Tracking-link clicks — `LinkEvent`

**Definition:** a request to a tracking link's short URL, recorded after the
redirect has been sent (`recordClick`, `domain/tracking.ts`). One row per
request. A separate funnel from the reward QR, by design: link traffic must
never inflate the physical-presence number.

**Columns:** `tenantId`, `linkId`, `at`, `city`, `region`. The IP goes into the
`tracking.resolveGeo` job payload only. The worker fills `city` and `region`
and scrubs the address from the stored payload.

### C · Edition engagement — `EditionEvent`

**Definition:** a reader engaged with a published NEXT edition (`P9-BE-12`):
`POST /public/editions/:id/events`. Public, no reader identity, rate-limited.
`targetKind` is `AD_SLOT | ARTICLE | ATHLETE_PROFILE`, `targetRef` the id.
`QR_SCAN` is the print channel; the other four types are digital. The sponsor
report keeps print and digital apart.

### D · Deliverable performance — `MetricDaily`

**Definition:** one deliverable's views and engagements for one UTC day from
one source, unique on `(deliverableId, day, source)`. A second reading from the
**same** source overwrites that row; a different source lands beside it.
`enteredBy` is the staff user, null for `VERIFIED_API`. Each write also leaves a
`metric.record` audit row carrying the values.

**Provenance labels** (`MetricSource`): `VERIFIED_API`, `VERIFIED_MANUAL`,
`SELF_REPORTED`, `ESTIMATED`, `ATTRIBUTED`. Rules are in
[`SponsorX-Metric-Provenance-Taxonomy.md`](./SponsorX-Metric-Provenance-Taxonomy.md).

---

## 4 · Business and operational events

### E · Domain changes — `AuditLog`

**Definition:** one row per business action, written by `audit()` in the
**same transaction** as the change (`db/audit.ts`). Columns: `tenantId`,
`actorId` (null for public or system acts), `action` (`entity.verb`), `entity`,
`entityId`, `before`, `after` (JSON), `at`.

In practice **this is the domain event stream.** It is the only place most
state changes are recorded as events: campaigns, briefs, orders, offers,
listings, deliverables, earnings, payouts, guardians, students, editions,
onboarding, account closure and more. Besides §26's five audited areas it also
holds system acts (`deliverable.systemRevision`, `listing.autoPublish`,
`campaign.autoStaffing`), digests (`student.autoApprovalDigest`) and reminders
(`deliverable.reviewReminder`). The reward funnel's fan-side events are
deliberately **not** duplicated here (they live in A).

| Measure | Count |
|---|---|
| `audit()` call sites | 287 in 77 files, plus 1 raw insert (`invitation.expire`, `worker/jobs/expire-invitations.mts`) |
| Distinct action names | ≈320 (state-derived names counted once per pattern) |
| Families (prefix before the dot) | 72 |
| Names declared in `AUDIT_ACTIONS` | 52, of which 43 are written and 9 never are |
| Names written as bare strings or in per-module maps | 277 |

The full list, grouped by family, is **Appendix A**.

State machines publish one action per target state through a map:
`ATHLETE_AUDIT_ACTIONS`, `BRIEF_AUDIT_ACTIONS`, `CAMPAIGN_AUDIT_ACTIONS`
(mirrored by `STAGE_AUDIT_ACTIONS`), `ORDER_AUDIT_ACTIONS`,
`INVITE_AUDIT_ACTIONS` and `EARNING_AUDIT_ACTIONS`. Two families instead derive
the name from the state value itself: `marketplaceOrder.<state lower-cased>`
and `paymentEvent.<status lower-cased>`.

### F · Money movements

| Store | What a row is | Mutability |
|---|---|---|
| `LedgerEntry` | one leg of a double-entry journal (`BOOKING`, `RESERVE_RELEASE`, `REVERSAL`, `PAYOUT`) by account and party, in cents | legs are append-only; **`status` (PENDING → AVAILABLE → PAID → REVERSED) is updated in place** (`ledger.ts` L170, L229) |
| `PaymentAttempt` | one card payment try | status updated in place |
| `Payout`, `PayoutLine` | a payout and what it covers | status updated in place; moves audited (`payout.*`) |
| `RefundDue`, `PaymentRefund`, `PaymentDispute` | refunds and disputes | status updated; audited (`refundDue.*`, `paymentRefund.*`) |
| `SalesAttribution` | NEXT student credited with an ad sale, in cents at close | append-only; a reversal is a new negative row (`P9-BE-19`) |
| `StudentPointAccrual` | points earned by a NEXT student, with the reason | append-only |

Design: [`SponsorX-Phase2-Ledger-Design.md`](./SponsorX-Phase2-Ledger-Design.md).

### G · Inbound provider events

- **`PaymentEvent`**: one Stripe event, unique on `(provider, providerEventId)`.
  Flow: received → applied by the `payments.event` job → status `APPLIED`,
  `IGNORED`, `DEFERRED`, `HELD` or `FAILED`. Each move is audited as
  `paymentEvent.<status>`. A rejected call (bad signature) is kept in
  `WebhookDelivery` with source `payments:<provider>`.
- **`WebhookDelivery`**: Zoho CRM and Books notifications (`RECEIVED`,
  `APPLIED`, `REJECTED`, `FAILED`), queued as `zoho.ingestCrm` or
  `zoho.ingestInvoice`. **Bodies are trimmed after 90 days**
  (`webhook-retention.ts`).
- **CSP reports** (`/public/csp-report`) are logged and **not stored**.

### H · Background work — `OutboxJob`, pg-boss and sweeps

A job is written to `OutboxJob` in the caller's transaction; the worker drains
it into pg-boss. The outbox row is kept (`dispatchedAt` set) and never deleted.
The job's **outcome is not written back**; it lives only in pg-boss's own tables.

| Job | Producer | Consumer |
|---|---|---|
| `zoho.pushDeal`, `zoho.pushRenewal`, `zoho.pushLead`, `zoho.pushSponsor`, `zoho.pushTask`, `zoho.pushMarketplaceOrder` | brief, campaign, reward, inquiry, sponsor-request, sync-task and order domains | `worker/jobs/zoho-sync.mts` |
| `zoho.pushCampaign` | none today (legacy alias of `pushDeal`) | same handler |
| `zoho.ingestCrm`, `zoho.ingestInvoice` | Zoho webhooks | Zoho handlers |
| `zoho.backfill` | `scripts/zoho-backfill.mts` | Zoho handler |
| `notify.email` | ≈30 domain files (template in the payload) | `send-email.mts` |
| `notify.invitationSent` | `invitation.ts` | `notify-invitation.mts` |
| `report.render` | campaign stages, report files | `render-report.mts` |
| `reward.generateQr` | `reward.ts` | `generate-qr.mts` |
| `image.derive` | `deliverable.ts` (asset registered) | `derive-image.mts` |
| `tracking.resolveGeo` | `tracking.ts` (click) | `resolve-geo.mts` |
| `athlete.importCohort` | `cohort-import.ts` | cohort handler |
| `payments.event`, `payments.confirm` | `payment-events.ts`, `payouts.ts` | payment handlers |
| `payouts.send` | `payouts.ts`, `onboarding.ts` | payout handler |
| `payouts.confirm` | **none found** | payout handler |
| `refunds.send` | `refunds.ts` | refund handler |
| `notify.campaignLive` | `campaign.ts` L253, on every launch | `domain/campaign-live-mail.ts` (since `3S0-BE-02`; was none, gap G1) |
| `notify.deliverableDue`, `zoho.pushAthlete` | none | none (declared only) |

**Interval sweeps** in `worker/index.mts` (22 timers): invitation expiry, metric
rollup, deliverable reminders, cart expiry, holds, delivery, review reminders,
Zoho, retention, coming-of-age, listing digest, orders, payout retry, deferred
payment events, order digest, campaign stages, brief recheck, auto-staffing,
campaign launch, student sweep, student digest and editions. They emit no event
of their own. Their effects appear as audit rows (E) and jobs (H) with a
null actor.

### I · Transactional email — `EmailSendLog`

One row per sent message, keyed by `idempotencyKey`. The row is claimed before
sending and deleted if the vendor refuses, so a row means *sent*. About 80
templates (`account.*`, `athlete.*`, `deliverable.*`, `handoff.*`, `listing.*`,
`offer.*`, `reward.claimed`, `sponsor.*`, `student.*`, `team.*` and others).
Not a behavioural event; useful only for "was the person told" questions.

---

## 5 · Known gaps

Severity reflects the impact on Phase 3's numbers, not on the product today.
**High** means a warehouse number built on it would be wrong or missing.

| # | Gap | Where | Severity | Effect on Phase 3 |
|---|---|---|---|---|
| G1 | **Fixed by `3S0-BE-02`.** `notify.campaignLive` is enqueued on every campaign launch but no worker handles it, so the rows stay in `OutboxJob` forever (the drain skips unhandled names on purpose) | `domain/campaign.ts` L253; `HANDLED_JOBS` in `worker/index.mts` | Medium | An outbox-based "pending work" metric reads permanently high. No launch email is sent. |
| G2 | **Addressed by `3S0-BE-05`:** market geography now comes from registration and the reward's venue (§6); fan-level geography on these rows is still empty. **`RewardEvent.city` / `region` are never filled.** SCAN, LANDING and CLAIM are written without them, and the geo job only resolves `LinkEvent`. The reward taxonomy promises coarse geography on SCAN. | `domain/reward.ts` `writeEvent` callers; `worker/jobs/resolve-geo.mts` | High | No geography for the reward funnel, so `3S1-DATA-03` benchmarks by market cannot use it. |
| G3 | **No longer blocking (`3S0-BE-05`, §6):** GeoLite is still unset, but market geography no longer depends on it. **`GEOLITE2_CITY_PATH` is unset on staging and production** (2026-10-09 audit), so `LinkEvent.city` / `region` are null everywhere too | worker env | High | All behavioural geography is empty in real data. |
| G4 | **Fixed by `3S0-BE-04`.** Refused repeat redemptions are not recorded; the request gets a 409 and nothing is written. The reward taxonomy says these attempts should be logged to spot shared codes. | `domain/reward.ts` redeem path | Medium | `3S8-DATA-01` anomaly rules lose their best fraud signal. |
| G5 | `LinkEvent` and `EditionEvent` have no bot or prefetch marker and no dedup; every request is a row | `tracking.ts`, `edition.ts` | Medium | Click counts include crawlers and link-preview fetchers; benchmarks need a filter rule first. |
| G6 | Two vocabularies say "scan" and "click": `RewardEventType.SCAN` versus `EngagementType.QR_SCAN`, and `LinkEvent` versus `EngagementType.LINK_CLICK` | schema enums | Medium | The warehouse must keep the channels apart by name, or edition and athlete funnels blend. |
| G7 | **Fixed by `3S0-BE-01`.** `MetricDaily` has no timestamp (`createdAt` / `updatedAt`), and a same-source correction overwrites the row. The earlier figure survives only in the previous `metric.record` audit row. | `schema.prisma` `MetricDaily`; `metric.ts` upsert | High | "What did we know on day X" (feature snapshots, `3S2-BE-01`) cannot be read from the table; it has to be rebuilt from the audit log. |
| G8 | Ledger, payment, payout and refund **status changes are in-place updates**. Only some moves have an audit row (payouts and refunds do; `LedgerEntry.status` does not). | `ledger.ts` L170, L229 | Medium | Daily balances by status must be snapshotted by ingestion, or history is lost. |
| G9 | **Archive fixed by `3S0-BE-03`;** the snake_case and state-named actions remain. Audit action names are inconsistent: one archive is logged as `listing.archive` (onboarding) **and** `listing.archived` (owner); `listing.request_changes` is snake_case; `listing.paused` and `marketplaceOrder.<state>` are states while the convention is verbs | `onboarding.ts` L786; `listing.ts` L634, L677; `marketplace-order.ts` L709 | Medium | Event counts by action split one transition across two names. |
| G10 | `AuditLog.after` has no schema or version: its shape is whatever each call site passes | every `audit()` call | Medium | The warehouse needs a per-action parser, and a code change silently changes the shape. |
| G11 | A system act and an anonymous public act look the same (`actorId` null at 92 sites); one site uses the pseudo-id `system:auto-staffing:<tenant>` | `domain/*` | Low | Automation-rate metrics ("how much did the system do") need the action name to tell them apart. |
| G12 | Job outcomes are not recorded on `OutboxJob`; they live in pg-boss's tables under pg-boss's default retention | `worker/index.mts` drain | Low | Job success and failure history is short-lived; integration health over months is not reconstructable. |
| G13 | Declared but never written: `AUDIT_ACTIONS` `role.grant`, `role.revoke`, `tenant.accessGrant` (roles are set only when an account is created or closed, and those acts are audited), `rate.update`, `package.priceUpdate`, `pricing.floorOverrideAttempt`, `agreement.versionPublish`, `order.reject`, `guardian.unlink`; and the job names `notify.deliverableDue`, `zoho.pushAthlete` and `payouts.confirm`'s producer | `db/audit.ts`, `db/outbox.ts` | Low | Dead names mislead anyone reading the constants as the catalogue. Pricing changes in particular (`3S2-BE-03`'s overrides) have no audit name in use yet. |
| G14 | "Attribution" already means something else in the code: `SalesAttribution` credits a NEXT student with an ad sale, and `MetricSource.ATTRIBUTED` labels a causal claim. Neither is commerce attribution. | schema | Low | Name Phase 3's attribution tables distinctly; input for `3S0-PMO-01`. |
| G15 | The provenance taxonomy names a `VERIFIED_SYSTEM` label ("measured"), but `MetricSource` has no such value; the reward taxonomy calls the funnel `verified-api` | `MetricSource` enum; two docs | Low | Settle the label for system-measured events before the semantic layer exposes it. |
| G16 | Zoho webhook bodies are trimmed after 90 days | `webhook-retention.ts` | Low | Ingestion must read them inside that window or keep only the applied result. |
| G17 | ID formats differ: one raw audit insert uses `gen_random_uuid()`; every other row uses a cuid | `expire-invitations.mts` L67 | Low | Harmless, but warehouse keys must not assume one format. |

### Follow-ups

These are suggestions only; none of them has been added to the task board.

- **Fixed 2026-10-12:**
  - G1 → `3S0-BE-02`: the worker sends the campaign-live email; earlier launches were closed as skipped.
  - G2/G3 → `3S0-BE-05`: a reward takes its venue's city and state, and market geography comes from registration (§6). The venue form field is `3S0-FE-01`.
  - G4 → `3S0-BE-04`: refused tries are counted on the code.
  - G7 → `3S0-BE-01`: `MetricDaily` has `createdAt`/`updatedAt`, backfilled from the audit log.
  - G9 → `3S0-BE-03`: one archive name. `listing.request_changes` and the state-named `listing.paused` / `marketplaceOrder.<state>` were left as they are, and nothing reads them by name.
- **Ops, still open:** setting `GEOLITE2_CITY_PATH` (`P2-OPS-04`) would add the fan's IP-derived city to clicks. It is no longer needed for market geography (§6).
- **Absorbed by later Phase 3 tasks:** G7 and G8 → `3S0-DATA-02` and `3S1-DATA-01` (snapshot on ingestion); G5 → `3S1-DATA-03` and `3S8-DATA-01`; G6 and G15 → `3S0-DATA-02` semantic layer; G14 → `3S0-PMO-01`; G10 → `3S0-DATA-02`.

---

## 6 · What `3S0-DATA-02` should take from this

- **Sources of facts:** `RewardEvent`, `LinkEvent` and `EditionEvent` (behaviour); `MetricDaily`
  (performance by source); `LedgerEntry` (money); `AuditLog` (every state
  change). Everything else is a dimension or plumbing.
- **The audit log is the change history.** Most tables keep only current
  state, so stage durations, approval times and time-to-delivery come from
  `AuditLog` (`before.state` → `after.state`, `at`).
- **Snapshot what mutates:** `MetricDaily`, ledger status, payout and payment
  status (G7, G8).
- **Keep channels apart:** reward QR versus edition QR versus tracking link (G6), and
  provenance labels carried on every metric row.
- **Market geography comes from registration, not from IP.** A campaign's market is where its athletes and properties are registered (`Athlete.city`/`stateCode`, `Property.city`/`stateCode`) and what its brief targets (`CampaignBrief.stateCodes`). For an in-person reward it is also where the reward is handed out (`Reward.venueCity`/`venueStateCode`, `3S0-BE-05`). These are stable and always filled, unlike IP lookups. IP-derived `city`/`region` on events is the fan's location: an optional extra, never the market.
- **Old action names map to current ones.** `listing.archived` (written before `3S0-BE-03`) means `listing.archive`. The audit log is append-only, so those rows keep their name and the semantic layer maps them.
- **Tenant scope travels with every row.** Every event table has `tenantId`.
  `LedgerEntry` also has `partyTenantId`, which is the one to scope a payee's view by.

---

## Appendix A · Audit actions by family

Generated from the code by the scanner described in §1. "Entity" is the
`entity` argument and "Files" are under `backend/src/domain`, `routes/v1` or
`worker`. State-derived names appear as their pattern.

| Family | Actions | Entity | Files |
|---|---|---|---|
| `account` | close, closureCauseChanged, closureRecorded, filesPurged, reactivate, reactivationDecline, reactivationRequest, reopen | Property, Guardian, Athlete, AccountClosure | account-closure.ts |
| `adSale` | hold | Campaign | ad-sale-auto.ts |
| `adSlot` | create, release, sell | AdSlot, Campaign | edition.ts |
| `ageOfMajority` | add, remove, update | AgeOfMajority | age-of-majority.ts |
| `agreement` | accept, recordSubjectConsent | Agreement, AgreementAcceptance | agreement.ts, content-rights.ts |
| `athlete` | activate, applicationUpdate, apply, approve, autoApprove, beginReview, draft, emailConfirmed, feature, importRequested, legalNameRequested, needsReview, profileChangeWithdraw, profileEdit, profileSet, reject, requestChanges, restrictionsSet, sensitiveEdit, signupApprove, signupReinstate, signupReject, socialsRecord, submit, suspend, tierSet | Athlete, CohortImport, AthleteProfileChange | athlete.ts, application-intake.ts, athlete-signup.ts, featured.ts, cohort-import.ts, athlete-profile-change.ts, athlete-profile.ts, signups-desk.ts, athlete-social.ts, athlete-rate.ts |
| `athleteClaim` | emailConfirmed, reject, submit, verify | AthleteClaim, Athlete | featured.ts |
| `athleteScore` | record | Athlete | content-value-score.ts |
| `branding` | update | TenantBranding | branding.ts |
| `brief` | approve, autoApprove, campaignCreated, close, create, draft, hold, qualify, update | CampaignBrief | brief-moves.ts, brief-auto.ts, brief.ts |
| `campaign` | autoStaffing, cancel, complete, create, draft, launch, report, staff, staffingSkip, staffingStop, submitForApproval | Campaign | auto-staffing.ts, campaign-stages.ts, campaign-create.ts, campaign.ts |
| `cart` | addLine, removeLine, updateLine | Cart | cart.ts |
| `comingOfAge` | cancel, complete, linkSent, start, terminate | Athlete | coming-of-age.ts |
| `commission` | create, revise | CommissionRule | commission.ts |
| `contentContribution` | record | Edition | dmv-pools.ts |
| `contentRight` | autoGrant, grant | EditionAsset | content-rights.ts |
| `deliverable` | approve, assetRegister, btgReview, btgReviewSkipped, create, markPublished, requestRevision, reviewReminder, sponsorReview, submitDraft, systemRevision, verify | Deliverable, CampaignOrder | deliverable.ts, review-reminders.ts |
| `dispute` | lost, open, providerClosed, review, won | PaymentDispute | payment-exceptions.ts |
| `earning` | adjust, approveForPayout, create, dispute, hold, markEligible, markPaid, needsReview, pending | Earning | earning.ts |
| `edition` | conditions, create, salesOpen, transition | Edition | edition.ts, edition-automation.ts |
| `editionArtwork` | approve, btgReview, btgReviewSkipped, requestRevision, sponsorReview, submit, systemReturn | EditionAsset | edition-artwork.ts |
| `editionAsset` | create, useInCampaign | EditionAsset | content-rights.ts |
| `fan` | consentWithdraw | RewardEvent | reward.ts |
| `guardian` | autoApprove, autoVerify, detailsUpdate, emailConfirmed, link, replace, signupReinstate, signupReject, verify, wardConfirmed | Guardian, Athlete | guardian-handoff.ts, athlete-signup.ts, guardian-setup.ts, athlete-profile-change.ts, guardian.ts, signups-desk.ts |
| `guardianHandoff` | decline, documentPurged, documentUploaded, emailConfirmed, handOffForReview, request, staffDecline, submit, switch | GuardianHandoff, Athlete | guardian-handoff.ts, account-closure.ts |
| `inventory` | create, reprice | InventoryItem | inventory.ts |
| `invitation` | accept, decline, expire, send, view | CampaignInvite | invitation.ts |
| `invoice` | staleRefused | entity | invoice-replay.ts |
| `ledger` | book, markPaid, payout, payoutReturned, releaseReserve, reverse | MarketplaceOrder, Payout | ledger.ts |
| `link` | renewed | AthleteClaim, fresh.entity | featured.ts, link-renewal.ts |
| `listing` | archive, archived, autoPublish, btgEnd, btgPause, create, hold, paused, request_changes, update, withdraw | Listing | listing.ts, onboarding.ts, team-invitations.ts |
| `marketplaceOrder` | &lt;state&gt; (pending_seller, pending_approval, approved, awaiting_payment, paid, in_delivery, fulfilled, closed, cancelled, refunded), approve, invoicePaidShort, invoicePaidUnmatched, invoiceSynced, paymentRecorded, paymentReminder, place | MarketplaceOrder | marketplace-order.ts, order-payment.ts |
| `metric` | record | MetricDaily | metric.ts |
| `offer` | accept, changeAnswered, create, decline, requestChange, revise, send, update, withdraw | Offer | offer.ts |
| `onboarding` | approve, autoApprove, confirmEmailResent, documentAdded, documentRemoved, documentReplaced, emailConfirmed, needsReview, reject, submit | PropertyOnboarding | onboarding.ts, organization-documents.ts |
| `order` | accept, activate, cancel, complete, create, draft, send, termsUpdate | CampaignOrder | campaign-order.ts |
| `orderDelivery` | answerCancellation, answerProblem, answerReply, askCancel, cancel, confirm, escalate, markDelivered, remind, reportProblem, resolve, sellerCancel | MarketplaceOrder | delivery.ts |
| `orderSellerApproval` | accept, decline, expire, open, settledBySweep | OrderSellerApproval, MarketplaceOrder | order-approval.ts |
| `payment` | afterPaid, confirm, fail, paidAfterCancel, processing, refunded, refused, start | MarketplaceOrder | payouts.ts, payment-events.ts, payment-exceptions.ts |
| `paymentEvent` | &lt;status&gt; (applied, ignored, deferred, held, failed), error, failed, receive, resolve, standinSend | PaymentEvent | payment-events.ts |
| `paymentRefund` | applied, dismissed | MarketplaceOrder | refunds.ts, payment-exceptions.ts |
| `payout` | approve, autoApprove, autoRetry, fail, paid, reject, request, resume, retry, retryStopped, returned, send, sentBackBySystem | Payout | payouts.ts |
| `payoutAccount` | link, open, status | PayoutAccount | payouts.ts |
| `property` | setEmailDomain | Property | student-auto.ts |
| `publication` | create | Publication | edition.ts |
| `rate` | set | AthleteRate | athlete-rate.ts |
| `rateCard` | set | Publication | edition-rate-card.ts |
| `refundDue` | create, heldForProviderRefund, providerRefused, providerUnavailable, queuedToProvider, sent | MarketplaceOrder, Campaign, entity | refunds.ts |
| `reservation` | hold, release | Reservation | reservation.ts |
| `restrictedWord` | add, remove | RestrictedWord | restricted-words.ts |
| `restriction` | create, delete | BrandRestriction | restrictions.ts |
| `revenueSplit` | lock, recomputeRefused, unlock | Edition | edition-split-lock.ts, dmv-pools.ts, edition.ts |
| `reward` | create, tokenIssue, transition | Reward, RewardToken | reward.ts, campaign-stages.ts |
| `rosterEntry` | add | Property | featured.ts |
| `saleAttribution` | create, reverse | Student | student.ts, attribution-reversal.ts |
| `signupSettings` | update | Tenant | age-of-majority.ts |
| `sponsor` | assignStudent, setCategories | Sponsor | student.ts, restrictions.ts |
| `sponsorReport` | requestRender | Campaign | report-files.ts |
| `sponsorRequest` | approve, autoApprove, decline, emailConfirmed, needsReview, reinstate, reject | Inquiry | sponsor-requests.ts |
| `storage` | privateDownloadGrant, privateUploadGrant, privateUploadRefused | context.entity | lib/storage.ts |
| `student` | apply, autoApprovalDigest, autoApprove, create, guardianLink, holdForAdvisor, transition | Student, Property | student.ts, student-auto.ts, student-moves.ts |
| `studentCode` | issue | Student | student-moves.ts |
| `studentPoints` | accrue | Student | student.ts |
| `studentProspect` | decide, hold, submit | StudentProspect | student-moves.ts, student-auto.ts, student.ts |
| `support` | attachmentPurged, messageQueued | SupportMessage | account-closure.ts, support.ts |
| `sync` | conflict | entity | zoho-sync.ts |
| `team` | addAthlete, joinAthlete, leave, removeAthlete, setShare | Athlete | team.ts, team-invitations.ts |
| `teamInvitation` | accept, create, decline, withdraw | TeamInvitation | team-invitations.ts |
| `tenant` | provision | Tenant | onboarding.ts |
| `tracking` | linkCreate | TrackingLink | tracking.ts |
| `user` | provision | User | athlete-login.ts |
| `webhookDelivery` | bodyTrimmed | WebhookDelivery | webhook-retention.ts |

*References: Phase 3 plan `3S0-DATA-01` (Spec §21);
`SponsorX-Reward-Event-Taxonomy.md`; `SponsorX-Metric-Provenance-Taxonomy.md`;
`SponsorX-Phase2-Ledger-Design.md`; Blueprint §16, §22, §26.*
