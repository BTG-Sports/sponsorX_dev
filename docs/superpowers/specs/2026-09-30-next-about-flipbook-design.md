# `/next/about` — the interactive magazine (flipbook) — design (2026-09-30)

Follow-up to `2026-09-30-next-about-magazine-design.md`. Owner: "in the magazine section, we
can do an interactive magazine … show the cover first then when click it will have a
magazine page open then next page and so on". Chosen in the companion: **A — the book in
place**: the three scrolling spreads are replaced by one closed book on the stage that the
reader opens and pages through there. (B, a full-screen reader overlay, was declined.)

## 1. What changes

| Block | Before | After |
|---|---|---|
| Hero | tilting cover, "Inside:" links to `#how` / `#students` / `#editions` | same; the whole cover is also a link to `#magazine` (opens the book) |
| Band | — | unchanged |
| Spreads 02–03, 04–05, 06–07 | three `MagSpread`s that flip in on scroll | **removed** |
| — | — | **The magazine** (`#magazine`): one book, eight faces, opened and turned by the reader |
| Newsstand, back-cover panel | — | unchanged |

Faces, in reading order (the DOM order too): **F0** cover (the same `CoverPlate` art plus an
"Open ▸" hint), **F1–F6** pages 02–07 exactly as today (`MagPage` content unchanged, moved),
**F7** a back-cover face (dark navy, "Your byline starts here.", the two CTAs). Leaves are
face pairs: L0 = [F0, F1], L1 = [F2, F3], L2 = [F4, F5], L3 = [F6, F7].

## 2. State and controls

One state, `f` — the current face index 0..7 — kept by the client component and mirrored on
the book as `data-f`. Two view modes, decided by the viewport (`lg`, 64rem):

- **Spread mode (≥ lg).** Leaves turned `k = ceil(f / 2)` (f=0 → 0, f=1|2 → 1, f=3|4 → 2,
  f=5|6 → 3, f=7 → 4). Visible: the back of L(k−1) on the left and the front of L(k) on the
  right. `k = 0` is the closed cover (book shifted left 25% so the cover is centred);
  `k = 4` is the back cover alone (shifted right 25%). Next → `f = 2k+1` (k<4);
  prev → `f = 2(k−1)−1`, or 0 when that is < 0. Counter: "Cover" / "02–03" / "04–05" /
  "06–07" / "Back cover".
- **Page mode (< lg).** One face at a time. Next → `f+1`, prev → `f−1`. Counter: "Cover" /
  "02" … "07" / "Back cover".

Inputs: click on the right page (next) or left page (prev); the ◂ ▸ buttons; ← → keys while
the book is in the viewport; a horizontal swipe of ≥ 40px (touch); the five chips — Cover
(f=0), Students · Schools (1), How it works (3), What you get (5), Back cover (7); and hashes —
`#magazine` → 1, `#how` → 3, `#students` → 5 (on load, on `hashchange`, and on clicks of
in-page links with those hashes, which also smooth-scroll the book into view). The hero
cover's "Inside:" links and its whole-cover link therefore open the book at the right place.

The closed cover shows a pulsing "Open ▸" pill (decorative; the cover face itself is the
click target, `role="button"` with "Open the magazine").

## 3. Motion

- **Spread mode.** A leaf turns by `rotateY(−180deg)` about the spine over 1.05s
  (`cubic-bezier(.35,0,.25,1)`), `transform-style: preserve-3d`, `backface-visibility: hidden`
  on both faces, `perspective: 2200px` on the book. A shade (`linear-gradient(90deg,
  rgba(0,0,0,.28), transparent 40%)`) fades in on the moving leaf for the turn. z-order:
  turned leaf i → `z = i`; unturned → `z = 4 − i`. The book's 25% shift eases over 0.8s.
- **Page mode.** The outgoing face hinges away (`rotateY(−70deg)`, 0.4s, origin left for
  next / right for prev) and the incoming one hinges in from the opposite side.
- **Reduced motion.** No turn: faces swap with a 150ms crossfade; no shade; no hint pulse.
- The section itself still rises in on scroll (`data-reveal`, the generic stage rule). The
  flip-on-scroll rules from the previous pass are deleted.

## 4. Size

- Spread mode: book `width: min(1180px, 100%)`, `aspect-ratio: 3/2`; each face 3:4.
  `MagPage` inside a face uses a **book scale**: padding 32px (40px from xl), h2
  `clamp(40px, 4vw, 64px)`, body 15px (16px from xl); the two text columns on page 06 apply
  from xl only. Faces are `overflow: hidden`; the QA pass measures every face for content
  overflow at 1024, 1280 and 1440 and the scale is tightened until none overflows.
- Page mode: book `width: min(100%, 520px)`, `aspect-ratio: 3/4`; padding 24px, body 14px.
  Faces are `overflow-y: auto` as a safety net only.

## 5. No-JS, SEO, accessibility

- The eight faces are server-rendered in reading order inside the book. A `<noscript>` style
  lays them out flat (position static, no transforms, controls hidden) so the page reads as
  stacked pages without JavaScript; with JavaScript the default CSS is the book, so there is
  no flash of flat pages before hydration.
- Faces not currently visible carry `inert` and `aria-hidden`, so the tab order reaches only
  the visible page(s). The counter is `aria-live="polite"`. Prev/next buttons have labels
  and are disabled at the ends. The section is `role="region"` `aria-label="The magazine"`.
- Anchors `#how` and `#students` are empty spans at the top of the section (`scroll-mt-24`),
  so native hash navigation still lands on the book.
- Cover face: the masthead `<Image>` keeps its alt; decorative layers `aria-hidden`.

## 6. Files

| File | Change |
|---|---|
| `frontend/src/lib/next-about.ts` (+ tests) | `FACES` labels, `HASH_FACE` map, `CHIPS`, `spreadOf`, `nextFace`, `prevFace`, `faceLabel` |
| `frontend/src/components/next-about-book.tsx` | **new** client component `MagBook` — state, modes, controls, keys, swipe, hashes, inert |
| `frontend/src/components/next-about-stage.tsx` | `CoverPlate` gains `hint`; hero cover gets the `#magazine` link overlay; `MagSpread`, `RIGHT_PAGE`, the three spread components go; `BackFace` and `MagazineBook` (assembles the eight faces and renders `MagBook`) come in; `MagPage` gets a `book` scale |
| `frontend/src/app/globals.css` | delete `.sx-mag-sheet/spine/curl` and the `.sx-mag-spread` flip rules; add `.sx-book*` |
| `frontend/src/app/(public)/next/about/page.tsx` | three spread lines → `<MagazineBook />` |

## 7. Verification

The previous Playwright matrix (1920, 1440, 1024, 983, 768, 390, 360; dark, light, reduced
motion) with: no console errors, no horizontal overflow, the book closed on load, opens on
cover click, `data-f` advancing on click / ▸ / ArrowRight / swipe, chips and `#how` landing on
the right face, hidden faces `inert`, and **no face with `scrollHeight > clientHeight` in
spread mode**. Build, eslint and vitest as before. Memory log entry; no tracker row.

## 8. Out of scope

Page-curl (bent-page) rendering; sound; deep links per page beyond the three hashes;
persisting the open page; the overlay reader.
