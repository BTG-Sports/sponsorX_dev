# `/next/about` as a magazine — design (2026-09-30)

The public SponsorX NEXT landing (`P1-FE-24`, `frontend/src/app/(public)/next/about/page.tsx`)
is redrawn so the reader feels they are inside a magazine. Owner's brief: "wow factor,
awwwards, magazine style — it must feel like we're in a magazine". The client's magazine is
**BTG Sports Talk Magazine**; its logo (`frontend/public/next/btg-sports-talk-magazine.png`,
1254×1254 RGB on black) must appear on the cover or in the pages.

Chosen in the brainstorm (visual companion, three rounds):

- **Direction A** — a real magazine cover as the hero, then the content as paper spreads.
- **Type and colour mix** — sports-magazine type and the logo's palette on the pages, the
  landing page's HUD ground underneath (its blue and orange glows, floor grid, glass panels,
  chamfered corners, marquee band, outlined giant word).
- **Motion A** — the cover tilts with the pointer; each spread page-flips up as it scrolls
  into view. (Motion B, scrolling the cover open, was declined as a day more of build.)

This is a design pass on a shipped screen. Same route, same copy, same live editions fetch
and its three states. No tracker row; the day's `Memory/` log gets an entry.

## 1. Structure and files

`page.tsx` keeps the fetch, the `Edition` type and `dynamic = "force-dynamic"`, and only lays
the blocks out inside the existing `StageReveal` (`packages-fx.tsx`), exactly as `/packages`
and `/join` do:

```tsx
<StageReveal className="sx-stage sx-mag relative -mt-[72px] w-full overflow-x-clip text-on-media">
  <MagCover />                       // 1  hero
  <InsideBand label="In this issue" items={…} />   // 2  band (reused)
  <MagSpread …>For students / For schools</MagSpread>   // 3
  <MagSpread …>Five jobs</MagSpread>                     // 4
  <MagSpread …>What you get + fine print</MagSpread>     // 5
  <Newsstand editions={list} />      // 6  live editions
  <BackCover />                      // 7  close
</StageReveal>
```

New files:

| File | Kind | Holds |
|---|---|---|
| `frontend/src/components/next-about-stage.tsx` | server | `MagCover`, `MagSpread` + `MagPage`, `Newsstand`, `BackCover`, the `STEPS` / benefits copy moved out of `page.tsx` |
| `frontend/src/components/next-about-fx.tsx` | client | `CoverGlow` — the cover's pointer-following glow and the entrance glow on touch |
| `frontend/src/app/globals.css` | — | one `.sx-mag` block: paper, folio, drop cap, columns, page-flip reveal, mini covers, reduced-motion opt-outs |

Reused, unchanged: `StageReveal`, `InsideBand`, `Eyebrow`, `StepRule`, `SectionHead`,
`chamfer` (packages-stage.tsx); `Glass` (landing-sponsors.tsx); `TiltSpot`, `Magnetic`,
`ScrambleText` (hero-fx.tsx); `ArrowRightIcon` (landing-hero.tsx); the `.sx-stage*`,
`[data-reveal]`, `.sx-sheen`, `.sx-scan` rules. The page's hero entrance is released by
`html[data-sx-loaded]` (boot screen on a hard load, page transition on a client move —
`prepareArrival()` already clears the flag for every public push).

## 2. Type and colour

**Fonts.** Two faces added in `app/layout.tsx` through `next/font/google`, self-hosted at
build like Poppins, exposed as CSS variables and Tailwind utilities:

| Variable | Face | Weights | Used for |
|---|---|---|---|
| `--font-mag` (`font-mag`) | Bebas Neue | 400 | cover lines, spread headlines, numerals, drop caps, the outlined stage word |
| `--font-mag-serif` (`font-mag-serif`) | Source Serif 4 | 400, 600, 400 italic | body text on paper, the pull quote (italic), the hero dek |

(Not `font-display`: that name collides with the `font-display` descriptor and reads as a
CSS property in a class list.) Everywhere below, `font-display` means `font-mag` and
`font-serif-body` means `font-mag-serif`.

Labels, folios, running heads and buttons stay Poppins in caps with wide tracking — no third
face. The variables are declared on `<html>` next to `--font-poppins`; nothing outside
`.sx-mag` uses them. (The edition reader's "no new type scale" rule is about the reader
product, not this marketing page; the reader is untouched.)

**Palette.** The ground is `.sx-stage` unchanged (blue and orange glows, dot grid). On paper
the inks are the logo's, as fixed literals inside `.sx-mag` (they never respond to the theme):

| Token (CSS var on `.sx-mag`) | Value | Role |
|---|---|---|
| `--mag-paper` | `#fbfbf9` | page background |
| `--mag-ink` | `#0b1a3a` | navy — headlines, body text, rules, page numbers |
| `--mag-red` | `#e0192b` | numerals, drop caps, the second headline line |
| `--mag-yellow` | `#ffd12b` | pull-quote rule, primary CTA, the yellow headline line on the stage |
| `--mag-blue` | `#2e9bf5` | the schools page's accent (the landing's blue) |

Muted text on paper is `--mag-ink` at 70% (≥ 4.5:1 on the paper). NEXT purple
(`--sx-next`) is not used on this page. Like `/packages` and `/join`, the page is
**fixed dark in both themes**: every ink on the stage is `text-on-media` or a fixed literal,
and no themed token (`primary`, `text`, `muted` …) is used for text.

## 3. The cover (block 1)

Hero grid: copy left, cover right from `lg`; below `lg` the cover sits **above** the copy,
centred, `max-w-[280px]`. The stage ground spans the whole hero (`inset-0`, the `/join` fix),
with `.sx-stage-floor` and the outlined word **"NEXT"** in Bebas behind.

Copy column, in order, each a `.sx-stage-in` piece with a staggered `--sx-reveal-delay`:

1. `Eyebrow` — `ScrambleText` "SponsorX NEXT · Issue 01 · Fall 2026".
2. `<h1>` — three `.sx-stage-line` lines in `font-display`: "Your school's" / "sports story." /
   "Told by you." (last line `--mag-yellow`). `clamp(56px, 9vw, 112px)`, `leading-[0.88]`.
3. Dek — the existing paragraph, `font-serif-body`, `text-on-media/80`, `max-w-[520px]`.
4. CTAs — `Magnetic` + `.sx-sheen`: **"Apply to join your team →"** (`bg-[--mag-yellow]`
   `text-[#0b0b14]`, → `/next/apply`) and **"Bring NEXT to your school"** (outline white,
   → `/next/schools`). Both `whitespace-nowrap`; stacked full-width below `sm`.
5. Stat strip — a chamfered `Glass` row: **05** Jobs · **14–18** Ages · **$0** First edition
   (yellow) · **QR** On every feature. Static figures from the page's own copy; no fetch.

The cover, `aspect-[3/4]`, `rounded-[4px]`, `overflow-hidden`, `shadow-[0_40px_70px_rgba(0,0,0,.65)]`,
background `linear-gradient(180deg, #000 0%, #061027 45%, #0d1a3a 100%)`:

- **Masthead** — the logo as `<Image>` (`next/image` with `unoptimized` — host-portable rule),
  `mix-blend-mode: screen` so its black ground vanishes into the navy; `priority`; width 100%.
- **Corner tags** — "Issue 01" top-left, "Free digital" top-right (thin white outline boxes).
- **Cover lines** at the foot — "Five jobs." / "One magazine." (yellow) in `font-display`, and an
  **"Inside:"** line with three links: *how it works* → `#how`, *what you get* → `#students`,
  *latest editions* → `#editions` (the existing section ids stay).
- **Barcode** — a decorative stripe bottom-right, `aria-hidden`.
- **Motion** — wrapped in `TiltSpot max={8}`; the `.sx-scan` line; and `CoverGlow`
  (client): a radial glow that follows the pointer (`--gx/--gy` written on the plate, one
  write per frame, fine pointer only). On touch the glow is fixed at the masthead and pulses
  once with the entrance. Reduced motion: no tilt, no scan, no pulse.
- The whole cover is one `.sx-stage-in` piece with the longest delay so it lands last.

Decorative layers (`scan`, `glow`, barcode, tags) are `aria-hidden`; the masthead `<Image>`
has `alt="BTG Sports Talk Magazine"`; the cover lines are real text.

## 4. The spreads (blocks 3–5)

`MagSpread` renders one sheet of paper, `data-reveal` with `--i`, holding two `MagPage`s:

```
<section class="sx-mag-spread" data-reveal>         ← flips in
  <div class="sx-mag-sheet">                         ← paper, spine shadow, corner curl
    <MagPage side="left"  folio="02" head="For students · ages 14–18">…</MagPage>
    <MagPage side="right" folio="03" head="For schools & administrators">…</MagPage>
  </div>
</section>
```

- **Sheet** — `bg-[--mag-paper] text-[--mag-ink]`, `max-w-[1180px]`, `shadow-[0_30px_60px_rgba(0,0,0,.6)]`,
  a centre spine (`linear-gradient(90deg, transparent, rgba(0,0,0,.22) 50%, transparent)`,
  36px wide, `aria-hidden`) and a corner curl bottom-right (`.sx-mag-curl`, a 64px
  `linear-gradient(225deg, var(--sx-stage-bg) 50%, #e6e6e2 50%)` with an inner shadow).
- **Page** — `px-6 py-6 lg:px-10 lg:py-9`. Top: the **folio row** (running head left, page
  number right; Poppins 10px caps, `tracking-[0.2em]`, ink/55). Then the headline in
  `font-display` `clamp(40px, 5vw, 72px)` `leading-[0.9]`, second line in the page's accent;
  a 1px ink/25 rule; then the body in `font-serif-body` 16px `leading-[1.55]`, first paragraph
  with a **drop cap** (`::first-letter`, `font-display`, 3 lines tall, `--mag-red`;
  `--mag-blue` on the schools page). Two columns (`columns: 2`) from `lg` where the copy is
  long enough (spread 5 left page only).
- **From `lg`** the two pages sit side by side (`grid-cols-2`). **Below `lg`** the sheet
  stacks them as two single pages, the spine becomes a horizontal rule, and the folios keep
  counting — page numbers are given, not computed.

Contents:

| Spread | Left page | Right page |
|---|---|---|
| 3 · openers | **02** "For students · ages 14–18" — "Become / the media." (red), body, CTA "Apply to join →" (navy plate, yellow text, → `/next/apply`) | **03** "For schools & administrators" — "Fully / carried." (blue), body, CTA "Bring NEXT to your school →" (navy outline, → `/next/schools`) |
| 4 · feature, `id="how"` | **04** "How it works" — "Five jobs. / One magazine." (red), the QR sentence as a **pull quote** (serif italic, yellow 3px rule above, ink/20 rule below) | **05** "BTG Sports Talk · Issue 01" — the five `STEPS` as a 2-column list: red numeral in `font-display`, caps title, serif text; 05 spans both columns |
| 5 · what you get, `id="students"` | **06** "What you get out of it" — "Work that / follows you." (red), the three benefits as bold-lead serif paragraphs in 2 columns (the "Not cash" chip kept inline as a caps tag) | **07** "BTG Sports Talk · Issue 01" — the **under-18 notice** as a boxed note (1.5px navy border, `#f3f4f6` fill, red caps title "Under 18? Read this."), then a **QR caption**: a decorative 44px checker (`aria-hidden`) beside the italic caption "Every athlete feature carries one of these. Scan it and the athlete's SponsorX profile opens." |

**Page-flip entrance.** In `.sx-mag`, `[data-reveal]` overrides the stage's plain rise:

```css
.sx-mag [data-sx-stage][data-armed] .sx-mag-spread { perspective: 1400px; }
.sx-mag [data-sx-stage][data-armed] .sx-mag-spread > .sx-mag-sheet {
  transform-origin: 50% 100%;
  transform: rotateX(62deg) translateY(40px); opacity: 0;
  transition: transform 1.1s var(--sx-ease), opacity .6s var(--sx-ease);
  transition-delay: calc(var(--i, 0) * 110ms);
}
.sx-mag [data-sx-stage][data-armed] .sx-mag-spread[data-in] > .sx-mag-sheet { transform: none; opacity: 1; }
/* the shade: a ::before on the sheet, dark at the top, fading with the flip */
```

The sheet's `::before` is a top-down shade that goes from 0.45 to 0 over the same transition.
Fires once per spread (`StageReveal` unobserves on entry). Reduced motion: no transform, no
shade — the sheet is simply there.

## 5. Newsstand and back cover (blocks 6–7)

**Newsstand**, `id="editions"`, `aria-labelledby`: `SectionHead` eyebrow "Latest editions",
title "On the stand" + accent "now.", then a chamfered `Glass` rack (`data-reveal`).

- **List** — each edition a `<li>` `data-reveal` with `--i`: a **mini cover** link
  (`aspect-[3/4]`, 120px wide from `sm`, 96px below; navy gradient; `hover` lifts 6px and
  brightens the outline) to `/next/{school.slug ?? "regional"}/{id}` (the existing href).
  The mini cover's masthead is the **BTG logo** (screen-blended) when
  `/sports\s*talk/i.test(e.publication)`, otherwise the publication name set in
  `font-display` — so another school's title never wears this logo. Cover foot: the
  edition `label` in `font-display`; under the cover, school name and city/state (caps, on-media/70)
  and "Read the edition →" (yellow).
- **Error** (`list === null`) and **empty** (`[]`) — the current copy, unchanged, set inside
  the rack as a single glass note; the empty state's second sentence in yellow.
- Rack from `lg`: a row with the covers standing on a 1px lit shelf line (`.sx-mag-shelf`,
  the band's glowing rule). Below `lg`: a 2-column grid of covers.

**Back cover** — a chamfered `Glass` panel (`PANEL` chamfer, `lit`), `data-reveal`:
`Eyebrow` "Back cover", headline "Your byline starts / here." (yellow) in `font-display`,
dek "Students apply. Schools sign one agreement. The first edition is free." in serif,
and the same two CTAs as the hero (`Magnetic`, `.sx-sheen`), stacked below `sm`, `px-5`
under `sm` (the `/packages` 320px lesson).

The footer sits on the site's chrome below, unchanged.

## 6. Band (block 2)

`InsideBand` from `packages-stage.tsx`, `label="In this issue"`, items:
`["01 Write", "02 Shoot", "03 Design", "04 Sell", "05 Publish", "Your byline", "Portfolio credit", "Sales credit that stays yours", "QR on every feature"]`.
The numbered items carry their numeral in `--mag-yellow` (a small change to `BandItems`:
a leading `NN ` token renders as a yellow `font-display` span; other pages pass no numerals
and are unaffected).

## 7. Accessibility, no-JS, performance

- Headlines, cover lines and every body paragraph are real DOM text; `ScrambleText` keeps
  the final string as its accessible name.
- Paper contrast: ink on paper 15.9:1; ink/70 ≥ 4.5:1; red numerals are decorative
  duplicates of the caps titles beside them; yellow on the navy CTA plate 12:1; the dark
  CTA ink on yellow 14:1 (white on yellow fails, the `/join` lesson).
- No JS: `StageReveal` never arms, so nothing is hidden; the cover shows tilted at rest
  (no transform), the spreads sit flat.
- Reduced motion: no tilt, scan, glow pulse, flip, marquee drift or sheen — pieces appear.
- The logo is one 1.1 MB PNG. It is served as-is (`unoptimized`, host-portable) but
  **re-exported at 800×800 and palette-compressed before shipping** (target ≤ 180 KB) with
  `sharp` from the frontend's `node_modules` (Next's own dependency); if `sharp` is not
  installed, the original ships and the memory log says so. The mini covers reuse the
  same file. `priority` on the hero instance only.
- The hero fits one phone screen height: cover `max-w-[280px]` above the copy, `h1` at the
  clamp's floor, stat strip 4-up wrapping to 2×2 below `sm`.

## 8. Verification

Same bar as `/packages` and `/join`:

- Playwright in Chrome at **1920, 1440, 1024, 983, 768, 390, 360** wide, dark and light
  theme: no console errors, no horizontal overflow (lift `overflow-x-clip` before
  measuring, as the QA script does), hero entrance fires on hard load and on a client-side
  arrival from the landing, every spread flips in, reduced-motion shows everything static.
- `npm run build`, `eslint`, the frontend test suite; the page-transition tests unchanged.
- Light theme: the page stays dark; the site header over it stays legible.
- Screenshots of the seven blocks at 1440 and 390 attached to the memory log entry.

## 9. Out of scope

Scroll-driven cover opening (motion B); any change to the edition reader, `/next/apply`,
`/next/schools`; new copy; a CMS for issue number and season (both are constants at the top
of `next-about-stage.tsx`, marked for the day an edition actually publishes — `P9-DATA-01`).
