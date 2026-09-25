# QA pass 4 — the merged tree, including the lead's new surfaces (2026-09-25)

Fourth pass, aimed at what no earlier pass had seen: the lead's just-merged
frontend (fan redeem, live marketplace, brief wiring), an audit of my three
newest commits including the merge resolution, and a live E2E of /join against
the merged backend.

## The strongest proof of the day

Headless Chrome filled /join with `pass4@localhost` — passes local validation,
fails the contract's z.email() — and the merged stack behaved exactly as
designed end to end: the API's 400 (via the errorBody resolution) named
`email`, the wizard jumped back to the identity step with "Invalid email
address" on that input, and fixing the address yielded a real 201 with
reference `cmuft3xem00001ovj2mu4m9nn`. The one scripted "failure" was my
selector grabbing Next.js's empty route-announcer alert — the real banner
renders fine.

## rcfworks — found in 6ede48c and fixed here (review these, Bob)

1. **P8-SEC-03 defeated itself (HIGH):** `edge.ts` forwarded `XFF[0]` — the
   entry the CLIENT writes. `curl -H "X-Forwarded-For: 8.8.8.8"` minted a
   fresh rate-limit bucket per request on the public reward/tracking routes
   and could poison a victim address; the redeem test PINNED the wrong
   behavior. Now the LAST hop (what Railway's proxy saw) is forwarded; test
   rewritten + a forged-single-entry case added.
2. **API blip → sponsor sees fixtures + fake "Brief received" (HIGH):**
   `liveCatalogue()` swallowed `fetchActor()`'s outage throw, dropping a real
   signed-in sponsor into the fixture demo — where the drawer's no-submit path
   shows the full success screen while sending NOTHING. The catch is removed:
   outages land on the error boundary (anonymous visitors never hit the API
   and still get the demo). The demo drawer's simulated success for logged-out
   visitors is unchanged — flagging that as a product question.
3. **`/t/[code]` could 500 on a malformed destination** — `Response.redirect`
   throws on what `new URL()` rejects; now try/caught to the `/` fallback
   (defense in depth behind the API's WebUrl refine).
4. **Unknown token state fell through to the LIVE claim forms** (or threw on a
   missing consent block — a bare 500 on the most public page). Contract
   drift now renders the retry page.
5. **No fetch timeout on the fan routes** — a hung API hung the QR page where
   fans stand. `AbortSignal.timeout` (5s page / 4s redirect), existing
   fallbacks unchanged.

His redeem tests are genuinely good (no-script assertion, state-by-state,
consent gate, 409/503 distinctions) — the XFF pin was the one wrong one.
Cosmetic, unfixed: live marketplace reuses fixture filter options (state
filter can't match live "ACTIVE"-only rows; "Featured first" is a no-op live).

## My own commits audited (fourth-order review)

One real catch: the reader's back-cover house ad still said "the print run"
unhedged — the exact class 51661ef fixed elsewhere on the same page. Fixed
("the planned print run"), plus a stale comment in student-code-card. All of
60b29ff's portability fixes verified sound on both platforms (POSIX behavior
byte-identical), the a_authz_ prefix filter confirmed against the fixtures,
and the four repaired backend test files re-run: 45/45.

## Sweep + walks on the merged tree

Both-theme sweep over every screen plus /packages, /brief and the fan 404
page: clean (the only flags were the fan page correctly answering HTTP 404).
/packages and /brief render at 390px with no overflow or page errors;
/t/BOGUSCODE lands on / (the 64d938a localhost regression stays dead).

## State

Frontend 110/110 (one new XFF test), lint clean, build exit 0 (dev server
stopped first), backend previously 1232/1232 (four files re-verified 45/45).
Google Sheet mirror still by hand at EOD. Push remains HeckerCreatives' step.
