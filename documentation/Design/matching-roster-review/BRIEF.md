# Design brief — Matching and roster review (`P4-ART-01`)

Paste this whole file into Claude Design.

---

## What to design

The screen a BTG Athlete Network Manager uses to pick which athletes go on a
sponsor's campaign, and to review that roster before invitations go out. It is
step 3 of the twelve-step managed campaign workflow.

This is the densest screen in the product: a filterable list of eligible
athletes, each with a score made of six factors, a reach figure, a cost, a sell
price and a conflict status — and a shortlist being assembled alongside it.
Design it so a manager can work through forty athletes without losing their
place.

**Desktop, 1440 × 980.** This is staff software used at a desk. No phone
version is needed.

## Screens required

| # | Screen | Purpose |
|---|---|---|
| 1 | Matching workspace | Brief summary, filters, the athlete list, the shortlist being built |
| 2 | Roster comparison | Three shortlisted athletes side by side, factor by factor |
| 3 | Conflict detail | Why one athlete is blocked, and what the manager can do about it |
| 4 | Review & send | The final roster, what each athlete is being offered, and sending the invitations |
| 5 | Nothing matches | The state where filters or conflicts leave no eligible athletes |

## What is on the workspace

**The brief, always visible** — budget, campaign window, market, the job codes
being filled, and how many athletes are needed. The manager is matching against
these constraints and should never have to leave to recall them.

**Filters**: search, sport, tier (Premium / Creator / Emerging), a minimum score,
and eligibility toggles for approved-and-active and guardian-verified.

**The athlete list**, one row each, carrying: name, sport, home market, tier,
score with its value visible as well as its bar, reach, athlete cost, sell price,
margin, and conflict status.

**The shortlist**, showing how many of the needed athletes are filled, what has
been committed, the blended margin, and the action that sends invitations.

## The rules that shape it

**Conflicts are never filtered away silently.** An athlete with a declared
competing deal stays in the list, visibly blocked, with the reason readable and
a way to see the detail. A manager must be able to see that an athlete was
excluded and why — an athlete who simply vanishes from a list is the failure
mode this screen exists to prevent.

**Margin is a first-class column.** BTG's floor rule is that price must be at
least 1.4× athlete cost, and on the current job catalogue that floor is breached
on real combinations — a Premium athlete at the top of the base band can cost
more than the job sells for. The screen must surface a roster that breaks the
floor before invitations go out, not after.

**Athlete cost appears here and nowhere a sponsor can see.** This is a BTG staff
screen, so cost is shown. The same figure must never appear on any
sponsor-facing surface.

**Every number needs a source, and the screen should say so.** The score is a
stored snapshot from a rules-based method, not a live calculation, and its six
factors are engagement, content quality, audience, reliability, geography and
fit. Reach is verified through the platform where we have it and self-reported
otherwise — the two must look different at a glance. Cost comes from the
athlete's rate, sell price from the package's price band.

**Guardian-pending is a state on the row, not a block.** A minor whose guardian
has not confirmed can be shortlisted; they cannot accept. Show the difference.

## Brand

Dark theme, primary.

| Token | Value | Use |
|---|---|---|
| Ground | `#0A0C10` | page background |
| Surface | `#12151D` | cards, rows, inputs |
| Surface 2 | `#1A1F2B` | raised panels |
| Line | `#242A38` | borders, table rules |
| Text | `#F4F5F7` | body |
| Muted text | `#8A90A2` | labels, secondary |
| Primary blue | `#2E9BF5` | actions, selection |
| Admin steel | `#CBD5E1` | this workspace's own accent |
| Accent orange | `#F97A1F` | margin below floor, the athlete tier mark |
| Warn | `#FACC15` | self-reported, guardian pending |
| Success | `#22C98D` | verified, healthy margin |
| Danger | `#FF4D4F` | conflict, blocked |

Typeface **Poppins** (400 / 500 / 600 / 700). Label ink on a primary blue fill is
`#0A0C10`, not white.

## Constraints

- Real `<input>`, `<label>`, `<button>`, `<a href>`. Icon-only buttons carry an
  `aria-label`.
- Text contrast 4.5:1 against its own background. Dense does not mean faint —
  this screen is read for hours.
- No invented statistics. No demographics, no sentiment, no real-time anything —
  Phase 1 has no source for them.
- No emoji. Icons as inline stroke SVG.

## Done when

The densest admin screen in the product is designed before it is built —
filters, roster comparison and score presentation all resolved.
