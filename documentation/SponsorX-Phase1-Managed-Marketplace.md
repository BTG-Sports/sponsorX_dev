# SponsorX — Phase 1 · Managed Marketplace

**BTG SPORTS GROUP · SPONSORX · PHASE 1 · MANAGED MARKETPLACE**

| | |
|---|---|
| **Goal** | Launch real micro-NIL campaigns while building the data foundation. BTG staff run matching, pricing, conflict checks and invoicing; the software standardises and records every step. |
| **Tasks** | 189 · 451 person-days |
| **Blueprint timeline** | 14–18 weeks |
| **Balanced budget** | $75K–$105K |
| **Depends on** | Nothing — this is the start |
| **Source** | Master Development Blueprint v2.0 (§ references) + `.claude/stack-decision.md` Addendum A |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md) **← you are here** | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 66 | 16–20 weeks |
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
| **ID** | `P{stage}-{CAT}-{nn}`, e.g. `P4-BE-03` — Phase 1 stage 4, Backend, task 03. |
| **Order** | Execution sequence. Matches the `Order` column in the tracker. |
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

## Decision gates

A gate is a decision, not a task. **An open gate blocks its stage.** Resolve each in writing in `.claude/stack-decision.md`.

| Gate | Question | Blocks | Status |
|---|---|---|---|
| `G-01` | Phase 1 payment policy — status tracking only, no tax IDs? | Stage 7 | Open |
| `G-02` | Data residency | Stage 2 | **CLOSED 2026-09-11 — US East.** Railway `us-east4-eqdc4a`, R2 hint `ENAM` |
| `G-03` | Guardian e-signature for minors | Stages 3, 5 | Open |
| `G-04` | Transactional email provider | Stage 3 | Open |
| `G-05` | Counsel-approved agreement templates | Stage 5 | Open |
| `G-06` | SMS in Phase 1 | Phase-wide | Open |
| `G-07` | Sponsor report format — PDF or screen only? | Stage 7 | Open |

## The protected loop (§39)

```
athlete application → approval → NIL job/rate → sponsor brief → matching →
invitation → Campaign Order → deliverable → tracking/reward → earnings →
sponsor report
```

When scope must give, cut from the self-service / ecommerce end. Never from this loop.

**442 person-days ≈ 44 weeks at two people.** The blueprint budgets 14–18 weeks at 4.5–7.5 FTE. Scope, not stack, is the binding constraint on Phase 1.

---

# The tasks

## Stage 0 · Foundation & Decisions

**Objective.** close every decision that would otherwise be made silently in code,

**Entry gate.** none — this phase starts immediately.

**Exit gate.** G-01 … G-07 all resolved in writing and linked from

*29 tasks · 0 person-days*

### ✅ `P0-PMO-02` · Confirm data residency and set regions (G-02)

**Order** — · **PMO** · **Where:** Document · **1d** · **Done** · **Unblocks** 118

DECISION GATE G-02 · Data residency — which region do Railway and R2 run in?  —  Pick the geographic region Railway and Cloudflare R2 run in, and write it down. Almost certainly US-only: NIL is US law, sponsors are local US businesses, minors' data is involved. Moving a database region later is painful, so this is decided before anything exists.

- **Depends on:** nothing — startable now
- **Done when:** Railway region and R2 region chosen explicitly, recorded, not left at defaults
- **Reference:** Addendum A7

### ▶ `P0-OPS-01` · Create Railway account, project and billing

**Order** 1 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 115

Open the Railway account and project in the region chosen above. Set a spend alert — usage-based hosting surprises people.

- **Depends on:** P0-PMO-02
- **Done when:** Project exists in the confirmed region; billing and spend alerts configured
- **Reference:** Guide §10

### ▶ `P0-PMO-07` · Author the RBAC matrix (§38 deliverable)

**Order** 2 · **PMO** · **Where:** Document · **3d** · **Ready** · **Unblocks** 106

A table of authorization rules: each of the 12 user roles against every Phase 1 resource, qualified by ownership (own / other / ward / own-tenant / other-tenant / own-property / any) and by action (read / write / approve), allow or deny for each. Sensitive fields — sponsor price, campaign budget, athlete rate — are listed as resources in their own right. This table literally becomes the automated test suite later, so it has to be agreed by humans first.

*Amended 2026-09-14.* The original wording described a flat grid — roles down one side, resources across the top. That shape cannot express the rules it has to carry: a `PROPERTY_MGR` may read an athlete on their own roster and must not read one on another property's, which is the same role and the same resource with opposite answers. Ownership and sensitive fields were already present in the twenty starter rows in §09 of the implementation guide; the amendment names them as axes rather than leaving them encoded inside a resource string.

- **Depends on:** nothing — startable now
- **Done when:** All 12 roles × every Phase 1 resource × ownership × action, in a table, agreed — this becomes the authz test suite
- **Reference:** §8 (the twelve roles, as a table in the original document — note that the copy converted into `graphify-out/` has lost it), §38, and §09 of [`SponsorX-Implementation-Guide-V2.md`](./SponsorX-Implementation-Guide-V2.md) for the twenty starter rows and the target test format

### ▶ `P0-OPS-06` · Register the SponsorX domain and hold the DNS

**Order** 2.5 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 3

Buy the domain the whole product is addressed at, and keep control of its DNS. Nothing in the programme registers one, yet three separate threads assume it exists — a Clerk production instance, a publicly reachable `web`, and the short-link domain the fan QR and tracking routes need.

`sponsorx.com` is **already registered to someone else**, as are `.io`, `.app`, `.co` and `.pro`. The Implementation Guide assumes `sponsorx.com` and `app.sponsorx.com` throughout; that assumption has to be corrected once a name is chosen.

- **Depends on:** nothing — startable now
- **Done when:** Domain registered to a BTG-controlled account with auto-renew and registrar lock on; DNS managed somewhere the team can add records; the chosen name recorded in `.claude/stack-decision.md`
- **Reference:** §38, Guide §10

### ▶ `P0-OPS-03` · Create Clerk application (dev + production instances)

**Order** 3 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 55

Create the Clerk account with separate dev and production instances. Clerk handles login, passwords and MFA only — it never stores who belongs to which tenant or what they can do.

- **Depends on:** nothing — startable now
- **Done when:** Both instances exist; MFA available for privileged roles
- **Reference:** Addendum A4, §26

### ▶ `P0-LEG-01` · Commission Content Collaboration Agreement from counsel

**Order** 4 · **LEG** · **Where:** External · counsel · **3d** · **Ready** · **Unblocks** 32

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

DECISION GATE G-05 · Counsel-approved templates — both agreements signed off before any acceptance code is built.  —  Get a lawyer to draft the agreement athletes sign to join the network. Longest lead time in the project — start it on day one, everything else can proceed while you wait.

- **Depends on:** nothing — startable now
- **Done when:** Template delivered, versioned, approved for production use
- **Reference:** §12, §26

### ⏸ `P0-LEG-03` · Resolve guardian authorisation method for minors (G-03)

**Order** 5 · **LEG** · **Where:** External · counsel · **1d** · **Blocked** · **Unblocks** 31

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

DECISION GATE G-03 · Guardian e-signature — is click-to-accept enough for a parent authorising a minor?  —  Ask counsel whether a click-to-accept checkbox is enough for a parent authorising a minor, or whether you need real e-signature. If they say e-signature, that is a new vendor and more work.

- **Depends on:** P0-LEG-01
- **Done when:** Written answer: click-wrap sufficient, or an e-sign vendor named
- **Reference:** Addendum A5, §4

### ▶ `P0-LEG-02` · Commission Campaign Order template from counsel

**Order** 6 · **LEG** · **Where:** External · counsel · **3d** · **Ready** · **Unblocks** 30

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

DECISION GATE G-05 · Counsel-approved templates — both agreements signed off before any acceptance code is built.  —  Get a lawyer to draft the per-campaign contract an athlete accepts: what they deliver, what they are paid, usage rights, exclusivity, deadlines, disclosure.

- **Depends on:** nothing — startable now
- **Done when:** Template delivered with clause set for job code, deliverables, compensation, usage rights, exclusivity, deadlines, disclosure
- **Reference:** §12

### ▶ `P0-DATA-01` · Define the metric provenance taxonomy

**Order** 7 · **DATA** · **Where:** Document · **1d** · **Ready** · **Unblocks** 12

Agree the five honesty labels for numbers: verified by API, verified by a human checking, self-reported by the athlete, estimated, or attributed. Write the rule for when each applies.

- **Depends on:** nothing — startable now
- **Done when:** The five labels (verified-API / verified-manual / self-reported / estimated / attributed) defined with a written rule for when each applies
- **Reference:** §22, §26

### ▶ `P0-PMO-08` · Author the Zoho module + field mapping document (§38 deliverable)

**Order** 8 · **PMO** · **Where:** Document · **3d** · **Ready** · **Unblocks** 10

Map every SponsorX record to its Zoho equivalent, field by field, and say which system wins when they disagree. Without this, the two systems quietly drift apart.

- **Depends on:** nothing — startable now
- **Done when:** Every object in §18 mapped field-by-field, with direction and system-of-record owner per field
- **Reference:** §18, §38

### ▶ `P0-OPS-02` · Create Cloudflare R2 account and two buckets

**Order** 9 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 8

Set up Cloudflare R2 with two buckets: one private for contracts and draft creative, one public for published video. Different security rules — they must not share a policy.

- **Depends on:** P0-PMO-02
- **Done when:** Private and public buckets exist with separate policies; region set explicitly
- **Reference:** Addendum A8

### ▶ `P0-PMO-01` · Write the Phase 1 payment policy (G-01)

**Order** 10 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 7

DECISION GATE G-01 · Phase 1 payment policy — do we track payment status only, and collect no tax IDs?  —  One page stating that Phase 1 only tracks whether an athlete has been paid; money moves outside the system, no tax IDs collected. Required before any code touches earnings.

- **Depends on:** nothing — startable now
- **Done when:** One page, signed by whoever runs payouts, stating earnings-status-only and no tax ID collection
- **Reference:** §37, Addendum A6

### ▶ `P0-LEG-04` · Privacy review of the fan reward funnel

**Order** 11 · **LEG** · **Where:** External · counsel · **3d** · **Ready** · **Unblocks** 5

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Have counsel approve the consent wording fans see when they scan a QR code and hand over their details. This is the most legally sensitive flow in the product, often at youth sports events.

- **Depends on:** nothing — startable now
- **Done when:** Consent language approved for scan→claim→redeem; purpose limitation defined; what sponsors receive is specified
- **Reference:** §16, §26

### ▶ `P0-PMO-11` · Re-verify and pin all dependency versions

**Order** 12 · **PMO** · **Where:** Code · **1d** · **Ready** · **Unblocks** 5

Check every library version against the registry and pin it exactly. A minor version bump breaking the build on a Tuesday is a cost a two-person team cannot absorb.

- **Depends on:** nothing — startable now
- **Done when:** Every package in Guide §01 re-checked against the registry and pinned exactly, no carets
- **Reference:** Guide §01

### ▶ `P0-PMO-03` · Select transactional email provider (G-04)

**Order** 13 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 4

DECISION GATE G-04 · Transactional email provider — Resend, Postmark or SES?  —  Choose who sends your emails — Resend, Postmark or SES. The whole campaign loop is email, so this is not optional, but it is a small decision.

- **Depends on:** nothing — startable now
- **Done when:** Vendor chosen; single send-interface abstraction agreed so it stays reversible
- **Reference:** Addendum A1

### ▶ `P0-PMO-05` · Confirm the sponsor report deliverable format (G-07)

**Order** 14 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 3

DECISION GATE G-07 · Sponsor report format — is a downloadable PDF required, or is the screen enough?  —  Decide whether sponsors need a downloadable PDF report, or whether the on-screen report is enough. This determines whether a whole PDF-rendering job gets built.

- **Depends on:** nothing — startable now
- **Done when:** Written answer on whether a rendered PDF is required or screen 12 suffices
- **Reference:** Addendum A10

### ▶ `P0-PMO-09` · Confirm the SX-01…SX-07 job catalogue economics

**Order** 15 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 3

Have the business confirm the seven job types (SX-01 to SX-07) and their pay/price bands. These numbers get loaded into the database as the rate card.

- **Depends on:** nothing — startable now
- **Done when:** Base pay and sell price bands confirmed by the business; these seed NilJob
- **Reference:** §5

### ▶ `P0-PMO-10` · Confirm the six sponsor packages and their inventory

**Order** 16 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 2

Confirm the six sponsor packages — Test Drive through Season Partner — with prices, athlete counts and what is included in each.

- **Depends on:** nothing — startable now
- **Done when:** Name, price band, athlete count and inventory JSON confirmed per package
- **Reference:** §7

### ✅ `P0-PMO-13` · Decide the margin floor rule and tier-derived sell floors

**Order** 16.5 · **PMO** · **Where:** Document · **1d** · **Done** · **Unblocks** 1

Answer the commercial question `P0-PMO-09` and `P0-PMO-10` documented but could not close. The §6 tier multiplier scales athlete pay while nothing scales the §5 sell floor, so a Premium athlete at the top of the base band costs more than the job's cheapest sell price on all seven jobs. Decide the rule that prevents it and the floors that follow from it.

- **Depends on:** nothing — startable now
- **Done when:** Floor multiple, per-tier derived sell floors, the SX-07 band correction and the six packages' job-code line items all recorded in a decision document
- **Reference:** §5, §6, §7 · `documentation/SponsorX-Pricing-Floor-Decision.md`

### ▶ `P0-DATA-03` · Define Content Value Score v1 factors and weights

**Order** 17 · **DATA** · **Where:** Document · **1d** · **Ready** · **Unblocks** 1

Agree the seven things that make up an athlete's score and how much each counts. Phase 1 is rules-based and manual; the algorithm comes much later.

- **Depends on:** nothing — startable now
- **Done when:** The seven §14 factors, their weights, and the manual inputs each depends on
- **Reference:** §14

### ▶ `P0-LEG-06` · NIL eligibility + athletic-association review for high-school athletes

**Order** 18 · **LEG** · **Where:** External · counsel · **3d** · **Ready** · **Unblocks** 1

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Find out what state NIL law and high-school athletic associations actually forbid, so the product can enforce it rather than discovering it later.

- **Depends on:** nothing — startable now
- **Done when:** Written constraints list the product must enforce
- **Reference:** §26, §4

### ⏸ `P0-ART-01` · Produce the ERD as a distributable diagram (§38 deliverable)

**Order** 19 · **ART** · **Where:** Design tool · **3d** · **Blocked** · **Unblocks** 0

Draw the database diagram so a developer can see the whole data model on one page. Needs the RBAC matrix first so the relationships are right.

- **Depends on:** P0-PMO-07
- **Done when:** All Phase 1 tables from §20 with relationships, readable at print size
- **Reference:** §20, §38

### ▶ `P0-ART-02` · Produce the state-machine diagrams (§38 deliverable)

**Order** 20 · **ART** · **Where:** Design tool · **3d** · **Ready** · **Unblocks** 0

Draw the eight lifecycle diagrams — how an application, an invitation, a campaign order, a deliverable etc. move between states. Developers build directly from these.

- **Depends on:** nothing — startable now
- **Done when:** All eight §21 state machines drawn; athlete onboarding and Campaign Order are the two §38 names explicitly
- **Reference:** §21, §38

### ⏸ `P0-DATA-02` · Define the reward event taxonomy (§38 deliverable)

**Order** 21 · **DATA** · **Where:** Document · **1d** · **Blocked** · **Unblocks** 0

Define exactly what counts as a scan, a landing, a claim and a redemption. If these are fuzzy, the whole reward funnel measures nothing.

- **Depends on:** nothing — startable now *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** SCAN / LANDING / CLAIM / REDEEM defined with the exact trigger for each
- **Reference:** §16, §38

### ▶ `P0-LEG-05` · Reward terms review (sweepstakes / coupon legality)

**Order** 22 · **LEG** · **Where:** External · counsel · **1d** · **Ready** · **Unblocks** 0

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Check which reward types are legal in your states — coupons are easy, sweepstakes are heavily regulated.

- **Depends on:** nothing — startable now
- **Done when:** Written confirmation of which reward types are permitted in target states
- **Reference:** §16

### ▶ `P0-OPS-04` · Provision Zoho API credentials and sandbox

**Order** 23 · **OPS** · **Where:** Zoho dashboard · **1d** · **In progress** · **Unblocks** 0

Get Zoho API credentials and a sandbox org, so sync can be built without touching real sales data.

- **Depends on:** nothing — startable now
- **Done when:** Client ID, secret and refresh token issued; a sandbox or test org available for sync development
- **Reference:** §18, Addendum A9, [`SponsorX-Zoho-Credentials-and-Sandbox.md`](./SponsorX-Zoho-Credentials-and-Sandbox.md) — the scope list, env contract and both console runbooks

### ▶ `P0-OPS-05` · Create the Athlete / Content Partner custom module in Zoho

**Order** 24 · **OPS** · **Where:** Zoho dashboard · **3d** · **In progress** · **Unblocks** 0

Click-work in the Zoho CRM admin UI: Setup → Modules and Fields → Create Module, then add the fields the mapping document specifies. This is the only object in §18 with no home in your CRM — Accounts, Contacts, Leads, Deals, Tasks and Campaigns all exist as stock modules already. It must come AFTER P0-PMO-08, because the mapping document is what says which fields the module needs; building it first means building it twice. rcfworks@gmail.com holds the Administrator profile, so no one else's permission is required.

- **Depends on:** P0-PMO-08
- **Done when:** The Athlete / Content Partner custom module exists in Zoho with every field the mapping document specifies, and its API name is recorded for the sync code to use
- **Reference:** §18, §38

### ✅ `P0-OPS-06` · Add the `SponsorX_ID` external-ID field to the five stock modules

**Order** 24.5 · **OPS** · **Where:** Zoho dashboard · **1d** · **Done** · **Unblocks** 6

§18 requires every synced object to carry an external ID so that a retry cannot create a duplicate, and the org had nothing to put one in — no external field existed on any module. Add one custom field, `SponsorX ID`, to `Accounts`, `Contacts`, `Leads`, `Deals` and `Tasks`: Single Line, 50 characters, marked **External**, shown on the layout and not editable by staff. Zoho treats an external field as inherently unique, so the separate Unique flag is neither needed nor accepted alongside it. Raised out of gap **G-1** of the mapping document, which found this work unowned — `P0-OPS-05` covers only the custom module, and without these five fields §18's duplicate prevention is unimplementable.

- **Depends on:** P0-PMO-08
- **Done when:** `SponsorX_ID` exists on all five stock modules as an external field, and each generated API name is confirmed by a metadata read
- **Reference:** §18, §5.1 of the mapping document


### ▶ `P0-PMO-04` · Decide SMS in/out for Phase 1 (G-06)

**Order** 25 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 0

DECISION GATE G-06 · SMS in Phase 1 — in or out? Default is out.  —  Decide whether text messages are in Phase 1. Default is no — it adds a vendor for little gain right now.

- **Depends on:** nothing — startable now
- **Done when:** Written decision; if out, no TWILIO_* appears in any environment
- **Reference:** Addendum A1

### ⏸ `P0-PMO-06` · Confirm the PDF worker has a real requirement

**Order** 26 · **PMO** · **Where:** Document · **1d** · **Blocked** · **Unblocks** 0

PDF generation appears nowhere in the 39-section blueprint, yet it shaped the entire hosting decision. Confirm somebody actually needs it before it shapes anything else.

- **Depends on:** P0-PMO-05
- **Done when:** Either a stated requirement or a decision to drop it — it shaped the hosting architecture and appears in none of the 39 sections
- **Reference:** Addendum A10

### ▶ `P0-PMO-12` · Reconcile the stale baseline memory snapshot

**Order** 27 · **PMO** · **Where:** Document · **1d** · **Ready** · **Unblocks** 0

The baseline notes in the repo still describe an older stack (Express, Redis, MinIO). Correct them or mark them superseded so nobody builds from the wrong page.

- **Depends on:** nothing — startable now
- **Done when:** Initial Memory/02-confirmed-tech-stack.md either corrected to the Railway stack or explicitly marked superseded
- **Reference:** Memory 04

### ✓ `P0-OPS-07` · Repo split + Docker local stack + standalone Express API scaffold

**Order** 7.5 · **OPS** · **Where:** Code · **5d** · **Done**

Split the repo into npm workspaces — `frontend/` for the Next.js app,
`backend/` for the Express API, the pg-boss worker and Prisma. Stand up a
one-command local environment (Postgres, Redis, MinIO with its buckets, a
one-shot Prisma migrate, the worker). Scaffold the Express service —
`config/env`, `db`, `redis`, `storage`, `health`, `/api/v1` — run with tsx.
One Prisma schema. Confirmed architecture: stack-decision Addendum B.

- **Depends on:** nothing — this is the split everything after it assumes
- **Done when:** `npm install` (workspaces) clean; the local stack starts with
  one command and every service it defines reports healthy with both buckets
  created; backend `tsc` and Express `/health` + `/health/ready`
  (db/redis/storage) green; frontend `next build`; tests pass; one Prisma
  schema generates the backend client, and the frontend reaches the API rather
  than the database
- **Reference:** Addendum B, Guide §02, §10

**This entry was written on 2026-09-22**, after the row had been sitting on the
board with no definition here — the same plan/board drift recorded against the
`P1-FE-09`…`P1-FE-15` rows a day earlier. Two clauses of the original
acceptance were amended in writing it, and both were wrong rather than merely
inconvenient:

- *"`prisma generate` produces backend **and frontend** clients from one
  schema"* contradicts the architecture as built. `P2-BE-08` removed the
  frontend's database access on purpose, so that authorisation lives with the
  data and `/api/v1` serves the portals, §8's service account and INFINEX on
  equal terms. `frontend/package.json` carries no Prisma dependency and there
  is no generated client there to produce.
- *"`docker compose up` brings … healthy"* named a **runtime** where the
  clause means a **property**. Docker appears in no production path — Railway
  builds from source, Postgres and Redis are managed, storage is Cloudflare R2
  — and in no CI path, where GitHub Actions supplies its own service
  containers. It is a local-development convenience, and the acceptance now
  asks for what it was actually protecting: that the stack starts with one
  command and reports healthy.

The compose file itself is unchanged and still defines that stack.


## Stage 1 · UI Scaffold on Fixtures

**Objective.** a complete, on-brand, clickable demo of the entire §39 loop

**Entry gate.** none.

**Exit gate.** no ScreenStub remains; every route renders every state in both

*16 tasks · 0 person-days*

### ✅ `P1-ART-01` · Brand retheme — mockup v1.0 purple/teal → BTG logo blue/orange

**Order** — · **ART** · **Where:** Design tool · **—** · **Done** · **Unblocks** 0

Already shipped. The whole app was re-themed from the old mockup purple to the BTG logo's blue and orange via one token file.

- **Depends on:** nothing — startable now
- **Done when:** Token swap in globals.css; ground #0A0C10, primary #2E9BF5, accent #F97A1F, warn #FACC15; portal accents follow the logo

### ✅ `P1-ART-02` · Wire official logo assets

**Order** — · **ART** · **Where:** Design tool · **—** · **Done** · **Unblocks** 0

Already shipped. Official logo artwork wired into login, portal headers, marketing hero and the browser tab icon.

- **Depends on:** nothing — startable now
- **Done when:** sponsorx-badge/title/full.png in public/; Logo component; favicon via src/app/icon.png

### ✅ `P1-ART-03` · Sponsor portal redesign — Command Deck + Executive Bento + radial ROI gauge

**Order** — · **ART** · **Where:** Design tool · **—** · **Done** · **Unblocks** 0

Already shipped. The four sponsor-facing pages redesigned for client-demo quality, including the radial ROI gauge.

- **Depends on:** nothing — startable now
- **Done when:** Spec and plan under docs/superpowers/; shipped across 9 commits

### ✅ `P1-FE-01` · Build the 10 remaining stub routes on fixtures

**Order** — · **FE** · **Where:** Code · **—** · **Done** · **Unblocks** 0

Already shipped. The last ten placeholder screens were built out, so every portal is fully navigable on mock data.

- **Depends on:** nothing — startable now
- **Done when:** join, athlete/invitations, athlete/orders/[id], athlete/earnings, admin, admin/applications, admin/approvals, admin/finance, packages, property — no ScreenStub remains

### ✅ `P1-FE-02` · State & polish pass across all routes (A2)

**Order** — · **FE** · **Where:** Code · **—** · **Done** · **Unblocks** 0

Already shipped. Loading, empty and error states across all 25 routes, plus the light theme and responsive behaviour.

- **Depends on:** nothing — startable now
- **Done when:** Loading / empty / error states; light theme; responsive; 25 routes build green

### ✅ `P1-FE-03` · No-JS accessible fan redeem page

**Order** — · **FE** · **Where:** Code · **—** · **Done** · **Unblocks** 0

Already shipped. The fan redeem page renders with JavaScript disabled and passes accessibility checks.

- **Depends on:** nothing — startable now
- **Done when:** r/[token] renders without JavaScript, branded, a11y-checked

### ▶ `P1-FE-04` · Extend fixtures to cover every edge state

**Order** 28 · **FE** · **Where:** Code · **1d** · **Ready** · **Unblocks** 5

The mock data currently shows happy paths. Add the awkward cases — a minor without a verified guardian, an expired invite, a campaign under-delivering — so the screens are designed for reality.

- **Depends on:** nothing — startable now
- **Done when:** A minor athlete with unverified guardian, an expired invite, an under-delivering campaign, a held earning, a declined order and a rejected application are all representable and rendered
- **Reference:** Roadmap A3

### ✅ `P1-ART-04` · Design the sponsor ROI report layout for print/PDF

**Order** 29 · **ART** · **Where:** Design tool · **3d** · **Done** · **Unblocks** 0

Design the sponsor's results report at print width, so it survives being turned into a PDF rather than looking broken.

- **Depends on:** P0-PMO-05
- **Done when:** A print-width layout exists for screen 12 that survives PDF rendering — feeds P7-BE-05
- **Reference:** §9 screen 12

### ⏸ `P1-ART-05` · Design the QR / reward fan-facing landing treatment

**Order** 30 · **ART** · **Where:** Design tool · **1d** · **Blocked** · **Unblocks** 0

Design what a fan sees after scanning: the offer, the consent text, and the 'already used' and 'expired' states.

- **Depends on:** nothing — startable now *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** Consent language placed, offer presentation designed, single-use and expired states designed
- **Reference:** §16

### ▶ `P1-ART-06` · Produce the marketing site visual assets

**Order** 31 · **ART** · **Where:** Design tool · **3d** · **Ready** · **Unblocks** 0

Produce the imagery for the public marketing site — hero, case-study slots, package presentation.

- **Depends on:** nothing — startable now
- **Done when:** Hero, proof/case-study slots and package presentation art ready for the public homepage
- **Reference:** §9 screen 1

### ✅ `P1-ART-07` · Design the athlete onboarding flow visuals (§11 ten sections)

**Order** 32 · **ART** · **Where:** Design tool · **3d** · **Done** · **Unblocks** 0

Design the athlete sign-up as a progressive flow across its ten sections, including the branch where a parent has to be involved.

- **Depends on:** nothing — startable now
- **Done when:** All ten §11 sections designed as a progressive flow, including the guardian branch
- **Reference:** §11

### ⏸ `P1-FE-05` · Field-level authz audit of every fixture-backed screen

**Order** 33 · **FE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Walk every screen and confirm no sponsor can see what an athlete is paid, and no athlete can see a campaign budget. This is the leak that matters most in this product.

- **Depends on:** P1-FE-04
- **Done when:** No sponsor-facing screen renders AthleteRate.amount; no athlete-facing screen renders Campaign.budget — verified route by route
- **Reference:** §26, Guide §04

### ⏸ `P1-PMO-01` · Produce wireframes/design records for all 12 core screens (§38)

**Order** 34 · **PMO** · **Where:** Document · **3d** · **Blocked** · **Unblocks** 0

Capture the built screens as the formal design record. A contractual deliverable, and cheap to do now that the screens exist.

- **Depends on:** P1-FE-04
- **Done when:** The §38 deliverable exists — current built screens captured as the design record
- **Reference:** §38

### ⏸ `P1-QA-01` · Walk the full §39 loop on fixtures and log every gap

**Order** 35 · **QA** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Click through the entire business loop on mock data and write down every place it breaks or dead-ends.

- **Depends on:** P1-FE-04
- **Done when:** A written pass/fail list for all 11 loop steps; every gap is either fixed or filed as a task
- **Reference:** §39

### ⏸ `P1-QA-02` · Accessibility audit of all routes

**Order** 36 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Check colour contrast, keyboard navigation, and that the fan redeem page works with JavaScript switched off.

- **Depends on:** P1-FE-04
- **Done when:** Contrast AA in both themes; keyboard navigation complete; redeem page passes without JS
- **Reference:** §16

### ⏸ `P1-QA-03` · Responsive audit — phone, tablet, desktop

**Order** 37 · **QA** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Check every screen on a phone. The athlete portal and redeem page are phone-first in real use.

- **Depends on:** P1-FE-04
- **Done when:** No horizontal scroll at 360px; portal navigation usable on phone
- **Reference:** §9

### SponsorX NEXT — UI scaffold *(added 2026-09-22)*

The NEXT programme's screens are built here, on fixtures, for the same reason every other screen was: Block B is pure substitution behind finished work. None of these rows reads the backend, none of them needs a new table, and controls whose action is not real yet ship disabled with a reason rather than hidden. The wiring lives in Stage 9 and is gated.

### ▶ `P1-ART-08` · Design the two new public audiences

**Order** 37.01 · **ART** · **Where:** Design tool · **5d** · **Ready** · **Unblocks** 6

(public) speaks to athletes and sponsors today. NEXT adds teenagers and school administrators — different voice, different proof, different CTA, and a page that has to survive being forwarded to a principal. Most of the design hours in this programme sit here, not in the portals.

- **Depends on:** nothing — startable now
- **Done when:** Both audiences designed in dark and light; the administrator page reads as a programme proposal, not a product page
- **Reference:** Spec §9.5

### ▶ `P1-FE-18` · Apply the SponsorX NEXT UI requirement across the existing pages

**Order** 37.02 · **FE** · **Where:** Code · **2d** · **Ready** · **Unblocks** 5

The fifth portal accent and everything that follows from it. NEXT violet is already chosen in Design/frontEndVersion2/01-accent-decision.png: --sx-next #a479ff / --sx-next-soft #c3a6ff dark, #6d31d9 / #7c3aed Frost, every pair AA or better and 52 degrees clear of athlete blue. Portal is declared twice — portal-shell.tsx and server/portal.ts — and both need the member; ACCENT is Record<Portal,...>, so the build fails until the entry exists. Four nav glyphs join ICONS. Fixtures only: no route reads the backend.

- **Depends on:** nothing — startable now
- **Done when:** A fifth portal renders with its own accent, bloom, hairlines and watermark; both Portal declarations agree; contrast re-run in both themes with the real Frost values
- **Reference:** Spec §9.1, §9.2

### ⏸ `P1-FE-19` · Build the student portal on fixtures, mobile-first

**Order** 37.03 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

The first surface in the app that is not a desk. A sixteen-year-old selling an ad in a parking lot on a phone — designed at 390px and widened, which is the reverse of how everything else was built. Assignments, sales and codes render from fixtures; actions that need the backend ship disabled with a reason, not hidden.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** Usable one-handed at 390px with no horizontal scroll; every disabled control says why; the desktop view is the widened one, not the designed one
- **Reference:** Spec §9.4, §8

### ⏸ `P1-FE-20` · Build the advisor desk on fixtures

**Order** 37.04 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Reuses approvals-desk unchanged — DeliverableState is already an editorial workflow: drafted, read by the advisor, seen by the sponsor where one paid for a feature, approved, printed, confirmed.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** Applications and content review render for one school from fixtures; approvals-desk reused rather than rebuilt
- **Reference:** Spec §3, §7, §8

### ⏸ `P1-FE-21` · Build the edition page map on fixtures

**Order** 37.05 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

The one genuinely new interaction. A page grid showing sold, reserved and open against a layout, the back cover as a singleton, the close date counting down. marketplace-catalog lists packages; nothing in the app renders scarcity against a position.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** Sold, reserved and open distinguishable at a glance; the back cover renders as a singleton; the close date is visible without hovering
- **Reference:** Spec §9.3, Design/frontEndVersion2

### ⏸ `P1-FE-22` · Build the ad slot inventory ledger on fixtures

**Order** 37.06 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

The admin list behind the page map: every slot across editions, filterable by state, with the campaign that took it.

- **Depends on:** P1-FE-18
- **Done when:** Every slot's state and buyer readable in one list; filter-kit reused rather than rebuilt
- **Reference:** Spec §8

### ⏸ `P1-FE-23` · Build the revenue splits screen on fixtures

**Order** 37.07 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Per edition, the four payees, their share and their computed amount. Must not reuse the finance workspace's earnings treatment — these are not athlete payouts, and a screen that looks like one invites the confusion the model separation exists to prevent.

- **Depends on:** P1-FE-18
- **Done when:** A split reads per edition and is visibly distinct from the athlete earnings surface
- **Reference:** Spec §5.3, §8

### ⏸ `P1-FE-24` · Build the public NEXT programme landing

**Order** 37.08 · **FE** · **Where:** Code · **3d** · **Blocked**

(public)/next — the two audiences in one page without either feeling like an afterthought. Static: nothing here needs a backend at all.

- **Depends on:** P1-ART-08
- **Done when:** Both audiences have a clear next step; works at 390px
- **Reference:** Spec §8, §9.5

### ⏸ `P1-FE-25` · Build the Become the Media application wizard on fixtures

**Order** 37.09 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

(public)/next/apply. Reuses join-wizard's machinery, including the guardian step, which already handles minors.

- **Depends on:** P1-ART-08
- **Done when:** A student completes the wizard on a phone against fixtures; the guardian step appears on the existing minor rule
- **Reference:** Spec §8, §5.1

### ⏸ `P1-FE-26` · Build the school adoption page

**Order** 37.1 · **FE** · **Where:** Code · **2d** · **Blocked**

(public)/next/schools — administrator-facing, and it has to survive being forwarded to a principal. Static.

- **Depends on:** P1-ART-08
- **Done when:** An administrator can read what the school commits to and receives, and forward the page
- **Reference:** Spec §8, §9.5

#### Added by NEXT spec v2.0 *(2026-09-22)*

Four surfaces version 1.0 either deferred or never named. The free digital edition is the largest correction: principle 10 makes it the V1 reader product, where 1.0 had it as a Stage 2 nicety.

### ⏸ `P1-FE-27` · Build the free digital edition reader on fixtures

**Order** 37.11 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

Principle 10 makes free digital the V1 reader product, not a deferred nicety — v1.0 had this as Stage 2 and it was wrong. (public)/next/[school]/[edition]. Article pages run on the existing type scale: V1 does not get a long-form editorial scale, and inventing one here is the scope error that sinks the programme.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** An edition reads end to end from fixtures on a phone and a desktop; no new type scale is introduced; no route reads the backend
- **Reference:** Spec v2.0 §8, §9, principle 10
- **Note:** Design/frontEndVersion2 is being rebuilt as of 2026-09-22 — treat the screens there as direction, not a specification, and re-check them before building.

### ⏸ `P1-FE-28` · Add Claim this profile and the FEATURED state to the athlete page

**Order** 37.12 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

(public)/athletes/[slug] already exists and is the QR destination. It gains the claim entry point and a FEATURED treatment. Featured does not mean represented and claiming does not equal commercial activation (principles 1 and 2) — the screen has to make that difference legible, because a featured athlete who believes they are signed is the misunderstanding this whole consent model exists to prevent.

- **Depends on:** P1-FE-18
- **Done when:** A FEATURED athlete renders distinctly from an ACTIVE one; the claim entry point is present and visibly does not grant representation; the existing page's behaviour for ACTIVE athletes is unchanged
- **Reference:** Spec v2.0 §5.4, §8, principles 1-3

### ⏸ `P1-FE-29` · Build the rights ledger and clearance queue on fixtures

**Order** 37.13 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

(app)/admin/next/rights. One ledger, three population paths (§6.1) — a guardian ticking a box, a negotiated media licence and a student agreement all land in one record even though the capture differs. Rights are checked before publication (principle 4), so the queue's job is to make an uncleared item impossible to miss.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** Cleared, pending and blocked are distinguishable at a glance; an item that would publish without clearance is visually unmissable; filter-kit reused
- **Reference:** Spec v2.0 §5.3, §6.1, §8

### ⏸ `P1-FE-30` · Build the points balance on fixtures, deliberately unlike earnings

**Order** 37.14 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Must look nothing like athlete/earnings. A student or a parent reading a points balance as a dollar balance is a legal problem before it is a usability one — different card, different treatment, no currency glyph anywhere on the screen. Designs exist in Design/frontEndVersion2 (02-06), which is being rebuilt, so treat them as direction rather than a spec.

- **Depends on:** P1-FE-18, P1-ART-08
- **Done when:** No currency glyph, no earnings-derived component and no dollar-shaped number anywhere on the screen; accrual reasons are readable in plain words
- **Reference:** Spec v2.0 §5.5, §9
- **Note:** Design/frontEndVersion2 is being rebuilt as of 2026-09-22 — treat the screens there as direction, not a specification, and re-check them before building.

## Stage 2 · Platform Foundations

**Objective.** the heaviest phase, and the one that unblocks everything. At the

**Entry gate.** G-02 (data residency) closed — regions must be set before the

**Exit gate.** all of the above demonstrable in a PR environment.

*27 tasks · 0 person-days*

### ▶ `P2-OPS-01` · Create the Railway project with three services

**Order** 38 · **OPS** · **Where:** Vendor console · **3d** · **In progress** · **Unblocks** 114

Create three services in one Railway project — the web app, the background worker, and Postgres — talking privately to each other with the database never exposed to the internet.

- **Depends on:** P0-OPS-01
- **Done when:** web, worker and postgres exist in one project; web and worker reach Postgres over the internal hostname; the database has no public exposure
- **Reference:** Guide §10

### ▶ `P2-BE-02` · Author the full Prisma schema + initial migration

**Order** 39 · **BE** · **Where:** Code · **5d** · **In progress** · **Unblocks** 104

Write the entire database structure in one go: every table, every lifecycle state, a tenant marker on everything. The single largest task in the project and almost everything depends on it.

- **Depends on:** P2-OPS-01, P0-PMO-07
- **Done when:** Every §20 table modelled; tenantId on everything; all eight §21 state machines as enums; external IDs + lastSyncOrigin + lastSyncHash on every Zoho-touched model
- **Reference:** §20, §21, Guide §03

### ▶ `P2-INT-01` · Replace mock-auth with Clerk

**Order** 40 · **INT** · **Where:** Code + console · **3d** · **In progress** · **Unblocks** 53

Swap the fake sign-in for real Clerk authentication. Clerk proves who you are; your own database decides what you can do.

- **Depends on:** P0-OPS-03, P2-BE-02
- **Done when:** Real sign-in works; User.clerkId mirrors the Clerk identity; no tenant or role data lives in Clerk Organizations or session claims
- **Reference:** Addendum A4

### ▶ `P2-BE-04` · Build actor.ts and scope.ts

**Order** 41 · **BE** · **Where:** Code · **3d** · **In progress** · **Unblocks** 51

Two files that answer 'who is asking' and 'what are they allowed to see'. Every database query in the codebase goes through them. Retrofitting this later is the most expensive mistake available.

- **Depends on:** P2-BE-02, P2-INT-01
- **Done when:** requireActor() resolves a Clerk user to a Postgres tenant + roles; every scope function defaults to DENY; no query in the codebase bypasses them
- **Reference:** Addendum A4, Guide §04

### ✅ `P2-BE-05` · Build the outbox + pg-boss drain

**Order** 42 · **BE** · **Where:** Code · **3d** · **Done** · **Unblocks** 23

Background jobs stored in Postgres rather than Redis. The key property: a job is saved in the same transaction as the thing that caused it, so neither can exist without the other.

- **Depends on:** P2-BE-02
- **Done when:** enqueue() writes an outbox row in the caller's transaction; the worker drains with FOR UPDATE SKIP LOCKED; two worker instances never double-process a row
- **Reference:** Addendum A3, Guide §05

### ▶ `P2-BE-03` · Add the partial indexes Prisma will not create

**Order** 43 · **BE** · **Where:** Code · **1d** · **In progress** · **Unblocks** 6

A handful of database indexes Prisma cannot generate — including the one that makes a reward physically impossible to redeem twice.

- **Depends on:** P2-BE-02
- **Done when:** prisma/sql/ holds them; critically the partial unique index that makes single-use reward redemption race-safe
- **Reference:** Guide §03

### ▶ `P2-BE-08` · Build the R2 presign module

**Order** 44 · **BE** · **Where:** Code · **3d** · **In progress** · **Unblocks** 6

Generate temporary upload links so a phone can send video straight to Cloudflare rather than through your server. Large uploads through a Node server is how a busy content day becomes an outage.

- **Depends on:** P0-OPS-02
- **Done when:** presignUpload() issues short-TTL signed PUTs against the private bucket; public-bucket reads need no signing; every private grant is audited
- **Reference:** Addendum A8, Guide §11

### ▶ `P2-OPS-03` · Wire migrations as a pre-deploy release step

**Order** 45 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 5

Database migrations run as a release step just before new code goes live — never during the build, which runs far more often.

- **Depends on:** P2-OPS-01
- **Done when:** prisma migrate deploy runs as Railway's pre-deploy command before the new version takes traffic — never in the build step
- **Reference:** Guide §10

### ▶ `P2-BE-01` · Install and pin the dependency set

**Order** 46 · **BE** · **Where:** Code · **1d** · **In progress** · **Unblocks** 4

Install every library at its pinned version and set up the Prisma config.

- **Depends on:** P0-PMO-11
- **Done when:** Every package from Guide §01 installed at an exact version; prisma.config.ts present with the explicit client output path
- **Reference:** Guide §01

### ▶ `P2-OPS-09` · Establish staging + production environments

**Order** 47 · **OPS** · **Where:** Vendor console · **3d** · **In progress** · **Unblocks** 4

Stand up staging and production, each with its own database. Turn on backups and confirm you can actually restore to a point in time.

- **Depends on:** P2-OPS-03
- **Done when:** Both exist with their own Postgres; scheduled backups on for production; point-in-time restore confirmed available on the plan
- **Reference:** Guide §10

### ▶ `P2-OPS-05` · Write the environment seed job

**Order** 48 · **OPS** · **Where:** Code · **3d** · **In progress** · **Unblocks** 3

A script that fills an empty database with realistic demo data. Because preview environments start empty on Railway, this is infrastructure — if it rots, every preview becomes useless.

- **Depends on:** P2-BE-02
- **Done when:** worker/jobs/seed-environment.ts builds a usable demo tenant from scratch; a fresh PR environment is immediately usable
- **Reference:** Guide §10

### ▶ `P2-OPS-11` · Configure monitoring and alerting

**Order** 49 · **OPS** · **Where:** Vendor console · **3d** · **In progress** · **Unblocks** 2

Make service health, queue depth and failed jobs visible, and make sure somebody gets woken up if the worker stops processing.

- **Depends on:** P2-OPS-09
- **Done when:** Service health, queue depth, failed jobs and error rate all visible; someone is paged when the worker stops draining
- **Reference:** §38

### ▶ `P2-SEC-01` · Author the authorisation matrix test suite

**Order** 50 · **SEC** · **Where:** Code · **3d** · **In progress** · **Unblocks** 2

Turn the RBAC matrix into an automated test that runs on every commit. When someone widens a permission to fix a bug, this tells them what else they just widened.

- **Depends on:** P2-BE-04, P0-PMO-07
- **Done when:** tests/authz.matrix.test.ts seeds two tenants, two sponsors, two athletes, a guardian and a property, and asserts every role against every resource
- **Reference:** §30, Guide §09

### ✅ `P2-BE-06` · Build the audit helper

**Order** 51 · **BE** · **Where:** Code · **1d** · **Done** · **Unblocks** 1

A single helper that records who changed what and when, for pricing, agreements, campaigns, payouts and permissions.

- **Depends on:** P2-BE-02
- **Done when:** audit(tx, actor, action, entity, id) writes inside the caller's transaction; pricing, agreement, campaign, payout and permission changes are all covered
- **Reference:** §26

### ▶ `P2-BE-07` · Build the contracts registry and OpenAPI generation

**Order** 52 · **BE** · **Where:** Code · **3d** · **In progress** · **Unblocks** 1

Define API shapes once in code and generate the API specification from them, rather than hand-writing a spec that drifts from reality.

- **Depends on:** P2-BE-01
- **Done when:** src/contracts/registry.ts emits openapi.json at /api/v1/openapi.json; the spec is generated from Zod, never hand-written
- **Reference:** §38, Addendum A2, Guide §02

### ▶ `P2-QA-01` · Stand up the test harness

**Order** 53 · **QA** · **Where:** Code · **3d** · **In progress** · **Unblocks** 1

Set up the testing tools so tests can run locally and automatically on every commit.

- **Depends on:** P2-BE-02
- **Done when:** Vitest for unit + matrix, Playwright for E2E; both runnable locally and in CI against a seeded database
- **Reference:** Guide §01

### ▶ `P2-BE-09` · Establish the repo layout

**Order** 54 · **BE** · **Where:** Code · **1d** · **In progress** · **Unblocks** 0

Create the folder structure: one repository, two deployable things (app and worker), sharing the same business logic so they can never disagree.

- **Depends on:** P2-BE-01
- **Done when:** The Addendum B workspace layout exists — `backend/src/contracts/`, `backend/src/domain/`, `backend/worker/jobs/`, `backend/prisma/sql/`, `backend/tests/`, and `frontend/src/server/` for the web app's server-only API client; one repo, two deployables (web, api), one lockfile. *(Amended 2026-09-24: the Guide §02 paths predate the 2026-09-21 split into `frontend/` + `backend/`. Pinned by `backend/tests/layout.test.ts`.)*
- **Reference:** Guide §02

### ▶ `P2-FE-01` · Swap fixture reads for real queries behind a flag

**Order** 55 · **FE** · **Where:** Code · **3d** · **In progress** · **Unblocks** 0

Point the finished screens at the real database instead of mock data, keeping mocks available for demos.

- **Depends on:** P2-BE-04
- **Done when:** An authenticated user loads an empty portal from Postgres; fixtures remain available for demo mode
- **Reference:** Roadmap B0

### ▶ `P2-INT-02` · Enable MFA for privileged roles

**Order** 56 · **INT** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 0

Require two-factor authentication for admin and finance accounts in production.

- **Depends on:** P2-INT-01
- **Done when:** Admin and finance roles require MFA in the production instance
- **Reference:** §26

### ▶ `P2-OPS-02` · Configure web for standalone output

**Order** 57 · **OPS** · **Where:** Code · **1d** · **In progress** · **Unblocks** 0

Configure the app to build as a plain Node server, so it can move to another host without a rewrite.

- **Depends on:** P2-OPS-01
- **Done when:** next.config.ts sets output: 'standalone'; web runs next start; worker runs node worker/index.js with no public domain
- **Reference:** Guide §10

### ▶ `P2-OPS-04` · Configure the environment variable set

**Order** 58 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 0

Set the environment variables, carefully: Zoho credentials belong only on the worker, never on the public web app.

- **Depends on:** P2-OPS-01, P0-OPS-02, P0-OPS-03
- **Done when:** Every variable in Guide §10 present and scoped correctly — critically, ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN on worker only, ZOHO_WEBHOOK_SECRET on web
- **Reference:** Guide §10

### ▶ `P2-OPS-06` · Add the bare-findMany() lint rule

**Order** 59 · **OPS** · **Where:** Code · **1d** · **In progress** · **Unblocks** 0

A lint rule that fails the build if a database query does not explicitly list the fields it wants. This is what stops accidental data leaks at scale.

- **Depends on:** P2-BE-01
- **Done when:** The build fails on any Prisma read without an explicit select
- **Reference:** Guide §04

### ▶ `P2-OPS-07` · Set up CI: typecheck, lint, unit, authz matrix

**Order** 60 · **OPS** · **Where:** Code · **3d** · **In progress** · **Unblocks** 0

Wire up continuous integration so every commit is type-checked, linted, unit-tested and permission-tested.

- **Depends on:** P2-QA-01
- **Done when:** Every commit runs all four; the authz matrix is a required check, not an advisory one
- **Reference:** §30, Guide §09

### ▶ `P2-OPS-08` · Configure PR environments

**Order** 61 · **OPS** · **Where:** Vendor console · **1d** · **In progress** · **Unblocks** 0

Give every pull request its own throwaway environment with a fresh seeded database — never a copy of production data.

- **Depends on:** P2-OPS-05
- **Done when:** Each pull request gets its own environment with a fresh Postgres, seeded by the job — never a copy of production
- **Reference:** Guide §10

### ▶ `P2-OPS-10` · Define the deploy ordering rule

**Order** 62 · **OPS** · **Where:** Document · **1d** · **In progress** · **Unblocks** 0

Write down and enforce the rule that the worker deploys before the web app, so a new job type always has a handler waiting.

- **Depends on:** P2-OPS-01
- **Done when:** Documented and enforced: worker deploys before web on any release adding a job type; pg-boss migrations run on worker boot only
- **Reference:** Guide §10

### ▶ `P2-PMO-01` · Write the deployment runbook (§38 deliverable)

**Order** 63 · **PMO** · **Where:** Document · **3d** · **In progress** · **Unblocks** 0

Document how to deploy, how to roll back, and what to do when a migration fails. Then test it once, for real.

- **Depends on:** P2-OPS-09
- **Done when:** Deploy, rollback, migration-failure and restore procedures written down and tested once
- **Reference:** §38

### ▶ `P2-SEC-02` · Add field-level denial cases to the matrix

**Order** 64 · **SEC** · **Where:** Code · **1d** · **In progress** · **Unblocks** 0

Add the specific tests proving a sponsor cannot read athlete pay and an athlete cannot read a campaign budget.

- **Depends on:** P2-SEC-01
- **Done when:** SPONSOR_ADMIN → athleteRate.amount → deny and ATHLETE → campaign.budget → deny both present and passing
- **Reference:** Guide §04, §09

## Stage 3 · Athlete Network

**Objective.** a real athlete applies, an admin approves them, they reach ACTIVE

**Entry gate.** P2-BE-04 complete. G-03 (guardian method) and G-04 (email

**Exit gate.** an athlete who applied through /join appears ACTIVE in the admin

*21 tasks · 0 person-days*

### ▶ `P3-BE-01` · Athlete application contract + model + migration

**Order** 65 · **BE** · **Where:** Code · **3d** · **Ready** · **Unblocks** 51

The athlete sign-up form's data model and its approval lifecycle, from draft through review to active.

- **Depends on:** P2-BE-02
- **Done when:** All ten §11 sections captured; AthleteState DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED/CHANGES_REQUESTED/REJECTED→ACTIVE/SUSPENDED enforced in the domain layer
- **Reference:** §11, §21

### ⏸ `P3-BE-05` · Content capabilities, brand interests and restrictions

**Order** 66 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 39

Store what content an athlete can make, which brands they like, and crucially what they are forbidden from promoting — the last one drives conflict checking later.

- **Depends on:** P3-BE-01
- **Done when:** All three §11 sections stored; restrictions are queryable for the conflict check in Phase 4
- **Reference:** §11, §26

### ▶ `P3-BE-06` · Agreement acceptance with body hash

**Order** 67 · **BE** · **Where:** Code · **3d** · **Ready** · **Unblocks** 30

When someone accepts an agreement, record a fingerprint of the exact text they were shown, plus who, when and from where. That is what makes it hold up, not a signature image.

- **Depends on:** nothing — startable now *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** Acceptance records agreement version, body hash, signer, timestamp, IP, user agent and guardian where applicable
- **Reference:** §12, Guide §08

### ⏸ `P3-BE-07` · Application review + approval domain functions

**Order** 68 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

The admin actions: approve, request changes, reject. Every decision recorded and the applicant notified.

- **Depends on:** P3-BE-01
- **Done when:** Admin can approve, request changes or reject; every transition is audited and notifies the applicant
- **Reference:** §13, §23

### ◑ `P3-BE-13` · Athlete application submission — the public intake

**Order** 65.5 · **BE** · **Where:** Code · **3d** · **Code review**

The half of B1's exit that had no task. P3-BE-01 delivered the contract and the state machine and nothing consumed AthleteApplicationInput: no domain function, no route, and the seed creates users but no athletes, so the review surface could only decide applications that had no way to exist. /join is public, so this is the only write path in the API with no actor behind it — the tenant is configuration rather than input, an existing application is reachable only by a signed token that names it, and editing is refused unless the state allows it. Guardian capture stays with P3-BE-03; §37's gate sits between APPROVED and ACTIVE, not between an applicant and the form.

- **Depends on:** P3-BE-01
- **Done when:** An applicant submits at /join with no account and receives a signed link back to their own application; a CHANGES_REQUESTED application can be edited and is resubmitted by the same act; editing is refused once a decision is taken; the athlete, socials, audit row and receipt email commit together or not at all; a path with no actor cannot move anyone to ACTIVE
- **Reference:** §11, §21, §39, Addendum A3
- **Note:** Introduces SystemActor so the one bypass of the role check is greppable, and the Redis rate limiter the stack decision reserved Redis for. P3-FE-01 wires /join to these endpoints.

### ◑ `P3-BE-14` · Expose the rest of B1 over the API

**Order** 65.6 · **BE** · **Where:** Code · **3d** · **Code review**

Three tasks were Done whose domain functions no endpoint called: acceptAgreement (P3-BE-06), linkGuardian / verifyGuardian / readGuardianReadiness (P3-BE-03), and the APPROVED to ACTIVE move (P3-BE-01). B1's exit asks for an athlete ACTIVE with agreements and, if a minor, a verified guardian captured — apply and approve worked and then it stopped. Activation needs approve on athlete rather than on athleteApplication, which the matrix gives to NETWORK_MGR alone: BTG_ADMIN may approve an application and deliberately may not activate an athlete.

- **Depends on:** P3-BE-03, P3-BE-06, P3-BE-13
- **Done when:** An athlete can be activated over the API and §37's gate refuses a minor without a verified guardian; a guardian can be linked and verified with the attestation audited; an agreement can be accepted against the body hash actually shown and is refused when the text has moved on; the published relationship vocabulary is exactly the one linkGuardian accepts
- **Reference:** §4, §11, §12, §37, RBAC Matrix §5
- **Note:** The applicant-facing half of guardian capture — a minor's parent submitting details at /join — is NOT here. linkGuardian takes an Actor and a guardian at sign-up has no account, the same problem P3-BE-13 solved for the applicant. Raise it once /join's guardian step is settled. OPEN: the RBAC matrix contradicts itself — its athlete table gives BTG_ADMIN no Approve cell, while its §12 says BTG_ADMIN sets athlete status 'as the superset role'. policy.ts follows the table. Needs a pull request to the document, not a code change.

### ⏸ `P3-INT-01` · Build the transactional email send interface

**Order** 69 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

One function for sending email, with the chosen vendor hidden behind it, so switching vendors later touches one file. Every send is a background job so it retries.

- **Depends on:** P0-PMO-03
- **Done when:** A single send() abstraction behind which the chosen vendor sits; every send is a queued job so it retries
- **Reference:** Addendum A1, Guide §10

### ▶ `P3-BE-08` · Seed the SX-01…SX-07 NIL job catalogue

**Order** 70 · **BE** · **Where:** Code · **1d** · **Ready** · **Unblocks** 2

Load the seven standard job types into the database with their pay and price bands.

- **Depends on:** P0-PMO-09, P2-BE-02, P0-PMO-13
- **Done when:** All seven jobs seeded with base pay and sell price bands from §5, SX-07's corrected sell band ($1,050–$2,000), and each job's derived minimum sell price at Emerging, Creator and Premium
- **Reference:** §5

### ⏸ `P3-BE-03` · Guardian model, linkage and verification

**Order** 71 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Link minor athletes to a verified parent or guardian, and make participation depend on that verification.

- **Depends on:** P3-BE-01
- **Done when:** Minor athletes require a linked Guardian; verifiedAt gates participation; unverified guardian blocks acceptance downstream
- **Reference:** §4, §11, §37

### ⏸ `P3-BE-04` · Social account capture with provenance

**Order** 72 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 1

Record social handles and follower counts, tagged with where the number came from — initially the athlete's own word.

- **Depends on:** P3-BE-01
- **Done when:** AthleteSocial records platform, handle, followers, avgViews and a MetricSource label — defaulting to SELF_REPORTED
- **Reference:** §11, §22

### ⏸ `P3-BE-09` · Athlete rate card with tier multiplier

**Order** 73 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Set each athlete's individual rate per job type, with a manual tier multiplier. These numbers must never be visible to sponsors.

- **Depends on:** P3-BE-08
- **Done when:** Network manager sets tier and per-job rate manually; rates are versioned; AthleteRate.amount is never exposed to a sponsor-scoped query; setting a rate surfaces the minimum sell price it implies (rate × 1.4)
- **Reference:** §6, Guide §04

### ⏸ `P3-BE-11` · Seed the sponsor package catalogue

**Order** 74 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 1

Load the six sponsor packages into the database.

- **Depends on:** P0-PMO-10, P0-PMO-13
- **Done when:** All six §7 packages seeded with price band, athlete count and the job-code line items confirmed in `P0-PMO-13` — including Local Blitz narrowed to $1,500–$2,400 / 5–9 athletes and "iMC/BTG feature" as a non-NIL inventory line
- **Reference:** §7

### ⏸ `P3-BE-12` · Enforce the margin floor at quote and Campaign Order creation

**Order** 74.5 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Refuse to save a campaign order line whose sponsor price is below athlete cost × 1.4, at the moment the price is set rather than at month end. A hard block, not a warning — the rule exists because a network manager can otherwise assign a strong athlete to a discounted job in good faith and lose money on the campaign with nothing in the system objecting.

- **Depends on:** P0-PMO-13, P3-BE-11
- **Done when:** A line below the floor cannot be saved; the error names the job, the athlete tier, the computed floor and the shortfall; tests cover all seven jobs at all three tiers
- **Reference:** §5, §6, §7, §19 · `documentation/SponsorX-Pricing-Floor-Decision.md`

### ⏸ `P3-DATA-01` · Pilot cohort import job

**Order** 75 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Import the first 25 real athletes as a repeatable script, tested on staging first. Never hand-type production data.

- **Depends on:** P2-OPS-05
- **Done when:** The first 25 athletes can be imported as a job, run against staging first — never hand-seeded into production
- **Reference:** Guide §10, §36

### ⏸ `P3-FE-02` · Wire the admin application review queue

**Order** 76 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Connect the admin review queue to real applications, with the score breakdown visible.

- **Depends on:** P3-BE-07
- **Done when:** Real applications appear; approve / request-changes / reject all work; the score factor snapshot renders
- **Reference:** §23

### ⏸ `P3-BE-02` · Athlete scope function + matrix rows

**Order** 77 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Define who can see which athletes: admins see all, athletes see themselves, guardians see their children, sponsors see only athletes on their own campaigns.

- **Depends on:** P3-BE-01, P2-SEC-01
- **Done when:** Admin sees tenant-wide; athlete sees self; guardian sees wards; property manager sees own-property; sponsor sees only ACTIVE athletes on their own campaigns
- **Reference:** Guide §04

### ⏸ `P3-BE-10` · Content Value Score v1 with factor snapshot

**Order** 78 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Calculate the athlete's score and store the full breakdown behind it, not just the number. A score without its reasoning cannot be explained to an athlete.

- **Depends on:** P0-DATA-03, P3-BE-01
- **Done when:** AthleteScore stores the score, the full factor JSON and method: "rules-v1" — a number without its factors is not acceptable
- **Reference:** §14

### ⏸ `P3-FE-01` · Wire /join to the real application API

**Order** 79 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Connect the public sign-up page to the real system, including the parent branch for minors.

- **Depends on:** P3-BE-01
- **Done when:** A real application submits, validates and persists; the guardian branch appears for minors
- **Reference:** §11

### ⏸ `P3-FE-03` · Wire the athlete profile and completion meter

**Order** 80 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Show real profile data and a completion meter that reflects what is actually filled in.

- **Depends on:** P3-BE-04
- **Done when:** Real profile data renders; the completion meter reflects actual §11 section state
- **Reference:** §24

### ⏸ `P3-FE-04` · Wire the athlete rate card view

**Order** 81 · **FE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Let an athlete see their own rates — and nobody else's.

- **Depends on:** P3-BE-09
- **Done when:** An athlete sees their own rates; no other athlete's rates are reachable
- **Reference:** §24, Guide §04

### ⏸ `P3-FE-05` · Wire the public package catalogue

**Order** 82 · **FE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Show the real packages publicly, with sponsor prices only. Athlete pay must never appear on a public page.

- **Depends on:** P3-BE-11
- **Done when:** Real packages render with sponsor prices only — athlete base pay never appears on a public surface — and each package shows the job-code line items it contains
- **Reference:** §7

### ⏸ `P3-INT-02` · Application and approval notification jobs

**Order** 83 · **INT** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Automatic emails when an application is received, needs changes, or is approved.

- **Depends on:** P3-INT-01, P3-BE-07
- **Done when:** Submission acknowledgement, changes-requested and approval emails all send as worker jobs
- **Reference:** §39

### ⏸ `P3-QA-01` · E2E: application → approval → ACTIVE

**Order** 84 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

An automated test covering the whole path from application to active athlete, including the minor/guardian branch.

- **Depends on:** P3-FE-02
- **Done when:** The full path runs green in CI, including the minor/guardian branch
- **Reference:** §30

### ⏸ `P3-SEC-01` · Minor-athlete data handling review

**Order** 85 · **SEC** · **Where:** Document + code · **1d** · **Blocked** · **Unblocks** 0

Check that the legal constraints around minors are enforced in the code, not just written in a document.

- **Depends on:** P3-BE-03 *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** Date of birth handling, guardian PII and the constraints from P0-LEG-06 are enforced in code, not just documented
- **Reference:** §4, §26

## Stage 4 · Sponsor Demand & Matching

**Objective.** a sponsor submits a brief, BTG filters eligible athletes with

**Entry gate.** Phase 3 exit met.

**Exit gate.** a brief submitted by a real sponsor produces a filtered roster, and

*16 tasks · 0 person-days*

### ⏸ `P4-BE-01` · Sponsor + sponsor contact models and scope

**Order** 86 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 46

Sponsor company and contact records, linked to their Zoho equivalents.

- **Depends on:** P2-BE-04
- **Done when:** Sponsor and contact records exist with Zoho external IDs and sync markers; sponsor scope restricts to own records
- **Reference:** §20, §18

### ⏸ `P4-BE-02` · Campaign brief contract, model and state machine

**Order** 87 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 45

The sponsor's campaign request: objective, budget, package, dates, who they want to reach — and its approval lifecycle.

- **Depends on:** P4-BE-01
- **Done when:** DRAFT→QUALIFIED→APPROVED→CAMPAIGN_CREATED→CLOSED enforced; objective, budget, package, dates, targeting and category captured
- **Reference:** §13, §21

### ⏸ `P4-BE-03` · Eligible-athletes query with conflict + category checks

**Order** 88 · **BE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 38

The matching engine. Given a brief, return only athletes who fit on sport, location and availability AND are not blocked by a competitor conflict or a personal restriction. The hardest query in Phase 1.

- **Depends on:** P4-BE-02, P3-BE-05
- **Done when:** A brief returns only athletes passing sport, geography, availability, restriction and category-conflict checks; matrix rows added
- **Reference:** §13 step 3, §26

### ⏸ `P4-BE-04` · Campaign invitation model and lifecycle

**Order** 89 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 35

Invitations to athletes and their lifecycle: sent, viewed, accepted, declined, expired.

- **Depends on:** P4-BE-03
- **Done when:** INVITED→VIEWED→ACCEPTED/DECLINED/EXPIRED enforced; every transition audited
- **Reference:** §21

### ⏸ `P4-BE-06` · Campaign model and staffing state

**Order** 90 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

The campaign record and its lifecycle. Budget must never be reachable by an athlete's account.

- **Depends on:** P4-BE-02
- **Done when:** DRAFT→STAFFING→APPROVAL→ACTIVE→REPORTING→COMPLETED/CANCELLED enforced; Campaign.budget never reachable from an athlete-scoped query
- **Reference:** §21, Guide §04

### ⏸ `P4-FE-01` · Wire the sponsor marketplace and brief submission

**Order** 91 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Let sponsors browse packages and submit a request. Phase 1 is request-and-we-call-you, not self-service checkout.

- **Depends on:** P4-BE-02
- **Done when:** A sponsor browses real packages and inventory and submits a real brief — request/reserve, not self-checkout
- **Reference:** §17, §9 screen 4

### ⏸ `P4-FE-04` · Wire the athlete invitation inbox

**Order** 92 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

The athlete's invitation inbox — opening one marks it viewed; accept and decline both work.

- **Depends on:** P4-BE-04
- **Done when:** Real invitations render in all five states; viewing transitions INVITED→VIEWED; accept and decline both work
- **Reference:** §24

### ✅ `P4-ART-01` · Design the matching and roster-review experience

**Order** 93 · **ART** · **Where:** Design tool · **3d** · **Done** · **Unblocks** 0

Design the matching screen before it is built. It is the densest screen in the product: filters, roster comparison, scores side by side.

- **Depends on:** nothing — startable now
- **Done when:** The densest admin screen in the product is designed before it is built — filters, roster comparison, score presentation
- **Reference:** §9 screen 8

### ⏸ `P4-BE-05` · Invitation expiry worker job

**Order** 94 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

A scheduled job that expires stale invitations so they cannot be accepted weeks later.

- **Depends on:** P4-BE-04, P2-BE-05
- **Done when:** Invitations past their window move to EXPIRED automatically and cannot be accepted afterwards
- **Reference:** §21

### ⏸ `P4-FE-02` · Wire the campaign builder and athlete matching UI

**Order** 95 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 0

The campaign builder: filter athletes, compare them, pick the roster.

- **Depends on:** P4-BE-03
- **Done when:** Campaign manager filters, reviews the eligible roster with score snapshots, and selects athletes
- **Reference:** §9 screen 8

### ⏸ `P4-FE-03` · Wire the invitation send flow

**Order** 96 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Send invitations from the builder and show who has responded.

- **Depends on:** P4-BE-04
- **Done when:** Invitations send from the builder; roster shows SENT / awaiting state per athlete
- **Reference:** §13 step 4

### ⏸ `P4-FE-05` · Wire the sponsor dashboard to real campaign data

**Order** 97 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Point the sponsor dashboard at real campaign data.

- **Depends on:** P4-BE-06
- **Done when:** Active campaigns, spend, package status and athlete count all come from Postgres
- **Reference:** §9 screen 3

### ⏸ `P4-INT-01` · Invitation notification jobs

**Order** 98 · **INT** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Invitation, reminder and expiry-warning emails.

- **Depends on:** P3-INT-01, P4-BE-04
- **Done when:** Invitation, reminder and expiry-warning emails all send as queued jobs
- **Reference:** §39

### ⏸ `P4-QA-01` · E2E: brief → matching → invitation → response

**Order** 99 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Automated test of the whole brief-to-response path, including declines and expiry.

- **Depends on:** P4-FE-04
- **Done when:** The full segment runs green, including decline and expiry paths
- **Reference:** §30

### ⏸ `P4-SEC-01` · Conflict and restriction enforcement test

**Order** 100 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Prove by test that a competing sponsor cannot be matched to a restricted athlete. Inspection is not enough here.

- **Depends on:** P4-BE-03
- **Done when:** A competitor-category sponsor cannot be matched to a restricted athlete — proven by test, not by inspection
- **Reference:** §26

### ⏸ `P4-SEC-02` · Field-level authz pass on sponsor surfaces

**Order** 101 · **SEC** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Re-check every sponsor-facing query lists its fields explicitly and never includes athlete pay.

- **Depends on:** P4-FE-01
- **Done when:** Every sponsor-facing query uses explicit select; AthleteRate.amount is absent from all of them
- **Reference:** Guide §04

## Stage 5 · Campaign Execution

**Objective.** an accepted invitation becomes a signed Campaign Order, which

**Entry gate.** Phase 4 exit met, and G-05 closed — counsel-approved

**Exit gate.** an athlete accepts an order, uploads creative direct to R2, and the

*17 tasks · 0 person-days*

### ⏸ `P5-BE-01` · Campaign Order acceptance with body-hash capture

**Order** 102 · **BE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 29

Accepting a campaign contract: record the exact text shown, who accepted, when and from where. An unverified guardian blocks acceptance. Do not build this until counsel has approved the template.

- **Depends on:** P3-BE-06, P4-BE-04 *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** Acceptance records agreement version, body hash, signer, timestamp, IP and user agent; an unverified guardian blocks acceptance; state must be SENT to accept
- **Reference:** §12, Guide §08

### ⏸ `P5-BE-03` · Auto-create deliverables from the job/package template

**Order** 103 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 27

Accepting a contract automatically creates the list of things the athlete owes, with due dates — in the same transaction, so one can never exist without the other.

- **Depends on:** P5-BE-01
- **Done when:** Accepting an order creates the deliverable set with due dates derived from the SX job — inside the same transaction as acceptance
- **Reference:** §13 step 7, §30

### ⏸ `P5-BE-05` · Deliverable state machine

**Order** 104 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 25

The deliverable lifecycle: not started, draft submitted, BTG review, sponsor review, approved, published, verified — with revisions sending it back.

- **Depends on:** P5-BE-03
- **Done when:** NOT_STARTED→DRAFT_SUBMITTED→BTG_REVIEW→SPONSOR_REVIEW→APPROVED→PUBLISHED→VERIFIED enforced; revision requests return to DRAFT_SUBMITTED
- **Reference:** §21

### ⏸ `P5-BE-06` · Creative asset model + direct R2 upload

**Order** 105 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

Athletes upload creative straight to Cloudflare from their phone, never through your server.

- **Depends on:** P2-BE-08, P5-BE-05
- **Done when:** The browser PUTs straight to R2 with a presigned URL; athlete video never passes through the app server
- **Reference:** Addendum A8, Guide §11

### ⏸ `P5-BE-08` · Approval chain domain functions

**Order** 106 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

The review actions: BTG reviews, sponsor optionally reviews, request revision, approve, mark published.

- **Depends on:** P5-BE-05
- **Done when:** BTG review, optional sponsor review, revision request, approve and mark-published all work and are audited
- **Reference:** §13 steps 8–9

### ⏸ `P5-BE-02` · Campaign Order model and state machine

**Order** 107 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

The campaign contract record, with commercial terms frozen at the moment it was sent rather than read live.

- **Depends on:** P4-BE-06
- **Done when:** DRAFT→SENT→ACCEPTED/REJECTED→ACTIVE→COMPLETED/CANCELLED enforced; commercial terms snapshotted at send time, not read live
- **Reference:** §21

### ⏸ `P5-FE-04` · Wire the content approval workspace

**Order** 108 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

The content approval board where BTG staff work: review drafts, request changes, route to sponsor, approve, record proof of publication.

- **Depends on:** P5-BE-08
- **Done when:** The full review board works — draft review, revision request, sponsor routing, approval, publication proof
- **Reference:** §10, §23

### ✅ `P5-ART-01` · Design the deliverable and approval states

**Order** 109 · **ART** · **Where:** Design tool · **3d** · **Done** · **Unblocks** 0

Design how each deliverable state looks to the athlete, to BTG and to the sponsor — three different audiences, same record.

- **Depends on:** nothing — startable now
- **Done when:** Every deliverable state has a designed presentation for athlete, BTG and sponsor views
- **Reference:** §21

### ⏸ `P5-BE-04` · launchCampaign transactional domain function

**Order** 110 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Going live: campaign and contracts flip to active, Zoho sync and notifications queue, audit written — all or nothing in one transaction.

- **Depends on:** P5-BE-02, P2-BE-05
- **Done when:** Campaign → ACTIVE, accepted orders → ACTIVE, zoho.pushCampaign and notify.campaignLive enqueued, audit written — all in one transaction
- **Reference:** Guide §05

### ⏸ `P5-BE-07` · Image derivative worker job

**Order** 111 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Resize uploaded images into three sizes in the background, so pages stay fast without locking you into one host's image service.

- **Depends on:** P5-BE-06
- **Done when:** derive-image.ts produces 320/640/1280 webp derivatives via sharp; the UI renders a plain <img> with srcSet — no next/image optimisation
- **Reference:** Guide §11

### ⏸ `P5-FE-01` · Wire the Campaign Order view and acceptance

**Order** 112 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

The athlete reads the real contract and accepts. The exact text on screen is what gets fingerprinted.

- **Depends on:** P5-BE-01
- **Done when:** An athlete reads the real order terms and accepts; the guardian branch renders for minors; the exact text shown is what gets hashed
- **Reference:** §24

### ⏸ `P5-FE-02` · Wire the deliverable calendar

**Order** 113 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

The athlete's calendar of what is due when.

- **Depends on:** P5-BE-03
- **Done when:** Real due dates and appearances render for the athlete
- **Reference:** §24

### ⏸ `P5-FE-03` · Build the upload and proof submission UI

**Order** 114 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Upload screen with progress, that recovers gracefully when a phone loses signal mid-upload.

- **Depends on:** P5-BE-06
- **Done when:** Direct-to-R2 upload with progress; draft submission transitions state; failures are recoverable
- **Reference:** §24

### ⏸ `P5-FE-05` · Wire the campaign operations dashboard

**Order** 115 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 0

The campaign operations board: who accepted, what is due, what is late, what is under-delivering.

- **Depends on:** P5-BE-05
- **Done when:** Per-athlete acceptance, due dates, approval state, under-delivery and issue flags all render from real data
- **Reference:** §9 screen 9

### ⏸ `P5-INT-01` · Deliverable notification jobs

**Order** 116 · **INT** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Deadline reminders, revision requests and approval emails.

- **Depends on:** P3-INT-01, P5-BE-05
- **Done when:** Deadline reminders, revision requests and approval notifications all send as queued jobs
- **Reference:** §39

### ⏸ `P5-QA-01` · E2E: acceptance → deliverable → approval → published

**Order** 117 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Automated test from contract acceptance through to published content, including the revision loop.

- **Depends on:** P5-FE-04
- **Done when:** The full segment runs green, including the revision loop
- **Reference:** §30

### ⏸ `P5-SEC-01` · Private-bucket access audit

**Order** 118 · **SEC** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Confirm every temporary link to a private file is logged, short-lived, and that no contract or draft is publicly reachable.

- **Depends on:** P5-BE-06
- **Done when:** Every signed URL grant against the private bucket is audited; TTLs are short; no agreement or creative asset is publicly reachable
- **Reference:** §26

## Stage 6 · Measurement & Reward

**Objective.** the two funnels — the only first-party data this product owns.

**Entry gate.** Phase 5 exit met, and P0-LEG-04 (privacy review of the fan reward

**Exit gate.** a fan scans a QR and four separate events are recorded; single-use

*16 tasks · 0 person-days*

### ▶ `P6-BE-02` · Reward, reward token and reward event models

**Order** 119 · **BE** · **Where:** Code · **3d** · **Ready** · **Unblocks** 14

The reward, the individual QR tokens, and the events they generate.

- **Depends on:** P2-BE-02
- **Done when:** Reward state DRAFT→ACTIVE→PAUSED→EXPIRED/ARCHIVED; four distinct RewardEventType values
- **Reference:** §16, §21

### ⏸ `P6-BE-03` · Four-event separation across the fan journey

**Order** 120 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 10

Four separate records for four separate moments: the scan, the page loading, the fan claiming, the merchant redeeming. Collapsing these into one counter destroys the funnel.

- **Depends on:** P6-BE-02
- **Done when:** SCAN on QR resolution, LANDING on page render, CLAIM on offer acceptance, REDEEM on validation — four rows, never one counter
- **Reference:** §16

### ⏸ `P6-BE-04` · Race-safe single-use redemption

**Order** 121 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 5

Make double-redemption impossible at the database level, not in application code. Two people scanning the same code at once must produce exactly one redemption.

- **Depends on:** P6-BE-03, P2-BE-03
- **Done when:** Concurrent redemption attempts on one token produce exactly one REDEEM — enforced by the partial unique index, caught as a unique violation
- **Reference:** Guide §06

### ⏸ `P6-FE-02` · Wire the fan redeem page to real tokens

**Order** 122 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 4

The fan-facing redeem page on real data, still working with JavaScript off — it is hit once, on venue wifi, on a phone.

- **Depends on:** P6-BE-04
- **Done when:** Real redemption works; the page still renders without JavaScript; invalid, expired and already-used states all render
- **Reference:** §16, Guide §06

### ⏸ `P6-BE-01` · Tracking link model and t/[code] redirect route

**Order** 123 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

Short links that redirect instantly and record the click after the visitor has already gone. The fan never waits on your database.

- **Depends on:** P5-BE-05
- **Done when:** A 302 redirect fires immediately; the LinkEvent write happens after the response — the fan never waits on our write
- **Reference:** Guide §06

### ⏸ `P6-INT-02` · Email the reward code to the fan at CLAIM

**Order** 131.5 · **INT** · **Where:** Code · **1d** · **Ready** · **Unblocks** 0

Send the fan their voucher when they claim it, so the code survives the walk away from the stall.

- **Depends on:** P3-INT-01, P6-BE-03
- **Done when:** A CLAIM enqueues one send carrying the code, offer, pickup point and expiry; the send is idempotent so a repeat claim on an existing token does not send twice
- **Reference:** §16, §39

### ⏸ `P6-SEC-01` · Fan consent capture and version tracking

**Order** 124 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

Record consent with its version at the moment a fan claims. No fan's details leave the system without it.

- **Depends on:** P6-BE-03 *(Legal dependency removed 2026-09-15 — counsel approvals no longer gate development; see the Legal sheet in the task board.)*
- **Done when:** Consent is recorded with its version at claim time; no fan PII leaves the system without it
- **Reference:** §26

### ⏸ `P6-BE-06` · QR code generation into R2

**Order** 125 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 1

Generate a QR image per athlete per campaign and store it privately.

- **Depends on:** P6-BE-02, P2-BE-08
- **Done when:** A QR PNG is generated per athlete/campaign token and stored in the private bucket
- **Reference:** §16

### ⏸ `P6-ART-01` · Produce the printable QR asset formats

**Order** 126 · **ART** · **Where:** Design tool · **1d** · **Blocked** · **Unblocks** 0

Produce QR artwork that actually scans at poster and table-tent sizes.

- **Depends on:** P6-BE-06
- **Done when:** QR assets usable at venue print sizes with adequate quiet zone and contrast
- **Reference:** §16

### ⏸ `P6-BE-05` · Geo resolution worker job

**Order** 127 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Work out roughly where a scan happened, in the background, from a local lookup file. The visitor's IP address is never stored — only city and region.

- **Depends on:** P6-BE-01, P2-BE-05
- **Done when:** resolve-geo.ts reads x-forwarded-for, resolves against local GeoLite2, writes city/region — the raw IP is never persisted, it lives only in the job payload
- **Reference:** Guide §06, §26

### ⏸ `P6-BE-07` · Unique per-athlete tracking codes

**Order** 128 · **BE** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Give each athlete on a campaign their own code so you can tell who actually drove traffic.

- **Depends on:** P6-BE-01
- **Done when:** Each athlete on a campaign gets a distinct code, so relative performance is measurable
- **Reference:** §16, §30

### ⏸ `P6-FE-01` · Wire the QR / reward creator

**Order** 129 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 0

The screen where staff create a reward: the offer, who qualifies, the consent wording, limits and expiry.

- **Depends on:** P6-BE-02
- **Done when:** Reward, eligibility, landing page, consent copy, limits and expiration are all configurable and persist
- **Reference:** §9 screen 10

### ⏸ `P6-FE-03` · Wire the analytics dashboard funnel panels

**Order** 130 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Show the scan-to-redemption funnel with real numbers.

- **Depends on:** P6-BE-03
- **Done when:** Scan → landing → claim → redemption render as a real funnel with real counts
- **Reference:** §9 screen 11

### ⏸ `P6-INT-01` · Consent-gated lead push to Zoho

**Order** 131 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Send fan leads to Zoho only where consent was given. No consent, no push — enforced in code.

- **Depends on:** P6-SEC-01, P2-BE-05
- **Done when:** Claims with consent enqueue zoho.pushLead; claims without consent never do
- **Reference:** §18
- **Moved to Phase 2 (2026-09-24, business decision)** as `2S6-INT-03`. A lead push uses a fan's address beyond voucher delivery, which needs the "sponsor may contact me about offers" consent option — itself deferred to Phase 2 as `2S6-BE-03`. Phase 1's only consent purpose, `reward-delivery`, permits no lead push, so this task cannot meet its acceptance in Phase 1.

### ⏸ `P6-QA-01` · E2E: scan → landing → claim → redeem

**Order** 132 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Automated test that a scan produces four distinct events and a second redemption is refused.

- **Depends on:** P6-FE-02
- **Done when:** All four events recorded separately; a second redeem attempt is rejected
- **Reference:** §30

### ⏸ `P6-QA-02` · Redeem page performance budget

**Order** 133 · **QA** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Test the redeem page on a throttled mobile connection. This is the one page in the product that must be fast.

- **Depends on:** P6-FE-02
- **Done when:** Verified on a throttled mobile connection: no client bundle, no render-blocking font, plain dynamic route — no ISR, no edge middleware
- **Reference:** §16, Addendum A10

### ⏸ `P6-SEC-02` · Fan PII purpose limitation

**Order** 134 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Sponsors receive only the fan fields consent allows — enforced in the database query, not by hiding it in the interface.

- **Depends on:** P6-SEC-01
- **Done when:** Sponsors receive only the fields consent permits; the restriction is enforced in select, not in the UI
- **Reference:** §26, Memory 04

### ⏸ `P6-SEC-03` · Fan unsubscribe and consent withdrawal

**Order** 134.5 · **SEC** · **Where:** Code · **1d** · **Ready** · **Unblocks** 0

Every email to a fan carries a one-tap unsubscribe link that needs no login, and a withdrawal stops any further contact.

- **Depends on:** P6-SEC-01, P3-INT-01
- **Done when:** An unsubscribe link in every fan email works without login and in one tap; withdrawal is recorded against the same consent record with a timestamp; a withdrawn fan is excluded from any further contact at query level, not in the UI *(amended 2026-09-24: the original named P6-INT-01's lead push, which moved to Phase 2 — the Phase 2 push must use the same exclusion)*
- **Reference:** §26; raised 2026-09-16 from the P1-ART-05 fan landing design

## Stage 7 · Money & Reporting

**Objective.** metrics carry provenance, earnings move through their states, and

**Entry gate.** Phase 6 exit met, and G-01 closed — the written payment

**Exit gate.** an athlete sees pending/eligible/paid status; a sponsor receives a

*20 tasks · 0 person-days*

### ⏸ `P7-DATA-01` · Metric entry with provenance labels

**Order** 135 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 11

Every performance number carries a label saying where it came from. Verified and estimated figures must never be presented as the same thing — this is the biggest credibility risk in the product.

- **Depends on:** P0-DATA-01, P5-BE-05
- **Done when:** Every metric row carries one of the five §22 source labels; verified-API, verified-manual, self-reported, estimated and attributed are never conflated
- **Reference:** §22, §26

### ⏸ `P7-DATA-02` · Metric rollup worker job

**Order** 136 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 8

A scheduled job that totals up athlete and campaign performance, in a way that can always be recomputed from the raw events.

- **Depends on:** P7-DATA-01, P2-BE-05
- **Done when:** rollup-metrics.ts aggregates athlete and campaign metrics on a schedule; aggregates are reproducible from events
- **Reference:** §22

### ⏸ `P7-BE-01` · Earnings model and state machine

**Order** 137 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 6

Track what an athlete has earned and whether it is pending, eligible, approved or paid. No tax IDs, no bank details — money moves outside the system in Phase 1.

- **Depends on:** P0-PMO-01
- **Done when:** PENDING→ELIGIBLE→APPROVED_FOR_PAYOUT→PAID/HELD/DISPUTED enforced; no tax ID field, no bank details
- **Reference:** §21, Addendum A6

### ⏸ `P7-BE-05` · Sponsor ROI report data assembly

**Order** 138 · **BE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 4

Assemble the sponsor's results report: what was promised, who delivered, what it achieved, with every number's provenance intact.

- **Depends on:** P7-DATA-02
- **Done when:** Objective, roster, delivered assets, verified/estimated metrics, QR funnel, redemption, media value and recommendations all assembled with labels intact
- **Reference:** §9 screen 12

### ⏸ `P7-BE-03` · Commission and management fee calculation

**Order** 139 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

Work out gross pay, adjustments and BTG's margin from the job's pay and price.

- **Depends on:** P7-BE-01
- **Done when:** Gross compensation, adjustments and BTG margin computed from the agreed athlete rate and the sponsor price; a line below athlete cost × 1.4 cannot exist, because `P3-BE-12` blocks it at creation
- **Reference:** §5, §10

### ⏸ `P7-FE-03` · Wire the sponsor ROI report screen

**Order** 140 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 2

The sponsor results screen, with estimated figures visibly labelled as estimates.

- **Depends on:** P7-BE-05
- **Done when:** Screen 12 renders the real report with provenance labels visible — estimated figures are never presented as verified
- **Reference:** §9 screen 12, §22

### ⏸ `P7-DATA-05` · Network and marketplace-learning metrics

**Order** 141 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Network-level numbers: active athletes, participation, total earnings, average job pay, margin by package.

- **Depends on:** P7-DATA-02
- **Done when:** Active athletes, participation rate, total earnings, average job pay, utilisation, average sell price by job and margin by package are all queryable
- **Reference:** §22

### ⏸ `P7-BE-02` · Earnings eligibility from deliverable completion

**Order** 142 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Verifying the last of an order's deliverables makes the athlete's earning eligible, automatically and audited.

- **Depends on:** P7-BE-01, P5-BE-08
- **Done when:** Verifying the **last** of an order's deliverables — each one created from the order's NIL job when the athlete accepts, so every deliverable is tied to the task originally set — makes that order's earning ELIGIBLE, in full; the transition is audited. *(Wording amended 2026-09-24 by business decision: one earning per order, released when all its deliverables are verified. Per-deliverable release is not Phase 1.)*
- **Reference:** §13 step 11

### ▶ `P7-BE-04` · Invoice / payment reference ingestion from Zoho

**Order** 143 · **BE** · **Where:** Code · **3d** · **Ready** · **Unblocks** 0

Pull invoice and payment status in from Zoho. SponsorX never becomes the invoicing system.

- **Depends on:** P2-BE-05
- **Done when:** Invoice and payment status flow Zoho → SponsorX and attach to the campaign; SponsorX never becomes the invoice system of record
- **Reference:** §18

### ✕ `P7-BE-06` · Report render worker job — **MOVED TO PHASE 2 as `2S7-BE-02`**

**Order** 144 · **BE** · **Where:** Code · **3d** · **Dropped** · **Unblocks** 0

> **Moved 2026-09-24 (user decision).** By its own acceptance this is not
> required in Phase 1: G-07 (`P0-PMO-05`) chose a print stylesheet, which the
> browser PDF (`frontend/src/lib/report-pdf.ts`) delivers. The unattended,
> server-rendered file lives on as Phase 2 `2S7-BE-02`.

Render the sponsor report as a PDF in the background — only if the earlier decision says a PDF is actually needed.

- **Depends on:** P7-BE-05, P0-PMO-05
- **Done when:** If G-07 requires a PDF, Playwright renders it on the worker and stores it in the private bucket. If not, this task is closed as not-required
- **Reference:** Addendum A10, Guide §10
- **Parked (2026-09-24, business decision):** retained, not dropped. The sponsor report's PDF is currently produced in the browser by the frontend (`frontend/src/lib/report-pdf.ts`), shown as a demo; the worker job stays on the plan and is picked up only if a server-rendered file becomes a requirement. G-07's confirmation is still open.

### ⏸ `P7-DATA-03` · Implied CPM calculation

**Order** 145 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Calculate an implied cost-per-thousand even for fixed-price jobs, so you learn what your inventory is really worth.

- **Depends on:** P7-DATA-01
- **Done when:** Both list price and implied CPM are stored whenever impressions are projected — fixed-price jobs still compute it for learning
- **Reference:** §15

### ⏸ `P7-DATA-04` · Campaign delivered-vs-planned tracking

**Order** 146 · **DATA** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Detect when a campaign is delivering less than promised, and surface it before the sponsor notices.

- **Depends on:** P7-DATA-01
- **Done when:** Under-delivery is detectable and surfaces on the operations dashboard
- **Reference:** §22, §9 screen 9

### ⏸ `P7-FE-01` · Wire the athlete earnings view

**Order** 147 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

The athlete's earnings view. No tax ID or bank field appears anywhere on it.

- **Depends on:** P7-BE-01
- **Done when:** Pending / eligible / approved / paid statuses render; no tax ID or bank field appears anywhere
- **Reference:** §24, §30

### ⏸ `P7-FE-02` · Wire the finance workspace

**Order** 148 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 0

The finance workspace: earnings states, commission, Zoho invoice references, reconciliation.

- **Depends on:** P7-BE-03
- **Done when:** Earnings states, commission calculation, Zoho invoice references and reconciliation view all render from real data
- **Reference:** §10, §23

### ⏸ `P7-FE-04` · Wire the analytics and athlete performance dashboard

**Order** 149 · **FE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 0

The performance dashboard: per-athlete views, engagement, clicks, claims, redemptions, reliability.

- **Depends on:** P7-DATA-02
- **Done when:** Per-athlete views, engagement, clicks, claims, redemptions, reliability and revision rate all render from real aggregates
- **Reference:** §9 screen 11

### ⏸ `P7-FE-05` · Wire the admin network analytics view

**Order** 150 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

The network-level analytics view for BTG.

- **Depends on:** P7-DATA-05
- **Done when:** Network-level and marketplace-learning metrics render
- **Reference:** §22, §23

### ⏸ `P7-QA-01` · E2E: deliverable → earnings → sponsor report

**Order** 151 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Automated test of the final stretch: deliverable through earnings to the sponsor report.

- **Depends on:** P7-FE-03
- **Done when:** The final loop segment runs green end to end
- **Reference:** §30

### ⏸ `P7-QA-02` · Metric provenance honesty review

**Order** 152 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Trace every number on every dashboard back to where it actually comes from. Anything hand-picked gets labelled as such.

- **Depends on:** P7-FE-03
- **Done when:** Every number on every dashboard is traced to its retrieval path; anything curated carries an EST · curated label
- **Reference:** §22, Memory rule

### ⏸ `P7-SEC-01` · Financial audit coverage

**Order** 153 · **SEC** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Confirm every pricing, earnings and payout change is recorded in the audit log.

- **Depends on:** P7-BE-03
- **Done when:** Every pricing, earnings and payout-status change writes an audit entry
- **Reference:** §26

### ⏸ `P7-SEC-02` · Payment-policy compliance check

**Order** 154 · **SEC** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Search the whole codebase to confirm no tax ID, bank or card field exists anywhere.

- **Depends on:** P7-BE-01
- **Done when:** A codebase-wide check confirms no tax ID, bank credential or card data field exists in any model
- **Reference:** §26, Addendum A6

## Stage 8 · Integration, Hardening & Launch

**Objective.** close the loop with Zoho, harden what exists, and get through UAT

**Entry gate.** Phase 7 exit met.

**Exit gate.** the §39 loop runs end-to-end on real data with Zoho in sync; the

*24 tasks · 0 person-days*

### ▶ `P8-INT-01` · Zoho outbound push jobs for all four bi-directional objects

**Order** 155 · **INT** · **Where:** Code · **5d** · **Ready** · **Unblocks** 8

Push accounts, contacts, deals and tasks to Zoho from the background worker, using a shared ID so records never duplicate.

- **Depends on:** P0-PMO-08, P2-BE-05
- **Done when:** Accounts, Contacts, Deals and Tasks push from the worker with `SponsorX_ID` as the dedupe key (`duplicate_check_fields=SponsorX_ID`; field-mapping §5.1, confirmed on the live org 2026-09-24)
- **Reference:** §18

### ⏸ `P8-INT-03` · Inbound Zoho webhook route with signature verification

**Order** 156 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 3

Receive Zoho's updates, verify they are genuine, write them to your own database and queue the follow-up. This route never calls Zoho back.

- **Depends on:** P8-INT-01
- **Done when:** The route verifies the signature, writes to our own database and enqueues — it never calls Zoho
- **Reference:** Guide §07

### ⏸ `P8-QA-01` · Full §30 acceptance criteria pass

**Order** 157 · **QA** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 3

Demonstrate all fourteen acceptance criteria from the blueprint and record the evidence.

- **Depends on:** all phases
- **Done when:** All fourteen §30 criteria demonstrated and recorded
- **Reference:** §30

### ⏸ `P8-INT-04` · Webhook delivery recording

**Order** 158 · **INT** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 2

Log every incoming Zoho message, valid or not, so sync problems can be diagnosed.

- **Depends on:** P8-INT-03
- **Done when:** Every inbound attempt is recorded as RECEIVED / REJECTED / APPLIED, valid or not
- **Reference:** §20

### ⏸ `P8-FE-01` · Wire the integration health view

**Order** 159 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Show sync status, failed deliveries and queue health in the admin portal.

- **Depends on:** P8-INT-04
- **Done when:** Sync state, failed deliveries and queue health render in the admin portal
- **Reference:** §23

### ⏸ `P8-INT-02` · Loop prevention via origin + hash

**Order** 160 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Stop the loop where your write triggers Zoho's webhook which triggers your write again. Two fields prevent it: who wrote last, and a fingerprint of what was written.

- **Depends on:** P8-INT-01
- **Done when:** A write that originated in Zoho and whose hash is unchanged is dropped as an echo — the ping-pong loop cannot start
- **Reference:** Guide §07

### ⏸ `P8-OPS-01` · Production readiness review

**Order** 161 · **OPS** · **Where:** Vendor console · **3d** · **Blocked** · **Unblocks** 1

Actually restore a backup. Actually trigger an alert. Actually roll back once. Untested recovery is not recovery.

- **Depends on:** P2-OPS-11
- **Done when:** Backups verified by an actual restore; monitoring alerts tested; rollback procedure exercised once
- **Reference:** §38

### ⏸ `P8-QA-02` · Write and run UAT scripts (§38 deliverable)

**Order** 162 · **QA** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 1

Write and run user acceptance scripts for athlete, sponsor, admin and fan, with real pilot users on staging.

- **Depends on:** P8-QA-01
- **Done when:** Scripts exist for athlete, sponsor, admin and fan journeys; run with real pilot users on staging
- **Reference:** §29 Sprint 7, §38

### ⏸ `P8-SEC-01` · Complete the authorisation matrix

**Order** 163 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Add permission test rows for every resource built across the whole project, and make the suite a required check.

- **Depends on:** all phase BE tasks
- **Done when:** Every resource added across Phases 3–7 has its rows; the suite is a required CI check
- **Reference:** §30, Guide §09

### ⏸ `P8-DATA-01` · Seed the staging pilot cohort

**Order** 164 · **DATA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Load a 25-athlete pilot cohort and first sponsors into staging so user testing is realistic.

- **Depends on:** P3-DATA-01
- **Done when:** A representative, **simulated** 25-athlete cohort and first sponsors exist in staging for UAT; the real cohort replaces it at launch through the same `cohort:import` path
- **Amended 2026-09-24:** was "the real first-25". User decision: with a two-person team, whatever can be simulated is simulated. The simulated file is `backend/scripts/pilot-cohort-simulated.csv` (`@example.com` addresses, 555 numbers, fictional schools); the sponsors are fictional businesses in the Zoho sandbox, brought in by the backfill
- **Reference:** §36

### ▶ `P8-FE-02` · Wire the audit log view

**Order** 165 · **FE** · **Where:** Code · **3d** · **Ready** · **Unblocks** 0

Make the audit log browsable and filterable by record and by person.

- **Depends on:** P2-BE-06
- **Done when:** Critical mutation history is browsable and filterable by entity and actor
- **Reference:** §23, §30

### ⏸ `P8-INT-05` · Zoho reconciliation job

**Order** 166 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

A scheduled job that compares both systems and reports differences instead of letting them drift silently.

- **Depends on:** P8-INT-02
- **Done when:** A scheduled job detects and reports drift between the two systems rather than silently diverging
- **Reference:** §18

### ⏸ `P8-INT-06` · Lead and renewal push

**Order** 167 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

New enquiries become Zoho leads; finished campaigns become renewal opportunities.

- **Depends on:** P8-INT-01
- **Done when:** Inquiries create Zoho Leads; campaign closure creates a renewal Deal
- **Reference:** §18, §13 step 12

### ⏸ `P8-INT-07` · Zoho backfill importer job

**Order** 168 · **INT** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Import existing Zoho records as a repeatable job. You will run it more than once.

- **Depends on:** P8-INT-01
- **Done when:** Existing Zoho records import as a job, run against staging first, and the job is kept — it will run more than once
- **Reference:** Guide §10

### ⏸ `P8-OPS-02` · Load-test the fan QR surface

**Order** 169 · **OPS** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Load-test the fan redeem page. If it struggles, that is the signal to reconsider the hosting choice for that one page.

- **Depends on:** P6-FE-02
- **Done when:** Burst traffic on the redeem page is characterised; the Cloudflare Workers revisit trigger is either fired or explicitly deferred with data
- **Reference:** Addendum A10

### ⏸ `P8-PMO-01` · Produce the OpenAPI specification (§38 deliverable)

**Order** 170 · **PMO** · **Where:** Code · **1d** · **Blocked** · **Unblocks** 0

Publish the generated API specification covering every endpoint.

- **Depends on:** P2-BE-07
- **Done when:** openapi.json is complete, generated from Zod contracts, and covers every /api/v1 endpoint
- **Reference:** §38, Addendum A2

### ⏸ `P8-PMO-02` · Write the admin user guide (§38 deliverable)

**Order** 171 · **PMO** · **Where:** Document · **3d** · **Blocked** · **Unblocks** 0

Write the guide BTG staff use to run the admin workspaces day to day.

- **Depends on:** P8-FE-01
- **Done when:** BTG staff can operate every admin workspace from the guide alone
- **Reference:** §38

### ▶ `P8-PMO-03` · Write the Phase 2–4 module interface and migration plan (§38)

**Order** 172 · **PMO** · **Where:** Document · **3d** · **Ready** · **Unblocks** 0

Document the seams Phase 2 will extend — listings, carts, payments, payouts, wallet — so it is an extension, not a rewrite.

- **Depends on:** nothing — startable now
- **Done when:** The seams Phase 2 will extend are documented — listings, carts, payments, payouts, Wallet
- **Reference:** §32, §38

### ▶ `P8-PMO-04` · Write the INFINEX API and event specification (§38)

**Order** 173 · **PMO** · **Where:** Document · **3d** · **Ready** · **Unblocks** 0

Document the Phase 4 virtual-inventory data contract now, so campaigns and inventory never need redesigning for it.

- **Depends on:** nothing — startable now
- **Done when:** The Phase 4 data contract is anticipated so campaigns and inventory need no redesign
- **Reference:** §25, §38

### ⏸ `P8-PMO-05` · Developer handoff documentation (§38 deliverable)

**Order** 174 · **PMO** · **Where:** Document · **3d** · **Blocked** · **Unblocks** 0

Write what a brand-new developer needs to run the project locally and ship their first change.

- **Depends on:** all phases
- **Done when:** A developer who has never seen the project can run it locally and ship a change
- **Reference:** §38

### ⏸ `P8-PMO-06` · Production go/no-go review

**Order** 175 · **PMO** · **Where:** Document · **1d** · **Blocked** · **Unblocks** 0

The formal sign-off that the pre-pilot and pre-sponsor-pilot conditions are met and you are going live.

- **Depends on:** P8-QA-02, P8-OPS-01
- **Done when:** §37's pre-pilot and pre-sponsor-pilot gates formally signed off
- **Reference:** §37

### ⏸ `P8-QA-03` · Regression suite consolidation

**Order** 176 · **QA** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Gather every end-to-end test from across the project into one suite that runs in CI.

- **Depends on:** P8-QA-01
- **Done when:** Every E2E test from Phases 3–7 runs green in one suite in CI
- **Reference:** §38

### ⏸ `P8-SEC-02` · Cross-tenant isolation test pass

**Order** 177 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Prove by test that no query anywhere can reach another tenant's data.

- **Depends on:** P8-SEC-01
- **Done when:** No query in the codebase can reach another tenant's data — proven by test
- **Reference:** §26, §30

### ⏸ `P8-SEC-03` · Penetration review of the public surfaces

**Order** 178 · **SEC** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 0

Review the public-facing pages for injection, enumeration and rate-limit weaknesses.

- **Depends on:** P6-FE-02
- **Done when:** Redeem page, tracking redirect, join form and public profiles reviewed for injection, enumeration and rate-limit exposure
- **Reference:** §26

## Stage 9 · SponsorX NEXT

Specified in [`SponsorX-NEXT-Integration-Spec.md`](SponsorX-NEXT-Integration-Spec.md) (`P0-PMO-14`). **Gated, not queued.** Roughly 70% of NEXT already exists in the Phase 1 models under different nouns; what is genuinely absent is seven models and two roles, and those are earned by B8 closing the §39 loop and by an edition having actually sold — not by a specification. Stage 0 below ships the first edition with zero new models.

The UI scaffold is **not** here. It sits in Stage 1 with the rest of the fixture work, because a disabled button costs no schema and is reversible.

The legal questions — money to minors, the Sales Challenge as a contest — are tracked on the Legal sheet and gate no build row here.

### ▶ `P9-PMO-01` · Confirm the NEXT rate card and revenue split

**Order** 179 · **PMO** · **Where:** Document · **2d** · **Ready** · **Unblocks** 2

DECISION GATE · The 35/25/25/15 split and the slot prices are the source document's illustration, explicitly adjustable. Needs a commercial decision of the kind P0-PMO-13 was for NIL pricing.

- **Depends on:** nothing — startable now
- **Done when:** Slot prices and the four-way split signed off as numbers, not ranges; the back cover and presenting sponsor recorded as quantity one
- **Reference:** Spec §5.2, §5.3, §12

### ▶ `P9-PMO-02` · School partnership agreement and programme terms

**Order** 180 · **PMO** · **Where:** Document · **3d** · **Ready** · **Unblocks** 1

What a school signs to run an edition: who owns the masthead, who holds editorial approval, what happens to unsold inventory, and how student work is licensed.

- **Depends on:** nothing — startable now
- **Done when:** A school can sign one document and start; editorial approval authority named explicitly
- **Reference:** Spec §7, §12

### ⏸ `P9-BE-01` · Seed the NEXT ad and bundle packages

**Order** 181 · **BE** · **Where:** Code · **2d** · **Blocked** · **Unblocks** 1

The $1,500 Local Business Package as an ordinary SponsorPackage. Its social posts are STUDENT-created, so `lineItems` is EMPTY and every element sits in `includes` — the field P0-PMO-13 §5 defines as non-NIL inventory sold alongside the jobs. No schema change, and no NIL job anywhere in it.

- **Depends on:** P3-BE-11, P9-PMO-01
- **Done when:** NEXT-LOCAL-1500 and the ad-only slots exist as SponsorPackage rows with empty lineItems, flow through the marketplace and the Zoho Deal sync, and are never evaluated by the margin floor because they carry no athlete cost
- **Reference:** Spec §4

### ⏸ `P9-OPS-01` · Onboard the pilot school as a Property

**Order** 182 · **OPS** · **Where:** Code + console · **1d** · **Blocked** · **Unblocks** 1

A participating school is a Property with kind = SCHOOL. No new model — this is a seed and a Zoho Account.

- **Depends on:** P9-PMO-02
- **Done when:** The pilot school exists as a Property, its advisor has a login, and it appears in the property portal
- **Reference:** Spec §3

### ⏸ `P9-DATA-01` · Run edition one on existing primitives

**Order** 183 · **DATA** · **Where:** Document + code · **5d** · **Blocked** · **Unblocks** 1

STAGE 0 EXIT · Sell and ship the first edition with zero new models: inventory watched by a person, splits on a spreadsheet, student codes approximated by TrackingLink. What this proves is commercial, and all of it can fail — which is the argument for finding out before cutting nine models into the schema.

- **Depends on:** P9-BE-01, P9-OPS-01
- **Done when:** One edition sold and published as a FREE digital edition (V3 principle 10 — print is an optional layer, never the foundation); at least 20 local advertisers bought, which is the pilot's one real measurement; a student sold at least one slot; the school signed
- **Reference:** Spec §10

### ⏸ `P9-PMO-03` · NEXT Stage 1 entry gate

**Order** 184 · **PMO** · **Where:** Document · **1d** · **Blocked** · **Unblocks** 2

DECISION GATE · Stage 1 cuts nine models and two roles into the schema. It is earned by B8 closing the §39 loop and by an edition having actually sold — not by a specification. The legal questions (money to minors, the Sales Challenge as a contest) are tracked on the Legal sheet and do not gate this row.

- **Depends on:** P8-PMO-06, P9-DATA-01
- **Done when:** Both gates evidenced in writing: the §39 loop runs end to end, and edition one sold
- **Reference:** Spec §10, §11, §37
- **2026-09-25:** the programme owner lifted this gate **for the build** — all NEXT backend work proceeds now. This row stays open as the record that edition one has not yet sold (`P9-DATA-01`).

### ⏸ `P9-BE-02` · Publication and Edition models with the edition state machine

**Order** 185 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

The masthead per school or region, and its Fall/Winter/Spring/Year-End editions carrying closeDate, printDate and pageCount. PLANNING → SELLING → CLOSED → IN_PRODUCTION → PRINTED → DISTRIBUTED.

- **Depends on:** P9-PMO-03
- **Done when:** Publication belongs to a Property or to none for a regional edition; the state machine is enforced in the domain layer and refuses a sale after closeDate
- **Reference:** Spec §5.2

### ⏸ `P9-BE-03` · AdSlot inventory ledger with scarcity and close-date enforcement

**Order** 186 · **BE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 3

One row per sellable position per edition — price in integer cents, quantity, and a nullable campaignId once sold. It points at the Campaign, not a CampaignOrder, because an order requires an athlete and a job and an ad slot has neither.

- **Depends on:** P9-BE-02
- **Done when:** The back cover sells exactly once, enforced by the database and not by a query; a slot cannot be sold after the edition's closeDate; the includes entry from P9-BE-01 becomes enforceable
- **Reference:** Spec §4, §5.2

### ⏸ `P9-BE-04` · Student model, state machine and advisor review

**Order** 187 · **BE** · **Where:** Code · **5d** · **Blocked** · **Unblocks** 4

A student is not an athlete — no sport, no tier, no rate card, and compensation that is deliberately not cash. Carries an optional athleteId because a correspondent is both. Reuses Guardian unchanged, since nearly every student is a minor.

- **Depends on:** P9-PMO-03
- **Done when:** StudentState mirrors AthleteState and is advisor-reviewed; a minor student requires a verified Guardian on the same rule as an athlete; no nullable half of Athlete anywhere
- **Reference:** Spec §5.1

### ⏸ `P9-BE-05` · STUDENT and ADVISOR roles in the authorisation matrix

**Order** 188 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

Two roles, not one reused. PROPERTY_MGR scopes to a property's inventory and analytics; an advisor's permissions are editorial and custodial over minors. Update the RBAC matrix document first — authz-policy.ts is a transcription of it.

- **Depends on:** P9-BE-04
- **Done when:** Both roles in the matrix document and authz-policy.ts; AthleteRate.amount invisible to STUDENT as firmly as to a sponsor; the catalogued-resource assertion and the money-boundary tests updated rather than deleted
- **Reference:** Spec §7, §26 · [RBAC Matrix §15](SponsorX-RBAC-Matrix.md) — the cell-by-cell policy, written 2026-09-22 and marked provisional until this task transcribes it
- **Watch for:** `User` has no `studentId`; without it every student-scoped row matches nothing and the portal renders empty rather than failing

### ⏸ `P9-BE-06` · RevenueSplit on the edition, Earning untouched

**Order** 189 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Four payees per edition with a basis-points share and a computed amount in cents. Earning stays one order → one athlete → one gross: making it polymorphic would put schools and minors' scholarship pools into the table finance reconciles athlete payouts from.

- **Depends on:** P9-BE-02, P9-PMO-01
- **Done when:** A split resolves to four payees without a single write to Earning; athlete NIL work inside a NEXT campaign is still an ordinary Earning
- **Reference:** Spec §5.3

### ⏸ `P9-BE-07` · StudentCode, SaleAttribution and the /s/[code] resolver

**Order** 190 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 2

A third attribution namespace. TrackingLink measures an athlete's deliverable, RewardToken a fan's journey, StudentCode a student's sales across many campaigns. TrackingLink.deliverableId is unique and non-null by design; relaxing it would repeat the exact bug the schema already carries a scar from.

- **Depends on:** P9-BE-04
- **Done when:** A student's code attributes a sale at /s/[code]; the code belongs to a person across many sales; no TrackingLink or RewardToken column is relaxed to fit
- **Reference:** Spec §6

### ✖ `P9-BE-08` · ~~Evaluate the margin floor per NIL line~~ — **VOID, do not build**

**Order** 191 · **BE** · **Where:** Code · **0d** · **Dropped**

VOID 2026-09-22. Raised against version 1.0 of the spec, which read the $1,500 package as containing four SX-02 NIL jobs. It does not — the social posts are student-created, so a NEXT package has no NIL line items, no CampaignOrder and therefore no athlete cost for a margin floor to clear. **`P3-BE-12` is correct as built and must not be touched.** The ID is kept rather than reused so nothing dangles.

- **Depends on:** —
- **Done when:** Nothing. Do not build this.
- **Reference:** Spec v2.0 §0, §13

### ⏸ `P9-BE-09` · Settle the ad-only sale: no CampaignOrder, and the campaign state

**Order** 192 · **BE** · **Where:** Code · **3d** · **Blocked**

SETTLED 2026-09-22 — build it. A NEXT sale IS an ordinary Campaign: V3 defines a SponsorX Campaign as a paid package with defined placements, content, distribution and measurable deliverables, which is Campaign + Deliverable + MetricDaily + a SalesAttribution row, and it gets a Zoho Deal like any other. It carries NO CampaignOrder, because an order requires an athlete and a job. A campaign with zero orders must therefore skip STAFFING — there is nobody to staff.

- **Depends on:** P9-BE-03
- **Done when:** The decision is written down and implemented; an ad-only sale reaches a terminal state without a fake athlete or a fake job anywhere in the record
- **Reference:** Spec §5.2, §12

### ⏸ `P9-FE-01` · Wire the student portal to real assignments, sales and codes

**Order** 203 · **FE** · **Where:** Code · **3d** · **Blocked**

Substitution behind a finished screen: fixtures out, API in, disabled controls become live.

- **Depends on:** P9-BE-04, P9-BE-07, P1-FE-19
- **Done when:** Assignments, sales and codes come from the API; no fixture import remains in the student routes
- **Reference:** Spec §8

### ⏸ `P9-FE-02` · Wire the advisor desk to student applications and content

**Order** 204 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-05, P1-FE-20
- **Done when:** An advisor reviews and approves real records, scoped to one school and refused for any other
- **Reference:** Spec §7, §8

### ⏸ `P9-FE-03` · Wire the edition page map to the AdSlot ledger

**Order** 205 · **FE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

- **Depends on:** P9-BE-03, P1-FE-21
- **Done when:** The map reflects real slot state; the back cover cannot be added to a second campaign from the UI
- **Reference:** Spec §5.2, §9.3

### ⏸ `P9-FE-04` · Wire the ad slot inventory ledger

**Order** 206 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-03, P1-FE-22
- **Done when:** Every slot's state and buyer come from the ledger
- **Reference:** Spec §8

### ⏸ `P9-FE-05` · Wire the revenue splits screen

**Order** 207 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-06, P1-FE-23
- **Done when:** A real split resolves to four payees on screen with no read of Earning
- **Reference:** Spec §5.3

### ⏸ `P9-FE-06` · Wire the student application wizard to the real API

**Order** 208 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-04, P1-FE-25
- **Done when:** A real student application is created and reaches the advisor desk; a minor's guardian is captured on the existing rule
- **Reference:** Spec §5.1, §8

### ⏸ `P9-SEC-01` · Minor-student data handling and field-level authz

**Order** 209 · **SEC** · **Where:** Code · **3d** · **Blocked**

Nearly every student is a minor, and the student pool is money-adjacent. Field-level authz is the real leak, and a STUDENT must never reach an athlete rate or another student's sales.

- **Depends on:** P9-BE-05
- **Done when:** Cross-student and cross-school isolation tested; AthleteRate.amount denied to STUDENT and ADVISOR; no fan or student PII beyond what the programme needs
- **Reference:** Spec §7, §26, §37

### ⏸ `P9-QA-01` · E2E: edition sells once, a student code attributes the sale

**Order** 210 · **QA** · **Where:** Code · **3d** · **Blocked**

The Stage 1 exit, run as a test rather than asserted in a document.

- **Depends on:** P9-FE-03, P9-BE-07
- **Done when:** A school is a Property, an edition sells a back cover exactly once, a student's code attributes a sale, artwork clears the approval board with a ContentRight covering its use, QR_SCAN and LINK_CLICK report separately, and a split resolves to four payees without touching Earning
- **Reference:** Spec §11

### ⏸ `P9-BE-10` · ContentRight — one rights ledger, three population paths

**Order** 193 · **BE** · **Where:** Code · **4d** · **Blocked**

The publication gate asks one question — *may we publish this asset, in this format, on this date?* — and it must answer it in ONE query. Student consent, athlete/guardian consent and a negotiated BTG licence populate the same table via `grantorKind`; three separate rights systems would mean the gate reconciles three shapes of answer per asset and that is exactly where uncleared material slips through. BTG content defaults `mayReuseCommercially = false`: editorial use is not a licence to resell journalism inside a sponsor's campaign.

- **Depends on:** P9-BE-02
- **Done when:** Every asset in an edition carries a ContentRight covering the intended use; print and digital are separate permissions so a digital-first edition clears while print is outstanding; a BTG asset cannot enter a sponsor campaign without an explicit commercial grant
- **Reference:** Spec v2.0 §5.3, §6.1

### ⏸ `P9-BE-11` · FEATURED athletes, three-part consent and the claim flow

**Order** 194 · **BE** · **Where:** Code · **4d** · **Blocked**

The correction that makes NEXT safe: being featured is not being represented. `AthleteState` gains FEATURED — created by editorial, never applied for, read-only, invisible to matching, holds no rates. Claiming requires three assertions: athlete initiates, school roster plus advisor verifies, guardian authorises. **`AgreementAcceptance` must gain typed subjects with a nullable `userId` first** — today a featured athlete has no login and a guardian has no account, so there is nowhere to record feature consent at all. `Agreement.kind` extends by FEATURE, PROFILE and COMMERCIAL as data.

- **Depends on:** P9-BE-04, P0-LEG-01
- **Blocked also by:** the school roster, which does not exist — `Athlete.school` is free text (Spec §14 gate 1)
- **2026-09-25:** built against a **simulated** roster (`RosterEntry`, names and graduation years only; seeded for the pilot school). The real roster — who supplies it, and a school sharing a list of minors — stays open as Spec §14 gate 1; P0-LEG-01 is tracked on the Legal sheet and does not gate the build.
- **Done when:** A featured athlete has a public profile and can receive no invitation; consent is recorded for a subject with no login; commercial activation is impossible without guardian authorisation; GPA is absent unless separately decided
- **Reference:** Spec v2.0 §5.4, §6.2

### ⏸ `P9-BE-12` · EditionEvent — QR_SCAN and LINK_CLICK kept apart

**Order** 195 · **BE** · **Where:** Code · **2d** · **Blocked**

V1 is digital-first, and a QR is a print affordance — in a digital edition nobody scans, they tap. Pooling the two makes the first sponsor report say something untrue. A new stream, NOT an extension of `RewardEventType`: a fan's reward journey and an article engagement are different subjects, and the schema already carries a scar from collapsing two subjects into one table. Reward tokens keep their four events unchanged.

- **Depends on:** P9-BE-02
- **Done when:** QR_SCAN, LINK_CLICK, PROFILE_VIEW, CAMPAIGN_VIEW and CTA_CLICK record as separate rows; the sponsor report shows print and digital acquisition separately; RewardEventType is untouched
- **Reference:** Spec v2.0 §6.4

### ⏸ `P9-BE-13` · Sponsor ownership, immutable attribution, and the two conflict checks

**Order** 196 · **BE** · **Where:** Code · **3d** · **Blocked**

Students own attribution, never the customer relationship. A `SalesAttribution` row is never updated and never deleted — including when the student graduates, is suspended, or the sponsor churns — because a student's portfolio depends on it. `Sponsor` gains `ownership` (SCHOOL | SPONSORX | STUDENT_ORIGINATED), `schoolPropertyId` and `assignedStudentId`, the last being current representation and not ownership. Separately, the two conflict checks are distinct workflows with distinct owners: a Content Conflict holds content for edit; a Sponsor Acceptance rejection carries a reason code, notifies the student and **costs them no sales credit**.

- **Depends on:** P9-BE-07
- **Done when:** Graduating a student changes no attribution row; reassigning an account touches only `assignedStudentId`; a rejected prospect leaves the student's standing intact and offers a redirect where a category is open
- **Reference:** Spec v2.0 §5.1, §5.6, §6.3

### ⏸ `P9-BE-14` · ContentContribution and the DMV regional pool

**Order** 197 · **BE** · **Where:** Code · **2d** · **Blocked**

Regional revenue is allocated by predefined rules, not negotiated after publication. Sales credit and content contribution are different things: the first is an ordinary SalesAttribution row, the second is units (FEATURE 5 · PHOTO_PACKAGE 3 · INTERVIEW 3 · VIDEO 5) resolved as `units ÷ total eligible units × pool`. A school contributing no selected content receives nothing from the content-based pool.

- **Depends on:** P9-BE-06, P9-BE-13
- **Done when:** A DMV edition draws from several schools and both pools resolve by formula with no manual adjudication
- **Reference:** Spec v2.0 §5.7

### Added by NEXT spec v2.0 *(2026-09-22)*

The points ledger is `DECIDED` in v2.0 §5.5 and had no row at all. The four wiring rows pair with the Stage 1 scaffold rows above.

### ⏸ `P9-BE-15` · StudentPointAccrual — the points ledger

**Order** 211 · **BE** · **Where:** Code · **3d** · **Blocked** · **Unblocks** 1

Accruals are recorded; converting them to anything is a separate, gated act. ARTICLE 50, INTERVIEW 25, APPOINTMENT 25, SALES_500 100, VIEWS_BONUS. No EarningState, no cents column, no relation to Earning — if points and money share a table, a finance reconciliation of athlete payouts starts returning minors' scholarship balances. The shape holds whichever way open gate 2 is answered; only the redemption record changes.

- **Depends on:** P9-BE-04
- **Done when:** Accruals record against a student and optionally an edition; no cents column and no Earning relation exists; redemption is absent by design and is its own gated task
- **Reference:** Spec v2.0 §5.5, §14 gate 2

### ⏸ `P9-FE-07` · Wire the digital edition reader to real editions

**Order** 212 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-02, P1-FE-27
- **Done when:** A published edition reads from the API; an unpublished one is unreachable
- **Reference:** Spec v2.0 §8

### ⏸ `P9-FE-08` · Wire Claim this profile to the claim flow

**Order** 213 · **FE** · **Where:** Code · **3d** · **Blocked**

- **Depends on:** P9-BE-11, P1-FE-28
- **Done when:** A real claim runs the three-part consent and does not grant representation; guardian authorisation gates commercial activation on the existing Guardian.verifiedAt rule
- **Reference:** Spec v2.0 §5.4

### ⏸ `P9-FE-09` · Wire the rights ledger and clearance queue

**Order** 214 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-10, P1-FE-29
- **Done when:** The queue reflects real ContentRight records; publication is refused for an uncleared item
- **Reference:** Spec v2.0 §5.3

### ⏸ `P9-FE-10` · Wire the points balance to real accruals

**Order** 215 · **FE** · **Where:** Code · **2d** · **Blocked**

- **Depends on:** P9-BE-15, P1-FE-30
- **Done when:** Balances come from StudentPointAccrual; no read touches Earning
- **Reference:** Spec v2.0 §5.5

---

*Plan of record for Phase 1 · Managed Marketplace. Daily tracking happens in `SponsorX-Full-Programme-Task-Board.xlsx`; published status lives in the Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/). See the workflow rule at the top of this file.*
