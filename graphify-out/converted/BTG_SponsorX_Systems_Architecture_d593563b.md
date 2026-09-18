<!-- converted from BTG_SponsorX_Systems_Architecture.docx -->





BTG SPORTS GROUP
SponsorX
SYSTEMS ARCHITECTURE
Marketing Landing Page  +  Phase 1 Platform  +  Sponsor / Athlete / Admin Dashboards






Document:  Systems Architecture Specification
Scope:  Phase 1 — Managed Micro-NIL Athlete Network & Marketplace
Version:  Draft 0.1
Date:  September 2026
Status:  For review — architecture only, not an implementation plan
Prepared for:  BTG Sports Group / iCARRe Solutions

# Contents
1. Introduction & Scope
2. Architectural Goals & Principles
3. System Context (Who & What Connects)
4. High-Level Architecture (Containers)
5. Application Architecture
6. Multi-Tenancy & Role-Based Access
7. Data Architecture
8. Authentication & Authorization
9. Core Workflows & State Machines
10. Integration Architecture
11. Analytics & Reporting Architecture
12. API Architecture
13. Security & Compliance Architecture
14. Marketing / Landing Page Architecture
15. Infrastructure, Environments & Deployment
16. Observability & Operations
17. Non-Functional Requirements
18. Phase-Forward Compatibility (Phases 2-4)
19. Key Architectural Decisions & Risks
20. Appendices

# 1. Introduction & Scope
## 1.1 Purpose
This document defines the end-to-end systems architecture for BTG SponsorX Phase 1. It describes how the public marketing site, the shared backend and data platform, and the three role-based dashboards (Sponsor, Athlete, Admin) fit together as one coherent, multi-tenant, API-first system. It is a technical architecture reference — it deliberately does not schedule work or prescribe an implementation sequence. Those belong to a later implementation plan.
## 1.2 In Scope
- Public marketing / network landing site with sponsor and athlete lead capture.
- Authentication, multi-tenancy, and role-based access control (RBAC) foundation.
- Sponsor Dashboard (ad-manager experience): marketplace, campaigns, analytics, rewards/leads, billing references.
- Athlete Portal: application, profile, NIL rate card, campaign invitations, deliverables, earnings status.
- Admin Portal (BTG command center): athlete approvals, matching, content approvals, rewards, finance status, reports.
- Campaign engine: briefs, athlete matching, campaign orders, deliverables, content approval.
- QR / reward funnel: reward creation, fan claim capture, redemption tracking.
- Tracking links and metric ingestion (verified-manual and API-ready) with data-quality labels.
- Earnings and payout-status tracking (status only; no money movement in Phase 1).
- Sponsor ROI reporting and Zoho CRM synchronization.
## 1.3 Out of Scope (Deferred to Later Phases)

The architecture anticipates these phases through stable seams and data contracts (Section 18) so that Phase 1 does not have to be re-designed to accommodate them.
## 1.4 Reference Documents
- BTG SponsorX Master Development Blueprint v2.0 (Integrated Athlete Network).
- BTG SponsorX Phases 2-4 Detailed Developer Specifications.
- Founder Strategy Note (“My View”).
- BTG SponsorX UI/UX Mockups v1.0 (12 core screens, dark + light themes) — treated as visual reference, not binding source of truth.
- SponsorX Prelaunch Operations Binder (24-document operations system).
- Partner School Execution Plan & Youth Content Media Academy Workbook.

# 2. Architectural Goals & Principles


# 3. System Context (Who & What Connects)
At the highest level, SponsorX sits between four human audiences and a set of external systems.

## 3.1 Human Actors

## 3.2 External Systems


# 4. High-Level Architecture (Containers)
SponsorX is delivered as a small number of deployable units around a shared backend and database. The marketing site is separated from the authenticated application for performance, SEO, and blast-radius isolation; both talk to the same API.


Confirmed stack: TypeScript across the whole system — Next.js on the frontend, Node.js + Express.js on the backend, Prisma over PostgreSQL, Redis for cache and the background job queue, and MinIO (self-hosted, S3-compatible) for private object storage. A single language across frontend and backend keeps a small team fast and lets frontend and backend share types.

# 5. Application Architecture
## 5.1 Frontend
A monorepo holds three deliverables that share one design system:

Why one app shell for three portals: the portals share auth, layout, tables, charts, and most primitives. A single shell with role-aware routing avoids triplicating that surface while still giving each role a distinct navigation, theme accent, and permitted feature set.
## 5.2 Backend Domain Modules
The backend is a single Node.js + Express.js deployable organized as a modular monolith: each domain is a self-contained feature folder (router + service + repository) that owns its tables, exposes a service interface, and communicates with other modules through those interfaces rather than reaching into each other's tables. Express provides the HTTP layer; the discipline that keeps the monolith clean — and makes later extraction into services cheap — comes from these module boundaries, not from the framework.

## 5.3 Layering Inside a Module


# 6. Multi-Tenancy & Role-Based Access
## 6.1 Tenancy Model
Phase 1 uses a shared database with a mandatory tenant_id on every tenant-owned table (pooled multi-tenancy). A central access layer injects the caller's tenant into every query so application code cannot accidentally read across tenants. This is the lowest-friction model for a small operator today and scales to many organizations later without schema changes. Row-Level Security in PostgreSQL can be layered on as defense in depth.

## 6.2 Role Catalogue

Authorization is centrally enforced: (1) is the caller authenticated? (2) does the record belong to their tenant? (3) does their role grant the action on this resource? All three checks run before any handler logic.

# 7. Data Architecture
## 7.1 Core Entities by Domain

## 7.2 Key Relationships (simplified ERD)

## 7.3 Data Classification & Handling

## 7.4 Metric Provenance
Every metric row records a data-quality label so dashboards and reports never present self-reported numbers as verified. Labels: VERIFIED_API, VERIFIED_MANUAL, SELF_REPORTED, ESTIMATED, ATTRIBUTED. This is a core data-integrity requirement, not a display nicety, given that Phase 1 metrics are largely manual.

# 8. Authentication & Authorization



# 9. Core Workflows & State Machines
## 9.1 The Campaign Operating Loop (the heart of Phase 1)

## 9.2 State Machines

State transitions are enforced in the owning module's service layer and written to the audit log. Invalid transitions are rejected at the domain boundary, not merely hidden in the UI.
## 9.3 QR / Reward Funnel


# 10. Integration Architecture
## 10.1 Zoho CRM
SponsorX remains system of record for the athlete network, inventory, campaign orders, deliverables and performance. Zoho remains system of record for the sales relationship and pipeline. Synchronization is asynchronous, queued, retried, and keyed on external IDs to prevent duplicates.

## 10.2 Integration Patterns
- Transactional outbox: domain writes and 'to-be-synced' events commit in the same transaction; a worker drains the outbox.
- Idempotency: every outbound sync carries an idempotency key so retries never double-write.
- Webhook deliveries: inbound Zoho/webhook events are recorded, verified, and processed off the request path.
- Backoff & dead-letter: failed jobs retry with backoff, then land in a dead-letter queue with an admin alert.
- Email/SMS: all transactional messages (invitations, approvals, reward confirmations, alerts) go through the queue.

# 11. Analytics & Reporting Architecture
Phase 1 analytics run on PostgreSQL: raw metric events are captured, then rolled up into aggregates for fast dashboard reads. A dedicated warehouse is deferred to Phase 3.


The Sponsor ROI report separates media value, engagement, leads, redemptions and attributable revenue rather than collapsing everything into a single 'ROI' figure, and stamps each with its provenance label.

# 12. API Architecture

## 12.1 Representative Phase 1 Endpoints


# 13. Security & Compliance Architecture
- RBAC and tenant scoping enforced on every protected record (central guard, not per-screen).
- MFA for privileged Admin and Finance roles in production.
- Encryption in transit (TLS everywhere) and at rest (database and object storage).
- No raw payment card or bank credentials stored; payout/invoice references only.
- Signed, private object storage for agreements and creative assets with time-limited URLs.
- Consent and version tracking for fan marketing and athlete agreements (who signed what, when, which version).
- Guardian / authorized-representative workflow for minors, gating sensitive actions.
- Category conflict and restriction checks before an athlete is invited to a campaign.
- Immutable audit logs for pricing, agreement, campaign, payout and permission changes.
- Separation of verified / self-reported / estimated / attributed metrics end-to-end.
- Secrets in a managed secret store; least-privilege service accounts; dependency and image scanning.
Compliance gates that block launch (per the blueprint) are treated as architectural requirements: approved agreement templates, an approved minor/guardian compliance checklist, a defined privacy/consent model, and legal review of reward/sweepstakes terms. These shape product surface, not just paperwork.
Flagged risk areas that this architecture must keep visible (see Section 19): the honesty of manual metrics, the PII surface created by QR reward claims, minors/guardian handling, and drift between SponsorX and Zoho.

# 14. Marketing / Landing Page Architecture
The public site is a separate, server-rendered application for SEO, speed, and isolation. Its job is to explain the network, convert sponsors and athletes into leads, and host QR reward landing pages. It shares the design system and talks to the same backend API.

- Lead capture: sponsor and athlete forms POST to the backend, create Lead/Application records, and sync to Zoho.
- SEO & performance: server rendering, image optimization, fast Core Web Vitals; static where possible.
- Consent: fan/lead marketing opt-in captured explicitly and versioned (ties into privacy model).
- Analytics: privacy-respecting web analytics; campaign UTM parameters flow into tracking where relevant.
- Content: launch as coded pages; a lightweight CMS for marketing copy can be added without architectural change.

# 15. Infrastructure, Environments & Deployment
## 15.1 Environments

## 15.2 Deployment Topology (recommended)

## 15.3 CI/CD & Infrastructure-as-Code
- CI on every pull request: lint, type-check, unit + integration tests, build.
- CD to staging on merge; promotion to production is gated/approved.
- Database migrations are versioned and run as part of deploy.
- Infrastructure defined as code so environments are reproducible.
- Automated database backups with tested restore; documented rollback procedure.

# 16. Observability & Operations


# 17. Non-Functional Requirements


# 18. Phase-Forward Compatibility (Phases 2-4)

The guiding rule: nothing in Phase 1 should have to be redesigned to admit later phases; they attach at defined module boundaries and data contracts.

# 19. Key Architectural Decisions & Risks
## 19.1 Decisions

## 19.2 Risks the architecture must keep visible


# 20. Appendices
## Appendix A — Confirmed Technology Stack

MinIO note: because MinIO speaks the S3 API, the same storage code and signed-URL flow work unchanged if BTG later moves buckets to AWS S3 or Cloudflare R2 — no application rewrite required.
## Appendix B — Full Phase 1 Table Catalogue

## Appendix C — NIL Jobs & Sponsor Packages (economic reference)


## Appendix D — Glossary


End of document — Systems Architecture (Draft 0.1). This defines structure only; it does not authorize implementation or schedule work.
| Phase | Deferred capability |
| --- | --- |
| Phase 2 | Self-service transactional marketplace, cart/checkout, payment processing, connected payout accounts, Apple/Google Wallet. |
| Phase 3 | Dynamic CPM pricing engine, algorithmic matching, forecasting, attribution warehouse, ML model registry. |
| Phase 4 | INFINEX virtual sponsorship inventory, world/zone registry, real-time event ingestion at scale. |
| Principle | What it means for the build |
| --- | --- |
| Multi-tenant from day one | Every record is scoped to a tenant. BTG is the first operator, but the schema and access layer never assume a single organization. |
| API-first | Every capability is exposed through a versioned REST API. The web apps are clients of that API; nothing bypasses it. |
| Modular monolith, service-ready | One deployable backend organized into strongly-bounded domain modules. Modules can later be extracted into services without rewriting callers. |
| RBAC and tenant scope on every protected record | Authorization is enforced centrally, not per-screen. No endpoint returns data outside the caller's tenant and role. |
| Honest measurement | Every metric carries a data-quality label (verified-API / verified-manual / self-reported / estimated / attributed). The UI never hides provenance. |
| Privacy & minors by design | Guardian authorization, consent capture, and PII minimization are first-class product surfaces, not afterthoughts. |
| Phase-forward compatibility | Inventory, campaign, reward, and metric models are shaped now so marketplace, intelligence, and INFINEX plug in later. |
| Auditability | Pricing, agreements, approvals, payouts, and permission changes are recorded in an immutable audit log. |
| Boring, proven technology | Managed services over bespoke infrastructure; a single primary language across the stack to reduce team friction. |
| +---------------------------------------------------+
                    |                   B T G   S p o n s o r X          |
   SPONSORS  <----> |   (Marketing Site + API Platform + 3 Dashboards)  | <----> ZOHO CRM
                    |                                                   |        (sales pipeline,
   ATHLETES  <----> |   multi-tenant  |  RBAC  |  API-first             |         accounts, deals)
   & GUARDIANS      |                                                   |
                    |                                                   | <----> EMAIL / SMS
   BTG STAFF <----> |                                                   |        (transactional)
   (admin/sales/    |                                                   |
    finance/campaign)                                                   | <----> OBJECT STORAGE
                    |                                                   |        (agreements, creative)
   FANS      <----> |   (QR landing pages, reward claims)               |
                    +---------------------------------------------------+
                          |                    |                  |
                          v                    v                  v
                 SOCIAL PLATFORMS      PAYMENT REFERENCE     INFINEX (Phase 4)
                 (metric source,       (invoice/payout       (virtual inventory,
                  API-ready)            status only)          anticipated contract) |
| --- |
| Actor | Portal / surface | Primary purpose |
| --- | --- | --- |
| Sponsor Admin | Sponsor Dashboard | Browse packages, request campaigns, approve content, view ROI and leads, billing refs. |
| Sponsor Analyst | Sponsor Dashboard (read-only) | View analytics and reports only. |
| Athlete / Content Partner | Athlete Portal | Apply, build profile & rates, accept invitations/orders, upload deliverables, track earnings. |
| Guardian / Authorized Rep | Guardian view | Review and authorize eligible activity for a minor athlete. |
| BTG Admin | Admin Portal | Full operational control across athletes, sponsors, campaigns, rewards, reports. |
| Sales Manager | Admin Portal | Leads, sponsor accounts, packages, proposals, renewal pipeline. |
| Campaign Manager | Admin Portal | Briefs, matching, campaign orders, deliverables, approvals, reports. |
| Athlete Network Manager | Admin Portal | Application review, scoring, tier, compliance checklist, status. |
| Finance User | Admin Portal | Earnings eligibility, payout status, invoice references, reconciliation. |
| Super Admin | Platform console | All tenants, configuration, integrations, feature flags, overrides. |
| Fan | Public QR landing page | Scan, claim a reward, consent to marketing (opted-in lead). |
| System | Role | Direction |
| --- | --- | --- |
| Zoho CRM | System of record for sales relationship & pipeline | Bi-directional (external IDs) |
| Transactional Email / SMS | Invitations, approvals, reward confirmations, alerts | Outbound |
| Object Storage (MinIO, S3-compatible) | Signed private storage for agreements & creative assets | Read/write via signed URLs |
| Social / video platforms | Metric source (manual now, API-ready later) | Inbound (Phase 3 automation) |
| Payment / accounting reference | Invoice & payout status references only in Phase 1 | Reference only |
| INFINEX runtime | Virtual inventory & event ingestion | Deferred (Phase 4 contract anticipated) |
| BROWSERS / MOBILE WEB (responsive)
        |                         |
        v                         v
  +-----------------+     +--------------------------+          CDN / EDGE
  | MARKETING SITE  |     |  APPLICATION SHELL (SPA) |   <----  static assets, images,
  | (Next.js, SSR)  |     |  Sponsor | Athlete | Admin|          QR landing pages
  | public + SEO    |     |  role-aware routing      |
  +--------+--------+     +-------------+------------+
           |                           |
           |   HTTPS / REST (JSON)      |   HTTPS / REST + JWT
           v                           v
  +-------------------------------------------------------------+
  |                    API GATEWAY / EDGE                        |
  |         auth, rate-limit, request logging, versioning        |
  +-------------------------------+-----------------------------+
                                  |
                                  v
  +-------------------------------------------------------------+
  |            SPONSORX BACKEND  (modular monolith)             |
  |                                                             |
  |  Identity  Athlete   Sponsor   Campaign   Rewards   Finance |
  |  & RBAC    Network   & CRM     Engine     & QR      &       |
  |            Module    Module    Module     Module    Earnings|
  |                                                             |
  |  Analytics   Content/Assets   Integration   Audit &         |
  |  Module      Module           (Zoho/email)  Notifications   |
  +----+-------------------+----------------+-------------------+
       |                   |                |
       v                   v                v
  +---------+        +-----------+     +------------------+
  | Postgres|        |  Redis    |     | Object Storage   |
  | (primary|        | cache +   |     | (S3-compatible,  |
  |  data)  |        | job queue |     |  signed URLs)    |
  +---------+        +-----+-----+     +------------------+
                           |
                           v
                  +--------------------+
                  | BACKGROUND WORKERS |  Zoho sync, email/SMS, metric
                  | (queue consumers)  |  aggregation, report generation
                  +--------------------+ |
| --- |
| Container | Responsibility | Recommended technology |
| --- | --- | --- |
| Marketing Site | Public pages, SEO, sponsor/athlete lead capture, QR landing pages | Next.js (App Router), SSR/SSG |
| Application Shell | The three authenticated portals with role-aware routing | Next.js / React / TypeScript |
| Design System | Shared UI components, tokens (colors, type), charts | Internal package (Tailwind + component lib) |
| API Gateway/Edge | TLS, auth verification, rate limiting, request logs | Platform edge / reverse proxy |
| Backend (monolith) | All domain logic behind versioned REST API | Node.js + Express.js (TypeScript) |
| ORM / data access | Typed, migration-driven data layer | Prisma |
| Primary Database | Transactional system of record | PostgreSQL |
| Cache + Queue | Sessions/cache + durable background jobs | Redis (+ BullMQ job queue) |
| Object Storage | Private agreements & creative assets | MinIO (S3-compatible) + signed URLs |
| Background Workers | Async integration, aggregation, reporting | Queue consumers (same codebase) |
| Package / app | Contents |
| --- | --- |
| apps/marketing | Public landing site: Home, For Sponsors, For Athletes, How It Works, About, Login CTA, QR landing pages. Server-rendered for SEO and speed. |
| apps/app | Authenticated application shell. One codebase; role-aware routing renders the Sponsor, Athlete, or Admin experience based on the user's role and tenant. |
| packages/design-system | Design tokens (brand colors #6D34FF / #0E1016, Poppins type scale), buttons, inputs, cards, tables, chart primitives, layout shells. The single source of visual truth. |
| packages/api-client | Typed client generated from the backend OpenAPI spec, so the frontend and backend never disagree on shapes. |
| Module | Owns | Key responsibilities |
| --- | --- | --- |
| Identity & Access | tenants, users, roles, sessions | Auth, RBAC, tenant scoping, guardian linkage, MFA. |
| Athlete Network | athletes, applications, social, capabilities, scores, rates | Onboarding, approval workflow, Content Value Score, rate cards, tier. |
| Sponsor & CRM | sponsors, contacts, leads, packages | Sponsor master data, package catalog, lead intake, Zoho linkage. |
| Campaign Engine | briefs, campaigns, campaign_athletes, campaign_orders, deliverables | Matching, invitations, orders, deliverable lifecycle, approvals. |
| Content & Assets | creative_assets, agreements | Draft/final versioning, approval routing, signed storage, agreement refs. |
| Rewards & QR | rewards, qr_codes, reward_claims, redemptions, tracking_links | Reward creation, fan claim capture, redemption events, unique tracking. |
| Analytics | metric_events, metric_aggregates | Event capture, aggregation, data-quality labeling, dashboard queries. |
| Finance & Earnings | earnings, payouts | Earnings eligibility/status, payout references, reconciliation. |
| Integration | integration_connections, webhook_deliveries | Zoho sync, email/SMS dispatch, outbox, retries, idempotency. |
| Audit & Notifications | audit_logs, notifications | Immutable change history, in-app/email alerts. |
| HTTP Controller  ->  Service (business rules)  ->  Repository (data access)  ->  Postgres
        |                     |                              |
     validates            enforces RBAC +               tenant-scoped
     input / DTO          state machines +              queries only
                          emits domain events
                                |
                                v
                        Job Queue (async: Zoho sync, email, aggregation) |
| --- |
| TENANT (BTG Sports Group)
     |
     +-- Users (staff)  --- Roles (Admin, Sales, Campaign, Network, Finance)
     +-- Sponsors       --- Sponsor Users (Admin, Analyst)
     +-- Properties     --- Athletes --- Guardians
     +-- Campaigns / Orders / Deliverables / Rewards / Earnings
   (A future tenant, e.g. a partner league, is a sibling of BTG with the same shape.) |
| --- |
| Role | Domain | Primary permissions |
| --- | --- | --- |
| Super Admin | Platform | All tenants, configuration, integrations, feature flags, overrides. |
| BTG Admin | BTG | Sponsors, athletes, properties, inventory, jobs, campaigns, rewards, reports, users. |
| Sales Manager | BTG | Leads, sponsor accounts, packages, opportunities, proposals, renewals. |
| Campaign Manager | BTG | Briefs, matching, orders, deliverables, approvals, reports. |
| Athlete Network Manager | BTG | Recruitment, onboarding review, scoring, status, compliance. |
| Finance User | BTG | Earnings, payout status, invoice references, reconciliation. |
| Athlete / Content Partner | Athlete | Own profile, rates, offers, orders, deliverables, earnings. |
| Guardian / Authorized Rep | Athlete | Review/approve eligible activity for a linked minor. |
| Sponsor Admin | Sponsor | Campaigns, briefs, approvals, reports, billing references. |
| Sponsor Analyst | Sponsor | Read-only analytics/reports. |
| API Service Account | System | Scoped machine access for integrations. |
| Domain | Primary tables |
| --- | --- |
| Identity | tenants, users, roles, user_roles, guardians_authorized_reps |
| Athlete Network | properties, athletes, athlete_applications, athlete_social_accounts, athlete_content_capabilities, athlete_brand_preferences, athlete_scores, athlete_rates |
| Sponsor & Catalog | sponsors, sponsor_contacts, sponsor_packages, nil_jobs, leads |
| Agreements | agreements (type/version/signature reference) |
| Campaign | campaign_briefs, campaigns, campaign_athletes, campaign_orders, deliverables |
| Content | creative_assets |
| Tracking & Rewards | tracking_links, rewards, qr_codes, reward_claims, redemptions |
| Metrics | metric_events, metric_aggregates |
| Finance | earnings, payouts |
| Platform | audit_logs, integration_connections, webhook_deliveries, notifications |
| tenant 1---* user 1---* user_role *---1 role
  tenant 1---* property 1---* athlete 1---* athlete_social_account
                              athlete 1---* athlete_rate  (per nil_job, versioned)
                              athlete 1---* athlete_score (history)
                              athlete 1---1 guardian (if minor)
  sponsor 1---* sponsor_contact
  campaign_brief 1---1 campaign 1---* campaign_athlete 1---1 campaign_order
                                        campaign_athlete 1---* deliverable 1---* creative_asset
                                        deliverable 1---1 tracking_link
  campaign 1---* reward 1---* qr_code 1---* reward_claim 1---* redemption
  campaign_order 1---1 earning 1---1 payout(ref)
  * metric_event and audit_log reference their source entity + tenant * |
| --- |
| Class | Examples | Handling |
| --- | --- | --- |
| Sensitive PII (minors) | Athlete DOB/age-band, guardian identity | Access-restricted; guardian workflow; minimized; audited. |
| Fan PII | Reward claim name/email/phone/ZIP | Consent-gated; purpose-limited; sponsor receives only permitted fields. |
| Financial reference | Payout recipient status, invoice refs | No raw bank/card numbers stored; references only. |
| Agreements & creative | Signed docs, draft/final media | Private object storage, signed URLs, version tracked. |
| Operational | Campaigns, metrics, scores | Tenant-scoped; standard access controls. |
| Concern | Phase 1 approach |
| --- | --- |
| Authentication | Email/password to start; provider-managed OIDC preferred for production. Role-aware routing after login. |
| Sessions | Short-lived access token (JWT) + refresh token; tenant and role claims embedded. |
| MFA | Required for privileged Admin and Finance roles in production. |
| Guardian linkage | A minor athlete account is linked to a guardian account; sensitive actions require guardian authorization. |
| Service accounts | Scoped machine credentials for Zoho/email/analytics integrations. |
| Authorization | Central RBAC + tenant-scope guard applied to every protected endpoint (see Section 6.2). |
| Login  ->  verify credentials  ->  issue access+refresh (tenant, role claims)
        ->  route to portal by role  ->  every API call: verify token
        ->  enforce (tenant match) AND (role permits action)  ->  handler |
| --- |
| SPONSOR      ADMIN / CAMPAIGN MGR        ATHLETE            FAN            FINANCE
   |  request brief   |                     |                 |               |
   |----------------->| create brief        |                 |               |
   |                  | filter eligible     |                 |               |
   |                  | athletes (sport,    |                 |               |
   |                  | geo, restrictions)  |                 |               |
   |                  | send invitations -->|                 |               |
   |                  |                     | accept + sign   |               |
   |                  |   campaign order -->| campaign order  |               |
   |                  | auto-create         | upload draft    |               |
   |                  | deliverables    <---|                 |               |
   |  approve content | BTG review -> (opt) |                 |               |
   |<---------------->| sponsor review      |                 |               |
   |                  | publish + attach    | published +     |               |
   |                  | tracking link/QR    | tracking code   |               |
   |                  |                     |            scan/claim/redeem     |
   |                  | close deliverables  |                 |   mark earnings|
   |                  |------------------------------------------- eligible -->|
   |  ROI report  <---| generate report     |                 |               |
   |  renewal     <-->| Zoho renewal opp    |                 |               | |
| --- |
| Entity | States |
| --- | --- |
| Athlete Application | DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED / CHANGES_REQUESTED / REJECTED -> ACTIVE / SUSPENDED |
| Campaign Brief | DRAFT -> QUALIFIED -> APPROVED -> CAMPAIGN_CREATED -> CLOSED |
| Athlete Invitation | INVITED -> VIEWED -> ACCEPTED / DECLINED / EXPIRED |
| Campaign Order | DRAFT -> SENT -> ACCEPTED / REJECTED -> ACTIVE -> COMPLETED / CANCELLED |
| Deliverable | NOT_STARTED -> DRAFT_SUBMITTED -> BTG_REVIEW -> SPONSOR_REVIEW -> APPROVED -> PUBLISHED -> VERIFIED |
| Campaign | DRAFT -> STAFFING -> APPROVAL -> ACTIVE -> REPORTING -> COMPLETED / CANCELLED |
| Earnings | PENDING -> ELIGIBLE -> APPROVED_FOR_PAYOUT -> PAID / HELD / DISPUTED |
| Reward | DRAFT -> ACTIVE -> PAUSED -> EXPIRED / ARCHIVED |
| Campaign -> Reward (per athlete/campaign unique code) -> Fan Landing Page
      -> Consent + Claim (name/email/phone/ZIP) -> Coupon/Token issued
      -> Redemption (staff/merchant validation)
  Each of SCAN, LANDING_VIEW, CLAIM, REDEMPTION is stored as a SEPARATE event,
  enabling a true funnel and per-athlete performance comparison. |
| --- |
| SponsorX object | Zoho target | Direction |
| --- | --- | --- |
| Sponsor | Accounts | Bi-directional |
| Sponsor Contact | Contacts | Bi-directional |
| Lead | Leads | SponsorX -> Zoho |
| Opportunity | Deals | Bi-directional |
| Campaign | Custom module / Campaigns | SponsorX -> Zoho |
| Athlete / Content Partner | Custom module | SponsorX -> Zoho |
| Task | Activities / Tasks | Bi-directional |
| Invoice / Payment reference | Finance fields | Zoho -> SponsorX |
| Renewal | Deals | SponsorX -> Zoho |
| metric_event (raw, labeled)  ->  aggregation worker  ->  metric_aggregate
        |                                                      |
   scan/claim/redeem,                                    per-athlete, per-campaign,
   view/engagement,                                      per-sponsor rollups
   API/manual entry
        |                                                      |
        +----------------->  Dashboard queries  <--------------+
                                   |
                     Sponsor ROI report generator (PDF/data export) |
| --- |
| Layer | Phase 1 metrics |
| --- | --- |
| Athlete | Audience snapshot, views, engagement, clicks, claims, redemptions, reliability, revision rate, on-time rate. |
| Campaign | Spend/value, athlete count, deliverables, impressions, engagement, QR funnel, delivered vs planned. |
| Sponsor | Spend, cost per view/engagement/claim, repeat rate, renewal pipeline, attributed revenue (labeled). |
| Network | Active athletes, applications, participation rate, total earnings, average job pay, utilization. |
| Marketplace learning | Implied CPM, average sell price by job, margin by package, package performance. |
| Convention | Decision |
| --- | --- |
| Style | Versioned REST over HTTPS, JSON payloads. |
| Versioning | URI prefix /v1; additive changes preferred, breaking changes bump the version. |
| Auth | Bearer access token; tenant & role claims; service accounts for machine callers. |
| Contracts | OpenAPI/Swagger is the source of truth; the typed frontend client is generated from it. |
| Pagination/filtering | Cursor or page/limit with consistent filter and sort parameters. |
| Errors | Uniform error envelope (code, message, details) with correlation IDs. |
| Rate limiting & logging | Applied at the gateway; every request carries a correlation ID for tracing. |
| Domain | Example endpoints |
| --- | --- |
| Auth | POST /v1/auth/login, /auth/refresh; /v1/users; /v1/roles |
| Athlete Network | POST /v1/athletes/apply; GET /v1/admin/athlete-applications; POST /v1/athletes/{id}/approve; /v1/athletes/{id}/rates |
| Sponsors & Catalog | /v1/sponsors; /v1/sponsors/{id}/contacts; /v1/sponsor-packages; /v1/nil-jobs |
| Campaigns | /v1/campaign-briefs; POST /v1/campaign-briefs/{id}/eligible-athletes; POST /v1/campaigns/{id}/invite-athletes |
| Orders & Deliverables | POST /v1/campaign-orders; POST /v1/campaign-orders/{id}/accept; /v1/deliverables/{id}/approve |
| Rewards | /v1/rewards; /v1/claims; /v1/redemptions |
| Metrics | POST /v1/metrics/events; GET /v1/campaigns/{id}/metrics |
| Integration | /v1/integrations/zoho/sync |
| Page | Purpose / primary CTA |
| --- | --- |
| Home | Explain the athlete network & measurable activation. CTAs: Become a Sponsor, Join Athlete Network, Login. |
| For Sponsors | Packages, guaranteed-view value proposition, proof/case-study slots -> request-a-campaign lead form. |
| For Athletes | Paid opportunity, no-huge-following message, what SponsorX content looks like -> apply form. |
| How It Works | The operating loop explained simply for both audiences. |
| About / Proof | BTG credibility, case studies, pilot results. |
| QR Landing Pages | Per-campaign reward claim pages: offer, consent, claim capture (feeds the reward funnel). |
| Login | Entry to the authenticated application shell. |
| Environment | Purpose |
| --- | --- |
| Local / Dev | Developer machines; seeded data; hot reload. |
| Staging | Production-like; UAT with initial athletes and sponsors; integration sandboxes (Zoho test). |
| Production | Live tenant (BTG); backups, monitoring, MFA enforced. |
| Layer | Recommended hosting |
| --- | --- |
| Marketing site & app shell | Edge/CDN-backed hosting for Next.js (e.g. Vercel or equivalent). |
| Backend + workers | Containerized Node.js/Express service (Docker) on a managed platform (e.g. AWS ECS/Fargate, Fly.io, or Render). |
| Database | Managed PostgreSQL with automated backups & PITR (e.g. RDS, Neon, or Supabase). |
| Cache/queue | Managed Redis (e.g. Upstash or ElastiCache). |
| Object storage | MinIO (S3-compatible), private buckets, signed URLs — self-hosted alongside the backend or on its own node. |
| Secrets | Managed secret store (cloud secrets manager). |
| Concern | Approach |
| --- | --- |
| Structured logging | JSON logs with correlation IDs across gateway, API, and workers. |
| Error tracking | Centralized error monitoring with alerting on new/regressed errors. |
| Metrics & tracing | Service and business metrics (queue depth, sync lag, campaign throughput); request tracing. |
| Health checks | Liveness/readiness endpoints for API and workers; integration health surfaced in Admin. |
| Alerting | On error spikes, failed integrations (Zoho/email), dead-letter growth, and backup failures. |
| Runbooks | Documented procedures for common incidents, deploys, and rollbacks. |
| Attribute | Phase 1 target / intent |
| --- | --- |
| Performance | Dashboard reads served from aggregates; typical API responses well under ~500 ms. |
| Availability | Single-region, managed services with backups; graceful degradation of integrations. |
| Scalability | Stateless backend behind a load balancer; workers scale horizontally; DB read replicas when needed. |
| Security | Meets Section 13; least privilege; encrypted; audited. |
| Maintainability | Bounded modules, one primary language, typed contracts, automated tests. |
| Testability | Each module testable in isolation; tenant-isolation and RBAC tests are mandatory. |
| Accessibility & responsiveness | All screens responsive (desktop/tablet/mobile); accessible components. |
| Data integrity | Metric provenance labels preserved end-to-end; state machines enforced server-side. |
| Future phase | Seam prepared in Phase 1 |
| --- | --- |
| Phase 2 — Marketplace & payments | Sponsor packages, inventory, and campaign orders already model priced inventory; a Marketplace module and payment/payout adapters slot in without reshaping campaigns. Earnings already carry status for real payouts. |
| Phase 3 — Intelligence | Metric events, athlete scores, and implied-CPM capture create the clean history a pricing/matching/forecasting engine needs. Scoring is an interface today, an algorithm later. |
| Phase 4 — INFINEX | Inventory, reward, and metric-event models are shaped to accept virtual placements and interaction events. The anticipated INFINEX world/zone/placement contract maps onto property/inventory/metric concepts already present. |
| Decision | Rationale |
| --- | --- |
| Modular monolith over microservices | Fastest path to a working loop for a small team; clean module seams keep future extraction cheap. |
| Shared-DB multi-tenancy | Lowest operational friction now; scales to many tenants; RLS available as defense in depth. |
| Separate marketing site from app shell | SEO, performance, and blast-radius isolation; both share design system and API. |
| One app shell, three role-aware portals | Avoids triplicating shared UI while giving each role a distinct, permission-bounded experience. |
| TypeScript across the stack (Next.js + Express) | Single language reduces friction; shared types keep frontend/backend in lockstep; large hiring pool. |
| Metric provenance as a first-class field | Protects credibility given Phase 1's manual metrics. |
| Risk | Mitigation in the architecture |
| --- | --- |
| Manual metrics oversold as verified | Mandatory provenance labels; ROI report separates media value / leads / redemptions / attributed revenue. |
| Minors & NIL/eligibility compliance | Guardian workflow, consent/version tracking, restriction checks as core surface and launch gates. |
| Fan PII from QR claims | Consent-gated capture, purpose limitation, sponsors receive only permitted fields, audited. |
| Zoho <-> SponsorX drift | External IDs, outbox + idempotency, clear system-of-record ownership per object. |
| Positioning ambiguity (BTG media vs athlete network) | Inventory model is generic (property/athlete/media) so launch emphasis is a configuration/merchandising choice, not a schema change. |
| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js (React, TypeScript) | Marketing site (SSR/SSG) + authenticated app shell. |
| Styling / UI | Tailwind CSS + shared component library | Design tokens: #6D34FF / #0E1016, Poppins. |
| Charts | React charting library (e.g. Recharts) | Dashboard time series, funnels, stat tiles. |
| Backend | Node.js + Express.js (TypeScript) | Modular monolith; versioned REST API. |
| ORM / data access | Prisma | Migration-driven schema; typed queries; tenant scoping in the data layer. |
| Database | PostgreSQL | Transactional system of record; managed with backups/PITR. |
| Cache / queue | Redis (+ BullMQ) | Session/cache + durable background jobs. |
| Object storage | MinIO (S3-compatible) | Private buckets, signed URLs; self-hosted, same S3 API as later cloud storage. |
| Auth | JWT + refresh (dev); managed OIDC (prod) | RBAC + tenant claims; MFA for privileged roles. |
| Email / SMS | Transactional email + SMS provider | Invitations, approvals, reward confirmations, alerts. |
| Packaging | Docker; monorepo | Reproducible builds; shared design-system & api-client packages. |
| CI/CD | GitHub Actions | Lint, type-check, test, build, migrate, deploy. |
| Observability | Centralized error + structured logging | Correlation IDs across API and workers. |
| Table | Purpose |
| --- | --- |
| tenants | Organization boundary. |
| users / roles / user_roles | Identity and RBAC. |
| sponsors / sponsor_contacts | Brand/customer master data. |
| properties | Athlete/team/event/media parent entity. |
| athletes | Athlete identity and commercial profile. |
| guardians_authorized_reps | Adult approval/relationship metadata. |
| athlete_applications | Network application and review status. |
| athlete_social_accounts | Handle, audience snapshot, verification/source. |
| athlete_content_capabilities | Video/photo/story/appearance flags. |
| athlete_brand_preferences | Interested/restricted categories. |
| athlete_scores | Content Value Score history & factor snapshot. |
| agreements | Agreement type/version/signature reference. |
| nil_jobs | SX-01..SX-07 definitions and base economics. |
| athlete_rates | Athlete-specific rate by job/version. |
| sponsor_packages | Test Drive, Blitz, Community, Takeover, Season Partner. |
| campaign_briefs | Sponsor objectives, targeting, budget, dates, restrictions. |
| campaigns | Campaign header/status/budget/guarantee. |
| campaign_athletes | Athlete assignment/invitation/acceptance. |
| campaign_orders | Commercial terms snapshot per athlete/campaign. |
| deliverables | Due dates, proof, approval, publish URL, status. |
| creative_assets | Draft/final versions and approvals. |
| tracking_links | Unique athlete/campaign URL/UTM/code. |
| metric_events / metric_aggregates | Campaign and athlete performance. |
| rewards / qr_codes / reward_claims / redemptions | Fan reward funnel. |
| earnings | Athlete gross comp, adjustments, eligibility, status. |
| payouts | Payment status/reference (integration later). |
| audit_logs | Critical mutation history. |
| integration_connections / webhook_deliveries | Integration state. |
| notifications | In-app / email alert records. |
| Code | Job | Athlete base | Sponsor sell |
| --- | --- | --- | --- |
| SX-01 | Story Drop | $25-$50 | $75-$125 |
| SX-02 | Sponsored Post | $50-$100 | $125-$250 |
| SX-03 | Athlete Reel | $75-$150 | $200-$400 |
| SX-04 | Product Experience | $125-$250 | $350-$650 |
| SX-05 | Local Appearance | $150-$300 | $400-$750 |
| SX-06 | Content Day | $150-$350 | $500-$1,000+ |
| SX-07 | Monthly Ambassador | $300-$750+ | $750-$2,000+ |
| Package | Sponsor price | Typical inventory |
| --- | --- | --- |
| Test Drive | $750 | 3 athletes, one activation each, basic report |
| Local Blitz | $1,500-$3,000 | 5-10 athletes, short-form + stories |
| 10-Athlete Blitz | ~$2,500 | 10 activations + QR/reward |
| Community Campaign | ~$5,000 | 10-15 athletes + premium + feature + reward |
| Athlete Takeover | ~$10,000 | 15-25 athletes, multi-week + media/event |
| Season Partner | $15K-$30K+ | Recurring content, events, rewards, exclusivity |
| Term | Meaning |
| --- | --- |
| Anchor Athlete | Represented/strategic BTG athlete leading premium campaigns. |
| Content Partner | Non-exclusive micro-NIL collaborator taking optional paid jobs. |
| Campaign Order | Per-athlete commercial contract for a specific campaign; must be accepted before work. |
| Content Value Score | Composite athlete quality score (engagement, quality, reliability, fit, geography). |
| Implied CPM | Cost per thousand impressions computed even when jobs are sold at fixed price, for learning. |
| Data-quality label | Provenance tag on every metric: verified-API / verified-manual / self-reported / estimated / attributed. |
| INFINEX | BTG's Phase 4 virtual world providing virtual sponsorship inventory. |