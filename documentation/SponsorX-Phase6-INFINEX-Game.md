# SponsorX — Phase 6 · INFINEX Game Integration

**BTG SPORTS GROUP · SPONSORX · PHASE 6 · INFINEX GAME INTEGRATION**

| | |
|---|---|
| **Goal** | Connect the INFINEX game to SponsorX: the game shows sponsors' creative on the right surfaces, reports its health and its viewing, and a real sponsor runs a pilot in a real world. |
| **Tasks** | 50 · 198 person-days |
| **Timeline** | Starts once the INFINEX game has a staging world |
| **Depends on** | **The INFINEX game** (not started as of 2026-10-16), and Phase 4's SponsorX side: the manifest (`4S2-BE-03`), the client endpoints (`4S3-INT-02`, `-03`) and the telemetry intake (`4S4-BE-01`). Since 2026-10-20 all of Phase 4's open work is here (Sprints 4–8) |
| **Source** | Split out of Phase 4 on 2026-10-16 (user); the tasks keep their Phases 2–4 Spec § references |

> **Why this phase exists (user, 2026-10-16).** The INFINEX game has not been started; the plan is SponsorX's web application first, then the game. Phase 4 builds SponsorX's side and proves it with a stand-in world, a script that calls SponsorX the way the game will. Every task that needs the real game moved here, renumbered. The rules the game must follow are Phase 4's world contract (`4S0-PMO-01`) and taxonomy (`4S0-PMO-02`), so the game is built to fit SponsorX.

### The six phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) | 47 | 18–22 weeks |
| 5 | [`SponsorX-Phase5-Certified-Recruiting.md`](./SponsorX-Phase5-Certified-Recruiting.md) | 1 | not in the blueprint |
| 6 | [`SponsorX-Phase6-INFINEX-Game.md`](./SponsorX-Phase6-INFINEX-Game.md) **← you are here** | 7 | after the game's staging world exists |

Tracking, task fields, categories and the overlap rules are the same as
Phase 4's ([`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)).
IDs are `6S{sprint}-{CAT}-{nn}`; each task names the Phase 4 ID it came from.

> **Renumbered 2026-10-27 (user).** This was Phase 5 until the Certified Recruiting partnership took
> Phase 5. Every ID moved from `5S…` to `6S…` with the same sprint, category and number
> (`5S1-INT-01` is now `6S1-INT-01`); the task board notes each one. Records signed before that
> date, such as the Phase 4 sign-off, keep the old IDs.

**One rule carries over unchanged.** No virtual impressions are reported to
sponsors as validated until viewability and de-duplication pass against the
pilot world's telemetry (`6S2-QA-01`).

| Phase 6 ID | Formerly |
|---|---|
| `6S1-INT-01` | `4S3-INT-01` |
| `6S1-INT-02` | the game half of `4S3-INT-02` |
| `6S1-INT-03` | the game half of `4S3-INT-03` |
| `6S1-QA-01` | `4S3-QA-01` |
| `6S2-QA-01` | `4S9-QA-01` |
| `6S2-PMO-01` | `4S9-PMO-01` |
| `6S2-PMO-02` | new: the real-sponsor pilot, formerly part of `4S9-PMO-02` |
| `6S4-PMO-01` | `4S0-PMO-03` (moved 2026-10-20: the game is parked) |
| `6S4-BE-01` | `4S4-BE-03` (moved 2026-10-20: the game is parked) |
| `6S4-OPS-01` | `4S4-OPS-01` (moved 2026-10-20: the game is parked) |
| `6S4-OPS-02` | `4S8-OPS-01` (moved 2026-10-20: the game is parked) |
| `6S5-BE-01` | `4S5-BE-01` (moved 2026-10-20: the game is parked) |
| `6S5-DATA-01` | `4S5-DATA-01` (moved 2026-10-20: the game is parked) |
| `6S5-DATA-02` | `4S5-DATA-02` (moved 2026-10-20: the game is parked) |
| `6S5-FE-01` | `4S5-FE-01` (moved 2026-10-20: the game is parked) |
| `6S5-BE-02` | `4S5-BE-02` (moved 2026-10-20: the game is parked) |
| `6S6-BE-01` | `4S6-BE-01` (moved 2026-10-20: the game is parked) |
| `6S6-BE-02` | `4S6-BE-02` (moved 2026-10-20: the game is parked) |
| `6S6-BE-03` | `4S6-BE-03` (moved 2026-10-20: the game is parked) |
| `6S6-INT-01` | `4S6-INT-01` (moved 2026-10-20: the game is parked) |
| `6S6-FE-01` | `4S6-FE-01` (moved 2026-10-20: the game is parked) |
| `6S7-DATA-01` | `4S7-DATA-01` (moved 2026-10-20: the game is parked) |
| `6S7-FE-01` | `4S7-FE-01` (moved 2026-10-20: the game is parked) |
| `6S7-FE-02` | `4S7-FE-02` (moved 2026-10-20: the game is parked) |
| `6S7-FE-03` | `4S7-FE-03` (moved 2026-10-20: the game is parked) |
| `6S7-FE-04` | `4S8-FE-01` (moved 2026-10-20: the game is parked) |
| `6S7-DATA-02` | `4S8-DATA-01` (moved 2026-10-20: the game is parked) |
| `6S8-ART-01` | `4S0-ART-01` (moved 2026-10-20: the game is parked) |
| `6S8-FE-01` | `4S1-FE-01` (moved 2026-10-20: the game is parked) |
| `6S8-FE-02` | `4S1-FE-02` (moved 2026-10-20: the game is parked) |
| `6S8-FE-03` | `4S1-FE-03` (moved 2026-10-20: the game is parked) |
| `6S8-FE-04` | `4S2-FE-01` (moved 2026-10-20: the game is parked) |
| `6S8-BE-01` | `4S8-BE-01` (moved 2026-10-20: the game is parked) |
| `6S8-BE-02` | `4S8-BE-02` (moved 2026-10-20: the game is parked) |
| `6S8-PMO-01` | `4S9-PMO-02` (moved 2026-10-20: the game is parked) |
| `6S8-OPS-01` | `4S9-OPS-01` (moved 2026-10-20: the game is parked) |

---

# The tasks

## Sprint 1 · Game connector

*The game side of the connection: read the manifest, show the right creative, report health, read settings, and test each surface in staging.*

*4 tasks · 10 person-days*

### ⏸ `6S1-INT-01` · INFINEX client manifest consumption

**Order** 1 · **INT** · **Where:** Code · **5d** · **Blocked**

Formerly `4S3-INT-01`. Inside the game: fetch the manifest, cache it sensibly, and render the right asset version.

- **Depends on:** the INFINEX game; 4S2-BE-03
- **Done when:** The INFINEX client renders a sponsored placement using the correct asset version
- **Reference:** Spec §34

### ⏸ `6S1-INT-02` · Game heartbeat

**Order** 2 · **INT** · **Where:** Code · **1d** · **Blocked**

The game half of `4S3-INT-02`: the game registers with its key and reports its health to SponsorX's heartbeat endpoint, so BTG knows when a world stops showing sponsorship.

- **Depends on:** 6S1-INT-01, 4S3-INT-02
- **Done when:** The game reports its heartbeat and SponsorX raises an alert when it stops
- **Reference:** Spec §28, §30

### ⏸ `6S1-INT-03` · Game reads its configuration

**Order** 3 · **INT** · **Where:** Code · **1d** · **Blocked**

The game half of `4S3-INT-03`: the game reads its feature flags, telemetry limits and schema versions from SponsorX, so its behaviour changes without a game release.

- **Depends on:** 6S1-INT-01, 4S3-INT-03
- **Done when:** The game reads its config remotely and honours telemetry limits
- **Reference:** Spec §28

### ⏸ `6S1-QA-01` · Staging world placement test

**Order** 4 · **QA** · **Where:** Code · **3d** · **Blocked**

Formerly `4S3-QA-01`. A placement is only AVAILABLE after it renders correctly in a staging world. Until this task, Phase 4's placements carry the test status "untested".

- **Depends on:** 6S1-INT-01
- **Done when:** Placement passes the staging test before it can be marked available
- **Reference:** Spec §27.1

## Sprint 2 · Pilot world

*One world, real sponsors, validated telemetry, calibrated pricing.*

*3 tasks · 11 person-days*

### ⏸ `6S2-QA-01` · Telemetry validation against the pilot world

**Order** 5 · **QA** · **Where:** Code · **5d** · **Blocked**

Formerly `4S9-QA-01`. Compare what the game emitted against what SponsorX recorded, event by event, in a real world. Until it passes, virtual impressions reach sponsors only labelled unvalidated.

- **Depends on:** 6S1-INT-01, 6S4-OPS-02
- **Done when:** Telemetry reconciles between client and server within defined tolerance
- **Reference:** Spec §33

### ⏸ `6S2-PMO-01` · Calibrate virtual pricing against real traffic

**Order** 6 · **PMO** · **Where:** Document · **3d** · **Blocked**

Formerly `4S9-PMO-01`. The pricing model (`6S5-BE-02`, formerly `4S5-BE-02`) was built on assumptions and stand-in traffic. Pilot traffic replaces them with measurements.

- **Depends on:** 6S2-QA-01
- **Done when:** Virtual rates recalibrated against observed traffic, viewability and dwell
- **Reference:** Spec §32

### ⏸ `6S2-PMO-02` · Pilot sponsor UAT

**Order** 7 · **PMO** · **Where:** Document · **3d** · **Blocked**

New on 2026-10-16: the real-sponsor pilot, formerly part of `4S9-PMO-02`. A real sponsor runs a real virtual activation in the pilot world and receives a real report.

- **Depends on:** 6S2-QA-01, 6S3-QA-01
- **Done when:** All 15 Phase 6 acceptance criteria demonstrated and signed off
- **Reference:** Spec §34

## Sprint 3 · Player accounts and live connection

*Added 2026-10-20 (user). A solid, industry-standard login and account creation for the game's players, and a live socket connection between the game and SponsorX. Login and registration run over HTTPS; the socket opens with the token a login issues.*

*14 tasks · 48 person-days*

> **What changes.** The world contract (`4S0-PMO-01`) says players are anonymous: only a pseudonymous `sessionRef` and `subjectRef`. Player accounts mean SponsorX (or a provider) holds player identity: an email, Google or Apple sign-in, and an authenticator. `6S3-PMO-01` records that decision and updates the contract before anything is built. No task waits on legal (standing rule).

### ⏸ `6S3-PMO-01` · Player identity decision

**Order** 8 · **PMO** · **Where:** Document · **2d** · **Blocked**

Who holds player accounts, what player data is kept and for how long, and the world contract updated from anonymous players to optional accounts.

**Candidates to weigh:**
- **WorkOS AuthKit:** email and password, Google, Apple, authenticator apps and brute-force protection, hosted.
- **A separate Clerk instance for players:** Clerk already serves SponsorX's staff and users. It would be kept apart from them.
- **Auth0.**
- **SponsorX's own accounts,** built on the standard protocols.

**What to compare:** cost at player scale, native game support (PKCE flows, no web views where avoidable), lockout and authenticator support out of the box, data location, and lock-in.

**If a provider is chosen:**
- **Its own record:** it gets an addendum in `.claude/stack-decision.md`.
- **The later tasks:** `6S3-BE-01`…`06` become setting it up and wiring it in, rather than building. Their "Done when" lines stay the same.

- **Depends on:** the INFINEX game; 4S0-PMO-01
- **Done when:** The provider is chosen with the comparison written down, the player data held and its retention are recorded, the world contract is updated, and any new vendor has its stack-decision addendum
- **Reference:** Spec §29

### ⏸ `6S3-PMO-02` · Real-time connection decision

**Order** 8.5 · **PMO** · **Where:** Document · **3d** · **Blocked**

How the live connection between the game and SponsorX is carried.

**Options to weigh:**
- **A plain WebSocket on SponsorX's API:** fan-out across servers through Postgres `LISTEN/NOTIFY`, with no new vendor.
- **SpacetimeDB:** a database with server modules that clients subscribe to over WebSocket, built for multiplayer games. It would also suit live game state, not only SponsorX's pushes.
- **A managed real-time service:** for example Ably or Pusher.

**What to compare:** latency, connections per server, cost at player scale, how it authenticates with the session or player token, and whether it fits the stack rules (the job queue stays in Postgres; Redis is cache and rate limiting only).

**Whatever is chosen** gets its addendum in `.claude/stack-decision.md` before `6S3-INT-03` is built.

- **Depends on:** the INFINEX game; 4S0-SEC-01
- **Done when:** The real-time option is chosen with the comparison written down, and any new vendor has its stack-decision addendum
- **Reference:** Spec §28, §31

### ⏸ `6S3-SEC-01` · Player authentication design

**Order** 9 · **SEC** · **Where:** Code · **3d** · **Blocked**

The design every later task builds to, checked against OWASP ASVS Level 2:
- **Sign-in from the game:** OAuth 2.0 / OpenID Connect, authorization code with PKCE, as native apps do (RFC 8252).
- **Tokens:** their lifetimes, with refresh tokens that rotate.
- **Passwords:** NIST SP 800-63B rules.
- **The rest:** the authenticator step, the lockout policy, and the error codes the game reads.

- **Depends on:** 6S3-PMO-01; 4S0-SEC-01
- **Done when:** The player authentication design is reviewed and approved
- **Reference:** Spec §29, §31

### ⏸ `6S3-BE-01` · Player registration with email

**Order** 10 · **BE** · **Where:** Code · **4d** · **Blocked**

- **Create an account:** with an email and a password.
- **Verify the email:** before full use.
- **Password rules:** a minimum length and a breached-password check, no forced complexity rules.
- **An email already registered** is answered without revealing whether the account exists.

- **Depends on:** 6S3-SEC-01
- **Done when:** A player creates an account with email and password, verifies the email, and a duplicate or weak password is refused without revealing existing accounts
- **Reference:** Spec §29

### ⏸ `6S3-BE-02` · Email login and the login error contract

**Order** 11 · **BE** · **Where:** Code · **3d** · **Blocked**

Email and password login. Every refusal comes back as a stable code the game can act on:
- `invalid-credentials`, the same answer whether or not the email exists;
- `account-locked`, with when it unlocks;
- `email-not-verified`;
- `mfa-required`;
- `account-disabled`;
- `rate-limited`, with a retry time.

- **Depends on:** 6S3-BE-01
- **Done when:** The game can tell an invalid login, a locked account, an unverified email and a required authenticator step apart from the server's response, and none of them reveals whether an account exists
- **Reference:** Spec §29

### ⏸ `6S3-BE-03` · Login lockout and throttling

**Order** 12 · **BE** · **Where:** Code · **3d** · **Blocked**

Brute-force protection:
- **Delays:** they grow per account and per device or IP.
- **Lock:** a temporary lock after repeated failures, which unlocks by time or through a link emailed to the owner.
- **The owner is told** when the account is locked.
- **Audited:** every lock and unlock.

- **Depends on:** 6S3-BE-02
- **Done when:** Repeated failed logins lock the account for a set time, the game shows when it unlocks, the owner can unlock by email, and every lock is audited
- **Reference:** Spec §29, §31

### ⏸ `6S3-INT-01` · Sign in with Google

**Order** 13 · **INT** · **Where:** Code + console · **3d** · **Blocked**

- **The protocol:** Google sign-in over OpenID Connect.
- **The account:** a new player gets one from Google's verified email; an existing player can link Google to their account.
- **The console step:** the Google Cloud client is set up in the sandbox project first.

- **Depends on:** 6S3-SEC-01, 6S3-BE-01
- **Done when:** A player signs up and signs in with Google, and can link Google to an existing account
- **Reference:** Spec §29

### ⏸ `6S3-INT-02` · Sign in with Apple

**Order** 14 · **INT** · **Where:** Code + console · **3d** · **Blocked**

Sign in with Apple, handling:
- Apple's private-relay email addresses;
- the name, which Apple sends only on the first sign-in;
- the App Store's requirement that an account made this way can be deleted in the app.

The Apple developer setup comes first.

- **Depends on:** 6S3-SEC-01, 6S3-BE-01
- **Done when:** A player signs up and signs in with Apple, including with a hidden (relay) email, and can link Apple to an existing account
- **Reference:** Spec §29

### ⏸ `6S3-BE-04` · Authenticator app two-step login

**Order** 15 · **BE** · **Where:** Code · **4d** · **Blocked**

A second step with an authenticator app (time-based codes, RFC 6238):
- **Enrol** by QR code, confirmed with a first code.
- **Recovery codes,** shown once.
- **Turning it off** needs a fresh sign-in.
- **Login:** answers `mfa-required` until the code is given.

- **Depends on:** 6S3-BE-02
- **Done when:** A player turns on an authenticator, every later login asks for its code, recovery codes work once each, and turning it off needs a fresh sign-in
- **Reference:** Spec §29, §31

### ⏸ `6S3-BE-05` · Account recovery, linking and deletion

**Order** 16 · **BE** · **Where:** Code · **4d** · **Blocked**

- **Password reset:** by a short-lived emailed link; it signs out every other device.
- **Linking:** add or remove Google or Apple, never the last way in.
- **Deletion:** the player deletes their account and its personal data from inside the game.

- **Depends on:** 6S3-BE-02, 6S3-INT-01, 6S3-INT-02
- **Done when:** A player resets a forgotten password, links and unlinks Google or Apple without locking themselves out, and deletes their account in the game
- **Reference:** Spec §29

### ⏸ `6S3-BE-06` · Player sessions and tokens

**Order** 17 · **BE** · **Where:** Code · **3d** · **Blocked**

- **Tokens:** short-lived access tokens, with refresh tokens that rotate on every use. A reused refresh token is treated as theft and ends the whole session.
- **Devices:** the player can see their devices, sign one out, or sign out everywhere.

- **Depends on:** 6S3-BE-02
- **Done when:** Access tokens are short-lived, refresh tokens rotate, a reused refresh token ends the session, and a player can sign out one device or all of them
- **Reference:** Spec §29, §31

### ⏸ `6S3-INT-03` · Game socket connection

**Order** 18 · **INT** · **Where:** Code · **5d** · **Blocked**

A live WebSocket between the game and SponsorX.
- **Opening it:** with the session token in the first message, never in the URL. It closes when the session expires or is revoked.
- **Keeping it alive:** ping and pong, and reconnecting with back-off.
- **What SponsorX pushes:**
  - the feed changed;
  - a pause or the emergency kill switch;
  - settings changed;
  - the session was revoked.
- **Carried by:** whatever `6S3-PMO-02` chooses. The default is a WebSocket on the API, with pushes fanned out across servers through Postgres `LISTEN/NOTIFY`, so Redis stays cache and rate limiting only. SpacetimeDB or a managed service would replace this part.
- **Fallback:** the game keeps polling if the socket drops.

- **Depends on:** 4S0-SEC-01, 6S3-PMO-02, 6S3-BE-06
- **Done when:** An authenticated game holds a live socket, receives a pause or feed change within seconds, reconnects on its own, falls back to polling, and an expired or revoked session is disconnected
- **Reference:** Spec §28, §34

### ⏸ `6S3-INT-04` · In-game sign-up and login

**Order** 19 · **INT** · **Where:** Code · **5d** · **Blocked**

The game's side:
- **Screens:** sign up, sign in with email, Google or Apple, and the authenticator step.
- **Refusals:** a clear message for each error code, including when a locked account unlocks.
- **Recovery:** the forgotten-password flow.
- **Afterwards:** the game opens its socket.

- **Depends on:** the INFINEX game; 6S3-BE-02, 6S3-BE-03, 6S3-BE-04, 6S3-INT-01, 6S3-INT-02, 6S3-INT-03
- **Done when:** A player signs up and signs in inside the game by each method, sees the right message for every refused login, and the game connects its socket after login
- **Reference:** Spec §29

### ⏸ `6S3-QA-01` · Authentication security test

**Order** 20 · **QA** · **Where:** Code · **3d** · **Blocked**

The player login tested against OWASP ASVS Level 2:
- brute force and credential stuffing;
- account enumeration;
- token theft and replay;
- getting past the authenticator step;
- the socket's authentication.

Every finding is fixed or recorded with its reason.

- **Depends on:** 6S3-INT-04
- **Done when:** Every check passes, or each open finding is recorded with its risk and its owner
- **Reference:** Spec §29, §31

## Sprint 4 · Telemetry at scale

*Volume, buffering, de-duplication and load: what the game's real traffic needs. Moved from Phase 4 on 2026-10-20: the game is parked.*

*4 tasks · 18 person-days*

### ⏸ `6S4-PMO-01` · Estimate telemetry volume and cost

**Order** 21 · **PMO** · **Where:** Document · **3d** · **Blocked**

Formerly `4S0-PMO-03` (moved 2026-10-20). Virtual worlds emit far more events than a QR code does. Size the ingestion, storage and warehouse cost before committing to an architecture.

- **Depends on:** 4S0-PMO-01
- **Done when:** Event volume estimated per concurrent user with an infrastructure cost model
- **Reference:** Spec §31, §38

### ⏸ `6S4-BE-01` · Idempotent de-duplication

**Order** 22 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S4-BE-03` (moved 2026-10-20). Clients retry. Networks duplicate. Duplicate telemetry must never inflate a sponsor's numbers — this is billing data.

- **Depends on:** 4S4-BE-01
- **Done when:** Repeated duplicate telemetry does not inflate sponsor reports
- **Reference:** Spec §34

### ⏸ `6S4-OPS-01` · Event streaming and buffering

**Order** 23 · **OPS** · **Where:** Vendor console · **5d** · **Blocked**

Formerly `4S4-OPS-01` (moved 2026-10-20). A queue in front of ingestion so a traffic burst in-world does not drop sponsorship data.

- **Depends on:** 4S4-BE-01
- **Done when:** Ingestion sustains the agreed burst rate with buffering and no event loss
- **Reference:** Spec §31, §38

### ⏸ `6S4-OPS-02` · Load test event ingestion and dashboards

**Order** 24 · **OPS** · **Where:** Code · **5d** · **Blocked**

Formerly `4S8-OPS-01` (moved 2026-10-20). Prove the throughput and dashboard latency targets hold at expected Phase 4 traffic, before a pilot world goes live.

- **Depends on:** 6S4-OPS-01
- **Done when:** Load test meets the agreed ingestion throughput and dashboard latency targets
- **Reference:** Spec §34

## Sprint 5 · Viewability, metrics and pricing

*Turn the game's renders into impressions a sponsor can be billed for honestly, and price placements from real traffic. Moved from Phase 4 on 2026-10-20: the game is parked.*

*5 tasks · 23 person-days*

### ⏸ `6S5-BE-01` · Viewability rule engine

**Order** 25 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S5-BE-01` (moved 2026-10-20). Versioned rules — minimum visible percentage and minimum dwell — decide which renders count as viewable impressions.

- **Depends on:** 4S4-DATA-01
- **Done when:** Viewable impressions are calculated per versioned rule and remain distinct from gross renders
- **Reference:** Spec §30, §34

### ⏸ `6S5-DATA-01` · Virtual metric aggregation job

**Order** 26 · **DATA** · **Where:** Code · **5d** · **Blocked**

Formerly `4S5-DATA-01` (moved 2026-10-20). Visits, gross impressions, viewable impressions, dwell, interactions, challenge metrics and session-level uniques.

- **Depends on:** 6S5-BE-01
- **Done when:** Aggregates compute on schedule and dashboards read aggregates, never raw telemetry
- **Reference:** Spec §27.3

### ⏸ `6S5-DATA-02` · World traffic benchmarks

**Order** 27 · **DATA** · **Where:** Code · **3d** · **Blocked**

Formerly `4S5-DATA-02` (moved 2026-10-20). Baseline visits, dwell and interaction rates per world and zone — the inputs to virtual pricing.

- **Depends on:** 6S5-DATA-01
- **Done when:** Traffic benchmarks compute per world and zone
- **Reference:** Spec §30, §32

### ⏸ `6S5-FE-01` · Build the virtual metrics dashboard

**Order** 28 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S5-FE-01` (moved 2026-10-20). Visits, impressions, viewable impressions, dwell, interactions, completion and the reward funnel.

- **Depends on:** 6S5-DATA-01
- **Done when:** Dashboard renders virtual delivery with gross and viewable clearly separated
- **Reference:** Spec §26 P4-07

### ⏸ `6S5-BE-02` · Virtual pricing model

**Order** 29 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S5-BE-02` (moved 2026-10-20). Rules-based and transparent first: base rate × traffic × viewability × dwell × scarcity × exclusivity × seasonality × integration depth.

- **Depends on:** 6S5-DATA-02
- **Done when:** A virtual placement produces a recommended rate with its factor breakdown visible
- **Reference:** Spec §32

## Sprint 6 · In-world activations and rewards

*Challenges inside the game that start, complete and pay a SponsorX reward exactly once. Moved from Phase 4 on 2026-10-20: the game is parked.*

*5 tasks · 23 person-days*

### ⏸ `6S6-BE-01` · Activation definition model

**Order** 30 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S6-BE-01` (moved 2026-10-20). Challenges, quests, scavenger hunts, skill tests, product discovery and sponsor booths, with start conditions, completion criteria and reward triggers.

- **Depends on:** 4S2-BE-01
- **Done when:** An activation can be defined with rules, completion criteria and a linked reward
- **Reference:** Spec §30

### ⏸ `6S6-BE-02` · Activation start and complete flow

**Order** 31 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S6-BE-02` (moved 2026-10-20). Validate completion against activation, session and user constraints before anything is awarded.

- **Depends on:** 6S6-BE-01
- **Done when:** Activation can start and complete, validated against its eligibility rules
- **Reference:** Spec §27.4

### ⏸ `6S6-BE-03` · Reward trigger with exactly-once guarantee

**Order** 32 · **BE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S6-BE-03` (moved 2026-10-20). The in-world equivalent of Phase 1's single-use QR redemption, and it needs the same database-level guarantee rather than application logic.

- **Depends on:** 6S6-BE-02
- **Done when:** An activation triggers a SponsorX reward exactly once per configured eligibility rule
- **Reference:** Spec §34

### ⏸ `6S6-INT-01` · Wire in-world rewards to the wallet service

**Order** 33 · **INT** · **Where:** Code · **3d** · **Blocked**

Formerly `4S6-INT-01` (moved 2026-10-20). Completion produces a claim token and deep link; the fan receives it in-world and optionally by wallet, SMS or email.

- **Depends on:** 6S6-BE-03
- **Done when:** A completed activation delivers a reward through the existing reward and wallet services
- **Reference:** Spec §27.4

### ⏸ `6S6-FE-01` · Build the activation builder

**Order** 34 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S6-FE-01` (moved 2026-10-20). Challenge rules, start condition, completion criteria, reward trigger and sponsor content.

- **Depends on:** 6S8-ART-01
- **Done when:** A campaign manager can build and publish an activation without engineering help
- **Reference:** Spec §26 P4-06

## Sprint 7 · Game reporting and operations

*The game's numbers beside every other channel, the sponsor's activation report, the heatmap, the INFINEX ops console and fraud checks. Moved from Phase 4 on 2026-10-20: the game is parked.*

*6 tasks · 30 person-days*

### ⏸ `6S7-DATA-01` · Cross-channel aggregation without double counting

**Order** 35 · **DATA** · **Where:** Code · **5d** · **Blocked**

Formerly `4S7-DATA-01` (moved 2026-10-20). The hard part. A fan who scans a QR and completes an in-world challenge is one person, and must not be counted twice.

- **Depends on:** 4S7-BE-01
- **Done when:** Cross-channel dashboard shows INFINEX metrics alongside other channels without double counting
- **Reference:** Spec §34

### ⏸ `6S7-FE-01` · Build the cross-channel campaign dashboard

**Order** 36 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S7-FE-01` (moved 2026-10-20). Compare INFINEX against social, streaming, event and athlete inventory in one view.

- **Depends on:** 6S7-DATA-01
- **Done when:** Dashboard compares all channels on consistent metrics
- **Reference:** Spec §26 P4-08

### ⏸ `6S7-FE-02` · Build the sponsor activation report

**Order** 37 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S7-FE-02` (moved 2026-10-20). Virtual activation summary with content, engagement, rewards, screenshots and proofs, and recommended next actions.

- **Depends on:** 6S5-FE-01
- **Done when:** A pilot sponsor receives a report with virtual delivery, interaction, reward funnel and creative proof
- **Reference:** Spec §26 P4-11, §34

### ⏸ `6S7-FE-03` · Build the world heatmap and zone insights

**Order** 38 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S7-FE-03` (moved 2026-10-20). Aggregated zone traffic and engagement, where INFINEX telemetry supports it.

- **Depends on:** 6S5-DATA-02
- **Done when:** Heatmap renders zone-level traffic and engagement
- **Reference:** Spec §26 P4-12

### ⏸ `6S7-FE-04` · Build the INFINEX operations console

**Order** 39 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S8-FE-01` (moved 2026-10-20). Health, event lag, placement failures, creative mismatch, kill switch and incident log.

- **Depends on:** 4S3-INT-02
- **Done when:** Console displays event lag, client heartbeat, deployment failures and active incidents
- **Reference:** Spec §26 P4-09, §34

### ⏸ `6S7-DATA-02` · Virtual fraud and anomaly checks

**Order** 40 · **DATA** · **Where:** Code · **5d** · **Blocked**

Formerly `4S8-DATA-01` (moved 2026-10-20). Invalid or suspicious event patterns flagged before they reach a sponsor report — this is Phase 3's anomaly work applied to telemetry.

- **Depends on:** 6S4-BE-01
- **Done when:** Suspicious event patterns are flagged and excluded from sponsor-facing aggregates
- **Reference:** Spec §27.3

## Sprint 8 · Virtual inventory screens, controls and launch

*SponsorX's screens and controls for virtual inventory (the world registry, placement manager and preview, the creative deployment console), the emergency pause and incident log, and the UAT and production rollout. Moved from Phase 4 on 2026-10-20: everything they manage lives in the game.*

*9 tasks · 35 person-days*

### ⏸ `6S8-ART-01` · Design the virtual admin and sponsor screens

**Order** 41 · **ART** · **Where:** Design tool · **5d** · **Blocked**

Formerly `4S0-ART-01` (moved 2026-10-20). Twelve new screens including placement preview metadata, activation builder and the world heatmap. Placement specs need a designer who understands 3D constraints.

- **Depends on:** 4S0-PMO-02
- **Done when:** All 12 Phase 4 screens designed, with creative technical constraints specified per placement type
- **Reference:** Spec §26

### ⏸ `6S8-FE-01` · Build the world registry screen

**Order** 42 · **FE** · **Where:** Code · **3d** · **Blocked**

Formerly `4S1-FE-01` (moved 2026-10-20). Worlds, districts, venues, zones, environment IDs and operational status.

- **Depends on:** 6S8-ART-01
- **Done when:** Admin can register and manage worlds and zones
- **Reference:** Spec §26 P4-01

### ⏸ `6S8-FE-02` · Build the placement manager

**Order** 43 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S1-FE-02` (moved 2026-10-20). Placement IDs, dimensions and type, zone, viewability rules, dates and pricing.

- **Depends on:** 4S1-BE-02
- **Done when:** Admin can create, configure and price placements
- **Reference:** Spec §26 P4-02

### ⏸ `6S8-FE-03` · Build placement preview metadata

**Order** 44 · **FE** · **Where:** Code · **3d** · **Blocked**

Formerly `4S1-FE-03` (moved 2026-10-20). Thumbnail, orientation, allowed creative types, technical constraints and placement test status — so a sponsor knows what they are buying.

- **Depends on:** 4S1-BE-02
- **Done when:** Preview metadata renders and shows the placement's staging test status
- **Reference:** Spec §26 P4-03

### ⏸ `6S8-FE-04` · Build the creative deployment console

**Order** 45 · **FE** · **Where:** Code · **5d** · **Blocked**

Formerly `4S2-FE-01` (moved 2026-10-20). Assign creative version, approve, schedule, publish and roll back.

- **Depends on:** 6S8-ART-01
- **Done when:** Staff can run the full deployment lifecycle from the console
- **Reference:** Spec §26 P4-05

### ⏸ `6S8-BE-01` · Emergency pause and kill switch

**Order** 46 · **BE** · **Where:** Code · **3d** · **Blocked**

Formerly `4S8-BE-01` (moved 2026-10-20). One control that takes a sponsor's creative down across every world immediately. You will need it on a Friday evening.

- **Depends on:** 4S2-BE-05
- **Done when:** Emergency pause removes creative from all worlds within the agreed time target
- **Reference:** Spec §28

### ⏸ `6S8-BE-02` · Deployment incident log

**Order** 47 · **BE** · **Where:** Code · **3d** · **Blocked**

Formerly `4S8-BE-02` (moved 2026-10-20). Type, severity, opened and closed times, notes. Ops history a sponsor can be shown.

- **Depends on:** 6S8-BE-01
- **Done when:** Incidents are logged, tracked and closable with notes
- **Reference:** Spec §30

### ⏸ `6S8-PMO-01` · Phase 4 UAT

**Order** 48 · **PMO** · **Where:** Document · **5d** · **Blocked**

Formerly `4S9-PMO-02` (moved 2026-10-20). The web application walked end to end: BTG registers a world and its placements, sells a placement into a campaign, deploys, pauses and rolls back creative, and uses the emergency pause, all from SponsorX's screens. Moved with the rest of Phase 4's open work on 2026-10-20: everything it manages lives in the game.

- **Depends on:** 6S8-FE-01, 6S8-FE-02, 6S8-FE-03, 6S8-FE-04, 6S8-BE-02
- **Done when:** Phase 6 criteria 14 and 15 demonstrated and signed off
- **Reference:** Spec §34

### ⏸ `6S8-OPS-01` · Production rollout and incident readiness

**Order** 49 · **OPS** · **Where:** Vendor console · **3d** · **Blocked**

Formerly `4S9-OPS-01` (moved 2026-10-20). Streaming, observability, scaling and an on-call path before the first paying virtual sponsor.

- **Depends on:** 6S8-PMO-01
- **Done when:** Production rollout complete with monitoring, alerting and an incident runbook
- **Reference:** Spec §31, §38

---

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. The INFINEX client renders a sponsored placement using the correct asset/version *(formerly Phase 4 criterion 3)*.
2. The game reports its heartbeat, a missing heartbeat raises an alert, and the game honours the telemetry limits it reads from SponsorX.
3. A placement passes the staging world test before it can be marked available.
4. Telemetry reconciles between the game and SponsorX within the defined tolerance, and only then are virtual impressions shown to sponsors as validated.
5. A pilot sponsor receives a report with virtual delivery, interaction, reward funnel and proof/creative summary from the real pilot world, at rates recalibrated against its traffic.
6. *(Added 2026-10-20.)* The login works and holds up:
   - a player registers and signs in with email, Google or Apple, with an authenticator step when it is turned on;
   - the game shows the server's reason for every refused login;
   - repeated failures lock the account;
   - the game holds a live, authenticated socket that receives a pause or a feed change within seconds.
7. Viewable impressions are calculated according to versioned viewability rules and remain distinct from gross renders *(formerly Phase 4 criterion 5)*.
8. Repeated duplicate telemetry does not inflate sponsor reports *(formerly Phase 4 criterion 6)*.
9. An interactive activation can start, complete and trigger a SponsorX reward exactly once per configured eligibility rule *(formerly Phase 4 criterion 7)*.
10. The cross-channel dashboard shows INFINEX metrics alongside non-virtual campaign metrics without double counting *(formerly Phase 4 criterion 8)*.
11. The operations console displays event lag, client heartbeat, deployment failures and active incidents *(formerly Phase 4 criterion 9)*.
12. A sponsor receives a report containing virtual delivery, interaction, reward funnel and proof/creative summary *(formerly Phase 4 criterion 10)*.
13. The load test meets the agreed event-ingestion throughput and dashboard latency targets *(formerly Phase 4 criterion 11)*.
14. BTG registers worlds and placements, books them into campaigns and deploys, pauses and rolls back creative from SponsorX's screens *(added to Phase 4 on 2026-10-20, moved the same day)*.
15. An emergency pause takes every affected creative off its world's manifest at once, and each one is recorded as an incident *(added to Phase 4 on 2026-10-20, moved the same day)*.

---

*Plan of record for Phase 6 · INFINEX Game Integration. Daily tracking happens in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (sheet `Phase 6`).*
