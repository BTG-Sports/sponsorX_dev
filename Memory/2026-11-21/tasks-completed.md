# 2026-11-21 · tasks completed

## POL-BE-119 / POL-BE-120 · fee statements before acceptance (rcfworks) — Code review
- **Why:** Rodney's new partnership agreement, "Platform access and service orders": no upfront or monthly access fee; before campaign acceptance, disclose the applicable transaction fee, fee payer and processing costs in writing; name any fee in the signed order; any change needs written acceptance before it applies. Raised by the programme owner, who stressed the disclosure before acceptance. polish.md item 119.
- **Owner decisions:**
  - The athlete's statement on a managed campaign: no fee deducted; the sponsor pays it, in the sponsor's price; no processing.
  - The sponsor confirms a managed campaign's price before launch, once it is fully staffed. At creation only the budget exists; asked, the owner chose "before launch".
- **Built:**
  - **Statements:** one per acceptance, with figures, words and a hash. Covers the athlete's Campaign Order and Offer, the seller's listing submit or resume and order accept, Deal Chat (written into DEAL v2's text), the sponsor's checkout, and the new campaign price confirmation (`GET/POST /campaigns/{id}/price[/confirm]`).
  - **Rates frozen at placement:** kept on `MarketplaceOrder.feeTerms`; the ledger books from them. Before this, rates were looked up when BTG approved the order, after the seller had accepted.
  - **Changed rates go back to the seller:** an order whose rates differ from those the seller accepted for the listing asks that seller first. `POST /listings/{id}/accept-fees` lets a seller re-accept a live listing without pausing it.
  - **The switch:** `FEE_STATEMENT_REQUIRED`, off until POL-FE-119; recorded in SponsorX-Switches.md.
  - **New agreement versions:** CAMPAIGN_ORDER v4, DEAL v2, MARKETPLACE_ORDER v3, PROPERTY_TERMS v3. Property terms no longer state fixed percentages, and the 30-day-notice rate change is gone.
- **Checked locally:**
  - the scanners, secret scan, audit, both builds and lint;
  - backend 292 files / 4,097 tests and frontend 220 / 2,742 on a portable Postgres 17, including the new tests;
  - e2e left to CI.
- **For HeckerCreatives:** POL-FE-119, the fee box on every acceptance screen, the sponsor's confirm-the-price screen and the PDF. Routes and fields are in polish.md item 119.
- **Tracker:** Polish rows POL-BE-119 and POL-BE-120 at Code review, rcfworks; POL-FE-119 Ready, HeckerCreatives.

## POL-BE-119 / POL-BE-120 · follow-ups the owner asked for (rcfworks)
- **Seller email when rates change:** a commission rule created or revised queues `notify.feeRatesChanged`, and the worker runs the same check daily. Each seller whose live listings' accepted fees no longer match gets one email naming them, never twice for the same set. Sent only with the switch on.
- **Existing sellers accept the new seller terms:** `GET /seller-terms` and `POST /seller-terms/accept`. With the switch on, a team on older terms can't list or accept orders until it accepts. The "new terms" screen is added to POL-FE-119.
- **The switch:** the owner first chose to wait for POL-FE-119, then asked for it on now. `FEE_STATEMENT_REQUIRED=on` is set on staging's api service (rcfworks); production's is the owner's to set. It takes effect when #511 deploys, and from then every acceptance is refused until POL-FE-119's screens send the statement.
- **Agreement display, checked:** every acceptance screen already shows the agreement's full text, loaded from the version in force, with a tick box before Accept or Sign: the athlete's order and offer, the sponsor's checkout, Deal Chat signing and seller onboarding. The new versions appear there once deployed. The gap was existing sellers, now covered by the seller-terms step above.

## POL-BE-119 / POL-BE-120 Done and deployed (rcfworks)
- **Merged and promoted:** #511 and #512 into main_development; #513 into main.
- **Deployed:** release = main = a85b4935 on staging and production. Main's CI and the deploy run passed.
- **Switch:** `FEE_STATEMENT_REQUIRED=on` on staging (rcfworks). Production is the owner's to set; I'm not permitted to read production's variables, so it's unconfirmed here. From this deploy, wherever it's on, every acceptance waits for POL-FE-119's screens.
- **Tracker:** Polish rows POL-BE-119 and POL-BE-120 Done 2026-11-21. Stage Progress row for 2026-11-21: 324 Done (S9 44), 21 days left, unchanged.

## Switch back off — staging matches production (POL-BE-119)

- **Why:** with the switch on, every acceptance is refused until POL-FE-119's screens send the fee statement. The owner wants staging to behave like production.
- **Done:** `FEE_STATEMENT_REQUIRED=off` on staging's api service (rcfworks, confirmed by reading the variable back). Production stays the owner's to set; it should be `off` too.
- **Effect:** the app works as before; every acceptance still records the fee statement it would have shown, marked not shown, and a hash that is sent is still checked.
- **Next:** turn it on in staging and production together once POL-FE-119 is live. SponsorX-Switches.md updated to match.

## POL-FE-121 · The rules wording on Confirmations gets its closing quotation mark (infinex1) — Done (#518, #521 merged) (first committed as POL-FE-116, a number taken the same day)

- **What:** step 1 of `/athlete/confirmations` ("Your own rules") showed a large opening quotation mark and no closing one, so on a PC the box looked cut off and testers tried to scroll it. The box is not meant to scroll: it grows to fit the whole statement. It now ends with a matching closing mark, bottom-right, and the bottom padding is wider so the mark sits under the last line instead of on it.
- **Where:** `frontend/src/app/(app)/athlete/confirmations/confirmations.css`, `.sx-cw-quote` and the new `.sx-cw-quote::after`. CSS only.
- **Step 2 (Content Collaboration Agreement) was checked and already scrolls:** its reader is capped at `min(28rem, 55vh)` and scrolls inside. In Chrome a mouse wheel scrolled a mock of it 600px at 1280px wide, and a touch swipe scrolled it 500px on an iPhone 13 viewport.
- **Checked:** rendered the box at 1280px and on an iPhone 13; the closing mark clears the last line on both. `npm run build` (frontend) passes. Frontend tests: 2,522 pass, 2 fail in `tests/deal-chat.test.ts`. Those two fail the same way on `main_development` without this change (the live-socket work of 2026-11-19), so they are not caused by it.
- **Tracker:** Polish row `POL-FE-121` (row 171), added with POL-FE-122 (#519).

## POL-FE-122 · "Select everything" and "Clear" on the Brands step (infinex1) — Code review
- **What:** `/athlete/profile`, step 5 "Brands you'd love". "Select everything" is a toggle: on, it adds the 19 everyday kinds and keeps anything else picked; pressed again, it clears every pick. "Clear" clears every pick.
- **Owner decision:** Select everything leaves out the six age-restricted kinds for everyone, since the step shows on the public page, a minor's included. A note under the buttons says so.
- **Also:** `tests/deal-chat.test.ts` normalises line endings, so it passes on a Windows checkout (`core.autocrlf`). Deal Chat itself was never failing; CI on Linux was green.
- **Checked:** frontend 220 files / 2,747 tests pass; the backend alignment checks pass; lint clean; `npm run build` passes after `prisma generate` (the client was stale after today's pull).
- **Tracker:** Polish row `POL-FE-121` (row 171) Done 2026-11-21; `POL-FE-122` (row 172) at Code review, infinex1; autofilter, conditional formatting and the Status list extended to row 172. Items 121 and 122 added to polish.md.
- **Renumbered:** the quote fix (#518) was committed as `POL-FE-116`, a number already taken that day; it is `POL-FE-121`.

## POL-BE-123 / POL-FE-123: the website deploys again (rcfworks)

- **Found while deploying staging:** every web deploy since 53eb0356 (2026-11-20 19:47 UTC) failed on staging and production; both sites served e9bf9102. The api deployed each time. Earlier today a85b4935 was reported as deployed on both; that was read from `release`, and only the api had actually deployed.
- **Cause:** `frontend/tests/advisor-profile-live.test.ts` (POL-FE-103) imports `backend/src/contracts/student.ts`, which took two lists from `domain/student.ts`, which loads the database client. `next build` type-checks the tests; Railway's web build has no generated Prisma client. CI generates it first, so CI passed.
- **Backend (POL-BE-123):** the lists moved to `domain/student-vocabulary.ts` (no imports), re-exported from `domain/student.ts`. Guard test `backend/tests/frontend-imports-pure.static.test.ts`.
- **Frontend (POL-FE-123), at the owner's request:** `frontend/tsconfig.build.json` via `typescript.tsconfigPath`, so `next build` checks the app only; new CI step `npm run typecheck -w @sponsorx/frontend` still checks the tests; the test's stand-in mock removed.
- **Checked:** with `backend/src/generated` hidden, the old code fails with Railway's errors and the fix builds. All CI steps pass locally (backend 293 files / 4,103 tests, frontend 220 / 2,747).
- **Lesson:** after a deploy, check each service's deployment status in Railway, not just the `release` branch.
## /admin/new-signups/rules redrawn (HeckerCreatives) — uncommitted, awaiting the owner's look
- **Why:** owner: "too much information at once … not easily understandable by humans; add a wow factor + animations". The page had five summary tiles, two switch panels each with an Off / On box pair, then the age board, all at the same weight.
- **Now two questions, in order:**
  - **01 Who waits for a person?** Three rule cards (`RuleCard` in `components/signup-rules-editor.tsx`), one per switch. Each card shows a three-step path: start, the gate this rule controls, the end. With the rule on, a runner stops at the lit orange gate ("Waits here"); off, the gate is crossed out and the runner passes through. Under the path: "What happens now" in one sentence, and "Switch it on/off:" in a quieter line. The badge reads Automatic / A person decides / Enforced. Flipping a switch fires a spring knob, a ring burst and a sweep across the card.
  - **02 Who counts as a minor?** An age ribbon at the top of `rules-board.tsx`: the commonest age as a big number, one segment per age sized by its number of places, and the places that aren't 18 as chips. A chip opens that place's dialog. The unknown-place alert shows only when the count is above zero. The country default now reads as a sentence: "In United States, an athlete is an adult at 18 — except in 3 states".
  - The header has the Live pill, a "How it works" panel (desk-kit `HowItWorks`, five steps plus a key) and one line counting how many of the three rules make someone wait.
- **Files:** `rules/page.tsx`, new `rules/rules.css` (`.sx-sr-*`, reduced-motion handled), `rules/loading.tsx` (skeleton in the new shape), `components/signup-rules-editor.tsx`, `components/rules-board.tsx`, `tests/signup-rules-flags.test.ts` (assertions on the removed tile replaced; one new test).
- **Checked:** vitest (6/6), eslint and tsc clean. Walked live as the QA admin at 1440 and 390: no console errors, no horizontal scroll. A switch was flipped on and back off on the local DB.
- **Tracker:** no task ID yet. If the owner accepts it, raise a `POL-FE-nn` row (the next free polish.md item number).
- **Follow-up (owner): the country rail and the country panel now have one fixed height.** `PANEL_H` in `rules-board.tsx` is 32rem on phone, 34rem from sm, 38rem from lg and 42rem from xl, the same for both panels. The rail's list and the panel's cards scroll inside, and the panel's heading, default line and tabs stay put. Measured live: equal at 390, 820, 1280 and 1920px wide, for the long US list and the short Ethiopia list. `loading.tsx` uses the same heights.
- **Follow-up (owner): age summary removed.** The box above the place board kept growing a card per age, and its replacement (an age picker with a fixed-height list) was then rejected: "not helpful at all, it generates confusion". The box is gone entirely: the big 18, the coloured bar, the legend and the per-age places. Removed `AgeSpread` and `RIBBON` from `rules-board.tsx` and every `.sx-sr-ages/ribbon/legend/explore/agebtn/places/place` rule from `rules.css`. Chapter 02 now opens on the search bar and the board, and the board's "Not 18" filter covers the same need. The How-it-works key line and `loading.tsx` were updated to match. Lint, tsc and vitest clean; walked live with no errors.

## /admin/sponsor-requests/:id redrawn (HeckerCreatives) — uncommitted, awaiting the owner's look
- **Why:** owner: "too many information at once, and super cluttered, make it more understandable to humans". The page was six cards down the left (what's wrong, the business, the answers, how it reached BTG, the proof, the business-type chips) and a side card with the checks, the same-name choice, Approve and Decline all open on arrival.
- **Now the POL-FE-108 record shape** (the one the owner accepted for organizations and sign-ups): the business's name with ONE pill and ONE button ("Make a decision" / "Reject the account" / "Reinstate"; none once declined), four tiles (Checks while waiting, then Business type · Proof of business · Contact · Asked / Signed in / Decided), and three tabs: Overview (what's wrong and the checks, or how it was decided and the account's progress) · Business (who they are, what they told us, the business type + its editor) · Proof of business.
- **The decision is in the shared popup** (`record-decide.tsx`). Approve carries its own controls there: the business type (suggested first, "Show all 25 types"; all shown when nothing is suggested), the same-named sponsor choice, and "What happens when you approve". `DecideChoice` gained `extra` (a choice's own controls) and `blocked` (why the final button is off, said in the footer). Decline / Reject need a note; Reject and Reinstate list what happens. The server action, the payloads and the refusals are unchanged.
- **Files:** `sponsor-requests/[id]/page.tsx`, new `[id]/loading.tsx` (RecordSkeleton), `components/sponsor-request-review.tsx` (`SponsorDecision` replaces `SponsorRequestReview` + `SponsorAccountDecision` and their dialogs; `SponsorDocumentOpen` kept), `components/record-decide.tsx`, `lib/sponsor-requests-live.ts` (`requestPill`, `requestStanding`, `requestFacts`), `admin/record.css` (SPONSOR mark, green section edge, popup chips/options/steps, long emails wrap), `tests/sponsor-requests-live.test.ts` (+5 tests).
- **Checked:** tsc and eslint clean; vitest 2747/2748, the one failure is the known Windows-only `deal-chat.test.ts` CRLF regex. Walked live as the QA admin at 1440 and 390 on an approved request (SPY-C) and a waiting one (Walk Cafe): no console errors, no horizontal scroll; popups opened, nothing submitted. No declined or rejected request exists locally, so those two states were not seen live.
- **Tracker:** no task ID yet. If the owner accepts it, raise a `POL-FE-nn` row (the next free polish.md item number).

## Onboarding and Sponsor requests folded into one page, "New accounts" (HeckerCreatives) — uncommitted, awaiting the owner's look
- **Why (owner):** a sponsor row in New sign-ups opened the Sponsor requests desk: "too many moving navigations why not just one navigation", then "just remove the onboarding page and the sponsor requests since we already have a new sign-ups page, just change the name". Owner picked the name **New accounts** and **Sales sees sponsors only**.
- **Menu:** Intake is now Applications · New accounts. Onboarding and Sponsor requests are gone from the nav. The URL stays `/admin/new-signups`.
- **Records open inside it:** `/admin/new-signups/organizations/:id` (`components/org-record.tsx`, the old onboarding record) and `/admin/new-signups/sponsors/:id` (`components/sponsor-request-record.tsx`); Back and the sidebar stay on New accounts.
- **Old addresses forward** (emails already sent, bookmarks): `/admin/onboarding` → `?kind=ORGANIZATION`, `/admin/sponsor-requests` → `?kind=SPONSOR`, and each `/:id` → its new record. The two desks' `actions.ts` stay where they are (the records call them); revalidation points at the new paths.
- **Sales:** opens New accounts and a sponsor record only. `admin-access.ts` adds `/admin/new-signups/{athletes,guardians,organizations,rules}` as BTG-admin only, and those pages check their own path now. The stream page hides the rules link, sensitive edits and organisation changes from Sales. The dashboard's intake cards carry their own `access` path (`cardAccess` in `ops-board-live.ts`), so Sales sees only the sponsor card.
- **Backend (signups-stream.ts):** the stream now holds every state, so nothing the desks showed is lost: sponsors declined (`DECLINED`), rejected, and waiting on the sponsor (`WAITING`); organisations asked for changes or still drafts (`WAITING`). Needs review still means BTG's move only. Each kind is included only if the role reads it tenant-wide, so Sales gets sponsors instead of a 403. Every link the backend builds (org profile emails, sponsor review email, Closed accounts, support inbox) points at the new records.
- **Also:** ops board and marketplace links repointed; help articles rewritten (the recorded help screenshots still show the old desks until `npm run help:shots` is re-run); `e2e/admin-lists-paged.spec.ts` drops the two desks and checks the forwards.
- **Checked:** frontend tsc and eslint clean, vitest 2750/2751 (the known Windows-only `deal-chat` failure). Backend tsc and lint clean; affected files all pass on `sponsorx_test`; full suite 4079 passed, 9 failed: 3 were stale URL regexes (fixed, pass), `metric-timestamps` timed out under load (passes alone), the rest the known Windows-only set. Walked live as the QA admin: nav, all three forwards, an organisation and a sponsor opening inside New accounts, the new "Waiting on them" pill, no console errors. A Sales login was not walked.
- **Tracker:** no task ID yet; raise a `POL-FE-nn` / `POL-BE-nn` pair if the owner accepts it. The backend part is in rcfworks' area: worth a heads-up before merging.
