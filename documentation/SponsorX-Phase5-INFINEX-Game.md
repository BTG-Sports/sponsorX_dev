# SponsorX — Phase 5 · INFINEX Game Integration

**BTG SPORTS GROUP · SPONSORX · PHASE 5 · INFINEX GAME INTEGRATION**

| | |
|---|---|
| **Goal** | Connect the INFINEX game to SponsorX: the game shows sponsors' creative on the right surfaces, reports its health and its viewing, and a real sponsor runs a pilot in a real world. |
| **Tasks** | 21 · 69 person-days |
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

- **Depends on:** 5S2-QA-01, 5S3-QA-01
- **Done when:** All 6 Phase 5 acceptance criteria demonstrated and signed off
- **Reference:** Spec §34

## Sprint 3 · Player accounts and live connection

*Added 2026-10-20 (user). A solid, industry-standard login and account creation for the game's players, and a live socket connection between the game and SponsorX. Login and registration run over HTTPS; the socket opens with the token a login issues.*

*14 tasks · 48 person-days*

> **What changes.** The world contract (`4S0-PMO-01`) says players are anonymous: only a pseudonymous `sessionRef` and `subjectRef`. Player accounts mean SponsorX (or a provider) holds player identity: an email, Google or Apple sign-in, and an authenticator. `5S3-PMO-01` records that decision and updates the contract before anything is built. No task waits on legal (standing rule).

### ⏸ `5S3-PMO-01` · Player identity decision

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
- **The later tasks:** `5S3-BE-01`…`06` become setting it up and wiring it in, rather than building. Their "Done when" lines stay the same.

- **Depends on:** the INFINEX game; 4S0-PMO-01
- **Done when:** The provider is chosen with the comparison written down, the player data held and its retention are recorded, the world contract is updated, and any new vendor has its stack-decision addendum
- **Reference:** Spec §29

### ⏸ `5S3-PMO-02` · Real-time connection decision

**Order** 8.5 · **PMO** · **Where:** Document · **3d** · **Blocked**

How the live connection between the game and SponsorX is carried.

**Options to weigh:**
- **A plain WebSocket on SponsorX's API:** fan-out across servers through Postgres `LISTEN/NOTIFY`, with no new vendor.
- **SpacetimeDB:** a database with server modules that clients subscribe to over WebSocket, built for multiplayer games. It would also suit live game state, not only SponsorX's pushes.
- **A managed real-time service:** for example Ably or Pusher.

**What to compare:** latency, connections per server, cost at player scale, how it authenticates with the session or player token, and whether it fits the stack rules (the job queue stays in Postgres; Redis is cache and rate limiting only).

**Whatever is chosen** gets its addendum in `.claude/stack-decision.md` before `5S3-INT-03` is built.

- **Depends on:** the INFINEX game; 4S0-SEC-01
- **Done when:** The real-time option is chosen with the comparison written down, and any new vendor has its stack-decision addendum
- **Reference:** Spec §28, §31

### ⏸ `5S3-SEC-01` · Player authentication design

**Order** 9 · **SEC** · **Where:** Code · **3d** · **Blocked**

The design every later task builds to, checked against OWASP ASVS Level 2:
- **Sign-in from the game:** OAuth 2.0 / OpenID Connect, authorization code with PKCE, as native apps do (RFC 8252).
- **Tokens:** their lifetimes, with refresh tokens that rotate.
- **Passwords:** NIST SP 800-63B rules.
- **The rest:** the authenticator step, the lockout policy, and the error codes the game reads.

- **Depends on:** 5S3-PMO-01; 4S0-SEC-01
- **Done when:** The player authentication design is reviewed and approved
- **Reference:** Spec §29, §31

### ⏸ `5S3-BE-01` · Player registration with email

**Order** 10 · **BE** · **Where:** Code · **4d** · **Blocked**

- **Create an account:** with an email and a password.
- **Verify the email:** before full use.
- **Password rules:** a minimum length and a breached-password check, no forced complexity rules.
- **An email already registered** is answered without revealing whether the account exists.

- **Depends on:** 5S3-SEC-01
- **Done when:** A player creates an account with email and password, verifies the email, and a duplicate or weak password is refused without revealing existing accounts
- **Reference:** Spec §29

### ⏸ `5S3-BE-02` · Email login and the login error contract

**Order** 11 · **BE** · **Where:** Code · **3d** · **Blocked**

Email and password login. Every refusal comes back as a stable code the game can act on:
- `invalid-credentials`, the same answer whether or not the email exists;
- `account-locked`, with when it unlocks;
- `email-not-verified`;
- `mfa-required`;
- `account-disabled`;
- `rate-limited`, with a retry time.

- **Depends on:** 5S3-BE-01
- **Done when:** The game can tell an invalid login, a locked account, an unverified email and a required authenticator step apart from the server's response, and none of them reveals whether an account exists
- **Reference:** Spec §29

### ⏸ `5S3-BE-03` · Login lockout and throttling

**Order** 12 · **BE** · **Where:** Code · **3d** · **Blocked**

Brute-force protection:
- **Delays:** they grow per account and per device or IP.
- **Lock:** a temporary lock after repeated failures, which unlocks by time or through a link emailed to the owner.
- **The owner is told** when the account is locked.
- **Audited:** every lock and unlock.

- **Depends on:** 5S3-BE-02
- **Done when:** Repeated failed logins lock the account for a set time, the game shows when it unlocks, the owner can unlock by email, and every lock is audited
- **Reference:** Spec §29, §31

### ⏸ `5S3-INT-01` · Sign in with Google

**Order** 13 · **INT** · **Where:** Code + console · **3d** · **Blocked**

- **The protocol:** Google sign-in over OpenID Connect.
- **The account:** a new player gets one from Google's verified email; an existing player can link Google to their account.
- **The console step:** the Google Cloud client is set up in the sandbox project first.

- **Depends on:** 5S3-SEC-01, 5S3-BE-01
- **Done when:** A player signs up and signs in with Google, and can link Google to an existing account
- **Reference:** Spec §29

### ⏸ `5S3-INT-02` · Sign in with Apple

**Order** 14 · **INT** · **Where:** Code + console · **3d** · **Blocked**

Sign in with Apple, handling:
- Apple's private-relay email addresses;
- the name, which Apple sends only on the first sign-in;
- the App Store's requirement that an account made this way can be deleted in the app.

The Apple developer setup comes first.

- **Depends on:** 5S3-SEC-01, 5S3-BE-01
- **Done when:** A player signs up and signs in with Apple, including with a hidden (relay) email, and can link Apple to an existing account
- **Reference:** Spec §29

### ⏸ `5S3-BE-04` · Authenticator app two-step login

**Order** 15 · **BE** · **Where:** Code · **4d** · **Blocked**

A second step with an authenticator app (time-based codes, RFC 6238):
- **Enrol** by QR code, confirmed with a first code.
- **Recovery codes,** shown once.
- **Turning it off** needs a fresh sign-in.
- **Login:** answers `mfa-required` until the code is given.

- **Depends on:** 5S3-BE-02
- **Done when:** A player turns on an authenticator, every later login asks for its code, recovery codes work once each, and turning it off needs a fresh sign-in
- **Reference:** Spec §29, §31

### ⏸ `5S3-BE-05` · Account recovery, linking and deletion

**Order** 16 · **BE** · **Where:** Code · **4d** · **Blocked**

- **Password reset:** by a short-lived emailed link; it signs out every other device.
- **Linking:** add or remove Google or Apple, never the last way in.
- **Deletion:** the player deletes their account and its personal data from inside the game.

- **Depends on:** 5S3-BE-02, 5S3-INT-01, 5S3-INT-02
- **Done when:** A player resets a forgotten password, links and unlinks Google or Apple without locking themselves out, and deletes their account in the game
- **Reference:** Spec §29

### ⏸ `5S3-BE-06` · Player sessions and tokens

**Order** 17 · **BE** · **Where:** Code · **3d** · **Blocked**

- **Tokens:** short-lived access tokens, with refresh tokens that rotate on every use. A reused refresh token is treated as theft and ends the whole session.
- **Devices:** the player can see their devices, sign one out, or sign out everywhere.

- **Depends on:** 5S3-BE-02
- **Done when:** Access tokens are short-lived, refresh tokens rotate, a reused refresh token ends the session, and a player can sign out one device or all of them
- **Reference:** Spec §29, §31

### ⏸ `5S3-INT-03` · Game socket connection

**Order** 18 · **INT** · **Where:** Code · **5d** · **Blocked**

A live WebSocket between the game and SponsorX.
- **Opening it:** with the session token in the first message, never in the URL. It closes when the session expires or is revoked.
- **Keeping it alive:** ping and pong, and reconnecting with back-off.
- **What SponsorX pushes:**
  - the feed changed;
  - a pause or the emergency kill switch;
  - settings changed;
  - the session was revoked.
- **Carried by:** whatever `5S3-PMO-02` chooses. The default is a WebSocket on the API, with pushes fanned out across servers through Postgres `LISTEN/NOTIFY`, so Redis stays cache and rate limiting only. SpacetimeDB or a managed service would replace this part.
- **Fallback:** the game keeps polling if the socket drops.

- **Depends on:** 4S0-SEC-01, 5S3-PMO-02, 5S3-BE-06
- **Done when:** An authenticated game holds a live socket, receives a pause or feed change within seconds, reconnects on its own, falls back to polling, and an expired or revoked session is disconnected
- **Reference:** Spec §28, §34

### ⏸ `5S3-INT-04` · In-game sign-up and login

**Order** 19 · **INT** · **Where:** Code · **5d** · **Blocked**

The game's side:
- **Screens:** sign up, sign in with email, Google or Apple, and the authenticator step.
- **Refusals:** a clear message for each error code, including when a locked account unlocks.
- **Recovery:** the forgotten-password flow.
- **Afterwards:** the game opens its socket.

- **Depends on:** the INFINEX game; 5S3-BE-02, 5S3-BE-03, 5S3-BE-04, 5S3-INT-01, 5S3-INT-02, 5S3-INT-03
- **Done when:** A player signs up and signs in inside the game by each method, sees the right message for every refused login, and the game connects its socket after login
- **Reference:** Spec §29

### ⏸ `5S3-QA-01` · Authentication security test

**Order** 20 · **QA** · **Where:** Code · **3d** · **Blocked**

The player login tested against OWASP ASVS Level 2:
- brute force and credential stuffing;
- account enumeration;
- token theft and replay;
- getting past the authenticator step;
- the socket's authentication.

Every finding is fixed or recorded with its reason.

- **Depends on:** 5S3-INT-04
- **Done when:** Every check passes, or each open finding is recorded with its risk and its owner
- **Reference:** Spec §29, §31

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

---

*Plan of record for Phase 5 · INFINEX Game Integration. Daily tracking happens in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (sheet `Phase 5`).*
