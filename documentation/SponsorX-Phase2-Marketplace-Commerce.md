# SponsorX — Phase 2 · Marketplace & Athlete Commerce

**BTG SPORTS GROUP · SPONSORX · PHASE 2 · MARKETPLACE & ATHLETE COMMERCE**

| | |
|---|---|
| **Goal** | Turn SponsorX from BTG-only operations into a multi-tenant marketplace. External athletes, teams, programs, events and media properties onboard, publish inventory, fulfil deliverables and get paid. |
| **Tasks** | 67 · 267 person-days |
| **Blueprint timeline** | 16–20 weeks |
| **Balanced budget** | $80K–$120K |
| **Depends on** | Phase 1 auth/RBAC, sponsor/property/inventory/campaign/reward models, Zoho integration, core analytics |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0, August 2026 (Spec § references) + Blueprint §32 |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md) **← you are here** | 67 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)  | 51 | 18–22 weeks |

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
| **ID** | `2S{sprint}-{CAT}-{nn}`, e.g. `2S5-BE-04` — Phase 2, Sprint 5, Backend, task 04. |
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

---

# The tasks

## Sprint 0 · Architecture & design

*Marketplace state machines, financial ledger design, provider selection, security review. Nothing is built until the money model is designed.*

*8 tasks · 28 person-days*

### ⏸ `2S0-PMO-01` · Define the marketplace state machines

**Order** 1 · **PMO** · **Where:** Document · **3d** · **Blocked**

Write down every lifecycle before code: onboarding, listing, reservation, order, payment, payout, dispute. Phase 2 has far more states than Phase 1 and they interlock — an order cannot pay out if a dispute is open.

- **Depends on:** Phase 1 complete
- **Done when:** All Phase 2 state machines diagrammed and agreed, with the illegal transitions named explicitly
- **Reference:** Spec §7, §12

### ⏸ `2S0-PMO-02` · Design the financial ledger model

**Order** 2 · **PMO** · **Where:** Document · **5d** · **Blocked**

The single most important design decision in Phase 2. Order revenue must become ledger entries at contract time, never be recalculated at payout time. Gross → discounts → platform fee → management fee → processing → property share → referral → reserve → available.

- **Depends on:** Phase 1 complete
- **Done when:** Ledger design reviewed and signed off; the sequential rule order is documented and a worked example reconciles to the cent
- **Reference:** Spec §7.4

### ⏸ `2S0-PMO-03` · Select the marketplace payment provider

**Order** 3 · **PMO** · **Where:** Vendor console · **3d** · **Blocked**

Choose the provider that handles checkout, connected-account onboarding, platform fees, transfers, refunds and disputes. This decision shapes onboarding, payouts and compliance. Use a hosted or embedded flow so you never touch card data.

- **Depends on:** 2S0-PMO-02
- **Done when:** Provider selected, contract in place, sandbox credentials issued, and the adapter interface agreed so it stays swappable
- **Reference:** Spec §10

### ⏸ `2S0-LEG-01` · Marketplace terms, payout terms and revenue-share agreements

**Order** 4 · **LEG** · **Where:** External · counsel · **5d** · **Blocked**

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Counsel drafts the documents external properties accept: platform terms, marketplace terms, payout terms, privacy terms, and any BTG representation documents. Longest lead time in Phase 2 — start it first.

- **Depends on:** Phase 1 complete
- **Done when:** All marketplace agreements delivered, versioned and approved for production use
- **Reference:** Spec §7.1

### ⏸ `2S0-LEG-02` · Tax and withholding position for marketplace payouts

**Order** 5 · **LEG** · **Where:** External · counsel · **3d** · **Blocked**

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Phase 1 collected no tax IDs because money moved outside the system. Phase 2 moves real money, so that changes. Determine what the payment provider handles versus what SponsorX must collect and report.

- **Depends on:** 2S0-PMO-02
- **Done when:** Written position on tax ID collection, withholding and 1099 reporting, and which system of record owns each
- **Reference:** Spec §9, §10

### ⏸ `2S0-SEC-01` · Payments and PII security review

**Order** 6 · **SEC** · **Where:** Code · **3d** · **Blocked**

Review the design before build: card data never touches your servers, payout account data stays at the provider, verification documents are in private storage, PII is masked in logs.

- **Depends on:** 2S0-PMO-03
- **Done when:** Security review complete with findings closed or accepted in writing
- **Reference:** Spec §3, §38

### ⏸ `2S0-ART-01` · Design the marketplace, onboarding and portal experience

**Order** 7 · **ART** · **Where:** Design tool · **5d** · **Blocked**

Fourteen new screens across onboarding, athlete and team portals, listing editor, cart, checkout, earnings and operations. Design before build — checkout in particular is where confusion costs money.

- **Depends on:** 2S0-PMO-01
- **Done when:** All 14 Phase 2 screens designed, with the onboarding wizard and checkout flows walked end to end
- **Reference:** Spec §6

### ⏸ `2S0-OPS-01` · Define RPO and RTO targets

**Order** 8 · **OPS** · **Where:** Document · **1d** · **Blocked**

Once real money moves, 'we restore from last night's backup' stops being acceptable. The spec suggests RPO ≤ 1 hour and RTO ≤ 4 hours as an early target.

- **Depends on:** Phase 1 complete
- **Done when:** Formal RPO/RTO targets agreed and the backup strategy adjusted to meet them
- **Reference:** Spec §38

## Sprint 1 · External property onboarding

*Outside organisations can apply, be verified and be approved without anyone touching the database.*

*7 tasks · 25 person-days*

### ⏸ `2S1-BE-01` · Property onboarding model and wizard API

**Order** 9 · **BE** · **Where:** Code · **5d** · **Blocked**

The data behind the 5–7 step wizard: organisation, type, contacts, business details, tax and payout details, agreements, review and submit. Required fields vary by organisation type and jurisdiction.

- **Depends on:** 2S0-PMO-01
- **Done when:** An external organisation can complete and submit onboarding through the API without database intervention
- **Reference:** Spec §7.1, §9

### ⏸ `2S1-BE-02` · Verification document handling

**Order** 10 · **BE** · **Where:** Code · **3d** · **Blocked**

Supporting documents — proof of rights to sell inventory, business registration, identity — uploaded to private storage and attached to the onboarding record.

- **Depends on:** 2S1-BE-01
- **Done when:** Documents upload to the private bucket, are reviewable by an admin, and are never publicly reachable
- **Reference:** Spec §9

### ⏸ `2S1-BE-03` · Verification queue and decision workflow

**Order** 11 · **BE** · **Where:** Code · **3d** · **Blocked**

BTG reviews a submitted property and approves, requests changes, rejects or suspends. Approval is what unlocks listing creation.

- **Depends on:** 2S1-BE-01
- **Done when:** A reviewer can action every decision type; PENDING_REVIEW to APPROVED grants listing access and is audited
- **Reference:** Spec §7.1

### ⏸ `2S1-BE-04` · External tenant provisioning and permissions

**Order** 12 · **BE** · **Where:** Code · **5d** · **Blocked**

Approving a property creates its tenant and role assignments. This is where Phase 1's tenant scoping gets its real test — outside organisations now hold accounts.

- **Depends on:** 2S1-BE-03
- **Done when:** An approved property's users see only their own tenant's data; cross-tenant tests pass
- **Reference:** Spec §3, §12

### ⏸ `2S1-FE-01` · Build the property onboarding wizard

**Order** 13 · **FE** · **Where:** Code · **5d** · **Blocked**

The public-facing multi-step signup. Must save progress — organisations will not complete it in one sitting.

- **Depends on:** 2S0-ART-01
- **Done when:** Wizard completes end to end, saves partial progress, and validates per organisation type
- **Reference:** Spec §6 P2-01

### ⏸ `2S1-FE-02` · Build the verification queue screen

**Order** 14 · **FE** · **Where:** Code · **3d** · **Blocked**

The BTG admin review screen: submitted profile, documents, brand-safety status, payout readiness, and the four decision buttons.

- **Depends on:** 2S1-BE-03
- **Done when:** Reviewer can work the queue and action decisions with reasons recorded
- **Reference:** Spec §6 P2-02

### ⏸ `2S1-INT-01` · Onboarding notification jobs

**Order** 15 · **INT** · **Where:** Code · **1d** · **Blocked**

Emails for submission received, changes requested, approved, rejected and suspended.

- **Depends on:** 2S1-BE-03
- **Done when:** All five notifications send as queued jobs and retry on failure
- **Reference:** Spec §10

## Sprint 2 · Athlete & team portals

*Inventory, rates, restrictions and the campaign-offer flow for external parties.*

*8 tasks · 32 person-days*

### ⏸ `2S2-BE-01` · Athlete inventory model

**Order** 16 · **BE** · **Where:** Code · **5d** · **Blocked**

External athletes define their own NIL items, rates, availability, categories, restrictions and package rules — rather than BTG setting rates for them as in Phase 1.

- **Depends on:** 2S1-BE-04
- **Done when:** An athlete can create, edit and price inventory items scoped to their own account
- **Reference:** Spec §6 P2-04

### ⏸ `2S2-BE-02` · Brand restrictions and conflict model

**Order** 17 · **BE** · **Where:** Code · **3d** · **Blocked**

Extends Phase 1's restriction list into a first-class table with category, restriction type and date range — it now has to block purchases, not just invitations.

- **Depends on:** 2S2-BE-01
- **Done when:** A restricted category blocks listing purchase and campaign offer for the overlapping date range
- **Reference:** Spec §9

### ⏸ `2S2-BE-03` · Formal athlete offer model

**Order** 18 · **BE** · **Where:** Code · **5d** · **Blocked**

Phase 2's offer is a commercial instrument, not an invitation: brief, compensation, deliverables, usage rights, exclusivity period, disclosures. Acceptance creates an immutable terms snapshot.

- **Depends on:** 2S2-BE-01
- **Done when:** Accepting an offer freezes commercial terms and schedules deliverables; later rate-card edits do not alter it
- **Reference:** Spec §7.3

### ⏸ `2S2-BE-04` · Team and program roster model

**Order** 19 · **BE** · **Where:** Code · **3d** · **Blocked**

Teams and programs hold rosters, property inventory, users and revenue shares — a layer above individual athletes.

- **Depends on:** 2S1-BE-04
- **Done when:** A team manager can see their roster and the inventory belonging to it, and nobody else's
- **Reference:** Spec §6 P2-06

### ⏸ `2S2-FE-01` · Build the athlete portal home

**Order** 20 · **FE** · **Where:** Code · **3d** · **Blocked**

Upcoming campaigns, approval requests, overdue deliverables, earnings to date, payout status and inventory performance in one view.

- **Depends on:** 2S0-ART-01
- **Done when:** Portal home renders live data for the signed-in athlete only
- **Reference:** Spec §6 P2-03

### ⏸ `2S2-FE-02` · Build the athlete inventory manager

**Order** 21 · **FE** · **Where:** Code · **5d** · **Blocked**

Where an athlete creates and prices what they are selling.

- **Depends on:** 2S2-BE-01
- **Done when:** Athlete can create, edit, price and restrict inventory items
- **Reference:** Spec §6 P2-04

### ⏸ `2S2-FE-03` · Build the campaign offer screen

**Order** 22 · **FE** · **Where:** Code · **3d** · **Blocked**

The athlete reads the full commercial terms and accepts, declines or requests a change.

- **Depends on:** 2S2-BE-03
- **Done when:** All three actions work; requesting a change routes back to the campaign manager
- **Reference:** Spec §6 P2-05

### ⏸ `2S2-FE-04` · Build the team/program dashboard

**Order** 23 · **FE** · **Where:** Code · **5d** · **Blocked**

Roster, inventory, campaigns, revenue, tasks and performance for a team or program.

- **Depends on:** 2S2-BE-04
- **Done when:** Team dashboard renders roster-scoped data with revenue shares visible to the manager
- **Reference:** Spec §6 P2-06

## Sprint 3 · Listing engine

*Public and private listings, packages, search, availability and conflict checking.*

*6 tasks · 26 person-days*

### ⏸ `2S3-BE-01` · Marketplace listing model and lifecycle

**Order** 24 · **BE** · **Where:** Code · **5d** · **Blocked**

A listing is the public representation of inventory: visibility, status, publish date. Creating inventory and publishing a listing are deliberately separate steps so governance can sit between them.

- **Depends on:** 2S2-BE-01
- **Done when:** A verified property can create a listing but cannot publish it until governance rules are satisfied
- **Reference:** Spec §9, §12

### ⏸ `2S3-BE-02` · Listing packages and bundles

**Order** 25 · **BE** · **Where:** Code · **3d** · **Blocked**

Bundled inventory sold as one unit, with quantity and bundle definition.

- **Depends on:** 2S3-BE-01
- **Done when:** A package can be created, priced and purchased as a single line
- **Reference:** Spec §9

### ⏸ `2S3-BE-03` · Availability, exclusivity and conflict check service

**Order** 26 · **BE** · **Where:** Code · **5d** · **Blocked**

One service answers: is this available on these dates, in this quantity, without a category conflict, above the floor price? Every purchase path calls it. The Phase 2 equivalent of Phase 1's matching query, and just as load-bearing.

- **Depends on:** 2S3-BE-01
- **Done when:** Availability check correctly rejects date overlap, quantity overrun, category conflict and sub-floor pricing
- **Reference:** Spec §7.2, §8

### ⏸ `2S3-BE-04` · Marketplace search and filtering

**Order** 27 · **BE** · **Where:** Code · **5d** · **Blocked**

Sponsors browse what is available to them. Visibility rules mean two sponsors see different catalogues.

- **Depends on:** 2S3-BE-01
- **Done when:** Search returns only inventory visible to the requesting sponsor and tenant
- **Reference:** Spec §12

### ⏸ `2S3-FE-01` · Build the listing editor

**Order** 28 · **FE** · **Where:** Code · **5d** · **Blocked**

Listing data, pricing, package builder, preview, approval status and visibility settings.

- **Depends on:** 2S0-ART-01
- **Done when:** A property can build, preview and submit a listing for approval
- **Reference:** Spec §6 P2-07

### ⏸ `2S3-SEC-01` · Listing visibility and tenant isolation tests

**Order** 29 · **SEC** · **Where:** Code · **3d** · **Blocked**

Prove by test that private listings and cross-tenant inventory never leak into another sponsor's search results.

- **Depends on:** 2S3-BE-04
- **Done when:** Cross-tenant marketplace search tests pass
- **Reference:** Spec §12

## Sprint 4 · Cart, reservations & orders

*Sponsors select inventory, hold it, and place a commercial order.*

*7 tasks · 29 person-days*

### ⏸ `2S4-BE-01` · Cart model

**Order** 30 · **BE** · **Where:** Code · **3d** · **Blocked**

A sponsor's shopping session: items, quantities, currency, expiry.

- **Depends on:** 2S3-BE-03
- **Done when:** Sponsor can add, remove and update cart lines; the cart expires cleanly
- **Reference:** Spec §8, §9

### ⏸ `2S4-BE-02` · Time-limited reservations

**Order** 31 · **BE** · **Where:** Code · **5d** · **Blocked**

Reservable inventory is held for a window and the available quantity is temporarily reduced. This is what stops overselling, and it must release automatically when the timer expires.

- **Depends on:** 2S4-BE-01
- **Done when:** Reservations prevent overselling and expired reservations release inventory automatically
- **Reference:** Spec §7.2, §12

### ⏸ `2S4-BE-03` · Order model and state machine

**Order** 32 · **BE** · **Where:** Code · **5d** · **Blocked**

The commercial order: subtotal, fees, total, currency, and its lifecycle through PENDING_APPROVAL, CONTRACTED and beyond.

- **Depends on:** 2S4-BE-02
- **Done when:** Order states enforce correctly; an unapproved order cannot contract inventory
- **Reference:** Spec §7.2, §9

### ⏸ `2S4-BE-04` · Order financial snapshot at contract time

**Order** 33 · **BE** · **Where:** Code · **5d** · **Blocked**

At contract time, freeze the full financial breakdown onto the order line. This is what makes historical payouts immune to future rate-card changes.

- **Depends on:** 2S4-BE-03
- **Done when:** Commission snapshot is created at contract time and does not change when commission rules are later edited
- **Reference:** Spec §7.4, §12

### ⏸ `2S4-BE-05` · BTG approval gate on orders

**Order** 34 · **BE** · **Where:** Code · **3d** · **Blocked**

Where policy requires it, an order waits for BTG approval before inventory is contracted — payment may be authorisation or deposit only until then.

- **Depends on:** 2S4-BE-03
- **Done when:** An order requiring approval holds inventory without contracting it, and releases on rejection
- **Reference:** Spec §7.2

### ⏸ `2S4-FE-01` · Build cart and reservation screens

**Order** 35 · **FE** · **Where:** Code · **3d** · **Blocked**

Selected inventory, quantities, package summary, price and fees, and the reservation timer where enabled.

- **Depends on:** 2S0-ART-01
- **Done when:** Cart renders live pricing and the reservation countdown
- **Reference:** Spec §6 P2-08

### ⏸ `2S4-FE-02` · Build checkout and contract gate

**Order** 36 · **FE** · **Where:** Code · **5d** · **Blocked**

Billing details, agreement acceptance, deposit or full payment, and any approval conditions. The highest-stakes screen in Phase 2.

- **Depends on:** 2S4-BE-03
- **Done when:** Sponsor can complete a purchase or reservation through the configured flow
- **Reference:** Spec §6 P2-09

## Sprint 5 · Payments, ledger & payouts

*The financial core. Money in, money apportioned, money out.*

*11 tasks · 49 person-days*

### ⏸ `2S5-INT-01` · Payment provider checkout integration

**Order** 37 · **INT** · **Where:** Code + console · **5d** · **Blocked**

Hosted or embedded checkout session creation. Card data never reaches your servers.

- **Depends on:** 2S0-PMO-03
- **Done when:** Sponsor can pay through the provider and the order reflects the result
- **Reference:** Spec §8

### ⏸ `2S5-INT-02` · Payment webhook handling with idempotency

**Order** 38 · **INT** · **Where:** Code · **5d** · **Blocked**

Providers retry webhooks and deliver out of order. Every handler must be safe to run twice. This is the single most common source of financial bugs in a marketplace.

- **Depends on:** 2S5-INT-01
- **Done when:** Payment webhooks are idempotent and correctly update order and payment state under duplicate and out-of-order delivery
- **Reference:** Spec §3, §12

### ⏸ `2S5-INT-03` · Connected payout account onboarding

**Order** 39 · **INT** · **Where:** Code + console · **5d** · **Blocked**

Properties and athletes onboard with the payment provider to receive funds, through the provider's hosted flow. SponsorX stores status only, never credentials.

- **Depends on:** 2S5-INT-01
- **Done when:** A property can complete payout onboarding and SponsorX reflects its readiness status
- **Reference:** Spec §8, §9

### ⏸ `2S5-BE-01` · Commission rule engine

**Order** 40 · **BE** · **Where:** Code · **5d** · **Blocked**

Versioned rules for platform fee, management fee, property and athlete share, referral fee, by scope and priority.

- **Depends on:** 2S0-PMO-02
- **Done when:** Rules apply in priority order; editing a rule never alters a closed payout
- **Reference:** Spec §7.4, §9

### ⏸ `2S5-BE-02` · Financial subledger

**Order** 41 · **BE** · **Where:** Code · **5d** · **Blocked**

Every financial movement becomes a ledger entry with debit, credit, type and status. The source of truth for what anyone is owed.

- **Depends on:** 2S5-BE-01
- **Done when:** Property dashboard reconciles booked revenue, ledger balance, paid earnings and pending earnings exactly
- **Reference:** Spec §7.4, §12

### ⏸ `2S5-BE-03` · Refunds and disputes

**Order** 42 · **BE** · **Where:** Code · **3d** · **Blocked**

Exceptions have to exist from day one, because they block payouts. An open dispute freezes the associated funds.

- **Depends on:** 2S5-INT-02
- **Done when:** A refund or dispute correctly reverses ledger entries and blocks the related payout
- **Reference:** Spec §9

### ⏸ `2S5-BE-04` · Payout eligibility and request flow

**Order** 43 · **BE** · **Where:** Code · **5d** · **Blocked**

Payout depends on payment clearance, deliverable completion, dispute status, provider readiness and the configured holding period. All five, every time.

- **Depends on:** 2S5-BE-02
- **Done when:** Payout cannot be released if payment is unsettled, deliverables are incomplete, onboarding is incomplete, or a dispute is open
- **Reference:** Spec §7.4, §12

### ⏸ `2S5-BE-05` · Payout approval and execution jobs

**Order** 44 · **BE** · **Where:** Code · **3d** · **Blocked**

Admin approves, the worker sends funds or marks the payout ready through the provider adapter, and exceptions are surfaced.

- **Depends on:** 2S5-BE-04
- **Done when:** An approved payout executes through the provider and its status is tracked to completion
- **Reference:** Spec §8

### ⏸ `2S5-FE-01` · Build the commission and revenue-share editor

**Order** 45 · **FE** · **Where:** Code · **5d** · **Blocked**

Configure split rules by property, athlete, campaign, inventory type or partner.

- **Depends on:** 2S5-BE-01
- **Done when:** Rules can be created, versioned and previewed against a sample order
- **Reference:** Spec §6 P2-10

### ⏸ `2S5-FE-02` · Build the earnings and payout dashboard

**Order** 46 · **FE** · **Where:** Code · **5d** · **Blocked**

Gross revenue, fees, available balance, pending balance, payout history and exceptions.

- **Depends on:** 2S5-BE-02
- **Done when:** Dashboard reconciles to the ledger to the cent
- **Reference:** Spec §6 P2-11

### ⏸ `2S5-SEC-01` · Financial audit coverage

**Order** 47 · **SEC** · **Where:** Code · **3d** · **Blocked**

Every pricing override, commission edit, payout approval and dispute action writes an immutable audit entry.

- **Depends on:** 2S5-BE-02
- **Done when:** Immutable audit history exists for all financial and admin changes
- **Reference:** Spec §3, §38

## Sprint 6 · Wallet rewards & notifications

*Apple/Google Wallet passes and the transactional messaging the marketplace needs.*

*5 tasks · 17 person-days*

### ⏸ `2S6-INT-01` · Apple Wallet pass adapter

**Order** 48 · **INT** · **Where:** Code + console · **5d** · **Blocked**

Issue, update and expire offer passes. Behind an adapter interface so Google Wallet is a second implementation, not a rewrite.

- **Depends on:** 2S5-INT-01
- **Done when:** A wallet pass can be issued and updated from SponsorX
- **Reference:** Spec §6 P2-12

### ⏸ `2S6-INT-02` · Google Wallet pass adapter

**Order** 49 · **INT** · **Where:** Code + console · **3d** · **Blocked**

The second implementation of the same interface.

- **Depends on:** 2S6-INT-01
- **Done when:** Google Wallet passes issue and update through the same adapter interface
- **Reference:** Spec §10

### ⏸ `2S6-BE-01` · Wallet pass lifecycle and device registrations

**Order** 50 · **BE** · **Where:** Code · **3d** · **Blocked**

Track provider template, device registrations and last update so a pass can be revoked or changed after a fan has installed it.

- **Depends on:** 2S6-INT-01
- **Done when:** Pass state changes propagate to installed passes
- **Reference:** Spec §9

### ⏸ `2S6-BE-02` · Notification preferences

**Order** 51 · **BE** · **Where:** Code · **3d** · **Blocked**

Users choose which events reach them and on which channel. Marketplace volume makes this necessary rather than nice to have.

- **Depends on:** 2S1-INT-01
- **Done when:** A user can mute a channel per event type and the worker honours it
- **Reference:** Spec §9

### ⏸ `2S6-FE-01` · Build the wallet reward manager

**Order** 52 · **FE** · **Where:** Code · **3d** · **Blocked**

Issue, update and deactivate passes; claim links; provider status.

- **Depends on:** 2S6-BE-01
- **Done when:** Staff can manage the full pass lifecycle from the console
- **Reference:** Spec §6 P2-12

### ⏸ `2S6-BE-03` · "Sponsor may contact me about offers" consent option

**Order** 52.1 · **BE** · **Where:** Code · **3d** · **Blocked**

A second, separate, unticked checkbox on the fan claim page. Only fans who tick it may be passed to the sponsor as a lead. Moved from Phase 1 on 2026-09-24 by business decision — Phase 1 fans consent to voucher delivery only.

- **Depends on:** P6-SEC-01, P6-SEC-03
- **Done when:** A new consent purpose (e.g. `sponsor-contact`) exists with its own dated consent text version; the checkbox is separate from voucher consent and unticked by default; only claims carrying it expose the address to the sponsor (RBAC §7.2 and §10 amended to match), enforced in the query; unsubscribe (P6-SEC-03) withdraws it
- **Reference:** §26; Phase 1 decision log 2026-09-24

### ⏸ `2S6-INT-03` · Consent-gated lead push to Zoho *(was P6-INT-01)*

**Order** 52.2 · **INT** · **Where:** Code · **3d** · **Blocked**

Send fan leads to Zoho only where the fan ticked the sponsor-contact option. No consent, no push — enforced in code.

- **Depends on:** 2S6-BE-03, P8-INT-01
- **Done when:** Claims with sponsor-contact consent enqueue zoho.pushLead; claims without it, or withdrawn (P6-SEC-03), never do — excluded at query level
- **Reference:** §18

## Sprint 7 · Analytics & governance

*Property dashboards, the operations console and expanded Zoho sync.*

*5 tasks · 23 person-days*

### ⏸ `2S7-DATA-01` · Property analytics aggregates

**Order** 53 · **DATA** · **Where:** Code · **5d** · **Blocked**

Per-property revenue, sell-through, average CPM, campaign completion, sponsor mix and payout trends.

- **Depends on:** 2S5-BE-02
- **Done when:** Property analytics reconcile to the ledger and campaign records
- **Reference:** Spec §6 P2-13

### ⏸ `2S7-FE-01` · Build the property analytics dashboard

**Order** 54 · **FE** · **Where:** Code · **5d** · **Blocked**

The external property's view of how their inventory is performing commercially.

- **Depends on:** 2S7-DATA-01
- **Done when:** Dashboard renders live per-property analytics
- **Reference:** Spec §6 P2-13

### ⏸ `2S7-FE-02` · Build the marketplace operations console

**Order** 55 · **FE** · **Where:** Code · **5d** · **Blocked**

Moderation queue, disputes, failed payments, payout exceptions and listings needing review. The screen BTG staff live in.

- **Depends on:** 2S3-BE-01
- **Done when:** Every exception type surfaces in the console and can be actioned
- **Reference:** Spec §6 P2-14

### ⏸ `2S7-INT-01` · Expand Zoho sync for marketplace orders

**Order** 56 · **INT** · **Where:** Code · **5d** · **Blocked**

External property accounts, marketplace orders, deal stages, invoice and payment references, and renewals now flow to Zoho too.

- **Depends on:** 2S4-BE-03
- **Done when:** Zoho contains linked Account, Contact and Deal data for external marketplace transactions
- **Reference:** Spec §10, §12

### ⏸ `2S7-BE-01` · White-label tenant branding

**Order** 57 · **BE** · **Where:** Code · **3d** · **Blocked**

Tenant logo, colours and report branding, plus readiness for custom subdomain mapping.

- **Depends on:** 2S1-BE-04
- **Done when:** A tenant's branding is served to its portal and renders on its reports (the portal rendering itself is `2S7-FE-03`)
- **Reference:** Spec §9
- **Changed 2026-09-28** by the programme owner: the portal rendering was split into `2S7-FE-03`, so this task stays backend-only.

### ⏸ `2S7-BE-02` · Report render worker job (was `P7-BE-06`)

**Order** 57.1 · **BE** · **Where:** Code · **3d** · **Blocked**

Produce the sponsor report as a file on the worker, unattended — for when a report must exist without anyone opening a browser (for example, scheduled delivery to a renewal signer who never logs in). Moved from Phase 1 on 2026-09-24: Phase 1's print stylesheet covers the interactive case.

- **Depends on:** P7-BE-05
- **Done when:** When a server-rendered report is required, Playwright renders it on the worker from the same data as screen 12, stores it in the private bucket, and keeps every provenance label; the browser print (`report-pdf.ts`) remains the interactive path
- **Reference:** §9 screen 12, Addendum A10

### ⏸ `2S7-FE-03` · Render tenant branding in the property portal

**Order** 57.2 · **FE** · **Where:** Code · **1d** · **Blocked**

The property portal's frame shows the signed-in tenant's own logo and colours, read from the branding API that `2S7-BE-01` serves. Raised 2026-09-28, split out of `2S7-BE-01` at the programme owner's instruction.

- **Depends on:** 2S7-BE-01
- **Done when:** A tenant's logo and colours render in its property portal frame
- **Reference:** Spec §9

## Sprint 8 · QA, security & rollout

*End-to-end, payment-failure and reward-failure testing, security review, UAT, production.*

*7 tasks · 31 person-days*

### ⏸ `2S8-QA-01` · End-to-end marketplace test suite

**Order** 58 · **QA** · **Where:** Code · **5d** · **Blocked**

Onboarding through listing, purchase, fulfilment, earnings and payout, as one automated run.

- **Depends on:** 2S4-FE-02
- **Done when:** The full marketplace path runs green in CI
- **Reference:** Spec §11

### ⏸ `2S8-QA-02` · Payment and reward failure testing

**Order** 59 · **QA** · **Where:** Code · **5d** · **Blocked**

Deliberately break things: duplicate webhooks, out-of-order delivery, declined cards, expired reservations, failed payouts, wallet provider outages.

- **Depends on:** 2S5-INT-02
- **Done when:** Every failure mode is handled without financial inconsistency
- **Reference:** Spec §11, §38

### ⏸ `2S8-QA-03` · Financial reconciliation testing

**Order** 60 · **QA** · **Where:** Code · **5d** · **Blocked**

Prove the ledger balances against orders, payments and payouts across a full campaign cycle.

- **Depends on:** 2S5-BE-02
- **Done when:** Reconciliation passes within defined tolerance across a seeded full-cycle dataset
- **Reference:** Spec §38

### ⏸ `2S8-SEC-01` · Cross-tenant isolation tests for external parties

**Order** 61 · **SEC** · **Where:** Code · **5d** · **Blocked**

Phase 1 tested BTG's own roles. Phase 2 has outside organisations, which is a different threat model.

- **Depends on:** 2S1-BE-04
- **Done when:** Cross-tenant data access tests pass for sponsor, athlete/property and admin roles
- **Reference:** Spec §12

### ⏸ `2S8-SEC-02` · OWASP review and dependency scanning

**Order** 62 · **SEC** · **Where:** Code · **3d** · **Blocked**

External users, money movement and file uploads all raise the stakes.

- **Depends on:** 2S8-QA-01
- **Done when:** OWASP testing complete, dependency scan clean, secrets rotation in place
- **Reference:** Spec §38

### ⏸ `2S8-OPS-01` · Production readiness and restore test

**Order** 63 · **OPS** · **Where:** Vendor console · **3d** · **Blocked**

Verify backups by restoring, test alerts, exercise rollback, confirm RPO/RTO targets are actually met.

- **Depends on:** 2S0-OPS-01
- **Done when:** Documented restore test passes and meets the agreed RPO/RTO
- **Reference:** Spec §38

### ⏸ `2S8-PMO-01` · Phase 2 UAT and production rollout

**Order** 64 · **PMO** · **Where:** Document · **5d** · **Blocked**

Real external properties onboard on staging, transact, and get paid, before anything goes live.

- **Depends on:** 2S8-QA-01
- **Done when:** All 14 Phase 2 acceptance criteria demonstrated and signed off
- **Reference:** Spec §12

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. An external property can onboard, submit required information, be reviewed, and be approved without direct database intervention.
2. A verified athlete or property can create inventory but cannot publish it unless marketplace-governance rules are satisfied.
3. Marketplace search returns only inventory available to the requesting sponsor/tenant and respects visibility restrictions.
4. Reservations prevent overselling and automatically release expired inventory.
5. Category-exclusivity and date conflicts block invalid purchases.
6. Sponsor can complete a purchase or reservation through the configured payment/order flow.
7. Payment webhooks are idempotent and correctly update order/payment state.
8. Commission snapshot is created at contract time and remains unchanged if future rate cards are edited.
9. Athlete can accept a campaign offer, complete deliverables, and view earnings.
10. Payout cannot be released if payment is unsettled, deliverables are incomplete, account onboarding is incomplete, or a dispute is open.
11. Wallet reward pass can be issued and updated from SponsorX.
12. Property dashboard accurately reconciles booked revenue, ledger balance, paid earnings, and pending earnings.
13. Zoho contains linked Account/Contact/Deal data for external marketplace transactions.
14. Cross-tenant data access tests pass for sponsor, athlete/property and admin roles.

---

*Plan of record for Phase 2 · Marketplace & Athlete Commerce. Daily tracking happens in `SponsorX-Full-Programme-Task-Board.xlsx`; published status lives in the Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/). See the workflow rule at the top of this file.*
