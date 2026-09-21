# 2026-09-22 — tasks completed

## Task — `P1-ART-08` · 3D immersive landing (follow-the-ball scrollytelling)

**Trigger:** user asked for a 3D immersive background for the web app landing
page (three.js), with the ball morphing through sports as you scroll and the 2D
UI framing it. Brainstormed → spec → plan → built inline.

**Spec:** [docs/superpowers/specs/2026-09-22-landing-3d-scrollytelling-design.md](../../docs/superpowers/specs/2026-09-22-landing-3d-scrollytelling-design.md)
**Plan:** [docs/superpowers/plans/2026-09-22-landing-3d-scrollytelling.md](../../docs/superpowers/plans/2026-09-22-landing-3d-scrollytelling.md)
**Tripo prompts:** [docs/superpowers/plans/2026-09-22-landing-3d-tripo-asset-prompts.md](../../docs/superpowers/plans/2026-09-22-landing-3d-tripo-asset-prompts.md)

### The concept

The public home is now six pinned chapters. A ball is pinned at viewport centre;
as you scroll it spins-and-swaps through **soccer → basketball → baseball →
football** (football squashes to a real prolate), then collapses into the
SponsorX **"X"** at the closing CTA. Per-sport environments cross-fade behind it;
2D chapter content frames it. Sports are narrative beats over the existing §9.1
content — no invented claims; stats keep provenance labels.

### Key decision — vanilla three.js, NOT react-three-fiber

The spec first chose react-three-fiber. During build we hit a hard blocker:
`@react-three/fiber@9.7.0` (latest) declares peer `react >=19 <19.3`, which
**excludes this repo's pinned React 19.3.0**, and its tree pulls two copies of
`three`. r3f ships a version-coupled React reconciler (runtime risk), so we
switched to **vanilla three.js** — no React peer, one `three` version we control.
Spec §7/§15 and plan tasks 0/6/7/8/10/11 were revised accordingly. See
[[repo-split-express-backend]] for the workspace context.

### What was built (all on `feature/landing-3d-scrollytelling`)

Pure, unit-tested logic (Vitest, 62 frontend tests green):
- [landing-chapters.ts](../../frontend/src/lib/landing-chapters.ts) — the 6-chapter config (ball/env/accent/squash).
- [landing-scene-math.ts](../../frontend/src/lib/landing-scene-math.ts) — `chapterAt` / `morphState` scroll math.
- [landing-capability.ts](../../frontend/src/lib/landing-capability.ts) — `shouldRenderScene` gate + DOM probe.

Vanilla three.js scene (framework-free classes + thin React shell):
- [lib/three/landing-scene-app.ts](../../frontend/src/lib/three/landing-scene-app.ts) — renderer/scene/camera/RAF, scroll-scrub (eased), FPS watchdog.
- [lib/three/landing-ball-rig.ts](../../frontend/src/lib/three/landing-ball-rig.ts) — spin-and-swap, flash light, football squash, hero orb, finale X.
- [lib/three/landing-environment-rig.ts](../../frontend/src/lib/three/landing-environment-rig.ts) — fog/floor/grid + accent light lerp; lazy Tripo env models.
- [lib/three/landing-assets.ts](../../frontend/src/lib/three/landing-assets.ts) — GLTFLoader (+ meshopt), normalize, placeholder/`tryLoad` fallbacks.

React / DOM:
- [components/landing/landing-content.tsx](../../frontend/src/components/landing/landing-content.tsx) — the six server-rendered chapters (fallback + SEO).
- [landing-poster.tsx](../../frontend/src/components/landing/landing-poster.tsx), [landing-scene-mount.tsx](../../frontend/src/components/landing/landing-scene-mount.tsx) (capability gate + `next/dynamic` ssr:false + crossfade + FPS→poster degrade + mobile scrim), [landing-scene.tsx](../../frontend/src/components/landing/landing-scene.tsx) (canvas shell, callbacks via refs so the app inits once), [landing-progress-rail.tsx](../../frontend/src/components/landing/landing-progress-rail.tsx).
- [app/(public)/page.tsx](../../frontend/src/app/(public)/page.tsx) — rewritten: poster + scene mount + content.

### Assets

User generated 5 Tripo models (4 balls + brand X) — moved from `frontend/3dModels/`
to **`frontend/public/models/landing/`** (must be under public/ to serve). They're
uncompressed (~15 MB total, committed). **Follow-ups:** (1) Draco/meshopt
compression + texture caps to shrink payload; (2) generate the **4 environment
sets** (env-*.glb) — until then the environment rig shows its procedural base.
Provenance rule stands — see [[stats-must-be-retrievable]].

### Fallbacks (non-negotiable, all in)

Poster-first for LCP; `prefers-reduced-motion` / no-WebGL / low-perf → static
readable page (capability gate never mounts the canvas); FPS watchdog tears the
scene down to the poster if it can't hold ~40fps; mobile drops side gutters,
caps DPR to 1.5, and adds a scrim for text contrast.

### Follow-up (same session) — cinematic per-section reveal

Added a scroll-driven reveal on top of the scene: each chapter is now a **pinned
/ sticky** section (tall wrapper, `sticky` inner) whose 2D content **fades in →
holds → fades out** as you scroll — content appears one section at a time over the
3D. Hero is visible on load; mid sections fade both ways; finale fades in only.
Controller: [landing-reveal.tsx](../../frontend/src/components/landing/landing-reveal.tsx)
(scroll+rAF, reduced-motion aware); CSS gate in
[globals.css](../../frontend/src/app/globals.css) (`[data-lreveal]`,
`@media (scripting: enabled)` pre-hide, reduced-motion override) so no-JS /
reduced-motion keep content fully visible. Sections restructured in
[landing-content.tsx](../../frontend/src/components/landing/landing-content.tsx)
(`h-[200vh]` + sticky). Chosen by user: hero-on-load + pinned-hold.

### Verified

`npm run build` (frontend) compiles (26 pages); `npm test -w @sponsorx/frontend`
62 pass; eslint clean. **Not yet done:** manual visual matrix in a real browser
(reduced-motion / WebGL-off / mobile / Lighthouse) — headless WebGL unavailable
here; left for the user. Root `npm test` fails at the **backend** step (no
`backend/tests` dir yet) — pre-existing, unrelated.
