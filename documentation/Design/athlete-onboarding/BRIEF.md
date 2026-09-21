# Design brief — Athlete onboarding flow (`P1-ART-07`)

Paste this whole file into Claude Design.

---

## What to design

The sign-up flow for a high-school or college athlete joining the BTG SponsorX
athlete network. It is ten sections long, and it is the front door of the whole
product — every other thing that happens in SponsorX starts with an athlete
completing this.

Design it **phone first, 390 × 844**. Athletes fill this in on a phone, often
between classes or at a venue. A desktop version is not needed.

## Screens required

One artboard per section, plus a flow map and the post-submit state — 12 in all.

| # | Screen | Contains |
|---|---|---|
| 0 | Flow map | All ten sections at a glance, showing where the one branch sits |
| 1 | Identity | Legal first name, legal last name, date of birth, email, phone |
| 2 | Sport & team | Primary sport, position, level (NCAA / high school / club), team or school |
| 3 | Location | City, state/region, country, optional secondary markets |
| 4 | Social accounts | Instagram, TikTok, YouTube handles, optional follower count |
| 5 | Content capabilities | Formats they can produce, typical turnaround, equipment |
| 6 | Brand interests | Categories they want to work with |
| 7 | Restrictions & conflicts | Existing sponsorships, categories they will not promote |
| 8 | Guardian / authorized rep | **Shown only when date of birth is under 18** — guardian name, relationship, guardian email |
| 9 | Payment recipient | Recipient name only |
| 10 | Agreement | The Content Collaboration Agreement, accepted by ticking a box |
| 11 | After submit | Submitted → under review → decision, and the guardian-pending state |

## The rules that shape it

**One branch, not two flows.** A date of birth under 18 on screen 1 inserts
screen 8 and changes nothing else. Show the athlete on screen 1 that this has
happened. The flow must never feel like a separate, lesser product for minors.

**Screen 7 is the one that carries consequence.** It is the only place an
existing deal can be declared, and every campaign is checked against it before
it is shown to the athlete. It should read as more serious than the screens
around it, and it must be clearly distinguished from screen 6 — interests are a
preference, restrictions are enforced.

**Screen 9 must state what is never asked for.** SponsorX collects no bank
account, no card, no Social Security or tax ID. Money moves outside the system.
Say this on the screen, plainly — it is the screen where an athlete is most
likely to abandon out of suspicion.

**Screen 10 is click-wrap.** A tick box against the agreement text, with a note
that the exact version shown is recorded. The wording is draft and should be
labelled as draft.

**Progress is saved after every section**, and the application can be left and
resumed. Say so in the header on every screen — a ten-section form that looks
unsavable is abandoned.

**Submission is not approval.** Screen 11 must make clear that BTG reviews every
application by hand, and that a guardian who has not yet confirmed blocks
accepting campaigns, not approval itself.

## Brand

Dark theme, which is primary — the logo lives on black.

| Token | Value | Use |
|---|---|---|
| Ground | `#0A0C10` | page background |
| Surface | `#12151D` | cards, inputs |
| Surface 2 | `#1A1F2B` | raised notices |
| Line | `#242A38` | borders |
| Text | `#F4F5F7` | body |
| Muted text | `#8A90A2` | labels, secondary |
| Primary blue | `#2E9BF5` | the athlete portal's accent, primary actions |
| Accent orange | `#F97A1F` | the branch and the enforced screens |
| Warn | `#FACC15` | pending states |
| Success | `#22C98D` | saved, confirmed |
| Danger | `#FF4D4F` | blocking errors |

Typeface **Poppins** (400 / 500 / 600 / 700). On a primary blue fill, label ink
is `#0A0C10`, not white — white on that blue is only 2.95:1.

## Constraints

- Real `<input>` with a real `<label>`, real `<button>`, real `<a href>` — even
  in a static comp. Touch targets at least 44px.
- Text contrast 4.5:1 against **its own background**, not the page ground.
- No invented statistics anywhere. No follower counts presented as verified —
  anything the athlete types is self-reported and must be marked as such.
- No emoji. Icons as inline stroke SVG.
- Do not design audience demographics, sentiment, or anything real-time. They
  are out of scope for Phase 1 and have no source to draw from.

## Done when

All ten sections are designed as a progressive flow, and the guardian branch is
designed as part of it.
