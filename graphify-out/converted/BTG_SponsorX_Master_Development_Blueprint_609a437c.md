<!-- converted from BTG_SponsorX_Master_Development_Blueprint.docx -->

BTG SPORTS GROUP
SPONSORX
MASTER DEVELOPMENT BLUEPRINT

Developer Handoff Specification

Version 1.0 | August 2026

Purpose: Build BTG-owned sponsorship technology connecting sponsors, athletes, teams, events, media, fan rewards, CRM, analytics, and INFINEX World.

# 1. Executive Summary
BTG SponsorX is a multi-sided sports sponsorship and fan-commerce platform. The initial product will allow BTG Sports Group to package and sell measurable sponsorship inventory across athletes, teams, events, BTG Sports Talk, iMC Network, East Africa activations and, later, INFINEX World. The platform should begin as an internal BTG operating system, then expand into a marketplace and SaaS product that can onboard outside sports properties.
Core operating loop: PROPERTY → INVENTORY → SPONSOR → CAMPAIGN → CONTENT/ACTIVATION → FAN ACTION → REWARD/REDEMPTION → ANALYTICS → RENEWAL.
## Primary Business Objectives
- Standardize sponsorship inventory and pricing across BTG-controlled properties.
- Create a sponsor-facing portal with transparent delivery, impressions, engagement, leads and reward performance.
- Create athlete/team portals for inventory management, approvals, NIL deliverables and payouts.
- Use QR and digital wallet rewards to convert sponsorship exposure into measurable fan actions.
- Sync commercial activity into Zoho CRM for sales pipeline, contracting, invoicing and renewal workflows.
- Create a data model capable of supporting dynamic CPM pricing and sponsor-property matching.
- Expose SponsorX services through APIs so INFINEX World can create and measure virtual sponsorship activations.
- Prepare SponsorX to become a standalone SaaS/marketplace product.
## Success Definition for Phase 1

# 2. Product Principles
- Build API-first. Every major capability should be available to the web app and later INFINEX clients through authenticated services.
- Start with measurable sponsorship delivery, not complex financial attribution.
- Use third-party payment/onboarding rails rather than building regulated payment infrastructure.
- Keep Zoho as BTG's operational CRM; SponsorX owns sponsorship-domain logic and sponsor-facing experiences.
- Design multi-tenant from the start even if Phase 1 only serves BTG.
- Separate projected metrics from verified delivered metrics.
- Every sponsor deliverable should have an owner, status, due date, proof-of-delivery artifact and measurable result.
# 3. User Roles & Permissions

## Permission Model
Implement RBAC plus tenant scoping. Every protected record must include tenant_id or be related to a tenant-owned entity. Sensitive actions require explicit permissions rather than relying only on role names.
- Examples: campaign.publish, inventory.price.override, reward.redeem.override, payout.approve, integration.manage, user.invite.
- All administrative mutations should write an audit_log record containing user, action, entity, timestamp, before/after snapshot or diff, and IP/device metadata where practical.
# 4. Core 12-Screen Product Specification
## 1. SponsorX Public Homepage
Public marketing page explaining SponsorX, featured inventory, case studies, sponsor CTA, property CTA and login. Required actions: browse featured opportunities, request access, sponsor inquiry.
## 2. Authentication / Sponsor Login
Email/password and SSO-ready authentication; forgot password; MFA-ready; role-aware redirect; tenant selection for users belonging to multiple organizations.
## 3. Sponsor Dashboard
Campaign status, spend, guaranteed vs delivered views, engagements, QR scans, claims, redemptions, attributable revenue where available, tasks, renewals and invoices.
## 4. Sponsorship Marketplace
Search/filter inventory by sport, geography, property type, audience, price, CPM, date, channel and exclusivity. Cards must show availability, projected reach, price model and CTA.
## 5. Property Profile
Team/event/show/program profile including audience summary, geography, channels, historical performance, available inventory, brand-safety notes, media gallery and campaign history.
## 6. Athlete Profile
Athlete commercial profile: sport, team/school, geography, audience, social channels, engagement, NIL categories, restrictions, rate card, availability, portfolio and approvals.
## 7. Inventory Listing Detail
Specific sellable unit: title, property, category, quantity, exclusivity, channels, deliverables, projected reach, CPM/fixed price, floor price, dates, proof requirements, rights, make-good rules.
## 8. Campaign Builder
Select sponsor, inventory, dates, objective, audience, creative, reward, tracking parameters, budget and approval workflow. Generate campaign plan and send for approval.
## 9. Campaign Performance Dashboard
Timeline of deliverables plus verified metrics by asset/channel, guaranteed delivery progress, QR funnel, spend, media value, issues, make-goods and downloadable report.
## 10. QR / Reward Creator
Create offer, eligibility, claim form, consent language, code type, expiration, redemption limit, sponsor funding, location restrictions, wallet option and QR creative.
## 11. Fan / Reward Analytics
Scans, unique visitors, claim rate, opt-ins, redemption rate, geography, device, campaign source, offer performance and cohort export subject to permissions/consent.
## 12. Sponsor ROI Report
Executive report: campaign objective, spend, delivery, media metrics, engagement, lead/reward funnel, redemptions, attributed revenue if verified, return on spend, highlights and next recommendation.
## Additional Portals Required Beyond the 12 Screens
- Athlete Portal: profile, inventory, tasks, approval queue, campaign calendar, content upload, earnings/payout status.
- Property Portal: roster, inventory, event calendar, campaigns, proofs, analytics and revenue share.
- BTG Admin Portal: global search, sponsor/property management, pricing overrides, campaign QA, rewards, integrations, payouts, reports and system settings.
# 5. End-to-End Business Workflows
## Sponsor Purchase Workflow
- Sponsor creates account or is invited by BTG.
- Sponsor browses inventory or receives a private proposal link.
- Sponsor selects inventory and requests/reserves campaign.
- BTG reviews pricing, category conflicts, dates and exclusivity.
- Agreement/proposal is approved; opportunity syncs to Zoho.
- Campaign record is created with deliverables and tracking plan.
- Creative is uploaded and approved.
- Campaign launches; content/events/virtual activations generate measurements.
- Sponsor dashboard updates against guarantee.
- If under-delivered, system proposes make-good inventory.
- Campaign closes and Sponsor ROI Report is issued.
- Renewal opportunity is created automatically in Zoho.
## Athlete NIL Workflow
- Athlete/property profile created and ownership/representation permissions recorded.
- Approved inventory and category restrictions are configured.
- Sponsor selects athlete inventory or BTG assigns athlete to campaign.
- Athlete/guardian approval is captured where required.
- Deliverables are scheduled with due dates and briefing.
- Athlete uploads proof/content; campaign manager approves.
- Published URLs/assets are attached and performance metrics ingested.
- Revenue share/commission is calculated from configured contract rules.
- Payout status is tracked; finance approval and payment are externalized to payment provider/accounting.
# 6. Sponsor Marketplace Specification

## Marketplace States
DRAFT → REVIEW → AVAILABLE → RESERVED → CONTRACTED → ACTIVE → SOLD_OUT / EXPIRED → ARCHIVED
## Inventory Required Fields
- title, description, property_id, inventory_type, category, channels
- available_start, available_end, quantity, exclusivity_type, conflict_categories
- pricing_model, list_price, minimum_price, base_cpm, projected_impressions
- deliverables JSON, audience snapshot, geography, rights/usage terms
- approval_required, make_good_policy, sponsor_visibility, status
# 7. CPM & Pricing Algorithm
SponsorX should calculate a Recommended CPM but allow authorized BTG staff to override it. The algorithm must store each component so the recommendation is explainable.
Recommended CPM = Base CPM × Engagement Multiplier × Audience Quality × Geo Value × Format Value × Exclusivity × Demand × Performance Confidence

Example: $12 × 1.20 × 1.15 × 1.20 × 1.10 × 1.10 × 1.05 = approximately $25.28 CPM.
## Price Calculation Rules
- CPM campaign price = (Guaranteed Impressions / 1,000) × Recommended CPM.
- Fixed-price inventory may still display an implied CPM for comparison.
- Minimum sell price should be enforced unless an authorized override is logged.
- Packages may contain both guaranteed media and non-guaranteed experiential assets.
- Projected impressions and delivered impressions must be stored separately.
- If delivered impressions fall below guarantee after campaign end, create make_good_balance = guaranteed - delivered.
# 8. QR Reward & Fan Commerce Engine
## Phase 1 Reward Flow
QR → campaign landing page → fan consent/claim → unique reward token/code → optional email/SMS delivery → merchant redemption or staff validation → event logged → analytics.
## Required Reward Types
- Single-use coupon code
- Reusable campaign code with per-user claim record
- Event check-in reward
- Sweepstakes/lead capture reward
- Wallet pass reward
- Partner API-issued reward
## Reward Rules
- start/end time; claim limit; per-user limit; geographic/merchant eligibility; sponsor; campaign; value/discount; terms; redemption method.
- Every generated token must be unique or cryptographically unguessable when it confers value.
- Store scan, visit, claim and redemption as separate events to preserve funnel analytics.
- Consent records must store policy/version, timestamp, channel and user choice.
- Do not equate a QR scan with a redemption or purchase.
- Wallet passes are optional distribution containers; payment attribution is a separate capability.
Google Wallet supports offer/pass issuance through classes and objects using REST APIs. Apple Wallet supports signed passes and server-side update flows. Use these in a later reward phase after the basic coupon/QR funnel is stable.
# 9. Zoho CRM Integration
SponsorX should remain system-of-record for sponsorship inventory/campaign delivery. Zoho remains system-of-record for BTG sales relationship management unless otherwise decided.

## Integration Requirements
- OAuth-based server-to-server integration where supported; credentials stored in secrets manager.
- Event queue for retries; no direct synchronous dependency that can break campaign operations if Zoho is unavailable.
- External IDs on both systems to prevent duplicate records.
- Idempotent sync handlers.
- Field mapping configuration in admin settings.
- Conflict policy: SponsorX wins for campaign delivery fields; Zoho wins for CRM-only notes/stages unless explicitly mapped.
# 10. API Architecture
Recommended style: REST/JSON for external and web clients, webhooks for events, background workers for synchronization and analytics ingestion. GraphQL can be considered later but is not required for MVP.

## Webhook Events
- sponsor.created / sponsor.updated
- inventory.published / inventory.reserved / inventory.sold
- campaign.created / approved / launched / completed
- deliverable.published / deliverable.verified
- reward.scanned / reward.claimed / reward.redeemed
- metric.ingested / guarantee.at_risk
- invoice.status_changed / payout.status_changed
- infinex.activation_started / infinex.impression / infinex.interaction
# 11. Database Schema
Use PostgreSQL or an equivalent relational database. JSONB may store flexible deliverable/audience metadata, but financial, identity and measurement fields should remain normalized.

# 12. Analytics & Measurement
## Core Metrics

## Data Quality Flags
- VERIFIED_API - collected from an authenticated platform/partner API.
- VERIFIED_MANUAL - reviewed proof entered by BTG staff.
- SELF_REPORTED - supplied by athlete/property.
- ESTIMATED - modeled value, never presented as verified.
- ATTRIBUTED - purchase tied to campaign through a defined attribution partner/method.
# 13. BTG Admin Portal
- Global dashboard: GMV, booked revenue, active campaigns, delivery risk, upcoming renewals.
- Sponsor management: accounts, contacts, conflicts, category exclusivity.
- Property management: onboarding, contracts, permissions, rates, audience snapshots.
- Inventory control: publish, pricing override, availability, bundles.
- Campaign command center: due deliverables, under-delivery warnings, approvals, make-goods.
- Rewards: templates, claims, redemption exception review.
- Finance: commissions, payout approvals, invoice status references.
- Integrations: Zoho, analytics platforms, payment provider, Wallet issuers, INFINEX.
- System: tenants, users, roles, audit log, feature flags and environment configuration.
# 14. Athlete Portal
- Profile manager with public/private fields.
- Social account and audience metrics connections.
- Inventory/rate card with BTG approval requirement.
- Brand/category restrictions and conflict disclosure.
- Campaign invitations and approval/decline.
- Deliverable calendar and reminders.
- Creative brief and content upload.
- Published proof URL entry and performance snapshot.
- Earnings, commission calculation and payout status.
- Guardian/authorized representative workflow for minors.
- Document vault references for representation/NIL agreements.
# 15. Payments & Marketplace Financial Architecture
Phase 1 may record contractual value and invoice status without processing marketplace funds. Phase 2+ should use a marketplace payment provider capable of onboarding recipients, collecting platform fees and sending payouts. Stripe Connect is one example of this model; final provider selection should consider countries served, East Africa payout needs, compliance and fees.
SponsorX should never store raw card data. Store provider customer/payment IDs, status and non-sensitive metadata only.
# 16. INFINEX World API Architecture
INFINEX will consume SponsorX as the sponsorship system-of-record. Virtual worlds should request active placements from SponsorX and send impression/interaction events back.

## INFINEX Endpoint Contract
- GET /v1/infinex/worlds/{worldId}/placements?timestamp=...
- POST /v1/infinex/events - authenticated batch event ingestion.
- POST /v1/infinex/reward-triggers/{triggerId}/claim.
- GET /v1/infinex/campaigns/{id}/creative - signed/temporary asset URLs.
- Each event should include event_id, session_id (pseudonymous), user_id if consented, placement_id, campaign_id, world_id, timestamp, event_type and metadata.
## Virtual Measurement Rules
- Define what counts as an impression: placement rendered, minimum on-screen threshold and minimum dwell time.
- Do not count hidden/off-camera placements.
- Deduplicate repeated events in short windows.
- Separate visits, impressions and interactions.
- Use server-signed events or anti-fraud validation for monetized metrics.
# 17. Security, Privacy & Compliance Requirements
- TLS everywhere; encrypt sensitive data at rest.
- OAuth/OIDC-based authentication; MFA for admins/finance.
- RBAC and tenant-level row scoping.
- Secrets manager for API keys and wallet signing credentials.
- PII minimization; hash or tokenize fan identifiers where raw values are not required.
- Consent capture and unsubscribe/suppression support for fan marketing.
- Data retention policy for campaign event logs and fan data.
- Signed URLs for private creative/document files.
- Rate limiting, bot protection and QR abuse detection.
- Audit logging for pricing, campaign, payout and permission changes.
- Separate DEV, STAGING and PROD environments.
- Backup/restore plan and automated database backups.
- Legal review required for NIL, minors, sweepstakes, marketing consent, privacy policy, marketplace terms, and state/country-specific rules.
# 18. Recommended Technical Stack

# 19. Phase 1–4 Development Roadmap

## Detailed Phase 1 Sprint Plan

# 20. Estimated Development Budget
These are planning ranges, not vendor quotes. Final cost depends heavily on team location, UX quality, number of external data integrations, automated testing, compliance work and whether BTG uses a senior product/architecture lead.

## Suggested Phase 1 Cost Breakdown

## Ongoing Operating Costs After MVP
- Cloud/database/storage/logging: approximately $300-$1,500/month at early-stage volume.
- Transactional email/SMS: usage based.
- Payment processing/marketplace fees: provider and volume dependent.
- Wallet issuer/program costs: mostly implementation/operations; confirm current program requirements during integration.
- Maintenance/feature development: plan $5,000-$15,000/month for a small retained product team after launch.
- Analytics/social data providers: variable and may become a meaningful cost as automated audience measurement expands.
# 21. MVP Acceptance Criteria
- BTG admin can create sponsor, property, athlete and inventory records.
- Sponsor can log in and only see its authorized data.
- Sponsor can browse available inventory and submit a request/reservation.
- Admin can create a campaign from selected inventory and assign deliverables.
- Campaign manager can upload/approve creative and attach proof of delivery.
- System calculates guaranteed vs delivered impressions and flags under-delivery.
- Admin can create a QR reward; fan can scan, claim and redeem; each funnel event is stored.
- Sponsor dashboard displays campaign and reward metrics.
- System generates a campaign report that can be exported to PDF or viewed online.
- Sponsor/account/deal fields synchronize with Zoho using external IDs and retries.
- Audit logs exist for critical mutations.
- Production environment has monitoring, backups, SSL and role security.
# 22. Developer Handoff Checklist
- Architecture diagram and API boundary approved.
- Wireframes for 12 core screens approved.
- Database ERD created from schema above.
- RBAC matrix finalized.
- Zoho field mapping documented.
- Campaign and inventory state machines implemented.
- Reward event taxonomy finalized.
- Metric source/verification taxonomy implemented.
- OpenAPI/Swagger documentation generated.
- Automated tests for auth, tenant isolation, campaign pricing and reward claims.
- Staging environment available to BTG for UAT.
- Release checklist and rollback plan.
- Administrator documentation and 60-90 minute training session.
# 23. Decisions BTG Should Lock Before Development

# 24. SponsorX Revenue Architecture

# 25. Technical Reference Notes
Google Wallet's current developer model supports offer/pass creation through Passes Classes and Passes Objects using REST APIs. Apple Wallet supports signed passes and a web-service model for pass registration and updates. For marketplace payments, products such as Stripe Connect support onboarding, platform fees and payouts. These capabilities should be integrated through adapters so SponsorX is not permanently coupled to one vendor.
Reference URLs:
- https://developers.google.com/wallet/retail/offers/use-cases/create
- https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
- https://stripe.com/connect/marketplaces
# 26. Recommended Immediate Next Build Artifacts
- Clickable UI wireframes for all 12 core screens.
- Database ERD.
- OpenAPI specification.
- Zoho CRM module/field mapping document.
- Phase 1 backlog with user stories and acceptance criteria.
- SponsorX visual design system (logo, typography, UI components).
- Developer statement of work tied to Phase 1 milestones and payment schedule.
| KPI | Target at MVP Launch |
| --- | --- |
| Properties onboarded | BTG core properties + initial athletes/events |
| Sponsor users | Ability to invite/manage sponsor accounts |
| Inventory | All sponsorship units cataloged with price, dates, projected reach and status |
| Campaigns | Create, approve, launch and report end-to-end |
| Rewards | Unique QR/coupon codes with scan, claim and redemption logging |
| CRM | Bi-directional or event-driven Zoho synchronization |
| Reporting | Downloadable sponsor campaign summary with delivery metrics |
| Security | Role-based access, audit log, encrypted credentials/secrets |
| Role | Tenant/Domain | Primary Permissions |
| --- | --- | --- |
| Super Admin | Platform | Full system access; tenant configuration; integrations; security; billing; overrides. |
| BTG Admin | BTG | Manage properties, sponsors, inventory, campaigns, reports, rewards and users. |
| Sales Manager | BTG | Leads, sponsor accounts, proposals, pricing, opportunities, renewals. |
| Campaign Manager | BTG | Campaign setup, deliverables, approvals, reporting, make-goods. |
| Finance User | BTG | Invoices, commissions, payout approvals, transaction exports. |
| Property Manager | Property | Manage team/event/media inventory and view associated campaigns. |
| Athlete | Property | Manage profile, availability, content approvals, deliverables, payout status. |
| Athlete Guardian | Property | Approval access for minors where applicable; no general admin rights. |
| Sponsor Admin | Sponsor | Manage company profile, team members, campaigns, billing and reports. |
| Sponsor Analyst | Sponsor | Read-only analytics/reporting; no purchase or contract authority. |
| Fan | Public | Claim rewards, opt in, save wallet passes and view eligible offers. |
| API Service Account | System | Scoped machine-to-machine access for INFINEX, iMC, analytics or partners. |
| Inventory Type | Examples | Pricing Models |
| --- | --- | --- |
| Media | Sponsored segment, pre-roll, social reel, show title sponsorship | CPM, fixed, package |
| Athlete/NIL | Post, reel, appearance, ambassador program | Fixed, bundle, performance bonus |
| Event | Presenting sponsor, court signage, MVP, booth, hospitality | Fixed, package |
| Team/Program | Uniform, season category, camp sponsor | Fixed, annual/seasonal |
| Digital | Newsletter, website, streaming placement | CPM, fixed |
| INFINEX | Virtual signage, naming rights, quests/challenges, branded venue | Fixed, CPM-like impressions, activation fee |
| Rewards | Coupon/reward sponsorship | Campaign fee + redemption/claim fee |
| Factor | Suggested Initial Range | Example Inputs |
| --- | --- | --- |
| Base CPM | $8-$15 | General digital/social baseline |
| Engagement | 0.85-1.50 | Engagement rate vs property benchmark |
| Audience Quality | 0.90-1.40 | Age fit, sports interest, verified audience, sponsor target fit |
| Geography | 0.90-1.35 | DMV, national, East Africa, sponsor priority markets |
| Format | 0.90-1.50 | Static, reel, premium video, live event, naming rights |
| Exclusivity | 1.00-1.30 | Non-exclusive vs category exclusive |
| Demand | 0.90-1.40 | Inventory utilization, seasonality, inbound sponsor demand |
| Performance Confidence | 0.85-1.20 | Historical delivery reliability and data quality |
| SponsorX Object | Zoho Target | Sync Direction | Trigger |
| --- | --- | --- | --- |
| Sponsor Company | Accounts | Bi-directional | Create/update sponsor |
| Sponsor Contact | Contacts | Bi-directional | Create/update contact |
| Sales Lead | Leads | SponsorX → Zoho | Inquiry form or manual lead |
| Opportunity | Deals | Bi-directional | Proposal/reservation/contract stage |
| Campaign | Custom Module or Campaigns | SponsorX → Zoho | Campaign contracted |
| Invoice Reference | Finance/CRM field | Zoho → SponsorX | Invoice created/paid |
| Renewal Opportunity | Deals | SponsorX → Zoho | Campaign nearing close/end |
| Activity/Task | Tasks/Activities | Bi-directional | Follow-up or campaign action |
| Domain | Example Endpoints | Purpose |
| --- | --- | --- |
| Auth | /auth/login, /auth/refresh, /users, /roles | Identity and authorization |
| Sponsors | /sponsors, /sponsors/{id}/contacts | Sponsor accounts and users |
| Properties | /properties, /athletes, /teams, /events | Sports property master data |
| Inventory | /inventory, /inventory/{id}/availability | Sellable units |
| Campaigns | /campaigns, /campaigns/{id}/deliverables | Planning and execution |
| Metrics | /metrics/events, /campaigns/{id}/metrics | Ingest/query performance |
| Rewards | /rewards, /claims, /redemptions | Fan reward lifecycle |
| Reports | /reports/campaign/{id} | Sponsor reporting |
| Payments | /checkout, /connected-accounts, /payouts | Later marketplace payment adapter |
| Integrations | /integrations/zoho, /webhooks | External system configuration |
| INFINEX | /infinex/placements, /infinex/events | Virtual sponsorship integration |
| Table | Key Fields | Purpose |
| --- | --- | --- |
| tenants | id, name, type, status, settings_json | Multi-tenant organization boundary |
| users | id, tenant_id, email, auth_id, status | Platform users |
| roles / permissions | id, code, scope | RBAC |
| user_roles | user_id, role_id, tenant_id | Assignments |
| sponsors | id, tenant_id, name, industry, crm_external_id | Sponsor companies |
| sponsor_contacts | id, sponsor_id, user_id, title | Sponsor contacts |
| properties | id, tenant_id, type, name, status | Athlete/team/event/media parent |
| athletes | property_id, DOB/age-band, sport, team, guardian fields | Athlete-specific profile |
| teams | property_id, league, level, season | Team-specific profile |
| events | property_id, venue, start/end, attendance projection | Event-specific profile |
| channels | id, property_id, platform, handle, verified | Distribution channels |
| audience_snapshots | id, property_id/channel_id, date, metrics_json | Audience history |
| inventory | id, property_id, type, price fields, dates, status | Sellable sponsorship units |
| inventory_deliverables | id, inventory_id, type, qty, specs | Deliverable templates |
| campaigns | id, sponsor_id, status, budget, start/end, objective | Campaign header |
| campaign_inventory | campaign_id, inventory_id, price, guaranteed_impressions | Purchased inventory |
| deliverables | id, campaign_id, owner, due_at, status, proof_url | Execution tasks |
| creative_assets | id, campaign_id, file_url, version, approval_status | Creative files |
| metric_events | id, campaign_id, source, type, value, occurred_at | Raw metric events |
| metric_aggregates | campaign_id, date, metric, value, source | Daily/reporting aggregates |
| rewards | id, campaign_id, sponsor_id, type, rules_json, status | Offer definition |
| qr_codes | id, reward_id, token, destination_url | QR assets |
| fan_profiles | id, email_hash/phone_hash, consent flags, zip | Consent-based fan identity |
| reward_claims | id, reward_id, fan_id, token, claimed_at | Claims |
| redemptions | id, claim_id, merchant_ref, amount, redeemed_at, verification | Redemptions |
| wallet_passes | id, claim_id, provider, serial/object_id, status | Apple/Google pass mapping |
| opportunities | id, sponsor_id, zoho_deal_id, stage, amount | Commercial pipeline cache |
| commissions | id, campaign_id, payee_property_id, rate, amount, status | Revenue share |
| payouts | id, payee_id, provider_ref, amount, status | Payout tracking |
| integration_connections | id, tenant_id, provider, secret_ref, status | Integration metadata |
| webhook_deliveries | id, event_type, target, attempts, status | Event delivery |
| audit_logs | id, user_id, entity_type/id, action, diff_json, timestamp | Audit trail |
| Layer | Metrics |
| --- | --- |
| Media | impressions/views, reach, watch time, completion, engagement, clicks |
| Campaign | guaranteed impressions, delivered, delivery %, effective CPM, make-good balance |
| Fan Funnel | QR scans, unique scans, landing visits, claims, opt-ins, redemptions |
| Commerce | verified transaction count, attributed revenue, average order value where partner data exists |
| Sponsor | spend, media value, cost per engagement, cost per lead/claim, return on ad/sponsor spend |
| Property | sell-through, revenue, average CPM, campaign completion, sponsor renewal |
| Marketplace | GMV, platform take rate, active buyers, active properties, repeat purchase rate |
| INFINEX Entity | SponsorX Mapping | Example |
| --- | --- | --- |
| World/District | Property or virtual property | BTG World, Culture World |
| Venue/Zone | Placement group | Arena, Skills Lab, Athlete Tunnel |
| Billboard/Surface | Inventory unit | LED wall sponsorship |
| Named Venue | Premium inventory | Brand-named Skills Lab |
| Quest/Challenge | Activation inventory | Sponsored skills challenge |
| Avatar/Item | Digital activation | Branded wearable or equipment |
| Reward Trigger | Reward rule | Complete challenge → claim offer |
| Visit/Impression | Metric event | Placement rendered in user session |
| Interaction | Metric event | Click, scan, challenge start/completion |
| Layer | Recommendation | Notes |
| --- | --- | --- |
| Web Frontend | Next.js / React / TypeScript | Sponsor, athlete, property and admin portals |
| Backend API | Node.js/TypeScript (NestJS) or Python/FastAPI | Choose based on developer strength; keep modular |
| Database | PostgreSQL | Primary transactional store |
| Cache/Queue | Redis + managed queue/workers | Rate limiting, jobs, sync, aggregates |
| File Storage | S3-compatible object storage | Creative/proofs/reports |
| Authentication | Managed OIDC provider or secure first-party auth | RBAC, MFA, SSO-ready |
| Analytics | Postgres aggregates initially; warehouse later | Avoid overbuilding Phase 1 |
| Hosting | AWS/Azure/GCP/Vercel + managed DB | Select team-standard environment |
| Observability | Centralized logs, error tracking, uptime monitoring | Required before production |
| Payments | Marketplace provider adapter | Do not hard-code business logic to one vendor |
| CRM | Zoho CRM integration service | Async webhook/job model |
| Wallet | Apple Wallet + Google Wallet adapter | Phase 2/3 |
| INFINEX | REST API + event ingestion | Phase 4 |
| Phase | Estimated Build Window | Deliverables |
| --- | --- | --- |
| Phase 1 - SponsorX MVP | 10-14 weeks | Auth/RBAC; sponsor portal; property/athlete profiles; inventory; campaign builder; deliverables; QR/coupon rewards; core analytics; sponsor report; Zoho sync; admin portal; audit log. |
| Phase 2 - Marketplace & Athlete Commerce | 10-16 weeks | External properties; athlete portal; inventory checkout/reservation; payment provider; commissions/payout tracking; bundles; wallet passes; richer social/data integrations. |
| Phase 3 - Intelligence & Attribution | 12-20 weeks | Dynamic CPM scoring; sponsor-property recommendations; performance forecasting; anomaly/fraud detection; partner commerce attribution; automated make-goods; advanced analytics warehouse. |
| Phase 4 - INFINEX Integration | 12-20 weeks | Virtual placements; branded venues; quest/activation inventory; virtual impressions/interactions; rewards; cross-channel campaign reporting; INFINEX sponsor control surfaces. |
| Sprint | Scope |
| --- | --- |
| Sprint 0 | Architecture, UX wireframes, data model, environments, backlog, acceptance criteria. |
| Sprint 1 | Auth, tenants, users, roles, sponsor/property/athlete core entities. |
| Sprint 2 | Inventory management, marketplace browse/search, pricing fields. |
| Sprint 3 | Campaign builder, deliverables, creative approvals, campaign status engine. |
| Sprint 4 | QR reward creator, scan/claim/redemption funnel, public reward landing pages. |
| Sprint 5 | Metric ingestion/aggregation, sponsor dashboard, ROI report. |
| Sprint 6 | Zoho integration, admin controls, audit logs, QA/security/hardening, UAT. |
| Budget Item | Planning Range | Assumptions |
| --- | --- | --- |
| Phase 1 - MVP | $45,000-$85,000 | Strong offshore/nearshore team with senior oversight; custom web app, core integrations and production QA. |
| Phase 2 - Marketplace | $55,000-$110,000 | Payments, athlete/property portal expansion, wallet passes, marketplace workflows. |
| Phase 3 - Intelligence | $75,000-$150,000 | Data engineering, pricing models, attribution partners, advanced analytics. |
| Phase 4 - INFINEX | $60,000-$140,000 | Depends heavily on INFINEX engine/client and complexity of virtual measurement/creative management. |
| Total 4-Phase Build | $235,000-$485,000 | Planning envelope for a professional custom platform. |
| Lean Founder-Led Version | $120,000-$225,000 | Possible if scope is tightly controlled, integrations are phased and offshore development is well managed. |
| Workstream | Range |
| --- | --- |
| Product/Architecture/PM | $6k-$12k |
| UX/UI Design | $5k-$10k |
| Frontend Development | $10k-$18k |
| Backend/API/Database | $12k-$22k |
| Zoho + Reward Integrations | $4k-$8k |
| QA/Security/DevOps | $5k-$10k |
| Contingency | $3k-$5k |
| Decision | Recommendation / Question |
| --- | --- |
| Product Name | Use SponsorX as working name; confirm trademark/domain later. |
| MVP Audience | BTG-controlled sponsors/properties only vs immediate outside marketplace. |
| Pricing Authority | Who can override CPM/floor pricing. |
| Zoho Modules | Use native Campaigns vs custom SponsorX Campaign module. |
| Payment Phase | Whether Phase 1 only references invoices or also accepts online deposits. |
| Fan Data Policy | Minimum fields required for claims; marketing opt-in strategy. |
| Athlete Payouts | Tracking only vs actual marketplace payout in Phase 2. |
| Report Branding | BTG-only or white-label-ready from day one. |
| INFINEX Engine | Final runtime/platform and authentication model for Phase 4. |
| Revenue Stream | Model |
| --- | --- |
| BTG direct sponsorships | Gross sponsorship revenue less property/athlete shares |
| Marketplace take rate | 5%-15% platform fee depending on services |
| Managed campaign fee | 10%-20% when BTG provides campaign operations |
| Athlete/NIL management | Per applicable contract/representation terms |
| SaaS subscription | Property/team monthly subscription tiers |
| Analytics upgrade | Premium reporting/data package |
| Reward campaigns | Setup + per-claim/redemption or managed-service fee |
| INFINEX activations | Virtual inventory + production/activation fee |