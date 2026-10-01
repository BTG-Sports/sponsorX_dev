# `/next/about` Flipbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three scrolling spreads on `/next/about` with one interactive magazine: a closed book the reader opens and pages through with real 3D page turns, one page at a time on phones.

**Architecture:** A new client component `MagBook` owns one piece of state, the current face index, and renders eight server-rendered faces as four leaves; CSS does the 3D turn. The stage file assembles the faces from the existing `MagPage` content and passes them in. Pure helpers (spread/next/prev/label/hash mapping) live in `lib/next-about.ts` and are unit-tested. The flip-on-scroll CSS from the previous pass is deleted.

**Tech Stack:** Next 16 App Router, React 19 (`inert` prop), Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-next-about-flipbook-design.md`. **Previous pass:** `docs/superpowers/plans/2026-09-30-next-about-magazine.md` (all merged; HEAD `0fb6824`).

**Repo rules:** the owner's `next dev` is live on port 3000 — never stop it, never start another, never `next build` on this tree (verify builds in a detached worktree, see memory note "build-in-detached-worktree"). Commit messages carry `P1-FE-24` and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage only named files. Git Bash shell. `npx tsc --noEmit -p .` in `frontend/` currently prints nothing.

---

### Task 1: Helpers (TDD)

**Files:**
- Modify: `frontend/src/lib/next-about.ts` (append)
- Modify: `frontend/tests/next-about.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts

describe("the book — faces, spreads and turns", () => {
  it("maps a face to its spread (leaves turned)", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(spreadOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it("turns forward by leaf in spread mode and by face in page mode", () => {
    expect(nextFace(0, "spread")).toBe(1);
    expect(nextFace(1, "spread")).toBe(3);
    expect(nextFace(2, "spread")).toBe(3);
    expect(nextFace(6, "spread")).toBe(7);
    expect(nextFace(7, "spread")).toBe(7);
    expect(nextFace(0, "page")).toBe(1);
    expect(nextFace(7, "page")).toBe(7);
  });
  it("turns back the same way", () => {
    expect(prevFace(7, "spread")).toBe(5);
    expect(prevFace(3, "spread")).toBe(1);
    expect(prevFace(1, "spread")).toBe(0);
    expect(prevFace(0, "spread")).toBe(0);
    expect(prevFace(4, "page")).toBe(3);
    expect(prevFace(0, "page")).toBe(0);
  });
  it("labels the counter", () => {
    expect(faceLabel(0, "spread")).toBe("Cover");
    expect(faceLabel(2, "spread")).toBe("02–03");
    expect(faceLabel(5, "spread")).toBe("06–07");
    expect(faceLabel(7, "spread")).toBe("Back cover");
    expect(faceLabel(4, "page")).toBe("05");
    expect(faceLabel(7, "page")).toBe("Back cover");
  });
  it("hashes open the right face", () => {
    expect(HASH_FACE["#magazine"]).toBe(1);
    expect(HASH_FACE["#how"]).toBe(3);
    expect(HASH_FACE["#students"]).toBe(5);
    expect(CHIPS.map((c) => c.face)).toEqual([0, 1, 3, 5, 7]);
  });
});
```

Add `CHIPS, HASH_FACE, faceLabel, nextFace, prevFace, spreadOf` to the existing import line from `../src/lib/next-about`.

- [ ] **Step 2: Run, see them fail**

```bash
cd frontend && npx vitest run tests/next-about.test.ts
```

Expected: FAIL — `spreadOf is not a function` (or "does not provide an export").

- [ ] **Step 3: Append the helpers**

```ts

/* ------------------------------------------------------------------- book */

/** The book's eight faces in reading order: cover, pages 02–07, back cover.
 *  Leaves are face pairs: [0,1] [2,3] [4,5] [6,7]. */
export const FACE_COUNT = 8;
export const LEAF_COUNT = FACE_COUNT / 2;
export type BookMode = "spread" | "page";

/** Leaves turned when face `f` is current: the closed cover is 0, pages
 *  02–03 are 1 … the back cover alone is 4. */
export const spreadOf = (f: number) => Math.ceil(f / 2);

export function nextFace(f: number, mode: BookMode): number {
  if (mode === "page") return Math.min(FACE_COUNT - 1, f + 1);
  const k = spreadOf(f) + 1;
  return k >= LEAF_COUNT ? FACE_COUNT - 1 : 2 * k - 1;
}

export function prevFace(f: number, mode: BookMode): number {
  if (mode === "page") return Math.max(0, f - 1);
  const k = spreadOf(f) - 1;
  return k <= 0 ? 0 : 2 * k - 1;
}

const folio = (f: number) => String(f + 1).padStart(2, "0");

export function faceLabel(f: number, mode: BookMode): string {
  if (f === 0) return "Cover";
  if (f === FACE_COUNT - 1) return "Back cover";
  if (mode === "page") return folio(f);
  const k = spreadOf(f);
  return `${folio(2 * k - 1)}–${folio(2 * k)}`;
}

/** In-page hashes that open the book. The section itself is #magazine;
 *  #how and #students keep their old meaning (spreads 2 and 3). */
export const HASH_FACE: Record<string, number> = { "#magazine": 1, "#how": 3, "#students": 5 };

/** The jump chips under the book. */
export const CHIPS = [
  { label: "Cover", face: 0 },
  { label: "Students · Schools", face: 1 },
  { label: "How it works", face: 3 },
  { label: "What you get", face: 5 },
  { label: "Back cover", face: 7 },
] as const;
```

- [ ] **Step 4: Run, see them pass**

```bash
cd frontend && npx vitest run tests/next-about.test.ts
```

Expected: `Tests  12 passed (12)`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/next-about.ts frontend/tests/next-about.test.ts
git commit -m "feat(P1-FE-24): flipbook helpers — spread/next/prev/label, hash and chip maps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: CSS — delete the flip-on-scroll rules, add the book

**Files:**
- Modify: `frontend/src/app/globals.css` — the `.sx-mag` block (starts at the banner "/next/about magazine stage", ~line 1942).

- [ ] **Step 1: Delete the sheet rules and the page-flip entrance**

Remove these rules entirely (they are contiguous, from `.sx-mag-sheet {` through the line `[data-sx-stage][data-armed] .sx-mag-spread[data-in] > .sx-mag-sheet::before { opacity: 0; }`):
`.sx-mag-sheet`, its `@media (min-width: 64rem)` padding override, `.sx-mag-sheet::before`, `.sx-mag-spine`, `.sx-mag-curl`, and the whole `/* page-flip entrance */` group. **Keep** `.sx-mag` (tokens), `.sx-mag-dropcap`, the `.sx-mag-cols` media block, the cover glow, `.sx-mag-shelf`, `.sx-mag-mini`.

In the reduced-motion block at the end of `.sx-mag`, remove the two entries that reference `.sx-mag-sheet` / `.sx-mag-spread` (keep the cover-glow and mini lines).

Change the `.sx-mag-cols` media query from `@media (min-width: 64rem)` to `@media (min-width: 80rem)` (two columns from xl, spec §4).

- [ ] **Step 2: Update the banner**

Replace the banner's bullet lines for `.sx-mag-sheet` … and `.sx-mag-spread` with:

```
   - `.sx-book*`: the interactive magazine (next-about-book.tsx). The book
     is four leaves of two faces; `data-f` (current face) and `data-k`
     (leaves turned) drive the 3D turn from lg, the single-page hinge
     below lg, and the 25% shift that centres a closed or finished book.
     `<noscript>` lays the faces out flat.
```

- [ ] **Step 3: Append the book rules** (before the reduced-motion block, after `.sx-mag-mini`)

```css
/* ---------------------------------------------------------------- book */
.sx-book-wrap { --sx-book-w: min(1180px, 100%); }
.sx-book {
  position: relative;
  width: var(--sx-book-w);
  aspect-ratio: 3 / 2;
  margin: 0 auto;
  perspective: 2200px;
  transition: transform 0.8s var(--sx-ease);
  user-select: none;
}
.sx-book[data-k="0"] { transform: translateX(-25%); }
.sx-book[data-k="4"] { transform: translateX(25%); }
.sx-leaf {
  position: absolute;
  top: 0;
  left: 50%;
  width: 50%;
  height: 100%;
  transform-origin: 0 50%;
  transform-style: preserve-3d;
  transition: transform 1.05s cubic-bezier(0.35, 0, 0.25, 1);
  cursor: pointer;
}
.sx-leaf[data-turned] { transform: rotateY(-180deg); }
.sx-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  background: var(--mag-paper);
  color: var(--mag-ink);
}
.sx-face-front { border-radius: 0 4px 4px 0; box-shadow: inset 18px 0 24px -18px rgba(0, 0, 0, 0.28); }
.sx-face-back { transform: rotateY(180deg); border-radius: 4px 0 0 4px; box-shadow: inset -18px 0 24px -18px rgba(0, 0, 0, 0.28); }
.sx-face-dark { background: transparent; color: var(--sx-on-media, #f4f5f7); }
.sx-leaf-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.28), transparent 40%);
  opacity: 0;
  transition: opacity 0.55s ease;
}
.sx-leaf[data-turning] .sx-leaf-shade { opacity: 1; }
.sx-book-hint {
  animation: sx-book-hint 2s ease-in-out infinite;
}
@keyframes sx-book-hint {
  0%, 100% { box-shadow: 0 0 12px rgba(255, 209, 43, 0.25); }
  50% { box-shadow: 0 0 26px rgba(255, 209, 43, 0.6); }
}
.sx-book-shadow {
  position: absolute;
  inset: auto 6% -6% 6%;
  height: 12%;
  background: radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.55), transparent 70%);
  filter: blur(6px);
  pointer-events: none;
}

/* page mode: one face at a time, hinging in and out */
@media (max-width: 63.999rem) {
  .sx-book-wrap { --sx-book-w: min(100%, 520px); }
  .sx-book { aspect-ratio: 3 / 4; perspective: 1400px; }
  .sx-book[data-k] { transform: none; }
  .sx-leaf { left: 0; width: 100%; transform: none !important; transition: none; }
  .sx-face { display: none; transform: none; overflow-y: auto; }
  .sx-face[data-show] { display: block; animation: sx-page-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); transform-origin: var(--sx-page-origin, 100% 50%); }
  .sx-face[data-leaving] { display: block; animation: sx-page-out 0.4s cubic-bezier(0.4, 0, 0.6, 1) forwards; transform-origin: var(--sx-page-origin, 0 50%); pointer-events: none; }
  .sx-leaf-shade { display: none; }
}
@keyframes sx-page-in { from { transform: rotateY(var(--sx-page-in-from, 70deg)); opacity: 0.4; } to { transform: none; opacity: 1; } }
@keyframes sx-page-out { from { transform: none; opacity: 1; } to { transform: rotateY(var(--sx-page-out-to, -70deg)); opacity: 0; } }

/* controls */
.sx-book-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid rgba(127, 208, 255, 0.5);
  color: #bfe0ff;
  transition: border-color 0.2s, color 0.2s;
}
.sx-book-btn:hover:not(:disabled) { border-color: #bfe0ff; color: #fff; }
.sx-book-btn:disabled { opacity: 0.3; }
.sx-book-chip {
  border: 1px solid rgba(156, 199, 255, 0.3);
  background: rgba(7, 19, 42, 0.6);
  border-radius: 4px;
  padding: 7px 11px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transition: border-color 0.2s, color 0.2s;
}
.sx-book-chip[aria-current="true"] { border-color: #ffd12b; color: #ffd12b; }
```

And extend the reduced-motion block (inside the existing `@media (prefers-reduced-motion: reduce)` of `.sx-mag`) with:

```css
  .sx-book, .sx-leaf { transition: none; }
  .sx-leaf-shade, .sx-book-hint { animation: none; display: none; }
  .sx-face[data-show], .sx-face[data-leaving] { animation: sx-page-fade 0.15s ease; transform: none; }
  .sx-face[data-leaving] { display: none; }
```

and add after it, at top level:

```css
@keyframes sx-page-fade { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 4: Check the stylesheet still compiles**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/packages
```

Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(P1-FE-24): .sx-book — 3D leaves, page mode, controls; flip-on-scroll rules removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `MagBook` client component

**Files:**
- Create: `frontend/src/components/next-about-book.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

/* --------------------------------------------------------------------------
   The interactive magazine on /next/about (design spec
   docs/superpowers/specs/2026-09-30-next-about-flipbook-design.md).

   MagBook takes the eight server-rendered faces — cover, pages 02–07, back
   cover — and shows them as four leaves the reader turns. One piece of
   state, the current face `f`; everything else derives from it:
   - from lg ("spread" mode) `k = spreadOf(f)` leaves are turned; the left
     page is the back of leaf k-1, the right page the front of leaf k. The
     CSS (`.sx-book*`, globals.css) does the 3D turn off `data-turned` and
     the 25% shift that centres a closed or finished book off `data-k`.
   - below lg ("page" mode) one face shows at a time (`data-show`), the
     outgoing one hinges away (`data-leaving`) for the animation's length.
   Inputs: click a page (right → next, left → prev), the ◂ ▸ buttons, ← →
   while the book is on screen, a ≥ 40px horizontal swipe, the chips, and
   the hashes #magazine / #how / #students (on load, hashchange, and clicks
   of in-page links) which also scroll the book into view.
   Faces that are not visible are `inert` + aria-hidden so the tab order
   reaches only what can be seen. Without JS the <noscript> style in the
   stage lays the faces out flat; the controls never show.
   -------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { CHIPS, FACE_COUNT, HASH_FACE, LEAF_COUNT, faceLabel, nextFace, prevFace, spreadOf, type BookMode } from "@/lib/next-about";

const PAGE_ANIM_MS = 400;

function LeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}
function RightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function MagBook({ faces }: { faces: ReactNode[] }) {
  const section = useRef<HTMLElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(0);
  const [mode, setMode] = useState<BookMode>("spread");
  const [leaving, setLeaving] = useState<{ face: number; dir: 1 | -1 } | null>(null);
  const [turning, setTurning] = useState<number | null>(null);
  const inView = useRef(false);
  const fRef = useRef(0);
  fRef.current = f;
  const k = spreadOf(f);

  /* mode follows the lg breakpoint */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const apply = () => setMode(mq.matches ? "spread" : "page");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const go = useCallback(
    (target: number, opts: { scroll?: boolean } = {}) => {
      const next = Math.max(0, Math.min(FACE_COUNT - 1, target));
      const cur = fRef.current;
      if (opts.scroll) section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (next === cur) return;
      if (mode === "page") {
        setLeaving({ face: cur, dir: next > cur ? 1 : -1 });
        window.setTimeout(() => setLeaving(null), PAGE_ANIM_MS);
      } else {
        const kc = spreadOf(cur);
        const kn = spreadOf(next);
        setTurning(kn > kc ? kc : kn);
        window.setTimeout(() => setTurning(null), 700);
      }
      fRef.current = next;
      setF(next);
    },
    [mode],
  );

  /* hashes: on load, on change, and on clicks of in-page links */
  useEffect(() => {
    const fromHash = (hash: string, scroll: boolean) => {
      const target = HASH_FACE[hash];
      if (target != null) go(target, { scroll });
    };
    fromHash(window.location.hash, false);
    const onHash = () => fromHash(window.location.hash, true);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const hash = a.getAttribute("href") ?? "";
      if (HASH_FACE[hash] == null) return;
      e.preventDefault();
      history.replaceState(null, "", hash);
      fromHash(hash, true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [go]);

  /* arrow keys while the book is on screen */
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => (inView.current = entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    const onKey = (e: KeyboardEvent) => {
      if (!inView.current) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go(nextFace(f, mode));
      if (e.key === "ArrowLeft") go(prevFace(f, mode));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      io.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, [f, mode, go]);

  /* swipe */
  useEffect(() => {
    const el = book.current;
    if (!el) return;
    let x0: number | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      x0 = e.clientX;
    };
    const up = (e: PointerEvent) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      go(dx < 0 ? nextFace(f, mode) : prevFace(f, mode));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, [f, mode, go]);

  const onLeafClick = (leaf: number) => go(leaf >= k ? nextFace(f, mode) : prevFace(f, mode));

  /** Which faces can be seen right now. */
  const visible = (face: number) => {
    if (mode === "page") return face === f;
    const leaf = Math.floor(face / 2);
    const isBack = face % 2 === 1;
    return isBack ? leaf === k - 1 : leaf === k;
  };

  const pageVars =
    leaving == null
      ? undefined
      : ({
          "--sx-page-origin": leaving.dir > 0 ? "0 50%" : "100% 50%",
          "--sx-page-in-from": leaving.dir > 0 ? "70deg" : "-70deg",
          "--sx-page-out-to": leaving.dir > 0 ? "-70deg" : "70deg",
        } as CSSProperties);

  return (
    <section
      ref={section}
      id="magazine"
      role="region"
      aria-label="The magazine"
      data-reveal=""
      className="sx-book-wrap relative mx-auto w-full max-w-[1320px] scroll-mt-24 px-5 pt-16 sm:px-[6vw] lg:pt-24 2xl:px-0"
    >
      <span id="how" aria-hidden="true" className="absolute top-0 scroll-mt-24" />
      <span id="students" aria-hidden="true" className="absolute top-0 scroll-mt-24" />

      <div ref={book} className="sx-book" data-f={f} data-k={k} data-mode={mode} style={pageVars}>
        {Array.from({ length: LEAF_COUNT }, (_, leaf) => {
          const zIndex = leaf < k ? leaf : LEAF_COUNT - leaf;
          return (
            <div
              key={leaf}
              className="sx-leaf"
              data-i={leaf}
              data-turned={leaf < k ? "" : undefined}
              data-turning={turning === leaf ? "" : undefined}
              style={{ zIndex }}
              onClick={() => onLeafClick(leaf)}
            >
              {[2 * leaf, 2 * leaf + 1].map((face) => {
                const shown = visible(face);
                const isLeaving = leaving?.face === face;
                return (
                  <div
                    key={face}
                    className={`sx-face ${face % 2 === 0 ? "sx-face-front" : "sx-face-back"} ${face === 0 || face === FACE_COUNT - 1 ? "sx-face-dark" : ""}`}
                    data-face={face}
                    data-show={shown ? "" : undefined}
                    data-leaving={isLeaving ? "" : undefined}
                    inert={!shown}
                    aria-hidden={!shown}
                    role={face === 0 && shown ? "button" : undefined}
                    aria-label={face === 0 && shown ? "Open the magazine" : undefined}
                  >
                    {faces[face]}
                  </div>
                );
              })}
              <span aria-hidden="true" className="sx-leaf-shade" />
            </div>
          );
        })}
        <span aria-hidden="true" className="sx-book-shadow" />
      </div>

      <div className="sx-book-ctrl mt-6 flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <button type="button" className="sx-book-btn" aria-label="Previous page" disabled={f === 0} onClick={() => go(prevFace(f, mode))}>
            <LeftIcon />
          </button>
          <span aria-live="polite" className="min-w-[88px] text-center font-mag text-[20px] tracking-[0.08em] text-[#ffd12b]">
            {faceLabel(f, mode)}
          </span>
          <button type="button" className="sx-book-btn" aria-label="Next page" disabled={f === FACE_COUNT - 1} onClick={() => go(nextFace(f, mode))}>
            <RightIcon />
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => {
            const last = FACE_COUNT - 1;
            const current = c.face === 0 ? f === 0 : c.face === last ? f === last : f !== 0 && f !== last && spreadOf(c.face) === k;
            return (
              <button key={c.face} type="button" className="sx-book-chip text-on-media" aria-current={current ? "true" : undefined} onClick={() => go(c.face)}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head
```

Expected: nothing. If `inert` is rejected as a prop by the installed `@types/react`, change it to `inert={!shown ? true : undefined}`; React 19 types accept a boolean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/next-about-book.tsx
git commit -m "feat(P1-FE-24): MagBook — the interactive magazine (leaves, page mode, keys, swipe, hashes)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Stage — faces in, spreads out

**Files:**
- Modify: `frontend/src/components/next-about-stage.tsx`

- [ ] **Step 1: Imports**

Add `import { MagBook } from "./next-about-book";` next to the other component imports.

- [ ] **Step 2: `CoverPlate` gains the open hint**

Change the signature to `function CoverPlate({ priority = false, hint = false }: { priority?: boolean; hint?: boolean })` and, just before the closing `</div>` of the plate (after the `sx-scan` span), add:

```tsx
      {hint && (
        <span
          aria-hidden="true"
          className="sx-book-hint pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-[#ffd12b]/70 bg-[#04070e]/70 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-[#ffd12b]"
        >
          Open ▸
        </span>
      )}
```

- [ ] **Step 3: The hero cover opens the book**

In `MagCover`, replace
```tsx
            <CoverGlow>
              <CoverPlate priority />
            </CoverGlow>
```
with
```tsx
            <CoverGlow>
              <CoverPlate priority />
              {/* the whole cover opens the book; sits under the "Inside:" links */}
              <a href="#magazine" aria-label="Open the magazine" className="absolute inset-0 z-[1] rounded-[4px]" />
            </CoverGlow>
```
and on the cover's "Inside:" paragraph inside `CoverPlate` add `relative z-[2]` to its className so its three links stay clickable above the overlay.

- [ ] **Step 4: `MagPage` gets the book scale**

Replace the `MagPage` outer `div` className and the two size classes:

```tsx
    <div className={`relative px-6 py-6 sm:px-8 lg:px-8 lg:py-8 xl:px-10 xl:py-10 ${className}`} style={{ "--mag-drop": toneVar } as CSSProperties}>
```
h2: `className="mt-4 font-mag text-[clamp(36px,8vw,52px)] leading-[0.9] lg:text-[clamp(40px,4vw,64px)]"`
body wrapper: ``className={`${title ? "mt-4" : "mt-5"} font-mag-serif text-[14px] leading-[1.5] lg:text-[15px] lg:leading-[1.55] xl:text-[16px]`}``

Also in `FeatureSpread`'s job list (which moves in the next step) change the item text from `text-[15px]` to `text-[14px] xl:text-[15px]`, and in the under-18 note from `text-[15px]` to `text-[14px] xl:text-[15px]`.

- [ ] **Step 5: Replace the spreads with faces and the book**

Delete `MagSpread`, `RIGHT_PAGE`, `OpenerSpread`, `FeatureSpread`, `BenefitsSpread` (the whole "the spreads" section). In their place add:

```tsx
/* ------------------------------------------------------------- the book */

/** Face 7 — the back cover: navy, the closing line and both CTAs. */
function BackFace() {
  return (
    <div className={`flex h-full flex-col justify-end p-6 lg:p-8 xl:p-10 ${COVER_BG}`}>
      <Eyebrow>Back cover</Eyebrow>
      <p className="mt-3 font-mag text-[clamp(32px,7vw,44px)] leading-[0.9] lg:text-[clamp(36px,3.4vw,56px)]">
        Your byline starts <span className="text-[#ffd12b]">here.</span>
      </p>
      <p className="mt-3 font-mag-serif text-[14px] leading-[1.5] text-on-media/80 lg:text-[15px]">
        Students apply. Schools sign one agreement. The first edition is free.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Link href="/next/apply" className={CTA_YELLOW}>
          Apply to join your team
          <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href="/next/schools" className={CTA_OUTLINE}>
          Bring NEXT to your school
        </Link>
      </div>
    </div>
  );
}

/** The eight faces in reading order, handed to the client book. Pages
 *  02–07 are the same content the spreads carried. */
export function MagazineBook() {
  const faces: ReactNode[] = [
    <CoverPlate key="cover" hint />,
    <MagPage key="02" head="For students · ages 14–18" folio="02" title="Become" accent="the media.">
      <p className="sx-mag-dropcap">
        Join your school’s NEXT team as a writer, photographer, videographer, designer, editor or on the sales desk. No
        experience needed. Training is part of it.
      </p>
      <Link href="/next/apply" className={PAPER_CTA}>
        Apply to join
        <ArrowRightIcon className="size-4" />
      </Link>
    </MagPage>,
    <MagPage key="03" head="For schools & administrators" folio="03" title="Fully" accent="carried." tone="blue">
      <p className="sx-mag-dropcap">
        One programme agreement and one faculty advisor. SponsorX carries production, printing, sales operations, rights
        and cost. The first edition is digital and free.
      </p>
      <Link href="/next/schools" className={PAPER_CTA_OUTLINE}>
        Bring NEXT to your school
        <ArrowRightIcon className="size-4" />
      </Link>
    </MagPage>,
    <MagPage key="04" head="How it works" folio="04" title="Five jobs." accent="One magazine.">
      <blockquote className="border-b border-t-[3px] border-b-[#0b1a3a]/20 border-t-[#ffd12b] py-4 text-[18px] italic leading-[1.3] xl:text-[22px]">
        “Every athlete feature carries a QR code. Readers scan it to open that athlete’s SponsorX profile.”
      </blockquote>
    </MagPage>,
    <MagPage key="05" head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="05">
      <ol className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className={`border-t-2 border-[#0b1a3a] pt-2 ${s.n === "05" ? "sm:col-span-2" : ""}`}>
            <span aria-hidden="true" className="font-mag text-[28px] leading-none text-[#e0192b]">{s.n}</span>
            <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.1em]">{s.title}</p>
            <p className="mt-1 text-[14px] leading-[1.45] text-[#0b1a3a]/75 xl:text-[15px]">{s.text}</p>
          </li>
        ))}
      </ol>
    </MagPage>,
    <MagPage key="06" head="What you get out of it" folio="06" title="Work that" accent="follows you.">
      <div className="sx-mag-cols space-y-3 xl:space-y-0">
        {BENEFITS.map((b) => (
          <p key={b.title} className="xl:mb-3">
            <b className="font-semibold">{b.title}.</b>{" "}
            {"tag" in b && (
              <span className="mx-1 inline-block rounded-full border border-[#0b1a3a]/40 px-2 py-px align-middle font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-[#0b1a3a]/70">
                {b.tag}
              </span>
            )}
            {b.text}
          </p>
        ))}
      </div>
    </MagPage>,
    <MagPage key="07" head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="07">
      <aside className="border-[1.5px] border-[#0b1a3a] bg-[#f3f4f6] px-4 py-3 xl:px-5 xl:py-4">
        <h3 className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e0192b]">Under 18? Read this.</h3>
        <p className="mt-2 text-[14px] leading-[1.5] xl:text-[15px]">
          A parent or guardian consents before you join. No GPA, no school records on anything public. Ever. Your faculty
          advisor approves what gets published.
        </p>
      </aside>
      <figure className="mt-5 flex items-center gap-4">
        <span
          aria-hidden="true"
          className="size-12 shrink-0 border-2 border-[#0b1a3a] [background:repeating-conic-gradient(#0b1a3a_0_25%,#fff_0_50%)_0_0/8px_8px]"
        />
        <figcaption className="text-[13px] italic leading-[1.45] text-[#0b1a3a]/75 xl:text-[14px]">
          Every athlete feature carries one of these. Scan it and the athlete’s SponsorX profile opens.
        </figcaption>
      </figure>
    </MagPage>,
    <BackFace key="back" />,
  ];

  return (
    <>
      <noscript>
        <style>{`.sx-book{aspect-ratio:auto!important;transform:none!important;perspective:none}.sx-leaf{position:static!important;width:100%!important;transform:none!important}.sx-face{position:static!important;display:block!important;transform:none!important;margin-bottom:24px}.sx-book-ctrl,.sx-book-shadow,.sx-book-hint{display:none!important}`}</style>
      </noscript>
      <MagBook faces={faces} />
    </>
  );
}
```

Update the banner comment at the top of the file: replace the three `OpenerSpread` / `FeatureSpread` / `BenefitsSpread` bullets with one:

```
   - MagazineBook  (#magazine) the interactive magazine: eight faces — the
                   cover, pages 02–07 (MagPage), a back-cover face — handed
                   to the client MagBook (next-about-book.tsx), which turns
                   them as four 3D leaves from lg and one page at a time
                   below. The hero cover and its "Inside:" links open it.
```

and the "Entrance" paragraph: replace "each spread page-flips up as it scrolls into view (`.sx-mag-spread[data-reveal]`, globals.css)" with "the book and the blocks below rise in as they scroll into view (`[data-reveal]`)".

- [ ] **Step 6: Typecheck and lint**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head; npx eslint src/components/next-about-stage.tsx src/components/next-about-book.tsx
```

Expected: nothing from either. (`MagSpread` is no longer exported; nothing else imported it.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/next-about-stage.tsx
git commit -m "feat(P1-FE-24): magazine stage — eight faces and the book replace the scrolling spreads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Page layout

**Files:**
- Modify: `frontend/src/app/(public)/next/about/page.tsx`

- [ ] **Step 1: Swap the three spreads for the book**

Change the import to `import { BackCover, MagCover, MagazineBook, Newsstand } from "@/components/next-about-stage";` and the body to:

```tsx
    <StageReveal className="sx-stage sx-mag relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <MagCover />
      <InsideBand label="In this issue" items={BAND_ITEMS} />
      <MagazineBook />
      <Newsstand list={list} />
      <BackCover />
    </StageReveal>
```

Update the file's banner: after "content as paper spreads that page-flip in" add ", now one interactive magazine the reader opens and turns (flipbook spec 2026-09-30)".

- [ ] **Step 2: Verify against the live dev server**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head; npx eslint "src/app/(public)/next/about/page.tsx"; npx vitest run 2>&1 | grep -E "Test Files|Tests "; curl -s http://localhost:3000/next/about | grep -o 'sx-book"' | head -1; curl -s http://localhost:3000/next/about | grep -c 'sx-face '
```

Expected: no tsc/eslint output; `Test Files 63 passed`, `Tests 764 passed`; `sx-book"`; `8`.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(public)/next/about/page.tsx"
git commit -m "feat(P1-FE-24): /next/about — the magazine section is the interactive book

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Browser QA

**Files:**
- Scratch: `<scratchpad>/qa/qa-flipbook.mjs`, screenshots in `<scratchpad>/qa/shots2/`

- [ ] **Step 1: Write the script**

```js
// <scratchpad>/qa/qa-flipbook.mjs — run from the scratchpad qa folder
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("D:/iCARRe Solutions/sponsorX_dev/node_modules/playwright");

const base = "http://localhost:3000";
const out = "./shots2";
mkdirSync(out, { recursive: true });
const widths = [1920, 1440, 1280, 1024, 983, 768, 390, 360];
const browser = await chromium.launch();
let failures = 0;
const attr = (p, sel, a) => p.getAttribute(sel, a);

for (const theme of ["dark", "light"]) {
  for (const reduced of [false, true]) {
    if (reduced && theme === "light") continue;
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: w < 1024 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((t) => localStorage.setItem("sx-theme", t), theme);
      await page.goto(base + "/next/about", { waitUntil: "networkidle" });
      const loaded = await page.waitForFunction(() => document.documentElement.hasAttribute("data-sx-loaded"), null, { timeout: 15000 }).then(() => true).catch(() => false);
      // slow scroll so every reveal fires
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 300)); } });
      await page.waitForTimeout(1200);
      const unrevealed = await page.evaluate(() => document.querySelectorAll("[data-reveal]:not([data-in])").length);
      const overflow = await page.evaluate(() => { for (const el of document.querySelectorAll("[data-sx-stage], .overflow-x-clip, .overflow-hidden")) el.style.overflowX = "visible"; return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      await page.evaluate(() => document.getElementById("magazine").scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
      const mode = await attr(page, ".sx-book", "data-mode");
      const f0 = await attr(page, ".sx-book", "data-f");
      await page.click(".sx-face[data-face='0']");
      await page.waitForTimeout(1300);
      const f1 = await attr(page, ".sx-book", "data-f");
      await page.screenshot({ path: `${out}/book-${theme}${reduced ? "-reduced" : ""}-${w}-open.png` });
      await page.click(".sx-book-btn[aria-label='Next page']");
      await page.waitForTimeout(1300);
      const f2 = await attr(page, ".sx-book", "data-f");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1300);
      const f3 = await attr(page, ".sx-book", "data-f");
      await page.click(".sx-book-chip:has-text('How it works')");
      await page.waitForTimeout(1300);
      const fChip = await attr(page, ".sx-book", "data-f");
      // every visible face must fit (spread mode) and hidden ones must be inert
      const fit = await page.evaluate(() => {
        const out = [];
        for (const face of document.querySelectorAll(".sx-face")) {
          const shown = face.hasAttribute("data-show");
          const inert = face.hasAttribute("inert");
          const over = face.scrollHeight - face.clientHeight;
          out.push({ face: face.dataset.face, shown, inert, over });
        }
        return out;
      });
      const overflowingFaces = fit.filter((x) => x.shown && x.over > 0).map((x) => `${x.face}:${x.over}px`);
      const badInert = fit.filter((x) => x.shown === x.inert).map((x) => x.face);
      // walk to the end, screenshot each spread
      for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700); }
      await page.waitForTimeout(800);
      const fEnd = await attr(page, ".sx-book", "data-f");
      await page.screenshot({ path: `${out}/book-${theme}${reduced ? "-reduced" : ""}-${w}-end.png` });
      // hash from the hero cover
      await page.goto(base + "/next/about#how", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const fHash = await attr(page, ".sx-book", "data-f");
      const bad = !loaded || overflow > 0 || unrevealed > 0 || errors.length > 0 || f0 !== "0" || f1 !== "1" || Number(f2) <= 1 || Number(f3) <= Number(f2) || fChip !== "3" || fEnd !== "7" || fHash !== "3" || (mode === "spread" && overflowingFaces.length > 0) || badInert.length > 0;
      if (bad) failures++;
      console.log(`${bad ? "FAIL" : "ok  "} ${theme}${reduced ? "/reduced" : ""} ${w}px ${mode}`, { loaded, overflow, unrevealed, f: [f0, f1, f2, f3, fChip, fEnd, fHash], overflowingFaces, badInert, errors });
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

```bash
cd "$CLAUDE_SCRATCHPAD/qa" && node qa-flipbook.mjs
```

Expected: every row `ok`, exit 0. For an `overflowingFaces` entry in spread mode at 1024/1280, tighten that page's book scale in `MagPage` / the face content (smaller `lg:` type or padding) until it fits — do not let faces scroll in spread mode. For `f` mismatches, debug `MagBook` (`go`, the click on leaves, hash handling). Fix, re-run until clean, commit as `fix(P1-FE-24): flipbook QA — <what>` with the trailer.

- [ ] **Step 3: Look**

Read `shots2/book-dark-1440-open.png`, `book-dark-1024-open.png`, `book-dark-390-open.png`, `book-dark-1440-end.png`, `book-light-1440-open.png`. Check: the closed book was centred before opening (the `-open` shot shows 02–03 side by side with a spine shadow and page shadows); at 1024 no page content is cut; at 390 one page fills the width; the `-end` shot shows the back cover face alone on the left; light theme still dark. Fix what is wrong and re-run.

- [ ] **Step 4: Isolated build**

Per the memory note "build-in-detached-worktree": `git worktree add --detach D:/iCARRe Solutions/sponsorX_build <HEAD>`, junctions via PowerShell `New-Item -ItemType Junction` for `node_modules`, `frontend\node_modules`, `backend\node_modules`, patch the worktree's `frontend/next.config.ts` with `turbopack: { root: "D:/iCARRe Solutions" }`, then `npm run build 2>&1 | grep -E "Compiled|next/about|rror"`, `cd frontend && npx eslint . && npx vitest run | grep -E "Test Files|Tests "`. Expected: `✓ Compiled successfully`, `ƒ /next/about`, eslint silent, 764 tests. Teardown: `cmd /c rmdir` each junction, then `git worktree remove --force`.

---

### Task 7: Log, graph, hand-off

- [ ] **Step 1: Memory log** — append to `Memory/2026-09-30/tasks-completed.md`:

```markdown
## /next/about — the magazine is now an interactive flipbook — via Claude

Owner, after the magazine redesign: "in the magazine section, we can do an
interactive magazine … show the cover first, click, page opens, next page".
Companion choice: the book in place (not an overlay). Spec
`docs/superpowers/specs/2026-09-30-next-about-flipbook-design.md`, plan
`docs/superpowers/plans/2026-09-30-next-about-flipbook.md`.

- `next-about-book.tsx` (client, new) — MagBook: eight server-rendered
  faces as four 3D leaves; one state (current face); spread mode from lg
  (leaf turns on the spine, 1.05s, shade, 25% shift centring a closed or
  finished book), page mode below (one face, hinge in/out); click a page,
  ◂ ▸, ← → while on screen, swipe, five chips, hashes #magazine / #how /
  #students (load, hashchange, in-page link clicks → scroll + open);
  hidden faces inert + aria-hidden; aria-live counter; <noscript> flat
  layout.
- `next-about-stage.tsx` — the three scrolling spreads are gone; MagazineBook
  assembles the faces (CoverPlate with an "Open ▸" hint, pages 02–07
  unchanged in content, BackFace with both CTAs); the hero cover is a link
  to #magazine under its "Inside:" links; MagPage has a tighter book scale
  (15px body from lg, 16px from xl; two columns on page 06 from xl only).
- `globals.css` — `.sx-mag-sheet/spine/curl` and the flip-on-scroll rules
  removed; `.sx-book*` added (leaves, faces, shade, hint, page-mode
  keyframes, controls, reduced-motion swaps).
- `lib/next-about.ts` — spreadOf / nextFace / prevFace / faceLabel,
  HASH_FACE, CHIPS (+5 tests, 764 total).

Verified via Playwright against the live dev server at 1920 … 360, dark,
light, reduced motion: opens on cover click, advances on click / ▸ / → /
chip / #how, ends on the back cover, no visible face overflows in spread
mode, hidden faces inert, no console errors, no horizontal overflow. Build
(detached worktree), eslint, vitest pass. No tracker row.
```

- [ ] **Step 2:** `graphify update` (from the repo root; prints `Rebuilt: N nodes …`), then

```bash
git add Memory/2026-09-30/tasks-completed.md graphify-out
git commit -m "docs(P1-FE-24): log the /next/about flipbook; re-ingest graph

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 3: Report** to the owner: what changed, the QA result, anything left open.
