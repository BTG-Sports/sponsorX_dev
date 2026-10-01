# `/next/about` Magazine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the public SponsorX NEXT landing (`/next/about`) as a magazine — a tilting cover with the BTG Sports Talk Magazine logo as masthead, then the content as paper spreads that page-flip in — on the landing page's dark HUD ground.

**Architecture:** The page stays a server component with its existing live editions fetch. It is wrapped in the existing `StageReveal` island (as `/packages` and `/join` are) and composed from a new server file `next-about-stage.tsx` (cover, spreads, newsstand, back cover), one new client island `next-about-fx.tsx` (the cover's pointer glow), a small pure-logic module `lib/next-about.ts` (tested), and one `.sx-mag` CSS block in `globals.css`. Two Google fonts are added through `next/font` and exposed as `font-mag` / `font-mag-serif` utilities.

**Tech Stack:** Next 16 (App Router, `next/font/google`, `next/image` unoptimized), React 19, Tailwind 4 (`@theme`), vitest, Playwright (already in `node_modules/.bin`), `sharp` (hoisted in the root `node_modules`).

**Spec:** `docs/superpowers/specs/2026-09-30-next-about-magazine-design.md`. Read it first; this plan implements it section by section.

**Repo rules that apply** (from `CLAUDE.md` and memory):
- Never run `next build` while `next dev` is running on the same tree; stop dev first.
- Verify with `npm run build`, not `npx tsc --noEmit` alone.
- Commit messages carry the task id `P1-FE-24` and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Append a log entry to `Memory/2026-09-30/tasks-completed.md` (capital-M folder) at the end. No tracker row: this is a design pass on a shipped screen.
- All commands below run from the repo root `D:\iCARRe Solutions\sponsorX_dev` unless stated.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/app/layout.tsx` | modify | load Bebas Neue + Source Serif 4, expose their CSS variables on `<html>` |
| `frontend/src/app/globals.css` | modify | `@theme` font tokens; the `.sx-mag` block (paper, folio, drop cap, columns, page-flip, cover glow, mini covers, reduced motion) |
| `frontend/public/next/btg-sports-talk-magazine.png` | replace | the logo, re-exported at 800×800 and palette-compressed |
| `frontend/src/lib/next-about.ts` | create | constants (issue, logo, copy) and pure helpers: `usesLogo`, `editionHref`, `splitNumeral` |
| `frontend/tests/next-about.test.ts` | create | vitest for the helpers |
| `frontend/src/components/next-about-fx.tsx` | create | `CoverGlow` client island |
| `frontend/src/components/next-about-stage.tsx` | create | `MagCover`, `MagSpread`, `MagPage`, `OpenerSpread`, `FeatureSpread`, `BenefitsSpread`, `Newsstand`, `BackCover` |
| `frontend/src/components/packages-stage.tsx` | modify | `BandItems` renders a leading `NN ` numeral in yellow display type |
| `frontend/src/app/(public)/next/about/page.tsx` | rewrite | fetch + layout only |
| `Memory/2026-09-30/tasks-completed.md` | append | the day's log entry |

---

### Task 1: Fonts — Bebas Neue and Source Serif 4 through `next/font`

**Files:**
- Modify: `frontend/src/app/layout.tsx:1-14` and `:64`
- Modify: `frontend/src/app/globals.css:169` (inside the `@theme` block, next to `--font-sans`)

- [ ] **Step 1: Load the two faces in the root layout**

In `frontend/src/app/layout.tsx` replace the import and the `poppins` constant (lines 2 and 8–13) with:

```tsx
import { Bebas_Neue, Poppins, Source_Serif_4 } from "next/font/google";

// next/font self-hosts at build time, so this carries no host coupling.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/* The two magazine faces for /next/about (design spec 2026-09-30 §2):
   Bebas Neue for cover lines and spread headlines, Source Serif 4 for body
   text on paper. Exposed as `font-mag` / `font-mag-serif` (globals.css
   @theme); nothing outside `.sx-mag` uses them. */
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});
```

- [ ] **Step 2: Put the variables on `<html>`**

Line 64 currently reads:

```tsx
        className={`${poppins.variable} h-full antialiased`}
```

Change it to:

```tsx
        className={`${poppins.variable} ${bebas.variable} ${sourceSerif.variable} h-full antialiased`}
```

- [ ] **Step 3: Register the Tailwind font tokens**

In `frontend/src/app/globals.css`, inside the `@theme` block, directly after the line `  --font-sans: var(--font-poppins);` add:

```css
  /* /next/about magazine faces — `font-mag`, `font-mag-serif` (spec §2) */
  --font-mag: var(--font-bebas), Impact, "Arial Narrow", sans-serif;
  --font-mag-serif: var(--font-source-serif), Georgia, "Times New Roman", serif;
```

- [ ] **Step 4: Verify the utilities compile**

Run:

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head -20
```

Expected: no lines other than the known phantom `LayoutProps` errors (which the grep removes), so **no output**.

Then confirm `next/font` accepts the two faces by starting dev briefly:

```bash
cd frontend && timeout 60 npx next dev -p 3011 2>&1 | head -20
```

Expected: `✓ Ready in …` with no `Unknown font` error. (Ctrl-C / the timeout stops it. Do not leave a dev server running on the tree while later tasks build.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/globals.css
git commit -m "feat(P1-FE-24): magazine faces — Bebas Neue + Source Serif 4 via next/font

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Compress the logo

**Files:**
- Replace: `frontend/public/next/btg-sports-talk-magazine.png` (1254×1254 RGB, 1.1 MB)
- Scratch script: `<scratchpad>/compress-logo.mjs`

- [ ] **Step 1: Write the one-off script in the session scratchpad**

```js
// <scratchpad>/compress-logo.mjs — run from the repo root
import { createRequire } from "node:module";
import { statSync, renameSync } from "node:fs";
const require = createRequire(import.meta.url);
const sharp = require("D:/iCARRe Solutions/sponsorX_dev/node_modules/sharp");

const src = "D:/iCARRe Solutions/sponsorX_dev/frontend/public/next/btg-sports-talk-magazine.png";
const tmp = src + ".tmp.png";

await sharp(src)
  .resize(800, 800, { fit: "inside" })
  .png({ palette: true, quality: 80, effort: 10, compressionLevel: 9 })
  .toFile(tmp);

const before = statSync(src).size;
const after = statSync(tmp).size;
renameSync(tmp, src);
console.log({ before, after, ok: after <= 180 * 1024 });
```

- [ ] **Step 2: Run it**

```bash
node "$CLAUDE_SCRATCHPAD/compress-logo.mjs"
```

(Substitute the scratchpad path printed in the session environment.) Expected: `{ before: 1117373, after: <≤184320>, ok: true }`. If `sharp` fails to load (`Cannot find module`), stop, leave the original in place, and note "logo not compressed — sharp unavailable" for the memory log in Task 11.

- [ ] **Step 3: Check the header of the new file**

```bash
node -e "const b=require('fs').readFileSync('frontend/public/next/btg-sports-talk-magazine.png');console.log(b.readUInt32BE(16),'x',b.readUInt32BE(20),'colortype',b[25])"
```

Expected: `800 x 800 colortype 3` (palette) — or `colortype 2/6` if sharp chose not to palettise; either is fine as long as Step 2 printed `ok: true`.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/next/btg-sports-talk-magazine.png
git commit -m "chore(P1-FE-24): logo re-exported at 800px, palette-compressed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `lib/next-about.ts` — constants and helpers (TDD)

**Files:**
- Create: `frontend/src/lib/next-about.ts`
- Test: `frontend/tests/next-about.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/next-about.test.ts
import { describe, expect, it } from "vitest";

import { BAND_ITEMS, editionHref, splitNumeral, usesLogo } from "../src/lib/next-about";

/* --------------------------------------------------------------------------
   /next/about magazine page (design spec 2026-09-30) — the pure bits:
   which editions wear the BTG Sports Talk Magazine logo, where an edition
   card links, and how the band splits "01 Write" into numeral + text.
   -------------------------------------------------------------------------- */

describe("usesLogo — only a Sports Talk publication wears the BTG logo", () => {
  it("matches the client's title in any spacing or case", () => {
    expect(usesLogo("BTG Sports Talk Magazine")).toBe(true);
    expect(usesLogo("sports talk")).toBe(true);
    expect(usesLogo("SportsTalk Weekly")).toBe(true);
  });
  it("leaves any other school's title to a typographic masthead", () => {
    expect(usesLogo("Northside Sideline")).toBe(false);
    expect(usesLogo("")).toBe(false);
  });
});

describe("editionHref — the reader route the old page linked to", () => {
  it("uses the school slug when there is one", () => {
    expect(editionHref({ id: "ed_1", school: { slug: "northside-high" } })).toBe("/next/northside-high/ed_1");
  });
  it("falls back to the regional bucket and URL-encodes both parts", () => {
    expect(editionHref({ id: "ed 2/x", school: null })).toBe("/next/regional/ed%202%2Fx");
  });
});

describe("splitNumeral — a leading two-digit token becomes the yellow numeral", () => {
  it("splits '01 Write'", () => {
    expect(splitNumeral("01 Write")).toEqual({ numeral: "01", text: "Write" });
  });
  it("leaves items without a numeral alone", () => {
    expect(splitNumeral("Your byline")).toEqual({ numeral: null, text: "Your byline" });
    expect(splitNumeral("2026 season")).toEqual({ numeral: null, text: "2026 season" });
  });
  it("the band list starts with the five numbered jobs", () => {
    expect(BAND_ITEMS.slice(0, 5).map((s) => splitNumeral(s).numeral)).toEqual(["01", "02", "03", "04", "05"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npx vitest run tests/next-about.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/lib/next-about"`.

- [ ] **Step 3: Write the module**

```ts
// frontend/src/lib/next-about.ts

/* --------------------------------------------------------------------------
   /next/about — the SponsorX NEXT programme landing as a magazine
   (design spec docs/superpowers/specs/2026-09-30-next-about-magazine-design.md).

   Everything here is pure: the issue constants, the copy that used to live
   in page.tsx, and three helpers the stage components call. The stage
   itself is components/next-about-stage.tsx.
   -------------------------------------------------------------------------- */

/** Issue number and season on the cover. Constants until an edition actually
 *  publishes (`P9-DATA-01`); then they come from the editions list. */
export const ISSUE = { number: "01", season: "Fall 2026" } as const;

/** The client's magazine logo — RGB on black, so it is always drawn with
 *  `mix-blend-mode: screen` over a dark cover. */
export const LOGO = "/next/btg-sports-talk-magazine.png";
export const LOGO_ALT = "BTG Sports Talk Magazine";

/** One edition as GET /public/next/editions returns it. */
export type EditionCard = {
  id: string;
  label: string;
  publication: string;
  school: { slug: string; name: string; city: string | null; stateCode: string | null } | null;
};

/** Only the client's own title wears the BTG logo on a mini cover; any
 *  other publication gets its name set in the display face instead. */
export function usesLogo(publication: string): boolean {
  return /sports\s*talk/i.test(publication);
}

/** The reader route — unchanged from the pre-redesign page. */
export function editionHref(e: { id: string; school: { slug: string } | null }): string {
  return `/next/${encodeURIComponent(e.school?.slug ?? "regional")}/${encodeURIComponent(e.id)}`;
}

/** "01 Write" → numeral "01", text "Write". Anything else is text only. */
export function splitNumeral(item: string): { numeral: string | null; text: string } {
  const m = /^(\d{2})\s+(.+)$/.exec(item);
  return m ? { numeral: m[1], text: m[2] } : { numeral: null, text: item };
}

/* ------------------------------------------------------------------- copy */

export const STEPS = [
  { n: "01", title: "Write", text: "Game recaps, athlete features, columns. Your byline on every piece." },
  { n: "02", title: "Shoot", text: "Photos and short video from the sideline, with rights handled properly." },
  { n: "03", title: "Design", text: "Lay out pages in SponsorX templates built for print and phone." },
  { n: "04", title: "Sell", text: "Pitch local businesses and sell the ads. Every sale is credited to you." },
  { n: "05", title: "Publish", text: "Your advisor signs off. We publish digital, and print when your school wants it." },
] as const;

export const BENEFITS = [
  {
    title: "Portfolio credit",
    text: "Every byline, photo credit and page you design lands in a portfolio with your name on it. Use it for college, internships, anything.",
  },
  {
    title: "Sales credit that stays yours",
    text: "Sell an ad and the sale is credited to you on the record. It stays yours after you graduate.",
  },
  {
    title: "Recognition points",
    tag: "Not cash",
    text: "Points recognise what you contribute to the team. They aren’t money, can’t be cashed out, and are never pay.",
  },
] as const;

/** The marquee band under the cover. Leading "NN " renders as a yellow numeral. */
export const BAND_ITEMS = [
  "01 Write",
  "02 Shoot",
  "03 Design",
  "04 Sell",
  "05 Publish",
  "Your byline",
  "Portfolio credit",
  "Sales credit that stays yours",
  "QR on every feature",
];
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd frontend && npx vitest run tests/next-about.test.ts
```

Expected: `Tests  7 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/next-about.ts frontend/tests/next-about.test.ts
git commit -m "feat(P1-FE-24): next-about constants + helpers (logo rule, edition href, band numerals)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The `.sx-mag` CSS block

**Files:**
- Modify: `frontend/src/app/globals.css` — append at the end of the file (after the `/packages` stage block that ends around line 1912).

- [ ] **Step 1: Append the block**

```css
/* --------------------------------------------------------------------------
   /next/about magazine stage (next-about-stage.tsx, next-about-fx.tsx;
   design spec 2026-09-30). Sits inside `.sx-stage` (the landing's dark
   ground) and adds the paper. Every ink here is a fixed literal on purpose:
   the page is fixed-dark in both themes, like /packages and /join, and the
   paper's palette is the BTG Sports Talk Magazine logo's, not the theme's.
   - `.sx-mag-sheet`: one spread of paper; `::before` is the shade that
     fades as it flips in. `.sx-mag-spine` / `.sx-mag-curl` are the centre
     fold and the turned corner.
   - `.sx-mag-dropcap`: the first letter of a page's first paragraph, in the
     display face and the page's tone (`--mag-drop`).
   - `.sx-mag-cols`: two text columns from lg.
   - `.sx-mag-spread`: the page-flip entrance. The spread carries
     `data-reveal` so StageReveal marks it `data-in`; the stage's generic
     rise is cancelled on the spread and the sheet hinges up from its
     bottom edge instead.
   - `.sx-mag-cover-glow`: the cover's pointer glow (`--gx/--gy/--glow`
     from CoverGlow); `[data-pulse]` plays it once on touch.
   - `.sx-mag-shelf`: the lit shelf line under the newsstand covers.
   Reduced motion: no flip, no shade, no glow pulse, no hover lift.
   -------------------------------------------------------------------------- */
.sx-mag {
  --mag-paper: #fbfbf9;
  --mag-ink: #0b1a3a;
  --mag-red: #e0192b;
  --mag-yellow: #ffd12b;
  --mag-blue: #2e9bf5;
}

.sx-mag-sheet {
  position: relative;
  background: var(--mag-paper);
  color: var(--mag-ink);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
}
.sx-mag-sheet::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.45), transparent 60%);
  opacity: 0;
  transition: opacity 1.1s var(--sx-ease);
}
.sx-mag-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 36px;
  margin-left: -18px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.22) 50%, transparent);
}
.sx-mag-curl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 64px;
  height: 64px;
  pointer-events: none;
  background: linear-gradient(225deg, var(--sx-stage-bg, #04070e) 50%, #e6e6e2 50%);
  box-shadow: -6px -6px 14px rgba(0, 0, 0, 0.22);
}

.sx-mag-dropcap::first-letter {
  float: left;
  font-family: var(--font-mag), Impact, sans-serif;
  font-size: 3.4em;
  line-height: 0.8;
  padding: 0.08em 0.12em 0 0;
  color: var(--mag-drop, var(--mag-red));
}

@media (min-width: 64rem) {
  .sx-mag-cols {
    columns: 2;
    column-gap: 32px;
  }
  .sx-mag-cols > * {
    break-inside: avoid;
  }
}

/* page-flip entrance */
[data-sx-stage][data-armed] .sx-mag-spread[data-reveal] {
  opacity: 1;
  transform: none;
  transition: none;
  perspective: 1400px;
}
[data-sx-stage][data-armed] .sx-mag-spread > .sx-mag-sheet {
  transform-origin: 50% 100%;
  transform: rotateX(62deg) translateY(40px);
  opacity: 0;
  transition: transform 1.1s var(--sx-ease), opacity 0.6s var(--sx-ease);
  transition-delay: calc(var(--i, 0) * 110ms);
}
[data-sx-stage][data-armed] .sx-mag-spread > .sx-mag-sheet::before { opacity: 1; }
[data-sx-stage][data-armed] .sx-mag-spread[data-in] > .sx-mag-sheet {
  transform: none;
  opacity: 1;
}
[data-sx-stage][data-armed] .sx-mag-spread[data-in] > .sx-mag-sheet::before { opacity: 0; }

/* cover glow */
.sx-mag-cover-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: var(--glow, 0);
  transition: opacity 0.5s ease;
  background: radial-gradient(
    240px circle at var(--gx, 50%) var(--gy, 28%),
    rgba(127, 208, 255, 0.38),
    rgba(46, 155, 245, 0.14) 40%,
    transparent 70%
  );
}
[data-pulse] .sx-mag-cover-glow { animation: sx-mag-pulse 2.2s ease 1.2s 1; }
@keyframes sx-mag-pulse {
  0% { opacity: 0; }
  40% { opacity: 1; }
  100% { opacity: 0; }
}

/* newsstand */
.sx-mag-shelf {
  height: 1px;
  background: rgba(191, 224, 255, 0.7);
  box-shadow: 0 0 10px rgba(120, 190, 255, 0.9), 0 0 22px rgba(46, 155, 245, 0.55);
}
.sx-mag-mini > span:first-child {
  transition: transform 0.35s var(--sx-ease), box-shadow 0.35s var(--sx-ease);
}

@media (prefers-reduced-motion: reduce) {
  .sx-mag-sheet::before { display: none; }
  [data-sx-stage][data-armed] .sx-mag-spread > .sx-mag-sheet {
    transform: none;
    opacity: 1;
    transition: none;
  }
  [data-pulse] .sx-mag-cover-glow { animation: none; }
  .sx-mag-mini > span:first-child { transition: none; }
}
```

- [ ] **Step 2: Check the stylesheet still compiles**

Tailwind compiles `globals.css` on the first request, so a dev server answering 200 proves the block parses:

```bash
cd frontend && (timeout 90 npx next dev -p 3011 >/dev/null 2>&1 &) ; sleep 30; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/next/about
```

Expected: `200`. A CSS syntax error would print `500` and the dev log would name the line. The `timeout` ends the server; make sure nothing is still listening on 3011 before Task 10 (`netstat -ano | findstr :3011` should print nothing).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(P1-FE-24): .sx-mag — paper, page-flip reveal, cover glow, newsstand rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `CoverGlow` client island

**Files:**
- Create: `frontend/src/components/next-about-fx.tsx`

- [ ] **Step 1: Write the island**

```tsx
"use client";

/* --------------------------------------------------------------------------
   /next/about effects — the one client island the otherwise server-rendered
   magazine stage (next-about-stage.tsx) needs. It changes no layout.

   - CoverGlow  wraps the cover plate and writes the pointer's position into
                it as `--gx` / `--gy` (percent) plus `--glow` 0|1, one write a
                frame, fine pointer only; globals.css (`.sx-mag-cover-glow`)
                draws the radial glow. On touch the glow is fixed at the
                masthead and `data-pulse` plays it once with the entrance.
                Reduced motion: nothing is written, nothing pulses. The tilt
                itself is the landing's TiltSpot, wrapped outside this.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, type ReactNode } from "react";

export function CoverGlow({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      el.dataset.pulse = "";
      return;
    }
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${(((px - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(((py - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      el.style.setProperty("--glow", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => el.style.setProperty("--glow", "0");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
      <span aria-hidden="true" className="sx-mag-cover-glow" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/next-about-fx.tsx
git commit -m "feat(P1-FE-24): CoverGlow island — pointer glow on the magazine cover

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `next-about-stage.tsx` — cover, spread and page primitives

**Files:**
- Create: `frontend/src/components/next-about-stage.tsx` (this task writes the top half; Task 7 appends the rest to the same file)

- [ ] **Step 1: Write the file**

```tsx
/* --------------------------------------------------------------------------
   /next/about stage — the SponsorX NEXT programme landing as a magazine
   (design spec docs/superpowers/specs/2026-09-30-next-about-magazine-design.md).
   Server components; the one client island is next-about-fx.tsx, and the
   reveal/arming island is /packages' StageReveal.

   The page is a fixed-dark `.sx-stage` in both themes (the landing's HUD
   ground) with white paper laid on it. Every ink is `on-media` or a fixed
   literal: on paper the palette is the BTG Sports Talk Magazine logo's —
   navy ink, red numerals, yellow rules — never a themed token.

   Top to bottom (page.tsx lays them out):
   - MagCover      the hero: HUD eyebrow, the three-line display headline,
                   serif dek, two CTAs, a glass stat strip, and the COVER —
                   the logo as masthead, corner tags, cover lines, an
                   "Inside:" line linking the sections — tilting with the
                   pointer (TiltSpot) under a scan line and a glow (CoverGlow).
   - InsideBand    /packages' marquee band, "In this issue" (reused).
   - OpenerSpread  paper spread 1: For students | For schools, each a page.
   - FeatureSpread spread 2 (#how): Five jobs — the QR pull quote | the list.
   - BenefitsSpread spread 3 (#students): what you get | under-18 note + QR.
   - Newsstand     (#editions) live editions as mini covers on a glass rack.
   - BackCover     the closing glass panel with both CTAs.

   Entrance: hero pieces rise in (`sx-stage-in` / `sx-stage-line`) once
   `html[data-sx-loaded]` is set; each spread page-flips up as it scrolls
   into view (`.sx-mag-spread[data-reveal]`, globals.css). Reduced motion:
   pieces simply appear.
   -------------------------------------------------------------------------- */

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { CoverGlow } from "./next-about-fx";
import { Eyebrow, chamfer } from "./packages-stage";
import { BENEFITS, ISSUE, LOGO, LOGO_ALT, STEPS, editionHref, usesLogo, type EditionCard } from "@/lib/next-about";

/* ---------------------------------------------------------------- shared */

const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const STRIP = chamfer(12);
const STRIP_RING = STRIP.ring(1);

/** Staggered entrance delay for a hero piece. */
const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
/** Stagger slot for a scroll-revealed piece. */
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

const COVER_BG = "bg-[linear-gradient(180deg,#000_0%,#061027_45%,#0d1a3a_100%)]";

/** The yellow primary CTA on the stage. Dark ink on yellow (14:1); white on
 *  yellow would fail P1-QA-02, the /join lesson. */
const CTA_YELLOW =
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-[#ffd12b] px-5 text-[14px] font-semibold text-[#0b0b14] shadow-[0_0_30px_rgba(255,209,43,.35)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(255,209,43,.55)] sm:h-[52px] sm:px-9 sm:text-[15px]";
const CTA_OUTLINE =
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-white/45 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-white hover:bg-white/10 sm:h-[52px] sm:px-9 sm:text-[15px]";

/** CTAs on paper: navy plate with yellow text, and a navy outline. */
const PAPER_CTA =
  "mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-[#0b1a3a] px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#ffd12b] transition-transform hover:-translate-y-0.5";
const PAPER_CTA_OUTLINE =
  "mt-6 inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-[#0b1a3a] px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0b1a3a] transition-colors hover:bg-[#0b1a3a]/5";

/** The two CTAs. `delay` makes them a hero entrance piece; `className`
 *  sets the row/column behaviour above `sm` (the hero: a row from sm; the
 *  back cover: a row from sm, a column again from lg beside the copy). */
function CTAs({ delay, className = "sm:flex-row sm:items-center sm:gap-5" }: { delay?: number; className?: string }) {
  return (
    <div
      className={`${delay == null ? "" : "sx-stage-in "}flex flex-col items-stretch gap-3 ${className}`}
      style={delay == null ? undefined : reveal(delay)}
    >
      <Magnetic className="max-sm:w-full">
        <Link href="/next/apply" className={CTA_YELLOW}>
          Apply to join your team
          <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Magnetic>
      <Magnetic className="max-sm:w-full">
        <Link href="/next/schools" className={CTA_OUTLINE}>
          Bring NEXT to your school
        </Link>
      </Magnetic>
    </div>
  );
}

/* ------------------------------------------------------------------ cover */

/** The cover plate: the logo as masthead (screen-blended so its black
 *  ground vanishes into the navy), corner tags, cover lines, the "Inside:"
 *  contents line, a barcode and the HUD scan. Decorative layers aria-hidden;
 *  the masthead has the magazine's name as alt, the lines are real text. */
function CoverPlate({ priority = false }: { priority?: boolean }) {
  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-[4px] ${COVER_BG} shadow-[0_40px_70px_rgba(0,0,0,.65),0_0_0_1px_rgba(255,255,255,.1)]`}>
      <Image src={LOGO} alt={LOGO_ALT} width={800} height={800} unoptimized priority={priority} className="-mt-[2%] w-full mix-blend-screen" />
      <span aria-hidden="true" className="absolute left-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Issue {ISSUE.number}
      </span>
      <span aria-hidden="true" className="absolute right-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Free digital
      </span>
      <div className="absolute inset-x-4 bottom-4 pr-14">
        <p className="font-mag text-[clamp(26px,3vw,40px)] leading-[0.9] text-white">
          Five jobs.
          <br />
          <span className="text-[#ffd12b]">One magazine.</span>
        </p>
        <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-on-media/80">
          Inside:{" "}
          <a href="#how" className="underline-offset-2 hover:underline">how it works</a> ·{" "}
          <a href="#students" className="underline-offset-2 hover:underline">what you get</a> ·{" "}
          <a href="#editions" className="underline-offset-2 hover:underline">latest editions</a>
        </p>
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-4 right-4 h-5 w-12 opacity-80 [background:repeating-linear-gradient(90deg,#fff_0_1px,transparent_1px_3px,#fff_3px_4px,transparent_4px_6px)]"
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" />
    </div>
  );
}

const STATS = [
  ["05", "Jobs"],
  ["14–18", "Ages"],
  ["$0", "First edition"],
  ["QR", "On every feature"],
] as const;

/** Four figures from the page's own copy — no fetch. */
function StatStrip() {
  return (
    <div className="sx-stage-in relative mt-8 max-w-[560px]" style={reveal(0.55)}>
      <Glass
        plate={STRIP.plate}
        ringClip={STRIP_RING}
        fill="bg-gradient-to-b from-[#0d1f3d]/60 to-[#04091a]/80"
        outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#7fd0ff]/25"
      />
      <dl className="relative grid grid-cols-2 gap-y-4 px-5 py-4 sm:grid-cols-4 sm:gap-y-0 sm:px-6">
        {STATS.map(([value, label], i) => (
          <div key={label} className={`flex flex-col-reverse ${i > 0 ? "sm:border-l sm:border-[#a9d3ff]/15 sm:pl-5" : ""}`}>
            <dt className="mt-1 text-[9px] uppercase tracking-[0.16em] text-on-media/70">{label}</dt>
            <dd className={`font-mag text-[26px] leading-none ${i === 2 ? "text-[#ffd12b]" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MagCover() {
  return (
    <section className="relative isolate flex min-h-[min(100svh,980px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: the landing's glows, the receding floor, the horizon, the outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_18%_12%,rgba(46,155,245,.22),transparent_62%),radial-gradient(55%_45%_at_88%_78%,rgba(249,122,31,.16),transparent_60%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.12em] left-1/2 -translate-x-1/2 whitespace-nowrap font-mag text-[clamp(120px,26vw,420px)] uppercase leading-none">
          Next
        </p>
        <div className="absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:block" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-8 px-5 py-8 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,30vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <Eyebrow>
              <ScrambleText text={`SponsorX NEXT · Issue ${ISSUE.number} · ${ISSUE.season}`} delay={0.1} />
            </Eyebrow>
          </div>

          <h1 className="mt-5 font-mag text-[clamp(48px,11vw,72px)] leading-[0.88] tracking-[0.01em] [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(72px,7vw,112px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Your school’s</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>sports story.</span>
            <span className="sx-stage-line block text-[#ffd12b]" style={reveal(0.36)}>Told by you.</span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[520px] font-mag-serif text-[16px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[18px]"
            style={reveal(0.3)}
          >
            NEXT is a sports magazine for your high school, made by students. You write it, shoot it, design it, and sell
            the ads that pay for it. SponsorX brings the platform, templates, training and publishing.
          </p>

          <div className="mt-8">
            <CTAs delay={0.42} />
          </div>

          <StatStrip />
        </div>

        {/* the cover: above the copy below lg, right of it from lg */}
        <div className="sx-stage-in order-first mx-auto w-full max-w-[220px] sm:max-w-[320px] lg:order-last lg:max-w-none" style={reveal(0.5)}>
          <TiltSpot max={8}>
            <CoverGlow>
              <CoverPlate priority />
            </CoverGlow>
          </TiltSpot>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- spread */

/** One sheet of paper holding two pages. Carries `data-reveal` so
 *  StageReveal marks it; the `.sx-mag-spread` rules flip the sheet in. */
export function MagSpread({ id, index, children, className = "" }: { id?: string; index: number; children: ReactNode; className?: string }) {
  return (
    <section
      id={id}
      data-reveal=""
      style={slot(index)}
      className={`sx-mag-spread relative mx-auto w-full max-w-[1180px] scroll-mt-24 px-5 sm:px-[6vw] ${className}`}
    >
      <div className="sx-mag-sheet grid grid-cols-1 lg:grid-cols-2">
        {children}
        <span aria-hidden="true" className="sx-mag-spine hidden lg:block" />
        <span aria-hidden="true" className="sx-mag-curl" />
      </div>
    </section>
  );
}

/** One page: folio row (running head, page number), optional display
 *  headline with its accent line in the page's tone, a rule, then the body
 *  in the serif. `tone` also colours the drop cap (`--mag-drop`). */
export function MagPage({
  head,
  folio,
  title,
  accent,
  tone = "red",
  children,
  className = "",
}: {
  head: string;
  folio: string;
  title?: string;
  accent?: string;
  tone?: "red" | "blue";
  children: ReactNode;
  className?: string;
}) {
  const toneVar = tone === "blue" ? "var(--mag-blue)" : "var(--mag-red)";
  return (
    <div className={`relative px-6 py-7 sm:px-8 lg:px-10 lg:py-10 ${className}`} style={{ "--mag-drop": toneVar } as CSSProperties}>
      <p className="flex items-center justify-between font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-[#0b1a3a]/55">
        <span>{head}</span>
        <span className="font-mag text-[14px] tracking-[0.1em]">{folio}</span>
      </p>
      {title && (
        <>
          <h2 className="mt-5 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(48px,4.6vw,72px)]">
            {title}
            <br />
            <span style={{ color: toneVar }}>{accent}</span>
          </h2>
          <span aria-hidden="true" className="mt-4 block h-px bg-[#0b1a3a]/25" />
        </>
      )}
      <div className={`${title ? "mt-4" : "mt-6"} font-mag-serif text-[16px] leading-[1.55]`}>{children}</div>
    </div>
  );
}

/** The second page's top rule when the two pages stack below lg. */
const RIGHT_PAGE = "max-lg:border-t max-lg:border-[#0b1a3a]/15";
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head
```

Expected: only unused-symbol warnings are impossible here (TS doesn't error on unused consts by default), so **no output**. `BENEFITS`, `STEPS`, `editionHref`, `usesLogo`, `EditionCard`, `PAPER_CTA`, `PAPER_CTA_OUTLINE`, `RIGHT_PAGE` and `PANEL*` are used in Task 7.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/next-about-stage.tsx
git commit -m "feat(P1-FE-24): magazine stage — cover, spread and page primitives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The three spreads, the newsstand and the back cover

**Files:**
- Modify: `frontend/src/components/next-about-stage.tsx` — append after the `RIGHT_PAGE` constant.

- [ ] **Step 1: Append the spreads**

```tsx
/* ------------------------------------------------------------ the spreads */

/** Spread 1 — the two audiences as facing feature openers. */
export function OpenerSpread() {
  return (
    <MagSpread index={0} className="pt-16 lg:pt-24">
      <MagPage head="For students · ages 14–18" folio="02" title="Become" accent="the media.">
        <p className="sx-mag-dropcap">
          Join your school’s NEXT team as a writer, photographer, videographer, designer, editor or on the sales desk.
          No experience needed. Training is part of it.
        </p>
        <Link href="/next/apply" className={PAPER_CTA}>
          Apply to join
          <ArrowRightIcon className="size-4" />
        </Link>
      </MagPage>
      <MagPage head="For schools & administrators" folio="03" title="Fully" accent="carried." tone="blue" className={RIGHT_PAGE}>
        <p className="sx-mag-dropcap">
          One programme agreement and one faculty advisor. SponsorX carries production, printing, sales operations, rights
          and cost. The first edition is digital and free.
        </p>
        <Link href="/next/schools" className={PAPER_CTA_OUTLINE}>
          Bring NEXT to your school
          <ArrowRightIcon className="size-4" />
        </Link>
      </MagPage>
    </MagSpread>
  );
}

/** Spread 2 (#how) — the feature: five jobs, with the QR sentence as the pull quote. */
export function FeatureSpread() {
  return (
    <MagSpread id="how" index={0} className="pt-12 lg:pt-16">
      <MagPage head="How it works" folio="04" title="Five jobs." accent="One magazine.">
        <blockquote className="border-b border-t-[3px] border-b-[#0b1a3a]/20 border-t-[#ffd12b] py-4 text-[20px] italic leading-[1.3] lg:text-[22px]">
          “Every athlete feature carries a QR code. Readers scan it to open that athlete’s SponsorX profile.”
        </blockquote>
      </MagPage>
      <MagPage head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="05" className={RIGHT_PAGE}>
        <ol className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className={`border-t-2 border-[#0b1a3a] pt-3 ${s.n === "05" ? "sm:col-span-2" : ""}`}>
              <span aria-hidden="true" className="font-mag text-[32px] leading-none text-[#e0192b]">{s.n}</span>
              <p className="mt-1 font-sans text-[12px] font-semibold uppercase tracking-[0.1em]">{s.title}</p>
              <p className="mt-1 text-[15px] leading-[1.5] text-[#0b1a3a]/75">{s.text}</p>
            </li>
          ))}
        </ol>
      </MagPage>
    </MagSpread>
  );
}

/** Spread 3 (#students) — what you get, the under-18 notice, the QR caption. */
export function BenefitsSpread() {
  return (
    <MagSpread id="students" index={0} className="pt-12 lg:pt-16">
      <MagPage head="What you get out of it" folio="06" title="Work that" accent="follows you.">
        <div className="sx-mag-cols space-y-4 lg:space-y-0">
          {BENEFITS.map((b) => (
            <p key={b.title} className="lg:mb-4">
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
      </MagPage>
      <MagPage head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="07" className={RIGHT_PAGE}>
        <aside className="border-[1.5px] border-[#0b1a3a] bg-[#f3f4f6] px-5 py-4">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e0192b]">Under 18? Read this.</p>
          <p className="mt-2 text-[15px] leading-[1.55]">
            A parent or guardian consents before you join. No GPA, no school records on anything public. Ever. Your faculty
            advisor approves what gets published.
          </p>
        </aside>
        <figure className="mt-6 flex items-center gap-4">
          <span
            aria-hidden="true"
            className="size-12 shrink-0 border-2 border-[#0b1a3a] [background:repeating-conic-gradient(#0b1a3a_0_25%,#fff_0_50%)_0_0/8px_8px]"
          />
          <figcaption className="text-[14px] italic leading-[1.45] text-[#0b1a3a]/75">
            Every athlete feature carries one of these. Scan it and the athlete’s SponsorX profile opens.
          </figcaption>
        </figure>
      </MagPage>
    </MagSpread>
  );
}

/* -------------------------------------------------------------- newsstand */

function MiniCover({ e }: { e: EditionCard }) {
  const place = e.school ? [e.school.city, e.school.stateCode].filter(Boolean).join(", ") : "";
  return (
    <Link href={editionHref(e)} className="sx-mag-mini group block">
      <span
        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-[3px] ${COVER_BG} shadow-[0_16px_30px_rgba(0,0,0,.6),0_0_0_1px_rgba(255,255,255,.1)] group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_36px_rgba(0,0,0,.7),0_0_0_1px_rgba(191,224,255,.6)]`}
      >
        {usesLogo(e.publication) ? (
          <Image src={LOGO} alt="" width={400} height={400} unoptimized className="-mt-[2%] w-full mix-blend-screen" />
        ) : (
          <span className="block px-2 pt-3 font-mag text-[clamp(22px,4vw,30px)] leading-[0.9] text-white">{e.publication}</span>
        )}
        <span aria-hidden="true" className="absolute inset-x-2 bottom-2 font-mag text-[18px] leading-none text-[#ffd12b]">
          {e.label}
        </span>
      </span>
      <span className="mt-3 block text-[13px] font-semibold text-on-media">
        {e.publication} · {e.label}
      </span>
      {e.school && (
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em] text-on-media/70">
          {e.school.name}
          {place && ` · ${place}`}
        </span>
      )}
      <span className="mt-2 block text-[12px] font-semibold text-[#ffd12b]">Read the edition →</span>
    </Link>
  );
}

function RackNote({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-xl">
      {title && <p className="font-mag text-[28px] leading-none">{title}</p>}
      <p className={`${title ? "mt-2" : ""} text-[15px] leading-[1.55] text-on-media/80`}>{children}</p>
    </div>
  );
}

/** Live editions as mini covers on a glass rack. `null` is the fetch
 *  failing, `[]` is nothing published yet — both keep the old page's copy. */
export function Newsstand({ list }: { list: EditionCard[] | null }) {
  return (
    <section id="editions" aria-labelledby="editions-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-24 px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div data-reveal="" className="max-w-2xl">
        <Eyebrow>Latest editions</Eyebrow>
        <h2 id="editions-title" className="mt-4 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(56px,4.6vw,80px)]">
          On the stand <span className="text-[#7fd0ff]">now.</span>
        </h2>
      </div>

      <div data-reveal="" style={slot(1)} className="relative mt-10">
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          fill="bg-gradient-to-b from-[#0d1f3d]/60 via-[#07122a]/65 to-[#04091a]/80"
          outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/70 to-[#7fd0ff]/30"
        />
        <div className="relative px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
          {list === null ? (
            <RackNote>
              The editions list didn’t load. Try again in a moment — you can still apply or read about the programme for
              schools.
            </RackNote>
          ) : list.length === 0 ? (
            <RackNote title="No editions published yet">
              The first NEXT editions publish this school year. <span className="text-[#ffd12b]">Yours could be one of them.</span>
            </RackNote>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-10">
                {list.map((e, i) => (
                  <li key={e.id} data-reveal="" style={slot(i + 2)} className="lg:w-[150px]">
                    <MiniCover e={e} />
                  </li>
                ))}
              </ul>
              <span aria-hidden="true" className="sx-mag-shelf mt-8 hidden lg:block" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- back cover */

export function BackCover() {
  return (
    <section className="relative mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-[6vw] lg:pb-24 2xl:px-0">
      <div data-reveal="" className="relative overflow-visible">
        <TiltSpot max={3}>
          <Glass
            plate={PANEL.plate}
            ringClip={PANEL_RING}
            lit
            fill="bg-gradient-to-br from-[#0d1f3d]/80 via-[#07122a]/80 to-[#1a0f08]/80"
            outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#ffd12b]/70"
          />
          <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PANEL.plate }} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              clipPath: PANEL.plate,
              background:
                "radial-gradient(50% 90% at 100% 100%, rgba(255,209,43,.16), transparent 70%), radial-gradient(45% 80% at 0% 0%, rgba(46,155,245,.22), transparent 70%)",
            }}
          />
          <div className="relative grid gap-8 px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14 lg:px-14 lg:py-14">
            <div>
              <Eyebrow>Back cover</Eyebrow>
              <h2 className="mt-4 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(56px,4.6vw,80px)]">
                Your byline starts <span className="text-[#ffd12b]">here.</span>
              </h2>
              <p className="mt-4 max-w-[560px] font-mag-serif text-[16px] leading-[1.55] text-on-media/80 lg:text-[18px]">
                Students apply. Schools sign one agreement. The first edition is free.
              </p>
            </div>
            <CTAs className="sm:flex-row sm:gap-5 lg:flex-col lg:gap-3" />
          </div>
        </TiltSpot>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head; npx eslint src/components/next-about-stage.tsx src/components/next-about-fx.tsx src/lib/next-about.ts
```

Expected: no output from either. If eslint flags the `"tag" in b` narrowing, change `BENEFITS` in `lib/next-about.ts` to declare `tag?: string` on every entry (`{ title, text, tag: undefined }` on the first two) and render `{b.tag && (…)}` instead.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/next-about-stage.tsx
git commit -m "feat(P1-FE-24): magazine stage — the three spreads, newsstand, back cover

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Band numerals

**Files:**
- Modify: `frontend/src/components/packages-stage.tsx` — the `BandItems` function (around line 419) and its imports.

- [ ] **Step 1: Import the helper**

Near the top of `packages-stage.tsx`, after `import { INVENTORY_COPY, type InventoryState } from "@/lib/fixtures";` add:

```tsx
import { splitNumeral } from "@/lib/next-about";
```

- [ ] **Step 2: Render a leading numeral in yellow display type**

Replace the whole `BandItems` function with:

```tsx
/** A band item. A leading "NN " (the /next/about jobs) renders as a yellow
 *  display numeral; every other page's items carry none and are unchanged. */
function BandItems({ items }: { items: string[] }) {
  return items.map((it) => {
    const { numeral, text } = splitNumeral(it);
    return (
      <li key={it} className="flex shrink-0 items-center gap-5 whitespace-nowrap pl-5 text-[12px] font-semibold uppercase tracking-[0.22em] text-on-media/85 lg:gap-8 lg:pl-8 lg:text-[13px]">
        <span aria-hidden="true" className="block size-1.5 rotate-45 bg-[#7fd0ff] shadow-[0_0_8px_#7fd0ff]" />
        {numeral ? (
          <span className="flex items-baseline gap-2">
            <span className="font-mag text-[17px] leading-none tracking-[0.06em] text-[#ffd12b] lg:text-[19px]">{numeral}</span>
            {text}
          </span>
        ) : (
          it
        )}
      </li>
    );
  });
}
```

- [ ] **Step 3: Typecheck and run the existing suite (the band is on /packages and /join too)**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head; npx vitest run 2>&1 | tail -4
```

Expected: no tsc output; vitest `Test Files … passed` with the total = previous count + 1 file (next-about.test.ts).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/packages-stage.tsx
git commit -m "feat(P1-FE-24): InsideBand — leading numerals in yellow display type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `page.tsx` — fetch and layout only

**Files:**
- Rewrite: `frontend/src/app/(public)/next/about/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { BackCover, BenefitsSpread, FeatureSpread, MagCover, Newsstand, OpenerSpread } from "@/components/next-about-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";
import { BAND_ITEMS, type EditionCard } from "@/lib/next-about";

/* --------------------------------------------------------------------------
   /next/about — the public SponsorX NEXT programme landing, P1-FE-24.

   Two audiences on one page — students (14–18) and school administrators —
   each with its own next step. At /next/about because /next is the signed-in
   student portal (spec §8 listed both at /next; one URL can't serve two
   pages). The "Latest editions" block is the live GET /public/next/editions;
   everything else is static copy.

   Redesigned 2026-09-30 as a magazine (design spec
   docs/superpowers/specs/2026-09-30-next-about-magazine-design.md): a
   tilting cover with the BTG Sports Talk Magazine logo as masthead, the
   content as paper spreads that page-flip in, all on the landing's dark
   HUD ground. The blocks live in next-about-stage.tsx; this file only
   fetches and lays them out.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "SponsorX NEXT · Student-run high-school sports media" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function editions(): Promise<EditionCard[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/next/editions`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return ((await res.json()) as { editions: EditionCard[] }).editions;
  } catch {
    return null;
  }
}

export default async function NextLandingPage() {
  const list = await editions();
  return (
    <StageReveal className="sx-stage sx-mag relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <MagCover />
      <InsideBand label="In this issue" items={BAND_ITEMS} />
      <OpenerSpread />
      <FeatureSpread />
      <BenefitsSpread />
      <Newsstand list={list} />
      <BackCover />
    </StageReveal>
  );
}
```

- [ ] **Step 2: Typecheck, lint, unit tests**

```bash
cd frontend && npx tsc --noEmit -p . 2>&1 | grep -v LayoutProps | head; npx eslint "src/app/(public)/next/about/page.tsx"; npx vitest run 2>&1 | tail -3
```

Expected: no tsc/eslint output; vitest all passed.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(public)/next/about/page.tsx"
git commit -m "feat(P1-FE-24): /next/about laid out as the magazine stage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: QA in the browser, then build

**Files:**
- Scratch: `<scratchpad>/qa-next-about.mjs`, `<scratchpad>/shots/`

- [ ] **Step 1: Start the dev server in the background**

```bash
cd frontend && npx next dev -p 3000
```

Run with the Bash tool's `run_in_background: true`. Wait for `✓ Ready`. (The backend API need not be running: the page then renders the "didn't load" rack note, which is one of the states to check. If the backend IS running with seeded editions, the covers render — check both if you can, by also running with `API_URL=http://localhost:1` to force the error state.)

- [ ] **Step 2: Write the QA script**

```js
// <scratchpad>/qa-next-about.mjs — run from the repo root
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("D:/iCARRe Solutions/sponsorX_dev/node_modules/playwright");

const base = process.env.BASE ?? "http://localhost:3000";
const out = process.env.SHOTS ?? "./shots";
mkdirSync(out, { recursive: true });
const widths = [1920, 1440, 1024, 983, 768, 390, 360];
const browser = await chromium.launch();
let failures = 0;

for (const theme of ["dark", "light"]) {
  for (const reduced of [false, true]) {
    if (reduced && theme === "light") continue;
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((t) => localStorage.setItem("sx-theme", t), theme);
      await page.goto(base + "/next/about", { waitUntil: "networkidle" });
      const loaded = await page
        .waitForFunction(() => document.documentElement.hasAttribute("data-sx-loaded"), null, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => {
        for (const el of document.querySelectorAll("[data-sx-stage], .overflow-x-clip, .overflow-hidden")) el.style.overflowX = "visible";
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
      const unrevealed = await page.evaluate(() => document.querySelectorAll("[data-reveal]:not([data-in])").length);
      const heroFits = await page.evaluate(() => {
        const s = document.querySelector("main section, [data-sx-stage] > section");
        return s ? Math.round(s.getBoundingClientRect().height) : -1;
      });
      await page.screenshot({ path: `${out}/about-${theme}${reduced ? "-reduced" : ""}-${w}.png`, fullPage: true });
      const bad = !loaded || overflow > 0 || unrevealed > 0 || errors.length > 0;
      if (bad) failures++;
      console.log(`${bad ? "FAIL" : "ok  "} ${theme}${reduced ? "/reduced" : ""} ${w}px`, { loaded, overflow, unrevealed, heroHeight: heroFits, errors });
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it**

```bash
cd "$CLAUDE_SCRATCHPAD" && node qa-next-about.mjs
```

Expected: every line `ok`, `overflow: 0`, `unrevealed: 0`, `errors: []`, `loaded: true`, exit code 0. For each `FAIL`, open the matching screenshot in `shots/` with the Read tool and fix the cause in the stage or CSS; the usual culprits are a `whitespace-nowrap` CTA overrunning 360px (drop to `px-4` under `sm`), the outlined "NEXT" word widening the page (it is `overflow-hidden` inside the hero — confirm the hero section keeps `overflow-hidden`), and a spread's `perspective` clipping (raise `perspective` or lower `rotateX`). Re-run until clean.

- [ ] **Step 4: Look at the screenshots**

Read `shots/about-dark-1440.png` and `shots/about-dark-390.png` with the Read tool. Check against the spec: cover right of the copy at 1440 and above it at 390; logo's black ground invisible on the cover; three paper spreads with folios 02–07; the newsstand note or covers; the back cover. Fix anything off and re-run Step 3.

- [ ] **Step 5: Client-side arrival**

The hero entrance must also play when arriving from the landing by a client push (`prepareArrival()` clears `data-sx-loaded`). In a fresh headed run:

```bash
cd "$CLAUDE_SCRATCHPAD" && node -e "
const { chromium } = require('D:/iCARRe Solutions/sponsorX_dev/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:3000/packages', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.documentElement.hasAttribute('data-sx-loaded'));
  await p.click('a[href=\"/next/about\"]');
  await p.waitForURL('**/next/about');
  const ok = await p.waitForFunction(() => document.documentElement.hasAttribute('data-sx-loaded') && document.querySelector('[data-sx-stage][data-armed]'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  console.log({ clientArrivalArmedAndLoaded: ok }); await b.close();
})();"
```

Expected: `{ clientArrivalArmedAndLoaded: true }`. If the header has no `/next/about` link at the moment, navigate from `/` instead (the nav's NEXT item, per the 2026-09-30 log).

- [ ] **Step 6: Stop the dev server, then build, lint, test**

Kill the background dev process (TaskStop on its id). Then:

```bash
npm run build 2>&1 | tail -15 && cd frontend && npx eslint . 2>&1 | tail -3 && npx vitest run 2>&1 | tail -3
```

Expected: build `✓ Compiled successfully` and the route table listing `/next/about` as `ƒ (Dynamic)`; eslint silent; vitest all passed.

- [ ] **Step 7: Commit any fixes from QA**

```bash
git add frontend/src
git commit -m "fix(P1-FE-24): /next/about QA — <what was fixed>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Skip if QA needed no change.)

---

### Task 11: Memory log, graph, hand-off

**Files:**
- Modify: `Memory/2026-09-30/tasks-completed.md` (append)
- Regenerate: `graphify-out/` (incremental)

- [ ] **Step 1: Append the day's entry**

Append to `Memory/2026-09-30/tasks-completed.md`:

```markdown
## /next/about redesigned as a magazine — via Claude

Owner: "/next/about looks plain … it's all about a magazine, so the page must
feel like we're in a magazine; wow factor, awwwards". Brainstormed in the
visual companion (direction A: a real cover then paper spreads; sports-mag
type with the logo's yellow/red on the landing's HUD ground; motion A: the
cover tilts with the pointer, spreads page-flip in). Spec:
`docs/superpowers/specs/2026-09-30-next-about-magazine-design.md`; plan:
`docs/superpowers/plans/2026-09-30-next-about-magazine.md`. Same route, same
copy, same live editions fetch and its three states.

- `frontend/public/next/btg-sports-talk-magazine.png` — the client's
  magazine logo (from the owner), re-exported at 800px; drawn with
  `mix-blend-mode: screen` so its black ground vanishes into the cover.
- `frontend/src/components/next-about-stage.tsx` (server) — MagCover (HUD
  eyebrow, three-line Bebas headline, serif dek, yellow + outline CTAs,
  glass stat strip, the tilting cover: logo masthead, Issue 01 / Free digital
  tags, "Five jobs. One magazine.", an "Inside:" contents line, barcode,
  scan), MagSpread / MagPage (paper, spine, corner curl, folios 02–07,
  display headline with a red or blue accent line, serif body with a drop
  cap), the three spreads, Newsstand (live editions as mini covers on a
  glass rack — the BTG logo only when the publication is Sports Talk, a
  typographic masthead otherwise; error/empty copy kept), BackCover.
- `next-about-fx.tsx` (client) — CoverGlow: pointer glow on the cover, one
  pulse on touch. Tilt is the landing's TiltSpot; reveals are /packages'
  StageReveal.
- `lib/next-about.ts` + `tests/next-about.test.ts` — constants, copy,
  `usesLogo`, `editionHref`, `splitNumeral` (7 tests).
- `app/layout.tsx` — Bebas Neue + Source Serif 4 via next/font
  (`font-mag`, `font-mag-serif`); nothing outside `.sx-mag` uses them.
- `globals.css` — `.sx-mag`: paper tokens (navy ink, red, yellow, blue),
  sheet / spine / curl, drop cap, two columns from lg, the page-flip
  entrance (sheet hinges up from its bottom edge, shade fades), cover glow,
  newsstand shelf; reduced-motion opt-outs.
- `packages-stage.tsx` — InsideBand items with a leading "NN " render the
  numeral in yellow display type (other pages unaffected).

Verified via Playwright at 1920, 1440, 1024, 983, 768, 390, 360, dark and
light themes and reduced motion: no console errors, no horizontal overflow,
hero entrance on hard load and on client-side arrival, every spread flips in.
`npm run build`, eslint and the frontend suite pass. No tracker row — design
pass on a shipped screen. <Note here if the logo was NOT compressed because
sharp was unavailable, and any QA fix made in Task 10.>
```

Replace the `<…>` sentence with what actually happened, or delete it.

- [ ] **Step 2: Update the knowledge graph**

```bash
graphify --update . 2>&1 | tail -3
```

Expected: a line like `Graph: N nodes, M edges, K communities` with N ≥ 9533 (the graph never shrinks).

- [ ] **Step 3: Commit**

```bash
git add Memory/2026-09-30/tasks-completed.md graphify-out
git commit -m "docs(P1-FE-24): log the /next/about magazine redesign; re-ingest graph

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Report**

Tell the owner: what changed (one paragraph), the QA matrix result, the logo compression result, and that the Google Sheet mirror is theirs at end of day (no tracker row was added, so nothing to mirror for this pass).
