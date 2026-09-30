# Tasks completed — 2026-09-30 (HeckerCreatives)

## `P1-ART-10` · Landing 3D — scroll-driven drone fly-through (HeckerCreatives)

*New task, raised today (xlsx row 265, Order 32.7, ART / Code, 2d, Code
review; Phase 1 doc block added after `P1-ART-09`, header 198 · 471).
`P1-ART-09` is environment-only by definition, so the camera work is its own
task.* Brief from the programme owner, pasted as rules: React Three Fiber +
three + lenis + zustand; a fixed full-screen canvas that never scrolls; the
page body a tall empty scroll track (~600vh); on every Lenis scroll event
`progress = scrollY / (scrollHeight − innerHeight)` clamped 0..1 into a
zustand store, and that one number drives the whole camera. Waypoints, in
order: the plaza (the current header viewpoint, not to be changed), the
basketball court, the soccer field, the baseball field, the skyscraper. It
must feel like a drone passing them, and the 2D UI shows only when the
camera reaches a waypoint's centre, then fades out as the user scrolls.

**What was built** (branch `feature/P1-ART-09-landing-city`, uncommitted at
the time of writing):

- **`frontend/src/lib/city/flight.ts`** — the route as data. Seven knots
  (five stops plus two lift-off shaping knots over the plaza); two
  centripetal Catmull-Rom splines through them, one for the camera position
  and one for the gaze target. Scroll progress is split evenly between the
  five stops (0, .25, .5, .75, 1) and each leg is smoothstep-eased so the
  drone decelerates into a stop, hovers, and accelerates out. `stopWeight`
  is 1 on a ±0.03 plateau around a stop and eases to 0 by ±0.09, so each
  overlay is fully visible only at its waypoint and the middle of every leg
  shows only the city. `SECTION_TO_STOP` maps the page's anchors
  (`#how-it-works` → basketball, `#for-sponsors` → soccer, `#for-athletes`
  → baseball, `#start` → skyscraper).
- **`flight-store.ts`** — the zustand store: `{ progress, setProgress }`.
- **`components/city/scroll-track.tsx`** — the ~600svh track with a sticky
  100svh stage; one Lenis instance (`autoRaf`, `allowNestedScroll`, lerp
  0.09), destroyed on unmount; progress computed over the track (identical
  to the brief's formula when the track is the whole page — here the footer
  follows it, so progress holds at 1 while the footer scrolls in). A
  capture-phase click listener turns hash links that name a stop into a
  Lenis scroll to that stop's progress (next/link bails when the event is
  default-prevented); a hash on first load and `hashchange` do the same.
  `prefers-reduced-motion` skips Lenis and uses native scroll.
- **`flight-rig.tsx`** — inside the Canvas; every frame reads
  `useFlight.getState().progress`, damps toward it (rate 7), samples the
  splines into pre-allocated vectors, writes the camera. Banking: rolls up
  to 0.14 rad into the sideways component of the path tangent; hover: a
  5 cm bob, both faded in over the first 2% of the track so the resting
  header pose is exactly the authored one. Uses the frame state's camera,
  not the `useThree` value — the React Compiler lint forbids mutating a hook
  result in the callback.
- **`flight-stop.tsx`** — one overlay per waypoint; subscribes to the store
  and writes opacity, a 28px rise, pointer-events (off under weight 0.5)
  and `inert` (under 0.02) through a ref. No React render per scroll. The
  server renders the plaza stop visible and the rest hidden; `inert` is set
  client-side only so a no-JS reader gets live sections.
- **`city-scene.tsx`** — the fixed `Viewpoint` is now review-mode only
  (`?orbit=1`); otherwise `FlightRig` owns the camera. `CAMERA_POSITION` /
  `LOOK_AT` read from `KNOTS[0]`, so the start pose has one source.
- **`city-backdrop.tsx`** — canvas wrapper is `fixed inset-0 z-0` (was
  `-z-10`) and the vertical scrim is gone; the track sits at z-10 and each
  overlay carries its own translucent panel (`bg-bg/75` + blur). The footer
  got `relative z-10 bg-bg` so it reads over the canvas.
- **`(public)/page.tsx`** — rewritten as five `FlightStop`s inside a
  `ScrollTrack`: plaza = hero + stats bar (the "athlete photography
  pending" placeholder tile is gone — the city is the hero visual);
  basketball = how it works; soccer = the three package cards (a snap-x
  strip under `lg`); baseball = for athletes + standard jobs; skyscraper =
  the closing CTA. Nothing follows the track but the footer. **Two things
  are gone, both the owner's call mid-session:** the §9.1 "Campaigns on
  record" proof slots ("we don't need it") and the pre-launch build-preview
  band — `components/build-preview.tsx` is deleted with it (the home page
  was its only user; its own header said to delete both before launch). A `<noscript>` style collapses
  the track and shows every stop.
- **`globals.css`** — Lenis's stylesheet rules inlined.
- **Dependencies** added to `frontend/package.json`: `lenis 1.3.26`,
  `zustand 5.0.15` (zustand was already in the lockfile via R3F; now a
  direct dependency).

**Tests — `frontend/tests/city-flight.test.ts` (10, all green; suite 545 /
47 files):** stops are the five in order at 0/.25/.5/.75/1; progress 0 is
exactly the header pose; each stop's progress samples exactly its knot;
anchors map to stops; progress→param is monotonic and dwells at stops;
overlay weight is a plateau + monotonic fade, only one stop visible at a
time and none mid-leg; **clearance:** 800 samples of the path stay ≥1.2 m
up and ≥1.5 m outside every non-ground, non-surface placement box of the
desktop layout, and inside the site. That test caught two real clips on
the first route (through the pedestal hologram on lift-off, and through the
kit's hovering drone `air:drone0` at y 18 on the basketball→soccer leg) —
the route now rises past the east side of the hologram and stays under the
kit drones (y 13–18 along the boulevard). **Skyscraper leg, changed on the
owner's mid-session note:** it must fly down close above the ground and
tilt up at the "SponsorX" lettering on the skyscraper. That lettering is
the gantry screen's SPONSORX wordmark in the tower's forecourt (z −182,
8–14 m up, facing the plaza), so the drone now swoops from the baseball
stop down to 2 m over the boulevard at z −160 and looks up at the screen
with the tower rising behind it; the closing CTA panel sits at the bottom of
the frame so the wordmark stays clear. Clearance re-proven at 2 m.

**Verified against the running dev server** with a throwaway Playwright
script (headless Chromium, 1280×800): `html.lenis` present, track 4800px
(600vh), stage sticky, the canvas mounted, no console or page errors. At
progress 0/.25/.5/.75/1 exactly one overlay is at opacity 1 / pointer
events on / not inert and the other four are 0 / none / inert; at .125
and .375 all five are hidden. Clicking "Learn More" (`#how-it-works`) from
the top lands at the basketball stop's scroll offset (1065 = expected) with
the hash set and no navigation; `location.hash = "#for-athletes"` lands at
the baseball stop; a fresh load of `/#for-sponsors` lands at the soccer
stop. `npx tsc --noEmit` clean (apart from the known phantom `LayoutProps`
errors), eslint clean on every touched file. **Not run:** `npm run build` —
the dev server was live on port 3000 and a production build into the same
`.next` corrupts it (see the 2026-09-29 note); build before merging.

**Open / for review:**

- Framing of each stop is authored by coordinates and proven collision-free,
  but only eyeballed through software-GL screenshots; walk it on a real GPU
  (`/`, scroll) and tune `KNOTS` in `flight.ts` — the tests re-prove
  clearance on every change.
- Lite tier flies the same route. If phones stutter, lower `FOLLOW` in
  `flight-rig.tsx` or shorten the track (`TRACK_SVH` in `scroll-track.tsx`).
- The programme owner's earlier instruction to keep camera notes out of the
  environment task still stands for `P1-ART-09`; `P1-ART-10` is where
  camera work lives now.

## Landing hero + navbar redrawn to the 2026-09-30 hero mockup (HeckerCreatives, later in the day)

*Rework on the `feature/P1-ART-09-landing-city` branch, not a tracked task —
no xlsx row changed. The owner supplied a 1825×862 hero mockup and asked for
a 1:1 copy of its 2D UI over the existing 3D city.*

**What changed**

- **`components/site-chrome.tsx`** — `SiteHeader` is now a 72px full-width
  glass bar (`bg-bg/55` + `backdrop-blur-xl`, faint top sheen, glowing
  bottom rule `.sx-nav-line`): logo 8% from the left, the four nav links
  centred (15px, regular), then the HUD theme toggle, Login and a gradient
  "Get Started →" (white label, 12px radius) ending 6% from the right, with
  the mockup's slanted hairline dividers. No `max-w` container any more —
  the mockup is edge to edge. The "N" circle at the mockup's far right is
  the Next.js dev-tools indicator, not UI; nothing was built for it.
- **`components/theme-toggle.tsx`** — `variant="hud"` (glowing blue ring)
  for the marketing header; portals keep `default`.
- **`components/city/flight-stop.tsx`** — new `bleed` prop: no container,
  no gutters, `pt-[72px]`, so a stop can lay out its own full-width bands.
- **`(public)/page.tsx`** — the plaza stop is `bleed`: hero copy at 6% from
  the left (eyebrow, 64px three-line headline with the gradient middle
  line, 17px paragraph, the two 50px buttons), the "REAL IMPACT" card
  ending 3.8% from the right, then the trusted-brands band and the "THE
  PLATFORM" strip across the bottom of the same viewport. **Bug fixed on
  the way:** the sticky header takes 72px of flow, so at scroll 0 the
  sticky stage started 72px down and its bottom 72px sat below the fold
  (the owner saw the strip cut off at the top of the page). The track is
  now pulled up under the header (`-mt-[72px]`), the stage fills the
  viewport from scroll 0, and short viewports cap the headline by `svh`
  and compact the bands (`@media (max-height: 800px)`). Verified with
  Playwright (system Edge): plaza stop `scrollHeight === clientHeight` at
  1825×862, 1920×920 and 1366×700; the phone width still scrolls inside
  the stop (card + bands cannot fit 844px), no horizontal overflow, no
  console errors. The basketball stop's "How it works" heading is
  unchanged.
- **`components/landing-hero.tsx`** (new) — `HeroEyebrow`, `HeroActions`,
  `ImpactCard`, `TrustedBrands`, `PlatformStrip`. The card is three
  layers: a clip-path-chamfered frosted plate (`backdrop-blur-2xl`), a
  one-pixel glowing outline cut with a nonzero-winding `clip-path` ring
  under a `drop-shadow` wrapper (the shadow is on the wrapper so the clip
  does not eat the glow), bright top-left bracket / lit top-right chamfer /
  faint bottom-right bracket, then the stepped title rule that runs to the
  right border and three rows of ring + solid glyph + number + label +
  arrow (each row links to the stop that explains it). The brands band is
  glass (gradient tint + `backdrop-blur-lg`, glowing top and bottom rules,
  darker slanted label plate with a lit edge, faint tall slanted dividers).
  `fixtures.trustedBrands` gained an optional `logo` path: drop the brand
  files under `public/brands/` and set it and the band renders images;
  until then it falls back to text wordmarks — the mockup's logos are
  brand artwork the repo does not hold, and the names are not confirmed
  partners (the band says so in its `title`).
- **`globals.css`** — `.sx-hero-gradient`, `.sx-hud` corner brackets,
  `.sx-hud-dashes`, `.sx-nav-line` (all fixed-dark literals on purpose:
  the hero sits on the city, which is dark in both themes).

**Dropped on the owner's call, mid-session, in this order:** the diagonal
glow streaks I had added across the hero ("remove those blue lines"); the
bottom-right stepped HUD plate with the blue tab (three attempts, none
read right over the live city — "broken and ugly"); the circle mark and
vertical divider on the SponsorX tag. What remains bottom-right is the
two-line tracked tag only.

**Deliberate deviations from the mockup, worth knowing:** the hero
"Get Started" and the header CTA use a white label on the blue gradient
(the mockup's call) — under the P1-QA-02 4.5:1 bar on the lightest stop
of the gradient; the card's stat provenance is no longer a visible
footnote (the mockup has none) but lives in each row's `title` tooltip and
an `sr-only` line, so the figures still never claim to be live (P7-QA-02).

**Checks:** `tsc --noEmit` clean (phantom `LayoutProps` only), eslint clean
on every touched file, vitest 545/545. **Not run:** `npm run build` — the
dev server was live on port 3000 (never build into a live `next dev`).

**Later the same evening, on the owner's notes:**

- **Navbar** — the slanted dividers and the dark/light toggle are gone from
  the marketing header (the portals keep theirs; `theme-toggle.tsx` is
  back to its committed form). A **Home** link was added. The nav row is
  now a client island, **`components/site-nav.tsx`**, and the current page
  is lit as a hologram (`.sx-holo` in globals.css: text glow, a neon
  flicker, two brand-hued ghost copies of the label cut in for a few
  frames as an RGB-split glitch, and a glowing hairline underneath;
  reduced motion keeps only the glow and the bar). "Current" follows the
  route *and* the drone: on `/` the hovering flight stop decides (Home at
  the plaza, How It Works at the court, For Sponsors at the soccer field,
  For Athletes at the baseball field, none mid-leg); off `/` the pathname
  does (For Athletes on `/join`). The store subscription selects the
  hovering stop id, so the header re-renders on stop change only.
  Playwright-checked: Home current at the top; clicking How It Works
  lands on the court with it current; `/join` lights For Athletes.
- **Hero legibility** — the paragraph sat on the plaza's lit billboards.
  A left gradient scrim (40% wide, ending before the pedestal, `#04080f` 90% → 60% → transparent) now
  grounds the copy, and the headline / paragraph shadows are deeper.
- **Real Impact card** — glass strengthened (`backdrop-blur-2xl`, tint up
  a notch) so the city behind it is frosted, not see-through.
- **SponsorX tag** — its circle mark and vertical divider removed; two
  tracked text lines remain at the strip's right.
- **"Measure Results." went muddy** — the headline's text-shadow painted
  behind the gradient-clipped (transparent) glyphs. `.sx-hero-gradient`
  now sets `text-shadow: none` and takes its shadow from a `drop-shadow`
  filter; the sweep is brighter (`#9be0ff → #4fb6ff → #2e9bf5`).

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
