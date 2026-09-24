# Login redesign — Stadium Night

**Date:** 2026-09-23 · **Route:** `/login` · **Status:** approved (brainstorm:
direction → composition → motion, each picked in the visual companion)

## Decision

`/login` becomes a full-bleed CSS-only night-stadium scene — **Stadium Night ·
Center stage · Lights up** — replacing the two-panel card with the placeholder
gradient panel and the "venue photography pending" note.

## What stays fixed

- Clerk `<SignIn routing="hash" forceRedirectUrl="/portal">` with stripped
  chrome (`cardBox`/`card`/`footer` transparent) — authentication behavior is
  untouched.
- The two managed-marketplace doors below the form: *Apply as an athlete*
  (`/join`, primary-blue outline) and *Request a sponsor brief* (`/brief`,
  accent-orange outline). Phase 1 has no self-serve sign-up; these stay the
  only ways in.
- Route stays outside `(public)` so it inherits no marketing chrome.
- `login/page.tsx` stays a **server component**; the redesign adds zero client
  JavaScript.

## The scene

Layers back to front, all tokens, no images, no WebGL:

1. Ground: `--sx-bg` with a faint upper-stand silhouette (dark radial
   gradient) and a soft pitch-glow radial at the horizon line.
2. Three floodlight beams from the top edge: two `--sx-primary`, one
   `--sx-accent`, heavily blurred, slow sweeps (9–12s, distinct phases).
3. Bokeh crowd band across the lower third — small radial-gradient dots in
   white/blue/orange over a dark rise; twinkles by opacity only.
4. BTG badge (`/sponsorx-badge.png`, already in repo) top-center with a soft
   brand-blue glow.
5. The glass card: `backdrop-blur`, `bg-surface` at ~72% alpha, hairline
   `--sx-primary` border, centered under the badge.
6. One proof line under the card, over the crowd, from the `networkStats`
   fixture: "148 athletes in the network · 86 campaigns delivered" — values
   already provenance-sourced (Postgres counts in Block B).

**Theme rule:** the page is fixed-dark in both themes, like the existing
media/artwork panels — ink on the scene uses `--color-on-media`, which is
deliberately theme-invariant. The card interior uses normal tokens (its
surface is dark regardless because the page never flips to Frost).

## The entrance — "Lights up" (~1.2s, once per load)

Dark frame → beam 1 snaps on with a two-step flicker → beams 2 and 3 follow at
~350ms intervals → crowd fades up → badge, then card, rise ~14px into place on
`--sx-ease` (sx-animate stagger). Ambient loop after: beams sweep, crowd
breathes (3–4s opacity), badge glow pulses slowly.

House motion rules apply verbatim (globals.css chart/join precedent):

- Final state lives in the DOM; every animation is an overlay that settles
  onto it.
- `prefers-reduced-motion`: entrance and loops `animation: none` — the
  finished still renders immediately.
- New CSS is one `sx-login-*` block in `globals.css` beside the join-wizard
  and matching-studio systems.

**Mobile (390px):** same scene; card full-width inside comfortable margins; a
beam is dropped/narrowed so nothing overflows horizontally; the entrance
shortens to crowd + card (beam flicker skipped below `sm`).

## Out of scope

- No change to `/portal` routing, Clerk configuration, or the sign-up story.
- No new client components, no three.js on the auth path.
- No change to the NEXT student portal or other screens.

## Verification

- `npm run build`, frontend tests, eslint — clean.
- Contrast: proof line and any scene ink ≥ AA against the brightest scene
  state (crowd band at full twinkle); card interior unchanged (already
  passes).
- 390px: no horizontal scroll (beams are `overflow:hidden` inside the scene).
- Reduced motion: static finished scene, no animation.
- Real sign-in against the local dev Clerk instance still lands on `/portal`.

## Board

This is polish on `P1-FE-17` (login screen, shipped) — no new task raised; the
work notes on the day log. If the team prefers a row, raise it as a fractional
Order under Stage 1.
