<!-- converted from Updated_BTG_SponsorX_Master_Development_Blueprint_Integrated_Athlete_Network.docx -->

BTG SPORTS GROUP
SPONSORX
MASTER DEVELOPMENT BLUEPRINT
Integrated Phase 1 Athlete Network + Managed Micro-NIL Marketplace
Developer Handoff Specification | Version 2.0 | September 2026

Purpose: Launch SponsorX with real athlete inventory and sponsor campaigns immediately, then scale into marketplace automation, intelligence, attribution and INFINEX activations.

# 1. Executive Summary
BTG SponsorX is a sports sponsorship operating system and marketplace designed to connect brands with athletes, teams, events, media properties and fan communities. Version 2.0 changes the original launch strategy: Phase 1 will not wait for BTG to develop a large owned audience. Instead, SponsorX will launch as a managed micro-NIL athlete network in which BTG organizes many smaller athlete audiences into sponsor-ready campaigns.
BTG's represented athletes serve as Anchor Athletes, while additional athletes can join as non-exclusive SponsorX Content Partners through a limited Content Collaboration Agreement. SponsorX packages their content, appearances and local influence into standardized sponsorship products that BTG can sell to local and regional businesses. The Phase 1 software must therefore manage athlete onboarding, NIL jobs, sponsor packages, athlete matching, campaign orders, deliverables, content approvals, QR rewards, performance tracking, earnings visibility and sponsor reporting from launch.
Core operating loop:
SPONSOR → CAMPAIGN BRIEF → SPONSORX MATCHING → ATHLETE OPT-IN → CAMPAIGN ORDER → CONTENT/ACTIVATION → TRACKING/REWARD → ATHLETE EARNINGS → SPONSOR REPORT → RENEWAL
# 2. Phase 1 Launch Targets

# 3. Product Strategy
- Phase 1 = managed marketplace. BTG staff controls sponsor sales, athlete matching, approvals and payout status; software standardizes and records every step.
- Phase 2 = self-service marketplace. External properties/athletes publish inventory and sponsors reserve/purchase through automated workflows.
- Phase 3 = intelligence. Pricing, sponsor matching, campaign forecasting, attribution and optimization become data-driven.
- Phase 4 = INFINEX. Virtual placements and interactive activations become SponsorX inventory within the same campaign/reporting system.
- The product must be multi-tenant and API-first from day one even though BTG is the initial operator.
- Follower count is not the primary ranking method. SponsorX should progressively rank athletes using engagement, content quality, reliability, audience fit, geography and actual sponsor results.
# 4. SponsorX Athlete Network Model

# 5. Standard Phase 1 NIL Jobs

*These are SponsorX launch assumptions, not universal NIL market rates. Final pricing must consider athlete value, rights requested, exclusivity, production, duration, geography and sponsor category.
# 6. Athlete Rate Logic

Phase 1 should store a base rate and manual tier multiplier. Phase 3 should replace simplistic audience tiers with a SponsorX Content Value Score and performance-based recommendations.
# 7. Sponsor Packages Built Into Phase 1

# 8. User Roles & Permissions

# 9. The 12 Core Phase 1 Screens
## 1. SponsorX Public Homepage / Network Landing Page
Explain the Athlete Network, sponsor packages and content-partner opportunity. CTAs: Become a Sponsor, Join Athlete Network, Login. Include proof/case-study slots.
## 2. Authentication / Role-Aware Login
Email/password initially; MFA-ready; role-aware routing; guardian/athlete linkage; tenant context.
## 3. Sponsor Dashboard
Active campaigns, spend, package status, athlete count, deliverables, views, engagements, QR scans, claims, redemptions, reports and renewal CTA.
## 4. Sponsor Marketplace / Package Catalog
Phase 1 displays standardized SponsorX packages and curated inventory. Sponsors request/reserve rather than fully self-checkout. Filters: sport, geography, athlete tier, job type, campaign budget.
## 5. Athlete / Property Profile
Commercial profile with sport, team/school, geography, audience, social channels, content samples, availability, restrictions, scores, rates and historical sponsor performance.
## 6. Athlete Portal
Profile, job catalog, campaign invitations, accepted Campaign Orders, deliverable calendar, upload/proof, approval status, earnings/payout status and compliance alerts.
## 7. NIL Job / Inventory Detail
SX job code, athlete, deliverables, base rate, sponsor price, rights, exclusivity, dates, usage, geography, required approval, status and availability.
## 8. Campaign Builder + Athlete Matching
Sponsor brief, package, objective, budget, sport/geography, target audience, recommended/filtered athlete roster, compensation, deliverables, tracking and approval workflow.
## 9. Campaign Operations Dashboard
Per-athlete acceptance, Campaign Orders, due dates, draft approval, published proof, views, QR metrics, under-delivery, payout eligibility and issue flags.
## 10. QR / Reward Creator
Campaign reward, eligibility, landing page, consent, unique code/QR, limits, expiration, redemption tracking and later Wallet upgrade.
## 11. Analytics / Athlete Performance Dashboard
Campaign metrics plus per-athlete views, engagement, clicks, claims, redemptions, reliability, content quality and sponsor-performance history.
## 12. Sponsor ROI / Campaign Report
Campaign objective, athlete roster, delivered assets, verified/estimated metrics, QR funnel, redemption, attributable revenue where available, media value, recommendations and renewal.
# 10. Administrative Portals Beyond the 12 Screens
- BTG Admin Portal: global dashboard, athlete applications, sponsor pipeline, package/job catalog, campaign command center, reward management, earnings/payout status, reports, integrations and settings.
- Athlete Network Manager Workspace: application review, Content Value Score, social/audience verification, restrictions, guardian/compliance checklist, rate tier, active/paused/suspended status.
- Finance Workspace: sponsor invoice/payment references, athlete earnings, commission/management fee calculations, payout eligibility and reconciliation.
- Content Approval Workspace: draft review, sponsor approval, revision requests, publication proof and usage-rights expiration.
# 11. Athlete Onboarding Form / Data Capture

# 12. Content Collaboration Agreement Workflow
SponsorX should store agreement metadata and signature references rather than hard-code legal terms into software.
- Athlete joins the network under a limited, generally non-exclusive Content Collaboration Agreement unless another representation agreement controls.
- Each individual campaign is governed by a Campaign Order containing sponsor, job code, deliverables, compensation, usage rights, exclusivity, deadlines and disclosure requirements.
- Athlete must explicitly accept the Campaign Order before deliverables become active.
- Content rights should default to campaign-specific duration/channels; paid-media or extended usage can increase price.
- The system must record agreement version, acceptance timestamp, signer, guardian authorization when applicable and campaign-order version.
- Legal counsel should approve agreement templates before production use, especially for minors/high-school athletes and cross-jurisdiction campaigns.
# 13. Phase 1 Managed Campaign Workflow
- Sales creates sponsor lead/opportunity in SponsorX or Zoho.
- Campaign Manager creates Sponsor Brief: objective, target, budget, package, dates, category and CTA.
- SponsorX filters eligible athletes by sport, geography, availability, restrictions and tier.
- Campaign Manager manually selects athletes and sends invitations.
- Athlete reviews offer and accepts/declines.
- Accepted athlete receives Campaign Order and electronic acceptance requirement.
- Deliverables and due dates are created automatically from the selected SX job/package.
- Athlete uploads draft or proof; BTG reviews and sends to sponsor if sponsor approval is required.
- Content publishes; unique athlete link/code/QR is associated with the deliverable.
- Metrics are entered via verified API where available or verified manual proof in Phase 1.
- Campaign Manager closes accepted deliverables; finance marks athlete earnings eligible.
- Sponsor receives report; Zoho renewal opportunity is created.
# 14. Athlete Content Value Score

Phase 1 score is rules/manual-assisted. Phase 3 will introduce versioned algorithmic scoring and model confidence.
# 15. CPM & Sponsorship Pricing Algorithm
Recommended CPM = Base CPM × Engagement × Audience Quality × Geography × Format × Exclusivity × Demand × Performance Confidence

For micro-NIL jobs, SponsorX may sell using fixed job pricing while still calculating implied CPM for learning and sponsor comparison. Phase 1 should store both list price and implied CPM whenever impressions are projected.
# 16. QR / Reward Workflow
Phase 1 flow: Campaign → Reward → Unique athlete/campaign QR or code → Fan landing page → consent/claim → coupon/token → redemption → analytics.
- Each athlete can receive a unique tracking code or URL to measure relative performance.
- Scan, landing visit, claim and redemption must be stored as separate events.
- Reward can be single-use code, campaign code, event check-in reward, lead-capture reward or sweepstakes-style entry if legally approved.
- Phase 1 does not need payment-network attribution; merchant/staff validation or unique coupon redemption is sufficient.
- Phase 2/3 can add Apple/Google Wallet and partner commerce attribution.
# 17. Sponsor Marketplace Behavior by Phase

# 18. Zoho CRM Integration

- Use external IDs to prevent duplicates.
- Sync via queues/background jobs with retries.
- SponsorX remains system-of-record for athlete network, inventory, Campaign Orders, deliverables and performance.
- Zoho remains system-of-record for sales relationship, opportunity pipeline and CRM notes unless field mapping says otherwise.
# 19. Core API Architecture

# 20. Phase 1 Database Tables

# 21. Key Phase 1 State Machines

# 22. Analytics

# 23. Admin Portal Functional Requirements
- Athlete application queue and approval checklist.
- Content Value Score and tier management.
- NIL job/rate-card configuration.
- Sponsor package configuration.
- Sponsor lead/opportunity view linked to Zoho.
- Campaign brief and athlete eligibility filter.
- Athlete invitation and Campaign Order generator.
- Deliverable approval board.
- QR/reward manager.
- Performance and per-athlete comparison.
- Earnings/payout status and finance reconciliation.
- Agreement/version/reference management.
- Category conflict and restriction management.
- Audit log and integration health.
# 24. Athlete Portal Functional Requirements
- Profile completion meter.
- Social account and audience snapshot entry/connection.
- Brand interests and restrictions.
- Available NIL job rates.
- Campaign invitation inbox.
- Campaign Order detail and acceptance.
- Calendar of deadlines and appearances.
- Creative brief and file/proof upload.
- Approval/revision status.
- Published links and self-reported metrics when required.
- Earnings: pending, eligible, approved and paid.
- Agreement/document references.
- Guardian/authorized representative status where applicable.
# 25. INFINEX API Architecture
INFINEX is Phase 4, but its data contract must be anticipated in Phase 1 so SponsorX campaigns and inventory do not need to be redesigned.

Core Phase 4 endpoints anticipated now: GET /v1/infinex/worlds/{worldId}/manifest, POST /v1/infinex/events/batch, POST /v1/infinex/activations/{id}/complete, POST /v1/infinex/activations/{id}/reward.
# 26. Security / Compliance Requirements
- Role-based access and tenant scoping on every protected record.
- MFA for privileged admin/finance in production.
- No raw payment card or banking credentials stored by SponsorX.
- Signed/private storage for agreements and creative assets.
- Consent/version tracking for fan marketing and athlete agreements.
- Guardian/authorized-representative workflow for minors where required.
- Category restrictions and conflict checks before invitations.
- Audit logs for pricing, agreement, campaign, payout and permission changes.
- Separate verified, self-reported, estimated and attributed metrics.
- Legal review of NIL/content collaboration templates, minors/high-school participation, sweepstakes/rewards, privacy/marketing and applicable jurisdiction rules.
# 27. Recommended Technical Stack



# 28. Phase 1 Scope
- Athlete Network application, approval and profile management.
- 4 Anchor Athletes + onboarding workflow capable of reaching first 25 Content Partners.
- SX-01 through SX-07 job catalog and athlete-specific rates.
- Sponsor package catalog including $750 Test Drive.
- Sponsor/Zoho lead pipeline integration.
- Campaign Brief, athlete eligibility filtering and manual matching.
- Athlete invitations and Campaign Orders.
- Deliverable calendar, content/proof upload and approval.
- QR/reward generation and unique athlete tracking codes.
- Sponsor and athlete dashboards.
- Per-athlete/campaign analytics with verification labels.
- Earnings and payout-status tracking.
- Sponsor report and renewal workflow.
- Admin command center, RBAC, audit and integration monitoring.
# 29. Phase 1 Sprint Plan

# 30. Phase 1 Acceptance Criteria
- Athlete can apply, upload/enter required onboarding information and reach APPROVED state through admin workflow.
- Admin can configure SX jobs and individual athlete rates.
- Sponsor can view packages and submit a campaign request/brief.
- Campaign manager can filter eligible athletes and send invitations.
- Athlete can accept an invitation and Campaign Order before work begins.
- System auto-creates deliverables from job/package templates.
- Athlete can upload draft/proof; BTG can request revision, approve and mark published.
- Unique tracking link/code can be assigned per athlete deliverable.
- QR reward supports scan/claim/redemption event separation.
- Sponsor dashboard and final report show campaign and per-athlete performance.
- Athlete portal shows pending/eligible/paid earnings status.
- Zoho Account/Contact/Deal links are created or synchronized using external IDs.
- Admin audit log records critical changes.
- Cross-tenant and role authorization tests pass.
# 31. Phase 1 Staffing / Timeline / Budget

Development timeline: approximately 14-18 weeks including UAT and launch hardening.

Separate launch operating budget (not software development): athlete content day, initial creative production, sponsor sales materials, legal review and pilot campaign incentives should be budgeted separately.

# 32. Phase 2 Scope / Timeline / Budget

Full detailed Phase 2 specification remains governed by the separate SponsorX Phases 2-4 Developer Specifications document.

# 33. Phase 3 Scope / Timeline / Budget


# 34. Phase 4 Scope / Timeline / Budget

# 35. Combined Development Schedule & Budget

A lean, tightly managed offshore/nearshore execution can be materially lower, particularly if Phase 1 remains operationally managed and payment/wallet automation is deferred to Phase 2. Maintain a 10-15% contingency outside these planning ranges.
# 36. Recommended Phase 1 Operational Rollout Alongside Development

# 37. Developer Go/No-Go Gates

# 38. Developer Deliverables
- Source code repository controlled by BTG.
- Wireframes and final UI designs for all 12 core screens plus admin/athlete workspaces.
- Database ERD and migrations.
- OpenAPI/Swagger specification.
- RBAC matrix.
- Zoho module/field mapping document.
- Athlete onboarding and Campaign Order state diagrams.
- Reward event taxonomy.
- Analytics metric definitions and verification labels.
- Phase 2-4 module interfaces and migration plan.
- INFINEX API/event specification.
- Automated tests, tenant-isolation tests and UAT scripts.
- Deployment runbook, monitoring, backups and rollback plan.
- Admin user guide and developer handoff documentation.
# 39. Immediate Build Priority
The developer should prioritize the athlete network and campaign operations over self-service ecommerce. The fastest path to SponsorX product-market evidence is: Athlete Application → Approval → NIL Job/Rate → Sponsor Brief → Athlete Matching → Invitation → Campaign Order → Deliverable → Tracking/Reward → Earnings → Sponsor Report. If this loop works reliably for the first 25 athletes and 10 businesses, Phase 2 automation can be built around proven behavior instead of assumptions.
| Metric | 90-Day Target | 12-Month Target |
| --- | --- | --- |
| BTG Anchor Athletes | 4 | 10-20 represented athletes |
| SponsorX Content Partners | 21+ | 100+ |
| Total Athlete Network | 25+ | 100-250 |
| Paying Businesses | 10 | 30-50 |
| Campaigns | 10-20 | 75+ |
| Athlete Deliverables | 100+ | 500+ |
| Initial Sponsor Revenue | $25K-$50K contracted target | Scale based on repeat business and package mix |
| Primary Data Goal | Real CPM, engagement, claims, redemption and athlete reliability data | Enough history to support Phase 3 intelligence |
| Athlete Type | Relationship | Purpose | Software Access |
| --- | --- | --- | --- |
| BTG Anchor Athlete | Represented or strategic BTG athlete | Lead premium campaigns; establish credibility | Full Athlete Portal |
| SponsorX Content Partner | Non-exclusive micro-NIL/content collaborator | Accept optional paid jobs without full representation | Athlete Portal |
| Guardian-Managed Athlete | Minor/athlete requiring authorized adult workflow | Participate only after required authorization/compliance checks | Guardian + Athlete access |
| Property-Affiliated Athlete | Athlete rostered by team/program/property | Can be activated individually or through property package | Athlete and/or Property Portal |
| Code | Job | Athlete Base Pay* | Suggested Sponsor Sell Price* | Core Deliverable |
| --- | --- | --- | --- | --- |
| SX-01 | Story Drop | $25-$50 | $75-$125 | 1 story + sponsor tag + CTA |
| SX-02 | Sponsored Post | $50-$100 | $125-$250 | 1 approved feed post/carousel |
| SX-03 | Athlete Reel | $75-$150 | $200-$400 | 15-45 sec vertical video |
| SX-04 | Product Experience | $125-$250 | $350-$650 | 1 Reel + 1 Story + product integration |
| SX-05 | Local Appearance | $150-$300 | $400-$750 | 60-120 minute appearance |
| SX-06 | Content Day | $150-$350 | $500-$1,000+ | Photo/video/interview content session |
| SX-07 | Monthly Ambassador | $300-$750+ | $750-$2,000+ | Multi-deliverable 4-week activation |
| Tier | Illustrative Profile | Initial Multiplier |
| --- | --- | --- |
| Emerging | Smaller but engaged athlete; typically 1K-5K audience | 1.00x |
| Creator | Stronger content and/or 5K-20K audience | 1.25x |
| Premium | 20K-50K or demonstrated sponsor performance | 1.50x |
| Anchor | Premium BTG relationship or independently valuable athlete | Negotiated / custom |
| Package | Sponsor Price | Typical Inventory | Purpose |
| --- | --- | --- | --- |
| SponsorX Test Drive | $750 | 3 athletes; one activation each; basic report | Low-friction first purchase |
| Local Blitz | $1,500-$3,000 | 5-10 athletes; short-form content + stories | Local awareness/traffic |
| 10-Athlete Blitz | ~$2,500 | 10 coordinated athlete activations + QR/reward | Distributed athlete media |
| Community Campaign | ~$5,000 | 10-15 athletes + premium content + iMC/BTG feature + reward | Mid-level campaign |
| Athlete Takeover | ~$10,000 | 15-25 athletes + multi-week + media/event components | Major activation |
| Season Partner | $15K-$30K+ | Recurring athlete content, BTG/iMC, events, rewards, exclusivity | Category ownership / retention |
| Role | Domain | Primary Permissions |
| --- | --- | --- |
| Super Admin | Platform | All tenants, configuration, integrations, security, feature flags, overrides. |
| BTG Admin | BTG | Sponsors, athletes, properties, inventory, jobs, campaigns, rewards, reports, users. |
| Sales Manager | BTG | Leads, sponsor accounts, packages, opportunities, proposals, renewal pipeline. |
| Campaign Manager | BTG | Briefs, athlete matching, campaign orders, deliverables, approvals, reports. |
| Athlete Network Manager | BTG | Recruitment, onboarding review, scoring, athlete status, compliance checklist. |
| Finance User | BTG | Compensation schedules, earnings, invoice/payment reference, payout approval/status. |
| Athlete / Content Partner | Athlete | Profile, rates, offers, campaign orders, deliverables, earnings. |
| Guardian / Authorized Rep | Athlete | Review/approve eligible activities for athlete; access dependent on policy. |
| Property Manager | Property | Roster, property inventory, campaigns and property analytics. |
| Sponsor Admin | Sponsor | Campaigns, briefs, approvals, reports, billing references. |
| Sponsor Analyst | Sponsor | Read-only analytics/report access. |
| API Service Account | System | Scoped machine access for Zoho, iMC, INFINEX, analytics and partners. |
| Section | Required Fields |
| --- | --- |
| Identity | Legal name, athlete/brand name, DOB or age-band, email, phone, city/state, guardian/authorized rep if required. |
| Sports | Sport, position, school/team, level, graduation year, achievements. |
| Social | Instagram/TikTok/YouTube/X handles; followers; average views; optional platform verification/source. |
| Content Capabilities | Video, photo, story, interview, livestream, appearance, product review, community event. |
| Brand Interests | Apparel, food, fitness, tech, gaming, automotive, finance, wellness, entertainment, education, travel. |
| Restrictions | Existing NIL deals, school/team restrictions, competitor conflicts, prohibited categories, personal restrictions. |
| Rates | Base rate by SX job; tier; negotiated exceptions. |
| Payment Setup | Payment recipient and provider onboarding status; no raw bank credentials in SponsorX. |
| Agreements | Content Collaboration Agreement, media release, campaign/NIL acknowledgment, guardian authorization where needed, electronic signature. |
| Compliance Status | Pending review, approved, restricted, suspended; reviewer notes and expiration dates. |
| Factor | Phase 1 Weight | Phase 1 Input |
| --- | --- | --- |
| Engagement | 25% | Self-reported/verified engagement and campaign engagement. |
| Content Quality | 20% | BTG reviewer score and sponsor approval history. |
| Audience | 15% | Size, relevance, verified quality when available. |
| Reliability | 15% | On-time delivery, responsiveness, revision rate. |
| Geography | 10% | Fit to sponsor target market. |
| Sport / Brand Fit | 10% | Category/sport relevance. |
| Sponsor Performance | 5% | Clicks, claims, redemptions or other outcomes. |
| Factor | Initial Range | Notes |
| --- | --- | --- |
| Base CPM | $8-$15 | General baseline; set by inventory type/category. |
| Engagement | 0.85-1.50 | Relative to SponsorX athlete/property benchmark. |
| Audience Quality | 0.90-1.40 | Target fit, authenticity, quality. |
| Geography | 0.90-1.35 | Sponsor-priority market value. |
| Format | 0.90-1.50 | Story/static/reel/video/event/activation. |
| Exclusivity | 1.00-1.30 | Category or athlete exclusivity. |
| Demand | 0.90-1.40 | Sell-through, seasonality, scarcity. |
| Confidence | 0.85-1.20 | Historical delivery reliability/data quality. |
| Phase | Marketplace Model | Sponsor Behavior | BTG Control |
| --- | --- | --- | --- |
| Phase 1 | Curated managed marketplace | Browse packages/inventory; submit brief/request; no mandatory self-checkout | High: matching, pricing, conflict check, approval, invoice, campaign setup |
| Phase 2 | Transactional marketplace | Reserve/purchase inventory, checkout, connected accounts | Moderation, floor pricing, disputes, payouts |
| Phase 3 | Intelligent marketplace | Recommendations, pricing, forecasts, attribution | Governance/model overrides |
| Phase 4 | Omnichannel marketplace | Buy physical + athlete + media + INFINEX inventory | Cross-channel controls and measurement |
| SponsorX Object | Zoho Target | Direction | Phase 1 Trigger |
| --- | --- | --- | --- |
| Sponsor | Accounts | Bi-directional | Sponsor created/updated |
| Sponsor Contact | Contacts | Bi-directional | Contact added/updated |
| Lead | Leads | SponsorX → Zoho | Inquiry / outbound qualification |
| Opportunity | Deals | Bi-directional | Sponsor package proposal / campaign value |
| Campaign | Custom Module or Campaigns | SponsorX → Zoho | Campaign contracted |
| Athlete / Content Partner | Custom Module recommended | SponsorX → Zoho | Approved network member or business relationship requiring CRM visibility |
| Task | Activities/Tasks | Bi-directional | Follow-up, approval, renewal |
| Invoice/Payment Reference | Finance/CRM fields | Zoho → SponsorX | Invoice issued/paid |
| Renewal | Deals | SponsorX → Zoho | Campaign closing/renewal recommendation |
| Domain | Example Endpoints | Phase |
| --- | --- | --- |
| Auth | POST /auth/login; /auth/refresh; /users; /roles | 1 |
| Athlete Network | POST /athletes/apply; GET /admin/athlete-applications; POST /athletes/{id}/approve | 1 |
| Sponsors | /sponsors; /sponsors/{id}/contacts | 1 |
| Properties/Athletes | /properties; /athletes; /athletes/{id} | 1 |
| NIL Jobs | /nil-jobs; /athletes/{id}/rates | 1 |
| Sponsor Packages | /sponsor-packages; /sponsor-packages/{id} | 1 |
| Campaign Briefs | /campaign-briefs | 1 |
| Athlete Matching | POST /campaign-briefs/{id}/eligible-athletes; POST /campaigns/{id}/invite-athletes | 1 |
| Campaign Orders | POST /campaign-orders; POST /campaign-orders/{id}/accept | 1 |
| Deliverables | /campaigns/{id}/deliverables; /deliverables/{id}/approve | 1 |
| Rewards | /rewards; /claims; /redemptions | 1 |
| Metrics | POST /metrics/events; GET /campaigns/{id}/metrics | 1 |
| Zoho | /integrations/zoho/sync | 1 |
| Marketplace | /listings; /carts; /reservations; /orders; /payments; /payouts | 2 |
| Intelligence | /intelligence/pricing; /matches; /forecast; /attribution | 3 |
| INFINEX | /infinex/worlds; /placements; /manifest; /events/batch; /activations | 4 |
| Table | Purpose |
| --- | --- |
| tenants | Organization boundary. |
| users / roles / user_roles | Identity and RBAC. |
| sponsors / sponsor_contacts | Brand/customer master data. |
| properties | Athlete/team/event/media parent entity. |
| athletes | Athlete-specific identity/commercial profile. |
| guardians_authorized_reps | Adult approval/relationship metadata where required. |
| athlete_applications | Network application and review status. |
| athlete_social_accounts | Platform handle, audience snapshot, verification/source. |
| athlete_content_capabilities | Video/photo/story/appearance capability flags. |
| athlete_brand_preferences | Interested/restricted categories. |
| athlete_scores | Content Value Score history and factor snapshot. |
| agreements | Master agreement type/version/signature reference. |
| nil_jobs | SX-01 through SX-07 definitions and base economics. |
| athlete_rates | Athlete-specific rate by job/version. |
| sponsor_packages | Test Drive, Blitz, Community, Takeover, Season Partner. |
| campaign_briefs | Sponsor objectives, targeting, budget, dates and restrictions. |
| campaigns | Campaign header/status/budget/guarantee. |
| campaign_athletes | Athlete assignment/invitation/acceptance. |
| campaign_orders | Commercial terms snapshot per athlete campaign. |
| deliverables | Due dates, proof, approval, publish URL and status. |
| creative_assets | Draft/final versions and approvals. |
| tracking_links | Unique athlete/campaign URL/UTM/code. |
| metric_events / metric_aggregates | Campaign and athlete performance. |
| rewards / qr_codes / reward_claims / redemptions | Fan reward funnel. |
| earnings | Athlete gross compensation, adjustments, eligibility and status. |
| payouts | Payment status/reference; actual provider integration later. |
| audit_logs | Critical mutation history. |
| integration_connections / webhook_deliveries | Zoho/external integration state. |
| Entity | States |
| --- | --- |
| Athlete Application | DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / CHANGES_REQUESTED / REJECTED → ACTIVE / SUSPENDED |
| Campaign Brief | DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED → CLOSED |
| Athlete Invitation | INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED |
| Campaign Order | DRAFT → SENT → ACCEPTED / REJECTED → ACTIVE → COMPLETED / CANCELLED |
| Deliverable | NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED |
| Campaign | DRAFT → STAFFING → APPROVAL → ACTIVE → REPORTING → COMPLETED / CANCELLED |
| Earnings | PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID / HELD / DISPUTED |
| Reward | DRAFT → ACTIVE → PAUSED → EXPIRED / ARCHIVED |
| Layer | Phase 1 Metrics |
| --- | --- |
| Athlete | Followers/audience snapshot, views, engagement, clicks, claims, redemptions, reliability, revision rate, on-time rate, sponsor performance. |
| Campaign | Spend/value, athlete count, deliverables, impressions, engagement, clicks, QR funnel, redemptions, delivered vs planned. |
| Sponsor | Campaign spend, cost per view/engagement/claim, repeat rate, renewal pipeline. |
| Network | Active athletes, applications, participation rate, total athlete earnings, average job pay, athlete utilization. |
| Marketplace Learning | Implied CPM, average sell price by job, margin by package, sponsor conversion, package performance. |
| Data Quality | Verified API, verified manual, self-reported, estimated, attributed. |
| INFINEX Entity | SponsorX Mapping | Example |
| --- | --- | --- |
| World/District | Property / virtual property | BTG World, Culture World |
| Venue/Zone | Placement group | Arena, Skills Lab, Athlete Tunnel |
| Surface | Inventory unit | LED wall, billboard, kiosk |
| Named Venue | Premium inventory | Sponsor-named Skills Lab |
| Challenge/Quest | Activation inventory | Sponsored skills challenge |
| Reward Trigger | Reward rule | Completion → offer |
| Impression/Visit | Metric event | Viewable sponsor placement |
| Interaction | Metric event | Click, enter, start, complete |
| Layer | Recommendation |
| --- | --- |
| Frontend | Next.js / React / TypeScript |
| Backend API | FastAPI/Python or NestJS/TypeScript; choose one primary backend standard |
| Database | PostgreSQL |
| Queue/Cache | Redis + durable job worker/queue |
| File Storage | S3-compatible private object storage + signed URLs |
| Authentication | Managed OIDC preferred for production; starter JWT acceptable for development |
| CRM | Zoho CRM async integration service |
| Messaging | Transactional email + optional SMS provider |
| Payments | Phase 1 invoice/reference tracking; marketplace payment adapter in Phase 2 |
| Wallet | Apple/Google Wallet adapter in Phase 2/3 |
| Analytics | Postgres aggregates initially; warehouse in Phase 3 |
| INFINEX | REST manifest + authenticated event ingestion |
| PHASE 1 - ATHLETE NETWORK + MANAGED MARKETPLACE
Launch real micro-NIL campaigns while building the data foundation. |
| --- |
| Sprint | Duration | Scope |
| --- | --- | --- |
| Sprint 0 | 2 weeks | Architecture, UX, legal-template data requirements, ERD, RBAC, Zoho mapping, environments. |
| Sprint 1 | 2 weeks | Auth, tenants/users/roles, sponsors, properties, athletes, applications, guardian linkage. |
| Sprint 2 | 2 weeks | Athlete profile, social/restrictions, Content Value Score v1, NIL jobs, athlete rates. |
| Sprint 3 | 2 weeks | Sponsor packages, campaign briefs, eligibility filter, athlete invitations. |
| Sprint 4 | 2 weeks | Campaign Orders, deliverables, content approvals, tracking links/codes. |
| Sprint 5 | 2 weeks | QR rewards, claims/redemptions, basic athlete and sponsor analytics. |
| Sprint 6 | 2 weeks | Earnings/payout status, sponsor report, Zoho sync, admin operations. |
| Sprint 7 | 2 weeks | QA/security, tenant isolation, UAT with initial athletes/sponsors, launch hardening. |
| Role | Allocation |
| --- | --- |
| Product Manager / BTG Product Owner | 0.5-1.0 FTE |
| Technical Lead / Architect | 0.5 FTE |
| UX/UI Designer | 0.5 FTE first 6-8 weeks |
| Frontend Engineers | 1-2 FTE |
| Backend Engineers | 1-2 FTE |
| Integration Engineer | 0.5 FTE |
| QA Engineer | 0.75-1 FTE |
| DevOps/SRE | 0.25 FTE |
| NIL/Privacy Counsel | Fractional review |
| Scenario | Phase 1 Development Budget | Assumption |
| --- | --- | --- |
| Lean managed-marketplace build | $55K-$75K | Offshore/nearshore team, focused UX, invoice/payout-status tracking rather than automated money movement. |
| Balanced production MVP | $75K-$105K | Stronger UX, automation, testing, reporting, integration quality and security. |
| Premium / U.S.-heavy build | $105K-$150K | Higher domestic labor mix, deeper compliance/security and more polished portal/reporting. |
| PHASE 2 - TRANSACTIONAL MARKETPLACE
Automate property onboarding, reservations, checkout, commissions, payouts and Wallet rewards. |
| --- |
| Area | Phase 2 Build |
| --- | --- |
| Features | External property onboarding, listing engine, cart/reservations, orders, payment provider, commission ledger, connected payout accounts, athlete offers, Wallet rewards, property analytics. |
| Screens | Property onboarding, verification queue, listing editor, cart, checkout, revenue-share editor, earnings/payout dashboard, Wallet manager, marketplace ops console. |
| APIs | /onboarding, /listings, /availability, /carts, /reservations, /orders, /payments, /payout-accounts, /ledger, /payouts, /athlete-offers, /wallet. |
| Database | property_onboarding, marketplace_listings, carts, reservations, orders, payment_transactions, commission_rules, ledger_entries, payout_accounts, payout_requests, wallet_passes. |
| Integrations | Marketplace payment provider, Apple/Google Wallet, expanded Zoho, messaging, optional social APIs. |
| Timeline | 16-20 weeks. |
| Balanced Development Budget | $80K-$120K. |
| PHASE 3 - INTELLIGENCE & ATTRIBUTION
Turn real campaign history into dynamic pricing, sponsor matching, forecasting and attribution. |
| --- |
| Area | Phase 3 Build |
| --- | --- |
| Features | Dynamic CPM, SponsorX Content Value Score v2, sponsor-property matching, forecast/pacing, make-good optimizer, attribution adapters, benchmarks, anomaly detection, scenario planner. |
| Screens | Pricing intelligence, match explorer, forecast dashboard, make-good center, attribution dashboard, sponsor/property intelligence hubs, anomaly console, model admin. |
| APIs | /intelligence/pricing, /matches, /forecast, /make-good-options, /attribution/events, /benchmarks, /scenarios, /anomalies, /models. |
| Database | pricing_recommendations, match_scores, campaign_forecasts, make_good_recommendations, attribution_events/rules, benchmark_metrics, anomaly_events, model_registry, feature_snapshots, warehouse facts/dimensions. |
| Integrations | Analytics warehouse, social/video APIs, selected commerce attribution partners, BI/embedded analytics if useful. |
| Timeline | 18-22 weeks. |
| Balanced Development Budget | $105K-$160K. |
| PHASE 4 - INFINEX INTEGRATION
Sell and measure virtual sponsorship inventory inside the same SponsorX campaign. |
| --- |
| Area | Phase 4 Build |
| --- | --- |
| Features | World/zone registry, virtual placement inventory, creative deployment, branded activation builder, viewability measurement, virtual rewards, cross-channel campaigns, live operations. |
| Screens | World registry, placement manager, virtual campaign extension, creative deployment, activation builder, metrics dashboard, cross-channel dashboard, operations console, virtual pricing. |
| APIs | /infinex/worlds, /zones, /placements, /manifest, /creative, /events/batch, /activations, /reward, /heartbeat. |
| Database | infinex_worlds, zones, virtual_placements, placement_availability, creative_deployments, activation_definitions, raw/aggregate virtual events, viewability_rules, client_registry. |
| Integrations | INFINEX runtime/game engine, SponsorX CDN, event stream, analytics warehouse, identity/session service, Wallet/reward service. |
| Timeline | 18-22 weeks for first production-world integration. |
| Balanced Development Budget | $90K-$150K. |
| Phase | Timeline | Balanced Budget | Primary Outcome |
| --- | --- | --- | --- |
| Phase 1 | 14-18 weeks | $75K-$105K | Athlete Network + managed micro-NIL marketplace operational. |
| Phase 2 | 16-20 weeks | $80K-$120K | Transactional marketplace, payments/payouts, Wallet. |
| Phase 3 | 18-22 weeks | $105K-$160K | Pricing/matching intelligence, forecasts, attribution. |
| Phase 4 | 18-22 weeks | $90K-$150K | INFINEX sponsorship inventory and cross-channel measurement. |
| Total sequential | 66-82 weeks | $350K-$535K | Full SponsorX platform. |
| Period | Operational Target | Software Use |
| --- | --- | --- |
| Days 1-30 | Recruit first 25 athletes; finalize agreements/rate card; prepare sponsor deck; begin sponsor outreach. | Use admin onboarding as soon as available; temporary import/manual entry allowed. |
| Days 31-45 | Contact 50 businesses; sell first 5 Test Drive/Blitz campaigns. | Campaign briefs, athlete matching, Campaign Orders. |
| Days 46-60 | Execute initial campaigns; collect proof, QR and performance data. | Deliverables, rewards, tracking, earnings. |
| Days 61-75 | Create case studies and sponsor performance comparisons. | Analytics and report generator. |
| Days 76-90 | Reach 10 paying businesses; upsell larger packages and renewals. | Sponsor dashboard, reports, Zoho renewal pipeline. |
| Gate | Required Condition |
| --- | --- |
| Before Coding Phase 1 | Confirm user roles, legal agreement metadata, SX job catalog, sponsor packages, Zoho module mapping and Phase 1 payment policy. |
| Before Athlete Pilot | Agreement templates approved; athlete/guardian compliance checklist approved; data privacy and payout process defined. |
| Before Sponsor Pilot | Package economics approved; tracking/report labels defined; reward terms reviewed. |
| Before Phase 2 | Phase 1 campaigns operating reliably; state machines, tenant isolation and earnings reconciliation stable. |
| Before Phase 3 | Enough clean historical data OR agreement to launch rules-based intelligence with explicit confidence labels. |
| Before Phase 4 | INFINEX runtime selected; stable world/placement IDs and telemetry schema approved. |