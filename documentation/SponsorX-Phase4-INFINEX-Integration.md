# SponsorX — Phase 4 · INFINEX World Integration

**BTG SPORTS GROUP · SPONSORX · PHASE 4 · INFINEX WORLD INTEGRATION**

| | |
|---|---|
| **Goal** | Make virtual worlds first-class SponsorX inventory. Sponsors buy, activate, measure and renew virtual placements in the same campaign system used for athletes, events and fan rewards. |
| **Tasks** | 51 · 207 person-days |
| **Blueprint timeline** | 18–22 weeks |
| **Balanced budget** | $90K–$150K |
| **Depends on** | Stable SponsorX APIs, campaign/reward engine, identity/session model, metrics pipeline |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0 (Spec § references) + Blueprint §34 |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 71 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) **← you are here** | 51 | 18–22 weeks |

---

## ⚙️ How this project is tracked — read this first

Three artefacts, three jobs. Keeping them straight is what stops them drifting apart.

| Artefact | Owns | When it changes | Who touches it |
|---|---|---|---|
| **These four Markdown files** | The **plan** — what each task is, in plain English, and what *done* means | Only when scope or a task's meaning changes | Anyone, by pull request, reviewed like code |
| **`SponsorX-Full-Programme-Task-Board.xlsx`** | The **working tracker** — all four phases consolidated in one file | Continuously, during the day | Every developer, as they work |
| **Google Sheet** [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/) | The **published status** — what the team and stakeholders see | Once a day, at end of day | Whoever worked that day |

### 🔁 The daily rule

> **During the day:** tag your task **In progress** in the consolidated **xlsx**. Set your name in `Owner` and fill in `Date Started`. Move it to `Code review`, then `Done`, as it advances.
>
> **At end of day:** whatever state your tasks are in — finished, half-done, blocked, untouched — **update the Google Sheet to match.** That is the copy other people read. A task left `Blocked` in the Sheet when you have actually finished it is a teammate sitting idle tomorrow for no reason.
>
> **Reference the task ID** (e.g. `2S5-BE-04`) in your branch name and commit message so the row and the code can be matched later.

If a task's *definition* turns out to be wrong — the acceptance criteria don't hold, or it should be two tasks — fix it **here**, in the Markdown, by pull request. Don't quietly reinterpret it in the tracker.

**No spreadsheet is committed to this repository.** `documentation/*.xlsx` is gitignored: a committed binary goes stale against the Sheet the moment anyone edits it, and cannot be reviewed in a diff.

---

## Reading a task

| Field | Meaning |
|---|---|
| **ID** | `4S{sprint}-{CAT}-{nn}`, e.g. `4S5-BE-04` — Phase 4, Sprint 5, Backend, task 04. |
| **Order** | Sequence within the phase, following the blueprint's own sprint plan. |
| **Where** | Where the work physically happens — see the table below. A document task and a dashboard task look identical in a list; this is what separates them. |
| **Weight** | S=1 · M=3 · L=5 person-days. Estimates for one person, not calendar commitments. |
| **Status** | `Ready` no unmet prerequisites · `In progress` · `Code review` · `Blocked` · `Done`. |
| **Done when** | The observable condition that closes the task. If you cannot demonstrate it, it is not done. |

## Where the work happens

| Value | Meaning |
|---|---|
| **Document** | A written decision or specification. No system is touched — the output is a document people agree on. |
| **Zoho dashboard** | Configuration clicked through the Zoho CRM admin UI (Setup → Modules and Fields, API credentials, users). |
| **Vendor console** | Configuration in a vendor's own UI — Railway, Cloudflare, Clerk, the payment or email provider. |
| **Code** | Work in the repository: schema, domain logic, routes, worker jobs, UI, tests, CI. |
| **Code + console** | Both: something configured at the vendor AND wired in the codebase. |
| **Design tool** | Visual design work producing artwork, diagrams or screen designs. |
| **Document + code** | A written policy that must then be enforced in the codebase. |
| **External · counsel** | Performed by a lawyer, not the team. Longest lead times in the programme — start these early. |

## Categories

| Code | Category | Covers |
|---|---|---|
| **FE** | Frontend Engineering | Next.js routes, server components, client islands, forms, charts, responsive and theme work |
| **BE** | Backend Engineering | Prisma schema and migrations, domain functions, route handlers, worker jobs, queue, scoping |
| **INT** | Integrations | Zoho CRM + Books, Clerk, R2, transactional email, social-platform APIs, webhooks |
| **OPS** | DevOps & Infrastructure | Railway project and services, environments, CI/CD, migrations, backups, monitoring, runbooks |
| **ART** | Design & Art | Brand system, theme tokens, logo and asset production, screen design, illustration, QR and report design, marketing visuals |
| **QA** | Quality Assurance & Testing | Unit, authorisation matrix, E2E, accessibility, performance, UAT scripts |
| **SEC** | Security & Compliance (engineering) | Tenant isolation, field-level authz, consent capture, PII handling, audit logging, MFA |
| **DATA** | Data & Analytics | Metric provenance, rollups, Content Value Score, seed and import jobs, reporting datasets |
| **LEG** | Legal & Policy | Counsel-approved templates, guardian authorisation, privacy review, reward terms, payment policy. Not developer work — but it blocks developer work. |
| **PMO** | Product, Docs & Delivery | Gate decisions, §38 deliverables, RBAC matrix, ERD, Zoho field mapping, admin guide, handoff documentation |

## Do not overlap these phases carelessly

The specification is explicit about what may and may not run in parallel:

**Permitted.** Begin Phase 3 warehouse and event modelling during the final 4–6 weeks of Phase 2, so transaction data is captured correctly from launch. Begin the Phase 4 API contract and placement taxonomy during the final 4 weeks of Phase 3.

**Forbidden.** Do not build ML pricing before there is enough clean history — launch Phase 3 on rules and statistics. Do not launch marketplace payouts before commission snapshots, reconciliation, refund and dispute behaviour and audit logs are fully tested. Do not report virtual impressions to sponsors until viewability and de-duplication criteria are validated against pilot-world telemetry.

---

# The tasks

## Sprint 0 · Contract & taxonomy

*Confirm the INFINEX runtime, identity model, telemetry volume and the world/placement taxonomy before a line of code.*

*5 tasks · 17 person-days*

### ⏸ `4S0-PMO-01` · Confirm the INFINEX runtime and identity model

**Order** 1 · **PMO** · **Where:** Document · **3d** · **Blocked**

Which engine, which environments, how sessions and users are identified. Everything downstream assumes stable world, zone and placement IDs — if those churn, the inventory churns with them.

- **Depends on:** Phase 3 complete
- **Done when:** Runtime, environment versioning and identity/session model confirmed in writing
- **Reference:** Spec §33

### ⏸ `4S0-PMO-02` · Agree the world and placement taxonomy

**Order** 2 · **PMO** · **Where:** Document · **3d** · **Blocked**

World, district, venue, zone, surface. Getting this vocabulary right once saves renaming an inventory model later.

- **Depends on:** 4S0-PMO-01
- **Done when:** Taxonomy documented and mapped to SponsorX entities
- **Reference:** Spec §25, §27.1

### ⏸ `4S0-PMO-03` · Estimate telemetry volume and cost

**Order** 3 · **PMO** · **Where:** Document · **3d** · **Blocked**

Virtual worlds emit far more events than a QR code does. Size the ingestion, storage and warehouse cost before committing to an architecture.

- **Depends on:** 4S0-PMO-01
- **Done when:** Event volume estimated per concurrent user with an infrastructure cost model
- **Reference:** Spec §31, §38

### ⏸ `4S0-ART-01` · Design the virtual admin and sponsor screens

**Order** 4 · **ART** · **Where:** Design tool · **5d** · **Blocked**

Twelve new screens including placement preview metadata, activation builder and the world heatmap. Placement specs need a designer who understands 3D constraints.

- **Depends on:** 4S0-PMO-02
- **Done when:** All 12 Phase 4 screens designed, with creative technical constraints specified per placement type
- **Reference:** Spec §26

### ⏸ `4S0-SEC-01` · Trusted client authentication design

**Order** 5 · **SEC** · **Where:** Code · **3d** · **Blocked**

The INFINEX client sends telemetry that becomes sponsor billing data. Its authentication has to be strong enough that fabricated events are not possible.

- **Depends on:** 4S0-PMO-01
- **Done when:** Client authentication and event signing design reviewed and approved
- **Reference:** Spec §29, §31

## Sprint 1 · World & placement registry

*Map INFINEX worlds, zones and surfaces into SponsorX entities that can actually be sold.*

*7 tasks · 25 person-days*

### ⏸ `4S1-BE-01` · World and zone registry

**Order** 6 · **BE** · **Where:** Code · **3d** · **Blocked**

Register INFINEX worlds and their districts, venues and zones against stable external IDs.

- **Depends on:** 4S0-PMO-02
- **Done when:** SponsorX can register a world and its zones against stable external IDs
- **Reference:** Spec §28, §30

### ⏸ `4S1-BE-02` · Virtual placement model

**Order** 7 · **BE** · **Where:** Code · **5d** · **Blocked**

Billboards, LED surfaces, naming rights, branded rooms, courts, tunnels, kiosks. Each with technical creative constraints, a viewability rule and capacity.

- **Depends on:** 4S1-BE-01
- **Done when:** A placement can be registered with specs, viewability rule and availability
- **Reference:** Spec §30

### ⏸ `4S1-BE-03` · Map placements to sellable inventory

**Order** 8 · **BE** · **Where:** Code · **3d** · **Blocked**

The join that makes virtual surfaces purchasable through the same campaign system as everything else.

- **Depends on:** 4S1-BE-02
- **Done when:** A virtual placement maps to a sellable SponsorX inventory record
- **Reference:** Spec §27.1

### ⏸ `4S1-BE-04` · Placement availability windows

**Order** 9 · **BE** · **Where:** Code · **3d** · **Blocked**

Sellable time windows with capacity, so two sponsors cannot buy the same billboard for the same week.

- **Depends on:** 4S1-BE-02
- **Done when:** Overlapping purchases of the same placement are rejected
- **Reference:** Spec §30

### ⏸ `4S1-FE-01` · Build the world registry screen

**Order** 10 · **FE** · **Where:** Code · **3d** · **Blocked**

Worlds, districts, venues, zones, environment IDs and operational status.

- **Depends on:** 4S0-ART-01
- **Done when:** Admin can register and manage worlds and zones
- **Reference:** Spec §26 P4-01

### ⏸ `4S1-FE-02` · Build the placement manager

**Order** 11 · **FE** · **Where:** Code · **5d** · **Blocked**

Placement IDs, dimensions and type, zone, viewability rules, dates and pricing.

- **Depends on:** 4S1-BE-02
- **Done when:** Admin can create, configure and price placements
- **Reference:** Spec §26 P4-02

### ⏸ `4S1-FE-03` · Build placement preview metadata

**Order** 12 · **FE** · **Where:** Code · **3d** · **Blocked**

Thumbnail, orientation, allowed creative types, technical constraints and placement test status — so a sponsor knows what they are buying.

- **Depends on:** 4S1-BE-02
- **Done when:** Preview metadata renders and shows the placement's staging test status
- **Reference:** Spec §26 P4-03

## Sprint 2 · Manifest & creative deployment

*The service INFINEX asks: what should I be showing right now?*

*6 tasks · 24 person-days*

### ⏸ `4S2-BE-01` · Creative deployment model

**Order** 13 · **BE** · **Where:** Code · **5d** · **Blocked**

Associate approved sponsor assets with placements, versioned, with start and end times.

- **Depends on:** 4S1-BE-03
- **Done when:** A deployment record ties campaign, placement, asset version and schedule
- **Reference:** Spec §27.2, §30

### ⏸ `4S2-BE-02` · Creative validation against placement specs

**Order** 14 · **BE** · **Where:** Code · **3d** · **Blocked**

Reject assets that do not fit the surface before they reach the world, not after a sponsor complains.

- **Depends on:** 4S2-BE-01
- **Done when:** An asset failing the placement's technical constraints is rejected at upload
- **Reference:** Spec §27.2

### ⏸ `4S2-BE-03` · Active manifest service

**Order** 15 · **BE** · **Where:** Code · **5d** · **Blocked**

The endpoint INFINEX calls to ask what is live right now. Must return only approved, in-window deployments for the requested world and time.

- **Depends on:** 4S2-BE-01
- **Done when:** Manifest returns only approved, in-window deployments for the requested world and time
- **Reference:** Spec §28, §34

### ⏸ `4S2-BE-04` · Signed asset delivery through the CDN

**Order** 16 · **BE** · **Where:** Code · **3d** · **Blocked**

Creative is served fast and signed, so assets cannot be lifted from the URL.

- **Depends on:** 4S2-BE-03
- **Done when:** Creative is delivered through signed, short-lived CDN URLs
- **Reference:** Spec §31

### ⏸ `4S2-BE-05` · Deployment pause and rollback

**Order** 17 · **BE** · **Where:** Code · **3d** · **Blocked**

A sponsor needs their creative down in minutes, not at the next release. Pausing invalidates the manifest and the prior asset state.

- **Depends on:** 4S2-BE-03
- **Done when:** Creative can be paused or rolled back from SponsorX without redeploying the INFINEX application
- **Reference:** Spec §27.2, §34

### ⏸ `4S2-FE-01` · Build the creative deployment console

**Order** 18 · **FE** · **Where:** Code · **5d** · **Blocked**

Assign creative version, approve, schedule, publish and roll back.

- **Depends on:** 4S0-ART-01
- **Done when:** Staff can run the full deployment lifecycle from the console
- **Reference:** Spec §26 P4-05

## Sprint 3 · INFINEX client integration

*The game-engine side: consume the manifest, render placements, report health.*

*4 tasks · 12 person-days*

### ⏸ `4S3-INT-01` · INFINEX client manifest consumption

**Order** 19 · **INT** · **Where:** Code · **5d** · **Blocked**

Game-engine side: fetch the manifest, cache it sensibly, and render the right asset version.

- **Depends on:** 4S2-BE-03
- **Done when:** The INFINEX client renders a sponsored placement using the correct asset version
- **Reference:** Spec §34

### ⏸ `4S3-INT-02` · Client registry and heartbeat

**Order** 20 · **INT** · **Where:** Code · **3d** · **Blocked**

Trusted clients register with a key and report health, so you know when a world stops rendering sponsorship.

- **Depends on:** 4S3-INT-01
- **Done when:** Client heartbeat reports and a missing heartbeat raises an alert
- **Reference:** Spec §28, §30

### ⏸ `4S3-INT-03` · Client configuration endpoint

**Order** 21 · **INT** · **Where:** Code · **1d** · **Blocked**

Feature flags, telemetry limits and schema versions delivered to the client so behaviour can change without a client release.

- **Depends on:** 4S3-INT-01
- **Done when:** Client reads config remotely and honours telemetry limits
- **Reference:** Spec §28

### ⏸ `4S3-QA-01` · Staging world placement test

**Order** 22 · **QA** · **Where:** Code · **3d** · **Blocked**

A placement is only AVAILABLE after it renders correctly in a staging world.

- **Depends on:** 4S3-INT-01
- **Done when:** Placement passes the staging test before it can be marked available
- **Reference:** Spec §27.1

## Sprint 4 · Telemetry ingestion

*High-volume batch event intake that never double-counts.*

*5 tasks · 21 person-days*

### ⏸ `4S4-BE-01` · Telemetry batch ingestion endpoint

**Order** 23 · **BE** · **Where:** Code · **5d** · **Blocked**

Batched events with service authentication. Validates schema, timestamp, placement-campaign relationship, signature and replay indicators.

- **Depends on:** 4S0-SEC-01
- **Done when:** Batch endpoint supports idempotent event IDs and rejects malformed or unauthorised events
- **Reference:** Spec §28, §34

### ⏸ `4S4-BE-02` · Event schema and versioning

**Order** 24 · **BE** · **Where:** Code · **3d** · **Blocked**

The shared contract: event_id, schema_version, event_type, occurred_at, world/zone/placement, session, dwell, interaction type. Versioned so client and server can evolve apart.

- **Depends on:** 4S4-BE-01
- **Done when:** Schema is versioned and a mismatched version is rejected with a clear error
- **Reference:** Spec §29

### ⏸ `4S4-BE-03` · Idempotent de-duplication

**Order** 25 · **BE** · **Where:** Code · **5d** · **Blocked**

Clients retry. Networks duplicate. Duplicate telemetry must never inflate a sponsor's numbers — this is billing data.

- **Depends on:** 4S4-BE-01
- **Done when:** Repeated duplicate telemetry does not inflate sponsor reports
- **Reference:** Spec §34

### ⏸ `4S4-OPS-01` · Event streaming and buffering

**Order** 26 · **OPS** · **Where:** Vendor console · **5d** · **Blocked**

A queue in front of ingestion so a traffic burst in-world does not drop sponsorship data.

- **Depends on:** 4S4-BE-01
- **Done when:** Ingestion sustains the agreed burst rate with buffering and no event loss
- **Reference:** Spec §31, §38

### ⏸ `4S4-DATA-01` · Raw event storage

**Order** 27 · **DATA** · **Where:** Code · **3d** · **Blocked**

Durable raw telemetry, kept separate from aggregates, so any number can be recomputed from source.

- **Depends on:** 4S4-BE-01
- **Done when:** Raw events are durably stored and aggregates are reproducible from them
- **Reference:** Spec §30

## Sprint 5 · Viewability & aggregates

*Turn raw renders into impressions a sponsor can be billed for honestly.*

*5 tasks · 23 person-days*

### ⏸ `4S5-BE-01` · Viewability rule engine

**Order** 28 · **BE** · **Where:** Code · **5d** · **Blocked**

Versioned rules — minimum visible percentage and minimum dwell — decide which renders count as viewable impressions.

- **Depends on:** 4S4-DATA-01
- **Done when:** Viewable impressions are calculated per versioned rule and remain distinct from gross renders
- **Reference:** Spec §30, §34

### ⏸ `4S5-DATA-01` · Virtual metric aggregation job

**Order** 29 · **DATA** · **Where:** Code · **5d** · **Blocked**

Visits, gross impressions, viewable impressions, dwell, interactions, challenge metrics and session-level uniques.

- **Depends on:** 4S5-BE-01
- **Done when:** Aggregates compute on schedule and dashboards read aggregates, never raw telemetry
- **Reference:** Spec §27.3

### ⏸ `4S5-DATA-02` · World traffic benchmarks

**Order** 30 · **DATA** · **Where:** Code · **3d** · **Blocked**

Baseline visits, dwell and interaction rates per world and zone — the inputs to virtual pricing.

- **Depends on:** 4S5-DATA-01
- **Done when:** Traffic benchmarks compute per world and zone
- **Reference:** Spec §30, §32

### ⏸ `4S5-FE-01` · Build the virtual metrics dashboard

**Order** 31 · **FE** · **Where:** Code · **5d** · **Blocked**

Visits, impressions, viewable impressions, dwell, interactions, completion and the reward funnel.

- **Depends on:** 4S5-DATA-01
- **Done when:** Dashboard renders virtual delivery with gross and viewable clearly separated
- **Reference:** Spec §26 P4-07

### ⏸ `4S5-BE-02` · Virtual pricing model

**Order** 32 · **BE** · **Where:** Code · **5d** · **Blocked**

Rules-based and transparent first: base rate × traffic × viewability × dwell × scarcity × exclusivity × seasonality × integration depth.

- **Depends on:** 4S5-DATA-02
- **Done when:** A virtual placement produces a recommended rate with its factor breakdown visible
- **Reference:** Spec §32

## Sprint 6 · Activations & rewards

*Challenges and quests that complete exactly once and trigger a real reward.*

*5 tasks · 23 person-days*

### ⏸ `4S6-BE-01` · Activation definition model

**Order** 33 · **BE** · **Where:** Code · **5d** · **Blocked**

Challenges, quests, scavenger hunts, skill tests, product discovery and sponsor booths, with start conditions, completion criteria and reward triggers.

- **Depends on:** 4S2-BE-01
- **Done when:** An activation can be defined with rules, completion criteria and a linked reward
- **Reference:** Spec §30

### ⏸ `4S6-BE-02` · Activation start and complete flow

**Order** 34 · **BE** · **Where:** Code · **5d** · **Blocked**

Validate completion against activation, session and user constraints before anything is awarded.

- **Depends on:** 4S6-BE-01
- **Done when:** Activation can start and complete, validated against its eligibility rules
- **Reference:** Spec §27.4

### ⏸ `4S6-BE-03` · Reward trigger with exactly-once guarantee

**Order** 35 · **BE** · **Where:** Code · **5d** · **Blocked**

The in-world equivalent of Phase 1's single-use QR redemption, and it needs the same database-level guarantee rather than application logic.

- **Depends on:** 4S6-BE-02
- **Done when:** An activation triggers a SponsorX reward exactly once per configured eligibility rule
- **Reference:** Spec §34

### ⏸ `4S6-INT-01` · Wire in-world rewards to the wallet service

**Order** 36 · **INT** · **Where:** Code · **3d** · **Blocked**

Completion produces a claim token and deep link; the fan receives it in-world and optionally by wallet, SMS or email.

- **Depends on:** 4S6-BE-03
- **Done when:** A completed activation delivers a reward through the existing reward and wallet services
- **Reference:** Spec §27.4

### ⏸ `4S6-FE-01` · Build the activation builder

**Order** 37 · **FE** · **Where:** Code · **5d** · **Blocked**

Challenge rules, start condition, completion criteria, reward trigger and sponsor content.

- **Depends on:** 4S0-ART-01
- **Done when:** A campaign manager can build and publish an activation without engineering help
- **Reference:** Spec §26 P4-06

## Sprint 7 · Cross-channel reporting

*INFINEX alongside social, event and athlete inventory — without double counting.*

*5 tasks · 25 person-days*

### ⏸ `4S7-BE-01` · Cross-channel campaign model extension

**Order** 38 · **BE** · **Where:** Code · **5d** · **Blocked**

One campaign holding real-world, social, athlete, reward and INFINEX inventory together.

- **Depends on:** 4S1-BE-03
- **Done when:** A single campaign can contain virtual and non-virtual inventory
- **Reference:** Spec §25

### ⏸ `4S7-DATA-01` · Cross-channel aggregation without double counting

**Order** 39 · **DATA** · **Where:** Code · **5d** · **Blocked**

The hard part. A fan who scans a QR and completes an in-world challenge is one person, and must not be counted twice.

- **Depends on:** 4S7-BE-01
- **Done when:** Cross-channel dashboard shows INFINEX metrics alongside other channels without double counting
- **Reference:** Spec §34

### ⏸ `4S7-FE-01` · Build the cross-channel campaign dashboard

**Order** 40 · **FE** · **Where:** Code · **5d** · **Blocked**

Compare INFINEX against social, streaming, event and athlete inventory in one view.

- **Depends on:** 4S7-DATA-01
- **Done when:** Dashboard compares all channels on consistent metrics
- **Reference:** Spec §26 P4-08

### ⏸ `4S7-FE-02` · Build the sponsor activation report

**Order** 41 · **FE** · **Where:** Code · **5d** · **Blocked**

Virtual activation summary with content, engagement, rewards, screenshots and proofs, and recommended next actions.

- **Depends on:** 4S5-FE-01
- **Done when:** A pilot sponsor receives a report with virtual delivery, interaction, reward funnel and creative proof
- **Reference:** Spec §26 P4-11, §34

### ⏸ `4S7-FE-03` · Build the world heatmap and zone insights

**Order** 42 · **FE** · **Where:** Code · **5d** · **Blocked**

Aggregated zone traffic and engagement, where INFINEX telemetry supports it.

- **Depends on:** 4S5-DATA-02
- **Done when:** Heatmap renders zone-level traffic and engagement
- **Reference:** Spec §26 P4-12

## Sprint 8 · Operations & load

*The kill switch, the incident log, and proof it holds under load.*

*5 tasks · 21 person-days*

### ⏸ `4S8-FE-01` · Build the INFINEX operations console

**Order** 43 · **FE** · **Where:** Code · **5d** · **Blocked**

Health, event lag, placement failures, creative mismatch, kill switch and incident log.

- **Depends on:** 4S3-INT-02
- **Done when:** Console displays event lag, client heartbeat, deployment failures and active incidents
- **Reference:** Spec §26 P4-09, §34

### ⏸ `4S8-BE-01` · Emergency pause and kill switch

**Order** 44 · **BE** · **Where:** Code · **3d** · **Blocked**

One control that takes a sponsor's creative down across every world immediately. You will need it on a Friday evening.

- **Depends on:** 4S2-BE-05
- **Done when:** Emergency pause removes creative from all worlds within the agreed time target
- **Reference:** Spec §28

### ⏸ `4S8-BE-02` · Deployment incident log

**Order** 45 · **BE** · **Where:** Code · **3d** · **Blocked**

Type, severity, opened and closed times, notes. Ops history a sponsor can be shown.

- **Depends on:** 4S8-BE-01
- **Done when:** Incidents are logged, tracked and closable with notes
- **Reference:** Spec §30

### ⏸ `4S8-DATA-01` · Virtual fraud and anomaly checks

**Order** 46 · **DATA** · **Where:** Code · **5d** · **Blocked**

Invalid or suspicious event patterns flagged before they reach a sponsor report — this is Phase 3's anomaly work applied to telemetry.

- **Depends on:** 4S4-BE-03
- **Done when:** Suspicious event patterns are flagged and excluded from sponsor-facing aggregates
- **Reference:** Spec §27.3

### ⏸ `4S8-OPS-01` · Load test event ingestion and dashboards

**Order** 47 · **OPS** · **Where:** Code · **5d** · **Blocked**

Prove the throughput and dashboard latency targets hold at expected Phase 4 traffic, before a pilot world goes live.

- **Depends on:** 4S4-OPS-01
- **Done when:** Load test meets the agreed ingestion throughput and dashboard latency targets
- **Reference:** Spec §34

## Sprint 9 · Pilot world launch

*One world, real sponsors, validated telemetry, calibrated pricing.*

*4 tasks · 16 person-days*

### ⏸ `4S9-QA-01` · Telemetry validation against the pilot world

**Order** 48 · **QA** · **Where:** Code · **5d** · **Blocked**

Compare what the client emitted against what SponsorX recorded, event by event, in a real world.

- **Depends on:** 4S8-OPS-01
- **Done when:** Telemetry reconciles between client and server within defined tolerance
- **Reference:** Spec §33

### ⏸ `4S9-PMO-01` · Calibrate virtual pricing against real traffic

**Order** 49 · **PMO** · **Where:** Document · **3d** · **Blocked**

The pricing model was built on assumptions. Pilot traffic replaces them with measurements.

- **Depends on:** 4S9-QA-01
- **Done when:** Virtual rates recalibrated against observed traffic, viewability and dwell
- **Reference:** Spec §32

### ⏸ `4S9-PMO-02` · Pilot sponsor UAT

**Order** 50 · **PMO** · **Where:** Document · **5d** · **Blocked**

A real sponsor runs a real virtual activation and receives a real report.

- **Depends on:** 4S9-QA-01
- **Done when:** All 12 Phase 4 acceptance criteria demonstrated and signed off
- **Reference:** Spec §34

### ⏸ `4S9-OPS-01` · Production rollout and incident readiness

**Order** 51 · **OPS** · **Where:** Vendor console · **3d** · **Blocked**

Streaming, observability, scaling and an on-call path before the first paying virtual sponsor.

- **Depends on:** 4S9-PMO-02
- **Done when:** Production rollout complete with monitoring, alerting and an incident runbook
- **Reference:** Spec §31, §38

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. SponsorX can register a world, zone and virtual placement and map the placement to sellable inventory.
2. Active campaign manifest returns only approved, in-window deployments for the requested world/time.
3. INFINEX client can render a sponsored placement using the correct asset/version.
4. Creative can be paused or rolled back from SponsorX without redeploying the entire INFINEX application.
5. Telemetry batch endpoint supports idempotent event IDs and rejects malformed/unauthorized events.
6. Viewable impressions are calculated according to versioned viewability rules and remain distinct from gross renders.
7. Repeated duplicate telemetry does not inflate sponsor reports.
8. Interactive activation can start, complete, and trigger a SponsorX reward exactly once per configured eligibility rule.
9. Cross-channel dashboard shows INFINEX metrics alongside non-virtual campaign metrics without double counting.
10. Operations console displays event lag, client heartbeat, deployment failures and active incidents.
11. Pilot sponsor can receive a report containing virtual delivery, interaction, reward funnel and proof/creative summary.
12. Load test meets agreed event-ingestion throughput and dashboard latency targets for expected Phase 4 traffic.

---

*Plan of record for Phase 4 · INFINEX World Integration. Daily tracking happens in `SponsorX-Full-Programme-Task-Board.xlsx`; published status lives in the Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/). See the workflow rule at the top of this file.*
