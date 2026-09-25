# SponsorX — Fan QR page load test (P8-OPS-02)

| | |
|---|---|
| **Task** | `P8-OPS-02` · Load-test the fan QR surface (Addendum A10) |
| **Date** | 2026-09-25 · rcfworks |
| **Acceptance** | Burst traffic on the redeem page is characterised; the Cloudflare Workers revisit trigger is either fired or explicitly deferred with data |
| **Result** | Characterised to 537 page loads/second with zero errors. **Trigger deferred** — numbers below. One real bug found and fixed first. |

## What was tested

The fan redeem page, `GET /r/<token>`, on **staging** — the same build that
ships to production (Next.js route handler → API `GET /public/rewards/:token`
→ Postgres, plus the SCAN write after the response). Also the invalid-code page
and the LANDING beacon. 20 live `LOADTEST` tokens and one expired token were
seeded (simulated data), and deleted afterwards along with the 33,939 funnel
events the test wrote.

- **Tool:** autocannon 8.0.0, from one machine in Manila.
- **Route:** Railway edge `sin1` (Singapore) → staging origin
  `railway/us-east4` (Virginia). Read from the `X-Railway-Upstream-Zone` debug
  header.
- **Rate limits:** multiplied ×1000 on staging for the test only
  (`RATE_LIMIT_MULTIPLIER`), because one machine is — correctly — one visitor
  and would otherwise be capped at 120 page views a minute. Removed afterwards.

## Bug found first — every fan at an event shared one rate limit

The first burst (50 fans, 20 s, normal limits) served **600 page loads and
refused 1,774 (75%)** with "we can't load this reward right now".

Cause: the web app forwarded the last `X-Forwarded-For` hop to the API as the
fan's address. On Railway that hop is **Railway's own edge node**
(`152.233.33.161–164` in Redis), not the fan — so everyone arriving through one
edge shared a single limit of 120 views a minute. Fixed (#64/#65): the web app
now forwards **`X-Real-IP`**, which Railway's edge sets itself. Verified on
staging after the fix: requests counted under the real address
(`112.207.217.10`), and a forged `X-Real-IP` or `X-Forwarded-For` was ignored.
After the test, with the ×1000 relief removed and the API restarted, one
visitor sending 140 page views got **exactly 120 served and 20 refused** — the
per-fan limit, working as intended.

## Results (after the fix)

| Fans at once | Duration | Page loads | Loads / s | Median | Slowest 2.5% | Slowest 1% | Worst | Errors |
|---|---|---|---|---|---|---|---|---|
| 1 (baseline) | 20 s | 51 | 2.5 | 378 ms | 459 ms | 562 ms | 562 ms | 0 |
| 25 | 30 s | 2,061 | 69 | 353 ms | 475 ms | 547 ms | 998 ms | 0 |
| 50 | 30 s | 4,081 | 136 | 357 ms | 482 ms | 596 ms | 1,039 ms | 0 |
| 100 | 30 s | 8,191 | 273 | 355 ms | 471 ms | 609 ms | 964 ms | 0 |
| **200** | 30 s | **16,116** | **537** | 360 ms | 480 ms | 655 ms | 1,033 ms | **0** |
| Invalid code, 50 | 20 s | 2,768 | 138 | 352 ms | 469 ms | 536 ms | 795 ms | 0 (all correct 404s) |
| Landing beacon, 50 | 20 s | 2,718 | 136 | 357 ms | 491 ms | 568 ms | 975 ms | 0 |

No errors in the `web` or `api` logs during the runs.

**Reading it:**
- **Throughput scaled in step with load** (2× the fans, 2× the loads per
  second) and the median did not move — the system was not near a ceiling at
  537 loads/s. The ceiling was not found; the test stopped at 200 simultaneous
  fans.
- **The ~350 ms floor is distance, not work.** It is the round trip Manila →
  Singapore edge → Virginia origin, present even with one user. A fan in the
  DMV, next to the Virginia origin, sees a fraction of it.

## The Cloudflare Workers decision

Addendum A10 names this page as the trigger for reconsidering Cloudflare
Workers but sets no threshold. This task sets one:

> **Revisit Workers if, at the expected event peak, the slowest 2.5% of page
> loads exceed 800 ms or more than 1% fail.**

**Expected peak.** A large Phase 1 event: ~3,000 fans, 30% scanning within two
minutes of a big-screen prompt ≈ **7.5 scans/s**; allowing 3× for bunching,
**~25 loads/s**.

**Measured.** At 537 loads/s — **over 20× that peak** — the slowest 2.5% were
480 ms and 0% failed, measured from the far side of the world.

**Decision: deferred, with data.** Workers would mainly shave the network round
trip for distant visitors; SponsorX's fans are in the US, near the origin.
Revisit when any of these holds:

1. An event is planned where more than ~20,000 fans could scan within a few
   minutes (roughly where the tested headroom runs out).
2. Real-event monitoring shows the slowest 2.5% above 800 ms, or errors above
   1%, on this page.
3. SponsorX launches outside the US, where the round trip to Virginia becomes
   the fan's experience.

The page stays a plain dynamic route (no ISR, no edge middleware), so the
option remains open.

## Re-running it

The load script is kept in the session notes only (autocannon from a
scratchpad — no project dependency). To repeat: seed `LOADTEST` tokens on
staging, set `RATE_LIMIT_MULTIPLIER=1000` on the staging `api`, run
autocannon against `/r/<token>`, remove the variable, delete the seeded rows.
