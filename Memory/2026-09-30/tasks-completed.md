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
