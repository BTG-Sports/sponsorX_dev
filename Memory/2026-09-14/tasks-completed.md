# 2026-09-14 — Tasks completed

## Athlete invitations page redesign (`src/app/(app)/athlete/invitations/page.tsx`)

Feedback: the page read as novice work — no search, weak hierarchy, spec
jargon in user-facing copy. Redesigned to the marketplace's visual language
while keeping the page a pure server component (no client JS added):

- **Search** — plain GET form writing `?q=`, matched against sponsor,
  campaign, job name and job ID. Hidden inputs carry the active tab
  (`state`) and `demo` param through submits; tab links preserve `q` the
  other way. URLs stay shareable, zero client JS — consistent with the
  house pattern of URL-param state everywhere.
- **Stat strip** — four `StatTile`s above the list: awaiting response,
  offers on the table, next expiry (with sponsor + amount), accepted-of-
  resolved. Computed over the whole inbox, not the current filter.
- **Sorting** — open invites first ordered by urgency (parsed from the
  fixture's relative expiry string), then accepted / declined / expired.
- **Cards** — responsive grid (`md:grid-cols-2 xl:grid-cols-3`), same
  shape as the marketplace catalogue: identity band (sponsor `Monogram`,
  gradient `from-athlete/15`), a 3-cell stat row (offered / deliverables /
  time to respond, expiry turns `text-warn` when urgent), jobId + job-name
  line with an URGENT chip, stacked meta rows, decline reason in a quiet
  panel, resolved cards dimmed. Actions pinned to the card bottom
  (`mt-auto`, `h-full flex-col`) so rows line up; "Review & accept" is
  `full` + flex-1 with Decline beside it, "Full terms →" centered below.
  Urgency treatment applies to *any* open invite inside 24 h, not only
  the single most-urgent one.
- **Copy** — `§21 — INVITED → VIEWED → …` removed from user-facing text
  (kept in code comments); "Open" tab renamed "Needs response"; search-
  aware empty state with a clear-search action.

Verified: `tsc --noEmit` clean, `eslint` clean, `next build` succeeds.
Note: `next lint` no longer exists in Next 16 — run `npx eslint` directly.

No tracker (xlsx) change: this was design feedback on an existing screen,
not a board task.

## Athlete earnings page redesign (`src/app/(app)/athlete/earnings/page.tsx`)

Feedback: inefficient UX, too high a learning curve — the page taught the
§21 state machine instead of answering the athlete's questions. Redesigned
around reading order (how much have I made → what's arriving → where is
each dollar → is anything stuck), still a pure server component:

- **Career hero** — `HeroBand` (athlete border) with the career total as a
  gradient mega-number, a pulsing "on the way — payout Friday" line, the
  on-time rate, and the monthly trend as a full `AreaChart` (dollar-scaled
  ticks via a local `fmtUsd`; raw `compact` would print cents as "830K").
- **The money journey** — one card, four hairline-divided cells (gap-px
  grid) = PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID in plain English
  ("In review / Cleared / Payout approved / Paid"), amount + count + a
  one-line blurb each, gradient flow bar on top, step dots rising in
  intensity, Paid cell in accent. Replaces the funnel card, the per-state
  list AND the "state machine" explainer card. HELD renders as a danger
  attention strip below (heldNote with the "(§21)" ref stripped).
- **Recent activity** — table → monogram list rows (campaign initials,
  human job name instead of the SX-xx badge, status badge, amount),
  sorted most-recent-first, hover highlight.
- **Trust bar** — the no-bank-details/no-tax-ID fact said once, with a
  lock glyph, plus a single "all figures POSTGRES" chip; §22 provenance
  kept to three quiet chips total (was scattered across every section).
- **Copy** — all § references removed from user-facing text (kept in code
  comments); subtitle now "Every dollar from delivered work to payout".

Iteration 2 (same session): Recent activity gained a toolbar and
expandable rows, still zero client JS:

- **Toolbar** — one GET form (`action="/athlete/earnings#activity"`):
  free-text search (`?q=` across campaign, job name, job ID, reference,
  status label) plus three selects — date (`?month=`, months derived from
  the athlete's rows), status (`?status=`, §21 states present in data),
  type (`?type=`, job names). Params validated against derived options so
  a stale URL degrades to "all". Hidden input carries `demo`; Apply button
  submits (selects can't auto-submit without JS). Filter-result summary
  line + "Clear filters" link; filtered empty state inside the card.
- **Expandable rows** — each row is a native `<details>`/`<summary>`
  disclosure (marker hidden, chevron rotates via `group-open`). The panel
  shows: a 4-step mini pipeline stepper (done steps ✓, current bold,
  Paid dot in accent) for pipeline states or a danger strip for
  HELD/DISPUTED (held uses `heldNote`), a plain-English "what happens
  next" line per state, and an Amount / Job / Payout reference / Last
  update `dl`. Reference moved out of the collapsed row into the panel.

Iteration 3 (same session): user feedback — the Apply button and the
`<details>` accordion felt clunky. Replaced iteration 2's no-JS approach
with the page's one client island:

- **`src/components/activity-explorer.tsx`** (`"use client"`) — search and
  the date/status/type selects now filter instantly (no Apply button);
  clicking a row opens a **slide-over drawer** (right side, `sx-drawer` /
  `sx-backdrop` keyframes added to globals.css with reduced-motion
  handling): gradient amount, vertical journey timeline (done ✓ /
  current step carries the plain-English explanation), danger panel for
  HELD/DISPUTED, reference + dates dl, no-bank-details footer. Escape /
  backdrop click close; scroll locked behind; focus moves to the close
  button and returns to the row on close. Filter state syncs to the URL
  via `history.replaceState` (no navigation) and the server page seeds it
  back from `searchParams`, so filtered views stay shareable.
- **`src/lib/earnings-ui.ts`** — shared copy module (EARNING_TONE,
  JOURNEY, STAGE_INDEX, STATUS_DETAIL, STATE_ORDER, MONTHS/when) imported
  by both the server page and the island so stage language can't drift.
- Precedent note: this screen now spends the same small client budget as
  `InsightCarousel`/`Reveal` — the no-JS rule gave way to UX here by
  explicit user preference.

Fix (same session): the drawer rendered trapped inside the Recent-activity
section — `sx-animate` (fill-mode: both) leaves a `transform` on the
ancestor section, which makes it the containing block for
`position: fixed`, so the "full-screen" overlay was clipped to the
section. Fixed by portaling the drawer to `document.body`
(`createPortal`; SSR-safe since it only renders after a click). Gotcha
worth remembering: **any overlay rendered under an `sx-animate` ancestor
must portal out.**

Animation pass (same session): the drawer's entrance was a faint 2.5rem
fade-slide — replaced with a full choreography. Panel slides in from
fully off-screen (`sx-drawer-in`, 0.4s house spring ease) over a fading
blurred backdrop; content staggers in (`sx-animate sx-delay-1..4` on
header / amount / journey / footer). Closing now animates too: a
`closing` state swaps to `sx-drawer-out`/`sx-backdrop-out` and unmount
waits for the panel's `animationend` (checked by `animationName`, since
children's sx-animate ends bubble). Reduced motion shortens all four to
1ms rather than `none` — same trick as the mobile menu — so the close
event still fires. Root gets `pointer-events-none` while closing.

Close-robustness (same session): user reported backdrop click not
closing. A Playwright run against the live dev server showed backdrop +
Escape both work in a fresh browser (hit-test confirmed the click lands
on the backdrop button) — the report was almost certainly a stale-HMR
tab: new JS (waits for `sx-drawer-out` animationend to unmount) + old CSS
(keyframe missing) = the event never fires and the drawer hangs open.
Hardened anyway: a 450ms fallback timer in the Drawer guarantees unmount
even if the animation event is lost. Repro script kept at the session
scratchpad (`drawer-test.mjs`) — opens the drawer, hit-tests the
backdrop, clicks outside, presses Escape.

Close-latency fix (same session): user felt a delay on close. Playwright
timing showed Escape at 320ms but click paths at 827–943ms — the delay
was *before* the handler ran. Culprit: `backdrop-blur-[2px]` on the
full-viewport backdrop — compositing a full-screen blur janks the main
thread exactly when the click needs processing (brutal without GPU
accel). Removed the blur (imperceptible at 2px; backdrop now bg-black/55)
→ backdrop click 344ms, close button 490ms (~150ms of that is
Playwright's own actionability overhead). Also retuned the exit: 0.22s
house ease (was 0.3s ease-in, which sits still for its first ~100ms and
reads as lag); backdrop-out 0.18s; fallback unmount timer 450→300ms.
Lesson recorded: **no full-viewport backdrop-filter on overlays.**

Custom filter controls (same session): user disliked the native selects,
the month dropdown and the Reset text link. Replaced in the island:

- **Dropdown** — designed listbox popover (sx-pop entrance anchored
  top-right, check mark on selection, trigger tints border-athlete/40
  when active, chevron rotates, outside-click/Escape close).
- **DateRangePicker** — calendar popover pinned to the fixture year 2026
  (fixture dates carry no year): days with activity get an accent dot,
  first click = single day, second click completes a range (auto-swaps
  if backwards), month prev/next nav, "All dates" clear in the footer.
  URL params became `from`/`to` as "May-16" strings; the month `?month=`
  param is gone. Trigger shows "All dates" / "May 16" / "May 14 – May 16".
- **Reset** — icon-only bordered button (✕, danger tint on hover), shown
  only when filtered.
- **Bug found by the Playwright run:** dismissing a popover by clicking
  outside clicked *through* to the activity row beneath and opened the
  drawer. `useOutsideClose` now swallows the click that follows the
  closing pointerdown (capture-phase, once). Cost: clicking another
  trigger while a popover is open takes two clicks — accepted.

Verified: `tsc --noEmit` clean, `eslint` clean, `next build` succeeds.
Playwright: calendar open/pick/range/label, outside-click dismiss without
click-through, combined range+status filtering, clear-all, and the
shareable-URL round-trip (?from=May-14&to=May-16&status=HELD reload
restores state); drawer backdrop/Escape regression re-run passes.

Clear-filters redesign (same session): user disliked the icon-only reset
button; offered four options (chips row / per-control ✕ / labeled pill /
in the count line), user chose the **filter-chips row**: each active
filter renders as a dismissible athlete-tinted chip below the toolbar
(`FilterChip` — search term in quotes, calendar-icon date range, status,
type), a quiet "Clear all" text button, and the result count right-
aligned in the same row. The toolbar ✕ button is gone. Playwright:
removing one chip restores the others' results and cleans only that URL
param; Clear all restores everything; screenshot-verified the layout.
Also noted: the calendar's earlier "one narrow column" report was stale
tab CSS again (fresh-browser screenshot showed the correct 7-col grid) —
second occurrence, advise dev-server restart + hard refresh.

No tracker (xlsx) change: design feedback on an existing screen, not a
board task.

## Athlete profile UX pass — no more portal → public context switch

Feedback: from the Athlete Portal, the sidebar's "Public profile" item
jumped to `/athletes/[slug]?from=athlete-portal` — suddenly the public
marketing site, portal chrome gone, only an 11px back link. Also dead UI
on that page: tabs that were inert `<span>`s (`title="Not built yet"`)
and a Follow button that did nothing.

- **`src/app/(app)/athlete/profile/page.tsx`** (new) — in-portal preview
  of the public profile (LinkedIn "view as" pattern). Athlete never
  leaves the portal; sidebar item now points here (`athlete/layout.tsx`)
  and gets a working active state (the external URL never matched
  `usePathname`). Header row + eye-icon banner state it's a preview;
  "Open public page ↗" opens the real URL in a new tab with
  `?from=athlete-profile` (new `back.ts` target → "Back to your portal").
  Sponsor-side actions (Follow, Request Partnership) render exactly as
  sponsors see them but are inert, and say so on hover.
- **`src/components/athlete-profile-view.tsx`** (new, `"use client"`) —
  the profile itself, shared by the public page and the preview.
  - Tabs are real now: Overview / Inventory / Media / Performance switch
    instantly, `role=tablist/tab/tabpanel` with arrow-key + Home/End
    roving focus; active tab syncs to `?tab=` via `history.replaceState`
    (activity-explorer idiom), server pages seed it back — deep links
    like `?tab=media` SSR the right panel.
  - Overview = top-3 inventory + "View all N →" (switches tab) + About /
    Interests / Restrictions. Inventory = full list + Request
    Partnership. Media = honest `EmptyState` (was nothing). Performance =
    each stat with its §22 provenance chip *explained* in plain English
    ("Entered by the athlete during onboarding…") + Phase 3 note.
  - Follow toggles instantly (Follow ↔ "Following ✓", local state,
    titled "Demo — kept for this visit only").
- **`src/app/(public)/athletes/[slug]/page.tsx`** — thin server wrapper:
  `resolveBack` + BackLink on the left, and a new orientation label on
  the right ("PUBLIC PROFILE · VISIBLE TO ANYONE") so sponsors/admins who
  land here from a portal always know which surface they're on.
  Sponsor-price-only rule (§04/§30) unchanged — the shared view only ever
  touches `athletePublic`.

Iteration 2 (same session): user rejected the "faithful preview" framing
— seeing Follow / Request Partnership on *your own* profile reads as
nonsense ("I would request partnership with myself?"), and the old
`?from=athlete-portal` URL still landed on the public site. Fixed:

- The `preview` variant became **`owner`**: Follow is replaced by a quiet
  "This is you" chip; Request Partnership is replaced by a panel saying
  sponsors see that button and its requests land in your Invitations
  (link → /athlete/invitations); the price footnote is reworded to
  second person ("what you are paid is your rate card").
- `/athletes/[slug]?from=athlete-portal` now **redirects to
  /athlete/profile** (stale bookmarks/old tabs can no longer strand an
  athlete on the public surface).
- /athlete/profile header became owner-language ("Your public profile")
  and gained a **profile-completion nudge**: 72% Meter + the unfinished
  checklist items named + "Finish on your dashboard →". "Open public
  page ↗" (new tab) remains the one explicit exit.

Lesson: a portal-embedded view of a public page should be framed for its
owner (self-view), not as a pixel-faithful sponsor preview — inert
sponsor-side buttons confuse more than they inform.

Iteration 3 (same session): user asked "how do I edit my profile?" —
answer was *you can't*, the checklist was display-only and the real work
(P3-BE-01/05, P3-FE-01/03) is blocked in a later sprint. Built the edit
flow as a fixture-backed prototype ahead of that backend:

- **`src/lib/profile-sections.ts`** (new) — the nine §11 sections as
  shared data (key, label, scope public/private, blurb) + checklist-label
  → section-key map; server-safe so pages can deep-link without importing
  the client island.
- **`src/components/profile-editor.tsx`** (new, `"use client"`) — a hub,
  not a wizard (editing is random-access): left rail with live done-state
  and completion % (Meter), one form pane per section, prev/next footer
  for people who want the linear walk. Active section syncs to
  `?section=` (replaceState idiom). Every pane carries a scope chip —
  **"Public — on your profile"** vs **"Private — BTG only"** — because
  "who sees this?" is the first athlete question. Save enables only when
  the section is valid (hint says why), marks it done in the rail
  instantly, and flashes "Saved — queued for BTG review" (managed-
  marketplace semantics, §10 — nothing claims to publish live).
  Section specifics: socials warn counts stay `self-reported` until
  Phase 3 verification; capabilities toggle SX catalogue jobs (become
  public inventory); restrictions are lock-noted (never public, §26
  conflict check) and "no restrictions" must be *declared*, not skipped;
  rate card is confirm-only (BTG sets rates; sponsors never see them);
  payment collects payee + remittance email ONLY — lock note repeats the
  no-bank-details/no-tax-ID rule (§26/A6); agreements list accepted
  fixtures + one pending click-wrap accept, guardian e-sign flagged as
  the open legal decision.
- **`src/app/(app)/athlete/profile/edit/page.tsx`** (new) — portal page:
  BTG-review notice banner + "edits live in this tab only" honesty,
  seeds `?section=`.
- **Entry points:** /athlete/profile header gains a primary **Edit
  profile** button; its completion nudge now links straight to the first
  unfinished section ("Finish now →"); the dashboard's profile-completion
  checklist items became per-section links (hover reveals "finish →" /
  "edit →").

Verified: `tsc --noEmit` clean, `eslint` clean (pre-existing warning
only), `next build` succeeds with `/athlete/profile/edit`; curl confirms
the editor SSRs, `?section=payment` deep-links render the right pane,
and all nine checklist links appear on the dashboard.

Verified: `tsc --noEmit` clean, `eslint` clean (one pre-existing warning
in `t/[code]/route.ts`), `next build` succeeds with the new
`/athlete/profile` route; curl against the dev server confirms the owner
page renders inside portal chrome with no sponsor CTAs ("This is you",
Invitations pointer, 72% banner present), `?tab=` deep links SSR
correctly, `from=athlete-profile` resolves to "Back to your portal", and
`from=athlete-portal` emits a 307 NEXT_REDIRECT to /athlete/profile.

No tracker (xlsx) change: UX feedback on existing screens, not a board
task.

## Admin applications page redesign (`src/app/(app)/admin/applications/page.tsx`)

Feedback: poor UX, no wow factor, steep learning curve — the old page was a
flat dump of every application fully expanded (score panel and all), spec
jargon in the copy ("§11 funnel DRAFT → SUBMITTED → …"), dead
title-attribute-only buttons. Redesigned as a review desk on the earnings-
page idioms (hero band + one client island + slide-over drawer):

- **Hero band** (`border-admin/25`, admin→primary gradient mega-number) —
  athletes waiting, a pulsing aging alert ("1 waiting over 48 hours") or a
  green "queue is fresh" line, median review / approval rate, and the
  quarter's pipeline funnel on the right. Aging is derived from the
  fixtures' relative `submittedAt` (`waitHours`, threshold `AGING_HOURS` =
  48). The old page's separate score-distribution card was dropped — the
  per-row score rings carry that information.
- **`src/components/filter-kit.tsx`** (new) — SearchInput, Dropdown,
  FilterChip, useOutsideClose, trigger/panel classes and the shared icons
  extracted out of activity-explorer, made **tone-aware**
  (`"athlete" | "admin"` static class maps) so both portals reuse the same
  designed controls. activity-explorer was refactored to import from it;
  behavior unchanged.
- **`src/lib/applications-ui.ts`** (new, server-safe) — shared copy:
  STATE_TONE/STATE_DETAIL, `scoreBand()` (≥70 Strong / ≥55 Solid / ≥40
  Developing / <40 Weak fit, tone per band), FACTOR_HINTS (one
  plain-English line per §14 factor), `waitHours` parser.
- **`src/components/applications-desk.tsx`** (new, the page's one island) —
  - Tabs with live counts (Needs review / Approved / Rejected / All),
    instant search (name/sport/region), sport + attention (minors /
    flagged / waiting 48h+) + sort (waiting longest default / newest /
    score) dropdowns, dismissible FilterChips, filtered empty state.
    State syncs to `?tab=&q=&sport=&flag=&sort=` (replaceState idiom),
    seeded back by the server page — filtered queues are shareable, stale
    params degrade to defaults.
  - **ScoreRing** — the §14 score as an SVG ring that sweeps in on mount
    (`transition-[stroke-dashoffset]`, `motion-reduce:transition-none`),
    color by band; every row carries one, the drawer a large one.
  - **Review drawer** (portaled to body, sx-drawer choreography): score
    band + factor meters each with its plain-English hint, a Safeguards
    checklist (guardian row, conflict flags with "(§26)" stripped,
    self-reported reach note), "View public profile ↗" in a new tab with
    `?from=applications`, and a **pinned decision bar** — header and
    footer fixed, middle scrolls, so Approve/Request info/Reject never
    scroll out of reach.
  - **Decisions work** (Follow-button precedent): Approve / Request info /
    Reject apply locally with an Undo banner — rows, tab counts and badges
    update live; "Demo decisions last for this visit only" stated in the
    footer. A minor with an unverified guardian gets a warn strip
    explaining the lock (§4) instead of a dead button.
- **Copy** — all § references removed from user-facing text (kept in code
  comments); the rules-v1 explainability note reads "Scored by fixed
  rules — every factor is stored with the score, so a decision can be
  explained later."

Verified: `tsc --noEmit` clean, `eslint` clean, `next build` succeeds.
Playwright against `next start` (scripts kept in the session scratchpad:
`apps-desk-test.mjs`, `drawer-pinned-test.mjs`): tabs + counts, default
waiting-longest order (Tyler 3d first), instant search + URL sync + chip
removal, sport filter, tab×filter combination, shareable-URL round-trip
(`?tab=all&q=soccer&sort=score` restores state), guardian-blocked drawer
(Approve disabled + lock strip), reject → banner → undo, approve moves the
row Needs review → Approved with live counts, Escape + backdrop close,
bogus URL params degrade cleanly, `?demo=empty` renders the empty state,
and the pinned decision bar stays in view while the factor list scrolls.

No tracker (xlsx) change: design feedback on an existing screen, not a
board task.

## Admin campaign dashboard redesign (`src/app/(app)/admin/campaigns/[id]/page.tsx`)

Feedback: poor UX, no wow factor, steep learning curve — the old page was
stat cards over a static roster table, with a fake tab strip of inert
"Not built yet" spans, and roster names that navigated the admin away to
public athlete pages. Redesigned on the applications-desk idioms (hero
band + one client island + slide-over drawer), structured around the
operator's two questions in order: *is this campaign healthy?* then *who
needs my attention?*

- **`src/lib/campaign-ui.ts`** (new, server-safe) — ORDER_TONE/ORDER_COPY,
  FLAG_HINTS (plain-English line per §9.9 flag), and the pacing math:
  `paceFor()` derives the recent daily view rate (last two series points ÷
  `SERIES_STEP_DAYS` = 14, the fixtures' bi-weekly spacing), the rate
  still needed (`remaining / daysRemaining`), the projected landing total,
  and a band (ahead ≥ 1× needed / close ≥ 0.75× / behind). c1 computes to
  **On pace** (11.8K/day vs 8.4K needed → lands ~1.4M vs 1.2M target),
  c3 to **Behind pace** (1.7K vs 6.8K → lands ~175K vs 400K) — matching
  the fixtures' healthy/under-delivering stories with no new fixture data.
  `paceProjection()` carries the recent rate forward in two-week steps.
- **Hero band** (`border-admin/25`) — percent-to-target as the gradient
  mega-number, a `RadialGauge` on the right, and three status bullets: the
  pace verdict (pulsing dot when warn/danger), where the campaign lands at
  the current rate, and how many roster athletes need attention. Every
  number keeps its §22 provenance chip (VERIFIED · MANUAL / COMPUTED).
- **Stat tiles** — views (meter + views-to-go), engagements (delta now
  *computed* from the series instead of the old hardcoded "+1.7%", plus a
  `Sparkline`), rewards redeemed (POSTGRES), days remaining with the
  needed-per-day rate (COMPUTED chip).
- **Chart** — `AreaChart` gains the dashed **projection tail**
  (`projection` prop already existed, unused) with a "Projected" legend
  swatch; hint copy explains solid = verified history, dashed = recent
  rate carried forward. Top content became an `HBarList` (ranked bars)
  instead of the monogram list.
- **`src/components/roster-ops.tsx`** (new, the page's one island) —
  - Everyone / Needs attention pills with live counts + instant search;
    state syncs to `?q=&show=` **merged into the existing query** (the
    applications-desk rebuilds its query from scratch; here `from` and
    `demo` must survive), seeded back by the server page.
  - **DeliveryRing** per row — delivered/planned as an animated sweep
    (warn when under-delivering, accent complete, primary in progress).
  - **Order drawer** (portaled to body, sx-drawer choreography, pinned
    action bar): delivery numbers with provenance, the flag explained in
    plain English, a **"Where this order is" journey** (Sent → Accepted →
    Delivering → Complete, or Sent → Declined) teaching the Campaign
    Order lifecycle in place, and **one contextual action** per state —
    Send reminder (under-delivering) / Nudge invitation (sent) / Request
    replacement (declined) — local with Undo (Follow-button precedent);
    a healthy order gets "nothing needed", not a dead button.
- **Copy** — fake tabs removed; "§9.9" stripped from user-facing text
  (kept in comments); footnote now explains flags are raised automatically
  against the order schedule.

Verified: `tsc --noEmit` clean, `eslint` clean; live dev-server SSR checks
(user's `next dev` on :3000 was reused — a second dev server refuses to
start): c1 shows On pace / 69% / 11.8K vs 8.4K / lands ~1.4M / Projected
legend; c3 shows Behind pace / 24% / lands ~175K / the §9.9 notice and
Replacement-needed flag; `?demo=empty|loading` render their states;
unknown id falls back to c1; `?show=attention&q=jalen` SSRs the filtered
roster (Amara's row drops). Drawer interactivity not browser-driven this
pass — it is a line-for-line port of the applications-desk drawer
mechanics that were Playwright-verified above. `next build` skipped to
avoid disturbing the user's running dev server.

No tracker (xlsx) change: design feedback on an existing screen, not a
board task.
