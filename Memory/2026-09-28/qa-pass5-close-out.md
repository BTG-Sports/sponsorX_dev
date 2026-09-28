# QA pass 5 — the 2026-09-28 close-out features (HeckerCreatives)

**Scope:**
- P6-BE-08 and P6-FE-01: reward eligibility, cap and landing copy
- the Activate athlete button
- the P7-QA-02 label and notice changes
- the sponsor-report NaN fix
- the new loop E2E suite

This was test only: **nothing was fixed in this pass.**

**Method.** Backend: black-box against the live API on :4000, with real Clerk
sessions for 10 `qa_be_` users across 7 roles and 2 tenants. Each request was
bound to its own `127.x.y.z` source address to get past the per-IP limiter.
Frontend: Playwright walks, JavaScript on and off, at 390, 768 and 1440 px, in
dark and light, with axe WCAG 2.1 AA, across 8 roles. All `qa_be_` and `qa_fe_`
rows were cleaned up afterwards; 4 append-only audit rows remain. Scripts and
screenshots are in the session scratchpad (`qa-backend/`, `qa-frontend/`) and
are gone after the session.

## Automated baseline
- backend vitest 1473/1473; `reward.limits.test.ts` ran 5 times, 13/13 each,
  not flaky
- frontend vitest 308/308; eslint clean
- `npm run e2e`:
  - The first run gave 13 passed / 2 failed (`redeem-flow`, `loop-p3` adult).
    It ran *during* the backend load storm (QA-01), so the API was returning
    500s.
  - Re-run in isolation: 3/3.
  - Full re-run: **15 passed / 0 failed**.
  - Environmental, not a regression.

## Verdicts
| Feature | Verdict |
|---|---|
| P6-BE-08 (cap, eligibility, copy) | Pass with issues. Correctness held in every storm: REDEEM rows never exceeded the cap |
| P6-FE-01 (creator and desk) | Pass with issues |
| Fan page `/r/[token]`, JavaScript off | Pass with issues. axe 0 violations; HTML payloads escaped |
| Activate athlete | Pass with issues |
| P7-QA-02 labels | **Fail.** The live approvals queue carries a "Demo data" banner |
| Intake SELF_REPORTED / matching ESTIMATED | Pass |
| Migration `20260928130000_reward_limits_landing` | Pass. CHECK constraint present; no drift |

## Findings, ranked (origin: **new** = introduced today, **old** = pre-existing)

### High
- **QA-01 (new): a redeem burst on one capped reward exhausts the Prisma
  pool, and the whole API returns 500.**
  - 600 parallel redeems at cap 100 gave 280 × 500, and 30 of 30 requests to
    an unrelated reward also got 500 ("Unable to start a transaction in the
    given time").
  - It starts at about 400 parallel. Uncapped at 800: 0 errors.
  - Cause: each capped redeem holds a pooled connection while it waits on
    `SELECT … FOR UPDATE` (`backend/src/domain/reward.ts:685-689`).
- **F-01 (new): a "Demo data — every figure below is sample data" banner
  shows over the LIVE approvals queue** for BTG_ADMIN and CAMPAIGN_MGR.
  - Cause: `admin/approvals/page.tsx:139` checks only `demo === null`; it
    also needs `!live`.
- **F-02 (old): staff roles crash on pages in their own sidebar.**
  - FINANCE and SALES on `/admin/campaigns` and `/admin/analytics`, and
    NETWORK_MGR on `/admin/campaigns/match`, get "Something broke".
  - Cause: the API's 403 is thrown instead of falling back
    (`admin/campaigns/page.tsx:51`, `admin/analytics/page.tsx:36`,
    `admin/campaigns/match/page.tsx:51`).

### Medium
- **QA-02 (new): a redeem that waited on the lock doesn't re-check state or
  expiry.**
  - Pausing a reward while a redeem waits still gives 201 and a REDEEM row,
    on a PAUSED or expired reward.
  - Cause: `contextFor` / `assertUsable` run before the lock, and nothing
    re-reads after it (`reward.ts:673-686`).
- **QA-03 (old): 5xx responses expose server file paths and source lines on
  PUBLIC endpoints.**
  - `error-body.ts:37-43` returns `err.message` whatever the status.
  - Trigger: `POST /applications/intake` with `followers: 2147483648` gives
    500, because the contract allows any safe integer and the column is int4.
    It should be a 400.
- **QA-04 (old, exposed today): multi-use rewards (`singleUse:false`) redeem
  only once per token**, so a cap is meaningless for them.
  - The partial unique index `reward_single_redeem` has no `singleUse`
    condition. The fan page still shows a redeem button that always fails.
- **F-03 (new fields make it worse): the fan page scrolls sideways at 390 px
  when the copy has a long word.**
  - Overflow ranged from 150 px to 3,671 px.
  - Cause: no `overflow-wrap:anywhere` in `fan-page.ts` inline CSS (h1 :62,
    `.offer strong` :65, `.lede`, `.elig`).
  - `/admin/analytics` headline too, at 390 and 768 px.
- **F-04 (old): "Redeemed of claimed" can read 200%.**
  - Staff redeem is offered before any claim; `redeemRate` divides by claims
    (`lib/rewards-live.ts:97`).
  - The analytics "claimed, not used" figure is skewed the same way.
- **F-05 (new): the reward creator and QR drawers aren't keyboard-operable.**
  - No focus move, no trap (41 of 60 Tabs left the `aria-modal`), no Escape,
    and no focus return (`live-rewards-desk.tsx:356`, `:492`).
- **F-06 (old): the admin header is hardcoded "BTG Operations / BTG_ADMIN"**
  for every role (`admin/layout.tsx:38-40`).
- **F-07 (old): `/r/<token>?flash=redeemed` shows "Redeemed ✓ Enjoy!"
  indefinitely on an already-used token.**
  - Staff trust that screen, so it is a re-use vector (`fan-page.ts:136`).

### Low
- **QA-05 (new UI, old domain):** parallel activates can both succeed, with
  2 audit rows (2 of 5 runs). The update doesn't filter on the old state
  (`domain/athlete.ts:106/168`).
- **QA-06 (new):** once the cap is spent, re-scanning a code that was
  already redeemed returns 410 "run out" instead of 409 "already used". The
  cap check runs before the unique index.
- **QA-07 (new):** a zero-width-only headline (`​​`) is stored and
  renders blank. `.trim()` doesn't strip it.
- **QA-08 (old):** 429 responses have no `Retry-After` header.
- **F-08 (new):** the desk shows expiry in UTC ("Oct 28"), the fan page in
  America/New_York ("Oct 27").
- **F-09 (old):** the API accepts a reward whose `expiresAt` is already
  past; the desk then offers "Go live".
- **F-10 (new):** a stale Activate click shows raw state-machine text ("An
  athlete cannot go from ACTIVE to ACTIVE…"), and the button stays enabled.
- **F-11 (new, left behind):** "Media value" wording remains on `/property`,
  in the report's fixture footnote, and in the live zero-data basis text.

### Needs a product decision
- **QA-09:** a fan who *claimed* before the cap ran out is refused at the
  till (410). Should a claim reserve a unit?
- **QA-10 (activate):**
  - `/activate` also reinstates a SUSPENDED athlete, with the same audit
    action as a first activation.
  - An athlete with no birthDate and no ageBand activates with no guardian
    check.

### Info
- SUPER_ADMIN can create a reward on another tenant's campaign, but can't
  activate another tenant's athlete (inconsistent).
- The OpenAPI `SocialAccount.source` still offers `VERIFIED_*` for intake,
  which the server now ignores.
- `RewardInput` strips unknown keys rather than rejecting them. Smuggled
  `state`, `tenantId` and `consent*` were all dropped safely.
- The comment at `routes/v1/applications.ts:298-307` says BTG_ADMIN may not
  activate; the policy allows it.
- The report's Verified layer is chipped "verified · platform" when there
  are zero metric rows.
- The home route map links fixture `/admin/campaigns/c1`, which 404s.
- **Suspected:**
  - a part-way create failure followed by a retry may duplicate the reward
  - the analytics y-axis ticks are rounded (0/1/3/4)

## What passed (headline)
- **Cap and eligibility validation, both sides:** 0, -1, 1.5, "abc", 2^31,
  1e9 and unknown or lowercase enums are refused. Copy length limits hold.
- **Cap correctness under concurrency:**
  - 5 × 20 tokens (×5 runs), 1 × 2 (×10), 10 × 60 and 50 × 150: exact every
    time.
  - Uncapped at 800 parallel: all 201.
- **Lifecycle:** PAUSED, ARCHIVED and expired are refused; lowering a cap
  below the count reads as exhausted.
- **Public view** leaks no ids, tenant, cap, other tokens or fan email.
- **AuthZ:** reward create matrix (7 roles, cross-tenant, anonymous) and
  activate matrix correct. Minor and guardian gating correct in API and UI.
- **Fan page, JavaScript off:**
  - Redirect after every post, and GET on /redeem returns 405.
  - The "run out" and `flash=soldout` states show.
  - axe finds 0 violations.
- **Desk:** cap line math ("2 of 2 left", "all 2 used", "unlimited"), tab
  counts, search; POSTGRES chips; demo notice for NETWORK_MGR, SALES and
  FINANCE.
- **Labels:**
  - "verified · manual", "Cost per 1,000 verified views", funnel "↓ —"
  - `EST · curated` on splits; "Sample figures" on home; SELF-REPORTED
    audience
  - demo notices; no c1…c5 links on the admin board; sponsor header shows
    the signed-in user
- **Every route and role:** no NaN, undefined, null, [object Object] or
  Invalid Date; no overflow except F-03; 0 console errors apart from F-02.

## Product decisions (user, 2026-09-28) — answers to "Needs a product decision"
1. **A claim reserves a unit, with a deadline.** On a capped reward, a claim
   holds one unit until `claimedAt + reserveMinutes`.
   - `reserveMinutes` is set per reward in the creator; the default is 60.
   - Once the hold expires, the unit is released. The fan can still redeem
     if units remain.
2. **Activate does NOT lift a suspension.** `/activate` is APPROVED → ACTIVE
   only.
   - Reinstatement will be a separate step. It is not built yet (flagged).
3. **An athlete's data must be complete to activate.** Activation checks the
   same required fields as the application form, including a birthDate or
   ageBand.
   - An athlete with neither is refused at activation.

## Fix pass — every finding above addressed (same day)

### Rewards
**New migration:** `20260928140000_reward_reservations_atomic_redeem` (additive,
backfilled). It adds:
- `Reward.redeemedCount`, kept by a trigger, for capped rewards only
- `Reward.reserveMinutes` (default 60, range 5–10080)
- `RewardToken.reservedUntil`
- `RewardEvent.singleUse`

**Redeem and claim** are now single DB functions, `reward_redeem(token, now)`
and `reward_reserve(token, now)`.
- Checks run in this order: state → expiry → used code → cap.
- A refusal that is already certain is answered before any lock is taken.
  Otherwise the function takes `FOR UPDATE` and re-checks everything.
- Uncapped rewards never lock.
- The lock timeout is 3 s, answered with a 503 `RewardServiceBusyError` and
  `Retry-After`.
- Fixes: **QA-01**, **QA-02**, **QA-06**.
- **Storm results:**
  - 600 and 800 parallel at cap 100: exact, 0 errors.
  - An unrelated reward during the storm: 30/30 × 201.

**Reservation (decision 1):**
- A claim on a capped reward holds a unit until
  `min(claim + reserveMinutes, expiresAt)`.
- A claim is refused when redeemed + live holds ≥ cap.
- A holder always redeems. A lapsed hold frees its unit.
- The creator has "Hold a claimed reward for". The fan page shows "Held for
  you until … ET". The desk shows "N of M left · K held".

**Other rewards fixes:**
- **QA-04:** `reward_single_redeem` now covers only single-use events
  (`prisma/sql/reward_single_redeem.sql` updated). Multi-use redeems up to
  the cap.
- **QA-07:** invisible `\p{Cf}` characters are stripped before the empty
  check.
- **F-09:** a past expiry is refused at create; an expired reward can't go
  ACTIVE.
- **F-03:** `overflow-wrap:anywhere` on the fan page, and `grid-cols-1` on
  analytics. 0 px overflow with a 200-character word.
- **F-07:** `?flash=redeemed` is honoured only within 2 min of this code's
  latest redemption (the view returns `lastRedeemedAt`).
- **F-04:** the rate shows only when claims ≥ redemptions; otherwise "—" plus
  "redeemed at the booth without a claim". Redeem-without-claim is kept, since
  claiming is optional.
- **F-05:** new `components/use-dialog-focus.ts` (focus in, trap, Escape,
  return). 0 of 60 Tabs leave either drawer.
- **F-08:** one convention everywhere, US Eastern labelled "ET". This covers
  the desk, the creator, the fan page, the hold time, **and the voucher
  email**; the email was changed by the coordinator.
- **Suspected duplicate on retry:** a create that fails part-way keeps its
  reward id, and "Finish creating" issues only the missing tokens.

### Activation, errors and admin pages
**Decision 2:**
- `activateAthlete()` refuses SUSPENDED with 409 `reinstatement_required`.
- Anything other than APPROVED gets 409 `illegal_transition`.
- The SUSPENDED→ACTIVE state-machine edge is kept for a future reinstatement
  step, which is **not built**.

**Decision 3:**
- `APPLICATION_REQUIRED_FIELDS` in `contracts/athlete.ts` is derived from the
  intake form: legalName, displayName, email, stateCode, sport, plus
  birthDate-or-ageBand.
- An incomplete record gets 422 `profile_incomplete` with a `missing` list.
- Queue reads now carry `missingFields` (names only). The desk disables
  Activate and names what is missing.
- `guardian-rules.ts` is unchanged: outside activation, an unknown age is
  still treated as an adult.

**Other fixes:**
- **QA-05:** conditional state write in the one transition function. A race
  gives one 200 and one audit row. Covers every application decision.
- **QA-03:**
  - Every 5xx gets a generic body plus a `reference`, and is logged
    server-side.
  - Int inputs are bounded to int4 across the contracts.
  - A birthDate before 1900 is refused (a year-0 date 500'd on public intake).
- **QA-08:** `Retry-After` on 429. The coordinator also extended it to 503.
- **F-01:** the approvals banner only shows on the fixture branch. The other
  13 notice pages were checked and are clean.
- **F-02:** a 403 degrades instead of crashing:
  - campaigns renders without delivery health, plus a role note
  - analytics shows "Analytics are BTG's"
  - matching shows "Matching is outside your role"
  - a 5xx still goes to the error page
- **F-10:** `explainRefusal()` gives friendly copy and removes stale buttons.
- **F-06:** a new `server/viewer.ts` puts the real name and roles in the
  admin, property, advisor and athlete headers.
- **F-11:** leftover "Media value" wording removed. The PDF/XLSX exports'
  "Est. media value" is correctly labelled ESTIMATED, so it was left as is.
- **F-12:** "· no data" instead of a platform chip. Stale route comment fixed.
  Intake socials accept SELF_REPORTED only.

**Also fixed by the coordinator:** the analytics headline said "Redemptions
are up −83.3%". It now reads down / up / flat / new this period, with 4 tests.

### Regression
- backend vitest **1516/1516**, frontend **345/345**
- tsc and eslint clean on both
- `npm run e2e` **15 passed / 0 failed**
- `npm run build` green; the :3000 dev server was stopped and restarted

### Still open
- The reinstatement step for suspended athletes (not built).
- An edit route for rewards. When a cap is added later it must recount
  `redeemedCount`, since the count is only kept for capped rewards.
- Unknown age counts as adult outside activation (`guardian-rules.ts`).
- **Nothing committed.**
