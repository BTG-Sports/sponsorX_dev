# SponsorX — Public surface security review (P8-SEC-03)

| | |
|---|---|
| **Task** | `P8-SEC-03` · Penetration review of the public surfaces (§26) |
| **Date** | 2026-09-24 · rcfworks |
| **Acceptance** | Redeem page, tracking redirect, join form and public profiles reviewed for injection, enumeration and rate-limit exposure |

## Scope

Everything reachable without signing in: `/r/<token>` (fan redeem, plus its
`/claim`, `/redeem`, `/landing`), `/t/<code>` (tracking redirect), `/u/<token>`
(unsubscribe), `/join`, the public profile pages (`/athletes/<slug>`,
`/properties/<slug>`, `/packages`), and the API routes behind them
(`/api/v1/public/*`, `/api/v1/applications/intake*`, `/api/v1/webhooks/zoho/*`).

## Findings — fixed in this task

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| F1 | **Every rate limit on a public route counted the web server, not the fan.** The fan's phone reaches Next, Next reaches the API — so `req.ip` was the web server and one bucket covered every fan at an event (60 scans/min for a stadium; one abuser could lock everyone out). | High | `lib/client-ip.ts`: the web server forwards the fan's address, which the API believes **only** with a shared secret (`SPONSORX_EDGE_KEY`) — the API also has a public domain, so an unauthenticated forwarded header would let anyone pick their own bucket. All public limits and click geo go through it. | `public-surface.test.ts`, `redeem-page.test.ts` |
| F2 | **Tracking destinations accepted any URL scheme** — `javascript:`, `data:`, `file:` — and the value becomes a public redirect's `Location`. | Medium | Input restricted to http(s); the resolve route also refuses a stored non-http(s) destination. | `public-surface.test.ts` |
| F3 | **A malformed request body answered 500**, logged as an outage. Log noise and cheap amplification on public routes, and it hid which routes validated before authorising. | Medium | `ZodError` → 400 in the API error handler. | `brief-contract.test.ts`; the tenant sweep now fails on any 400/500 |

## Reviewed — no finding

| Area | Result |
|---|---|
| **SQL injection** | All queries are Prisma (parameterised). The raw SQL in `src`/`worker` is parameterised (`$1`), and the only `*Unsafe` calls are in tests. |
| **HTML injection** | `/r`, `/u` render hand-rolled HTML through `escapeHtml` (sponsor-authored offer text is escaped — tested with an `<img onerror>` payload). React escapes everything else. The redeem page contains no `<script>` and no inline handlers (tested). |
| **Header / open redirect** | `/t` redirects only to the stored http(s) destination; unknown codes go to a relative `/`. Every `/r` form redirect is a relative `Location`. |
| **Enumeration** | Reward tokens: 160 bits (`randomBytes(20)`). Tracking codes: 72 bits (`randomBytes(9)`). Unsubscribe links: HMAC-signed, and invalid vs. nothing-to-withdraw answer identically. Intake links: signed. An unknown reward token is distinguishable from an expired one **by design** — the fan must be told which — but with 160 bits that reveals nothing guessable. |
| **Rate limits** | Present on every public route (scan 60/min, landing 60/min, view 120/min, claim 20/min, redeem 20/min, tracking 120/min, unsubscribe 30/min, intake 5/hour create, enquiry 10/hour, Zoho webhooks 120–600/min). Fail open if Redis is down — deliberate: a cache outage must not close the fan page. |
| **Webhooks** | Invoice: HMAC; CRM: channel token + channel id, constant-time; every attempt recorded, secrets never stored (P8-INT-03/04). |
| **Fan PII** | Address stored only with a consent version; never returned by any read (P6-SEC-02); `/public/rewards/:token` carries none (tested). |

## Not yet a live surface — review again when wired

`/join` and the public profile pages (`/athletes/<slug>`, `/properties/<slug>`,
`/packages`) still render **fixtures**; wiring them is `P3-FE-01`, `P3-FE-03`,
`P3-FE-05`. The API they will call (`/applications/intake*`) is covered above
(limited, signed continuation token). Their pages get the same checks when
they go live — injection is React-escaped by construction, but the profile
page will need the P4-SEC-02 pay-field check applied to its public read.

## Accepted, recorded

- **The redeem button trusts whoever holds the phone.** §16's flow is "show at
  the booth, staff taps redeem". A fan could tap it themselves and burn their
  own code. Single use is still enforced; the cost falls on that fan only. A
  staff PIN is a Phase 2 refinement if booths report it.

## Configuration to finish the fix

`SPONSORX_EDGE_KEY` must be set to the **same** value on the `web` and `api`
services. Until it is, F1's protection is inactive (the API falls back to the
socket address — the old behaviour, not a new hole). Staging is set with this
task; production is set when production goes live.
