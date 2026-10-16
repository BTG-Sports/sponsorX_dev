# SponsorX — Phase 5 · INFINEX Game Integration

**BTG SPORTS GROUP · SPONSORX · PHASE 5 · INFINEX GAME INTEGRATION**

| | |
|---|---|
| **Goal** | Connect the INFINEX game to SponsorX: the game shows sponsors' creative on the right surfaces, reports its health and its viewing, and a real sponsor runs a pilot in a real world. |
| **Tasks** | 7 · 21 person-days |
| **Timeline** | Starts once the INFINEX game has a staging world |
| **Depends on** | **The INFINEX game** (not started as of 2026-10-16), and Phase 4's SponsorX side: the manifest (`4S2-BE-03`), the client endpoints (`4S3-INT-02`, `-03`), telemetry intake (`4S4-*`) and the load test (`4S8-OPS-01`) |
| **Source** | Split out of Phase 4 on 2026-10-16 (user); the tasks keep their Phases 2–4 Spec § references |

> **Why this phase exists (user, 2026-10-16).** The INFINEX game has not been started; the plan is SponsorX's web application first, then the game. Phase 4 builds SponsorX's side and proves it with a stand-in world, a script that calls SponsorX the way the game will. Every task that needs the real game moved here, renumbered. The rules the game must follow are Phase 4's world contract (`4S0-PMO-01`) and taxonomy (`4S0-PMO-02`), so the game is built to fit SponsorX.

### The five phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) | 47 | 18–22 weeks |
| 5 | [`SponsorX-Phase5-INFINEX-Game.md`](./SponsorX-Phase5-INFINEX-Game.md) **← you are here** | 7 | after the game's staging world exists |

Tracking, task fields, categories and the overlap rules are the same as
Phase 4's ([`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)).
IDs are `5S{sprint}-{CAT}-{nn}`; each task names the Phase 4 ID it came from.

**One rule carries over unchanged.** No virtual impressions are reported to
sponsors as validated until viewability and de-duplication pass against the
pilot world's telemetry (`5S2-QA-01`).

| Phase 5 ID | Formerly |
|---|---|
| `5S1-INT-01` | `4S3-INT-01` |
| `5S1-INT-02` | the game half of `4S3-INT-02` |
| `5S1-INT-03` | the game half of `4S3-INT-03` |
| `5S1-QA-01` | `4S3-QA-01` |
| `5S2-QA-01` | `4S9-QA-01` |
| `5S2-PMO-01` | `4S9-PMO-01` |
| `5S2-PMO-02` | new: the real-sponsor pilot, formerly part of `4S9-PMO-02` |

---

# The tasks

## Sprint 1 · Game connector

*The game side of the connection: read the manifest, show the right creative, report health, read settings, and test each surface in staging.*

*4 tasks · 10 person-days*

### ⏸ `5S1-INT-01` · INFINEX client manifest consumption

**Order** 1 · **INT** · **Where:** Code · **5d** · **Blocked**

Formerly `4S3-INT-01`. Inside the game: fetch the manifest, cache it sensibly, and render the right asset version.

- **Depends on:** the INFINEX game; 4S2-BE-03
- **Done when:** The INFINEX client renders a sponsored placement using the correct asset version
- **Reference:** Spec §34

### ⏸ `5S1-INT-02` · Game heartbeat

**Order** 2 · **INT** · **Where:** Code · **1d** · **Blocked**

The game half of `4S3-INT-02`: the game registers with its key and reports its health to SponsorX's heartbeat endpoint, so BTG knows when a world stops showing sponsorship.

- **Depends on:** 5S1-INT-01, 4S3-INT-02
- **Done when:** The game reports its heartbeat and SponsorX raises an alert when it stops
- **Reference:** Spec §28, §30

### ⏸ `5S1-INT-03` · Game reads its configuration

**Order** 3 · **INT** · **Where:** Code · **1d** · **Blocked**

The game half of `4S3-INT-03`: the game reads its feature flags, telemetry limits and schema versions from SponsorX, so its behaviour changes without a game release.

- **Depends on:** 5S1-INT-01, 4S3-INT-03
- **Done when:** The game reads its config remotely and honours telemetry limits
- **Reference:** Spec §28

### ⏸ `5S1-QA-01` · Staging world placement test

**Order** 4 · **QA** · **Where:** Code · **3d** · **Blocked**

Formerly `4S3-QA-01`. A placement is only AVAILABLE after it renders correctly in a staging world. Until this task, Phase 4's placements carry the test status "untested".

- **Depends on:** 5S1-INT-01
- **Done when:** Placement passes the staging test before it can be marked available
- **Reference:** Spec §27.1

## Sprint 2 · Pilot world

*One world, real sponsors, validated telemetry, calibrated pricing.*

*3 tasks · 11 person-days*

### ⏸ `5S2-QA-01` · Telemetry validation against the pilot world

**Order** 5 · **QA** · **Where:** Code · **5d** · **Blocked**

Formerly `4S9-QA-01`. Compare what the game emitted against what SponsorX recorded, event by event, in a real world. Until it passes, virtual impressions reach sponsors only labelled unvalidated.

- **Depends on:** 5S1-INT-01, 4S8-OPS-01
- **Done when:** Telemetry reconciles between client and server within defined tolerance
- **Reference:** Spec §33

### ⏸ `5S2-PMO-01` · Calibrate virtual pricing against real traffic

**Order** 6 · **PMO** · **Where:** Document · **3d** · **Blocked**

Formerly `4S9-PMO-01`. The pricing model (`4S5-BE-02`) was built on assumptions and stand-in traffic. Pilot traffic replaces them with measurements.

- **Depends on:** 5S2-QA-01
- **Done when:** Virtual rates recalibrated against observed traffic, viewability and dwell
- **Reference:** Spec §32

### ⏸ `5S2-PMO-02` · Pilot sponsor UAT

**Order** 7 · **PMO** · **Where:** Document · **3d** · **Blocked**

New on 2026-10-16: the real-sponsor pilot, formerly part of `4S9-PMO-02`. A real sponsor runs a real virtual activation in the pilot world and receives a real report.

- **Depends on:** 5S2-QA-01
- **Done when:** All 5 Phase 5 acceptance criteria demonstrated and signed off
- **Reference:** Spec §34

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. The INFINEX client renders a sponsored placement using the correct asset/version *(formerly Phase 4 criterion 3)*.
2. The game reports its heartbeat, a missing heartbeat raises an alert, and the game honours the telemetry limits it reads from SponsorX.
3. A placement passes the staging world test before it can be marked available.
4. Telemetry reconciles between the game and SponsorX within the defined tolerance, and only then are virtual impressions shown to sponsors as validated.
5. A pilot sponsor receives a report with virtual delivery, interaction, reward funnel and proof/creative summary from the real pilot world, at rates recalibrated against its traffic.

---

*Plan of record for Phase 5 · INFINEX Game Integration. Daily tracking happens in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (sheet `Phase 5`).*
