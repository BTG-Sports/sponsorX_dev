# 2026-09-30 — tasks completed

## Raised: independent athletes can't sell (2S3-BE-05, 2S3-FE-02) — rcfworks, via Claude

Found while reviewing the walkthrough: only a property manager can put an item on
sale, so an athlete with no team can create inventory items that can never reach
the marketplace, and nothing tells them. The user called this dangerous — not all
athletes have a team — and chose **Option A**: independent athletes list their own
items, approved by BTG under the same rules, keeping the whole share.

- `2S3-BE-05` · Independent athletes list their own items (BE, 5d, Ready) —
  listings stop assuming a property; search, cart, orders, availability and the
  ledger split handle an athlete-owned listing; roster athletes still go through
  their team.
- `2S3-FE-02` · Listing screen for independent athletes (FE, 3d, Blocked on BE-05).

Added to `documentation/SponsorX-Phase2-Marketplace-Commerce.md` (Sprint 3 now
8 tasks · 34 person-days; Phase 2 69 · 275) and to the committed tracker (Phase 2
rows 71–72, Orders 27.5 / 28.5; Dashboard, autofilter, conditional formatting and
the Status list extended to row 72). Not built yet — the build plan goes to the
user first. The walkthrough presentation is left as-is for now, at the user's
request.

## Also today
- Branch brought level with main_development (the landing-page P1-ART-09/10/11 work).
- Staging and production redeployed on `faceeb5` (main had not auto-deployed).
- Presenter's guide `SponsorX-Presenter-Guide.xlsx` (run of show, script, the
  money split with live formulas, gaps, Q&A, logins) — in the user's Downloads;
  the Google Drive connector was disconnected, so the user uploads it.
- Walkthrough presentation: step 2 as the athlete's step-by-step application,
  step 6 as how Riley creates his clinic (6a–6c), step 7 split into 7a–7c.

## Raised: payout screens (2S5-FE-03, 2S5-FE-04) — rcfworks, via Claude

The walkthrough's steps 5, 14 and 15 had no screens. Agreed with the user:
- `2S5-FE-03` · Athlete and team payout screens (FE, 4d, Blocked on 2S5-BE-04 and
  the designs) — payout-account set-up first: the page says a Stripe account is
  needed and links out to Stripe; then available / held / paid out, Request payout,
  and a history to "Paid, confirmed by the payment provider" plus an email.
  Stripe is named only for the account set-up; transactions stay hidden.
- `2S5-FE-04` · BTG payout approval screen (FE, 3d, Blocked on 2S5-BE-05).
- `2S5-BE-04` corrected to Ready (its prerequisite 2S5-BE-02 is Done).
- The backend (2S5-BE-04/05) will use a stand-in payment provider on staging only
  (the user agreed); production moves no money until Stripe is connected.
- Claude Design prompt for all the payout screens (A–D plus 0a–0c account set-up)
  given to the user.

Phase 2 now 71 tasks · 282 person-days (Sprint 5: 13 · 56). Tracker rows 73–74,
ranges extended to row 74.

## Raised: sponsor pay-by-card button (2S5-FE-05) — rcfworks, via Claude

Rule set by the user today: **every step that involves Stripe gets a call-to-action
button on our page that takes the user there** (payout account set-up, paying by
card, retrying a failed payment). `2S5-FE-05` · Sponsor pays for an order (FE, 2d,
Blocked on 2S5-INT-01 and the designs): "Pay $… by card ↗" on the approved order,
then confirming → Paid / didn't go through with the button again, plus the sponsor's
email. Claude Design addendum (section E) given to the user. Phase 2 now 72 · 284;
tracker row 75.

## Built: card payment and payouts, with a staging stand-in provider (rcfworks, via Claude)

Backend (2S5-BE-04, 2S5-BE-05, 2S5-INT-01, 2S5-INT-03 — all **In progress**,
honestly: the stand-in is not Stripe):
- `lib/payment-provider.ts` — the one place the provider is called. `standin` on
  staging/local (SponsorX's own labelled /test-provider pages, no money moves),
  `none` in production until Stripe is connected; the API refuses to boot with
  the stand-in in production. `PAYMENT_PROVIDER`, `STANDIN_PROVIDER_SECRET`,
  `PAYOUT_HOLD_DAYS` in env.
- Models PayoutAccount, PaymentAttempt, Payout, PayoutLine (+ order `fulfilledAt`),
  migration `20260930090000_payouts`. Policy: `payout` gains the payee request
  and BTG approve rows; new `payoutAccount` (RBAC matrix + digest updated).
- Sponsor pays an approved order on the provider's page → worker confirms →
  order PAID + receipt email. Payee requests its requestable balance (paid,
  delivered, past hold, account ready) → BTG approves / sends back → worker sends
  and confirms → PAID, PAYOUT journal, email. Refunds refused while a payout
  covers the order. BE-04's "dispute open" clause waits for 2S5-BE-03.
- tests/phase2-payouts.test.ts (14) reproduces the walkthrough figures:
  Riley $542.58 then the $61.66 reserve = $604.24; Hawks $151.05; ledger reconciles.

Frontend (from the Claude Design canvas):
- 2S5-FE-05 **Code review** — sponsor order page E1–E4 (Pay $… by card ↗,
  confirming, paid, Try again on Stripe ↗) and the stand-in's /test-provider pages.
- 2S5-FE-03 **In progress** — team Earnings: payout-account panel (Set up /
  Continue / Manage payouts on Stripe ↗), Request payout, history to "Paid ·
  confirmed by the payment provider"; athlete-home set-up banner. Riley's own
  "My money" page and BTG's payout approval screen (2S5-FE-04) wait for their
  Claude Design screens (prompt given to the user).
- Verified locally in the browser end to end: decline → retry → paid; delivered
  → Hawks set up payouts → request $135.64 → approved → Paid.

Local note: after a fresh local database, set `ALTER DATABASE sponsorx_test SET
sponsorx.audit_purge = on` (as CI does), or cleanup-heavy suites fail.

## Built: Riley's "My money" and BTG's payout approvals (2S5-FE-03, 2S5-FE-04) — Code review

From the Claude Design artboards MyMoney and Approvals (the second prompt was
needed: the first run of the payout prompt produced only the sponsor payment).
- `/athlete/money` (nav "My money"): tiles, payout account with Stripe ↗, the
  "before you can request" checklist with the set-up button, per-order shares,
  Request payout (with "$61.66 stays in reserve…"), history with the
  Requested → Approved by BTG → Sent → Paid tracker (shared with the team page).
- `/admin/payouts` (nav "Payouts", BTG admin + Finance): tabs with counts, each
  waiting request's checks; `/admin/payouts/[id]`: payee + account, the payee's
  part of the frozen split, checks, audit trail, Approve / Send back (note
  required), Retry for problems.
- Verified locally: Riley set up payouts → requested $542.58 → Finance approved
  → worker paid → all four steps done on Riley's page.

## Walkthrough deck redone with the payment and payout screens (+ three small fixes)

- The walkthrough artifact (claude.ai/artifact/LPLmw7XkLWnutu7fBjM6jq, v8) now shows all 16 steps on real screens: payout-account set-up (5a–5d), pay by card (11a–11c), payment confirmed plus receipt email (12), Riley's My money (13), payout request (14), BTG's approval queue, detail and paid state plus payout email (15a–15c), and reserve release and final payouts (16). The "not built" gap cards are gone. Stripe steps use the marked staging stand-in.
- Fixes found while shooting it:
  - BTG's order page Payments card said "Not tracked yet". It now reads `GET /marketplace-orders/:id/payment` and shows the real status and provider reference (2S5-INT-01).
  - The "Mark awaiting payment" and "Mark paid" hints no longer say there is no payment provider. Mark paid is for payments made another way.
  - The payout tracker's labels now wrap instead of truncating in narrow columns (the Hawks' "Approved by BTG").
  - Payout emails to athletes now link to `/athlete/money`, not `/athlete/earnings`.

## 2S3-BE-05 — independent athletes list their own items (Code review)

- **Schema.** A listing, and the order line bought from it, now has exactly one seller: a property, or an athlete with no team.
  - Nullable `propertyId` plus a new `sellerAthleteId` on `Listing` and `MarketplaceOrderLine`.
  - DB checks `Listing_one_seller` and `MarketplaceOrderLine_one_seller`, in migration `20260930150000_independent_athlete_listings`.
- **Permissions.** ATHLETE `listing.write`: deny → `own`.
  - For writes, `own` means only listings the athlete sells themselves. Reads still cover every listing of their items.
  - `whereFor` now passes the action to builders.
  - Matrix §18 updated; digest is now `9bfe4e2f8189268c`.
- **Rules.**
  - The athlete must be APPROVED or ACTIVE, with no team.
  - A roster athlete gets 409: "on a team — <team> lists your items".
  - `sellerProblems` / `sellerCanSell()` in `listing-rules.ts` are applied on submit, BTG approval, resume, the catalogue scope, search and `checkListing`. So an athlete who joins a team stops being sold.
- **Money.**
  - `bookOrder` forces team share 0 on an athlete-sold line, even when a TEAM_SHARE rule exists. That rule would otherwise pay a team that doesn't exist.
  - No PROPERTY ledger rows are posted, and payouts go to the athlete.
  - The split preview takes `independentAthlete`.
- **Other surfaces.**
  - Search, cart, orders and Zoho name the athlete through a `seller` object.
  - Search's state filter uses the athlete's state.
- **Tests.**
  - `tests/phase2-independent-listing.test.ts` (14 tests) covers the whole path, from listing through to payout, plus the refusals.
    - Worked example: $1,000 → $678.22 available + $77.07 reserve = $755.29 to the athlete, $0 to any team.
  - Seller-rule unit tests are in `phase2-marketplace`.
  - The tenant-isolation sweep now seeds an athlete-sold listing and order line.
  - The alignment test accepts the builder's action argument.
- **Frontend follow-up raised as 2S3-FE-03** (Ready). The shop, cart, checkout and BTG queue still assume a property; `propertyLine` in `lib/shop-live.ts` would fail on an athlete-sold listing. 2S3-FE-02 moved to Ready.

## "How it works" stop redrawn 1:1 to the how-it-works mockup (HeckerCreatives, evening)

*Same branch, same rule: rework on the landing, not a tracked task.*

- **`components/landing-steps.tsx`** (new) — `HowItWorks`: the column 8%
  in from the left of a `bleed` basketball stop, biased a little above
  centre. Eyebrow "HOW IT WORKS" + a solid blue slanted dash + a hairline
  running right; "How it **works**" (58px, `works` in the bright blue);
  the mockup's three-line intro; then four step cards in a 2×2 grid with
  30px gaps. Each card is a chamfered (12px, all four corners) glass plate:
  clipped frosted fill (`backdrop-blur-xl`), a one-pixel outline cut with
  a nonzero-winding `clip-path` ring filled with a left-to-right gradient
  (bright on the left, fading right) under a `drop-shadow` wrapper so it
  glows, the step number top-left, an 80px pointy-top hexagon badge with a
  glowing outline and a solid blue glyph (goal / team / growth / trophy),
  22px title + 15px body, an arrow at the right and a 65px lit tick at the
  bottom-left. **Copy is the mockup's**, including step 04's "Track
  performance in real time" — worth a product check, Phase 1 reporting is
  not real-time.
- **`(public)/page.tsx`** — the basketball stop no longer uses the shared
  translucent panel or the "02 · Basketball court" waypoint eyebrow; the
  old `STEPS` constant is gone with it. The other three stops are
  untouched.
- **Checks:** eslint + `tsc --noEmit` clean, vitest 545/545; Playwright
  (Edge) at `/#how-it-works`: the stop is fully visible (opacity 1) and
  fits its stage at 1821×864 and 1366×700, no horizontal overflow, no
  console errors; the phone width scrolls inside the stop (four cards
  cannot fit 844px). `npm run build` still not run — dev server live.
- **Later:** the How It Works column stays on the left (a right-side
  mirror was tried and reverted on the owner's call) and now sits on the
  same left gradient ground as the hero (68% wide, `#04080f` 90% → 60% →
  transparent) so the copy and cards never land on lit facades.

## "For sponsors" stop redrawn 1:1 to the for-sponsors mockup (HeckerCreatives, evening)

*Same branch, same rule: landing rework, not a tracked task. The owner
left out the trusted-brands band, the real-time impact card and the
navbar.*

- **`components/landing-sponsors.tsx`** (new) — `ForSponsors`: one glass
  panel 5% in from the left, 65% wide, both right-hand corners chamfered
  30px, a one-pixel outline cut with a nonzero-winding `clip-path` ring
  (brightest top-left, fading to the bottom-right) under a `drop-shadow`
  wrapper so it glows, frosted fill (`backdrop-blur-xl`). Inside: "FOR
  SPONSORS" eyebrow with its short line; "Strategic **Partnerships.** /
  **Real Measurable Impact.**" (46px, blue + gradient); the two-line intro;
  three feature items (36px glowing rings with solid glyphs, title +
  sub) split by hairlines; a fading rule; three package cards in a
  3-column grid (10px chamfers top-left / bottom-right, glass, glowing
  outline; the middle one lit brighter with a "MOST POPULAR" pill and a
  filled gradient CTA). "All six packages →" pokes 40px past the panel's
  right edge at the bottom, as drawn. `SponsorsTag`: "REAL ATHLETES. /
  REAL IMPACT." with two diagonal glowing strokes, bottom-right of the
  stop, desktop only. **Copy is the mockup's** — tier labels, taglines and
  bullets do not match §7's package definitions on /packages yet; the
  old "managed marketplace, no self-service checkout" footnote is gone
  with the panel.
- **`(public)/page.tsx`** — the soccer stop is `bleed`; the old `PACKAGES`
  constant and the snap-x strip are gone. Baseball and skyscraper stops
  untouched.
- **Checks:** eslint + `tsc --noEmit` clean, vitest green; Playwright
  (Edge) at `/#for-sponsors`: the stop fits its stage at 1824×862 and
  1366×700, no horizontal overflow, no console errors; the phone width
  scrolls inside the stop. `npm run build` still not run — dev server live.

**For sponsors, later notes the same evening:** the outer glass panel is
gone; the block is mirrored to the right on a right-side gradient ground
(75% wide) and mirrored inside too — everything right-aligned, card order
reversed (Enterprise → Growth → Starter), chamfers top-right / bottom-left,
pill and check marks on the right. "All six packages →" now rides on the
right end of the rule just above the cards (the floating button beside
the cards read badly; alternatives considered: centred under the cards,
or beside the intro). The hero's trusted-brands band closes the stop
(`TrustedBrands` takes trailing children) with the "REAL ATHLETES. REAL
IMPACT." tag inside it after "+ More", behind the band's slanted hairline
— the two glowing diagonal strokes were replaced by that hairline on the
owner's note. Vertical rhythm tightened so the stop fits 1824×862 and
1366×700 with the band.

## "For athletes" stop redrawn 1:1 to the athlete-marketplace mockup (HeckerCreatives, evening)

*Same branch, same rule: landing rework, not a tracked task. Navbar
excluded.*

- **`components/landing-athletes.tsx`** (new) — `ForAthletes`: 6% in from
  the left on a left gradient ground: the "//// ATHLETE MARKETPLACE ////"
  eyebrow, "Find the Right **Athletes.** / **Build Lasting Partnerships.**"
  (48px, cyan + gradient), the two-line intro, four feature items (40px
  glowing cyan rings + two-line labels), "Browse Athletes →" (cyan
  gradient, → /sponsor) and "Become a Sponsor ▶" (outlined, → /brief).
  `FeaturedAthletes`: the glass panel at the right edge (owner's note),
  735px wide, chamfered top-left 12 / bottom-right 22, glowing cyan
  outline (clip-path ring + drop-shadow), header row with badge icon,
  "FEATURED ATHLETES", "View All →" (→ /sponsor) and a rule; four rows —
  gradient avatar ring with a monogram (no portraits in the repo), name +
  verified badge, sport | tier, three tags (job, geo, verified /
  self-reported), hairline, Total Reach + Engagement Rate, "View Profile
  →". **Rows read the first four ACTIVE `fixtures.athleteInv` records** —
  real fixture athletes with public profile pages — not the mockup's
  invented names; the figures carry their fixture `source` in a `title`.
  `JobsBand`: the owner asked for something other than the brand logos —
  it is the hero band's glass and glowing rules carrying the **§5
  standard-jobs ribbon** (Story Drop … Monthly Ambassador, "+ Rates" →
  /join) with the mockup's "THE PERFECT MATCH BETWEEN BRANDS AND
  ATHLETES." tag at the right behind a slanted hairline. Alternative
  offered: "Sports in the network" from the Athlete `sport` field.
- **`(public)/page.tsx`** — the baseball stop is `bleed`; the old
  content-partner panel, its bullet list and the `JOBS` constant are gone
  (the jobs live in the band now). Skyscraper stop untouched.
- **Checks:** eslint + `tsc --noEmit` clean, vitest green; Playwright
  (Edge) at `/#for-athletes`: fits its stage at 1824×862 and 1366×700
  (columns 38% / rest under 2xl), no horizontal overflow, no console
  errors; phone width scrolls inside the stop. `npm run build` still not
  run — dev server live.

## Closing section + footer redrawn 1:1 to the "Join the movement" mockup (HeckerCreatives, night)

*Same branch, same rule: landing rework, not a tracked task.*

- **The challenge — keep the SPONSORX screen clear at the skyscraper.** The
  drone's last pose looks up at the gantry wordmark in the upper half of
  the frame; the mockup's centred panel would cover it. So the closing
  block is **no longer a flight stop**: the skyscraper `FlightStop` is
  gone from the page and the panel follows the scroll track in normal
  flow (`<section id="start">`). At progress 1 the wordmark is fully
  clear (Playwright-verified at the track end: nothing but the header
  over the city); one more scroll brings the panel up over the city and
  the footer after it. The `#start` hash still scrolls to the skyscraper
  pose (flight.ts mapping), and the section sits right below it.
- **`components/landing-close.tsx`** (new) — `JoinTheMovement`: the glass
  panel (915px, all four corners chamfered 28px, glowing cyan outline via
  clip-path ring + drop-shadow): "/// JOIN THE MOVEMENT ///", "Real
  Athletes. / **Real Partnerships.**", the intro, "Get Started →"
  (→ /login) and "Watch Our Story ▶" (→ #how-it-works — there is no video;
  placeholder target), a fading rule, four feature columns (outline
  glyphs, title, two-line sub, hairlines) and the "THE NUMBERS" sub-panel
  (chamfered bottom-right, its own glowing ring) whose four rows are
  **`fixtures.networkStats`** with `CountUp` and the fixture `source` in a
  `title` — not the mockup's 2.3M+/580+/1.2M+/4.8 figures. Copy is the
  mockup's ("No middlemen. No hidden fees.", "Global Reach … worldwide" —
  product claims worth a check). `ClosingSports`: the owner asked for
  something other than the brand logos again — "/// SPORTS IN THE NETWORK
  ///" lists the distinct `sport` values of `fixtures.athleteInv`
  (Basketball, Track & Field, Football, Volleyball, Soccer), then the
  "THE PERFECT MATCH BETWEEN BRANDS AND ATHLETES." tag behind a slanted
  hairline and the BTG badge (`/sponsorx-badge.png`).
- **`components/site-chrome.tsx`** — `SiteFooter` rebuilt to the mockup:
  dark plate over the city with a glowing top rule and two slanted HUD
  hairlines top-right; logo + blurb, a vertical hairline, the same three
  link columns as before (Packages / Sponsor Portal / Sign In; Join the
  Network / Athlete Portal; Admin / Route Map), the build line, and four
  social rings (X, Instagram, YouTube, LinkedIn) rendered inert and
  titled "Not linked yet" — no destinations exist.
- **`(public)/page.tsx`** — `PANEL` and `Waypoint` are gone (no stop uses
  the shared translucent panel any more); header comment updated.
- **Checks:** eslint + `tsc --noEmit` clean, vitest green; Playwright
  (Edge, 1821×864): no horizontal overflow, no console errors at the
  track end or the page bottom. `npm run build` still not run — dev
  server live.

**Closing section, re-laid the same night on the owner's note (one
viewport, no scrolling):** the close is a flight stop again — the
skyscraper `FlightStop` (`bleed`) holds the copy + buttons on the left over
a left gradient ground (`ClosingCopy`, ≤31vw), the features (2×2) + "THE
NUMBERS" glass panel on the right (`ClosingPanel`, 34vw at the right
gutter), and **the footer pinned to the bottom of the same stage**. The
two columns leave the middle of the frame open, so the drone's upward
look at the SPONSORX screen stays unobscured on desktop. To put the
footer inside the stage the home page moved to its own route group —
**`src/app/(home)/`** (`layout.tsx` = header only, plus copies of the
public `error.tsx` / `loading.tsx`); `(public)/layout.tsx` keeps the
footer for every other public page (checked: one `<footer>` on `/` and
on `/packages`). `JoinTheMovement` / `ClosingSports` are gone with it
(the sports row did not fit the one-viewport brief). `SiteFooter` is a
little more compact. Playwright: the stop fits its stage at 1824×862 and
1366×700, no overflow, no console errors.
- **Later, same stop:** the footer's slanted HUD hairlines and the "BTG
  Sports Group · SponsorX Phase 1 · pre-launch build" line are removed
  (owner's notes); the social rings sit alone at the right of the bottom
  row. The closing panel is stacked vertically — features 2×2 over the
  numbers (also 2×2) — and narrowed to 27vw so it stays off the SPONSORX
  screen's right edge. Fits at 1824×862 and 1366×700.

## `P1-ART-11` · Landing 3D — loading screen and entrance (HeckerCreatives)

*New task, raised today (xlsx row 266, Order 32.8, ART / Code, 1d, Code
review; Phase 1 doc block added after `P1-ART-10`, header 199 · 472; the
2026-09-30 Stage Progress snapshot's "Days left" bumped 91 → 92).* Brief
from the programme owner: a loading screen on every hard refresh or entry
to the landing page, the uiverse `Juanes200122/fresh-yak-92` isometric
loader (screenshot pasted) with an X in the centre of its glow so it reads
as a hologram; it must cover the whole three.js load and show 100 only
when the environment and the content are done; and the transition after
it needed thinking through.

**What was built** (branch `feature/P1-ART-09-landing-city`, uncommitted):

- **`frontend/src/lib/city/loading.ts`** — the pure maths: three tasks
  weighted assets .55 / scene .35 / content .10 (`overallProgress`),
  `byteFraction` over several downloads (Content-Length, else the known
  on-disk size; a finished item counts full so a 404 never stalls),
  `easeDisplayed` (the counter chases the real number, never overshoots,
  snaps under 0.3 % so it cannot sit at 99) and `canFinish` (target 1,
  counter 1, minimum time on screen). **`tests/city-loading.test.ts`** —
  14 cases: weights sum to 1, 0 → 1 bounds, monotone, scene-not-drawn
  < 1, poster path finishes on content, byte weighting/fallback/404/
  overrun, easing, finish rule.
- **`lib/city/load-store.ts`** — zustand `{ tasks, setTask (never
  backwards), completeAll, reset }`.
- **`lib/city/assets.ts`** — `KIT_URL`, `ENV_URL`, `cityFiles(tier)` with
  the committed byte sizes (6 508 624 / 2 865 200 GLB, 1 521 214 HDR).
  Three-free on purpose so the backdrop can read it in the poster-only
  bundle; kit-instances.tsx and city-scene.tsx now import from it.
- **`components/city/city-preload.ts`** — streams each file with `fetch` +
  ReadableStream, reports bytes, and `THREE.Cache.add(url, buffer)`
  (`Cache.enabled = true`). three's `FileLoader` checks that cache by bare
  URL before fetching, and both the GLTFLoader and the RGBELoader (via
  DataTextureLoader) go through it with `responseType: arraybuffer`, so
  drei's `useGLTF` / `<Environment files>` resolve from memory — the
  loader's number *is* the download and nothing is fetched twice.
  Dynamic-imported only (it imports three).
- **`components/city/city-backdrop.tsx`** — after the capability gate it
  warms the scene chunk (`import("./city-scene")` → scene 0.4) and streams
  the files (assets 0..1), then mounts the scene; `onReady` (first drawn
  city frame) → scene 1. Poster path marks assets + scene complete at
  once. Everything else (watchdog, orbit mode, fade-in) unchanged.
- **`components/landing-loader.tsx` + `.module.css`** — server-rendered
  overlay (z-60, above the header), `role=status`, counter and bar written
  through refs from one rAF loop (React sees only four phase changes).
  Writes `content` (fonts.ready + window load), locks scroll, 1.4 s
  minimum, 25 s safety `completeAll`. The rig: CSS-3D cube (rotateX −28°
  · rotateY 45°; front + left faces visible), glowing pad inset on the top
  face, orange slot (the logo's X colour) on the front face, two outline
  layers below, rising dust counter-rotated to face the camera, and the
  hologram — **one** letter X turning a full circle every 8 s. It has real
  thickness so it never blinks out edge-on: each bar is a stack of seven
  slices along Z (glowing front/back faces, a darker body) plus two side
  faces, so edge-on it shows as a solid slab. Scan-line mask, flicker on
  the slices, a projector beam cone that faces the camera outside the
  spin. Owner's mid-session notes: "1 x only rather than many" (a cross
  of three flat planes was tried and dropped) and then "better if it's
  rotating" (a single swaying camera-facing plane was dropped for the
  extruded spinning letter). Phases: `loading` → `done` (pad and X flare, 380 ms hold)
  → `leaving` (overlay fades 0.7 s, rig scales ×2.4 toward the viewer and
  blurs, HUD drops) → unmounted. Brand blues instead of the reference's
  purple; colour literals on purpose (artwork on a fixed-dark ground).
- **Entrance** — `globals.css`: `[data-sx-landing] .sx-reveal` /
  `.sx-reveal-fade` hidden until `html[data-sx-loaded]`, staggered by
  `--sx-reveal-delay`; the loader deletes the attribute on mount (a
  client-side return replays it) and sets it when leaving. `(home)/
  layout.tsx` wraps the route in `data-sx-landing` and fades the header
  in (opacity only — a transform on a sticky ancestor pins it to its box);
  `(home)/page.tsx` mounts `<LandingLoader />` first and staggers the
  eyebrow, headline, paragraph, buttons, impact card (got a `style` prop),
  trusted-brands band and platform strip (0.05 → 0.6 s). `<noscript>`
  hides the loader and shows everything.
- **Gotcha found on the way:** a `preserve-3d` group must carry transform
  only. The flicker (an opacity animation) was on the `.holo` group and
  Chromium flattens such a group, so its planes painted edge-on with it
  at some angles (screenshots showed a sliver while
  `getBoundingClientRect` said the planes were wide). Moved the flicker
  to the plane and the done-phase brightness to the bars.
- **Build:** dev server killed by port first (memory rule), `npm run
  build` in `frontend/` green, dev server restarted; `graphify update`
  re-ingested the new files.
- **Checks:** vitest green (all suites, incl. the 14 new cases); eslint
  clean on every touched file; `tsc --noEmit` reports only the stale
  `.next/types/validator.ts` reference to the old `(public)/page` (the
  build regenerates it). Live run against the dev server in headless
  Chromium (SwiftShader): counter 0 → 76 (files) → 78 (chunk) → 79 (held
  ~19 s while the software renderer compiled the scene) → 97 → 100 →
  `done` → gone; `html[data-sx-loaded]` set, `h1` opacity 1 / transform
  none afterwards, scroll unlocked, no console errors beyond the
  pre-existing Clerk and THREE.Clock warnings. Loader screenshots (pure
  CSS, so headless renders it) reviewed at 0/45/90° and mid-spin.
  uiverse.io is behind Cloudflare and refused every fetch, so the loader
  is a rebuild from the owner's screenshot, not the original markup.

## Landing 3D — why the page hangs while loading (diagnosis only, HeckerCreatives)

Profiled the public home against the running Turbopack dev server with a
Playwright CPU profile and a WebGL call tracer (RTX 5060, ANGLE / D3D11,
`KHR_parallel_shader_compile` available). Two main-thread freezes on every
entry, cold or warm: ~7.7 s starting ~2.6 s after navigation, then ~6.4 s
starting ~10.9 s. The loader's counter stops moving during both, which is
the "hang".

**Root cause — synchronous shader compilation at first draw.** three
compiles each material's program the first time it is drawn and, with
`renderer.debug.checkShaderErrors` on (the default), `onFirstUse` calls
`gl.getProgramInfoLog`, which blocks until the driver's compile finishes.
48 programs, 13.5 s total inside `getProgramInfoLog`; `linkProgram` itself
is 1 ms. Breakdown from the tracer:

- the very first `MeshStandardMaterial` program (the ground slab, no maps)
  alone: ~5.5 s — a driver / compiler warm-up cost; the same variant with
  an env map compiles in 0.2 s later on;
- ~12 programs for the procedural venues + ground, no env map: 100–450 ms
  each (~1.9 s), then the post chain's 8 `ShaderMaterial`s (~0.9 s, one at
  ~700 ms);
- 28 `MeshStandardMaterial` programs with `USE_ENVMAP`: ~190–250 ms each
  (~5.6 s) — the kit's 16 distinct define-sets (56 materials) plus the
  ground and venue materials **compiled a second time** once drei's
  `<Environment>` set `scene.environment` after their first frame.

Secondary findings:

- **`city-preload.ts` caches under the wrong key.** three r186's
  `FileLoader` looks up `` `file:${url}` `` in `THREE.Cache`; the preload
  does `Cache.add(url, …)`, so `useGLTF` and the `RGBELoader` re-download
  the GLB and the HDR (seen in the resource timeline at ~10.4 s). Harmless
  on localhost, a real double download on the CDN, and the loader's
  "streamed once" promise is currently false.
- Venue `speckle()` painting is ~200 ms synchronous inside render (baseball
  ~100, soccer ~50, basketball ~45). Texture uploads ~120–140 ms total.
  Meshopt decode does not show in the profile's top entries.

Fix direction (not done): `renderer.compileAsync(scene, camera)` (uses the
parallel-compile extension, polls instead of blocking) before the first
frame, with the env map already on the scene so there is one pass, and a
warm-up frame for the post chain while the loader still covers the canvas;
fix the cache key (`file:` prefix); consider moving the speckle painting
off the render path. Scratch scripts live in the session scratchpad only.

## Landing 3D — the loading hang, fixed (HeckerCreatives; `P1-ART-11` polish, uncommitted)

Follow-up to the diagnosis above. The freeze at ~60–79 % had **two** root
causes, both found by measurement (Playwright CPU profile, a WebGL call
tracer, and finally a Chrome trace), and both are gone:

1. **Synchronous shader compilation on the first frame** (48 programs,
   13.5 s in `getProgramInfoLog`). Fixed in `frontend/src/lib/city/compile.ts`
   + `city-scene.tsx`: the canvas starts `frameloop="never"`; once the kit
   and the environment map have settled (`CityEnvironment` now applies the
   HDR itself and reports), `Warmup` compiles everything through
   `KHR_parallel_shader_compile` and polls `program.isReady()`, feeding the
   loader (`sceneCompileProgress`, scene task 0.4 → 0.95), uploads the
   textures in 24 MB batches one per frame, draws one frame behind the
   overlay, then switches the loop on. Three cache rules had to be honoured
   or the first frame still stalled: the bound render target is in the
   program key (scene compiled with the post chain's input buffer bound,
   screen bound only for the final pass); post passes swap materials at
   render time (walk the pass graph); and the PMREM prefilter runs inside
   `compile()` — its three shaders are pre-issued from a throwaway
   `PMREMGenerator` on a mesh with a position attribute (`hasPositionAttribute`
   is in the key; three's own `compileEquirectangularShader` uses an empty
   geometry and compiles a variant the prefilter never uses).
2. **The venues' speckle grain was rasterised by the GPU process for
   ~5 s.** `speckle()` drew up to 126 000 `fillRect`s per 2048² surface;
   the Chrome trace showed the renderer main thread in
   `CommandBufferHelper::Finish` for 5.1 s behind
   `RasterDecoderImpl::DoRasterCHROMIUM` tasks of 1.4 s / 0.95 s (120 MB of
   raster commands), and every WebGL command behind them — the shader
   links, context creation, the first frame — waited on the same channel.
   That is why the *first* program ever compiled always "took 5 s". Fixed in
   `lib/city/speckle.ts` (pure, tested) + `venue-utils.ts`: dots written
   into an RGBA buffer, one `putImageData` on a reused scratch canvas, one
   `drawImage` under the caller's clip and alpha; dot rounded to whole px
   with the count adjusted so the covered area is unchanged.

Also fixed: `city-preload.ts` cached under the bare url while three r186's
FileLoader reads `` `file:${url}` `` — the GLB and HDR downloaded twice
(`tests/city-preload.test.ts` now proves the cache hit against three's own
FileLoader).

**Numbers (this machine, dev server, RTX 5060):** shader waits at first use
13 545 ms → 69 ms; longest main-thread task 8 814 ms → ~520 ms (the scene
mount: R3F renderer + venue painting, ~220 ms of it the speckle layers —
next thing to trim); loader gone at ~11–12 s → ~6.6 s; counter now moves
continuously (0 → 53 → 73 → 79 → 83 → 90 → 96 → 100). Tests: 696 pass
(6 new files/cases: compile, preload, speckle, loading). Verified with
`tsc --noEmit` (only the known `.next/dev/types` noise) and eslint; no
`next build` because the dev server was live.

**Board:** no status change — this is polish inside `P1-ART-11`, which
stays where it is. Not committed yet; branch
`feature/P1-ART-09-landing-city`.

## Landing hero — one phone screen, no scrolling (P1-ART-09 polish)

Owner asked for the mobile landing to be one view per stop with no inner
scrolling, hero first. Below `lg` the plaza stop overflowed its viewport
~1.6–2× (1371px of content in 844px at 390×844). Now it fits exactly at
390×844, 360×740 and 375×667, and nothing runs off the right edge
(measured with Playwright against the dev server). Desktop is untouched.

- `app/(home)/page.tsx`: phone gutters (`px-5`), headline sized by width
  (`clamp(28px,min(9.4vw,6.2svh),56px)` so "Measure Results." never wraps or
  widens the column), `grid-cols-1`, 15px paragraph (hidden below 620px
  tall), dark ground full-width, **PlatformStrip hidden below lg**.
- `components/landing-hero.tsx`: eyebrow on one line; the two buttons share
  one row at 44px; ImpactCard becomes a three-column number + label band
  (no rings, no arrows); TrustedBrands is one 56px line: a small two-line
  label plus a wordmark **marquee** (`sx-marquee` in globals.css, list
  rendered twice with the copy aria-hidden; reduced motion lets you scroll
  it by hand instead), with "+ More" desktop-only. The sponsors stop reuses
  the band, so it gets the compact version on phones too.

Seen but not touched: at 768px the header nav wraps and runs off the right
edge (a header problem, not the hero). Next: the other four stops on mobile.
Not committed.

## Public header — menu button + full-screen menu below 1280px

Before: below `md` the nav links were just hidden (no way to reach How It
Works / Sponsors / Athletes / NEXT / Login on a phone), and from `md` to
~1152px the inline row wrapped and ran into Login / Get Started (measured:
it only fits from 1280px).

- `components/site-nav.tsx`: the link row now shows from `xl` up. New
  `SiteMenu` (below `xl`): a menu button in the header opens a full-screen
  dark menu over the page. Same links, same "current" logic (a shared
  `useIsCurrent` hook, so the fly-through stop still lights the right item),
  Login + Get Started at the bottom, one screen with no scrolling at
  360×740 / 375×667 / 390×844. Built on the portal `mobile-nav.tsx`
  pattern: portaled to body, circle reveal (opening from the button,
  measured into `--sx-menu-at`; globals.css keyframes now read that var,
  and the portal menu keeps its old top-left origin as the default), exit
  phase, Escape, closes on any link, closes if the viewport grows past
  `xl`, focus moves to ✕ and back to the button, body scroll locked,
  `data-lenis-prevent`. Hash links still fly the drone (tested: tapping
  "How It Works" closes the menu, scrolls to the court stop, and the header
  marks "How It Works" current).
- `components/site-chrome.tsx`: phone header = logo, compact Get Started
  (no arrow below `sm`), menu button; Login moves into the menu below `sm`.

Heads-up: the Next dev badge (`devIndicators: top-right`, moved there in
758547b for the student tab bar) sits on top of the menu button in dev and
blocks taps on it. Dev-only; not changed.

## How It Works + For Sponsors — one view on any device; package "wow" on both

Same approach as the hero: below `lg` each stop is one screen, sized with
`svh`/`vw` clamps so it scales with the device. Measured with Playwright at
320×568, 360×640, 360×740, 375×667, 390×844, 412×915, 430×932, 844×390,
667×375, 768×1024 and 820×1180. Every one fits with nothing past the right
edge. Desktop layouts unchanged (1280/1440/1920 re-measured).

- **How It Works** (`landing-steps.tsx`, page wrapper): steps become compact
  rows (hex badge · number + title · body), one column below lg (was 2-col
  from md). Eyebrow hidden ≤700px tall, intro ≤600px, bodies ≤560px; a
  phone held sideways gets the four rows 2×2. New Tailwind variant
  `short-landscape` in globals.css (below lg, ≤560px tall, landscape).
- **For Sponsors** (`landing-sponsors.tsx`, new `package-carousel.tsx`):
  left-aligned on phones; intro only from 860px tall, feature row as three
  icon columns (hidden <640px), brands band hidden below lg. Packages are a
  snap carousel on phones/tablets: 3D coverflow driven by per-frame `--d`
  / `--ad` (no React render per frame), opens on Growth, tap a side card
  to centre it, tier tabs with fill bars, tier-coloured glow (Starter ice
  blue, Growth brand blue, Enterprise orange), a light sweep round the
  centred card's outline (`@property --sx-sweep` conic), a holographic
  sheen, and a parallax tier numeral. Landscape: copy and carousel side by
  side.
- **Desktop package row "wow"** (owner, same day): a pointer spotlight that
  lights every card's outline near the cursor (even from the gaps), tilt +
  glare on the hovered card while its siblings step back, the sweep on the
  hovered card (the featured one at rest), and a staggered scroll-linked
  arrival (`flight-stop.tsx` now also writes its weight to `--sx-w`).

Gotchas found:
- **Chrome measures scroll-snap positions on the *transformed* box.** A
  coverflow transform on the snap item moved its own snap target
  mid-scroll and smooth scrolls settled ~47px off-centre. Transform an
  inner box (`.sx-pkg-card`), never the snap `<li>`.
- `will-change: transform` rasterized the carousel card at its pre-centred
  scale → soft text. Dropped it, and d<0.01 snaps to exactly 0.
- Headless screenshots of the desktop landing: launch Chromium with
  `--disable-webgl --disable-3d-apis` to force the poster path without
  also turning on reduced motion.

Lint, `tsc` and vitest (696) pass. Not committed.

Follow-up: the phone feature row packed each column to the bottom
(`flex-col-reverse`), so "Flexible Packages" (one line) sat its icon a
line lower than the two-line titles. `justify-end` packs to the top; icons
now share one row at every size.

## For Athletes (athlete marketplace) — one view on any device

Same approach as the other stops (`landing-athletes.tsx`, page wrapper).
Before: 1587px of content in 844px, and ~14px past the right edge. Now fits
at 320×568, 360×640, 375×667, 390×844, 412×915, 430×932, 844×390, 667×375,
768×1024, 820×1180 with no overflow. Desktop matches the original within
1–2px at 1280/1440/1920 (compared against HEAD).

- Copy: headline sized by width (never runs off), intro from 860px tall,
  the four features as icon columns from 700px, the two buttons share a
  row (play icon from `sm`).
- Featured Athletes panel: compact rows (avatar, name + verified, sport |
  tier, round arrow button with an aria-label); tag chips and stats are
  desktop-only (were shown from `md`). Sheds rows as the screen shortens:
  4 from 650px tall, 3 from 580px, else 2; the last visible row drops its
  divider. Name truncation is phone-only (on desktop a long name still
  wraps as before).
- Jobs band: one 48px line with the hero's marquee, hidden under 640px
  tall and in `short-landscape`, where copy and panel sit side by side.

## Closing stop + footer — one view together on any device

`landing-close.tsx`, `site-chrome.tsx`, page wrapper. Before: 1371px in
844px. Now the closing section and the footer share one screen at 320×568,
360×640, 375×667, 390×844, 412×915, 430×932, 844×390, 667×375, 768×1024,
820×1180, with no overflow. Desktop landing (1280/1440/1920) and the normal
footer on public pages (390 and 1440) measure identical to HEAD.

- Copy: headline sized by width, intro from 800px tall, the two buttons
  share a row.
- Panel: the four features become one row of icon + title (sub-lines are
  desktop-only; the row shows from 650px tall), over a compact 2×2 of the
  numbers.
- `SiteFooter compact` (landing only — `(public)` layout keeps the full
  footer): below lg the logo and social rings share the first line
  (`SocialRings` extracted), the blurb goes, the three link columns sit
  side by side in small type and drop under 600px tall. Bottom padding
  respects `env(safe-area-inset-bottom)`.
- Landscape (`short-landscape`): copy and panel side by side, footer as
  one slim row.

With this, every landing stop (hero, how it works, sponsors, athletes,
closing + footer) is one view below lg. Lint, `tsc`, vitest (696) pass.
Not committed.

## Desktop bands — brands no longer collide at 1024–1380px; jobs band marquee

Owner reported the hero's "Trusted by leading brands" band broken on a
~1195px screen ("+ More" into "Under Armour"). Measured all three bands at
1024–1920: at the mockup sizes the label + five wordmarks + "+ More" need
~1330px; the sponsors-stop tag collided up to 1280; the athletes-stop jobs
band (7 long jobs + label + "+ Rates" + tag) overlapped at every width
below 1920. (Pre-existing, made worse by the phone-marquee wrapper's
`min-w-0` letting the list overlap instead of pushing.)

- Brands band (`landing-hero.tsx`), on the owner's call: wordmarks keep
  the mockup size and brands drop from the end as the screen narrows —
  three below 1180px, four below 1380px, all five from there (`FIT`,
  `lg:max-[…]:hidden`), spreading out evenly. Phones still marquee all five.
- Sponsors-stop tag (`SponsorsTag`) from 1360px only.
- Jobs band (`landing-athletes.tsx`): marquee at every width
  (`.sx-marquee-all` in globals.css; reduced motion → scrollable strip).

Verified with a Playwright check (≥16px clear between every visible item,
nothing cut at the band edge) at 1024, 1100, 1179, 1180, 1195, 1280, 1366,
1379, 1380, 1440, 1536, 1920 on all three bands. Lint, `tsc`, vitest pass.

Follow-up (owner): even without collisions, five brands at ~1430px still
read as cramped, and the group sat off-centre (it filled the space between
the label and "+ More"). Reworked the desktop brands band:
- Three-column grid: label left, "+ More" (+ sponsors tag) right at the
  same 6vw margin, wordmarks centred on the band's middle at mockup size
  with a fixed 80px between them (dividers centred in the gaps).
- A brand shows only when the centred group, gaps intact, clears both
  sides + 32px. Cut-offs derived from rendered widths (label 6vw + 255,
  "+ More" 6vw + 92, groups 459/695/914px): 2 brands always, 3 from 1175px,
  4 from 1445px, 5 from 1695px. Sponsors tag from 1790px (needs +204px on
  the right; never costs a brand). Derivation is in the FIT comment in
  `landing-hero.tsx`: re-derive if a brand, the label or the gap changes.
- Label pinned to one line on desktop (it was wrapping in tight columns).
Checked at 14 widths (1024–2560, both sides of every cut-off) on both
bands: group 0px off centre, gaps 80px, ≥73px clear to label and "+ More",
label one line.

Follow-up 2 (owner: "now too much space" at ~1907px): with a fixed 80px gap
the centred group left big empty stretches either side. Now:
- Side columns are fixed and equal (6vw + 256px, the label block's width),
  the middle column holds the wordmarks with `justify-evenly`, so the
  spacing grows with the screen and the group stays centred; "+ More"
  sits at the start of the right column, right after the last brand.
- A brand is added only once, spread out, it keeps ≥ 64px from the label
  and "+ More" (so ≥ 104px between wordmarks): 3 from 1212px, 4 from
  1508px, 5 from 1784px. Sponsors tag from 1784px too (fits in the right
  column, ≥ 64px from the edge).
Checked at 1024–2560 incl. both sides of each cut-off on both bands: 0px
off centre, gaps even (spread 0), ≥ 64px clearances, label one line.

## Hero "wow" pass (owner ask) — effects only, no layout change

New `components/hero-fx.tsx` (client islands: ScrambleText, Magnetic,
TiltSpot) + `.sx-line`/`.sx-hero-shimmer`/`.sx-sheen`/`.sx-scan`/`.sx-tilt`/
`.sx-impact-spot`/`.sx-scroll-cue` in globals.css.
- Headline: each line wipes up out of a clip-path mask after the loader,
  staggered; "Measure Results." gets a periodic highlight glide (a
  data-text copy painted with a bright band, clipped to the glyphs, so the
  shared `.sx-hero-gradient` is untouched).
- Eyebrow words decode in from random glyphs (real text holds layout and
  is what screen readers get).
- Hero buttons: magnetic pull toward a nearby fine pointer + hover sheen.
- Impact card: slow scan line over the glass; with a fine pointer it tilts
  and a spotlight runs round its outline. No "live" claims (fixture data).
- "Scroll to explore" cue bottom-left on desktop (hidden ≤820px tall).
- Reduced motion: no wipe/decode/shimmer/scan/cue/tilt; noscript shows all.
Also fixed: hero on a phone held sideways overflowed 70px (never tested
landscape before) — copy and card side by side, band hidden
(`short-landscape`). Verified: phones 320×568…932×430 and desktop
1280/1440/1920 still fit exactly; effects measured firing (lines end at
full reveal, decode settles on the right text, button pulls 42px toward a
nearby pointer, card tilts, cue clears the buttons). Lint/tsc/vitest pass.

Bug (owner): with the cursor between the hero buttons, the magnetic pull
drew both toward it and "Learn More" slid over "Get Started" (reach 90px,
30% follow, no cap). `Magnetic` now caps the lean (maxX 8px / maxY 5px,
reach 40px, 18% follow) — under half the buttons' 24px gap, so two
neighbours drawn together keep ≥ 8px. Verified by sweeping the cursor
across the whole button row at five heights (1440 and 1024): minimum gap
8px, max movement 8px.

## How It Works "wow" pass — effects only, no layout change

`landing-steps.tsx` + `.sx-step*`/`.sx-wipe`/`.sx-orbit` in globals.css;
reuses `TiltSpot` (hero-fx.tsx) and `.sx-impact-spot`.
- Active loop: the four steps take turns (8s, 2s each, per-card `--i`
  delay): 2px outline flare, hex glow + 1.07 swell, lit tick stretch — the
  process reads as running. Sampled: one card lit at a time, 01→04 order.
- Arrival on the flight weight `--sx-w`: heading wipes in (clip-path),
  cards rise staggered; settles to zero offset at the stop.
- Dashed HUD orbit (+ a bead) turning round each hex badge.
- Big outlined step numeral behind each card (fainter on phones so it
  doesn't fight the body text); drifts against the pointer tilt.
- Desktop: TiltSpot tilt + outline spotlight per card.
- Reduced motion: no loop/orbit/drift; arrival and wipe remain.
Verified: every device (320×568…1920×1080, landscape incl.) still fits
exactly with no horizontal overflow; lint/tsc/vitest pass.

## For Sponsors "wow" pass (copy side) — effects only

The packages already had their effects; this adds the rest of the stop
(`landing-sponsors.tsx`, `.sx-wipe-flip`/`.sx-rise`/`.sx-ping`/
`.sx-rule-pulse` in globals.css):
- Heading wipes in on the flight weight — from the right on desktop
  (right-aligned block), from the left on phones.
- "Real Measurable Impact." gets the hero's highlight glide
  (`.sx-hero-shimmer`, data-text copy).
- Feature icons: a radar ring pings out of each in turn (6s, 2s apart);
  the features rise in staggered on arrival.
- A light runs along the rule into "All six packages", which now takes
  the capped Magnetic lean + hover sheen.
- Reduced motion: no ping/pulse; wipe and rise stay (scroll-driven).
Verified at 320×568…1920×1080 incl. landscape: fits exactly, desktop card
positions unchanged, pings take turns, rule light travels, carousel still
snaps to 0.000. Lint/tsc/vitest pass.

## Athlete marketplace "wow" pass — effects only

`landing-athletes.tsx` + `.sx-slashes`/`.sx-row`/`.sx-avatar-ring` in
globals.css; reuses `.sx-wipe`, `.sx-hero-shimmer`, `.sx-ping` (now
colour/cycle via `--ping`/`--ping-cycle`, cyan 8s here), `.sx-scan`,
`.sx-sheen`, TiltSpot + Magnetic (hero-fx.tsx).
- Copy: heading wipe on the flight weight; "Build Lasting Partnerships."
  highlight glide; a light runs through the "////" slashes; radar pings
  pass through the four feature icons; buttons get the capped magnetic
  lean + sheen.
- Panel: rows slide in from the right, staggered, on arrival; avatar
  gradient rings turn slowly (conic on the registered `--sx-sweep`); hover
  sweeps a light across a row (one pass, fades out: rows don't clip, so
  it must not park outside); slow scan line; gentle tilt (max 3°) +
  outline spotlight under a fine pointer.
- Reduced motion: no slash run / ring turn / pings / scan / tilt.
Verified at 320×568…1920×1080 incl. landscape: fits exactly, desktop
panel geometry unchanged, rows and wipe settle, loops run; buttons (stacked
at 1280/1440, side by side at 1920) never closer than 11px under the
magnetic sweep. Lint/tsc/vitest pass.

## Closing stop + footer "wow" pass — and CountUp fixed on the landing

- **CountUp (`count-up.tsx`, shared):** inside a landing flight stop it now
  counts when the stop is actually showing (opacity > 0.5) *and* the loader
  has released the page, and resets to 0 when the stop hides, so it counts
  up on every arrival. Before, IntersectionObserver fired for every stop at
  load (they all sit in one sticky stage), so the closing numbers finished
  unseen and the hero card's finished behind the loading screen. Outside
  the landing (portals, NEXT pages, analytics) behaviour is unchanged.
- Closing copy: heading wipe, "Real Partnerships." highlight glide, light
  through the "///" slashes, a pulse ring rippling out of the final "Get
  Started" (`.sx-cta-pulse`), both buttons Magnetic (capped 5px: their gap
  is 16px) + sheen.
- Panel: rises in on arrival, scan line, gentle tilt + outline spotlight,
  the four feature icons glow in turn (`.sx-glow-turn`); the numbers roll
  up on arrival (via the CountUp fix).
- Footer: a light travels the glowing top rule (all pages); links draw an
  underline from the left on hover (`.sx-underline`, all pages); a giant
  faint outlined SPONSORX wordmark behind the landing footer only
  (`compact`). Social rings get no hover (they aren't linked yet).
Verified: every device fits exactly; desktop panel/footer geometry
identical to the earlier baseline; public-page footer unchanged (no
wordmark); closing numbers read 0 until arrival then roll 0→148; closing
buttons never closer than 6px under the magnetic sweep. Lint/tsc/vitest
pass.

## Header / navbar "wow" pass — and the nav now links to pages

- **Nav targets changed (owner):** nav items are separate pages, not
  landing sections. For Sponsors → `/packages`, For Athletes → `/join`,
  NEXT → `/next/about`. **How It Works and About have no page yet** — they
  render inert (`pending`) until someone builds them. "Current" is now the
  pathname only (Home on `/` exactly); the flight-stop tie in the nav is
  gone. The landing's own hero/closing buttons still fly the drone by hash.
- **Capsule morph (`header-fx.tsx`, new):** past 24px of scroll the
  full-width bar morphs into a floating rounded glass capsule
  (`data-scrolled`, hysteresis at 8px). `<header>` is fixed at 72px, so
  nothing below shifts; the ring is an inset box-shadow, not a border.
- **Progress rule:** the bottom glow line fills with flight progress on the
  landing (flight store subscription, no re-render) / page scroll
  elsewhere, with a glowing head; on the landing, a tick per flight stop
  lights as the drone passes it.
- **Pointer spotlight** inside the glass, and on the capsule's edge.
- **Link row (`site-nav.tsx`):** one glass lens (hover/focus) and one
  holo underline with a glint glide between links (overshoot ease); the
  underline rests on the current page. Letter-roll hover (`RollLabel`, also
  on Login + Get Started). Links stagger in on arrival (held on the landing
  until `data-sx-loaded`).
- **Get Started:** Magnetic (capped 8px) + periodic shine sweep.
- All motion stands down for reduced motion. CSS: `.sx-bar*`, `.sx-nav-*`,
  `.sx-roll*`, `.sx-shine` in globals.css.
Verified in the running dev server (Playwright): 1280/1440/360 top and
capsule states, no wrap, no horizontal overflow at 360, landing nav items
visible after the loader, 5 stop ticks, no console errors. Lint + tsc pass.

## Athletes-stop jobs band — spacing + edge fixed (owner: "the fade is ugly, the spacing is ugly")

- **Spacing:** dividers were anchored 20px left of each item, so every
  slash hugged the end of the previous word (40px after it, ~0 before).
  Now each item has equal padding (lg 32px, phone 16px) and a short 22px
  slash centred on its left edge → exactly midway, 64px label-to-label at
  every desktop width (measured). Every item carries the slash, so both
  marquee copies are identical and the loop has no seam.
- **Edges:** the 8% vertical mask fade never met the band's slanted plate
  edge, leaving half-dissolved stubs ("MBASSADOR", "MONTHL"). Desktop now
  has a plate at both ends (label left, "+ Rates" + tag right), each with
  a glowing 28° edge; the ribbon runs 64px under each and is clipped along
  both slants (`.sx-jobs-clip`), so jobs slide out exactly under the glow
  line. All slants share 28° (dividers were 22°). Phone keeps a short
  20px fade (no plates there).
- Hovering the ribbon pauses it.
Verified at 1920/1280/390 on the running dev server. Lint + tsc pass.

## P1-ART-12 — page transition between public pages (owner: "a 2nd loader … wow factor + awwwards")

Raised by the owner: For Sponsors / For Athletes → Home replayed the boot
loader. Now two separate screens:

- **Boot screen (`P1-ART-11`, rescoped):** once per document. `LandingLoader`
  renders "gone" when `html[data-sx-booted]` is set (an attribute, not a
  module flag, so dev HMR does not replay it; a real reload gets a fresh
  `<html>`). Also mounted in the `(public)` layout with `city={false}`
  (waits on fonts + load only), so a hard refresh of /packages, /join, /next…
  shows it too. Fix on the way: its unmount cleanup no longer unlocks scroll
  / sets `data-sx-loaded` once it has already released the page — leaving a
  public page used to clobber the transition's lock and the home's held
  entrance.
- **Page transition (`components/page-transition.tsx` + `.module.css`, pure
  maths in `lib/page-transition.ts`):** mounted in the **root layout** so it
  survives the (home)↔(public) group change. One window capture-phase click
  listener cancels the default; Next 16 `<Link>` checks `defaultPrevented`
  and stands down, so no link component was touched. Cover: the brand X grows
  from the click point in orange → blue → ink (WAAPI `clip-path` polygons, 12
  points, twisting 30° into place), "Now entering" + the destination name
  rising per letter, grid, sweep, giant outline X drawing itself, corner
  readouts (000–100 %, path). Push after cover (prefetched on click). Hold
  until arrived — for `/` the real load-store number (store reset at push,
  content = 1); else 2 frames after commit; min hold so the name reads;
  12 s safety. Reveal: an `evenodd` X-shaped hole opens in ink → blue →
  orange (coloured rims), `data-sx-loaded` set as it opens so the hero
  entrance plays through it. Back/forward: caught during render (state
  adjusted while rendering — the lint forbids setState in effects), starts
  covered, reveal only. Only public-site ↔ public-site moves
  (`SITE_PREFIXES`); /login, portals and /r keep plain nav. Reduced motion:
  plain ink fade.
- Tests: `tests/page-transition.test.ts` (12) — the X covers every viewport
  point from any click at `coverRadius` (3 viewports × 5 clicks), constant
  point counts per keyframe set, route list/labels.

Verified on the running dev server (Playwright, frames frozen via
`getAnimations()`): hard /packages → boot; nav Home → transition, no boot,
scroll locked + entrance held during hold, city counter live; home → /join;
back → instant cover then reveal; hard /join → boot; phone 390 cover/reveal;
reduced motion ~1.3 s fade; Login link → plain nav. No page errors. Lint,
tsc and the full frontend suite (708) pass. Phase 1 doc: `P1-ART-11`
definition rescoped, `P1-ART-12` added; tracker row 267 (Order 32.9, Code
review) with autofilter / CF / Status validation extended to 267; today's
Stage Progress snapshot "Days left" 92 → 93 (recomputed from the rows).

## Hero top — 1px horizontal scrollbar fixed (owner: "there's a x-scroll showing")

Cause: with the header bar full-width (top of the page, before the capsule
morph), its bottom progress rule spans the viewport; the last flight-stop
tick sits at `left: 100%` centred with `translate(-50%)`, so half its 1px box
hung past the right edge → document 1441px in a 1440px window → Windows
shows a horizontal scrollbar. Gone once scrolled (capsule insets the rule
22px). Fix in globals.css: `.sx-bar-tick` and `.sx-bar-head` positions are
`clamp()`ed inside the rule (the glow is box-shadow, which never scrolls).
Verified scrollWidth == clientWidth at 1440/1280/390, scroll 0/40/240, with
no element past either edge.

## Walkthrough: step 4b and the Hawks' set-up shot; sponsor approval raised

- **The gap.** The user noticed step 4 never shows BTG approving the sponsor. That step doesn't exist in the product:
  - The public request (P8-INT-06) becomes only a Zoho lead.
  - A Zoho Account syncs in as a sponsor row, but nothing creates a sponsor login. Only seed data has SPONSOR_ADMIN users.
- **Deck (v9).**
  - New step 4b is marked "not built yet" with that explanation, and the "not built" list is updated.
  - Step 5d now shows the Hawks' Earnings page before set-up (with "Set up payouts with Stripe ↗") and after it.
- **Raised in the Phase 2 doc and tracker:**
  - **2S1-BE-05** (4d, Ready): BTG review queue for sponsor requests. Approving creates the sponsor, its contact and a SPONSOR_ADMIN login, links Zoho without duplicating, and emails a sign-in link.
  - **2S1-FE-03** (3d, Blocked on BE-05): BTG's review screen.
- Phase 2 is now 75 tasks, 293 days.

## 2S1-BE-05 — BTG approves a new sponsor and opens the account (Code review)

- **Requests.** The public form's request (`Inquiry`) now also waits for BTG in SponsorX, and still goes to Zoho as a lead.
  - New fields: `state` (NEW / APPROVED / DECLINED), `categoryText` (the business's own words, taken from the brief's "Brand category"), and the decision fields.
  - Migration `20260930170000_sponsor_requests`.
- **Routes:**
  - `GET /sponsor-requests?state=` — one tab at a time, with every tab's count.
  - `GET /sponsor-requests/:id` — the brief answers, suggested categories, and the checks (email already in use, same-named sponsors, and whether they came from Zoho).
  - `POST /sponsor-requests/:id/decision`.
- **Permissions.** `inquiry.approve` goes to BTG_ADMIN and SALES (own tenant) and SUPER_ADMIN (any). Matrix §11 updated; digest is now `77c16c7e171c8dc2`.
- **Approving** is one transaction:
  - It creates the sponsor with the categories BTG picked, the primary contact, and a SPONSOR_ADMIN login for the request's email (an `invite:` placeholder that the first sign-in claims).
  - It queues the `sponsor.accountOpened` email and the new `zoho.pushSponsor` job (the Account with SponsorX_ID, then the primary Contact).
  - Refusals: an email already in use (409); a same-named sponsor must be linked or confirmed as a new business; a sponsor that already has a login can't be linked.
- **Declining** needs a note, which is emailed (`sponsor.requestDeclined`). A request is decided once.
- **Tests.**
  - `tests/phase2-sponsor-requests.test.ts` (14 tests) walks the form, the queue and approval, then Dana signs in as Harbor Coffee's SPONSOR_ADMIN; it also covers the refusals.
  - `zoho-sync` now tests `pushSponsor`, and the tenant sweep covers the new routes.
- **Board.** 2S1-FE-03 moved to Ready; it's waiting on the Claude Design SR-* artboards.

## 2S1-FE-03 — BTG's sponsor-request review screen (Code review)

- **What's built.** From Claude Design `SponsorRequests.dc.html` (SR-1…SR-8):
  - `/admin/sponsor-requests`: Waiting / Approved / Declined tabs with counts.
  - `/admin/sponsor-requests/[id]`, which shows:
    - the business and contact, and what they told us;
    - business-type chips, with the suggested one pre-picked;
    - the checks, and the choice to link to an existing sponsor or create a new one (it can't be linked when that sponsor already has a login);
    - the approve confirmation, and the decline note;
    - once decided: the account's progress (Requested → Approved by BTG → Sign-in email sent → Signed in), or the note that was sent.
  - It's in the admin menu for SUPER_ADMIN, BTG_ADMIN and SALES.
- **API addition.** `GET /sponsor-requests/:id` now returns `progress`: the categories, who decided, `emailSentAt` (from EmailSendLog) and `signedIn` (whether the login has been claimed). Nothing on the screen is assumed; an unsent email shows as "Queued".
- **Checks.** Walked in a browser: approve (Bayside Bakery) and decline (a Harbor Coffee name match). `tests/sponsor-requests-live.test.ts` added. Frontend 765 tests pass; build, lint and tsc clean.
- **Still to do.** The walkthrough deck's step 4b still says "not built yet".
