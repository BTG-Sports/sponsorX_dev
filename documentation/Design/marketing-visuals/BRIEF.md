# Design brief — Marketing site visual assets (`P1-ART-06`)

Paste this whole file into Claude Design.

---

## What to design

The imagery and visual treatments for the public BTG SponsorX marketing site:
the hero, the slots where proof and case studies will sit, and how the six
sponsorship packages are presented.

The site's pages already exist and are built. This task supplies the visual
layer they are missing — at present the only images in the project are the three
logo files.

**Desktop 1440 wide, and the same treatments at 390 phone width.** The hero is
the first thing a local sponsor sees and most of them arrive on a phone.

## Who the site is talking to

A local business owner — a car dealership, a physiotherapy practice, a
restaurant — who has been asked to sponsor a school or college athlete and does
not know what that involves. Not a national brand, not a media buyer. The visual
language should feel credible and local, not like a technology platform pitching
scale.

## Screens and assets required

| # | Asset | Purpose |
|---|---|---|
| 1 | Hero, desktop | The first screen: what SponsorX is, and the one action |
| 2 | Hero, phone | The same, at 390 |
| 3 | Proof / case-study slot | The repeatable card a real case study will fill |
| 4 | Case-study section | Three slots in place, as the homepage will show them |
| 5 | Package presentation | The six packages as a comparable set |
| 6 | Package card detail | One package: what is in it, what it costs, what the sponsor does next |
| 7 | Logo assets | The lockups listed under “Logo assets” below |

## The rules that shape it

**No invented proof.** BTG has no case studies yet. Design the case-study slot
as *structure* — the shape a real result will occupy, with visible placeholders
such as `[SPONSOR NAME]` and `[RESULT]`. Do not invent sponsor names, logos,
quotes, percentages or athlete results. A fabricated proof point on a public
homepage is the single fastest way to lose the credibility this site exists to
build.

**No invented statistics anywhere**, including in the hero. If a number would
help, leave a labelled placeholder for a real one.

**The packages must be comparable — and these are the six.** Do not invent a
package model, rename them, or change the counts. They come from §7 and are
recorded in `documentation/SponsorX-Sponsor-Packages-and-Inventory.md`:

| Package | Price (USD) | Athletes | Purpose |
|---|---|---|---|
| SponsorX Test Drive | $750 | 3 | Low-friction first purchase |
| Local Blitz | $1,500–$3,000 | 5–10 | Local awareness and traffic |
| 10-Athlete Blitz | ~$2,500 | 10 | Distributed athlete media |
| Community Campaign | ~$5,000 | 10–15 | Mid-level campaign |
| Athlete Takeover | ~$10,000 | 15–25 | Major activation |
| Season Partner | $15K–$30K+ | recurring | Category ownership |

**Prices are US dollars.** SponsorX is a US product — NIL is US law and the
sponsors are local US businesses. No other currency appears anywhere.

**Only four things about these packages are real**: price, athlete count,
duration, and — on Season Partner alone — exclusivity. Everything else in the
§7 descriptions is sales language, and no package has yet been assigned its NIL
job codes. So compare them on those four. **Do not draw a feature matrix with
ticks per package, and do not invent a tiered "everything in the previous one"
ladder** — neither exists, and inventing one commits BTG to selling it.

Two known problems the design should not paper over: Local Blitz and 10-Athlete
Blitz overlap almost completely at $2,500 with 10 athletes, and "iMC/BTG
feature" appears in three packages but is not a NIL job and has no cost line.
Present what is true and let the overlap show rather than manufacturing a
difference.

**The action is "request a brief", not "buy".** Phase 1 is a managed
marketplace: a sponsor tells BTG what they want and a person follows up. Nothing
on the site should imply self-service checkout.

**Athletes are the subject, not stock imagery.** Where a photograph would go,
design the frame and the treatment and mark it as a photo slot with a note on
what the photo should show. Do not fake photography.

## Brand

Dark theme, primary — the logo lives on black. Light variant exists but dark is
the default.

| Token | Value | Use |
|---|---|---|
| Ground | `#0A0C10` | page background |
| Surface | `#12151D` | cards |
| Surface 2 | `#1A1F2B` | raised panels |
| Line | `#242A38` | borders |
| Text | `#F4F5F7` | body |
| Muted text | `#8A90A2` | secondary |
| Primary blue | `#2E9BF5` | from the logo's "BTG" wordmark |
| Accent orange | `#F97A1F` | from the logo's "X" — the sponsor-facing accent |
| Accent soft | `#FB923C` | lighter orange |
| Success | `#22C98D` | positive marks |

The sponsor-facing accent is the **orange**; blue is the athlete side. The
marketing site is talking to sponsors, so orange leads.

Typeface **Poppins** (400 / 500 / 600 / 700). Label ink on a primary blue or
orange fill is `#0A0C10`, not white.

## Logo assets — produce these as part of this task

The existing mark is a raster esports-style lockup: the word **SPONSOR** in
heavy condensed italic caps with a chrome bevel, a large two-part **X** to its
right (an orange lightning-bolt left half, a silver blade right half), **BTG**
above it in blue italic caps flanked by tapering rules, the tagline
**ATHLETE NETWORK. BRAND IMPACT.** beneath — "ATHLETE NETWORK." in blue,
"BRAND IMPACT." in orange — over a blue-to-orange gradient rule, and below that
a circular **BTG** badge beside *POWERED BY BTG SPORTS GROUP*.

It only exists as a PNG with 3D bevels, chrome gradients, outer glow and a drop
shadow. That treatment does not survive at web sizes, does not work on a light
ground, and cannot be recoloured. **Produce flat, screen-usable versions of the
same mark** — this is a redraw for the web, not a new identity:

| Asset | |
|---|---|
| Horizontal lockup | BTG + SPONSORX + the X, one line, for the site header |
| Stacked lockup | The same for narrow widths and the phone hero |
| Wordmark only | SPONSORX + X, no BTG, no tagline |
| Tagline lockup | Wordmark plus ATHLETE NETWORK. BRAND IMPACT. |
| Badge / roundel | The circular BTG mark alone, for the favicon and app icon |
| Favicon | The badge at 32px and 180px, legible at both |

Rules for the redraw:

- **Keep what identifies it**: the two-part X with the orange bolt and the
  silver blade, BTG above SPONSOR, the blue-then-orange tagline split, the
  circular badge.
- **Drop what is decoration**: bevel, chrome gradient, outer glow, drop shadow,
  the dark plate behind it. Flat fills only.
- Use the brand tokens above — `#2E9BF5` where the original is blue, `#F97A1F`
  where it is orange, `#F4F5F7` where it is silver or white.
- Each asset on the dark ground **and** in a version that works on white, since
  the light theme and printed material both need one.
- Vector, so it scales. Keep the letterforms recognisably the original's heavy
  condensed italic — do not restyle them into a different brand.

The current files, for reference: `sponsorx-full.png`, `sponsorx-title.png`,
`sponsorx-badge.png` in the project's `public/` folder. Attach them to the
session if you can; if not, the description above is the source of truth.

## Constraints

- Real `<a href>` and `<button>` for anything clickable; touch targets at least
  44px.
- Text contrast 4.5:1 against its own background — 3:1 is acceptable at 24px and
  above. Text over an image slot needs a scrim that earns the ratio.
- No emoji, no gradient washes, no stock-photo pastiche.
- No demographics, sentiment or real-time figures — Phase 1 cannot source them.

## Done when

Hero, proof / case-study slots and package presentation art are ready for the
public homepage.
