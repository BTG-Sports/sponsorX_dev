# P1-QA-02 — Accessibility audit: AA contrast both themes, keyboard, no-JS redeem

**Date:** 2026-09-12 · **Branch:** `P1-FE-QA-PMO` · **Acceptance:** contrast AA
in both themes; keyboard navigation complete; redeem page passes without JS.

## Method

Headless Chrome + DevTools protocol. Contrast: every element with a direct
text node on 10 representative pages × 2 themes; effective background computed
by compositing the ancestor `background-color` chain (alpha-aware); AA
threshold 4.5:1 normal / 3:1 large. Gradient-text (`text-transparent`) and
text over gradient surfaces can't be composited automatically — those went to
a **manual list** verified by token math (below). The light theme was applied
the way real users get it — `localStorage` before load, through the app's own
pre-paint script. **Flipping `data-theme` mid-page in an evaluation produces
false 1.01-ratio readings** (Tailwind v4 theme properties don't recompute
synchronously in that path); an earlier run did exactly that and "found" ~50
phantom failures. Documented so the next auditor doesn't chase them.

## Contrast failures found → fixed (token-level)

| Token | Was | Now | Why |
|---|---|---|---|
| `--sx-text-faint` (dark) | `#5d6375` — **3.05** on surface, 2.75 on surface-2 | `#7e88a0` — 5.14 / 5.51 / 4.64 | Captions, table headers, timestamps all render in faint at 10–11px (AA 4.5 applies at any size) |
| `--sx-text-faint` (light) | `#8aa5c4` — **2.54** on white | `#52708f` — 5.16 / 4.70 / 4.83 | Same. A2's light sweep covered brand/chip tokens, not the faint text token |
| `--sx-accent-soft` (light) | `#f97a1f` — **2.68** as text on white | `#9c4507` | Used as text on the sponsor renewal card and as CTA hover fill |
| CTA label ink (new `--sx-cta-ink`) | `text-white` on `bg-primary` — **2.95** in dark | dark: `#0a0c10` ink (6.64 on primary, 8.77 on hover, 7.3 on accent); light: white (5.67 / 5.34 — light fills were already darkened) | ~27 CTA sites swept `text-white` → `text-cta-ink`; also chart funnel bars, Monogram gradients, and the fan page's hardcoded step dot |

Hierarchy preserved in both themes: new faint stays on the correct side of
muted (dark 5.14 < 5.73; light 5.16 > 4.5 but darker than muted's 5.82? — no:
light faint 5.16 vs muted 5.82, faint remains the lighter/less emphatic of
the two).

## Verified after fixes

- **Dark theme: 10/10 pages, 0 failures** (855 text elements checked).
- **Light theme: 10/10 pages, 0 failures** (853 checked), theme applied
  pre-paint.
- **Manual list (gradient contexts), verified by composite math:** body text
  on hero bands ≈ **12.4:1** at the worst 20%-alpha gradient edge; gradient
  headlines (`.sx-gradient-text`) are ≥24px bold (3:1 rule) with endpoint
  ratios **6.19 / 8.18** on surface. One caveat: `text-muted` measured at a
  band's 20% edge is 4.25 — the gradient is `to-transparent` so real placement
  sits over lower alpha, but avoid putting muted 11px copy at the leftmost
  edge of a `from-primary/20` band.
- **Keyboard:** real Tab keypress → `:focus-visible` matches with the UA
  `outline: auto` ring; `Button` additionally carries explicit
  `focus-visible:ring-2` classes; 0 positive tabindex; 0 click-only divs; the
  nav drawer and user menu close on Escape (code-verified,
  `mobile-nav.tsx` / `user-menu.tsx`).
- **No-JS redeem:** with script execution disabled, `/r/<token>` renders the
  full reward copy, all four funnel steps and the token — 0 authored client
  JS on the route (per P1-FE-03's build).
- `tsc` clean · `eslint` 0 errors · `next build` green.

## Residual risk / not covered

- Contrast was measured on 10 representative pages, not all 25 routes — the
  failures were all *token-level*, so fixes apply globally, but a new
  hand-rolled hex slipped into a page later would not be caught. Re-run the
  checker when adding pages.
- Screen-reader semantics (landmarks, table headers, live regions) were not
  in this task's acceptance and were not audited.
