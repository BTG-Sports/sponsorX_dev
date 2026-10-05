# SponsorX — Phase 2 · Marketplace & Athlete Commerce

**BTG SPORTS GROUP · SPONSORX · PHASE 2 · MARKETPLACE & ATHLETE COMMERCE**

| | |
|---|---|
| **Goal** | Turn SponsorX from BTG-only operations into a multi-tenant marketplace. External athletes, teams, programs, events and media properties onboard, publish inventory, fulfil deliverables and get paid. |
| **Tasks** | 123 · 425 person-days |
| **Blueprint timeline** | 16–20 weeks |
| **Balanced budget** | $80K–$120K |
| **Depends on** | Phase 1 auth/RBAC, sponsor/property/inventory/campaign/reward models, Zoho integration, core analytics |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0, August 2026 (Spec § references) + Blueprint §32 |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md) **← you are here** | 72 | 16–20 weeks |
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

### ⏸ `2S1-BE-05` · BTG approves a new sponsor and opens the account

**Order** 12.5 · **BE** · **Where:** Code · **4d** · **Blocked**

Today a sponsor's request from the public form becomes a Zoho lead and nothing more. BTG cannot approve the sponsor in SponsorX, and nothing gives the sponsor a login, so a real sponsor could never sign in. The request should land in a BTG review queue in SponsorX, as well as going to Zoho. It records the business type as structured categories, since the clash check needs them and today they arrive only inside the message text. BTG approves or declines with a note. Approving creates the sponsor with its categories, its primary contact and a SPONSOR_ADMIN login for the request's email, in one transaction. It links to the Zoho account instead of duplicating it when sales has already converted the lead. It also emails the sponsor a sign-in link, queued through the worker. Declining emails the reason. Every decision is audited. Zoho stays off the request path. Raised 2026-09-30 from the walkthrough (step 4b).

- **Depends on:** 2S1-BE-04, P8-INT-06
- **Done when:** A sponsor's request appears in BTG's queue with its business type; approving it creates the sponsor, its contact and a login the requester can sign in with, and links the Zoho account without a duplicate; declining tells the requester why; only BTG admin and sales can decide; tenant and role tests cover it
- **Reference:** Spec §3, §12, §18; walkthrough 2026-09-30

### ⏸ `2S1-BE-06` · Organizations are approved automatically; BTG reviews afterwards

**Order** 12.6 · **BE** · **Where:** Code · **5d** · **Ready**

BTG has at most one person reviewing, so the system approves an organization itself and BTG checks it afterwards. The checklist ticks itself from what is uploaded: the documents each organization type and state requires (`missingFor`). The primary contact must also confirm their email by clicking a link. The organization's name must be unique across the whole platform: compared ignoring case, spaces, punctuation, a leading "The" and legal endings such as LLC or Inc, enforced by the database, and counting applications still in progress. When every item is ticked and the name is free, the organization is approved and its manager's login created, as a manual approval does today. Anything else goes to BTG's queue, and the applicant is told why (for example "This name is already registered; add your town or contact BTG"). For every organization added, BTG admins get an email with a link to its profile page. **Reject** on that page, with a reason that is emailed to the organization, withdraws an approved organization: its login and listing access are switched off, its listings end, and any pending payouts are held. BTG can reinstate it. Every automatic approval and every reject is audited. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-03, 2S1-BE-04
- **Done when:** An organization with every required document, a confirmed contact email and a unique name is approved without BTG; a duplicate name (after normalising) is refused, even between two applications at once; anything incomplete goes to BTG's queue with the reason shown to the applicant; BTG admins are emailed for each new organization with a link to its profile; Reject withdraws access, ends listings, holds payouts and emails the reason; tenant and role tests cover it
- **Reference:** Spec §3, §12; BTG admin review 2026-10-01

### ⏸ `2S1-BE-07` · Organizations update their documents after approval

**Order** 12.7 · **BE** · **Where:** Code · **2d** · **Ready**

An approved organization can replace an uploaded document or add a new one from its portal (for example an expired ID or a renewed registration). Each change re-runs the checklist. BTG admins are emailed with a link to the profile page, and a required document removed without a replacement flags the organization for BTG, without suspending it automatically. The previous file is kept, so the history is visible. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-02, 2S1-BE-06
- **Done when:** An approved organization can replace or add documents; each change re-runs the checklist, keeps the previous file and emails BTG admins a link; a missing required document flags the organization for BTG; only the organization's own manager can change its documents
- **Reference:** Spec §3, §12; BTG admin review 2026-10-01

### ⏸ `2S1-BE-08` · AGENCY as an organization type

**Order** 12.8 · **BE** · **Where:** Code · **2d** · **Ready**

Add **AGENCY** (an athlete management or talent agency) to the organization types, beside TEAM, SCHOOL, EVENT, MEDIA and VIRTUAL. Its documents: a business registration in every state (an agency is a business wherever it operates), the contact's identity, and proof it represents the athletes it lists (a representation agreement). Like a team, it has a roster and takes an agreed share of its athletes' sales. It works everywhere an organization type is used: onboarding, the property record, commission rules scoped by property kind, and search and filters. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-01
- **Done when:** An agency can apply, is held to its own document list, can hold a roster and an agreed share, and can be targeted by commission rules like any other organization type
- **Reference:** Spec §3, §12; BTG admin review 2026-10-01

### ⏸ `2S1-BE-09` · Adult athletes are approved automatically

**Order** 12.85 · **BE** · **Where:** Code · **4d** · **Ready**

BTG has at most one reviewer, so an adult athlete is approved by the system and checked afterwards. Approval needs four things: the application complete, with the date of birth now required, a government ID uploaded, the athlete's email confirmed by link, and no likely duplicate (the same email, or the same legal name and date of birth as an existing athlete). A likely duplicate goes to BTG's queue. "Adult" uses the age of majority of the athlete's state or country (2S1-BE-12). For every athlete approved, BTG admins are emailed a link to the New sign-ups page (2S1-FE-07), where **Reject** (reason emailed) withdraws the athlete's access, ends their listings and holds their payouts, and **Reinstate** undoes it. ID files go to the private storage bucket, uploaded directly from the browser. Only BTG admins can view them, through 5-minute links, and every view is audited. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-06, P3-BE-15
- **Done when:** An adult with a complete application, a government ID and a confirmed email who is not a likely duplicate is approved and can sign in without BTG; a likely duplicate goes to BTG's queue; BTG admins are emailed for each; Reject withdraws access, ends listings, holds payouts and emails the reason; ID files are viewable only by BTG admins through short-lived, audited links
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-10` · Minors: the guardian's page, documents and automatic approval

**Order** 12.86 · **BE** · **Where:** Code · **5d** · **Ready**

An athlete under their state's or country's age of majority names a guardian, who gets an email with a link to their own page. There the guardian enters their name, relationship and phone, uploads a government ID and proof they are the guardian (such as a birth certificate naming them, a court order or a school record), and accepts the guardian agreement. Opening the link confirms the guardian's email; the minor confirms their own email too. The minor uploads a school ID, or another ID that proves who they are, instead of a government ID. When both emails are confirmed and the guardian's and minor's documents are uploaded, both are approved automatically, and BTG admins are emailed as for adults. One guardian can be the guardian of several athletes. **Linked rejection:** rejecting a guardian rejects every athlete they are the guardian of; rejecting one athlete leaves the guardian and their other athletes alone. The guardian evidence recorded is "guardian confirmed by email, with ID and proof, at <time>". Whether that is enough under the law is an open legal question (the guardian e-signature decision), and it does not block this task: BTG gets a setting that also requires a staff confirmation for minors, so a later legal answer needs no rebuild. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-09, P3-BE-15
- **Done when:** A minor and their guardian are approved without BTG once both emails are confirmed, the guardian's ID and proof of guardianship and the minor's ID are uploaded and the guardian agreement is accepted; a guardian can have several athletes; rejecting a guardian rejects all their athletes, and rejecting an athlete does not reject the guardian; the staff-confirmation setting holds minors for BTG when switched on
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-11` · The guardian acts for the minor

**Order** 12.87 · **BE** · **Where:** Code · **5d** · **Ready**

For a minor, every agreement and every money action comes from the guardian's account: accepting offers and orders, listing items, setting up the payout account on Stripe in the guardian's name, and requesting payouts. The minor's own login can view everything and upload their content (photos, videos, deliverables); each upload emails the guardian. Every route that agrees to something or moves money refuses a minor's own login and accepts their guardian's. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-10, 2S5-BE-04
- **Done when:** For a minor, only the guardian can accept, list, set up payouts or request a payout, and the minor's login is refused for each (tested route by route); the minor can upload content and the guardian is emailed for every upload; an adult's account is unaffected
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-12` · Age of majority by state and country, and coming of age

**Order** 12.88 · **BE** · **Where:** Code · **4d** · **Ready**

The age that makes an athlete an adult is the age of majority of the state or country they live in. It comes from a table BTG can edit: most US states use 18, Alabama and Nebraska 19, and Mississippi 21; countries are added with their own age. A place not in the table counts as 18 and is flagged for BTG. The age is worked out from the date of birth, and again whenever the athlete changes state or country. **Coming of age:** when a minor reaches their place's age, they have a **90-day allowance** to become an adult account by uploading a government ID. Once they do, control moves from the guardian to the athlete and the guardian is told. Throughout those 90 days:
  - A reminder stays on the athlete's and guardian's pages until it is done.
  - **Neither the athlete nor the guardian can add items or start anything new:** no new listings, offers or orders accepted, and no new payout requests. Orders and campaigns already under way continue to the end, including their deliveries and payouts.
  - Reminder emails go to both the athlete and the guardian when the allowance starts, then 30, 14, 7 and 1 days before it ends.

If the 90 days end without it done, **both accounts are terminated**: the athlete's and the guardian's. When the guardian has other athletes still under age, only the guardian's link to this athlete ends, so their other children aren't cut off. A terminated account falls under the 30-day retention and reactivation rules (2S1-BE-13): uploading the government ID within those 30 days brings it back. Anything still under way at termination goes to BTG to settle, and money already earned stays owed to the payee. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-10
- **Done when:** Adulthood follows the athlete's state or country, from the date of birth, using the editable table; an unknown place counts as 18 and is flagged; during the 90-day allowance neither the athlete nor the guardian can add items or start a new transaction while existing orders and campaigns continue, a reminder persists on both portals, and reminder emails go out at the start and 30, 14, 7 and 1 days before the end; uploading a government ID moves control from the guardian to the athlete; if it isn't done in 90 days both accounts are terminated (only the guardian's link ends when they have other minors), under the 30-day retention and reactivation rules
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-13` · Closing an account, 30-day retention and coming back

**Order** 12.89 · **BE** · **Where:** Code · **3d** · **Ready**

Athletes, guardians and organizations can close their account. A closed or rejected account's ID and verification files are kept for **30 days**, then deleted permanently by a daily job, with the deletion audited. A person who closed their own account and comes back within those 30 days reactivates it from a reactivation page: their account and files become active again, and the automatic checks run again. A rejected account can only ask to come back, and that request goes to BTG. After 30 days, coming back means signing up again. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-09, 2S1-BE-06
- **Done when:** Closing an account keeps its files for 30 days and then deletes them permanently, with an audit record; returning within 30 days through the reactivation page restores the account and its files (self-closed) or asks BTG (rejected); after 30 days the files are gone and a new sign-up is needed
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-14` · Profile edits publish straight away; sensitive edits re-run the checks

**Order** 12.9 · **BE** · **Where:** Code · **3d** · **Ready**

Replaces the BTG review of every profile edit an approved athlete makes (P3-BE-16). With BTG down to one reviewer, edits are no longer held for approval. Ordinary edits (bio, photos, sport, position, social links and the like) publish at once. Sensitive edits publish at once too, but re-run the same automatic checks as sign-up:
- **A new legal name** needs a matching ID upload before it takes effect.
- **A new date of birth** works out adulthood again (2S1-BE-12). If that makes the athlete a minor, the guardian process starts. If it makes them an adult, the coming-of-age allowance starts.
- **A new guardian** goes through the guardian's page and documents (2S1-BE-10).

For every sensitive edit, BTG admins are emailed a link to the athlete on the New sign-ups page, with Reject and Reinstate. They are not emailed for ordinary edits. Every edit, ordinary or sensitive, stays in the athlete's audit history. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** P3-BE-16, 2S1-BE-09, 2S1-BE-10, 2S1-BE-12
- **Done when:** An approved athlete's ordinary edits publish with no BTG step; a legal-name change needs a matching ID upload, a date-of-birth change recomputes adulthood and starts the guardian or coming-of-age process when it changes, and a new guardian goes through the guardian's page; BTG admins are emailed only for sensitive edits, with a link and Reject; every edit is audited
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-15` · Changing a minor's guardian (handoff)

**Order** 12.95 · **BE** · **Where:** Code · **3d** · **Ready**

A minor's guardian can change, for example after a custody change or when the other parent takes over. **A handoff starts only with the new guardian's request:**
1. **The new guardian asks.** On a public request page they give their details and identify the athlete (the athlete's email, or a code the family shares), and complete the guardian page: government ID, proof of guardianship, and the guardian agreement.
2. **The current guardian decides.** They are emailed, and in their portal they see the request with **Hand off** and **Decline**. The current guardian cannot start a handoff without a request, and the minor cannot start one.
3. **Approval and switch.** Once the current guardian hands off and the new guardian's documents and email check out, the new guardian is approved automatically and control switches at once. Until then the current guardian keeps acting, so there is no gap. Both guardians and the athlete are emailed.
4. **What carries over:** orders and campaigns already agreed continue as agreed; money already earned is paid to the payout account it was earned under; the new guardian sets up their own Stripe payout account for anything new.
5. **A guardian with other children keeps them;** only this athlete moves.

Every request, decision and switch is audited. BTG admins are emailed with a link, with Reject available as for any guardian. **A disputed handoff is never automated.** When the current guardian declines, can't be reached, or there's a court order, the request page and the decline email point the new guardian to BTG support (2S1-BE-16), and BTG decides by hand. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-10, 2S1-BE-11
- **Done when:** A handoff can happen only after the new guardian's request and the current guardian's Hand off; the current guardian keeps control until the switch, which is atomic; agreed work and earned money stay where they were; a guardian's other children are unaffected; a declined or disputed request goes to BTG support and is never automated; every step is audited
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-16` · Contacting BTG support

**Order** 12.97 · **BE** · **Where:** Code · **2d** · **Ready**

A way to reach BTG for things that must never be automated, starting with disputed guardianship. A contact form (public, rate-limited) takes a name, an email, the topic (guardianship, account, payment, other), a message and optional attachments. Attachments go to the private storage bucket. Each message is queued through the worker, never sent on the request path, and delivered to the support mailbox (2S1-OPS-01), with the sender's message ID so a reply can continue the thread. The support email address is shown wherever a person might be stuck: the guardian request page, a declined-handoff email, a rejection email, and account pages. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-OPS-01
- **Done when:** Anyone can send BTG a message with an attachment from the contact page; it reaches the support mailbox through the queue even when the mail service is briefly down; the support address appears on the guardian request page and in decline and rejection emails; the form is rate-limited and stores attachments privately
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-OPS-01` · Set up the BTG support mailbox

**Order** 12.98 · **OPS** · **Where:** Vendor console · **1d** · **Ready**

Create the support address, for example support@sponsorx.net, and where its mail lands. **Option A, Zoho Desk (recommended):** BTG already runs on Zoho, and Desk turns each email into a tracked ticket with an owner and a status, so the one BTG reviewer sees what's waiting. **Option B:** a plain shared mailbox. Set it up in sandbox or staging first, then production. The sender domain must be verified once the transactional email provider is chosen.

- **Depends on:** none
- **Done when:** Mail to the support address lands where BTG works on it, and a test message from the staging contact form arrives
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-BE-17` · Sponsors are approved automatically

**Order** 12.99 · **BE** · **Where:** Code · **4d** · **Ready**

Changes 2S1-BE-05 so BTG reviews only the exceptions. The request form asks the sponsor for:
- **Their business type**, from the fixed list, or **Other** with a description of what the business does.
- **Proof of business: one document, required of every sponsor everywhere.** This can be a business registration, a business permit or a business license, in the business's name. The requirement is the same in every state and country.
- **A confirmed contact email**, by link.

A request is approved automatically, opening the account and login and sending the sign-in email as today, when all of these hold:
- the email is confirmed and has no SponsorX login yet;
- the proof of business is uploaded;
- no other sponsor has the same name, using the same normalised name rule as organizations (2S1-BE-06);
- the business type isn't restricted;
- an Other description passes the restricted-words check (2S1-BE-18).

These go to BTG's review instead, each showing why:
- **Restricted business types:** alcohol, tobacco and vaping, gambling, cannabis, firearms, adult, political and crypto.
- **An Other description that matches** the restricted-words list.
- **A name match**, because only a person can tell the same company from a different one.

For every new sponsor, BTG admins and sales are emailed a link to the New sign-ups page, with Reject (login off, reason emailed). The Zoho lead and account push are unchanged. The proof of business is kept in the private bucket under the same 5-minute audited viewing and 30-day retention rules. Raised 2026-10-01 from the BTG admin review.

- **Depends on:** 2S1-BE-05, 2S1-BE-06, 2S1-BE-18
- **Done when:** A sponsor with a confirmed email, a proof of business, a unique name and an unrestricted business type is approved and can sign in without BTG; a restricted type, a flagged Other description or a name match goes to BTG's review with the reason; every sponsor must upload proof of business, with the same rule everywhere; BTG and sales are emailed for each new sponsor; Reject switches the login off and emails the reason
- **Reference:** Spec §3, §12, §26; BTG admin review 2026-10-01

### ⏸ `2S1-BE-18` · The restricted-words check

**Order** 12.995 · **BE** · **Where:** Code · **3d** · **Ready**

A server-side list of restricted words and phrases, grouped by kind: sexual or adult, drugs, weapons, gambling, violence or hate, and other illegal or harmful activity. BTG admins can view and edit the list from the admin portal; it is seeded with a starter list. A check function tests any free text against it:
- **It is hard to get around.** It ignores case and accents, sees through spacing and common letter swaps ("s3x", "d r u g s", "c0caine"), and matches words, so "Essex" or "Sussex" doesn't trip "sex".
- **A match never rejects anything on its own.** It marks the text as restricted, with the words and kind that matched, and sends the item to BTG's review.
- **It is used first** for a sponsor's Other business description (2S1-BE-17). It is built to be reused on other free text later, such as listing titles and descriptions or athlete bios.
- **Every change to the list is audited,** and the check is unit-tested against a set of tricky spellings and innocent words.

Raised 2026-10-01 from the BTG admin review.

- **Depends on:** none
- **Done when:** Free text containing a listed word, including disguised spellings, is marked restricted with what matched; innocent words that merely contain a listed word are not; BTG admins can edit the list and every change is audited; a match routes the item to BTG's review and never rejects it automatically
- **Reference:** Spec §3, §12, §26; BTG admin review 2026-10-01

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

### ⏸ `2S1-FE-03` · BTG's sponsor-request review screen

**Order** 14.5 · **FE** · **Where:** Code · **3d** · **Blocked**

BTG's queue of new sponsor requests: who is asking, their business type, their message and when they asked. BTG can approve, which opens the account and emails the sponsor a sign-in link, or decline with a note the sponsor reads. The same screen shows whether the Zoho lead has already been converted, so sales and BTG don't create the sponsor twice. Raised 2026-09-30 from the walkthrough (step 4b).

- **Depends on:** 2S1-BE-05
- **Done when:** BTG can review a sponsor's request, approve it (the sponsor can then sign in) or decline it with a reason, from the admin portal
- **Reference:** Spec §10; walkthrough 2026-09-30

### ⏸ `2S1-FE-04` · The applicant's checklist and the documents page

**Order** 14.6 · **FE** · **Where:** Code · **3d** · **Blocked**

In the onboarding wizard: the live checklist of required documents, ticking as each is uploaded; the email confirmation step; the "name already registered" message; and AGENCY as a type. In the property portal after approval: a Documents page to replace or add files, showing each document's status and history.

- **Depends on:** 2S1-BE-06, 2S1-BE-07, 2S1-BE-08, 2S0-ART-01
- **Done when:** An applicant sees exactly what is still missing and is approved when nothing is; an approved organization can replace or add its documents from its portal
- **Reference:** Spec §3, §12; BTG admin review 2026-10-01

### ⏸ `2S1-FE-05` · BTG's organization profile page with Reject

**Order** 14.7 · **FE** · **Where:** Code · **2d** · **Blocked**

The page BTG's email links to: the organization's details, its documents, the automatic checklist as it was when approved, and its activity. It has **Reject** (a required reason, emailed to the organization) and Reinstate, plus an "Automatically approved" list in the admin portal for spot checks.

- **Depends on:** 2S1-BE-06, 2S1-BE-07, 2S0-ART-01
- **Done when:** From the emailed link, a BTG admin can review an automatically approved organization and reject it with a reason, or reinstate it; recent automatic approvals are listed for spot checks
- **Reference:** Spec §3, §12; BTG admin review 2026-10-01

### ⏸ `2S1-FE-06` · Athlete and guardian sign-up screens

**Order** 14.75 · **FE** · **Where:** Code · **4d** · **Blocked**

In the athlete application: the government ID upload (adults) or school ID upload (minors), the email confirmation step, and the guardian's details. The guardian's own page from their email: their details, government ID, proof of guardianship and the guardian agreement. Each screen shows what is still needed before approval.

- **Depends on:** 2S1-BE-09, 2S1-BE-10, 2S0-ART-01
- **Done when:** An adult and a minor with their guardian can each complete sign-up, see what is still missing, and are approved when nothing is
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-FE-07` · BTG's New sign-ups page

**Order** 14.8 · **FE** · **Where:** Code · **3d** · **Blocked**

One page for BTG's single reviewer, with every automatic approval: organizations (2S1-FE-05's profile pages), athletes and guardians. Each email from 2S1-BE-06, -09 and -10 links here. It shows the uploaded documents through the 5-minute viewer, with **Reject** (required reason) and **Reinstate**, and shows the guardian-athlete link: rejecting a guardian lists which athletes it rejects with them. It also holds the likely-duplicate and flagged items (an unknown place, a missing document after an update).

- **Depends on:** 2S1-BE-09, 2S1-BE-10, 2S1-FE-05
- **Done when:** From the emailed link, BTG can see every new organization, athlete and guardian with their documents, and reject or reinstate each, with a guardian's rejection shown to include their athletes
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-FE-08` · The guardian's controls, the coming-of-age reminder, and closing or reactivating an account

**Order** 14.85 · **FE** · **Where:** Code · **4d** · **Blocked**

For a minor: the guardian's portal acts for them (offers, orders, listings, payout account and payouts), and the minor's portal shows those actions as the guardian's. The coming-of-age reminder stays on the athlete's and guardian's pages throughout the 90-day allowance, counting down, with the government-ID upload that completes it, and the actions that are paused (adding items, new transactions) are shown as unavailable with the reason. The account settings have Close account and the reactivation page.

- **Depends on:** 2S1-BE-11, 2S1-BE-12, 2S1-BE-13, 2S0-ART-01
- **Done when:** A guardian can do every agreement and money action for their minor from their own portal; the coming-of-age reminder persists until done; an account can be closed and reactivated within 30 days
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-FE-09` · Profile editing without BTG review, on screen

**Order** 14.9 · **FE** · **Where:** Code · **2d** · **Blocked**

The athlete's profile editor saves ordinary edits at once, with no more "waiting for BTG" state. For a sensitive field it says what will be needed: "Changing your legal name needs a matching ID", with the upload; a date of birth or a guardian starts the right steps. BTG's Profile changes page is retired, and sensitive edits appear on the New sign-ups page (2S1-FE-07) instead.

- **Depends on:** 2S1-BE-14, 2S1-FE-07
- **Done when:** An athlete's ordinary edits save at once; a sensitive edit shows and collects what it needs; BTG sees sensitive edits on the New sign-ups page, and the old Profile changes review page is gone
- **Reference:** Spec §4; BTG admin review 2026-10-01

### ⏸ `2S1-FE-10` · Guardian handoff and contact pages, on screen

**Order** 14.95 · **FE** · **Where:** Code · **3d** · **Blocked**

The new guardian's request page (identify the athlete, and complete their details and documents). The current guardian's view of a request, with **Hand off** and **Decline**. The handoff's status for both guardians and the athlete. The **Contact BTG** page and form, linked from the request page, from the decline and rejection emails, and from account pages, showing the support email address.

- **Depends on:** 2S1-BE-15, 2S1-BE-16, 2S0-ART-01
- **Done when:** A new guardian can request a handoff, the current guardian can hand off or decline from their portal, both can follow its status, and anyone can reach BTG support from the contact page
- **Reference:** Spec §4, §26, §37; BTG admin review 2026-10-01

### ⏸ `2S1-FE-11` · The sponsor request form, and the word list for BTG

**Order** 14.97 · **FE** · **Where:** Code · **3d** · **Blocked**

In the public "Become a sponsor" form, this adds:
- the business-type picker, with Other and a description box;
- the proof-of-business upload, with what counts (registration, permit or license);
- the email confirmation step.

The applicant is told whether they're approved straight away or under review. BTG's New sign-ups page shows each new sponsor with the review reason (a restricted type, the words that matched, or a name match). An admin page lists and edits the restricted words.

- **Depends on:** 2S1-BE-17, 2S1-BE-18, 2S1-FE-07, 2S0-ART-01
- **Done when:** A sponsor can complete the form with a business type or Other and their proof of business, and is told whether they're approved or under review; BTG sees the reason for each review; BTG admins can edit the restricted-words list
- **Reference:** Spec §3, §12, §26; BTG admin review 2026-10-01

### ⏸ `2S1-FE-12` · BTG's Closed accounts desk

**Order** 14.98 · **FE** · **Where:** Code · **2d** · **Code review**

The desk for closed accounts. It has five tabs, each with a count:
- Asking to come back
- Closed by BTG
- Closed by the owner
- Ended at coming of age
- Files deleted

A rejected account's request shows BTG's original reason and the person's note. BTG has two answers:
- decline with a reason, which is emailed;
- open the account's own page and reinstate it there.

An application rejected before approval can only be declined, or told to apply again. Owner-closed, ended and deleted accounts are read-only.

- **Depends on:** 2S1-BE-13
- **Done when:** BTG sees closed accounts by tab with counts and answers a rejected account's request to come back — decline with a reason that is emailed, or a link to reinstate on the account's own page; owner-closed, ended and deleted accounts are read-only; BTG admins only
- **Reference:** Claude Design ClosedAccounts.dc.html; raised 2026-10-01

### ⏸ `2S1-FE-13` · BTG's Guardian handoffs desk

**Order** 14.99 · **FE** · **Where:** Code · **2d** · **Code review**

Guardian handoff requests, grouped by step:
- Waiting for BTG
- In progress
- Switched
- Declined
- Cancelled

When "BTG staff confirm minors" is on, a request the current guardian has handed off waits here for BTG. It shows the new guardian's details, their ID and proof of guardianship (opened through 5-minute audited links) and what the switch changes. BTG confirms the switch, or declines with a reason the requester reads.

With the setting off, the desk is a read-only record. Custody disputes go to BTG support, never to this desk.

- **Depends on:** 2S1-BE-15
- **Done when:** With staff confirmation on, BTG can open a handed-off request, view the new guardian's documents through 5-minute audited links, and confirm the switch or decline with a reason the requester reads; with it off the desk is read-only; BTG admins only
- **Reference:** Claude Design GuardianHandoffs.dc.html; raised 2026-10-01

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

### ⏸ `2S2-BE-05` · A team invites an athlete already on SponsorX

**Order** 19.5 · **BE** · **Where:** Code · **4d** · **Ready**

Today "add to roster" only creates a new athlete and refuses an email that already has an account, so an athlete who applied on their own (walkthrough step 2) can never join a team (step 3). A team searches for an approved athlete and sends an invitation naming the share it asks for. The athlete accepts or declines from their portal and by email, and nobody joins a team without agreeing to its share. On accepting, the athlete is linked to the team at that share. The athlete's own listings stop selling while they are on the team — the team lists the items — and sell again if they leave. The team can lower its share later, but raising it needs the athlete's agreement. Orders already placed keep the split they were sold with. Either side can end the link: the athlete leaves, or the team removes them. That ends the team's listings of the athlete's items, and past orders keep their split. "Add a new athlete" stays for players who aren't on SponsorX yet. Raised 2026-10-01 from the user-flow review.

- **Depends on:** 2S2-BE-04, 2S3-BE-05
- **Done when:** A team can invite an existing approved athlete with a proposed share; the athlete can accept or decline; accepting links them at that share and their own listings stop selling while they are on the team; either side can end the link without changing past orders; nobody is linked without accepting; tenant and role tests cover it
- **Reference:** Spec §5; user-flow review 2026-10-01

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

### ⏸ `2S2-FE-05` · Team invitations and leaving a team, on screen

**Order** 23.5 · **FE** · **Where:** Code · **3d** · **Blocked**

The screens for 2S2-BE-05. On the team's Roster page: "Invite an athlete already on SponsorX" (search, the share asked for, send), with pending invitations and a "Remove from roster" action. In the athlete portal: the invitation, showing the team, the share and what joining means for their listings, with Accept and Decline, plus "Leave team" later on.

- **Depends on:** 2S2-BE-05, 2S0-ART-01
- **Done when:** A team can invite an existing athlete and see the invitation's state; the athlete can accept, decline or later leave from their portal; a team can remove an athlete
- **Reference:** Spec §5; user-flow review 2026-10-01

## Sprint 3 · Listing engine

*Public and private listings, packages, search, availability and conflict checking.*

*8 tasks · 34 person-days*

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

### ⏸ `2S3-BE-05` · Independent athletes list their own items

**Order** 27.5 · **BE** · **Where:** Code · **5d** · **Blocked**

Not every athlete has a team. Today only a property manager can put an item on sale, so an athlete with no team can create items that can never be sold — and nothing tells them. Let an approved athlete with no team be the seller of their own listing: the athlete submits it, BTG approves it by the same rules as a team's (with "the athlete is approved" in place of "the property is approved to list"), and with no team the athlete keeps the whole share. Listings stop assuming a property: search, the cart, orders, the availability check and the ledger split all handle an athlete-owned listing. A roster athlete's items still go through their team. Raised 2026-09-30 from the walkthrough.

- **Depends on:** 2S3-BE-01, 2S2-BE-01
- **Done when:** An approved athlete with no team can submit their own item, BTG can approve it, a sponsor can find, cart and order it, and the split pays the athlete as the only payee; a roster athlete still cannot list around their team; scope and tenant tests cover the new seller
- **Reference:** Spec §9, §12; walkthrough 2026-09-30

### ⏸ `2S3-BE-06` · Listings publish automatically; BTG handles the exceptions

**Order** 27.6 · **BE** · **Where:** Code · **3d** · **In progress**

Replaces BTG's approval of every listing (item 8 of the BTG admin review, 2026-10-02). When a seller submits a listing, the checks BTG's approval runs today run first. If they pass, the listing goes live straight away, the first one included.

A seller whose account is closed, rejected or ended, or has no listing access, is refused outright, as before. Nobody can approve those, and their logins are switched off.

Otherwise the listing waits for BTG only when it is flagged:
- **restricted words** in its title or description, from BTG's list (2S1-BE-18);
- **a seller BTG should look at:** an organisation flagged for a missing document, payouts on hold, an athlete in the coming-of-age pause, or a minor whose guardian isn't verified yet.

An independent minor's own login is refused, because the guardian acts for them (2S1-BE-11).

The reasons are stored on the listing and shown to BTG.

BTG admins get one daily summary of listings published automatically, and an email for each held listing. BTG can pause or end any live listing with a reason, which is emailed to the seller.

There is no price check; it was left out on purpose.

- **Depends on:** 2S3-BE-01, 2S3-BE-05, 2S1-BE-18
- **Done when:** A listing that passes the checks is published on submit without BTG; a closed, rejected or unapproved seller is refused; a listing with restricted words or from a seller BTG should look at waits for BTG with the reason; resuming a paused listing and reactivating an account take the same checks; BTG can approve a held listing and pause or end any listing with a reason emailed to the seller; BTG admins get one daily summary of automatic publishes; tenant and role tests cover it
- **Reference:** BTG admin review item 8, 2026-10-02

### ⏸ `2S3-FE-01` · Build the listing editor

**Order** 28 · **FE** · **Where:** Code · **5d** · **Blocked**

Listing data, pricing, package builder, preview, approval status and visibility settings.

- **Depends on:** 2S0-ART-01
- **Done when:** A property can build, preview and submit a listing for approval
- **Reference:** Spec §6 P2-07

### ⏸ `2S3-FE-02` · Listing screen for independent athletes

**Order** 28.5 · **FE** · **Where:** Code · **3d** · **Blocked**

The athlete-side "put it on sale" step: from their inventory, an athlete with no team writes what the sponsor gets, sees the same checklist of what BTG checks, and submits for approval; they can then follow the listing's state, pause it and take it down. An athlete on a team is told their team lists it.

- **Depends on:** 2S3-BE-05
- **Done when:** An independent athlete can build, submit and follow a listing for approval from their own portal
- **Reference:** Spec §6 P2-07; walkthrough 2026-09-30

### ⏸ `2S3-FE-03` · Show an athlete as the seller in the shop, cart and BTG's queue

**Order** 28.7 · **FE** · **Where:** Code · **2d** · **Blocked**

Since 2S3-BE-05 a listing is sold by a team **or** by an athlete with no team. For an athlete's listing the API sends `property: null` (search), `propertyName: null` (cart, listings) and a `seller: { type: "ATHLETE", id, name }` on every listing and search result. Screens that print the team's name must print the seller instead. Otherwise the sponsor shop's seller line (`propertyLine` in `lib/shop-live.ts`) fails on the first athlete-sold listing. The screens are the sponsor shop and its search, the cart line, the checkout summary, and BTG's marketplace listing queue. The seller filter and the "how many sellers" count in `lineSummary` must count athletes too. Raised 2026-09-30 by 2S3-BE-05.

- **Depends on:** 2S3-BE-05
- **Done when:** An athlete-sold listing shows the athlete as its seller in the shop, the cart, checkout and BTG's listing queue, with no screen assuming a property; a test renders each with `property: null`
- **Reference:** Spec §6 P2-07; 2S3-BE-05

### ⏸ `2S3-FE-04` · Automatic listing publishing, on screen

**Order** 28.8 · **FE** · **Where:** Code · **2d** · **In progress**

**The seller's listing editors** (team and independent athlete):
- before submitting, they say the listing goes live as soon as the checks pass;
- after submitting, they show either "Live" or "BTG is taking a look", naming the restricted words when those are the reason, so the seller can fix them.

**BTG's marketplace console:**
- each held listing shows its reasons;
- a new "Published automatically" tab lists the listings that went live without BTG, with Pause and End (a reason is required, and it's emailed).

- **Depends on:** 2S3-BE-06
- **Done when:** The seller sees whether a submitted listing went live or is held, and why when it can fix it; BTG sees held listings with their reasons and listings published automatically, and can pause or end one with a reason
- **Reference:** BTG admin review item 8, 2026-10-02

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

### ⏸ `2S4-BE-06` · Sellers see and are told about their sales

**Order** 34.3 · **BE** · **Where:** Code · **3d** · **Ready**

Today only the sponsor and BTG can see a marketplace order, and nobody on the selling side is told about one, so Riley never learns the clinic was sold (walkthrough steps 10 to 13). The team manager and the athlete whose item it is, or the athlete alone when selling without a team, can read the order lines they sell. That covers the order number, the sponsor's business name, what was bought, the quantity, the dates, the status and their own share only. They're emailed when BTG approves the order and the sponsor has paid, and optionally given a heads-up when it's placed and waiting for approval. The sponsor contact's name and email become visible to the seller once the order is paid, so they can arrange the clinic or appearance directly. Raised 2026-10-01 from the user-flow review.

- **Depends on:** 2S4-BE-03, 2S5-BE-02
- **Done when:** A seller can read only the order lines they sell, with their own share and no one else's; they are emailed when a sale is approved and paid; the sponsor contact appears only once paid; a seller can never read another seller's lines or another tenant's orders (tenant and role tests)
- **Reference:** Spec §6 P2-08; user-flow review 2026-10-01

### ⏸ `2S4-BE-07` · The seller marks it delivered; the sponsor confirms within 24 hours

**Order** 34.6 · **BE** · **Where:** Code · **5d** · **Ready**

Delivery is confirmed per order line, because one order can hold items from different sellers. A paid order moves to In delivery on its own. The seller marks a line delivered with a required note, and a photo or link optionally. The sponsor is emailed and can Confirm or Report a problem. **After 24 hours with no answer, the line counts as confirmed.** A confirmed line becomes payable, after the holding period, replacing today's whole-order "fulfilled" rule for payouts. A reported problem pauses that line's payout until BTG decides: confirm it was delivered, or cancel and refund the line. The order is delivered once every line is confirmed. Every step is audited. Raised 2026-10-01 from the user-flow review.

- **Depends on:** 2S4-BE-06, 2S5-BE-04
- **Done when:** A seller can mark only their own lines delivered, with a note; the sponsor can confirm or report a problem, and silence for 24 hours confirms; only confirmed lines can be paid out; a reported problem holds that line's payout until BTG resolves it; the order is delivered when all its lines are
- **Reference:** Spec §6 P2-08, §7.4; user-flow review 2026-10-01

### ⏸ `2S4-BE-08` · Delivery reminders and automatic close

**Order** 34.8 · **BE** · **Where:** Code · **2d** · **Ready**

A worker job runs daily. The day after a line's last date, a seller who hasn't marked it delivered gets a reminder, and BTG gets a list of overdue lines. 30 days after every line of an order is confirmed, the order closes on its own, releasing the reserve so the reserve parts of the sellers' shares become payable. BTG can still close an order early by hand. Raised 2026-10-01 from the user-flow review.

- **Depends on:** 2S4-BE-07
- **Done when:** Overdue lines remind the seller once and appear in BTG's list; an order closes itself 30 days after its last line is confirmed and its reserve becomes payable; running the job twice changes nothing
- **Reference:** Spec §7.4; user-flow review 2026-10-01

### ⏸ `2S4-BE-09` · Order approval by spending limit; seller approves listings that ask

**Order** 36.5 · **BE** · **Where:** Code · **3d** · **In progress**

Replaces BTG's approval of orders of $1,000 or more and of every sponsor's first order (items 9 to 11 of the BTG admin review, 2026-10-02).

**The spending limit.** Each sponsor has one:
- it starts at $5,000;
- it rises to twice the sponsor's largest completed order, up to $25,000;
- a refund, or a problem BTG upheld, stops it rising.

**Orders within the limit** are approved automatically, the first one included. Orders above it wait for BTG with the reason, and BTG is emailed for each.

**A listing that asks for approval** goes to its seller, not BTG. The seller accepts or declines within 48 hours; silence declines and releases the stock.

**BTG gets one daily summary** of orders approved automatically.

- **Depends on:** 2S4-BE-03
- **Done when:** Orders within the sponsor's spending limit are approved automatically and only those above it wait for BTG with the reason; the limit grows with completed orders as set and stops after a refund or upheld problem; a listing that asks for approval is decided by its seller within 48 hours, silence declining; BTG gets one daily summary; tenant and role tests cover it
- **Reference:** BTG admin review items 9 to 11, 2026-10-02

### ⏸ `2S4-BE-10` · Payment status automated: awaiting payment, Zoho invoices, reminders, auto-cancel

**Order** 36.6 · **BE** · **Where:** Code · **3d** · **In progress**

- **Awaiting payment** is set automatically the moment an order is approved.
- **Card payments** are marked paid by the payment provider, as today.
- **An order paid by Zoho Books invoice** is marked paid when Zoho marks the invoice paid. This uses the inbound invoice webhook (P7-BE-04), queued so Zoho is never on a request path. It is tested against a simulated Zoho, because BTG's Zoho Books isn't connected yet.
- **Unpaid orders** are reminded at 1 and 2 days and cancelled at 3 days, which releases the stock. An order with a payment in progress is never cancelled.
- **BTG's manual "Mark paid"** stays as a fallback. It needs a method and a payment reference, and only BTG admin or Finance can use it.

- **Depends on:** 2S4-BE-09, P7-BE-04
- **Done when:** An approved order is awaiting payment without a manual step; a Zoho invoice marked paid moves its order to paid; an unpaid order is reminded at 1 and 2 days and cancelled at 3, never while a payment is in progress; a manual mark-paid needs a method and reference and is BTG admin or Finance only
- **Reference:** BTG admin review items 9 to 11, 2026-10-02

### ⏸ `2S4-BE-11` · Delivery problems settled between seller and sponsor; BTG only on disagreement

**Order** 36.7 · **BE** · **Where:** Code · **3d** · **In progress**

**When a sponsor reports a problem,** the seller has 72 hours to answer in one of three ways:
- **deliver again,** with a new date; the sponsor's 24-hour confirm window restarts after the new delivery;
- **refund the line**;
- **disagree,** with a note.

**The sponsor then has 72 hours** to accept or reject that answer. An accepted answer settles automatically.

**BTG steps in only when** the sponsor rejects the answer or either side doesn't answer.

**Late sellers** get a second reminder at 3 days, and go to BTG at 7 days.

- **Depends on:** 2S4-BE-07
- **Done when:** A reported problem is answered by the seller (deliver again, refund, or disagree) and accepted or rejected by the sponsor within 72 hours each; an accepted answer settles without BTG; BTG sees only rejected or unanswered cases with the reason; a late seller is reminded twice and escalated at 7 days
- **Reference:** BTG admin review items 9 to 11, 2026-10-02

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

### ⏸ `2S4-FE-03` · The seller's Orders page

**Order** 36.3 · **FE** · **Where:** Code · **3d** · **Blocked**

An Orders page in the athlete portal and in the team (property) portal. It lists each sale: the order number, the sponsor's business, what was bought, the dates, the status and the seller's own share. Once paid, it shows the sponsor contact. Each line has its own delivery state. Built from 2S4-BE-06.

- **Depends on:** 2S4-BE-06, 2S0-ART-01
- **Done when:** An athlete and a team each see their own sales with their own share, and the sponsor contact once paid
- **Reference:** Spec §6 P2-08; user-flow review 2026-10-01

### ⏸ `2S4-FE-04` · Delivery on screen: mark delivered, confirm, resolve

**Order** 36.6 · **FE** · **Where:** Code · **4d** · **Blocked**

The screens for 2S4-BE-07 and 2S4-BE-08. The seller's "Mark delivered" with its note and optional proof, on the Orders page. On the sponsor's order page: "Riley says this was delivered", with Confirm and Report a problem and the time left to answer (24 hours). For BTG: a queue of reported problems with Confirm delivered and Cancel and refund, and the list of overdue lines.

- **Depends on:** 2S4-BE-07, 2S4-BE-08, 2S0-ART-01
- **Done when:** A seller can mark a line delivered; the sponsor can confirm it or report a problem within 24 hours; BTG can resolve a problem and see overdue lines
- **Reference:** Spec §6 P2-08; user-flow review 2026-10-01

### ⏸ `2S4-FE-05` · Automatic order handling, on screen

**Order** 38.5 · **FE** · **Where:** Code · **3d** · **In progress**

Built from the Claude Design files SellerOrderActions, SponsorOrderUpdates and OrderExceptions.

**For the seller:**
- accept or decline an order;
- answer a delivery problem.

**For the sponsor:**
- the pay-by deadline;
- the held and declined states;
- the answer to the seller's reply.

**For BTG:**
- the revised Delivery issues desk;
- the sponsor's spending-limit card;
- the Mark paid dialog, with a payment reference.

- **Depends on:** 2S4-BE-09, 2S4-BE-10, 2S4-BE-11
- **Done when:** Each party sees its next step and deadline: the seller can accept or decline an order and answer a problem, the sponsor can pay before the deadline and accept or reject the seller's answer, and BTG sees only the exceptions, a sponsor's limit, and can mark an order paid with a reference
- **Reference:** BTG admin review items 9 to 11, 2026-10-02

### ⏸ `2S4-BE-12` · Cancelling a paid line: by the sponsor, by the seller; BTG only on disagreement

**Order** 36.8 · **BE** · **Where:** Code · **3d** · **In progress**

Replaces BTG cancelling a paid order (item 13 of the BTG admin review, 2026-10-02). This applies to a paid line that hasn't been marked delivered.

**The sponsor cancels.**
- **Free until 3 days before the line's first date:** refunded at once, with no seller step.
- **Closer than that:** the sponsor asks the seller, with a reason. The seller has 72 hours, or until the first date if that comes sooner:
  - agreeing refunds the line;
  - saying no (with a reason), or not answering, sends it to BTG, which keeps the line or refunds it.
- **From the first date:** no cancelling. The sponsor reports a problem instead.

**The seller cancels** a line they can't deliver, with a reason. The sponsor is refunded in full at once.

**Good standing.** Two seller cancellations in 90 days take a seller out of good standing, so their new listings are held for BTG.

**The spending limit.** Cancellation refunds don't stop a sponsor's spending limit rising.

- **Depends on:** 2S4-BE-07, 2S4-BE-11, 2S3-BE-06
- **Done when:** A sponsor cancels free before the cut-off and asks the seller after it; the seller agrees, declines or misses the deadline, and only the last two reach BTG; a seller cancels with a reason and the sponsor is refunded; a second seller cancellation within 90 days holds that seller's new listings; every refund happens once under concurrent clicks and the sweep
- **Reference:** BTG admin review item 13, 2026-10-02

### ⏸ `2S4-BE-13` · Refunds to send

**Order** 36.9 · **BE** · **Where:** Code · **2d** · **In progress**

**Every refund of money actually received** puts one row on Finance's "Refunds to send" list. That covers:
- a cancellation;
- an agreed problem refund;
- BTG's refund;
- a payment that arrived after its order was cancelled.

**Card refunds.** These go back through the payment provider when it can refund. The staging stand-in does so at once; until a provider is connected, production leaves the row open.

**Everything else.** Finance sends the money and marks the row refunded, with the method, a reference and the date. The sponsor is emailed and sees "Refund on its way", then "Refund sent". If the order was paid by Zoho invoice, the row reminds Finance to issue a credit note.

- **Depends on:** 2S4-BE-10, 2S4-BE-12
- **Done when:** Each refund path makes exactly one row and an unpaid order makes none; BTG admin and Finance alone can mark a row sent, with a reference; the sponsor sees the refund's state and never a method or a reference
- **Reference:** BTG admin review item 13, 2026-10-02

### ⏸ `2S4-FE-06` · Cancellations and refunds, on screen

**Order** 38.6 · **FE** · **Where:** Code · **3d** · **Blocked**

Built from the Claude Design file OrderCancellations.

- **For the sponsor:** Cancel this session, or Ask the seller to cancel, with the free-until date; the seller's answer; the refund's state.
- **For the seller:** Can't deliver this session? (with the 90-day warning); answer a cancellation request.
- **For BTG:** escalated cancellations on the Delivery issues desk.
- **For BTG and Finance:** the Refunds to send page and the Mark refunded dialog.

- **Depends on:** 2S4-BE-12, 2S4-BE-13, the OrderCancellations design
- **Done when:** Each party sees its next step and deadline: the sponsor can cancel or ask, the seller can cancel or answer, BTG decides only escalated requests, and Finance can mark a refund sent with a reference
- **Reference:** BTG admin review item 13, 2026-10-02

## Sprint 5 · Payments, ledger & payouts

*The financial core. Money in, money apportioned, money out.*

*14 tasks · 58 person-days*

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

### ⏸ `2S5-BE-06` · Payouts approved automatically

**Order** 44.1 · **BE** · **Where:** Code · **2d** · **In progress**

Replaces BTG approving every payout request (item 14 of the BTG admin review, 2026-10-02).

**Approved the moment it's requested** when all of these hold:
- the four checks pass: payment in, delivery confirmed, payout account ready, holding period passed;
- the payee isn't on hold;
- the payout is under $2,000.

A payee's first payout needs no extra review.

**Two safeguards send it to BTG instead:**
- the payout account changed in the last 7 days;
- the payee's automatic approvals in the last 7 days, including this one, would reach $5,000. Phase 1 earnings count towards this.

**What each side sees.** BTG sees the reasons in words. The payee sees only "BTG is reviewing this payout".

- **Depends on:** 2S5-BE-05
- **Done when:** A payout passing every check under $2,000 is approved without a person, a first payout included; a recent account change, the 7-day $5,000 total, a hold, or $2,000 or more sends it to BTG with the reason; two requests at once can't both pass the 7-day total
- **Reference:** BTG admin review item 14, 2026-10-02

### ⏸ `2S5-BE-07` · Failed payouts retried automatically

**Order** 44.2 · **BE** · **Where:** Code · **1d** · **In progress**

Item 15 of the BTG admin review, 2026-10-02. What happens depends on why the provider couldn't send the payout:
- **A temporary failure:** retried up to 3 times, at about 1, 6 and 24 hours.
- **A problem with the payee's account:** the payee is emailed to fix it, and the payout is retried once the account is ready.
- **Anything else, or a failure that doesn't clear:** it goes to BTG, whose Retry still works.

- **Depends on:** 2S5-BE-05
- **Done when:** Temporary failures retry on the schedule and stop after 3; an account failure emails the payee and retries when the account is ready; only the rest reach BTG; no retry is sent twice
- **Reference:** BTG admin review item 15, 2026-10-02

### ⏸ `2S5-BE-08` · Phase 1 earnings approved for payout automatically

**Order** 44.3 · **BE** · **Where:** Code · **1d** · **In progress**

Item 17 of the BTG admin review, 2026-10-02.

**Approved automatically.** An earning that becomes eligible moves on to approved for payout when all of these hold:
- the earning isn't held or disputed;
- the athlete isn't on hold;
- it's under $2,000;
- it stays within the athlete's 7-day $5,000 automatic total.

**Otherwise** it stays eligible for Finance, with the reasons.

**Marking it paid** stays with Finance until a payment provider is connected.

- **Depends on:** P7-BE-02, 2S5-BE-06
- **Done when:** An eligible earning within the rule is approved for payout without a person; one outside it stays eligible with its reasons; held and disputed earnings are never touched; paid stays manual
- **Reference:** BTG admin review item 17, 2026-10-02

### ⏸ `2S5-FE-06` · Automatic payouts, on screen

**Order** 47.6 · **FE** · **Where:** Code · **1d** · **In progress**

Small changes to the existing payout screens. No new design.

- **BTG:**
  - an "Approved automatically" label;
  - the reasons a payout is waiting;
  - the retry status;
  - a view showing only what needs BTG.
- **Payees:** "Approved automatically", "BTG is reviewing this payout", and "Fix your payout account".
- **Finance:** "Approved automatically" on Phase 1 earnings.

- **Depends on:** 2S5-BE-06, 2S5-BE-07, 2S5-BE-08
- **Done when:** Each payout and earning shows whether it was approved automatically or why it waits, and BTG's list defaults to what needs BTG
- **Reference:** BTG admin review items 14, 15 and 17, 2026-10-02

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

### ⏸ `2S5-FE-03` · Athlete and team payout screens

**Order** 46.3 · **FE** · **Where:** Code · **4d** · **Blocked**

Where an athlete (and a team) gets paid. First the payout account: until it is ready the page says plainly that a Stripe account is needed and links out to Stripe to set one up (and back again if Stripe needs more information); SponsorX never sees bank details. Then the money: available, held in reserve and paid out; a Request payout button for the available balance, disabled with the reason when a rule isn't met; and a payout history whose status moves Requested → Approved by BTG → Sent → Paid, confirmed by the payment provider. Stripe itself stays invisible after set-up — the payee sees SponsorX's statuses and an email when it's paid. Raised 2026-09-30 from the walkthrough (steps 5, 14, 15).

- **Depends on:** 2S5-BE-04, 2S0-ART-01
- **Done when:** An athlete can set up their payout account from SponsorX, request their available balance, and follow it to Paid; the team does the same from its Earnings page; the figures reconcile to the ledger
- **Reference:** Spec §6 P2-11, §7.4; walkthrough 2026-09-30

### ⏸ `2S5-FE-04` · BTG payout approval screen

**Order** 46.6 · **FE** · **Where:** Code · **3d** · **Blocked**

BTG's queue of payout requests: waiting, sending, paid and problems, each with the payee, amount, orders, how long it has waited and the result of every payout rule. The detail shows the frozen split behind it and lets BTG approve (handing it to the payment provider) or send it back with a note, then follow it to Paid or to a problem it can act on.

- **Depends on:** 2S5-BE-05
- **Done when:** BTG can approve or send back a payout request and see it confirmed paid by the payment provider, with every decision in the audit log
- **Reference:** Spec §8; walkthrough 2026-09-30

### ⏸ `2S5-FE-05` · Sponsor pays for an order (pay-by-card button)

**Order** 46.8 · **FE** · **Where:** Code · **2d** · **Blocked**

Once BTG approves an order, the sponsor's order page shows "payment due" and a primary button "Pay $… by card ↗" that takes them to Stripe's secure payment page — SponsorX never sees the card. Back from Stripe the order shows "confirming", then "Paid, confirmed by the payment provider", or "didn't go through" with the button again. Rule agreed 2026-09-30: every step that involves Stripe has a call-to-action button on our page that takes the user there.

- **Depends on:** 2S5-INT-01, 2S0-ART-01
- **Done when:** A sponsor can pay an approved order from its SponsorX page via Stripe and see it confirmed paid (or retry a failed payment); a sponsor email confirms the payment
- **Reference:** Spec §8; walkthrough 2026-09-30 (step 11)

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

### ✅ `2S8-QA-01` · End-to-end marketplace test suite

**Order** 58 · **QA** · **Where:** Code · **5d** · **Done**

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


### ⏸ `2S8-QA-04` · Find the cross-suite test interference

**Order** after 2S8-QA-03 · **QA** · **Where:** Code · **1d** · **Ready**

The backend suite runs its files in parallel on one database. A few suites fail now and then, only when run with the others:
- `next-public-apply`: the advisor's login answers 403;
- `notification-preferences`;
- `pilot-school`: a duplicate athlete slug.

Each passes when run alone. One more, `phase2-guardian-acts`, was fixed on 2026-10-01: its sweep was platform-wide and raced another suite's.

This task finds which suite or sweep touches another suite's rows, and isolates it, so CI is reliably green and the automatic deploy can run.

- **Done when:** Five consecutive full backend runs pass with only known, tracked failures; the interfering suite or sweep is identified and isolated
- **Reference:** seen 2026-10-01 and 2026-10-02

### ⏸ `2S8-OPS-02` · Pin the database time zone to UTC

**QA/OPS** · **1d** · **Code review** — merged 2026-10-05; Done once the next deploy applies migration `20261005100000_utc_time_zone` on staging and production

Timestamp columns hold UTC as timestamp-without-time-zone, but some SQL compares them with `now()` in the session's time zone:
- `worker/jobs/expire-invitations.mts`;
- the edition function in migration `20260925120000`.

They are only correct when the database session runs in UTC. On the local dev database, which runs in Asia/Manila, they are 8 hours off.

Two fixes:
- pin the time zone (`ALTER DATABASE … SET timezone='UTC'`) on staging, production, docker-compose and CI;
- make the two SQL sites use `now() AT TIME ZONE 'UTC'`, so they don't depend on the setting.

- **Done when:** Every environment's database runs in UTC, and no SQL depends on the session time zone; a test running under a non-UTC session passes
- **Reference:** found by 2S8-QA-04, 2026-10-02

### ✅ `2S8-QA-05` · Three robustness gaps found while isolating the suite

**Order** 60.7 · **QA** · **Where:** Code · **1d** · **Done**

1. **Same-name applicants can collide.** Two applicants with the same display name at the same moment can collide on the athlete slug: `uniqueSlug` checks first and then inserts. One of them gets a 500.
2. **The walkthrough seed can fail on a non-empty database.** `seed-personas.mts` only skips rows whose id already exists, so a real applicant who already took the slug `riley-carter` would make it fail.
3. **The payee's payout page hides money owed back.** It rounds each order's figure up to zero, so a payee who owes money after a refund that follows a payout doesn't see it.

- **Done when:** Same-name applicants never error; the seed runs on a non-empty database; a negative balance after a refund shows on the payee's payout page
- **Reference:** found by 2S8-QA-04, 2026-10-02
### ✅ `2S8-QA-06` · Database rules installed by a deploy match the tests

**Order** 60.8 · **QA** · **Where:** Code · **1d** · **Done**

**Why it went wrong.** CI re-applies the `prisma/sql` files after migrating, but a deploy only migrates. The contract gate's lock on an order's acceptance and billing contact (2S4-FE-02) existed only in `prisma/sql`, so staging and production never had it.

**The fix.** Migration 20261004000000 installs it. A guard test builds a database from the migrations alone and fails if applying `prisma/sql` would change anything.

- **Depends on:** 2S4-FE-02
- **Done when:** A database built only by migrations has every rule in prisma/sql; the guard fails on any drift
- **Reference:** Found 2026-10-03 by a failing phase2-orders test on a fresh database

### ⏸ `2S8-SEC-01` · Cross-tenant isolation tests for external parties

**Order** 61 · **SEC** · **Where:** Code · **5d** · **Blocked**

Phase 1 tested BTG's own roles. Phase 2 has outside organisations, which is a different threat model.

- **Depends on:** 2S1-BE-04
- **Done when:** Cross-tenant data access tests pass for sponsor, athlete/property and admin roles
- **Reference:** Spec §12

### ✅ `2S8-SEC-02` · OWASP review and dependency scanning

**Order** 62 · **SEC** · **Where:** Code · **3d** · **Done**

External users, money movement and file uploads all raise the stakes.

- **Depends on:** 2S8-QA-01
- **Done when:** OWASP testing complete, dependency scan clean, secrets rotation in place
- **Reference:** Spec §38

### ⏸ `2S8-SEC-03` · Pin type and size on every private upload

**Order** 62.1 · **SEC** · **Where:** Code · **1d** · **Ready**

The private-bucket upload URLs don't pin content type or length: account, onboarding, organisation, sponsor-request, hand-off, support and profile-change documents. Their confirm step checks size but not type, and does not delete an oversized object.

Pin `{signContentType, contentLength}` at each presign. On confirm, compare the object's type and size, and delete it on a mismatch.

- **Depends on:** 2S8-SEC-02
- **Done when:** Every private upload URL is signed for one type and size; a mismatched object is refused and deleted on confirm, proven end to end
- **Reference:** Security review 2026-10, §A04 (Open, Medium); raised 2026-10-05 by 2S8-SEC-02

### ⏸ `2S8-SEC-04` · A replayed invoice webhook can't roll an invoice back

**Order** 62.2 · **SEC** · **Where:** Code · **1d** · **Ready**

Zoho Books sends no timestamp, so replaying an old, correctly signed invoice webhook could roll an invoice's status back. The ingest should refuse a payload that would move the stored state backwards: paid never goes back to sent.

- **Depends on:** 2S8-SEC-02
- **Done when:** A replayed older invoice webhook leaves the stored status unchanged; paid never returns to sent
- **Reference:** Security review 2026-10, §A04 (Open, Low); raised 2026-10-05 by 2S8-SEC-02

### ⏸ `2S8-SEC-05` · Small hardening items from the security review

**Order** 62.3 · **SEC** · **Where:** Code · **1d** · **Ready**

1. `GET /athletes/:id/rates` answers `200 []` for a real athlete but 403 for a missing id, which reveals which ids exist.
2. Restrict the Zoho CRM notification `module` and `ids` to an enum and digits.
3. Turn off JavaScript in the PDF renderer, once the report is confirmed to need none.
4. Stop the worker logging non-fan email addresses.
5. Add `import "server-only"` to `frontend/src/server/{api,edge,payouts}.ts`.
6. Run one git-history secret scan, for example gitleaks.

- **Depends on:** 2S8-SEC-02
- **Done when:** Each item is fixed with a test, or recorded as declined with a reason in the security review
- **Reference:** Security review 2026-10, §A01, §A09, §A10 and Follow-ups; raised 2026-10-05 by 2S8-SEC-02

### ⏸ `2S8-QA-07` · Guard tests cover writes and same-tenant access

**Order** 62.4 · **QA** · **Where:** Code · **2d** · **Ready**

`tenant-scope.static` checks reads only. `tenant-isolation` sweeps across tenants but not within one, so sponsor vs sponsor and athlete vs athlete are untested. Extend both, so that an unscoped write or a same-tenant read of another account fails the suite.

- **Depends on:** 2S8-SEC-02
- **Done when:** The guard tests fail on an unscoped write and on a same-tenant cross-account read, shown by a deliberately broken route
- **Reference:** Security review 2026-10, Other checks (Open, Info); raised 2026-10-05 by 2S8-SEC-02

### ⏸ `2S8-PMO-02` · Security settings the owner decides

**Order** 62.5 · **PMO** · **Where:** Document · **1d** · **Ready**

The security review leaves seven decisions to the owner:
1. A full CSP, in report-only mode first.
2. HSTS `includeSubDomains` / `preload`.
3. Clerk `authorizedParties`, after listing every web origin that signs people in.
4. How long intake, onboarding, sign-up and sponsor-request links last.
5. Whether a profile claimant confirms their email before an advisor verifies the claim.
6. Setting `PAYMENT_PROVIDER=none` explicitly on Railway production.
7. Setting `STANDIN_PROVIDER_SECRET` explicitly on staging.

- **Depends on:** 2S8-SEC-02
- **Done when:** Each of the seven decisions is recorded in the security review, and every setting chosen is applied on Railway
- **Reference:** Security review 2026-10, Decisions for the owner; raised 2026-10-05 by 2S8-SEC-02

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
