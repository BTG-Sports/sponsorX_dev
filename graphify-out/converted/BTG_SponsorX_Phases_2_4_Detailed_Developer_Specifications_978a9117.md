<!-- converted from BTG_SponsorX_Phases_2_4_Detailed_Developer_Specifications.docx -->

BTG SPORTS GROUP
SPONSORX
PHASES 2-4 DETAILED DEVELOPER SPECIFICATIONS
Continuation of the BTG SponsorX Master Development Blueprint
Developer Handoff | Version 1.0 | August 2026

Scope: Phase 2 Marketplace & Athlete Commerce | Phase 3 Intelligence & Attribution | Phase 4 INFINEX Integration

# 1. Purpose of This Continuation
This document extends the BTG SponsorX Master Development Blueprint after completion of the Phase 1 MVP. It is intended to be handed directly to the product manager, technical architect, UX team, engineering team, QA team, integration developers, and DevOps resources responsible for taking SponsorX from an internal BTG sponsorship operating system into a scalable multi-tenant sports sponsorship marketplace, intelligence platform, and INFINEX-connected activation engine.
The specifications below are intentionally implementation-oriented. Each phase defines functional scope, user-facing screens, business workflows, API contracts, data-model additions, external integrations, sprint sequencing, acceptance criteria, staffing assumptions, estimated timeline, and planning budget.
# 2. Phase Dependency Summary

# 3. Cross-Phase Engineering Standards
- API-first architecture: every major user-facing capability must be available through authenticated services.
- Multi-tenant isolation: all records, API calls, analytics queries, uploads, payouts, and integrations must be tenant-scoped.
- Event-driven integrations: use queues/webhooks/background workers for external systems instead of blocking primary user workflows.
- Idempotency: all payment, webhook, reward, attribution, and event-ingestion endpoints must prevent duplicate side effects.
- Auditability: pricing overrides, campaign edits, payouts, attribution changes, approval decisions, and role changes must be logged.
- Explainability: recommended prices, match scores, forecasts, and attributed revenue must expose source/logic metadata to authorized users.
- Feature flags: all major Phase 2-4 capabilities should be launchable per tenant or environment.
- Observability: structured logs, tracing, job monitoring, retry dashboards, alerting, and error tracking are required before production release.
- Privacy by design: minimize fan identity, separate consent from campaign behavior, and avoid exposing raw PII in analytics interfaces.
- Provider abstraction: payment, wallet, social-data, commerce-attribution, messaging, and INFINEX integrations should use adapter interfaces.


# 4. Phase 2 Business Goal
Phase 2 turns SponsorX into a true marketplace. External athletes, teams, programs, events, media properties, and approved partners can onboard, publish inventory, receive campaign offers, complete sponsor deliverables, track earnings, and receive payouts. Sponsors gain self-service purchasing/reservation capabilities, while BTG retains marketplace governance, approval control, quality assurance, and revenue-share management.
# 5. Phase 2 Feature Modules

# 6. Phase 2 New Screens

# 7. Phase 2 Primary Workflows
## 7.1 External Property Onboarding
- User creates an organization account and chooses Athlete, Team, Program, Event, Media Property, Agency, or Other approved property type.
- System captures required identity/business fields based on organization type and jurisdiction.
- User accepts platform terms, marketplace terms, payout terms, privacy terms, and any BTG representation/management documents applicable to the relationship.
- If the property will receive funds, payout-provider onboarding is initiated through the provider's hosted or embedded flow.
- Property is placed in PENDING_REVIEW status.
- BTG reviewer validates profile, supporting information, rights to sell inventory, brand-safety status, and payout readiness.
- Reviewer approves, requests changes, rejects, or suspends.
- Upon approval, property gains access to listing creation and campaign-offer workflows.
## 7.2 Marketplace Purchase / Reservation
- Sponsor filters and selects one or more available inventory items.
- System runs availability, exclusivity, category-conflict, date-overlap, quantity, and floor-price validation.
- Sponsor adds inventory to cart or requests a custom proposal.
- For reservable inventory, system creates a time-limited reservation record and temporarily reduces available quantity.
- Pricing engine calculates list price, negotiated discount, platform fees, taxes/fees metadata, and deposit requirement.
- Sponsor accepts marketplace/order terms and submits payment or purchase request.
- If BTG approval is required, order remains PENDING_APPROVAL; payment may be authorization/deposit only based on configured policy.
- When approved, inventory becomes CONTRACTED/SOLD, campaign is created, commission rules are snapshotted, and Zoho Deal/Campaign records are updated.
- If rejected or reservation expires, inventory quantity is released and payment authorization/deposit is handled according to policy.
## 7.3 Athlete Campaign Offer and Fulfillment
- Campaign manager selects athlete inventory and sends formal offer.
- Athlete receives brief, sponsor, compensation, deadlines, usage rights, exclusivity period, required disclosures, and deliverable specifications.
- Athlete accepts, declines, or requests changes.
- Accepted offer creates immutable commercial terms snapshot and scheduled deliverables.
- Athlete receives reminders and can upload draft content/proofs.
- Campaign manager approves/rejects/revises content.
- Final published asset URL and timestamp are stored.
- Performance is ingested from available platform integrations or verified manually.
- Once required deliverables are accepted and sponsor payment is cleared, earnings move from PENDING to AVAILABLE according to configured hold rules.
- Payout job sends funds or marks payout ready via provider adapter.
## 7.4 Commission & Payout Calculation
Order gross revenue must be converted into a ledger rather than calculating payout values ad hoc at payout time.
- Create order_financial_snapshot at contract time.
- Apply sequential rules: gross amount → discounts/credits → platform fee → management fee → payment processing allocation → property/athlete share → partner/referral share → reserve/hold → available payout.
- Store percentage and fixed-fee rules as versioned commission_rule records.
- Never recalculate historical closed payouts when a future commission rule changes.
- Payout eligibility must depend on payment clearance, completion/approval status, refund/dispute status, KYC/provider readiness, and configurable holding period.
# 8. Phase 2 API Additions

# 9. Phase 2 Database Additions

# 10. Phase 2 Integrations

# 11. Phase 2 Sprint Plan

# 12. Phase 2 Acceptance Criteria
- An external property can onboard, submit required information, be reviewed, and be approved without direct database intervention.
- A verified athlete or property can create inventory but cannot publish it unless marketplace-governance rules are satisfied.
- Marketplace search returns only inventory available to the requesting sponsor/tenant and respects visibility restrictions.
- Reservations prevent overselling and automatically release expired inventory.
- Category-exclusivity and date conflicts block invalid purchases.
- Sponsor can complete a purchase or reservation through the configured payment/order flow.
- Payment webhooks are idempotent and correctly update order/payment state.
- Commission snapshot is created at contract time and remains unchanged if future rate cards are edited.
- Athlete can accept a campaign offer, complete deliverables, and view earnings.
- Payout cannot be released if payment is unsettled, deliverables are incomplete, account onboarding is incomplete, or a dispute is open.
- Wallet reward pass can be issued and updated from SponsorX.
- Property dashboard accurately reconciles booked revenue, ledger balance, paid earnings, and pending earnings.
- Zoho contains linked Account/Contact/Deal data for external marketplace transactions.
- Cross-tenant data access tests pass for sponsor, athlete/property and admin roles.
# 13. Phase 2 Staffing, Timeline & Budget

Estimated timeline: 16-20 weeks including architecture, UAT and production stabilization.



# 14. Phase 3 Business Goal
Phase 3 makes SponsorX intelligent. Instead of only storing and reporting campaigns, the platform should recommend prices, identify best-fit sponsors/properties, forecast delivery, flag underperformance before campaign completion, identify suspicious metrics, automate make-good recommendations, and ingest verified commerce-attribution data from supported partners.
# 15. Phase 3 Feature Modules

# 16. Phase 3 New Screens

# 17. Phase 3 Intelligence Workflows
## 17.1 Dynamic Pricing Workflow
- Nightly or event-triggered job assembles feature snapshot for each active property/inventory unit.
- Feature service calculates audience size/quality, engagement, historical delivery, demand, seasonality, geographic value, inventory scarcity and confidence.
- Pricing service produces recommended CPM, recommended fixed price, expected range and explanation factors.
- Recommendation is stored with model/rule version and timestamp.
- Authorized BTG/property user may accept recommendation or override within allowed guardrails.
- Override reason is required and logged.
- Subsequent sales performance feeds pricing evaluation but does not mutate the historical recommendation record.
## 17.2 Sponsor Matching Workflow
- Sponsor defines campaign objective, budget, target geography, sport, audience, categories, excluded categories, dates and channels.
- Eligibility filter removes unavailable/conflicted/unsafe inventory.
- Scoring service evaluates audience fit, geography, content format, category affinity, historical performance, budget fit, sponsor history and inventory quality.
- System returns ranked results with normalized match score and human-readable reasons.
- Sponsor or BTG can save shortlist and generate proposal/campaign scenario.
- Actual campaign outcomes are later used to evaluate match-score quality.
## 17.3 Campaign Risk Forecasting
- Daily pacing job compares elapsed campaign time, scheduled deliverables and delivered metrics.
- Forecast service estimates final impressions/reach and probability of hitting guarantee.
- Campaigns crossing configurable risk thresholds generate alerts.
- Campaign manager receives recommended action: accelerate content, add deliverable, use alternate channel, or reserve make-good inventory.
- Forecast value and intervention history are stored for later model evaluation.
## 17.4 Commerce Attribution
SponsorX must treat attribution as a pluggable methodology, not as a universal truth. Each attributed transaction must identify the partner/source, attribution rule, lookback window, match method and confidence.
- Partner sends transaction/redemption events or SponsorX retrieves them through approved API.
- Events are normalized into attribution_event format.
- Attribution engine attempts deterministic match first (unique reward/token/order/partner click ID).
- If a probabilistic or aggregate attribution method is used, mark it explicitly and store confidence/method metadata.
- Attributed event links to campaign, sponsor, property, activation/reward, and revenue amount where available.
- Unmatched/ambiguous events remain visible in reconciliation queue.
- Sponsor reports distinguish verified redemptions, verified transactions, modeled attribution and estimated media value.
# 18. Phase 3 API Additions

# 19. Phase 3 Database / Analytics Additions

# 20. Phase 3 Integrations

# 21. Phase 3 Sprint Plan

# 22. Phase 3 Acceptance Criteria
- Every recommended price exposes model/rule version, confidence and factor breakdown.
- Admin can override a price only with appropriate permission and required reason.
- Match explorer never returns unavailable or category-conflicted inventory.
- Sponsor brief produces ranked recommendations and explanation factors within agreed response-time target.
- Campaign forecast refreshes automatically and persists historical forecasts.
- At-risk campaign thresholds generate actionable alerts before campaign end.
- Make-good recommendation respects sponsor target, availability, exclusivity, and estimated value equivalence.
- Attribution events identify source, method and confidence; estimated/modelled revenue is never labeled as verified.
- Warehouse metrics reconcile to transactional campaign/order/payment totals within defined tolerance.
- Anomaly console identifies seeded duplicate/bot/redemption test patterns.
- Model version can be activated, rolled back and compared without code deployment.
- All intelligence features can be disabled per tenant through feature flags.
# 23. Phase 3 Staffing, Timeline & Budget

Estimated timeline: 18-22 weeks for a disciplined v1 intelligence release; longer if multiple commerce-attribution partners are added simultaneously.



# 24. Phase 4 Business Goal
Phase 4 connects SponsorX to INFINEX World so sponsors can buy, activate, measure and renew virtual sponsorship inventory in the same campaign system used for real-world events, athletes, media and fan rewards. SponsorX remains the commercial and reporting system-of-record; INFINEX becomes an activation client that renders placements and sends verified interaction events back.
# 25. Phase 4 Feature Modules

# 26. Phase 4 New Screens

# 27. Phase 4 Core Workflows
## 27.1 Virtual Placement Setup
- INFINEX environment/world is registered with stable world_id and environment version.
- Developer or operations user registers placement surfaces using stable placement_id values.
- SponsorX stores zone, placement type, technical creative constraints, viewability rule, allowed campaign types, capacity and availability.
- Placement is mapped to a sellable SponsorX inventory record.
- Placement passes staging test and is marked AVAILABLE.
## 27.2 Campaign Creative Deployment
- Campaign manager adds virtual placement inventory to campaign.
- Creative asset is uploaded and validated against placement requirements.
- Creative goes through sponsor/BTG approval workflow.
- SponsorX creates deployment record with start/end, asset version and placement IDs.
- INFINEX client or content service requests active deployment manifest.
- Client renders approved asset and records deployment version.
- If rollback or emergency pause occurs, SponsorX updates manifest and invalidates prior asset/deployment state.
- All deployment changes are audit logged.
## 27.3 Virtual Impression / Interaction Measurement
- INFINEX client produces telemetry events using a shared event schema.
- Events are batched and sent to SponsorX ingestion endpoint using service authentication.
- Server validates schema, timestamp, placement/campaign relationship, signature/token and replay/duplicate indicators.
- Raw events are written to durable event stream/storage.
- Aggregation job calculates visits, gross impressions, viewable impressions, dwell, interactions, challenge metrics and unique/session-level metrics.
- Sponsor dashboards read aggregates rather than raw telemetry.
- Fraud/data-quality service flags invalid or suspicious event patterns.
## 27.4 Activation → Reward Workflow
- Sponsor configures activation completion criteria in SponsorX.
- INFINEX sends activation_started and activation_completed events.
- SponsorX validates completion against activation/session/user constraints.
- If eligible, SponsorX creates reward claim token and returns claim response/deep link.
- Fan receives in-world confirmation and optional Wallet/SMS/email reward delivery.
- Reward redemption feeds back into the cross-channel SponsorX campaign report.
# 28. Phase 4 API Contract

# 29. INFINEX Event Schema
Minimum event payload:

# 30. Phase 4 Database Additions

# 31. Phase 4 Integrations

# 32. Phase 4 Virtual Pricing Model
Virtual pricing should initially be transparent and rules-based. SponsorX can later train recommendations from actual traffic and sponsor demand.
Recommended Virtual Rate = Base Placement Rate × Traffic Multiplier × Viewability × Dwell/Engagement × Scarcity × Exclusivity × Event/Seasonality × Brand Integration Depth

# 33. Phase 4 Sprint Plan

# 34. Phase 4 Acceptance Criteria
- SponsorX can register a world, zone and virtual placement and map the placement to sellable inventory.
- Active campaign manifest returns only approved, in-window deployments for the requested world/time.
- INFINEX client can render a sponsored placement using the correct asset/version.
- Creative can be paused or rolled back from SponsorX without redeploying the entire INFINEX application.
- Telemetry batch endpoint supports idempotent event IDs and rejects malformed/unauthorized events.
- Viewable impressions are calculated according to versioned viewability rules and remain distinct from gross renders.
- Repeated duplicate telemetry does not inflate sponsor reports.
- Interactive activation can start, complete, and trigger a SponsorX reward exactly once per configured eligibility rule.
- Cross-channel dashboard shows INFINEX metrics alongside non-virtual campaign metrics without double counting.
- Operations console displays event lag, client heartbeat, deployment failures and active incidents.
- Pilot sponsor can receive a report containing virtual delivery, interaction, reward funnel and proof/creative summary.
- Load test meets agreed event-ingestion throughput and dashboard latency targets for expected Phase 4 traffic.
# 35. Phase 4 Staffing, Timeline & Budget

Estimated timeline: 18-22 weeks for a first production world integration, assuming the INFINEX runtime and world environments already exist.


# 36. Combined Phases 2-4 Program Plan

# 37. Recommended Parallelization
Phases should not be fully overlapped, but selected workstreams can run in parallel after platform foundations stabilize.
- Begin Phase 3 warehouse/event modeling during the final 4-6 weeks of Phase 2 so transaction/campaign data is captured correctly from launch.
- Begin Phase 4 INFINEX API contract and placement taxonomy during the final 4 weeks of Phase 3, before UI implementation.
- Do not begin advanced AI/ML pricing before SponsorX has enough clean historical observations; launch Phase 3 with rules/statistical models first.
- Do not launch marketplace payouts before commission snapshots, reconciliation, refund/dispute behavior, and audit logs are fully tested.
- Do not report virtual impressions to sponsors until viewability and de-duplication criteria are validated against pilot-world telemetry.
# 38. Cross-Phase Non-Functional Requirements

# 39. Recommended Delivery Team Structure
For Phases 2-4, the preferred structure is one persistent core SponsorX team plus specialist resources that join by phase.

# 40. Budget Governance & Contracting Recommendation
- Contract each phase against milestone deliverables and acceptance criteria rather than open-ended hourly development alone.
- Hold 10%-15% of each milestone payment until UAT acceptance and critical defects are resolved.
- Require source code, infrastructure-as-code, API documentation, database migrations, design files and deployment credentials to be owned/controlled by BTG.
- Avoid vendor lock-in by requiring provider adapters and documented replacement points for payments, wallet, analytics and attribution services.
- Maintain a 10%-15% contingency reserve for third-party API changes, compliance requirements, performance scaling and integration rework.
- Separate software development budget from sponsor creative production, 3D asset production, paid data licenses and transaction-provider fees.
# 41. Recommended Go/No-Go Gates

# 42. Final Developer Deliverables for Phases 2-4
- Updated system architecture diagram covering marketplace, payments, analytics warehouse, model services and INFINEX.
- UX/UI source files for every screen defined in this continuation.
- Database ERDs and migrations for all new tables.
- OpenAPI specification for all public/internal endpoints.
- Webhook/event taxonomy and example payloads.
- Payment/ledger reconciliation specification and test cases.
- Pricing/matching/forecast model documentation including factors and versioning.
- Attribution-method documentation and reporting labels.
- INFINEX client integration guide and event SDK/specification.
- Automated test suite and test coverage report.
- Security review results and remediation log.
- Deployment/runbooks, monitoring dashboards and incident procedures.
- Administrator guide, sponsor/property user guide, and technical handoff session.
- UAT sign-off for each phase before production release.
# 43. Recommended Next Artifact
After approval of this specification, the next artifact should be a unified SponsorX Product Requirements & Sprint Backlog workbook containing every Phase 1-4 epic, user story, priority, dependency, owner, acceptance criterion, sprint assignment, estimate, status and release target. That workbook should become the operating build tracker for the development team.
| Phase | Depends On | Primary Outcome |
| --- | --- | --- |
| Phase 2 | Phase 1 auth/RBAC, sponsor/property/inventory/campaign/reward models, Zoho integration, core analytics | Open SponsorX to outside properties and athletes; enable marketplace transactions, commissions, payouts, wallet rewards, and richer self-service portals. |
| Phase 3 | Phase 2 transaction history, campaign performance data, marketplace activity, reliable event ingestion | Add dynamic pricing, sponsor-property matching, forecasting, attribution adapters, automated optimization, anomaly detection, and executive intelligence. |
| Phase 4 | Stable SponsorX APIs, campaign/reward engine, identity/session model, metrics pipeline | Turn INFINEX World into a measurable sponsorship channel with virtual placements, branded environments, interactive activations, rewards, and cross-channel reporting. |
| PHASE 2 - MARKETPLACE & ATHLETE COMMERCE
Target: convert SponsorX from BTG-only operations into a multi-tenant sponsorship marketplace. |
| --- |
| Module | Required Capability |
| --- | --- |
| Multi-Tenant Property Onboarding | Organization signup, identity verification, property type selection, business profile, banking/payout onboarding, contracts/terms acceptance, approval workflow. |
| Athlete Commerce Portal | Athlete profile, rates, brand restrictions, NIL inventory, campaign invites, content approvals, deliverables, earnings, payout history. |
| Team / Program Portal | Roster, properties, inventory, campaigns, users, revenue shares, team-level reporting. |
| Marketplace Listing Engine | Public/private listings, availability, packages, limited quantity, reservations, waitlists, exclusivity/conflict rules. |
| Cart / Reservation / Checkout | Inventory selection, quote, deposits/full payment, taxes/fees metadata, contract approval gates, payment-status tracking. |
| Commission Engine | Platform fee, BTG management fee, athlete/property share, referral fee, tax/withholding metadata, payout eligibility. |
| Payout Orchestration | Connected account status, balance ledger, payout requests/approvals, payout status, exceptions. |
| Digital Wallet Rewards | Apple/Google Wallet issuance adapter, pass updates, expiration, redemption-state changes. |
| Enhanced Messaging | Transactional email/SMS/push-ready notifications for offers, deadlines, approval requests, reward delivery, payout status. |
| External Property Analytics | Per-property sales, inventory utilization, campaign performance, sponsor renewal and earnings dashboard. |
| Marketplace Governance | Property verification, listing moderation, pricing floors, category conflicts, brand safety, dispute/exception handling. |
| White-Label Readiness | Tenant logo/colors, custom subdomain mapping readiness, branded reports and sponsor-facing portal options. |
| Screen ID | Purpose |
| --- | --- |
| P2-01 Property Onboarding Wizard | 5-7 step wizard: organization, type, contacts, business details, tax/payout details, agreements, review/submit. |
| P2-02 Property Verification Queue | BTG admin review of submitted properties; approve, request changes, reject, suspend. |
| P2-03 Athlete Portal Home | Upcoming campaigns, approval requests, overdue deliverables, earnings YTD, payout status, inventory performance. |
| P2-04 Athlete Inventory Manager | Create/edit NIL items, rates, availability, categories, restrictions, package rules. |
| P2-05 Athlete Campaign Offer | Sponsor brief, compensation, deliverables, usage rights, deadlines, approve/decline/request change. |
| P2-06 Team/Program Dashboard | Roster, property inventory, campaigns, revenue, tasks, performance. |
| P2-07 Marketplace Listing Editor | Listing data, pricing, package builder, preview, approval status, visibility settings. |
| P2-08 Marketplace Cart / Reservation | Selected inventory, quantities, sponsorship package summary, price/fees, reservation timer if enabled. |
| P2-09 Checkout / Contract Gate | Billing/contact info, agreement acceptance, deposit/full payment options, approval conditions. |
| P2-10 Commission & Revenue Share Editor | Configure split rules by property, athlete, campaign, inventory type, or partner. |
| P2-11 Earnings & Payout Dashboard | Gross campaign revenue, fees, available balance, pending balance, payout history, exceptions. |
| P2-12 Wallet Reward Manager | Issue/update/deactivate wallet reward passes; claim links; provider status. |
| P2-13 Property Analytics Dashboard | Revenue, sell-through, average CPM, campaign completion, sponsor mix, payout trends. |
| P2-14 Marketplace Operations Console | Moderation queue, disputes, failed payments, payout exceptions, listings requiring review. |
| Domain | Example Endpoints | Purpose |
| --- | --- | --- |
| Onboarding | POST /v1/onboarding/properties; GET /v1/onboarding/{id}; POST /v1/onboarding/{id}/submit | Create and submit external property onboarding. |
| Verification | GET /v1/admin/verifications; POST /v1/admin/verifications/{id}/decision | BTG approval queue. |
| Listings | POST /v1/listings; PATCH /v1/listings/{id}; POST /v1/listings/{id}/publish | Marketplace listing lifecycle. |
| Availability | POST /v1/availability/check | Validate dates, exclusivity, inventory quantity and conflicts. |
| Cart | POST /v1/carts; POST /v1/carts/{id}/items; DELETE /v1/carts/{id}/items/{itemId} | Sponsor cart. |
| Reservations | POST /v1/reservations; POST /v1/reservations/{id}/release | Time-limited inventory holds. |
| Orders | POST /v1/orders; GET /v1/orders/{id}; POST /v1/orders/{id}/approve | Commercial order. |
| Payments | POST /v1/payments/checkout-session; POST /v1/webhooks/payment-provider | Provider checkout and webhooks. |
| Connected Accounts | POST /v1/payout-accounts/onboarding-link; GET /v1/payout-accounts/status | Property/athlete payout onboarding. |
| Ledger | GET /v1/earnings; GET /v1/ledger; GET /v1/payouts | Financial visibility. |
| Payouts | POST /v1/payouts/request; POST /v1/admin/payouts/{id}/approve | Payout flow. |
| Athlete Offers | POST /v1/athlete-offers; POST /v1/athlete-offers/{id}/decision | Campaign invitations. |
| Wallet | POST /v1/wallet/passes; PATCH /v1/wallet/passes/{id}; POST /v1/wallet/webhooks | Apple/Google pass abstraction. |
| Notifications | POST /v1/notifications/test; GET /v1/notification-preferences | Transactional communications. |
| Table | Key Fields | Purpose |
| --- | --- | --- |
| property_onboarding | id, tenant_id, property_type, status, submitted_at, reviewer_id | Onboarding workflow. |
| property_verification_documents | id, onboarding_id, type, file_ref, status | Supporting verification artifacts. |
| marketplace_listings | id, inventory_id, seller_tenant_id, visibility, status, published_at | Marketplace representation. |
| listing_packages | id, listing_id, title, quantity, bundle_json, price | Bundled inventory. |
| carts | id, sponsor_id, status, currency, expires_at | Sponsor shopping session. |
| cart_items | id, cart_id, listing_id, quantity, unit_price | Cart lines. |
| reservations | id, listing_id, sponsor_id, quantity, expires_at, status | Inventory holds. |
| orders | id, sponsor_id, campaign_id, status, subtotal, fees, total, currency | Commercial order. |
| order_items | id, order_id, listing_id, inventory_id, financial_snapshot_json | Immutable purchase lines. |
| payment_transactions | id, order_id, provider, provider_ref, amount, status, type | Payment lifecycle. |
| refunds_disputes | id, payment_id, type, amount, reason, status | Exceptions. |
| commission_rules | id, scope_type/id, rule_type, rate/fixed_amount, priority, version | Revenue-sharing rules. |
| ledger_entries | id, tenant/payee, order_id, type, debit, credit, status | Financial subledger. |
| payout_accounts | id, payee_id, provider, provider_account_id, status | Connected payout account. |
| payout_requests | id, payee_id, amount, status, requested_at | Payout workflow. |
| athlete_offers | id, campaign_id, athlete_id, terms_json, status, expires_at | Formal offers. |
| brand_restrictions | id, property_id, category, restriction_type, start/end | Conflicts and eligibility. |
| wallet_passes | expand existing: provider_template_id, device_registrations, last_update | Wallet lifecycle. |
| notification_preferences | user_id, channel, event_type, enabled | Communication settings. |
| tenant_branding | tenant_id, logo_url, primary_color, report_branding_json | White-label readiness. |
| Integration | Priority | Purpose |
| --- | --- | --- |
| Marketplace Payment Provider | Required | Checkout, connected-account onboarding, platform fees, transfers/payouts, refunds, disputes, webhooks. |
| Zoho CRM | Expand | Sync marketplace orders, external property accounts, deal stage, invoice/payment references, renewals. |
| Apple Wallet | Recommended | Issue/update passes for sponsor-funded offers and event rewards. |
| Google Wallet | Recommended | Issue/update offer passes and reward objects. |
| Email Provider | Required | Transactional campaign/order/onboarding/reward messages. |
| SMS Provider | Optional but recommended | Time-sensitive reminders, OTP/claim delivery, payout alerts. |
| Social Platform APIs | Selective | Audience snapshots and campaign performance where approved/available. |
| Cloud File Storage/CDN | Required | Contracts, verification documents, creative assets, proofs, report files. |
| Tax/Identity Service | Optional | Add if marketplace volume/jurisdiction needs exceed payment-provider capabilities. |
| Sprint | Duration | Scope |
| --- | --- | --- |
| Sprint 0 | 2 weeks | Architecture update, UX flows, marketplace state machines, financial ledger design, provider selections, security review. |
| Sprint 1 | 2 weeks | External tenant/property onboarding, verification queue, document handling, permissions. |
| Sprint 2 | 2 weeks | Athlete/team portal foundation, inventory/rates/restrictions, campaign-offer flow. |
| Sprint 3 | 2 weeks | Marketplace listing engine, packages, search/filter, availability/conflict checks. |
| Sprint 4 | 2 weeks | Cart, reservations, orders, contract gates, order state machine. |
| Sprint 5 | 2 weeks | Payment provider, connected accounts, ledger, commission rules, payout statuses. |
| Sprint 6 | 2 weeks | Wallet reward adapters, transactional notifications, claim/pass updates. |
| Sprint 7 | 2 weeks | Property analytics, marketplace operations console, Zoho expansion. |
| Sprint 8 | 2 weeks | End-to-end QA, payment/reward failure testing, security review, UAT, production rollout. |
| Role | Suggested Allocation | Responsibility |
| --- | --- | --- |
| Product Manager | 0.5-1.0 FTE | Own marketplace rules, backlog, UAT and business decisions. |
| Technical Architect / Lead | 0.5 FTE | Financial/state-machine architecture, security, provider patterns. |
| UX/UI Designer | 0.5 FTE first 8-10 weeks | Marketplace, onboarding, athlete/property portal UX. |
| Frontend Engineers | 2 FTE | Sponsor, marketplace, athlete/property and admin interfaces. |
| Backend Engineers | 2 FTE | Orders, ledger, payouts, availability, integrations, APIs. |
| Integration Engineer | 0.5-1 FTE | Payments, wallet, Zoho, notifications. |
| QA Automation Engineer | 1 FTE | End-to-end, financial and regression testing. |
| DevOps/SRE | 0.25-0.5 FTE | Environments, monitoring, secrets, deployment. |
| Security/Compliance Reviewer | Fractional | Payments, PII, minors/NIL, marketplace terms. |
| Budget Scenario | Estimated Phase 2 Budget | Assumption |
| --- | --- | --- |
| Lean offshore/nearshore | $55,000-$80,000 | Strong senior lead, tightly managed scope, hosted provider flows, limited custom finance UI. |
| Balanced production build | $80,000-$120,000 | Better UX, stronger automation/testing, richer marketplace operations and wallet integration. |
| Premium / U.S.-heavy team | $120,000-$175,000 | Higher domestic labor mix, deeper compliance/security, more automated social/payment integrations. |
| PHASE 3 - INTELLIGENCE & ATTRIBUTION
Target: convert marketplace and campaign data into automated pricing, matching, forecasting, attribution, and optimization. |
| --- |
| Module | Required Capability |
| --- | --- |
| Dynamic CPM Engine | Versioned rule/model service using property, audience, format, demand, seasonality, historical performance and confidence. |
| Sponsor-Property Matching | Rank inventory/athletes/properties for sponsor objectives, geography, audience, category, budget and brand-safety requirements. |
| Campaign Delivery Forecasting | Predict probability of meeting guaranteed impressions and deliverables by campaign end. |
| Make-Good Optimizer | Recommend substitute inventory based on shortfall, sponsor objective, audience equivalence, cost and availability. |
| Attribution Adapter Framework | Ingest transaction/redemption or commerce events from approved partners with defined attribution window/method. |
| Performance Benchmarks | Property/category/channel benchmarks by sport, market, format and audience. |
| Anomaly/Fraud Detection | Detect improbable spikes, duplicate events, bot-like behavior, suspicious reward redemption patterns and manual-entry inconsistencies. |
| Sponsor Intelligence Dashboard | Cross-campaign audience, performance, ROI/ROAS, category and market recommendations. |
| Property Intelligence Dashboard | Recommended rate, sell-through optimization, sponsor category opportunities, performance quality score. |
| Forecast & Scenario Planner | Change budget, CPM, inventory mix and guaranteed views to compare scenarios. |
| Data Warehouse / Semantic Layer | Reliable analytical model separated from transactional database. |
| Model Governance | Versioning, confidence score, explanation, manual override, monitoring and rollback. |
| Screen ID | Purpose |
| --- | --- |
| P3-01 Pricing Intelligence Panel | Recommended CPM/price, current rate, factor breakdown, confidence, historical range, override. |
| P3-02 Sponsor Match Explorer | Ranked athletes/properties/inventory with match score and explanation. |
| P3-03 Campaign Forecast Dashboard | Projected final delivery, probability of guarantee, pacing chart, risk factors, recommended actions. |
| P3-04 Make-Good Recommendation Center | Shortfall amount, available substitute inventory, equivalency score, cost impact, approval action. |
| P3-05 Attribution Dashboard | Attributed transactions, revenue, method, window, confidence/source, unmatched events. |
| P3-06 Sponsor Intelligence Hub | Cross-campaign insights, audience segments, best-performing formats/properties, renewal recommendations. |
| P3-07 Property Intelligence Hub | Rate recommendations, revenue opportunity, sell-through, sponsor-category fit, quality score. |
| P3-08 Scenario Planner | Adjust budget, CPM, audience and inventory mix; compare expected delivery/revenue. |
| P3-09 Data Quality / Anomaly Console | Flagged metric streams, suspicious redemptions, data-quality issues, reviewer disposition. |
| P3-10 Model & Rule Administration | Manage pricing factors, model versions, thresholds, benchmarks, rollouts and feature flags. |
| Domain | Example Endpoints | Purpose |
| --- | --- | --- |
| Pricing | POST /v1/intelligence/pricing/recommend; GET /v1/inventory/{id}/pricing-history | Recommended rate service. |
| Matching | POST /v1/intelligence/matches; POST /v1/intelligence/shortlists | Sponsor-property ranking. |
| Forecasting | GET /v1/campaigns/{id}/forecast; POST /v1/campaigns/{id}/forecast/recalculate | Delivery forecast. |
| Make-Goods | GET /v1/campaigns/{id}/make-good-options; POST /v1/campaigns/{id}/make-good | Replacement recommendation/approval. |
| Attribution | POST /v1/attribution/events; GET /v1/campaigns/{id}/attribution | Normalized commerce events. |
| Benchmarks | GET /v1/benchmarks?dimension=... | Market/property/channel benchmarks. |
| Scenarios | POST /v1/scenarios; POST /v1/scenarios/{id}/calculate | What-if planning. |
| Anomalies | GET /v1/admin/anomalies; POST /v1/admin/anomalies/{id}/resolve | Data-quality review. |
| Models | GET /v1/admin/models; POST /v1/admin/models/{id}/activate | Version administration. |
| Feature Store | Internal /v1/internal/features/... | Feature snapshot generation and retrieval. |
| Table | Key Fields | Purpose |
| --- | --- | --- |
| pricing_recommendations | id, inventory_id, model_version, recommended_cpm, range, factors_json, confidence | Explainable pricing history. |
| pricing_overrides | id, recommendation_id, user_id, override_value, reason | Governance. |
| sponsor_briefs | id, sponsor_id, objective, budget, target_json, exclusions_json | Match input. |
| match_scores | id, brief_id, entity_type/id, score, factor_json, model_version | Ranked recommendations. |
| campaign_forecasts | id, campaign_id, projected_final, hit_probability, risk, factors_json | Delivery risk history. |
| make_good_recommendations | id, campaign_id, candidate_inventory_id, equivalency_score, cost_delta, status | Optimization. |
| attribution_events | id, source, campaign_id, reward_id, transaction_ref, revenue, method, confidence | Commerce attribution. |
| attribution_rules | id, provider, method, window_minutes/days, priority, version | Rule definitions. |
| benchmark_metrics | dimension_type/id, metric, period, p25, median, p75, sample_size | Performance benchmarks. |
| anomaly_events | id, source_entity, type, severity, detected_at, evidence_json, status | Fraud/data quality. |
| model_registry | id, model_name, version, status, metadata_json, activated_at | Model governance. |
| feature_snapshots | entity_type/id, as_of, features_json, version | Model inputs. |
| scenario_runs | id, user_id, inputs_json, outputs_json, created_at | What-if analysis. |
| warehouse_fact_campaign_daily | date, campaign_id, dimensions..., metrics... | Analytics warehouse fact table. |
| warehouse_dim_property / sponsor / channel / inventory | surrogate keys, normalized dimensions | Semantic analytics layer. |
| Integration | Priority | Purpose |
| --- | --- | --- |
| Data Warehouse | Required | Snowflake/BigQuery/Redshift/Postgres warehouse depending scale; decouple analytical workloads. |
| Transformation Layer | Required | dbt or equivalent transformation/versioning approach. |
| Social/Video Analytics APIs | Recommended | Automated verified campaign performance and audience snapshots. |
| Commerce/Attribution Partners | Selective | Transaction or redemption attribution where contractual access exists. |
| Payment Provider | Existing | Order/payment/revenue truth for SponsorX-controlled purchases. |
| Zoho CRM | Expand | Push renewal scores, sponsor health, recommended next action, campaign intelligence. |
| BI / Embedded Analytics | Optional | Use if faster than building every complex internal visualization in custom UI. |
| ML/Model Runtime | Optional at first | Rules/statistical models can launch before full ML service; add model-serving infrastructure as needed. |
| Sprint | Duration | Scope |
| --- | --- | --- |
| Sprint 0 | 2 weeks | Analytics architecture, event taxonomy audit, warehouse schema, model governance, attribution definitions. |
| Sprint 1 | 2 weeks | Warehouse ingestion, daily facts/dimensions, benchmark pipeline. |
| Sprint 2 | 2 weeks | Dynamic CPM engine v1, pricing panel, override governance. |
| Sprint 3 | 2 weeks | Sponsor brief and match engine v1, match explorer. |
| Sprint 4 | 2 weeks | Campaign pacing + forecast v1, risk alerts. |
| Sprint 5 | 2 weeks | Make-good optimizer and approval workflow. |
| Sprint 6 | 2 weeks | Attribution adapter framework, normalized event model, reconciliation. |
| Sprint 7 | 2 weeks | Sponsor/property intelligence dashboards, scenario planner. |
| Sprint 8 | 2 weeks | Anomaly rules, data-quality console, model admin. |
| Sprint 9 | 2 weeks | Backtesting, model/benchmark validation, UAT, staged rollout, monitoring. |
| Role | Suggested Allocation | Responsibility |
| --- | --- | --- |
| Product Manager / Analytics Lead | 0.75-1 FTE | Define decision logic, metrics, attribution language, prioritization. |
| Technical/Data Architect | 0.5 FTE | Warehouse, event model, model services, governance. |
| Data Engineer | 1-2 FTE | Pipelines, transformations, warehouse, quality checks. |
| Backend Engineers | 1-2 FTE | Pricing/matching/forecast APIs, attribution adapters. |
| Data Scientist / Applied ML | 0.5-1 FTE | Pricing/matching/forecast models, validation, confidence. |
| Frontend Engineers | 1-2 FTE | Intelligence dashboards and admin experiences. |
| QA/Data QA Engineer | 1 FTE | Reconciliation, model test cases, regression. |
| DevOps/MLOps | 0.25-0.5 FTE | Jobs, model deployment, monitoring, warehouse operations. |
| Attribution/Privacy Counsel | Fractional | Review attribution claims, consent, partner terms and reporting language. |
| Budget Scenario | Estimated Phase 3 Budget | Assumption |
| --- | --- | --- |
| Lean analytics-first | $75,000-$105,000 | Rules/statistical models first; one attribution adapter; modest warehouse scale. |
| Balanced production build | $105,000-$160,000 | Dedicated data engineering, forecasting/matching, stronger dashboards and model governance. |
| Advanced intelligence build | $160,000-$240,000 | Multiple attribution partners, deeper ML, near-real-time pipelines, sophisticated fraud/anomaly work. |
| PHASE 4 - INFINEX WORLD INTEGRATION
Target: make virtual worlds, spaces, branded experiences, and challenges first-class SponsorX inventory. |
| --- |
| Module | Required Capability |
| --- | --- |
| Virtual Property Registry | Map INFINEX worlds, districts, venues, zones and surfaces into SponsorX entities. |
| Placement Inventory Manager | Define billboards, LED surfaces, naming rights, branded rooms, courts, tunnels, kiosks and virtual products. |
| Creative Deployment | Associate approved sponsor assets with placements, version creative, schedule start/end, deliver signed asset URLs. |
| Branded Activation Builder | Configure challenges, quests, scavenger hunts, skill tests, product discovery, sponsor booths and gated reward triggers. |
| Virtual Event Measurement | Impressions, dwell, interactions, challenge starts/completions, visits, clicks and reward triggers. |
| Impression Validation | Viewability thresholds, dwell time, session de-duplication, anti-fraud checks. |
| Cross-Channel Campaigns | Single SponsorX campaign containing real-world, social, streaming, athlete, reward and INFINEX inventory. |
| Virtual Rewards | Complete activity → SponsorX claim/reward → wallet/coupon/partner offer. |
| INFINEX Sponsor Dashboard | Virtual performance, heatmaps/zone performance, interaction funnels, cross-channel contribution. |
| Dynamic Content Scheduling | Scheduled creative rotations, sponsor takeovers, daypart/event-based activation. |
| Virtual Commerce Links | Sponsor product/info links and partner checkout deep links; later immersive commerce if supported. |
| Operations / Live Control | Pause/replace creative, disable activation, incident handling, emergency sponsor take-down. |
| Screen ID | Purpose |
| --- | --- |
| P4-01 INFINEX World Registry | Worlds, districts, venues, zones, environment IDs and operational status. |
| P4-02 Virtual Placement Manager | Map placement IDs, dimensions/type, zone, viewability rules, available dates and pricing. |
| P4-03 3D/Placement Preview Metadata | Thumbnail/preview, orientation, allowed creative types, technical constraints, placement test status. |
| P4-04 Virtual Campaign Builder Extension | Add INFINEX placements/activations to existing campaign builder. |
| P4-05 Creative Deployment Console | Assign creative version, approve, schedule, publish, rollback. |
| P4-06 Activation Builder | Challenge/quest rules, start condition, completion criteria, reward trigger, sponsor content. |
| P4-07 Virtual Metrics Dashboard | Visits, impressions, viewable impressions, dwell, interactions, completion, reward funnel. |
| P4-08 Cross-Channel Campaign Dashboard | Compare INFINEX with social, streaming, event and athlete inventory. |
| P4-09 INFINEX Operations Console | Health, event lag, placement failures, creative mismatch, kill switch, incident log. |
| P4-10 Virtual Inventory Pricing Panel | Recommended price/CPM-like rate based on traffic, viewability, dwell, exclusivity and scarcity. |
| P4-11 Sponsor Activation Report | Virtual activation summary with content, engagement, rewards, screenshots/proofs and next actions. |
| P4-12 World Heatmap / Zone Insights | Aggregated zone traffic and engagement visualization when supported by INFINEX telemetry. |
| Domain | Example Endpoints | Purpose |
| --- | --- | --- |
| World Registry | POST /v1/infinex/worlds; GET /v1/infinex/worlds/{id} | Register worlds/environments. |
| Zones | POST /v1/infinex/worlds/{id}/zones | Register districts/venues/zones. |
| Placements | POST /v1/infinex/placements; PATCH /v1/infinex/placements/{id} | Virtual inventory surfaces. |
| Active Manifest | GET /v1/infinex/worlds/{worldId}/manifest?at=... | Return active placements/creative/activation config. |
| Creative | GET /v1/infinex/creative/{deploymentId} | Return signed metadata/asset reference. |
| Telemetry | POST /v1/infinex/events/batch | Batch impressions/interactions. |
| Activation | POST /v1/infinex/activations/{id}/start; POST /v1/infinex/activations/{id}/complete | Interactive campaign flow. |
| Reward Trigger | POST /v1/infinex/activations/{id}/reward | Issue SponsorX reward. |
| Health | POST /v1/infinex/clients/heartbeat | Operational client health. |
| Config | GET /v1/infinex/config | Feature flags, telemetry limits, schema versions. |
| Admin Operations | POST /v1/admin/infinex/deployments/{id}/pause; /rollback | Emergency control. |
| Analytics | GET /v1/campaigns/{id}/infinex-metrics | Virtual analytics query. |
| Field | Required | Notes |
| --- | --- | --- |
| event_id | Yes | Globally unique UUID for idempotency. |
| schema_version | Yes | Allows client/server evolution. |
| event_type | Yes | world_visit, placement_impression, placement_viewable, interaction, activation_started, activation_completed, reward_triggered, etc. |
| occurred_at | Yes | UTC timestamp from client/server. |
| received_at | Server | Server timestamp. |
| world_id / zone_id | Yes as applicable | Stable INFINEX IDs. |
| placement_id | For placement events | Must map to active SponsorX placement. |
| campaign_id / deployment_id | For sponsored events | Resolve current campaign asset. |
| session_id | Yes | Pseudonymous session identifier. |
| user_id | Optional | Only when authenticated/appropriate; do not require for measurement. |
| device/client_id | Optional | Pseudonymous anti-fraud/diagnostic identifier. |
| dwell_ms | When applicable | For viewability/engagement. |
| interaction_type | When applicable | click, open, enter, pickup, start, complete. |
| metadata | Optional | Small versioned JSON payload. |
| signature/token context | Yes at transport level | Used to authenticate trusted client/service. |
| Table | Key Fields | Purpose |
| --- | --- | --- |
| infinex_worlds | id, tenant_id, external_world_id, name, environment, version, status | World registry. |
| infinex_zones | id, world_id, external_zone_id, type, name | District/venue/zone mapping. |
| virtual_placements | id, zone_id, external_placement_id, type, specs_json, viewability_rule_id, status | Virtual inventory surface. |
| placement_availability | placement_id, start/end, capacity, status | Sellable time windows. |
| creative_deployments | id, campaign_id, placement_id, asset_id, version, start/end, status | Scheduled creative. |
| activation_definitions | id, campaign_id, world/zone, type, rules_json, reward_id, status | Quest/challenge rules. |
| virtual_event_raw | event_id, event_type, world/zone/placement/campaign, session, occurred_at, metadata | Raw telemetry. |
| virtual_metric_aggregates | date/hour, dimensions, metric, value | Reporting aggregates. |
| viewability_rules | id, placement_type, min_visible_pct, min_dwell_ms, version | Impression qualification. |
| infinex_client_registry | id, world_id, client_key_ref, version, status, last_heartbeat | Trusted client/service. |
| deployment_incidents | id, deployment_id, type, severity, opened/closed, notes | Ops history. |
| world_traffic_benchmarks | world/zone/date, visits, dwell, interaction baselines | Pricing/forecast support. |
| Integration | Priority | Purpose |
| --- | --- | --- |
| INFINEX Runtime / Game Engine | Required | Render placement manifests, emit telemetry, run activations, receive reward response. |
| SponsorX Asset CDN | Required | Fast signed delivery of approved creative. |
| Event Streaming / Queue | Required | Reliable high-volume telemetry ingestion and buffering. |
| Analytics Warehouse | Required | Virtual event aggregation and cross-channel reporting. |
| Reward/Wallet Service | Existing | Issue fan rewards from in-world actions. |
| Authentication / Identity | Required | Session/token model for trusted client and optional authenticated users. |
| Observability | Required | Client heartbeat, event lag, deployment errors, schema mismatch, alerting. |
| Zoho CRM | Optional extension | Include INFINEX inventory and results in sponsor renewal/opportunity context. |
| 3D Content Pipeline | Depends on INFINEX stack | If branded assets require model/texture packaging, approval and versioning. |
| Factor | Example Inputs |
| --- | --- |
| Traffic | Average visits/session count for world/zone. |
| Viewability | Qualified viewable impression rate based on placement geometry/telemetry. |
| Dwell | Average seconds near or engaging with placement. |
| Scarcity | Number of comparable placements and sell-through. |
| Exclusivity | Category-exclusive takeover vs rotating/non-exclusive placement. |
| Seasonality | Major event, tournament, campaign launch, holiday, school season. |
| Integration Depth | Passive billboard vs named venue vs interactive branded challenge. |
| Cross-Channel Bundle | Discount/premium depending inclusion with social, event, iMC or athlete assets. |
| Sprint | Duration | Scope |
| --- | --- | --- |
| Sprint 0 | 2 weeks | Confirm INFINEX runtime, identity model, telemetry volume assumptions, world/placement taxonomy, API contract. |
| Sprint 1 | 2 weeks | World/zone/placement registry, admin screens, inventory mapping. |
| Sprint 2 | 2 weeks | Placement manifest and creative deployment service, signed assets, staging tests. |
| Sprint 3 | 2 weeks | INFINEX client integration: manifest consumption, placement rendering hooks, heartbeat. |
| Sprint 4 | 2 weeks | Telemetry event SDK/service, batch ingestion, raw event storage, de-duplication. |
| Sprint 5 | 2 weeks | Viewability qualification, aggregates, virtual metrics dashboard. |
| Sprint 6 | 2 weeks | Activation builder, start/complete flow, reward trigger integration. |
| Sprint 7 | 2 weeks | Cross-channel campaign dashboard and sponsor activation reporting. |
| Sprint 8 | 2 weeks | Operations console, pause/rollback, anomaly monitoring, load testing. |
| Sprint 9 | 2 weeks | Pilot world launch, sponsor UAT, telemetry validation, pricing calibration, production rollout. |
| Role | Suggested Allocation | Responsibility |
| --- | --- | --- |
| Product Manager | 0.75 FTE | Virtual inventory/business rules, sponsor use cases, UAT. |
| Solution Architect | 0.5 FTE | SponsorX-INFINEX boundary, telemetry, identity and scaling. |
| SponsorX Backend Engineers | 1-2 FTE | Registry, deployments, telemetry APIs, aggregation, rewards. |
| SponsorX Frontend Engineers | 1-2 FTE | Virtual admin, campaign and analytics screens. |
| INFINEX / Game Engine Engineers | 1-2 FTE | Manifest rendering, event instrumentation, activations. |
| Data Engineer | 0.5-1 FTE | Telemetry pipelines, warehouse, cross-channel aggregates. |
| UX/UI / 3D Interaction Designer | 0.5 FTE | Activation UX, placement specs, sponsor workflow. |
| QA Engineer | 1 FTE | Cross-system, event, reward and load testing. |
| DevOps/SRE | 0.5 FTE | Streaming, observability, scaling, incident readiness. |
| 3D Artist / Technical Artist | Fractional-1 FTE | Only if sponsor creative requires custom 3D assets. |
| Budget Scenario | Estimated Phase 4 Budget | Assumption |
| --- | --- | --- |
| Lean single-world pilot | $60,000-$90,000 | Limited placement types, basic telemetry, simple branded challenges. |
| Balanced production integration | $90,000-$150,000 | Multiple zones/placements, operations tooling, robust telemetry and cross-channel analytics. |
| Advanced immersive platform | $150,000-$250,000 | Multiple worlds, rich 3D activations, higher concurrency, advanced virtual commerce and extensive tooling. |
| Phase | Planning Timeline | Balanced Budget | Key Outcome |
| --- | --- | --- | --- |
| Phase 2 | 16-20 weeks | $80K-$120K | Marketplace, athlete/property commerce, payments, payouts, wallet rewards. |
| Phase 3 | 18-22 weeks | $105K-$160K | Pricing/matching intelligence, forecasting, attribution and data platform. |
| Phase 4 | 18-22 weeks | $90K-$150K | INFINEX sponsorship inventory, activations, telemetry and cross-channel reporting. |
| Total sequential | 52-64 weeks | $275K-$430K | Full post-MVP SponsorX expansion. |
| Area | Requirement |
| --- | --- |
| Availability | Target 99.9% for sponsor/portal APIs after marketplace launch; define planned maintenance process. |
| Performance | Common portal APIs p95 < 500 ms excluding external integrations; analytics endpoints may use cached/aggregated data. |
| Event Ingestion | Design for burst traffic; batch endpoints and queue buffering required for INFINEX/social telemetry. |
| Security | MFA for privileged roles, OWASP testing, dependency scanning, secrets rotation, least privilege. |
| Data Integrity | Idempotent payment/reward/event processing; reconciliation jobs; database constraints. |
| Audit | Immutable audit history for financial/admin changes; retain according to policy. |
| Backups | Automated backups, point-in-time recovery where supported, documented restore test. |
| RPO/RTO | Establish formal targets before Phase 2 production; suggested early target RPO <= 1 hour, RTO <= 4 hours. |
| Privacy | Consent tracking, deletion/export workflow, configurable retention, masked PII in logs. |
| Accessibility | Target WCAG 2.1 AA for web portals wherever practical. |
| Testing | Unit, API integration, end-to-end, tenant-isolation, payment/reward idempotency, data reconciliation and load tests. |
| Team | Core Composition |
| --- | --- |
| Core Product | Product Manager, Technical Lead/Architect, UX/UI Designer |
| Application Engineering | 2 Frontend Engineers, 2 Backend Engineers |
| Quality / Platform | QA Automation Engineer, fractional DevOps/SRE |
| Phase 2 Specialists | Payments/Marketplace integration engineer, compliance/legal reviewer |
| Phase 3 Specialists | Data Engineer(s), Data Scientist/Applied ML, attribution/privacy advisor |
| Phase 4 Specialists | INFINEX/game-engine engineer(s), data engineer, 3D/technical artist as needed |
| Gate | Required Condition |
| --- | --- |
| Before Phase 2 Build | Phase 1 stable in production; inventory/campaign/reward models validated; RBAC/tenant model approved. |
| Before Phase 2 Payments | Commission ledger and reconciliation tests pass; legal/marketplace terms approved. |
| Before Phase 3 Intelligence | At least several months of reliable campaign/marketplace data OR agreement to launch rules-based intelligence first. |
| Before Attribution Claims | Partner methodology documented; verified vs estimated labels approved; reconciliation validated. |
| Before Phase 4 Build | INFINEX runtime selected; stable world/placement identifiers; event/identity model approved. |
| Before Sponsor-Facing Virtual Metrics | Pilot telemetry validated; duplication/viewability tests pass; event-lag monitoring operational. |