# SponsorX — Phase 4 · INFINEX World Integration

**BTG SPORTS GROUP · SPONSORX · PHASE 4 · INFINEX WORLD INTEGRATION**

| | |
|---|---|
| **Goal** | Make virtual worlds first-class SponsorX inventory. Sponsors buy, activate, measure and renew virtual placements in the same campaign system used for athletes, events and fan rewards. |
| **Tasks** | 19 · 62 person-days |
| **Blueprint timeline** | 18–22 weeks |
| **Balanced budget** | $90K–$150K |
| **Depends on** | Stable SponsorX APIs, campaign/reward engine, identity/session model, metrics pipeline |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0 (Spec § references) + Blueprint §34 |

> **Changed 2026-10-20 (user): the game is parked; every open Phase 4 task moved to Phase 5.** "Do not make any preparation for the game at this point. Our priority is to ship the SponsorX web app. All game-related tasks should be … transferred to Phase 5." All of Phase 4 serves the game (it sells sponsorship inside the INFINEX game's worlds), so all 29 open tasks moved, renumbered (the table is in [Phase 5](./SponsorX-Phase5-INFINEX-Game.md)): the 20 that need the game's traffic first, then the virtual-inventory screens, the emergency pause, the incident log, UAT and rollout. Phase 4 is closed at what was built (all Done): the world and placement registry, bookings, creative and the manifest, pause and rollback, machine login, client endpoints and settings, the telemetry intake, and the cross-channel campaign model. Its criteria 1–4 are demonstrated and signed off (`4S9-PMO-03`, [`SponsorX-Phase4-Acceptance-Signoff.md`](./SponsorX-Phase4-Acceptance-Signoff.md)).

> **Changed 2026-10-16 (user): Phase 4 is the web application only.** The INFINEX game has not been started; SponsorX comes first, then the game. So Phase 4 builds SponsorX's side — the pages, API and database for worlds, placements, creative, telemetry, pricing, activations and reporting — and proves it with a **stand-in world** (a script that calls SponsorX the way the game will). Every task that needs the real game moved to [Phase 5](./SponsorX-Phase5-INFINEX-Game.md), renumbered: `4S3-INT-01` → `5S1-INT-01`, `4S3-QA-01` → `5S1-QA-01`, `4S9-QA-01` → `5S2-QA-01`, `4S9-PMO-01` → `5S2-PMO-01`; the game halves of `4S3-INT-02` and `4S3-INT-03` are `5S1-INT-02` and `5S1-INT-03`. Phase acceptance criterion 3 ("the INFINEX client renders a placement") moved with them.

### The five phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) **← you are here** | 47 | 18–22 weeks |
| 5 | [`SponsorX-Phase5-INFINEX-Game.md`](./SponsorX-Phase5-INFINEX-Game.md) | 7 | after the game's staging world exists |

---

## ⚙️ How this project is tracked — read this first

Three artefacts, three jobs. Keeping them straight is what stops them drifting apart.

| Artefact | Owns | When it changes | Who touches it |
|---|---|---|---|
| **These four Markdown files** | The **plan** — what each task is, in plain English, and what *done* means | Only when scope or a task's meaning changes | Anyone, by pull request, reviewed like code |
| **`SponsorX-Full-Programme-Task-Board.xlsx`** | The **working tracker** — all five phases consolidated in one file | Continuously, during the day | Every developer, as they work |
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

**Forbidden.** Do not build ML pricing before there is enough clean history — launch Phase 3 on rules and statistics. Do not launch marketplace payouts before commission snapshots, reconciliation, refund and dispute behaviour and audit logs are fully tested. Do not report virtual impressions to sponsors until viewability and de-duplication criteria are validated against pilot-world telemetry. *(Since 2026-10-16 that validation is Phase 5's `5S2-QA-01`: through Phase 4, virtual impressions reach sponsors only labelled unvalidated, from the stand-in world.)*

---

# The tasks

## Sprint 0 · Contract & taxonomy

*Confirm the INFINEX runtime, identity model, telemetry volume and the world/placement taxonomy before a line of code.*

*3 tasks · 9 person-days*

### ✅ `4S0-PMO-01` · Define the world contract: runtime, environments and identity

**Order** 1 · **PMO** · **Where:** Document · **3d** · **Done**

The rules any world must follow to work with SponsorX, written before the game exists so the game is built to them (2026-10-16): SponsorX does not depend on the world's engine, which is recorded per world; each world has a staging and a production environment; world, zone and placement IDs are stable and never reused — if those churn, the inventory churns with them; sessions and players reach SponsorX only as anonymous references.

- **Depends on:** Phase 3 complete
- **Done when:** Runtime-neutral contract, environment versioning and identity/session model written and approved
- **Delivered:** 2026-10-16, approved by the user.
  - **Any engine:** a world talks to SponsorX in HTTPS and JSON, and records its engine in `runtime` and `runtimeVersion`.
  - **Two environments:** `STAGING` and `PRODUCTION`.
  - **Stable external IDs:** never changed, never reused.
  - **Anonymous players:** only `sessionRef` and `subjectRef`, with no linking across channels by default.
  - **Two callers:** the world's server, and the game on a player's device.

  [`SponsorX-INFINEX-World-Contract.md`](./SponsorX-INFINEX-World-Contract.md)
- **Reference:** Spec §33

### ✅ `4S0-PMO-02` · Agree the world and placement taxonomy

**Order** 2 · **PMO** · **Where:** Document · **3d** · **Done**

World, district, venue, zone, surface. Getting this vocabulary right once saves renaming an inventory model later.

- **Depends on:** 4S0-PMO-01
- **Done when:** Taxonomy documented and mapped to SponsorX entities
- **Delivered:** 2026-10-16, approved by the user.
  - **Five levels in three tables:** `VirtualWorld`, `VirtualZone` (district, venue, zone) and `VirtualPlacement` (surface).
  - **Seven placement kinds,** each with its specs, its capacity and a viewability rule.
  - **Mapped to SponsorX:** a world's owner is a `VIRTUAL` property; a surface for sale is an `InventoryItem` of kind `VIRTUAL_PLACEMENT`.

  [`SponsorX-Virtual-Taxonomy.md`](./SponsorX-Virtual-Taxonomy.md)
- **Reference:** Spec §25, §27.1

### ✅ `4S0-SEC-01` · Trusted client authentication design

**Order** 5 · **SEC** · **Where:** Code · **3d** · **Done**

The INFINEX client sends telemetry that becomes sponsor billing data. Its authentication has to be strong enough that fabricated events are not possible.

- **Depends on:** 4S0-PMO-01
- **Done when:** Client authentication and event signing design reviewed and approved
- **Delivered:** 2026-10-19 (merged in #259). The design was approved by the user as the plan, and is written in the API spec §6.2. It is also built:
  - **Servers:** a world's server swaps a BTG-issued machine credential for a 15-minute token.
  - **Games:** a game gets a 15-minute session from its server (a token for its own world, and a signing key derived and never stored), and signs over the raw bytes.
  - **Checked every call:** revoking takes effect on the next call.
  - **Roles:** `INFINEX_SERVICE` and `INFINEX_CLIENT` (RBAC §38). Scopes narrow and never widen; no protected field is readable.
  - **Test:** `infinex-auth.test.ts`.

  [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md) §6.2
- **Reference:** Spec §29, §31

## Sprint 1 · World & placement registry

*Map INFINEX worlds, zones and surfaces into SponsorX entities that can actually be sold.*

*4 tasks · 14 person-days*

### ✅ `4S1-BE-01` · World and zone registry

**Order** 6 · **BE** · **Where:** Code · **3d** · **Done**

Register INFINEX worlds and their districts, venues and zones against stable external IDs.

- **Depends on:** 4S0-PMO-02
- **Done when:** SponsorX can register a world and its zones against stable external IDs
- **Delivered:** 2026-10-16 (merged in #243).
  - **Worlds:** one per environment, under the owner's external ID, owned by a `VIRTUAL` property.
  - **Zones:** upserted in one call by external ID, all or nothing, under allowed parents.
  - **Fixed IDs:** the database refuses an ID change, a move or a delete.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §1
- **Reference:** Spec §28, §30

### ✅ `4S1-BE-02` · Virtual placement model

**Order** 7 · **BE** · **Where:** Code · **5d** · **Done**

Billboards, LED surfaces, naming rights, branded rooms, courts, tunnels, kiosks. Each with technical creative constraints, a viewability rule and capacity.

- **Depends on:** 4S1-BE-01
- **Done when:** A placement can be registered with specs, viewability rule and availability
- **Delivered:** 2026-10-16 (merged in #243).
  - **What a placement records:** its kind, size, creative types, file and video limits, capacity, viewability rule (a default per kind), price and dates, starting as a draft.
  - **Specs are fixed once on sale;** the test status stays `UNTESTED` until Phase 5.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §2
- **Reference:** Spec §30

### ✅ `4S1-BE-03` · Map placements to sellable inventory

**Order** 8 · **BE** · **Where:** Code · **3d** · **Done**

The join that makes virtual surfaces purchasable through the same campaign system as everything else.

- **Depends on:** 4S1-BE-02
- **Done when:** A virtual placement maps to a sellable SponsorX inventory record
- **Delivered:** 2026-10-16 (merged in #243).
  - **On sale:** a production draft goes on sale only when its world and zone are active and its owner is approved. It then becomes an `InventoryItem` of kind `VIRTUAL_PLACEMENT`, owned by the world's property, with one buyer per period.
  - **Kept in step:** price and date changes follow, and retiring switches the item off. The owner cannot edit or list it.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §3
- **Reference:** Spec §27.1

### ✅ `4S1-BE-04` · Placement availability windows

**Order** 9 · **BE** · **Where:** Code · **3d** · **Done**

Sellable time windows with capacity, so two sponsors cannot buy the same billboard for the same week.

- **Depends on:** 4S1-BE-02
- **Done when:** Overlapping purchases of the same placement are rejected
- **Delivered:** 2026-10-16 (merged in #244).
  - **What a window books:** an on-sale placement for whole UTC days, inside a draft campaign and its dates, at the weekly list price pro rata, in the first free capacity slot.
  - **The database refuses an overlapping booking** on the same placement and slot (`PlacementWindow_no_overlap`), so two sponsors racing get one booking and one 409.
  - **Giving days back:** a window is released while the campaign is a draft, and all of a campaign's windows are released when it is cancelled.
  - **Retiring:** a placement or world with bookings to come cannot be retired.
  - **A money fact since `4S7-BE-01`** (2026-10-19).

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §4
- **Reference:** Spec §30

## Sprint 2 · Manifest & creative deployment

*The service INFINEX asks: what should I be showing right now?*

*5 tasks · 19 person-days*

### ✅ `4S2-BE-01` · Creative deployment model

**Order** 13 · **BE** · **Where:** Code · **5d** · **Done**

Associate approved sponsor assets with placements, versioned, with start and end times.

- **Depends on:** 4S1-BE-03
- **Done when:** A deployment record ties campaign, placement, asset version and schedule
- **Delivered:** 2026-10-16 (merged in #250).
  - **What a deployment is:** a campaign's booked window, one validated creative version, and its dates inside the window. It goes DRAFT → APPROVED → ENDED, and approving checks everything again at that moment.
  - **One at a time:** the database refuses two approved deployments on the same window at the same time.
  - **Each change** bumps the deployment's sequence and the world's manifest version.
  - **A window given back** ends its deployments.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §6
- **Reference:** Spec §27.2, §30

### ✅ `4S2-BE-02` · Creative validation against placement specs

**Order** 14 · **BE** · **Where:** Code · **3d** · **Done**

Reject assets that do not fit the surface before they reach the world, not after a sponsor complains.

- **Depends on:** 4S2-BE-01
- **Done when:** An asset failing the placement's technical constraints is rejected at upload
- **Delivered:** 2026-10-16 (merged in #250).
  - **What is checked:** registering an upload checks it against the placement: its type, exactly its pixels, its size, and a video's length.
  - **What SponsorX reads itself:** the stored file's size, its checksum and, for an image, its real pixels and format. A video's pixels and length are as declared.
  - **A failing version** is REJECTED with every reason, with its file deleted, and can never be deployed.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §5
- **Reference:** Spec §27.2

### ✅ `4S2-BE-03` · Active manifest service

**Order** 15 · **BE** · **Where:** Code · **5d** · **Done**

The endpoint INFINEX calls to ask what is live right now. Must return only approved, in-window deployments for the requested world and time.

- **Depends on:** 4S2-BE-01
- **Done when:** Manifest returns only approved, in-window deployments for the requested world and time
- **Delivered:** 2026-10-16 (merged in #250).
  - **What it returns:** `GET /virtual/worlds/{id}/manifest?at=` lists only approved, in-date deployments on booked windows, on-sale placements and validated creative, in an active world.
  - **Versioned:** it carries the manifest version and an ETag (304 when nothing changed).
  - **Still to come:** the game's own login is 4S0-SEC-01. The download links came with 4S2-BE-04.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §7
- **Reference:** Spec §28, §34

### ✅ `4S2-BE-04` · Signed asset delivery through the CDN

**Order** 16 · **BE** · **Where:** Code · **3d** · **Done**

Creative is served fast and signed, so assets cannot be lifted from the URL.

- **Depends on:** 4S2-BE-03
- **Done when:** Creative is delivered through signed, short-lived CDN URLs
- **Delivered:** 2026-10-19 (merged in #255).
  - **The links:** each file in the manifest comes with `url`, signed to the private bucket on Cloudflare R2, and `urlExpiresAt`. A link lives 15 minutes and fetches only its own file.
  - **Stepped every 5 minutes:** every link handed out is good for at least 10, and a poll inside one step gets 304 with nothing signed.
  - **Audited:** one row per grant, naming the keys and never the links.
  - **Not edge-cached:** a caching layer is a separate task, only if the load test (4S8-OPS-01) needs one.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §7
- **Reference:** Spec §31

### ✅ `4S2-BE-05` · Deployment pause and rollback

**Order** 17 · **BE** · **Where:** Code · **3d** · **Done**

A sponsor needs their creative down in minutes, not at the next release. Pausing invalidates the manifest and the prior asset state.

- **Depends on:** 4S2-BE-03
- **Done when:** Creative can be paused or rolled back from SponsorX without redeploying the INFINEX application
- **Delivered:** 2026-10-19 (merged in #257).
  - **Pause and resume:** `POST /virtual/deployments/{id}/pause` takes a deployment off its world's manifest on the next poll (within 60 s), with a new manifest version and ETag. `…/resume` puts it back, checked again like an approval.
  - **Roll back:** `POST /virtual/windows/{id}/rollback` puts the previous validated version (or a named one) on the window from now to the old end, in one step.
  - **No new links:** none are handed out for a paused deployment; one already out lapses within 15 minutes (4S2-BE-04).
  - **Records:** each is audited and records when and why; the database holds that.
  - **Test:** `virtual-deployment-control.test.ts`.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §6.1
- **Reference:** Spec §27.2, §34

## Sprint 3 · INFINEX client endpoints

*SponsorX's side of the world's connection: who the world clients are, whether they are alive, and the settings they read. The game's side is Phase 5 (`5S1-INT-01`…`03`).*

*2 tasks · 3 person-days*

### ✅ `4S3-INT-02` · Client registry and heartbeat endpoint

**Order** 20 · **INT** · **Where:** Code · **2d** · **Done**

Trusted clients register with a key and report health, so you know when a world stops rendering sponsorship. SponsorX's side: the registry, the heartbeat endpoint and the missing-heartbeat alert, proven with the stand-in world. The game sending it is `5S1-INT-02`.

- **Depends on:** 4S2-BE-03
- **Done when:** A registered client's heartbeat is recorded and a missing heartbeat raises an alert (proven with the stand-in world)
- **Delivered:** 2026-10-19 (merged in #262).
  - **Registry:** a client is one game build for one world, registered and revoked by BTG or the world's server (`/infinex/clients`).
  - **Heartbeat:** `POST /infinex/heartbeat` comes from a game session (4S0-SEC-01). The latest beat and a count are kept on the client.
  - **Missing:** a build that reported and then goes quiet for 5 minutes is marked missing by the worker's minute sweep. The alert is an audit row and a line on the Integrations screen; the next heartbeat records the recovery.
  - **Stand-in world:** `npm run infinex:standin` calls SponsorX exactly as a world will (server token → game session → manifest → heartbeats). The tests drive it end to end.
  - **Test:** `infinex-clients.test.ts`.

  [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md) §4.2, §5.5
- **Reference:** Spec §28, §30

### ✅ `4S3-INT-03` · Client configuration endpoint

**Order** 21 · **INT** · **Where:** Code · **1d** · **Done**

Feature flags, telemetry limits and schema versions delivered to the client so behaviour can change without a client release. SponsorX's side: the endpoint and its limits; the game honouring them is `5S1-INT-03`.

- **Depends on:** 4S2-BE-03
- **Done when:** Config is served per client with its telemetry limits, and the stand-in world honours them
- **Delivered:** 2026-10-19 (merged in #263).
  - **What a game reads:** `GET /infinex/config` serves a game session its own build's config with an ETag: event versions, telemetry limits, manifest and heartbeat intervals, and flags.
  - **Where it comes from:** the reviewed defaults (`infinex-config@1.0.0`), plus BTG's override for that build, within fixed limits.
  - **Missing alert:** a build counts as missing after five of its own heartbeat intervals.
  - **Stand-in world:** it reads its config first and honours it, with heartbeats and manifest reads at the intervals it was given.
  - **Test:** `infinex-config.test.ts`.

  [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md) §4.2
- **Reference:** Spec §28

## Sprint 4 · Telemetry ingestion

*High-volume batch event intake that never double-counts.*

*3 tasks · 11 person-days*

### ✅ `4S4-BE-01` · Telemetry batch ingestion endpoint

**Order** 23 · **BE** · **Where:** Code · **5d** · **Done**

Batched events with service authentication. Validates schema, timestamp, placement-campaign relationship, signature and replay indicators.

- **Depends on:** 4S0-SEC-01
- **Done when:** Batch endpoint supports idempotent event IDs and rejects malformed or unauthorised events
- **Delivered:** 2026-10-19 (merged in #265).
  - **The endpoint:** `POST /infinex/telemetry` takes a game session's batch, signed over the raw bytes (4S0-SEC-01), within its build's limits (4S3-INT-03).
  - **Idempotent:** one row per (client, eventId); a resend is `duplicate`.
  - **Refused:** every malformed or unauthorised event, each with a named problem; the good ones are kept. An unsigned, tampered or stale batch, or one from a server or a person, stores nothing.
  - **Stand-in world:** it sends its batch exactly as a world will.
  - **Test:** `infinex-telemetry.test.ts`.

  [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md) §5.3
- **Reference:** Spec §28, §34

### ✅ `4S4-BE-02` · Event schema and versioning

**Order** 24 · **BE** · **Where:** Code · **3d** · **Done**

The shared contract: event_id, schema_version, event_type, occurred_at, world/zone/placement, session, dwell, interaction type. Versioned so client and server can evolve apart.

- **Depends on:** 4S4-BE-01
- **Done when:** Schema is versioned and a mismatched version is rejected with a clear error
- **Delivered:** 2026-10-19, with 4S4-BE-01 (merged in #265).
  - **Versioned:** the envelope plus each event type's data shape, as schema version 1 (`SCHEMAS[1]` in `infinex-telemetry.ts`). The supported versions come from the build's config.
  - **A mismatched version** is refused as `unsupported-schema-version`, naming the supported ones. An unknown type or bad data is refused with the field and the reason.
- **Reference:** Spec §29

### ✅ `4S4-DATA-01` · Raw event storage

**Order** 27 · **DATA** · **Where:** Code · **3d** · **Done**

Durable raw telemetry, kept separate from aggregates, so any number can be recomputed from source.

- **Depends on:** 4S4-BE-01
- **Done when:** Raw events are durably stored and aggregates are reproducible from them
- **Delivered:** 2026-10-19, with 4S4-BE-01 (merged in #265).
  - **Storage:** `VirtualEventRaw` holds every accepted event as sent (and every late one, quarantined), keyed (client, eventId).
  - **Never changed:** append-only in the database.
  - **Kept apart from aggregates.** The first aggregate (4S5-DATA-01) is computed from these rows, so it can always be recomputed.
- **Reference:** Spec §30

## Sprint 7 · Cross-channel reporting

*INFINEX alongside social, event and athlete inventory — without double counting.*

*1 task · 5 person-days*

### ✅ `4S7-BE-01` · Cross-channel campaign model extension

**Order** 38 · **BE** · **Where:** Code · **5d** · **Done**

One campaign holding real-world, social, athlete, reward and INFINEX inventory together.

- **Depends on:** 4S1-BE-03
- **Done when:** A single campaign can contain virtual and non-virtual inventory
- **Delivered:** 2026-10-19 (merged in #255).
  - **One campaign, all three:** athlete orders, NEXT ad slots and INFINEX placement windows sit on one campaign. A window now belongs to its campaign (a foreign key).
  - **Money:** a booking is a `PLACEMENT_WINDOW_BOOKED` fact (channel `INFINEX`), reversed when the days are given back. It counts once in the campaign's figures, the nightly fact check, the sponsor's spend and the sponsor report.
  - **Stages:** a campaign holding only INFINEX placements skips staffing, as an ad-only one does. One with athlete work is still staffed.
  - **Test:** `cross-channel-campaign.test.ts`.

  [`SponsorX-Virtual-Registry.md`](./SponsorX-Virtual-Registry.md) §4 · [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §4
- **Reference:** Spec §25

## Sprint 9 · Sign-off

*Phase 4 accepted as built, after its open work moved to Phase 5 (2026-10-20).*

*1 task · 1 person-days*

### ✅ `4S9-PMO-03` · Phase 4 acceptance record, as built

**Order** 52 · **PMO** · **Where:** Document · **1d** · **Done**

Raised 2026-10-20, when the game was parked and every open Phase 4 task moved to Phase 5 (the former UAT is `5S8-PMO-01`). It records Phase 4's criteria 1–4, each with the tasks, pull requests and tests that prove it.

- **Depends on:** 4S1-BE-04, 4S2-BE-03, 4S2-BE-05, 4S4-BE-01
- **Done when:** Phase 4's acceptance criteria 1–4 demonstrated and signed off
- **Delivered:** 2026-10-20.
  - **The evidence:** 75 of 75 Phase 4 tests pass against `08f10a6b`, with the stand-in world end to end; release `1b198d4b` is checked on staging.
  - **Signed off** by rcfworks with Rodney's delegated authority.

  [`SponsorX-Phase4-Acceptance-Signoff.md`](./SponsorX-Phase4-Acceptance-Signoff.md)
- **Reference:** Spec §34

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. SponsorX can register a world, zone and virtual placement and map the placement to sellable inventory.
2. Active campaign manifest returns only approved, in-window deployments for the requested world/time.
3. Creative can be paused or rolled back from SponsorX without redeploying the entire INFINEX application.
4. Telemetry batch endpoint supports idempotent event IDs and rejects malformed/unauthorized events.
*The former criteria 5–11 (viewability, de-duplication, activations, cross-channel, operations console, the sponsor's virtual report and the load test) moved to Phase 5 with their tasks on 2026-10-20 (Phase 5's criteria 7–13), and so did the two added that day for the admin screens and the emergency pause (Phase 5's 14–15). Phase 4 has no open task left.*

---

*Plan of record for Phase 4 · INFINEX World Integration. Daily tracking happens in `SponsorX-Full-Programme-Task-Board.xlsx`; published status lives in the Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/). See the workflow rule at the top of this file.*
