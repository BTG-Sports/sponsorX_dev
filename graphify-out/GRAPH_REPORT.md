# Graph Report - sponsorX_dev  (2026-09-11)

## Corpus Check
- Large corpus: 123 files · ~644,265 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 682 nodes · 1277 edges · 56 communities (32 shown, 24 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.89)
- Token cost: 658,872 input · 22,500 output

## Community Hubs (Navigation)
- Portal Layouts & Navigation
- Stack Decision & Vendors
- Admin & Portal Pages
- Next.js Project Config
- Campaign Builder Screens
- Error & Loading States
- Implementation Guide Core
- Applications & Shared UI
- Portal Redesign Plans
- Analytics & Charts
- Report Fixtures & Insights
- Sponsor Portal Hero
- Approvals & Athlete Pages
- TypeScript Config
- UI Mockups (Sheet 1)
- Finance & Earnings Pages
- Blueprint v1 Foundations
- UI Mockups (Sheet 2)
- Schools Infographic Pitch
- Marketing Homepage
- QR Reward Engine Overview
- Blueprint v2 Athlete Network
- Campaign Order Agreements
- Partner School Playbook
- Admin Dashboard Queue
- Auth & Tenant Scoping
- CPM Pricing Strategy
- Insight Carousel Component
- Prelaunch Operations Binder
- Reward Creator Wizard
- Task Board Artefacts
- Portal Hero Concepts
- Fan Redeem Page
- Tracking Link Route
- Pricing & NIL Catalog
- Route Map Page
- Screen Stub Component
- Minors & E-Signature
- BTG Brand Identity
- Graphify Rule
- Memory Sync Rules
- ESLint Config
- Athlete Scoring Concepts
- QR Funnel PII
- PostCSS Config
- File Icon
- Globe Icon
- Next.js Logo
- BTG Badge
- Title Logo (Lightning)
- Vercel Logo
- Window Icon
- BTG Logo Asset
- Full Logo Asset
- Title Logo Asset
- App Icon

## God Nodes (most connected - your core abstractions)
1. `demoState` - 27 edges
2. `money()` - 27 edges
3. `Card()` - 23 edges
4. `Badge()` - 19 edges
5. `SkeletonPage()` - 18 edges
6. `resolveBack()` - 17 edges
7. `SectionHeading()` - 16 edges
8. `compilerOptions` - 16 edges
9. `BTG SponsorX Systems Architecture (Draft 0.1, Phase 1)` - 16 edges
10. `MiniChip()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `The Operating Loop Is the Product` --semantically_similar_to--> `§39 Protected Core Loop`  [INFERRED] [semantically similar]
  Memory/Initial Memory/04-key-decisions-and-findings.md → CLAUDE.md
- `Zoho Boundary (Architecture Rule)` --semantically_similar_to--> `Zoho Boundary`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/stack-decision.md
- `Authorization Is Ours` --semantically_similar_to--> `Clerk Scoped to Identity Only`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/stack-decision.md
- `SponsorX Core Loop` --semantically_similar_to--> `§39 Protected Core Loop`  [INFERRED] [semantically similar]
  Memory/Initial Memory/01-project-overview.md → CLAUDE.md
- `Always Use Graphify Rule` --semantically_similar_to--> `Always-Use-Graphify Rule (Baseline Copy)`  [INFERRED] [semantically similar]
  CLAUDE.md → Memory/Initial Memory/03-rules-and-workflow.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Artefact Task Board System** — claude_task_board, claude_full_programme_task_board_xlsx, claude_google_sheet_task_board, memory_initial_memory_03_rules_and_workflow_task_board_rule [EXTRACTED 1.00]
- **§39 Protected Loop Delivery Chain** — claude_section_39_core_loop, documentation_sponsorx_phase1_build_roadmap_block_b, documentation_sponsorx_implementation_guide_v2_document, memory_initial_memory_01_project_overview_core_loop, memory_initial_memory_04_key_decisions_and_findings_operating_loop_is_the_product [INFERRED 0.85]
- **Sponsor Portal Redesign Pipeline (Spec → Plan → Shipped)** — docs_superpowers_specs_2026_09_11_sponsor_portal_redesign_design_document, docs_superpowers_plans_2026_09_11_sponsor_portal_redesign_document, memory_2026_09_11_tasks_completed_sponsor_portal_redesign, memory_2026_09_11_tasks_completed_stats_must_be_retrievable [EXTRACTED 1.00]
- **WHAT'S YOUR PREGAME MEAL? Pilot Campaign System** — graphify_out_converted_campaign_f7343c64_pregame_meal_campaign, graphify_out_converted_btg_sponsorx_prelaunch_operations_binder_8b3b39f1_pregame_meal_pilot, graphify_out_converted_btg_sponsorx_sponsor_campaign_agreement_and_brief_4e631412_campaign_brief_exhibit_a, graphify_out_converted_btg_sponsorx_athlete_campaign_order_c630d187_campaign_order, graphify_out_converted_sponsorx_youth_content_media_academy_branded_workbook_76628cab_youth_media_academy [EXTRACTED 1.00]
- **SponsorX Legal Agreement Framework (Master Agreement + Campaign Order + Sponsor Agreement + Brief)** — graphify_out_converted_sponsorx_athlete_content_collaboration_agreement_172716de_content_collaboration_agreement, graphify_out_converted_btg_sponsorx_athlete_campaign_order_c630d187_campaign_order, graphify_out_converted_btg_sponsorx_sponsor_campaign_agreement_and_brief_4e631412_sponsor_campaign_agreement, graphify_out_converted_btg_sponsorx_sponsor_campaign_agreement_and_brief_4e631412_campaign_brief_exhibit_a [EXTRACTED 1.00]
- **Four-Phase SponsorX Programme (Managed Marketplace to INFINEX)** — graphify_out_converted_btg_sponsorx_master_development_blueprint_integrated_athlete_network_f5776aa7_managed_micro_nil_marketplace, graphify_out_converted_btg_sponsorx_phases_2_4_detailed_developer_specifications_978a9117_phase2_marketplace, graphify_out_converted_btg_sponsorx_phases_2_4_detailed_developer_specifications_978a9117_phase3_intelligence_attribution, graphify_out_converted_btg_sponsorx_phases_2_4_detailed_developer_specifications_978a9117_phase4_infinex_integration, graphify_out_converted_btg_sponsorx_master_development_blueprint_609a437c_four_phase_roadmap [EXTRACTED 1.00]
- **The Six Load-Bearing Implementation Patterns** — documentation_sponsorx_implementation_guide_tenant_scoping, documentation_sponsorx_implementation_guide_transactional_outbox, documentation_sponsorx_implementation_guide_tracking_reward_funnel, documentation_sponsorx_implementation_guide_zoho_loop_prevention, documentation_sponsorx_implementation_guide_signature_capture, documentation_sponsorx_implementation_guide_authorization_matrix [EXTRACTED 1.00]
- **Zoho Sync Pipeline (Queued, Worker-Mediated, Loop-Safe)** — documentation_sponsorx_implementation_guide_transactional_outbox, documentation_sponsorx_implementation_guide_zoho_loop_prevention, documentation_sponsorx_stack_summary_zoho_boundary, documentation_sponsorx_stack_summary_railway_worker [INFERRED 0.85]
- **Fan Redemption Proof Loop (Scan to Verified Redemption)** — documentation_sponsorx_implementation_guide_tracking_reward_funnel, documentation_sponsorx_implementation_guide_single_use_redemption_index, documentation_sponsorx_plain_english_explainer_redemption_as_proof [INFERRED 0.85]

## Communities (56 total, 24 thin omitted)

### Community 0 - "Portal Layouts & Navigation"
Cohesion: 0.05
Nodes (36): react, NAV, NAV, NAV, NAV, metadata, LoginForm(), signIn() (+28 more)

### Community 1 - "Stack Decision & Vendors"
Cohesion: 0.05
Nodes (49): Addendum A — Reconciliation with Blueprint v2.0, Cloudflare R2, Data Residency — US East (Decided), SponsorX Stack Decision — Phase 1, Master Development Blueprint v2.0, No Tax ID Storage in Phase 1, One Thing to Operate, PDF Worker (Unconfirmed Requirement) (+41 more)

### Community 2 - "Admin & Portal Pages"
Cohesion: 0.08
Nodes (32): RewardAnalyticsPage(), AdminApprovalsPage(), stage(), AdminFinancePage(), AdminHomePage(), AthleteEarningsPage(), FilterKey, FILTERS (+24 more)

### Community 3 - "Next.js Project Config"
Cohesion: 0.05
Nodes (34): nextConfig, dependencies, next, react, react-dom, devDependencies, eslint, eslint-config-next (+26 more)

### Community 4 - "Campaign Builder Screens"
Cohesion: 0.09
Nodes (26): CampaignDashboardPage(), CampaignBuilderPage(), CampaignOrderPage(), STATE_TONE, AthleteProfilePage(), ICONS, STAGGER, TABS (+18 more)

### Community 5 - "Error & Loading States"
Cohesion: 0.09
Nodes (4): ErrorPanel(), MARKS, SkeletonBlock(), SkeletonRows()

### Community 6 - "Implementation Guide Core"
Cohesion: 0.14
Nodes (29): SponsorX Implementation Guide, Authorization Test Matrix, Vertical Slice Build Order, Campaign Order, Environments and Deploy Pipeline, Master Development Blueprint v2.0, Pinned Package Versions, Prisma Schema (Core Tables) (+21 more)

### Community 7 - "Applications & Shared UI"
Cohesion: 0.15
Nodes (20): AdminApplicationsPage(), STATE_TONE, STATE_TONE, HBarList(), EmptyState(), Badge(), Button(), Card() (+12 more)

### Community 8 - "Portal Redesign Plans"
Cohesion: 0.10
Nodes (22): A2 State & Polish + Portal-Wide Stats Wow — Implementation Plan, Sponsor Portal Redesign — Implementation Plan, Branded State System (states.tsx), ?demo= State Switcher, A2 State & Polish + Portal Wow — Design Spec, Frost Light Theme, Sponsor Portal Redesign — Design Spec, Locked Statistic Inventory (Stat → Source → Label) (+14 more)

### Community 9 - "Analytics & Charts"
Cohesion: 0.12
Nodes (18): AreaChart(), ChartLegend(), Donut(), FunnelSteps(), niceMax(), RadialGauge(), SeriesPoint, Sparkline() (+10 more)

### Community 10 - "Report Fixtures & Insights"
Cohesion: 0.16
Nodes (18): efficiency, formatInsight, formatPerformance, funnelDetail, geoInsight, geoMarkets, performanceSeries, platformSplit (+10 more)

### Community 11 - "Sponsor Portal Hero"
Cohesion: 0.14
Nodes (17): CAMPAIGN_TONE, spentPct, CHIP_TONES, HeroBand(), InsightStrip(), MiniChip(), MONO_TONES, Monogram() (+9 more)

### Community 12 - "Approvals & Athlete Pages"
Cohesion: 0.12
Nodes (16): QUEUE_ACTION, STATE_TONE, DELIVERABLE_TONE, dueKey(), EARNING_TONE, MONTHS, ProgressRing(), adminApprovalsX (+8 more)

### Community 13 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 14 - "UI Mockups (Sheet 1)"
Cohesion: 0.16
Nodes (18): Screen 6: Athlete Profile (follower/engagement stats, available inventory pricing, Request Partnership CTA), Screen 8: Campaign Builder (4-step wizard: inventory, details, rewards, review & launch), Screen 9: Campaign Dashboard (views/engagements over time, top content list, tabbed detail), Dark Theme Design Language, Screen 11: Fan/Reward Analytics (QR scans, offers claimed, redemptions over time, top locations), Screen 1: SponsorX Homepage (hero: Maximize Impact. Measure Results. Reward Fans.), Screen 7: Inventory Listing (Player of the Week package detail, est. views/CPM/price, Add to Campaign), Screen 4: Marketplace (filterable card grid of sponsorship inventory with CPM/price) (+10 more)

### Community 15 - "Finance & Earnings Pages"
Cohesion: 0.13
Nodes (15): EARNING_TONE, INVOICE_TONE, EARNING_TONE, SearchParams, adminFinanceX, adminOps, athleteCareer, athleteEarningsTrend (+7 more)

### Community 16 - "Blueprint v1 Foundations"
Cohesion: 0.13
Nodes (17): Data Quality Flags (VERIFIED_API / VERIFIED_MANUAL / SELF_REPORTED / ESTIMATED / ATTRIBUTED), BTG SponsorX Master Development Blueprint v1.0 (Aug 2026), Phase 1-4 Development Roadmap (v1), INFINEX World API Architecture (v1), RBAC + Tenant Scoping Permission Model, 12 Core Screen Product Specification, Zoho CRM Integration (v1 Spec), Commerce Attribution Framework (Pluggable Methodology) (+9 more)

### Community 17 - "UI Mockups (Sheet 2)"
Cohesion: 0.20
Nodes (16): Screen 6: Athlete Profile (Shammah Kwizera — verified badge, follower/engagement/reach stats, priced Available Inventory list, About/Interests, Request Partnership CTA), Screen 8: Campaign Builder (4-step wizard: Select Inventory → Campaign Details → Rewards → Review & Launch; budget/CPM/est. views inputs and platform pickers), Screen 9: Campaign Dashboard (single-campaign view with delivery progress vs goal, performance-over-time chart, top content list), Visual design system (dark navy sidebar + violet/purple #7C3AED-style accent, white card surfaces, rounded corners, KPI stat cards with green delta chips), Screen 11: Fan / Reward Analytics (QR scans 8,200, offers claimed 4,300, rewards redeemed 1,250, revenue attributed $52,500; redemptions over time, top locations, top offers), Screen 1: SponsorX Homepage (hero 'Maximize Impact. Measure Results. Reward Fans.' + stats bar 1.2M+ reach / 250+ athletes / 150+ sponsors / 2.4M+ fans), Screen 7: Inventory Listing detail (Player of the Week package — CPM $16, est. price $19,200, exclusivity, 26-week duration, included placements, Add to Campaign), Screen 4: Marketplace (filterable card grid of sponsorship inventory with est. views, CPM and price per listing) (+8 more)

### Community 18 - "Schools Infographic Pitch"
Cohesion: 0.22
Nodes (16): Athlete Role (Builds Skills, Brand, Real-World Experience), SponsorX Brand Identity (Dark Stadium Theme, Blue/Orange Accents, Taglines: Beyond The Game, Same City Bigger Opportunities), BTG/SponsorX Role (Creates Connections, Provides Education, Manages Programs), BTG Sports Group (Beyond The Game), Campaign Role (Content, Events, Community Engagement), Athlete & Community Impact (Opportunities, Stronger Communities, Brighter Futures), Five Footer Pillars (Athlete Development, Sponsorship, Education, Media, Community), SponsorX for Schools Infographic (Partner Pitch One-Pager) (+8 more)

### Community 19 - "Marketing Homepage"
Cohesion: 0.16
Nodes (10): DELAYS, PACKAGES, STEPS, BuildPreview(), EXTRA, Screen, SCREENS, CountUp() (+2 more)

### Community 20 - "QR Reward Engine Overview"
Cohesion: 0.15
Nodes (14): QR Reward & Fan Commerce Engine, Immediate Build Priority Loop (Section 39), Cross-Phase Engineering Standards (API-First, Idempotency, Explainability, Provider Abstraction), SponsorX System Overview - Plain English Guide, SponsorX Is Not a Game (Positioning Clarification), Four-Step QR Reward Funnel (Scan / Land / Claim / Redeem), Three Front Doors (Sponsor / Athlete / BTG Admin Portals), One App Shell, Three Role-Aware Portals (+6 more)

### Community 21 - "Blueprint v2 Athlete Network"
Cohesion: 0.19
Nodes (13): BTG Anchor Athlete, BTG SponsorX Master Development Blueprint v2.0 - Integrated Athlete Network (Sep 2026), Managed Micro-NIL Athlete Network / Marketplace (Phase 1 Strategy), Phase 1 State Machines (Application/Brief/Order/Deliverable/Campaign/Earnings/Reward), Sponsor Package Catalog (Test Drive to Season Partner), SponsorX Content Partner (Non-Exclusive Athlete), BTG SponsorX Athlete Network Program (Managed Micro-NIL Launch), My View - Founder Strategy Note (Athlete Network Program, 90-Day Launch) (+5 more)

### Community 22 - "Campaign Order Agreements"
Cohesion: 0.18
Nodes (12): Campaign Order (Athlete Campaign Authorization), BTG SponsorX Athlete Campaign Order (Template), Paid Media Not Included By Default, Campaign Order Workflow (Blueprint v2), Pilot Campaign: WHAT'S YOUR PREGAME MEAL?, Sponsor Campaign Brief (Exhibit A), SponsorX Sponsor Campaign Agreement & Brief (Template), Sponsor Campaign Agreement (+4 more)

### Community 23 - "Partner School Playbook"
Cohesion: 0.18
Nodes (11): Core Operating Loop v1 (Property to Renewal), Athlete Content Value Score, Core Operating Loop v2 (Sponsor Brief to Renewal), Athlete Readiness Scoring Rubric (Developing / Nearly Ready / Sponsor Ready), BTG Partner School Execution Plan (12-Month Playbook), Partner School Package ($5,000 / 25 Athletes / 12 Months), Sponsor Qualification Score (School Alignment / Reputation / Activation Fit), Four Athlete-Development Workshops (NIL, Financial Literacy, Branding, Media Readiness) (+3 more)

### Community 24 - "Admin Dashboard Queue"
Cohesion: 0.22
Nodes (7): HEALTH_CHIP, QueueTicker(), adminActivity, HEALTH_COPY, HealthStatus, integrationHealth, sponsorCampaigns

### Community 25 - "Auth & Tenant Scoping"
Cohesion: 0.25
Nodes (8): Clerk, Clerk Scoped to Identity Only, Authorization Is Ours, Authorization Test Matrix (authz.matrix.test.ts), V2 Prisma Schema, Tenant Scoping Pattern (actor.ts / scope.ts), Two Tracking Funnels (RewardEvent vs TrackingLink), Multi-Tenant From Day One

### Community 26 - "CPM Pricing Strategy"
Cohesion: 0.29
Nodes (8): CPM & Pricing Algorithm (Multiplier Formula), Dynamic CPM Engine (Versioned, Explainable Pricing Service), Athletiverse (Comparable Product / Model Validation), BTG Sponsorship Score (BSS) Pricing Formula, My View - Founder Strategy Note (Platform Vision, Athletiverse Analysis), Guaranteed View Model (Views, Not Logo Placement), Nielsen (Sponsorship Measurement Reference), SponsorX Pro / Enterprise SaaS Expansion Model

### Community 27 - "Insight Carousel Component"
Cohesion: 0.39
Nodes (6): InsightCarousel(), nudge(), onScroll(), slideTo(), stepSize(), InsightItem

### Community 28 - "Prelaunch Operations Binder"
Cohesion: 0.29
Nodes (7): Phase 1 Managed Campaign Workflow (Brief, Eligibility Filter, Manual Matching), Standard NIL Job Catalog SX-01..SX-07, Athlete Code of Conduct, SponsorX Campaign Playbook / SOP (12-Step Operating Procedure), SponsorX Prelaunch Operations Binder (24-Document System), Athlete NIL Rate Card (SX-01..SX-07 Prelaunch), Two-Price Model (Athlete Pay vs Sponsor Price = BTG Margin)

### Community 30 - "Task Board Artefacts"
Cohesion: 0.50
Nodes (5): SponsorX Full Programme Task Board (xlsx), Google Sheet — SponsorXFullProgrammeTaskBoard, Task Board — Three Artefacts, Three Jobs, Full Programme Task Board Build (All Four Phases), Task-Board Rule (Three Artefacts, One Daily Habit)

### Community 31 - "Portal Hero Concepts"
Cohesion: 0.50
Nodes (4): Differentiated Portal Heroes, Command Deck Hero Band, Executive Bento Grid, Radial ROI Gauge

### Community 34 - "Pricing & NIL Catalog"
Cohesion: 0.67
Nodes (3): CPM Pricing Formula, NIL Jobs SX-01 – SX-07, Sponsor Packages

## Ambiguous Edges - Review These
- `BTG SponsorX System Overview Plain English (docx)` → `SponsorX Plain English Explainer (HTML)`  [AMBIGUOUS]
  documentation/SponsorX-Plain-English-Explainer.html · relation: conceptually_related_to
- `BTG SponsorX Systems Architecture (Draft 0.1, Phase 1)` → `My View - Founder Strategy Note (Platform Vision, Athletiverse Analysis)`  [AMBIGUOUS]
  graphify-out/converted/BTG_SponsorX_Systems_Architecture_d593563b.md · relation: cites

## Knowledge Gaps
- **181 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 254 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `BTG SponsorX System Overview Plain English (docx)` and `SponsorX Plain English Explainer (HTML)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `BTG SponsorX Systems Architecture (Draft 0.1, Phase 1)` and `My View - Founder Strategy Note (Platform Vision, Athletiverse Analysis)`?**
  _Edge tagged AMBIGUOUS (relation: cites) - confidence is low._
- **Why does `react` connect `Portal Layouts & Navigation` to `Next.js Project Config`, `Error & Loading States`, `Applications & Shared UI`, `Analytics & Charts`, `Sponsor Portal Hero`, `Approvals & Athlete Pages`, `Marketing Homepage`, `Insight Carousel Component`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Portal Layouts & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.05017921146953405 - nodes in this community are weakly interconnected._
- **Should `Stack Decision & Vendors` be split into smaller, more focused modules?**
  _Cohesion score 0.04846938775510204 - nodes in this community are weakly interconnected._
- **Should `Admin & Portal Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.08367071524966262 - nodes in this community are weakly interconnected._