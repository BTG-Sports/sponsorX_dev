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

## The rules that shape it

**No invented proof.** BTG has no case studies yet. Design the case-study slot
as *structure* — the shape a real result will occupy, with visible placeholders
such as `[SPONSOR NAME]` and `[RESULT]`. Do not invent sponsor names, logos,
quotes, percentages or athlete results. A fabricated proof point on a public
homepage is the single fastest way to lose the credibility this site exists to
build.

**No invented statistics anywhere**, including in the hero. If a number would
help, leave a labelled placeholder for a real one.

**The packages must be comparable.** A sponsor choosing between six options
needs to see the difference at a glance: what they get, roughly what it costs,
and how many athletes are involved. Exact prices are not settled yet — leave
them as placeholders rather than inventing a figure.

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

Logo files available: `sponsorx-full.png`, `sponsorx-title.png`,
`sponsorx-badge.png`.

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
