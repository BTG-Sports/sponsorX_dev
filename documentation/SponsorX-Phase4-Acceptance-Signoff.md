# SponsorX Phase 4 · Acceptance sign-off record (as built)

**Task:** `4S9-PMO-03` · Phase 4 acceptance record, as built (raised 2026-10-20)
**Done when:** Phase 4's acceptance criteria 1–4 demonstrated and signed off
**Prepared:** 2026-10-20, from `main_development` at `08f10a6b` (staging and production run release `1b198d4b`)
**Status:** **Signed off 2026-10-20.** Phase 4 is accepted as built: all 4 criteria demonstrated. Signed by rcfworks with Rodney's delegated authority.

## Summary

Phase 4 sells sponsorship inside the INFINEX game's virtual worlds. On
2026-10-20 the game was parked ("our priority is to ship the SponsorX web
app"), and every open Phase 4 task moved to Phase 5. Phase 4 closes at what
was built: **18 tasks, all Done.** Its acceptance criteria are now 1–4, and
**all 4 are demonstrated**. The proof is 75 automated tests, run on 2026-10-20
against `08f10a6b` with 75 of 75 passing, and the same code is running on
staging.

- **Proven with the stand-in world, not the game.** The stand-in world is a script that calls SponsorX exactly as a world will. That was the plan of record from 2026-10-16.
- **Not proven in a real world.** Nothing here has been run against a real game; that is Phase 5's work.
- **No virtual impression is reported to a sponsor as validated** until Phase 5's pilot-world check (`5S2-QA-01`).

## How to read this

Each criterion names the tasks that built it, the pull requests that merged
it, and the tests that prove it. Every test runs in CI on every pull request
against a real Postgres, and all of them passed on `main` before each deploy.

## The 4 criteria at a glance

| # | Criterion | Status | Built by | Proven by |
|---|---|---|---|---|
| 1 | SponsorX can register a world, zone and virtual placement and map the placement to sellable inventory | **Demonstrated** | 4S1-BE-01, -02, -03, -04 (#243, #244) | `virtual-registry.test.ts` 12/12, `virtual-bookings.test.ts` 10/10 |
| 2 | The active campaign manifest returns only approved, in-window deployments for the requested world and time | **Demonstrated** | 4S2-BE-01, -02, -03, -04 (#250, #255) | `virtual-creative.test.ts` 14/14 |
| 3 | Creative can be paused or rolled back from SponsorX without redeploying the INFINEX application | **Demonstrated** | 4S2-BE-05 (#257) | `virtual-deployment-control.test.ts` 6/6 |
| 4 | The telemetry batch endpoint supports idempotent event IDs and rejects malformed or unauthorised events | **Demonstrated** | 4S4-BE-01, -02, 4S4-DATA-01 (#265), on 4S0-SEC-01 (#259) | `infinex-telemetry.test.ts` 6/6, `infinex-auth.test.ts` 11/11 |

## Evidence, criterion by criterion

### 1 · Register worlds, zones and placements, and sell them

- **Worlds** are registered once per environment under the owner's external ID; only a `VIRTUAL` property owns one.
- **Zones** are upserted all or nothing, under allowed parents. The database fixes the IDs: an external ID never changes, a zone never moves, nothing is deleted.
- **Placements** carry their spec, a viewability rule, capacity, price and dates.
- **Putting a placement on sale** creates exactly one inventory item of kind `VIRTUAL_PLACEMENT`, owned by the world's property. It never goes on sale from staging, nor for an owner not yet approved.
- **Booking** is by whole days inside a campaign, and the database refuses two bookings of the same slot on the same days.
- **Who:** BTG writes. Campaign managers and Sales read. A world's owner reads only its own; a sponsor reads nothing; another tenant sees nothing.
- **Tests:** `virtual-registry.test.ts` (12) and `virtual-bookings.test.ts` (10).
- **Design:** `SponsorX-Virtual-Registry.md` §1–§4.

### 2 · The manifest shows only what is approved and in date

- **Creative** is checked against the placement when it is uploaded (type, exact pixels read from the stored file, size, video length). A file that doesn't fit is rejected with every reason and deleted.
- **A deployment** ties the campaign, the placement, one validated creative version and its dates, inside the booked window. The database allows one approved deployment per window at a time.
- **The manifest** shows nothing until a deployment is approved, and then only inside its dates. It is versioned, with an ETag that holds while nothing changes.
- **Each file** comes with a signed link that fetches only that file and lives 15 minutes (4S2-BE-04).
- **Tests:** `virtual-creative.test.ts` (14), in particular "03 · the manifest: nothing until approved; then only in its dates; versioned, with an ETag that holds while nothing changes".
- **Design:** `SponsorX-Virtual-Registry.md` §5–§7.

### 3 · Pause and roll back without a game release

- **Pausing** takes a deployment off its world's manifest at once, with a new manifest version and ETag. A world sees it at its next poll; no release of the world is needed.
- **Resuming** is checked again as an approval is.
- **Rolling back** puts the previous (or a named) validated version on the window from that moment to the old end, in one transaction.
- **Each change** is audited and records when and why.
- **Tests:** `virtual-deployment-control.test.ts` (6).
- **Design:** `SponsorX-Virtual-Registry.md` §6.1.

### 4 · Telemetry is idempotent and refuses what it should

- **Who may send:** only a game session (4S0-SEC-01), with a valid signature over the raw bytes. An unsigned, tampered or stale batch, or one from a server's token or a person, is refused and stores nothing.
- **Each event is checked on its own**, and refused with a named reason (malformed, unsupported schema version, wrong world, placement or deployment, future time, tenant in the body, and the rest); the good ones in the same batch are kept.
- **Idempotent:** an event is stored once per (client, eventId), enforced by the database's key, so a resent batch is answered "duplicate".
- **Raw events** are append-only. Events past the 72-hour window are kept as quarantined, never dropped.
- **Tests:** `infinex-telemetry.test.ts` (6), with the stand-in world sending its batch end to end, and `infinex-auth.test.ts` (11) for the machine login.
- **Design:** `SponsorX-INFINEX-API-and-Event-Spec.md` §5.3 and §6.2.

## Also built in Phase 4 (Done, not a criterion of their own)

| Task | What |
|---|---|
| 4S0-PMO-01, -02 | The world contract and the virtual taxonomy |
| 4S0-SEC-01 | Machine login for INFINEX servers and game sessions (#259) |
| 4S3-INT-02, -03 | The client registry, heartbeats and missing-heartbeat alert, and per-build settings (#262, #263) |
| 4S7-BE-01 | One campaign holding athlete, ad-slot and INFINEX inventory, counted once (#255) |

## On staging

- **Release:** `1b198d4b`, deployed 2026-10-19 and checked read-only.
- **Database:** every Phase 4 migration is applied, including the append-only raw-events trigger.
- **API:** `/health` returns 200.
- **The telemetry route** refuses a request with no game session (401).
- **Settings:** `INFINEX_SIGNING_SECRET` is set on staging; production does not need it until the game exists.

## Not part of this sign-off

These moved to Phase 5 on 2026-10-20 with their tasks, because they need the
game or only matter once it exists:
- **Phase 4's former criteria 5–11:** viewability, de-duplication in reports, activations, cross-channel, the operations console, the sponsor's virtual report, and the load test. They are Phase 5's 7–13.
- **The two criteria added that day:** the admin screens and the emergency pause. They are Phase 5's 14–15.
- **The Phase 4 UAT:** now `5S8-PMO-01`.

## Sign-off

Signed by the user, rcfworks, with Rodney's delegated authority (2026-10-09).

1. SponsorX can register a world, zone and virtual placement and map the placement to sellable inventory. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-20
2. The active campaign manifest returns only approved, in-window deployments for the requested world and time. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-20
3. Creative can be paused or rolled back from SponsorX without redeploying the INFINEX application. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-20
4. The telemetry batch endpoint supports idempotent event IDs and rejects malformed or unauthorised events. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-20

**Phase 4 is accepted as built, 2026-10-20.**
