# SponsorX Landing Page — 3D Immersive Scrollytelling Background

**Status:** Design approved, pending spec review
**Date:** 2026-09-22
**Surface:** Public marketing home — replaces [`frontend/src/app/(public)/page.tsx`](../../../frontend/src/app/(public)/page.tsx)
**Author:** Brainstormed with the team via the visual companion

---

## 1. Concept in one line

A single ball, pinned dead-center of the viewport, that you **follow down the page**. As
you scroll it spins, **morphs through four sports** (soccer → basketball → baseball →
football), and each morph swaps the 3D environment behind it. 2D content panels frame the
ball; at the end the ball collapses into the SponsorX **"X"** over the closing CTA. The 3D
is an immersive *background*; the UI stays crisp 2D on top.

The four sports are **narrative chapters** — one athlete network spanning every sport — not
decoration. Each sport carries a distinct beat of the SponsorX pitch.

## 2. Goals / non-goals

**Goals**
- A genuine wow-moment landing experience that expresses "one network, every sport."
- All existing §9.1 landing content preserved and re-choreographed — no invented claims.
- Fast LCP, accessible, SEO-intact, and gracefully degradable — 3D never on the critical path.
- Stays inside the app's near-black, restraint-first brand and its motion conventions.

**Non-goals**
- No photoreal stadiums / crowds. No self-service checkout content (Phase 2).
- No 3D in the portals or other marketing pages (this is the home page only).
- Not changing the copy's substance or the provenance/"real-or-empty proof" rules.

## 3. The scroll narrative (six pinned sections)

Ball centered throughout. Scroll container is 6 × 100vh; one `scrollProgress` value (0→1)
scrubs the whole scene. Each section is a pinned chapter with a spin-and-swap morph at its
boundary.

| # | Ball | Environment | Beat / headline | Content panels (framing the ball) |
|---|------|-------------|-----------------|-----------------------------------|
| 0 | Brand orb | Deep space, blue rim light | **Hero** — "Maximize Impact. Measure Results. Reward Fans." | Logo + nav, headline, two CTAs ("I'm a Sponsor" / "Join as Athlete"), scroll cue |
| 1 | Soccer ⚽ | Pitch lines in fog, cool blue-green | **One network. Every sport.** — the Athlete Network + live network stats | Headline, lead, the 4 live network stat chips (provenance-labeled) |
| 2 | Basketball 🏀 | Hardwood, warm orange key | **Matching, done for you.** — the managed loop | Headline, lead, the 4-step loop, a hero stat ("median time to matched roster"), a "fit not fame" proof card |
| 3 | Baseball ⚾ | Twilight diamond, dusty ground light | **Packages, priced up front.** — the tiers | Headline, the 3 package cards ($750 Test Drive → Community → Season Partner), link to all six |
| 4 | Football 🏈 (squash → true prolate) | Gridiron yard-lines, scoreboard glow | **Results. Fans rewarded.** — verified delivery + QR reward funnel | Headline, scan-to-redemption funnel mini-viz, QR fan-reward callout, sponsor-report teaser |
| 5 | Ball → **SponsorX "X"** | Blue + orange bloom | **Start with one campaign.** — closing CTA | Headline, "Request a brief" / "Join as an athlete" CTAs, site footer |

Content source: every claim already lives on today's [`page.tsx`](../../../frontend/src/app/(public)/page.tsx)
(hero, `STEPS`, `PACKAGES`, athlete section, proof slots, closing CTA) and
`networkStats` in `@/lib/fixtures`. Proof/case-study slots stay real-or-empty. Stats keep
their source labels (§22).

## 4. Layout & composition

- **Ball pinned at viewport center** the entire scroll; the camera keeps it centered while it
  idles (slow spin + subtle bob).
- Content is an **asymmetric frame**, not four equal corner boxes: a dominant headline block,
  a supporting lead, and secondary stat/proof/package cards distributed around the ball with a
  clear hierarchy (see the approved `chapter-polished.html` mockup).
- A **left progress rail** marks the four sports (done / active / upcoming) so the "follow the
  ball down" system is legible; a **scroll cue** previews the next morph.
- **Per-chapter accent:** each chapter pulls its accent from its environment (soccer/baseball
  = blue family, basketball/football = orange family) while blue + orange stay the throughline.
- **Glass content panels:** low-opacity fill, hairline border, top highlight, soft shadow,
  backdrop blur — legible over the 3D without hiding it.

## 5. Scene system

- One **fixed, full-viewport `<canvas>`** at `z-0`, `aria-hidden="true"`, `pointer-events:none`.
- 2D content is normal scrolling DOM at `z-10` (real, server-rendered, accessible).
- A tall scroll container drives a single normalized `scrollProgress`. That one value scrubs:
  camera, ball spin, the **spin-and-swap morph** at each 1/6 boundary, environment cross-fade,
  and accent color. **Fully reversible** — scrolling up rewinds it.

## 6. The morph — spin & swap

At each chapter boundary: the ball accelerates into a motion-blurred spin, a **blue+orange
flash** blooms at peak, and it re-forms as the next sport's ball. Each ball stays a clean,
fully-textured Tripo model (no fragile vertex morphing). **Football is the one true-shape
beat** — it squashes from sphere toward a real prolate as it forms. The morph is scrubbed to
scroll, so it plays forward/backward with the user's motion.

## 7. Rendering tech — react-three-fiber + drei

- **`@react-three/fiber`** (declarative three.js in React) + **`@react-three/drei`** helpers:
  `useGLTF` (Tripo balls + environment sets), `<ScrollControls>` / scroll scrubbing,
  lighting/environment helpers.
- Component is `'use client'`, **dynamic-imported with `ssr: false`**, mounted only after
  first paint (see §9). This is the one place we deliberately adopt a heavy client dep; it is
  isolated to the home route and justified by build/maintenance velocity for a two-person team.
- Verify the current Next 16 dynamic-import / client-boundary conventions against
  `node_modules/next/dist/docs/` before writing code (per CLAUDE.md).

## 8. Environments — Tripo sets per sport (option B)

Each of the four sports gets a **richer 3D environment set generated in Tripo** (e.g. stylized
mini-court/pitch/diamond/gridiron with a hero prop — hoop, goal, bases, goalposts), lit with a
shared brand rig for consistency. Hero (0) and finale (5) are procedural (orb in space; the "X"
in a bloom). All environments are **stylized-but-recognizable**, never photoreal, never crowded
— they must sit inside the near-black brand.

Because environments are now full models, §10's cost controls are mandatory, and mobile uses
**baked/simplified environments** (see §11).

## 9. Performance, accessibility, fallback (non-negotiable)

- **LCP-safe:** a baked **poster image** of the hero chapter renders instantly as the page
  background. three.js mounts *after* first paint, then cross-fades poster → live scene. No 3D
  asset blocks LCP.
- **`prefers-reduced-motion`:** the canvas never mounts. The poster (or a static image per
  chapter) stays and content renders as a normal scroll page — consistent with the app's rule
  that final state lives in the DOM and motion is an overlay.
- **No-JS / SEO:** all copy is real server-rendered DOM; the canvas is purely decorative and
  `aria-hidden`. The page reads, ranks, and is navigable identically without the 3D.
- **Runtime guard:** if the device fails a quick capability/FPS check (low GPU, no WebGL),
  fall back to the static poster path.

## 10. Asset pipeline & budgets (Tripo)

- Author in **Tripo**, export **glTF/GLB**: 5 balls (soccer, basketball, baseball, football,
  brand orb/"X") + 4 environment sets.
- Post-process: **Draco or meshopt** geometry compression; texture caps (**≤2K**, prefer 1K;
  KTX2/basis where practical); **shared material setup** so brand rim-lighting is consistent.
- **Budgets (targets, refined during build):** each ball ≤ ~40–60k tris and ≤ ~1–2 MB
  compressed; each environment set ≤ ~150k tris and ≤ ~3–4 MB compressed; total streamed
  payload kept small enough to load progressively after the poster. Balls load first
  (chapter-ahead prefetch); environments stream per chapter.
- Assets live under `frontend/public/models/landing/` (or R2 CDN if payload warrants — decide
  at build time; presigned/public policy per the stack rules).

## 11. Responsive / mobile

- Ball shrinks to a smaller centered anchor; **no side gutters** — the chapter's content stacks
  *below* the ball.
- Reduced particle/light counts; **baked or heavily simplified environments** instead of full
  Tripo sets; morph kept; scrub kept if it holds an FPS budget, otherwise degrades to
  play-on-enter.
- Touch: scroll drives the scene exactly as wheel does.

## 12. File / component structure (proposed)

```
frontend/src/app/(public)/page.tsx        # server component: real DOM content + poster + mounts the scene
frontend/src/components/landing/
  landing-scene.tsx                        # 'use client', dynamic ssr:false — the r3f <Canvas> + ScrollControls
  landing-ball.tsx                         # ball model + spin/morph logic
  landing-environment.tsx                  # per-chapter Tripo environment + lighting
  landing-chapters.ts                      # chapter config: copy keys, accents, model refs, boundaries
  landing-poster.tsx                       # static LCP/fallback poster + reduced-motion path
  landing-content/                         # the 2D panels per chapter (server-rendered)
frontend/public/models/landing/           # optimized glTF assets (or R2)
```

Content components stay server-rendered; only the canvas layer is client.

## 13. Risks & mitigations

- **Bundle weight (three + r3f + drei).** Isolated to the home route, dynamic-imported after
  paint, behind the poster. Acceptable and contained.
- **Asset payload (option B environments).** Compression + budgets + stream-after-poster +
  mobile baking (§10–11).
- **Scroll-jank on mid/low devices.** FPS guard → static poster; mobile simplification.
- **Next 16 client-boundary specifics.** Read the in-repo Next docs before coding.
- **Tripo output quality/consistency.** Shared material rig + a review pass per asset; treat
  balls as hero detail, environments as mood.

## 14. Acceptance criteria

- Home page renders full content server-side with a poster background and passes LCP with 3D
  disabled.
- With JS + motion enabled: ball is centered, spins, and spin-and-swaps through all four sports;
  environments cross-fade per chapter; scene scrubs forward and reverses on scroll-up; football
  squashes to prolate; finale resolves to the "X".
- `prefers-reduced-motion` and no-WebGL both yield the static, fully-readable page.
- Mobile renders the stacked layout with the lighter scene and holds a usable frame rate.
- All landing copy, stats (provenance-labeled), and real-or-empty proof slots are preserved.

## 15. Decision log (locked)

- Concept: follow-the-ball, sports-as-chapters, finale → "X". **✓**
- Layout: ball pinned center, content frames it, per-sport environment behind. **✓**
- Environment realism: stylized-but-recognizable. **✓**
- Morph: spin & swap (+ football prolate). **✓**
- Scroll: scroll-scrubbed & reversible, pinned chapters. **✓**
- Environment build: **Tripo environment models per sport (option B).** **✓**
- Rendering library: **react-three-fiber + drei (option A).** **✓**
