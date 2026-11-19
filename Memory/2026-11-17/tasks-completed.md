# 2026-11-17 · tasks completed

## Staging kept level with main (rcfworks)

- **#446 deployed** (`fb8f0ea`, late on 2026-11-16): Jan's POL-FE-90…98 — sponsor shop, cart,
  checkout and orders; athlete sales, sale and payouts redesigns; Log out in the portal nav.
- **#448 deployed** (`486eefd`): Jan's POL-FE-99 Help & FAQ center (one per portal, under
  `/<portal>/help` — there is no top-level `/help`) and the POL-FE-100 `/contact` redesign.
- Both via `npm run deploy staging` after main's CI was green; api and web reported success.
  Smoke: `/`, `/next/schools`, `/contact`, `/login`, `/s/<code>` → 200; portal pages and
  `/<portal>/help` → 307 to `/login` when signed out. (`/sign-in` is a 404 — the app's sign-in
  page is `/login`.)
- `main_development` and `main` carry the same code; no other PRs were open.

## #449 (POL-101) — the lint failure fixed (rcfworks)

- **Cause:** CI's "typecheck · lint · unit · authz matrix" job failed at lint —
  `backend/src/contracts/student.ts:116`, `HIDDEN_CHARS`, held the invisible characters
  themselves (zero-width space, LRM/RLM, bidi embeddings/overrides/isolates, BOM), which
  `no-irregular-whitespace` rejects. Typecheck and unit tests never ran.
- **Fix (`7e7cbe71`):** the same class written as `\u` escapes. Checked the old and new
  pattern against U+200B, 200E, 200F, 202A–202E, 2060, 2066–2069, FEFF and a control
  character (all match), and `A` and the emoji joiner U+200D (neither matches).
- **Checked locally:** security scripts, secret scan, dependency audit, lint, both builds;
  backend 269 files / 3,874 tests, frontend 204 files / 2,380 tests. CI on `7e7cbe71`: all
  four checks green, e2e included. Ready to merge.

## Tracker

- No change needed from rcfworks: POL-BE-88 and POL-FE-89 were already moved to Done (and the
  2026-11-16 Stage Progress row appended) in Jan's tracker copy carried by #447 / #449.

## Next (rcfworks)

- Audit fix queue, item 5: the advisor desk (`/advisor`, `/advisor/review`) has no link in
  the admin menu (`frontend/src/lib/admin-nav.ts`). Plan first.
- Raise Jan's athlete-portal rows from the 2026-11-16 audit (guardian deliverable upload,
  a minor's always-failing buttons, the wizard's held message, offer → order back link and
  Stripe wording, "List it"). New polish numbers start at 105.

## HeckerCreatives

## POL-FE-105 · the admin dashboard redrawn as a card grid (polish.md item 105)
- **Asked:** the owner wanted `/admin` to be "the dashboard itself like in the image provided", easy to understand, keeping the Mission Control theme. They sent three dashboard screenshots: ring KPI cards, a line chart, bar and donut cards, a gauge and a table.
- **Before:** four header tiles, then up to 22 queue cards of equal weight, then three lists. There was no chart and no period.
- **Now:** a card grid on the unchanged stage (dark, steel and cyan, chamfered glass, corner brackets, floor grid). Every card has an icon, a title and one line saying what it shows and for when.
  - Top row: "Dashboard", a Live pill, and a **7 / 30 / 90 days** switch (`?days=`) for the fan numbers. Everything else on the page is "now".
  - Four number cards: Waiting on you, Live campaigns, Active athletes, Rewards used (with a change pill).
  - **Fan activity:** a two-line chart (claimed / used) with a crosshair tooltip, beside **Your to-do list**. The list shows only desks with work, oldest first, and scrolls inside the card on wide screens.
  - Three cards: Delivery progress (gauge), Fan journey (bars), Athlete network (donut, plus earnings paid of raised).
  - Posts to review beside System health, then Live campaigns as a table. On a phone the table folds to the name, a status line and posts done.
- **Data:** the board's four reads, plus `GET /operations/analytics?days=` and `GET /operations/network-metrics`. A card the role gets a 403 for is left out and named in a line at the foot. No API change.
- **Files:** `app/(app)/admin/(board)/{page.tsx,loading.tsx,dash.css}`. New: `components/ops-dash.tsx` (server kit), `components/ops-activity-chart.tsx` (client island), `lib/ops-dash.ts` (pure), `tests/ops-dash.test.ts`. `ActionRing` gains `bare`. The old `OpsHeader` / `QueueDeck` / `CampaignPanel` / `ReviewPanel` / `SystemsPanel` exports stay in `ops-stage.tsx`, unused by the page.
- **Chart colours:** blue `#2a8ee0` / orange `#e06816`, validated with the dataviz palette script on the dark surface. Teal failed against blue (normal-vision ΔE 10), so the donut uses a neutral track for its third part.
- **Checked:**
  - frontend vitest green; tsc and eslint clean.
  - `npm run build` in a detached worktree. Teardown emptied `node_modules/rimraf` again; restored 2.7.1 from `npm pack`, and live dev `/login` answers 200.
  - Walked live as the QA BTG admin at 1440 (30 and 90 days, chart hover) and 390: no sideways scroll.
- **Follow-ups from the owner, same day:**
  - **"When fetching data, always have a loader"**, with Facebook's and Medium's skeleton screens as the kind.
    - `(board)/loading.tsx` is now a card-by-card skeleton of the dashboard (`components/ops-skeleton.tsx`).
    - The period switch navigates inside a transition (`components/ops-pending.tsx`). Only the period-dependent content swaps to its skeleton, with a top bar and an aria-live line.
    - `loading.tsx` only covers arriving on a route, never a `?param=` change on the same page, so in-page re-fetches need their own loader.
  - **Phone lists ran "too long":** the to-do list, posts to review and live campaigns now scroll inside their cards below `lg`. Each has a sticky fade that clears at the end, the table's header is pinned, and "See all" sits outside the scroll.
  - **Header bug the owner found:** a campaign row showed above the table's pinned header on a phone, because a sticky `<th>` in a collapsed table mis-paints in some browsers. The column names are now a plain row above the scroll box, and the real `<thead>` is zero-height and screen-reader-only. A matching `scrollbar-gutter: stable` plus `scrollbar-width: thin` keeps the columns aligned at 390, 800 and 1440.
  - **Checked:** 2,381 / 2,381 frontend tests; tsc and eslint clean. Walked live with the data request held (skeleton swap, then cleared) and at 390 (both scroll boxes scroll, the fade clears at the end).
- **Status:** Code review on the Polish sheet (row 142). The change is not committed yet.

## POL-FE-106 · /admin/applications redrawn like the athlete Inventory (polish.md item 106)
- **Asked:** the owner wanted `/admin/applications` done "like listing and inventory inside the athlete's dashboard", with animation and wow, easy to understand, keeping the Mission Control theme. The player-card board was "so confusing for a human".
- **Before:** four KPI tiles, then four pill tabs counting the same applications again, then a grid of player cards. No word on the steps, and the drawer's next move sat at the bottom.
- **Now:**
  - The header is the title, a Live · Postgres pill and one line on what the page is for. The KPI tiles are gone.
  - **Four status cards, numbers only** (Needs review / Approved / Rejected / All): icon, count ticking up, one line of what each holds; Needs review turns orange with "n waited over 2 days". They were the tabs at first; after the owner's "don't make this a filter", the status filter is a separate tab bar in the toolbar (sliding marker, ←/→, `?tab=` unchanged). The toolbar is one grid (`.sx-ap-bar`). On a phone, after the owner's "ugly": tabs; search plus icon-only List/Cards; the three filters on one row.
  - **How it works** is a header button (owner follow-up) opening a panel: the four steps on a rail with a running light, then a key to the list (pulsing dot, orange, fit score). The demo shows two steps.
  - **List by default:** athlete · fit score · waiting (48-hour bar) · status pill + next step · Review →. Cards (the old player cards) are the other view, remembered in `localStorage` `sx-ap-view`. A row folds on a phone.
  - **Loaders:** a skeleton of the page on arrival (`(queue)/loading.tsx`). On every tab, filter, search or page change (owner: "add a loader too"): a spinner on the selected tab, a pager placeholder, a running bar, "Loading applications…" and skeleton rows, held at least 500 ms (`useLoaderShown`) so a fast answer doesn't flicker. The review popup's action buttons spin while saving. Checked with the RSC request held for 3 s and unthrottled: shown for about 0.7–1.4 s.
  - **Review panel (owner follow-up: "too ugly ... too confusing"):** header with status avatar and pill, then the tracker, then "Your next step" with Go to it (scrolls to the decision and glows), four At-a-glance tiles (fit score, guardian, conflicts, audience), the score's parts, then the decision as a numbered step. Under review that step is three choice cards (Approve / Ask for more info / Reject), a note box asking only what that choice needs, and one button named for the action, which says why when it is disabled. No pinned bar, no reject arm. Then, on the owner's "instead of slide", it became a centred 46rem popup (`.sx-rv-modal` / `.sx-rv`, scale in and out), with the facts in one row and the choices side by side on a desktop. Styles `.sx-rv-*` in applications.css.
- **Trap 3:** `scrollIntoView` inside a popup also scrolls any `overflow: hidden` ancestor, the frame included: the header slid out and a blank strip appeared. Scroll the body with `scrollTo`, and give the frame `overflow: clip`.
- **Trap 2:** a `clip-path` hides a translated `::before` but doesn't stop it widening the page. The row's hover scan made 1,100px of sideways scroll whenever the mouse sat on a row. Give anything with a sliding pseudo-element `overflow: hidden`, and measure `scrollWidth` with the mouse over the content, not at 0,0.
- **Trap:** `globals.css` styles every `.sx-ops [role="tab"]` as a rounded pill (padding, radius, background). The status cards are `role="tab"`, so their rules are scoped `.sx-ops .sx-ap-stats .sx-ap-stat` to win. Any other card-shaped tab on the admin stage needs the same.
- **Files:** `components/applications-desk.tsx` (list, cards, status cards, flow, tracker, skeleton), `components/scout-stage.tsx` (header only now), `lib/applications-ui.ts` (`waitShort`, `STATE_NEXT`, `trackSteps`, `nextMove`), `app/(app)/admin/applications/(queue)/{page.tsx,loading.tsx,applications.css}`, `tests/applications-board.test.ts`. No API change. The e2e loop's selectors (a button named for the athlete, the drawer's dialog name and texts) are unchanged.
- **Checked:**
  - 2,392 / 2,392 frontend tests; tsc and eslint clean.
  - Walked live as the QA BTG admin at 1440 and 390: All and Needs review, drawers for an active and an info-requested application, List ↔ Cards. No sideways scroll, no console errors.
  - Not built in a worktree, e2e not run.
- **Status:** Done (Polish row 143). Merged 2026-11-17: PR #452 into main_development (d671aca0), then PR #453 into main (6b67bd86). CI typecheck/lint/unit/authz and e2e were green. The dependency audit was red on a moderate Next.js advisory (GHSA-mfr8-8qww-v76h) that main_development already had; the secret scan was clean.
- **Hotfix after the merge (owner's error report):** the Cards view crashed with "Cannot read properties of undefined (reading 'tone')". The API's AthleteState has a ninth value, `FEATURED` (P9-BE-11: an editorial profile nobody applied for, All tab only), which the frontend's `LiveApplicationState` never listed. The old badge rendered blank for it, but the new `STATE_NEXT[s].tone` threw. `FEATURED` is now in every map ("Featured", a "Featured → Claimed → In review → Active" tracker, "Nothing yet…", "added" not "applied"), and `stateLook()` plus `default:` branches fall back for any future state. Tests: 2,394 / 2,394. Walked All at size 60 in List and Cards (23 items, 6 featured) and the featured popup: no errors. Then the cards stopped being a filter (see above). Both changes are local and still need to be shipped.

## POL-FE-109 · /admin/new-signups redrawn like the athlete Inventory (polish.md item 109)
- **Asked:** the owner wanted `/admin/new-signups` done "like listing and inventory inside the athlete's dashboard", with animation and wow, easy to understand, keeping the Mission Control theme, plus "loaders and how it works". Same brief as `/admin/applications` this morning (POL-FE-106), so it follows where that one ended up.
- **Before:** four KPI tiles, five kind chips with the same counts again, a "Needs review" toggle with a third copy of the held count, and one table with a two-letter code for the kind. A filter change only dimmed the table. Nothing said that sign-ups are approved without staff.
- **Now:**
  - Header: title, Live · Postgres pill, **How it works**, **Sign-up rules →**, and one line: everyone is approved automatically, you only step in for Needs review.
  - **Four status cards, numbers only:** Needs review (orange when anything is held, a green tick when not), Approved automatically (with its share as a bar and a percent), All sign-ups, and Who signed up (a bar per kind, "· n to review" beside a kind with held ones).
  - **Toolbar:** two tabs (All sign-ups / Needs review, with a pulsing orange dot when something is held), List ↔ Cards, search, and the kind as an "All kinds" menu. The URL is unchanged and old `?tab=` links still work.
  - **List:** who (icon mark per kind) · kind in words · signed up · status pill and why · Review (orange, held) or Open. The whole row is the link. Cards are the other view.
  - **How it works:** five steps on a rail, then a key to the list.
  - **Loaders:** a skeleton of the page on arrival; on every tab, kind, search or page change a spinner on the tab, a running bar, "Loading sign-ups…" and skeleton rows, held 0.5 s. The sensitive-edits list has its own.
  - **Sensitive profile edits:** one glass card per edit, orange edge on the ones waiting for Apply / Decline, in its own `<ServerList>`.
- **Shared kit:** `components/desk-kit.tsx` now holds the tab bar (`SegTabs`), `ViewToggle` / `useDeskView(key)`, `StatusPill`, `useLoaderShown`, `ListLoading`, `LoadSwap`, `PagerGhost` and the `HowItWorks` panel. `applications-desk.tsx` imports them (about 290 lines shorter, behaviour unchanged). A third admin desk should start from the kit and import `applications.css` plus its own sheet, as this page does.
- **Trap:** a link stretched over its row (`a::after { position: absolute; inset: 0 }`) stops covering the row if the link itself has a `clip-path` (it clips the pseudo-element) or a `filter` (it becomes the containing block). Keep the link bare and style a span inside it. Playwright then refuses `locator.click()` on anything under the link ("intercepts pointer events"); click by coordinates in a walk.
- **Trap 2:** `<ServerList>` has one pending flag. Two lists in one `<ServerList>` would both show a loader when either pages, and swapping a list for its skeleton unmounts client state inside it (a decline note being typed). Give each list its own.
- **Help center:** the `check-new-signups` article's words and capture selector follow the new controls, and its five pictures were re-captured with `HELP_ONLY=check-new-signups npm run help:shots -- admin` (only those five manifest entries changed).
- **Files:** new `components/{desk-kit,signups-desk,signup-stage}.tsx`, `app/(app)/admin/new-signups/(stream)/signups.css`. Changed `(stream)/{page.tsx,loading.tsx}`, `components/{sensitive-edits-section,applications-desk}.tsx`, `applications/(queue)/applications.css`, `lib/new-signups-live.ts`, `lib/help/admin.ts`, `tests/new-signups-live.test.ts`. Removed `components/{intake-stage,intake-fx}.tsx`. No API change.
- **Checked:**
  - 2,402 / 2,402 frontend tests; tsc and eslint clean.
  - Walked live as the QA BTG admin at 1440, 768 and 390 (both tabs with the response held, kind menu, search, Clear all, Cards, How it works, `?tab=review`, `?demo=loading`, `?demo=empty`, a row click). No sideways scroll.
  - `/admin/applications` walked again on the shared kit.
  - Not built in a worktree, e2e not run.
- **Seen, not fixed:** the athlete sign-up's own page logs a React list-key warning (`LiveSignupReview`, a child from `LiveSignupProfile`). It predates this change.
- **Status:** Code review on the Polish sheet (row 155). Today's Stage Progress snapshot is appended (row 51; Phase 1 is unchanged from 2026-11-16, so the numbers are the same). Not committed.
- **Renumbered 2026-11-19:** this was logged as POL-FE-107 / item 107. The pull of main_development showed rcfworks had taken 107 for "+ New request" the same day, so it is POL-FE-109 / item 109 in polish.md, the tracker (Polish row 155) and the code comments.

## POL-FE-108 · one organization's page and one sign-up's page, redrawn (polish.md item 108)
- **Asked:** the owner named `/admin/onboarding/seed_onb_hawks` and `/admin/new-signups/guardians/seed_grd_1`: "too confusing for a human … having many information at once can haywire a human's brain". The guardian page shares `LiveSignupProfile` with the athlete page, so all three changed.
- **Before:** nine stacked panels plus a side column on the organization page, the same facts up to three times, two status badges, "Passed" in the brand's orange, a decision form sitting open, and on sign-ups Reject and Reinstate always drawn with one greyed out.
- **Now (all three pages, one shape):**
  - Header: a kind mark, the name with ONE status pill, one line of context, and ONE button.
  - **Deciding is only behind that button.** It opens a centred popup: where the record stands, the choices side by side with what each does, what to know first and the note once one is picked, then Cancel and a button named for the action. A locked choice is greyed and says why.
  - Four tiles (checks, documents, contact or who they look after, listing access or signed up).
  - Tabs, one topic at a time; a dot on a tab with something to look at; a link into a tab opens it.
- **Two owner corrections on the way, both about the decision:**
  - First cut: a "Your next step" card beside the page with the form open in it. "Showing this immediately is ugly, what is your proposal?" I answered by building a popup but kept the card with a sentence and a button.
  - "You're still showing this?" The card itself was the problem. It is gone: the button moved beside the name and the sentence became the popup's first line.
  - My reading for next time: on a record page the owner wants nothing about the action on screen until asked for. A button, then a popup.
- **Trap:** `animation-fill-mode: both` (or `forwards`) on an entrance that animates `transform` keeps the element a containing block for `position: fixed` after it ends. A dialog rendered inside a tab panel opened 768px wide inside the panel. Use `backwards`. Found by appending a `position: fixed; inset: 0` probe inside the panel and reading its rect, since the QA data has no document to open Send back from.
- **Trap 2:** a `clip-path` on a block clips fixed dialogs rendered inside it. The sections' chamfer is a `::before` layer now, with the children `position: relative` and no z-index (a z-index would make each a stacking context and put the shell header above the dialog).
- **Trap 3:** Tailwind's `accent` token is the brand orange here, so `Badge tone="accent"` ("Passed", "Clear", "Approved") reads as a warning on a review page. `.sx-rec` overrides `--color-accent` to green for the subtree. It must be `--color-accent`, not `--sx-accent`: the former is resolved at `:root`.
- **Files:** new `components/{record-stage,record-kit,record-decide}.tsx`, `lib/record-ui.ts`, `tests/record-ui.test.ts`, `app/(app)/admin/record.css`, three `loading.tsx`. Rewritten `admin/onboarding/[id]/page.tsx`, `components/{live-signup-profile,live-signup-review,onboarding-decision}.tsx`. `desk-kit.tsx` tabs can carry a count. Help articles `check-new-signups` and `verify-a-property` reworded and re-captured. No API change.
- **Checked:**
  - 2,422 / 2,422 frontend tests; tsc and eslint clean.
  - Walked live as the QA BTG admin at 1440, 768 and 390 (approved and waiting organization, guardian, athlete, every tab, the popup, `#documents`). No sideways scroll, no console errors. Nothing was submitted.
  - Not built in a worktree; e2e not run (no spec touches these pages).
- **Status:** Code review on the Polish sheet (row 154). Not committed.

## Deal Chat written down as a Phase 2 feature (rcfworks)
- **Asked:** the owner, reviewing the sponsor order page on staging, wants an agreement between the sponsor and the seller before the Stripe step, reached through a chat. After several rounds, the owner said it is a feature, not a polish item.
- **Decided (owner, 2026-11-17):**
  - The chat comes first, with ready-made question cards and selectable answers. This stage makes or breaks the deal: calling it off cancels the order.
  - When the picks differ, the offer is free text with no other field, answered Reply / Accept / Decline. Once both accept, the exchange goes into the agreement word for word.
  - At the end, both sides type the final amount, pre-filled with the original, and the two must match.
  - SponsorX provides the forms, and rcfworks drafts the wording.
- **Written:**
  - `documentation/SponsorX-Deal-Chat-Feature.md` (the design and the decisions).
  - Seven tasks in Phase 2 Sprint 4: `2S4-BE-14`…`17` (Ready) and `2S4-FE-07`…`09` (Blocked on the API).
  - The same seven rows on the tracker's Phase 2 sheet (rows 145–151, Order 36.91–36.94 and 38.7–38.9), with the Dashboard formulas, filter, formatting and Status list extended to row 151.
- **Also:** merged `main_development` into `feat/POL-101-student-profile`. polish.md and this log kept both sides. On the tracker, POL-FE-105/106 were kept and POL-BE/FE-101…104 re-applied after them at Order 132–139.
- **Next:** `2S4-BE-14` first: draft the three forms' wording and the card list for the owner's approval.

## POL-107 recorded: "+ New request" leads to pre-made packages (rcfworks)
- **Found:** the owner, on staging, said creating a campaign is a dead end: "+ New request" opens pre-made packages instead of letting a sponsor create their own. Confirmed in code and live: all three buttons (Dashboard, Campaigns, Requests) and the Campaigns empty state go to `/sponsor/marketplace`.
- **Already there:** `POST /briefs` already takes no package, and automatic approval handles that.
- **The gap:** a brief has no country. The owner added a Country field to the form.
- **Recorded:**
  - polish.md #107.
  - Tracker rows on the Polish sheet:
    - `POL-BE-107` (the country on the brief, matching by athlete `countryCode`; ours, Ready);
    - `POL-FE-107` (the Create a campaign page at `/sponsor/campaigns/new`; HeckerCreatives, Ready, with the Country field waiting on POL-BE-107).
  - Index row H now reads 44–51, 101–104, 107.
- **Not built.**

## POL-BE-107 built: a campaign request's country (rcfworks)
- **The brief:** `CampaignBrief.countryCode` (default US, migration `20261117180000_brief_country`). It is in the create and edit contracts and on brief reads. Unknown codes are refused, and states are allowed only with US (400).
- **Matching by country:**
  - matching (`athleteFit` / `eligibilityWhere`): the shortlist, automatic approval and readiness;
  - the match engine: athletes abroad and their items are left out;
  - make-good.
- **Catalogue:**
  - `/catalogue/staffing` takes `?country=`.
  - `/catalogue/targeting` returns `countryCodes`, and its states are US-only.
- **Tests:**
  - `backend/tests/pol-be-107-brief-country.test.ts`, real database through the API; removing the filter fails five of them.
  - The full backend suite was green after one fix: test servers must listen on 127.0.0.1 and wait for "listening".
- **Local DB:** a Postgres from an earlier session was already on 5433, so I migrated `sponsorx_test` there (the scratchpad download couldn't bind the port). In zsh, `export A=x B=$A` leaves B empty: set both URLs explicitly, or the DB suites skip silently.
- **Status:** Done (merged #455, CI green). `POL-FE-107` can now use `countryCodes` from targeting and send `countryCode` on `POST /briefs`.

## 2S4-BE-14 built: Deal Chat's agreement (rcfworks)
- **Approved by the owner today:**
  - 2 working days to approve content or ask for changes;
  - an email nudge to whoever's turn it is after every 2 working days without a reply, until signed (folded into `2S4-BE-15`);
  - posts stay up 30 days;
  - firearms and adult content restricted;
  - no more cards;
  - the agreement downloadable at any time by both sides, from the order card and the item card. Backend only; the frontend is HeckerCreatives'.
- **Built:**
  - `backend/agreements/DEAL.v1.txt` issued: the three forms in one file, with D7 sections a package letters.
  - `deal-cards.ts`: the cards and their approved sentences, checked word for word against the approved draft by a test.
  - `deal-agreement-render.ts`: chat text can't reach into the template.
  - `DealAgreement` model (migration `20261117200000_deal_agreements`).
  - `deal-agreement.ts`: open, sign and read, plus the PDF through `renderPdf`.
  - Routes: `GET /deal-agreements/{id}`, `/sign` and `/download`.
  - `dealAgreements` on the sponsor's order reads and `dealAgreement` on the seller's sales reads.
  - The `dealAgreement` resource: RBAC matrix §24.1, the grid digest updated, and the tenant-isolation sweep covering the three routes.
- **Tests:** `backend/tests/deal-agreement.test.ts`, 18 tests.
- **Owner, later the same day:**
  - **Firearms and adult content: yes, everywhere.** Both are added to `SENSITIVE_CATEGORIES`. Brief holds, minors never matched, NEXT ad sales and artwork review now cover them. The offer disclosure is per category through the new `SENSITIVE_CATEGORY_AGE`: 21+, adult content 18+.
  - **Signing limit: "I don't know".** I set 10 working days, as a setting: room for four reminders, plus a last warning 2 working days before cancelling. Written into `2S4-BE-15` and the feature spec.
- **Checked:** full backend suite 3,910 / 3,910 locally.
- **Status:** Done (merged #458, CI green).
