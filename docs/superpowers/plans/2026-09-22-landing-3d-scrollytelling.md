# SponsorX 3D Landing (Follow-the-Ball) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public marketing home as an immersive scroll experience — a ball pinned center that spins-and-swaps through four sports while per-sport 3D environments cross-fade behind it and 2D content frames it — with a fast, accessible, degradable fallback.

**Architecture:** The page stays a server component rendering all real content + a static poster (LCP-safe, SEO-safe). A `'use client'`, `ssr:false`, dynamically-imported react-three-fiber `<Canvas>` mounts *after* first paint and cross-fades over the poster. One scroll-driven `scrollProgress` value scrubs camera, ball spin, spin-and-swap morph, and environment cross-fade — all reversible. Pure logic (chapter math, morph state, capability gating) lives in `@/lib` and is unit-tested with Vitest; the visual layer is verified via `npm run build` + manual run.

**Tech Stack:** Next 16 (App Router, React 19), TypeScript, Tailwind v4 (existing design tokens), `three` + `@react-three/fiber` + `@react-three/drei`, Vitest, Tripo-authored glTF assets.

---

## Pre-flight (read before Task 1)

- **This is not the Next.js you know.** Read `frontend/node_modules/next/dist/docs/` on dynamic imports / client boundaries / `next/dynamic` before writing any client-mount code (CLAUDE.md rule).
- **Verify with `npm run build`, not `npx tsc`** (phantom `LayoutProps` errors on fresh checkout — CLAUDE.md).
- **Design tokens** already exist in `frontend/src/app/globals.css` (`--sx-primary` #2E9BF5, `--sx-accent` #F97A1F, surfaces, `--sx-ease`). Use token utilities (`bg-primary`, `text-accent`, etc.), never hardcoded hex, except inside the 3D material setup.
- **Existing content to preserve** lives in the current [`frontend/src/app/(public)/page.tsx`](../../../frontend/src/app/(public)/page.tsx) and `networkStats` in `@/lib/fixtures`. Approved visual reference: `.superpowers/brainstorm/*/content/chapter-polished.html` and `environments.html` (local, gitignored).
- **Assets** come from [Tripo prompts](2026-09-22-landing-3d-tripo-asset-prompts.md); scene code must tolerate assets being absent (render procedural placeholders) so the plan can be executed before art lands.
- Commands below run from `frontend/` unless noted. Tests: `npm test` (vitest). Build: `npm run build`.

## File structure

```
frontend/src/lib/
  landing-chapters.ts          # CHAPTERS config + types (pure data)
  landing-scene-math.ts        # scrollProgress → chapter/local/morph state (pure)
  landing-capability.ts        # shouldRenderScene() gate (pure) + thin DOM detector
frontend/src/components/landing/
  landing-poster.tsx           # static background poster (server); reduced-motion/no-JS/no-WebGL path
  landing-content.tsx          # the 2D chapter panels (server component; real DOM)
  landing-progress-rail.tsx    # left rail marking the 6 sections (client; reads scroll)
  landing-scene-mount.tsx      # client wrapper: capability gate + next/dynamic(ssr:false) loader + poster crossfade
  landing-scene.tsx            # 'use client' r3f <Canvas> + ScrollControls orchestration
  landing-ball.tsx             # ball model(s) + spin + spin-and-swap morph
  landing-environment.tsx      # per-chapter env models + lighting rig
frontend/public/models/landing/  # Tripo glTF assets (or R2 — see spec §10)
frontend/public/img/landing/      # baked poster(s)
frontend/tests/
  landing-scene-math.test.ts
  landing-chapters.test.ts
  landing-capability.test.ts
```

---

## Phase 0 — Dependencies & guardrail build

### Task 0: Install 3D deps and confirm the build is green

**Files:**
- Modify: `frontend/package.json` (via npm)

- [ ] **Step 1: Install runtime + types**

Run (from `frontend/`):
```bash
npm install three@^0.171.0 @react-three/fiber@^9.0.0 @react-three/drei@^10.0.0
npm install -D @types/three@^0.171.0
```
> Pin to versions compatible with **React 19** — verify `@react-three/fiber` v9+ (React 19 support) on the registry before installing; adjust the caret if a newer major exists. Record the resolved versions in the commit message.

- [ ] **Step 2: Confirm the tree still builds**

Run (from repo root): `npm run build`
Expected: PASS (both workspaces build; no new type errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json ../package-lock.json
git commit -m "chore(landing): add three.js + react-three-fiber + drei (P?-ART-XX)"
```

---

## Phase 1 — Content + poster (shippable on its own)

Goal: the home page renders all content as a normal, accessible scroll page over a static poster. No 3D yet. This alone is a valid landing page and the permanent fallback.

### Task 1: Chapter configuration (pure data, tested)

**Files:**
- Create: `frontend/src/lib/landing-chapters.ts`
- Test: `frontend/tests/landing-chapters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/landing-chapters.test.ts
import { describe, expect, it } from "vitest";
import { CHAPTERS, SECTION_COUNT, chapterById } from "@/lib/landing-chapters";

describe("CHAPTERS", () => {
  it("has 6 sections: hero, 4 sports, finale", () => {
    expect(SECTION_COUNT).toBe(6);
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      "hero", "soccer", "basketball", "baseball", "football", "finale",
    ]);
  });
  it("indexes are 0..5 in order", () => {
    CHAPTERS.forEach((c, i) => expect(c.index).toBe(i));
  });
  it("sports carry a ball + environment asset; hero/finale differ", () => {
    const soccer = chapterById("soccer");
    expect(soccer.kind).toBe("sport");
    expect(soccer.ball).toBe("ball-soccer.glb");
    expect(soccer.env).toBe("env-soccer-goal.glb");
    expect(chapterById("hero").ball).toBeNull();      // procedural orb
    expect(chapterById("finale").ball).toBe("brand-x.glb");
  });
  it("football is the prolate/squash chapter", () => {
    expect(chapterById("football").squash).toBe(true);
  });
  it("accents alternate per approved design (blue/orange throughline)", () => {
    expect(chapterById("soccer").accent).toBe("blue");
    expect(chapterById("basketball").accent).toBe("orange");
    expect(chapterById("baseball").accent).toBe("blue");
    expect(chapterById("football").accent).toBe("orange");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- landing-chapters`
Expected: FAIL ("Cannot find module '@/lib/landing-chapters'").

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/lib/landing-chapters.ts
export type Accent = "blue" | "orange";
export type ChapterKind = "hero" | "sport" | "finale";

export interface Chapter {
  id: string;
  index: number;
  kind: ChapterKind;
  /** glTF filename under /models/landing, or null for the procedural hero orb. */
  ball: string | null;
  /** glTF environment hero-prop filename, or null (hero/finale are procedural). */
  env: string | null;
  accent: Accent;
  /** football only: animate sphere → prolate as it forms. */
  squash?: boolean;
}

export const CHAPTERS: Chapter[] = [
  { id: "hero",       index: 0, kind: "hero",   ball: null,                  env: null,                      accent: "blue" },
  { id: "soccer",     index: 1, kind: "sport",  ball: "ball-soccer.glb",     env: "env-soccer-goal.glb",     accent: "blue" },
  { id: "basketball", index: 2, kind: "sport",  ball: "ball-basketball.glb", env: "env-basketball-hoop.glb", accent: "orange" },
  { id: "baseball",   index: 3, kind: "sport",  ball: "ball-baseball.glb",   env: "env-baseball-set.glb",    accent: "blue" },
  { id: "football",   index: 4, kind: "sport",  ball: "ball-football.glb",   env: "env-football-goalposts.glb", accent: "orange", squash: true },
  { id: "finale",     index: 5, kind: "finale", ball: "brand-x.glb",         env: null,                      accent: "orange" },
];

export const SECTION_COUNT = CHAPTERS.length;

export function chapterById(id: string): Chapter {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown chapter: ${id}`);
  return c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- landing-chapters`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/landing-chapters.ts frontend/tests/landing-chapters.test.ts
git commit -m "feat(landing): chapter config for the 3D scroll journey (P?-ART-XX)"
```

### Task 2: Poster + reduced-motion/no-JS fallback background

**Files:**
- Create: `frontend/src/components/landing/landing-poster.tsx`
- Create (asset): `frontend/public/img/landing/poster-hero.webp` (baked still of the hero chapter; until art lands, use a CSS-gradient poster — code below supports both)

- [ ] **Step 1: Implement the poster (server component)**

```tsx
// frontend/src/components/landing/landing-poster.tsx
/**
 * Static background rendered immediately for LCP and used as the permanent
 * fallback (reduced-motion, no-JS, no-WebGL, low-perf). The 3D canvas later
 * cross-fades over this. Purely decorative → aria-hidden.
 */
export function LandingPoster() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(80% 60% at 78% 92%, rgba(249,122,31,.18), transparent 55%)," +
          "radial-gradient(70% 55% at 20% 8%, rgba(46,155,245,.12), transparent 60%)," +
          "var(--sx-bg)",
      }}
    >
      {/* Swap for a baked image once art lands:
          <img src="/img/landing/poster-hero.webp" alt="" className="h-full w-full object-cover opacity-60" /> */}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run (root): `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landing/landing-poster.tsx
git commit -m "feat(landing): static poster + fallback background (P?-ART-XX)"
```

### Task 3: Chapter content panels (server DOM — the real page)

**Files:**
- Create: `frontend/src/components/landing/landing-content.tsx`
- Reference (copy content from): current `frontend/src/app/(public)/page.tsx`, `@/lib/fixtures` `networkStats`

- [ ] **Step 1: Implement the six content sections**

Port the existing approved copy into six full-viewport `<section>`s, each `min-h-screen`, id = chapter id, content laid out as the approved `chapter-polished.html` mockup (asymmetric: eyebrow + headline + lead on one side, stat/proof/package cards framing the center where the ball sits). Keep all existing claims, `networkStats` (with `title={s.source}` provenance), the `STEPS`, `PACKAGES`, athlete jobs, real-or-empty proof slots, and both CTAs. Leave a centered empty column (`min-w-0`) where the ball is visually centered.

```tsx
// frontend/src/components/landing/landing-content.tsx  (skeleton — fill each section with ported copy)
import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { networkStats } from "@/lib/fixtures";
import { CHAPTERS } from "@/lib/landing-chapters";

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative flex min-h-screen items-center">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 lg:grid-cols-[1fr_minmax(18rem,26rem)_1fr] lg:items-center">
        {children}
      </div>
    </section>
  );
}

export function LandingContent() {
  return (
    <div className="relative z-10">
      {/* 0 hero */}
      <Section id="hero"> … headline, CTAs, scroll cue … </Section>
      {/* 1 soccer — network + live stats */}
      <Section id="soccer"> … networkStats.map(...) with provenance … </Section>
      {/* 2 basketball — the managed loop (STEPS) + stat + proof */}
      <Section id="basketball"> … </Section>
      {/* 3 baseball — the 3 PACKAGES */}
      <Section id="baseball"> … </Section>
      {/* 4 football — results: funnel + QR reward + report teaser */}
      <Section id="football"> … </Section>
      {/* 5 finale — closing CTA + footer */}
      <Section id="finale"> … </Section>
    </div>
  );
}
```
> No invented data: every number/claim must already exist on today's page or in fixtures. The middle grid column is intentionally empty (the ball floats there via the fixed canvas behind).

- [ ] **Step 2: Wire it into the route (content-only, no 3D yet)**

Rewrite `frontend/src/app/(public)/page.tsx` to render `<LandingPoster />` + `<LandingContent />` only.

```tsx
// frontend/src/app/(public)/page.tsx
import { LandingPoster } from "@/components/landing/landing-poster";
import { LandingContent } from "@/components/landing/landing-content";

export default function HomePage() {
  return (
    <>
      <LandingPoster />
      <LandingContent />
    </>
  );
}
```

- [ ] **Step 3: Verify build + run**

Run (root): `npm run build`; then `npm run dev:web` and open `/`.
Expected: full landing page readable as normal scroll, poster behind, all copy/stats/CTAs present, no console errors. Use the `/run` skill or manual check. Confirm keyboard/scroll and screen-reader order are natural.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/landing/landing-content.tsx "frontend/src/app/(public)/page.tsx"
git commit -m "feat(landing): server-rendered chapter content over poster (P?-ART-XX)"
```

---

## Phase 2 — Scroll math + capability gate (pure, tested)

### Task 4: Scroll → chapter/morph state math

**Files:**
- Create: `frontend/src/lib/landing-scene-math.ts`
- Test: `frontend/tests/landing-scene-math.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/landing-scene-math.test.ts
import { describe, expect, it } from "vitest";
import { clamp01, chapterAt, morphState, MORPH_BAND } from "@/lib/landing-scene-math";

describe("clamp01", () => {
  it("clamps below/above/within", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe("chapterAt (6 sections)", () => {
  it("start is chapter 0 local 0", () => {
    expect(chapterAt(0)).toEqual({ index: 0, local: 0 });
  });
  it("end clamps to last chapter", () => {
    expect(chapterAt(1)).toEqual({ index: 5, local: expect.closeTo(1, 5) });
  });
  it("mid of chapter 2 (basketball)", () => {
    // chapter 2 spans [2/6, 3/6); its midpoint is 2.5/6
    const r = chapterAt(2.5 / 6);
    expect(r.index).toBe(2);
    expect(r.local).toBeCloseTo(0.5, 5);
  });
});

describe("morphState", () => {
  it("no morph early in a chapter", () => {
    expect(morphState(2.1 / 6)).toMatchObject({ from: 2, to: 2, t: 0 });
  });
  it("morphs into next chapter within the trailing band", () => {
    // last MORPH_BAND of chapter 1 → chapter 2
    const p = (1 + (1 - MORPH_BAND / 2)) / 6; // inside the band
    const m = morphState(p);
    expect(m.from).toBe(1);
    expect(m.to).toBe(2);
    expect(m.t).toBeGreaterThan(0);
    expect(m.t).toBeLessThanOrEqual(1);
  });
  it("never morphs past the final chapter", () => {
    expect(morphState(0.999)).toMatchObject({ from: 5, to: 5, t: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- landing-scene-math`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/lib/landing-scene-math.ts
import { SECTION_COUNT } from "./landing-chapters";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface ChapterAt { index: number; local: number; }

/** Map overall scroll progress 0..1 to the active chapter index and the
 *  local progress 0..1 inside that chapter. */
export function chapterAt(progress: number): ChapterAt {
  const p = clamp01(progress);
  const span = 1 / SECTION_COUNT;
  let index = Math.floor(p / span);
  if (index >= SECTION_COUNT) index = SECTION_COUNT - 1;
  const local = clamp01((p - index * span) / span);
  return { index, local };
}

/** Fraction of a chapter, at its tail, over which the spin-and-swap runs. */
export const MORPH_BAND = 0.3;

export interface MorphState { from: number; to: number; t: number; }

/** Spin-and-swap progress: 0 until the trailing band, then 0..1 into the next
 *  chapter's ball. The final chapter never morphs forward. */
export function morphState(progress: number): MorphState {
  const { index, local } = chapterAt(progress);
  const isLast = index >= SECTION_COUNT - 1;
  if (isLast || local < 1 - MORPH_BAND) return { from: index, to: index, t: 0 };
  const t = clamp01((local - (1 - MORPH_BAND)) / MORPH_BAND);
  return { from: index, to: index + 1, t };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- landing-scene-math`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/landing-scene-math.ts frontend/tests/landing-scene-math.test.ts
git commit -m "feat(landing): scroll→chapter/morph state math (P?-ART-XX)"
```

### Task 5: Capability gate

**Files:**
- Create: `frontend/src/lib/landing-capability.ts`
- Test: `frontend/tests/landing-capability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/landing-capability.test.ts
import { describe, expect, it } from "vitest";
import { shouldRenderScene, type Capability } from "@/lib/landing-capability";

const base: Capability = { webgl: true, reducedMotion: false, coarseLowPerf: false };

describe("shouldRenderScene", () => {
  it("renders when webgl ok, motion allowed, not low-perf", () => {
    expect(shouldRenderScene(base)).toBe(true);
  });
  it("never renders without webgl", () => {
    expect(shouldRenderScene({ ...base, webgl: false })).toBe(false);
  });
  it("never renders under reduced-motion", () => {
    expect(shouldRenderScene({ ...base, reducedMotion: true })).toBe(false);
  });
  it("never renders on a low-perf coarse device", () => {
    expect(shouldRenderScene({ ...base, coarseLowPerf: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- landing-capability`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation (pure gate + thin DOM detector)**

```ts
// frontend/src/lib/landing-capability.ts
export interface Capability {
  webgl: boolean;
  reducedMotion: boolean;
  /** touch device with low hardware concurrency — take the light path. */
  coarseLowPerf: boolean;
}

/** Pure decision — unit tested. */
export function shouldRenderScene(cap: Capability): boolean {
  return cap.webgl && !cap.reducedMotion && !cap.coarseLowPerf;
}

/** Thin DOM probe (not unit-tested; guarded for SSR). */
export function detectCapability(): Capability {
  if (typeof window === "undefined") {
    return { webgl: false, reducedMotion: true, coarseLowPerf: true };
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  return { webgl, reducedMotion, coarseLowPerf: coarse && cores <= 4 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- landing-capability`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/landing-capability.ts frontend/tests/landing-capability.test.ts
git commit -m "feat(landing): scene capability gate (P?-ART-XX)"
```

---

## Phase 3 — Mount the canvas (empty scene, centered ball, poster crossfade)

### Task 6: Client mount wrapper with dynamic import + poster crossfade

**Files:**
- Create: `frontend/src/components/landing/landing-scene-mount.tsx`
- Modify: `frontend/src/app/(public)/page.tsx`

- [ ] **Step 1: Implement the mount wrapper**

```tsx
// frontend/src/components/landing/landing-scene-mount.tsx
"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { detectCapability, shouldRenderScene } from "@/lib/landing-capability";

// Never SSR the WebGL canvas; load it only after we decide to render it.
const LandingScene = dynamic(
  () => import("./landing-scene").then((m) => m.LandingScene),
  { ssr: false },
);

/**
 * Decides at runtime whether to mount the 3D scene. If yes, mounts it above the
 * poster and fades it in after first frame. If no (reduced-motion / no-WebGL /
 * low-perf), renders nothing and the poster remains.
 */
export function LandingSceneMount() {
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (shouldRenderScene(detectCapability())) setRender(true);
  }, []);

  if (!render) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-[5] transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <LandingScene onReady={() => setVisible(true)} />
    </div>
  );
}
```
> Confirm `next/dynamic` `ssr:false` usage against the in-repo Next 16 docs before relying on it.

- [ ] **Step 2: Add the mount to the page (below poster, behind content)**

```tsx
// frontend/src/app/(public)/page.tsx
import { LandingPoster } from "@/components/landing/landing-poster";
import { LandingSceneMount } from "@/components/landing/landing-scene-mount";
import { LandingContent } from "@/components/landing/landing-content";

export default function HomePage() {
  return (
    <>
      <LandingPoster />
      <LandingSceneMount />
      <LandingContent />
    </>
  );
}
```

- [ ] **Step 3: Implement a minimal scene (centered lit sphere, no scroll yet)**

```tsx
// frontend/src/components/landing/landing-scene.tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return null;
}

export function LandingScene({ onReady }: { onReady?: () => void }) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
      <Ready onReady={onReady} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[-4, 5, 5]} intensity={2} color="#63b4f8" />
      <directionalLight position={[5, -3, 3]} intensity={2.5} color="#f97a1f" />
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial color="#f97a1f" roughness={0.6} metalness={0.1} />
      </mesh>
    </Canvas>
  );
}
```

- [ ] **Step 4: Verify build + run**

Run (root): `npm run build`; then `npm run dev:web`, open `/`.
Expected: a centered, brand-lit sphere fades in over the poster; content scrolls above it; with DevTools "Emulate prefers-reduced-motion: reduce" the sphere never appears (poster only). No console/WebGL errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/landing-scene-mount.tsx frontend/src/components/landing/landing-scene.tsx "frontend/src/app/(public)/page.tsx"
git commit -m "feat(landing): mount r3f canvas with poster crossfade + capability gate (P?-ART-XX)"
```

---

## Phase 4 — Scroll scrub: camera, spin, chapter tracking

### Task 7: Drive the scene from scroll progress

**Files:**
- Modify: `frontend/src/components/landing/landing-scene.tsx`
- Create: `frontend/src/components/landing/landing-ball.tsx`

- [ ] **Step 1: Implement a scroll-progress hook (whole-page scroll → 0..1)**

Add to `landing-scene.tsx` a listener that maps `window.scrollY / (scrollHeight - innerHeight)` to a ref, read inside `useFrame`. (Or use drei `<ScrollControls>` if you render content inside the canvas; here content is DOM, so track `window` scroll.) Smooth with a lerp toward the target each frame for the scrubbed feel.

```tsx
// inside landing-scene.tsx
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { chapterAt } from "@/lib/landing-scene-math";

function useScrollProgress() {
  const target = useRef(0);
  const smooth = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      target.current = max > 0 ? window.scrollY / max : 0;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return { target, smooth };
}
```

- [ ] **Step 2: Implement the ball component (spin keyed to scroll)**

```tsx
// frontend/src/components/landing/landing-ball.tsx
"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

export function Ball({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    // idle spin + extra spin proportional to scroll velocity feel
    ref.current.rotation.y += dt * 0.4 + progressRef.current * dt * 2;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color="#f97a1f" roughness={0.6} metalness={0.1} />
    </mesh>
  );
}
```

- [ ] **Step 3: Lerp smooth→target each frame and drive camera/ball; expose active chapter**

In `landing-scene.tsx`, each `useFrame`: `smooth += (target - smooth) * min(1, dt*4)`, pass `smooth` ref to `<Ball>`, and set a subtle camera dolly/parallax from `chapterAt(smooth)`. Store active chapter index in a ref and (throttled) in React state to drive the progress rail (Task 9).

- [ ] **Step 4: Verify run**

Run: `npm run dev:web`, open `/`, scroll.
Expected: ball spin responds to scroll and eases (scrub feel); scrolling up rewinds; no jank on a mid-tier profile (DevTools 4× CPU throttle sanity check).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/landing-scene.tsx frontend/src/components/landing/landing-ball.tsx
git commit -m "feat(landing): scroll-scrubbed camera + ball spin (P?-ART-XX)"
```

---

## Phase 5 — Spin-and-swap morph (+ football prolate)

### Task 8: Ball swap with flash + football squash, keyed to morphState

**Files:**
- Modify: `frontend/src/components/landing/landing-ball.tsx`
- Depends on: Task 4 `morphState`, Task 1 `CHAPTERS`, Tripo assets (falls back to tinted spheres if absent)

- [ ] **Step 1: Load ball models with graceful fallback**

Use drei `useGLTF` per `CHAPTERS[i].ball`; if a file is missing, catch and render a tinted sphere placeholder so the plan runs before art lands. Preload the next chapter's ball.

```tsx
// sketch — landing-ball.tsx
import { useGLTF } from "@react-three/drei";
import { CHAPTERS } from "@/lib/landing-chapters";
import { morphState } from "@/lib/landing-scene-math";
// Attempt useGLTF for CHAPTERS[i].ball; wrap in an error boundary / try pattern
// with a <mesh><sphereGeometry/> fallback tinted by accent.
```

- [ ] **Step 2: Implement the swap**

In `useFrame`, read `morphState(smooth)`. Render the `from` ball scaled/spun out and the `to` ball scaled/spun in as `t` goes 0→1 (spin speed ramps with `t`, scale dips at the midpoint), and drive a flash sprite/point-light whose intensity peaks at `t≈0.5` in blended blue+orange. For `CHAPTERS[to].squash`, interpolate the mesh `scale.x` toward a prolate ratio (≈1.6× long axis, ≈0.75× cross) as `t`→1.

- [ ] **Step 3: Finale — ball → brand X**

When morphing into `finale` (to index 5), swap to `brand-x.glb` (or a placeholder extruded X) with the same flash; hold it centered under the CTA.

- [ ] **Step 4: Verify run**

Run: `npm run dev:web`; scroll slowly through every boundary and reverse.
Expected: each boundary shows spin-blur + blue/orange flash + clean swap; football visibly becomes prolate; finale resolves to the X; fully reversible; no flicker or NaN transforms.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/landing-ball.tsx
git commit -m "feat(landing): spin-and-swap morph incl. football prolate + finale X (P?-ART-XX)"
```

---

## Phase 6 — Environments + progress rail

### Task 9: Progress rail (client, reads active chapter)

**Files:**
- Create: `frontend/src/components/landing/landing-progress-rail.tsx`
- Modify: `frontend/src/components/landing/landing-scene-mount.tsx` (share active-chapter state) or use a small zustand-free context/callback.

- [ ] **Step 1: Implement the rail**

Fixed left rail listing the 6 sections (labels from `CHAPTERS`), dot states done/active/upcoming, active dot uses the chapter accent, wrapped in `aria-hidden` (it mirrors the real headings). Drive `active` from the scene's throttled chapter-index callback. Hide on `max-width:900px`.

- [ ] **Step 2: Verify run** — rail highlights the correct sport as you scroll; hidden on mobile widths.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landing/landing-progress-rail.tsx frontend/src/components/landing/landing-scene-mount.tsx
git commit -m "feat(landing): chapter progress rail (P?-ART-XX)"
```

### Task 10: Per-chapter environments + lighting cross-fade

**Files:**
- Create: `frontend/src/components/landing/landing-environment.tsx`
- Modify: `frontend/src/components/landing/landing-scene.tsx`

- [ ] **Step 1: Implement environment loader + cross-fade**

For `chapterAt(smooth)`, render the current chapter's env model (drei `useGLTF`, missing-file → procedural fallback: a fog-faded floor `<gridHelper>`/plane + accent lights) and cross-fade opacity/lights toward the next during the morph band. Add a subtle floor, `<fog>` on the scene, and an accent light rig whose color lerps between chapter accents. Keep draw calls low; dispose GLTFs you scroll far from.

```tsx
// sketch — landing-environment.tsx
import { useGLTF } from "@react-three/drei";
import { CHAPTERS } from "@/lib/landing-chapters";
// Given {index, local}, mount CHAPTERS[index].env (+ next during morph band),
// fade materials via a shared uniform / material.opacity, tint lights by accent.
```

- [ ] **Step 2: Preload strategy** — preload current + next env; drop the one two chapters back.

- [ ] **Step 3: Verify build + run**

Run (root): `npm run build`; `npm run dev:web`, scroll.
Expected: each chapter shows its recognizable environment (goal/hoop/plate/goalposts or fallback), environments cross-fade at boundaries, lighting shifts blue↔orange, frame rate holds. Confirm reduced-motion still shows poster only.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/landing/landing-environment.tsx frontend/src/components/landing/landing-scene.tsx
git commit -m "feat(landing): per-sport Tripo environments + lighting crossfade (P?-ART-XX)"
```

---

## Phase 7 — Mobile, performance, polish

### Task 11: Mobile light path + perf guard

**Files:**
- Modify: `frontend/src/components/landing/landing-scene.tsx`, `landing-scene-mount.tsx`, `landing-content.tsx`

- [ ] **Step 1:** On coarse/low-perf (from `detectCapability`), when the scene *does* mount (motion allowed, webgl ok, but coarse): reduce `dpr` cap to 1.5, drop set-piece env models (hero prop only), reduce lights/particles, and if a running FPS sample (EMA over `useFrame` dt) stays below ~40fps for ~2s, unmount the canvas and reveal the poster.
- [ ] **Step 2:** In `landing-content.tsx`, at `<lg` the middle ball column collapses and content stacks; ensure the ball (smaller) sits above each chapter's stacked content, not behind text.
- [ ] **Step 3: Verify run** — DevTools device emulation (mobile): content readable stacked, ball smaller/centered, no horizontal scroll, acceptable FPS; forced low-FPS falls back to poster.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/landing/
git commit -m "feat(landing): mobile light path + FPS fallback guard (P?-ART-XX)"
```

### Task 12: Final polish, a11y & full verification

- [ ] **Step 1:** Confirm `<canvas>` and rail are `aria-hidden`; tab order and headings read as a normal page; focus states on CTAs intact.
- [ ] **Step 2:** Run the whole suite and build. Root: `npm test` then `npm run build`. Expected: all green.
- [ ] **Step 3:** Manual matrix: (a) desktop full scene fwd/reverse, (b) reduced-motion → poster, (c) DevTools WebGL disabled → poster, (d) mobile emulation. Use the `/verify` skill to drive `/` and observe.
- [ ] **Step 4:** Lighthouse on `/` (built, `npm run start -w @sponsorx/frontend`): LCP not regressed vs. poster-only; no CLS from the canvas.
- [ ] **Step 5: Commit**

```bash
git commit -am "polish(landing): a11y + verification pass (P?-ART-XX)"
```

---

## Task board + memory (do as part of finishing, per CLAUDE.md)

- [ ] Add a row to `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` for this work with a real task ID (assign the next free `P1-ART-XX` — confirm against the Phase 1 doc), fractional `Order`, `Owner`, `Date Started`/`Date Done`, and extend the Dashboard `COUNTIF`/`COUNTA`/`SUMIF`, autofilter, conditional-formatting and Status validation ranges by one row (build a throwaway venv with `openpyxl` in the session scratchpad; back the workbook up there first).
- [ ] Append a session log under `memory/2026-09-22/` (create if missing) describing the 3D landing build; update baseline only if a foundational fact changed.
- [ ] End of day: mirror the row into the Google Sheet by hand (it cannot be automated).

## Definition of done

- All 12 tasks' verifications pass; `npm test` and `npm run build` green.
- The four fallback modes (full / reduced-motion / no-WebGL / mobile-low-perf) all yield a correct, readable page.
- All §9.1 landing content preserved with provenance labels and real-or-empty proof.
- Spec §14 acceptance criteria all satisfied.

---

## Self-review (completed against the spec)

- **Spec coverage:** concept & narrative → Tasks 1,3; layout/composition → Task 3; scene system → Tasks 6–7; morph → Task 8; rendering tech → Task 0,6; environments (option B) → Task 10 + Tripo prompts doc; perf/LCP/reduced-motion/no-JS/mobile fallbacks → Tasks 2,5,6,11,12; asset pipeline → Tripo prompts doc + Task 8/10 loaders. No uncovered section.
- **Placeholder scan:** logic tasks (1,4,5) carry full test + impl code. Visual tasks (3,7,8,9,10,11) give real scaffolds + precise verification; the `…`-marked content spots are explicit "port existing approved copy from `page.tsx`/mockup," which is concrete, not invented — flagged deliberately so no claims are fabricated.
- **Type consistency:** `Chapter`/`Accent`/`ChapterKind`, `chapterById`, `SECTION_COUNT`, `chapterAt`, `morphState`/`MORPH_BAND`, `Capability`/`shouldRenderScene`/`detectCapability` names match across all tasks and tests.
- **Known adaptation:** exact `@react-three/fiber`/`@react-three/drei` and `next/dynamic` API calls must be checked against the *installed* versions and in-repo Next 16 docs at execution time (noted in Pre-flight and Tasks 0,6). This is a version-verification step, not a placeholder.
```
