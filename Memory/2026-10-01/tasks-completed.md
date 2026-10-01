# 2026-10-01 — tasks completed

## Landing: the logo's orange joins the type — owner's preference, via Claude

The landing (`/`) was blue throughout. The owner asked for an orange theme in
the fonts, taken from the logo. The lockup's colours are blue `#2E9BF5` and
orange `#F97A1F` (the X bolt and "BRAND IMPACT"), per
`documentation/Design/marketing-visuals/exports/logos/README.md`, and the
tagline reads blue-then-orange — so that split is the rule on every stop:
the headline's single highlighted word stays blue (or the athlete stop's cyan)
and its closing phrase takes the orange. Type only; buttons, HUD frames, icons
and rings stay blue.

- `globals.css` — `.sx-hero-gradient-accent`, the orange twin of the blue
  headline gradient (`#ffd1a6 → #fb923c → #f97a1f`, same clip and drop-shadow).
  The white `.sx-hero-shimmer` band works on it unchanged. Dark literals on
  purpose: the city under the landing is dark in both themes.
- Hero — "Reward Fans." in the orange gradient (no shimmer; "Measure Results."
  keeps the blue one and its shimmer). Platform strip — the "THE PLATFORM"
  label, its rule and "grow." in `#fb923c`.
- How it works — `works` in `#fb923c` (the stop has no second line).
- For sponsors — "Real Measurable Impact." orange; "Partnerships." stays blue.
- For athletes — "Build Lasting Partnerships." orange; "Athletes." stays cyan.
- Join the movement — "Real Partnerships." orange.

Verified: `npm run build` (frontend) green, ESLint and `tsc` clean on the
changed files, and the five stops screenshotted at 1440×900 from a production
`next start` with Playwright — orange reads on every headline, nothing wraps.
`/packages` and `/join` still use the blue `.sx-hero-gradient`; they were not
touched (the ask was the landing) and are the natural next place for the same
split if the owner wants it.

Not a board task — a polish request — so no tracker row.

## /packages and /join follow the landing's orange — owner's preference, via Claude

Same rule as the landing, same class. `packages-stage.tsx`: hero line three
"You Measure Impact." in the orange gradient under the blue "We Match
Athletes."; every section head's accent phrase (`SectionHead`'s `accent`) and
the CTA band's "We'll build the lineup." take `.sx-hero-gradient-accent`.
`join-stage.tsx`: "Your Sponsors." orange under the blue "Your Game."; the CTA
band's "Every campaign after it." orange. Eyebrows stay blue (they come first;
the orange is the closing phrase). Build, ESLint and `tsc` green; both pages
screenshotted at top, middle and CTA band. The landing paragraph above no
longer applies where it says these two pages were untouched.

## Plaza hologram: the 3D X is now the logo's X — owner's preference, via Claude

The hologram above the plaza pedestal was a generic two-bar X in primary blue.
The owner asked for the logo X's colour style. `pedestal.tsx` now extrudes the
two polygons of `sponsorx-x-dark.svg` — the orange lightning bolt (left,
`BRAND.orange`) and the white chrome blade (right, `BRAND.white`, lower
emissive, a little metalness) — to a 3D letter with the lockup's 8° italic
lean (a shear on the geometry). Same size, depth, lift, spin, bob, scan lines
(one shared alpha map, scrolled through the bolt material's ref — the linter
forbids touching it through the props) and edge outlines (bolt `#ffc48a`,
blade white). Rings, dais and projector cone stay primary blue, so the plaza
carries the brand's three colours. Collision boxes and `VENUE_DIMS` unchanged;
the city layout and venue-box tests pass (34). Build, ESLint and `tsc` green;
two hero frames screenshotted a couple of seconds apart show the bolt and
blade from two angles as it turns.

## Fixed in passing: the frontend build was broken locally

`next build` failed with `Module not found: Can't resolve 'rimraf'` from
exceljs → unzipper → fstream (the athlete earnings export). The root
`node_modules/rimraf` folder existed but was empty (timestamp 2026-09-30 21:22;
something had hollowed it out). `npm install` restored rimraf 2.7.1 from the
lockfile — no lockfile or package.json change. If your build shows the same
error, run `npm install` at the root.
