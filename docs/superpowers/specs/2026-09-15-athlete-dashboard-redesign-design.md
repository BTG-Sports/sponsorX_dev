# Athlete Dashboard Redesign — easier learning curve

**Date:** 2026-09-15
**Page:** `src/app/(app)/athlete/page.tsx` (§9 screen 6, requirements §24)
**Problem:** the A2 dashboard shows everything at once — milestone hero, four
stat tiles, invitations, deliverables, rate card, per-state earnings, profile
checklist, audience, agreements — all at equal weight. First-time athletes
face a wall of information with no clear reading order.

**Chosen direction (Option B of three):** two focal points, staged — a slim
money strip, then a unified action queue beside a compact rail. Everything
else demoted to subpages that already exist. A subtle journey strip teaches
the invite → accept → deliver → get-paid mental model.

## Page staging (top → bottom)

1. **Notices** — guardian pending (`BlockedNotice`) stays on top, unchanged.
   The amber "onboarding items outstanding" strip is **removed**: it
   duplicates the queue's profile row. Its `/join` link was wrong for an
   in-portal athlete anyway; profile gaps now deep-link to
   `/athlete/profile/edit` (portal-views-stay-in-portal).
2. **Heading** — name, sport/position/region/school line, tier +
   multiplier badges. Unchanged.
3. **Money strip** — the existing `HeroBand` slimmed:
   - `ProgressRing` (payout %) + gradient career-earned figure
     (`athleteCareer.careerEarningsCents`, POSTGRES chip) + one line:
     "$X approved → payout {date} · on-time {n}%".
   - The audience line moves to the rail's Audience card. Provenance chips
     kept but quiet: one on the hero figure, one where the audience total
     lands (stats-must-be-retrievable).
4. **Journey strip** *(new — the teaching element)* — four plain-English
   steps: **Get invited → Accept the deal → Deliver & verify → Get paid**,
   with the athlete's current stage highlighted and a live count under each
   step (open invites, active orders, due deliverables, pending $).
   Dismissible via ✕; dismissal persisted in `localStorage`
   (`sx-athlete-journey-dismissed`). This is the page's one new client
   island. Steps link out: invited → `/athlete/invitations`, deliver →
   the queue, paid → `/athlete/earnings`.
5. **Slim stat tile row** *(kept per user feedback)* — the four numbers
   (open invitations, deliverables due, pending earnings, momentum
   sparkline) restyled slimmer/one-line, and each tile is now a link to
   where its number lives: invitations → `/athlete/invitations`,
   deliverables → queue anchor (`#queue`), pending earnings and momentum →
   `/athlete/earnings`.
6. **Two-column zone** — action queue (left, `minmax(0,1fr)`) + rail
   (right, ~20rem), collapsing to one column below `xl` with the queue
   first.

## The action queue (left)

One card titled **"Needs your attention"** with a count. Server-rendered.
Only rows the athlete can *act on*, in priority order:

1. **Open invitations** (`INVITED`/`VIEWED`, sorted soonest-expiry first) —
   icon, "{sponsor} — {campaign} invite · {money}", context line
   (deliverable count · usage rights · exclusivity), urgency pill
   ("expires 3d" warn tone when close, "new" for `INVITED`), and a
   **Review terms** button → `/athlete/orders/[id]?from=athlete-portal`.
   Accept/Decline remain unwired on the order page per guide §08 — the
   dashboard row's single action is Review, so nothing on the dashboard is
   a dead button.
2. **Due deliverables** (`NOT_STARTED`, sorted by due date) — icon, title,
   "{campaign} · {sponsor}", due pill (warn tone when soonest), **Upload
   proof** button (disabled with §4 tooltip when `guardianPending`;
   otherwise the existing §11 not-wired tooltip).
3. **Profile gaps** — one collapsed row: "Finish your profile — {n} items
   left" with the missing labels as the context line, linking to
   `/athlete/profile/edit?section={first missing}`.

Below the rows, a one-line footer replaces the old full deliverables table:
"In review, nothing to do: {n} deliverables with BTG / sponsor · see all →".
The link scrolls to `#in-review` — a visually quiet, server-rendered list of
the waiting deliverables (title · state pill · order link) at the bottom of
the queue card. No new page, no client island.

State-machine hint text ("§21 — INVITED → VIEWED → …") is removed from
`SectionHeading`s; `DELIVERABLE_COPY` plain-English labels already exist
and are reused for pills.

## The rail (right)

Three glanceable link-out cards (plus Guardian for minors):

- **Earnings** — pending this cycle (`earnings` PENDING bucket), approved →
  payout date, link **Earnings detail →** `/athlete/earnings`. The
  per-state breakdown list and the "no bank details" paragraph leave the
  dashboard — both already live on `/athlete/earnings`.
- **Profile** — completion % + `Meter` + "{done}/{total} sections", link
  **Finish profile →** `/athlete/profile/edit`. The full checklist leaves
  the dashboard (queue row + this card cover it).
- **Audience** — total followers + engagement (VERIFIED · MANUAL chip) +
  one line of per-platform compact counts, link **Manage socials →**
  `/athlete/profile/edit?section=socials`.
- **Guardian** *(minors only)* — unchanged card: legal name +
  verified/pending badge.

## Rehousing — nothing new to build

| Leaves the dashboard | Already lives at |
|---|---|
| Per-state earnings list + trust copy | `/athlete/earnings` (2026-09-14 redesign) |
| Rate card list | `/athlete/profile/edit?section=rates` |
| Agreements list | `/athlete/profile/edit?section=agreements` |
| Audience per-platform detail | `/athlete/profile/edit?section=socials` + public profile |
| Full profile checklist | `/athlete/profile/edit` (editor shows section state) |
| Full deliverables table | queue rows (actionable) + `#in-review` quiet list (waiting) |

## Implementation

- **New:** `src/components/journey-strip.tsx` — `"use client"` island
  (dismiss + localStorage + reduced-motion-safe entrance); props are
  data-only (steps, counts, current index) so the server page stays the
  source of truth. Follows the `Reveal`/`ActivityExplorer` island
  precedent.
- **Rewrite:** `src/app/(app)/athlete/page.tsx` — same fixtures
  (`athleteCareer`, `invitations`, `deliverables`, `earnings`,
  `profileChecklist`, `socials`), new composition.
- **New (added 2026-09-16):** `src/components/attention-queue.tsx` — a second
  client island: both queue sections page independently at 5 rows (any
  section can outgrow a screenful), each pager directly under its own list —
  the actionable pager (`?attn=`) between the rows and the in-review section,
  the in-review pager (`?rev=`) below the card. Both URL-synced
  (replaceState, seeded by the server page), always visible (‹ 1 › with
  disabled arrows at a single page), out-of-range seeds clamp. The server
  page builds serializable `QueueRow`s and `ReviewRow`s.
- **Reused:** `Card`, `Badge`, `Button`, `Meter`, `StatTile` (or a slim
  variant), `ProgressRing`, `HeroBand`, `MiniChip`, `SourceLabel`,
  `Sparkline`, `EmptyState`, `SkeletonPage`.
- **Demo states preserved:** `?demo=loading` skeleton, `?demo=error`
  throw, `?demo=empty` EmptyState (unchanged), `?demo=minor` guardian
  gating — queue Upload buttons disabled with §4 tooltip, Guardian rail
  card shown, BlockedNotice on top. Journey strip renders for all
  non-empty states.
- **No route changes**, no fixture schema changes (journey counts derive
  from existing fixtures).

## Out of scope

- Wiring accept/decline (blocked on §08 counsel approval — unchanged).
- Any backend/persistence work; this is the fixture prototype.
- Redesigning `/athlete/invitations`, `/athlete/earnings`, or the profile
  pages — they already carry the rehoused content.

## Verification

No test infrastructure exists in this repo (fixture prototype). Verify by
`npm run lint`, `tsc --noEmit` (via `next build` or the repo's check
script), and a `next dev` walkthrough of `/athlete`,
`/athlete?demo=minor`, `?demo=empty`, `?demo=loading`, `?demo=error` at
mobile and `xl` widths, checking: journey strip dismiss persists across
reload, every rail/tile link resolves, queue ordering (expiring invite
first), and disabled-state tooltips.
