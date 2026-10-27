# SponsorX INFINEX World Contract

**Task `4S0-PMO-01` · Version 1.0 · 2026-10-16 · Phase 4, Sprint 0**

**What this is.** These are the rules any virtual world must follow to sell
sponsorship through SponsorX. They are written before the INFINEX game exists
(user, 2026-10-16), so the game is built to fit SponsorX rather than the other
way round. Phase 4 proves them with a **stand-in world**: a script that calls
SponsorX exactly as a world will.

**Built on** [`SponsorX-INFINEX-API-and-Event-Spec.md`](./SponsorX-INFINEX-API-and-Event-Spec.md)
(the endpoints and events). The names of worlds, zones and surfaces are
[`SponsorX-Virtual-Taxonomy.md`](./SponsorX-Virtual-Taxonomy.md) (`4S0-PMO-02`).

## 1 · Any engine

**SponsorX does not depend on the world's engine** (Unity, Unreal, a web
world or anything else).
- **How a world talks to SponsorX:** plain HTTPS and JSON, through `/api/v1`.
- **What it asks for:** what to show where (the manifest).
- **How it gets the creative:** by downloading image and video files through
  short-lived links.
- **What it sends back:** health, viewing counts and challenge completions,
  as JSON events.

**Each world records its engine,** as two plain fields filled in when the
world is registered and changeable later: `runtime` (for example "Unity 6")
and `runtimeVersion`. They describe the world for people. **No SponsorX rule
reads them.**

**Creative comes in formats every engine can show:**
- PNG, JPEG or WebP images;
- MP4 (H.264) video.

The size and length limits are per placement (taxonomy §3).

## 2 · Environments

**Every world has two environments, registered separately:**

| Environment | What it is for |
|---|---|
| `STAGING` | Testing: creative is tried here first, and the stand-in world runs here. A placement's staging test (`6S1-QA-01`, Phase 6) happens here. |
| `PRODUCTION` | The live world players visit. Only it counts toward sponsors' reports. |

**What gets versioned:**

| What | How |
|---|---|
| The world's build | `buildId`, sent with every heartbeat and every batch of events. A new build needs no change in SponsorX. |
| What to show | `manifestVersion` goes up on every change for the world. A world always takes the latest; it never needs the history. |
| Events | `schemaVersion` per event type. SponsorX accepts the versions its config endpoint lists as supported (at least the current and the one before), and refuses the rest with the supported list. |
| The API | `/api/v1` changes only by adding things. A breaking change ships as `/api/v2` beside it, with at least 6 months' notice. |
| Unknown values | A world treats a value it doesn't know (a new state, a new placement type) as "unknown", never as an error. |

## 3 · Stable IDs

**Inventory is sold against IDs, so they must not move.**
- **Who chooses them:** the world's owner gives every world, district,
  venue, zone and surface an **external ID**.
- **The format:** 1–64 characters, letters, digits, `.` `_` `-`.
- **Never changed.** A rename changes the name only.
- **Never reused.** A retired zone or surface keeps its ID forever, so old
  sales and reports still point at the right thing.
- **Unique within its scope:**
  - a world's ID, within its environment;
  - a zone's or surface's ID, within its world.
- **The same ID in staging and production** for the same surface, so a test
  in staging stands for the live surface.
- **Moving a surface to another zone** makes it a new surface, with a new ID.

## 4 · Players and sessions: anonymous only

**The same rule as the fan QR page: no player's identity reaches SponsorX,
and none reaches a sponsor.**

| What the world sends | What it is |
|---|---|
| `sessionRef` | One visit. Made up by the world; meaningless outside it. |
| `subjectRef` | One player, as a keyed hash: the world can make the same value again, SponsorX can never turn it back into a person. |

- **Never sent:** names, emails, account IDs, IP addresses or device
  identifiers.
- **Location:** at most a city and region. SponsorX keeps no more.
- **No linking across channels by default.** A fan who scans a QR code and also plays in a world is
  not matched up. Cross-channel totals (`6S7-DATA-01`) are counted without
  joining people.
  - Allowing a link later is a policy change, not a rebuild.
  - It does not wait on legal (standing rule).

## 5 · Who may call SponsorX

There are two kinds of caller, because a game server can be trusted and a game
on a player's device cannot.

| Caller | How it proves itself | What it may do |
|---|---|---|
| **The world's server** | A machine credential (id and secret, from BTG) that it swaps at `POST /infinex/token` for a token lasting 15 minutes | Read the manifest and its settings, start game sessions, send events, report challenge completions |
| **The game on a player's device** | A 15-minute session its world's server starts for it: a token for its own world, and a key it signs its requests with. Nothing secret is built into the game. | Read its world's manifest and settings, send heartbeats and events. Nothing else. |

The design is `4S0-SEC-01`, decided 2026-10-19
(`SponsorX-INFINEX-API-and-Event-Spec.md` §6.2):
- a game signs each request over its exact bytes (`SponsorX-Key-Id`,
  `SponsorX-Signature`, ±300 s);
- revoking a credential or a client takes effect on the next call.

## 6 · What SponsorX promises a world

- **The manifest lists only approved creative, inside its booked dates,** for
  the world and time asked.
- **Creative comes through signed links that expire within minutes.**
- **A pause or a rollback in SponsorX takes effect at the world's next
  manifest fetch,** with no new game build (`4S2-BE-05`, `6S8-BE-01`).
- **Settings come from SponsorX** (`4S3-INT-03`, `GET /infinex/config`): how
  often to send a heartbeat and read the manifest, the largest telemetry
  batch, the supported event versions and the feature flags. A world reads
  them at start and whenever it likes (ETag), and acts on them without a
  release. BTG can change one build's settings, within fixed limits.
- **A world that goes quiet is noticed.** A missing heartbeat raises an alert
  (`4S3-INT-02`).

## 7 · What Phase 6 adds

When the game exists, it follows this document. The game-side tasks are
Phase 6 ([`SponsorX-Phase6-INFINEX-Game.md`](./SponsorX-Phase6-INFINEX-Game.md)):
- the connector inside the game;
- its heartbeat and settings;
- the staging test of each surface;
- the pilot world.

## 8 · Approval

**Approved 2026-10-16 by the user,** under the programme owner's delegated
authority, when the plan for it was approved. A change to any rule here is a
pull request to this file.
