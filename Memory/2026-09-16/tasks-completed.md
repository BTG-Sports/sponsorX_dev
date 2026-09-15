# 2026-09-16 — tasks completed

## Task — Complete `/athlete/invitations` frontend functionality (sort, filter, search, pagination)

**Trigger:** user asked to complete the frontend functionality on the athlete
invitations page: sorting, filter, search and pagination.

### The problem
The page ([page.tsx](../../src/app/(app)/athlete/invitations/page.tsx)) was a
pure server component from the 2026-09-14 redesign: search was a GET form
(full navigation per keystroke-less submit), the state tabs were `<Link>`s
(full navigation per click), there was **no sort control, no job filter and no
pagination** — the whole filtered set rendered at once.

### What was built
The interactive surface moved into **one client island** —
[invitations-inbox.tsx](../../src/components/invitations-inbox.tsx) — following
the marketplace-catalog / sponsor-campaigns-list idiom exactly:

- **Instant search** (`SearchInput`, athlete tone) across sponsor, campaign,
  job name and job ID — no Apply button, per the standing app-like-UX rule.
- **State tabs** (All / Needs response / Accepted / Declined / Expired) as
  client buttons with live counts; counts reflect the current search + job
  filter so they answer "of what I'm looking at, how many per state".
- **Job filter** dropdown — distinct `SX-nn · Job name` rows derived from the
  fixture.
- **Sort menu** — default is the original urgency-first order (open invites
  first, soonest expiry on top); options for expiry-soonest, offer high→low /
  low→high, sponsor A–Z. The expiry sort keeps open invites ahead of resolved
  ones so an EXPIRED fixture string ("expired 3 days ago") can't sort into the
  actionable set.
- **Dismissible chips** for active search/job filters + "Clear all".
- **Pagination** — shared [pagination.tsx](../../src/components/pagination.tsx)
  numbered pager (`alwaysShow`) + 12/24/60 page-size dropdown, the whole page
  bar (with "Showing X–Y of Z matching", `aria-live`) duplicated above and
  below the grid; bottom size-dropdown opens upward. Any search/filter/sort
  change resets to page 1.
- **URL-synced** via `history.replaceState`: `?state=`, `?q=`, `?job=`,
  `?sort=`, `?page=`, `?size=`, preserving `?demo=` — shareable and
  reload-safe. The server page seeds the island from `searchParams`, so a
  pasted URL renders pre-filtered.

### What stayed server-side
Heading, demo states (empty/loading/error/minor), the guardian notice, the
whole-inbox **stat strip** (deliberately unfiltered — "what's waiting for me")
and the §08 blocked-acceptance footer. The two helpers both sides need
(`urgencyHours`, `isOpen`) moved to a new shared module
[invitations-ui.ts](../../src/lib/invitations-ui.ts), since a `"use client"`
file can't export plain functions to a server component.

### Card markup
Unchanged — the invitation card (identity band, decision numbers, job row,
usage/exclusivity, decline reason, blocked accept + decline + full-terms
actions) moved verbatim from the page into the island.

### Verification
`npx tsc --noEmit` clean, `npx eslint` clean on the three touched files,
`npx next build` passes (`/athlete/invitations` dynamic, ƒ).

### Files
- `src/components/invitations-inbox.tsx` — new client island
- `src/lib/invitations-ui.ts` — new shared helpers (urgencyHours, isOpen)
- `src/app/(app)/athlete/invitations/page.tsx` — reduced to the server frame
