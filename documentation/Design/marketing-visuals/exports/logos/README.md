# BTG SponsorX — logo files (flat redraw, P1-ART-06)

Vector SVG. Every file exists in a `-dark` and a `-light` variant.

| File | Use |
|---|---|
| sponsorx-horizontal-*.svg | Site header, one line: BTG + SPONSOR + X |
| sponsorx-stacked-*.svg | Narrow widths and the phone hero |
| sponsorx-wordmark-*.svg | SPONSOR + X only, no BTG, no tagline |
| sponsorx-tagline-*.svg | Wordmark plus ATHLETE NETWORK. / BRAND IMPACT. |
| sponsorx-x-*.svg | The two-part X alone |
| btg-badge-*.svg | Circular BTG mark |
| favicon-32.svg, favicon-32.png | Favicon — ring thinned to 1.5px, X dropped (does not read at 32) |
| apple-touch-icon-180.svg, apple-touch-icon-180.png | App icon on a rounded dark tile |

## Colors
- Blue `#2E9BF5` (dark ground) / `#1E7CC8` (white ground, for 4.5:1)
- Orange `#F97A1F` (dark) / `#C25A0F` (white, for body-size tagline text)
- Ink `#F4F5F7` (dark) / `#0A0C10` (white)

On white the blade takes ink `#0A0C10` — `#F4F5F7` disappears. The bolt stays orange in both.

## Carried over from the raster lockup
Two-part X (orange lightning bolt left, blade right), BTG above SPONSOR flanked by rules, blue-then-orange tagline split, circular BTG badge.

## Dropped
Bevel, chrome gradient, outer glow, drop shadow, the dark plate. The gradient tagline rule is now two flat segments.

## Before production use
Letterforms are set in **Barlow Condensed 800 italic** as the closest freely available stand-in for the original heavy condensed italic. Two things to do in the master files:

1. Substitute the real brand typeface if one exists, then **convert type to outlines** — these SVGs currently reference the font by name, so a machine without it renders a fallback.
2. Refit each viewBox to the outlined artwork (text metrics vary by font, so the current boxes carry a little slack).
