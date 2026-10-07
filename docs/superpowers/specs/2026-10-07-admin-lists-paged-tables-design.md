# The admin desks' lists as server-paged tables (P1-FE-31)

**Date:** 2026-10-07 · **Raised by:** programme owner ("how about the tables
existing in the admin dashboard pages, do you make it as a pagination based
on our rules and memory?" → "okay now convert them to tables with pagination
based on our rules and memory IF only its needed to be converted to be a
table to make it optimized and make it easy on the eyes of the user") ·
**Scope:** the ten admin desks that still read a whole list; the API paging
they need; one shared table.

## The audit that led here

Already server-paged (the house pager, memory `pagination-pattern`): the
board, applications, approvals, campaigns, the matching studio, finance
reconciliation, the marketplace, the network, new sign-ups (and its
sensitive edits), rewards, NEXT prospects; the sign-up rules panel pages
its places in the browser by the owner's choice (a bounded catalogue).

Not paged, each reading the whole list (or the API's silent cap of 100,
200 or 500 rows) and some counting tabs from the rows in view:

| Desk | Before | Now |
|---|---|---|
| Audit log | keyset cursor + "Load more" | paged table |
| Briefs | newest 100 + held, filtered in the browser | paged rows (the API was already paged; the desk wasn't) |
| Sponsor requests | first 200 of a tab | paged table |
| Property verification | **eight** whole-table reads to count the tabs | one paged read, counts from the API |
| Payout approvals | oldest 200 | paged table |
| Refunds to send | first 500 | paged table |
| Delivery issues | all three lists, whole | one tab's page, counts for all three |
| Guardian handoffs | "the latest 100 of N" | paged table |
| Closed accounts | newest 100 | paged table |
| Offers | every offer, tabs computed in the browser | paged table, tab rules on the server |

Not candidates: commission rules, integrations, analytics, NEXT editions,
restricted words — bounded catalogues or single records.

## "Only where a table makes it easier on the eyes"

Nine of the ten are records with the same five to eight facts each — a
name, an amount, a date, a status, an action. They were already drawn as
columns (a CSS grid of `<li>`s with cells hidden or duplicated per
breakpoint). A real `<table>` gives those the aligned columns, the header
a screen reader can use, true row hover, and one phone layout, from one
component. **Briefs** is the exception and stays rows: each brief carries
its reasons, a readiness checklist and a detail panel beside the list — a
card, not a row. It is paged like the rest.

## The API

Every list endpoint keeps its old shape and gains the house pager
(`lib/paging.ts`): `?page=` turns it on, `?size=` (12 default, 100 max),
and the answer carries `page: { page, size, total, pages }`, the page
clamped to what exists. Tab counts always come from a count or `groupBy`
over the whole scope, never from the page.

- `/sponsor-requests`, `/payouts`, `/refunds`, `/guardian-handoffs`,
  `/account-closures`: the existing list function takes an optional
  `PageRequest`; without it the old capped read.
- `/onboarding?page`: `reviewQueuePage` — one tab's page with `counts`
  (each state, plus `auto` and `flagged`).
- `/offers?page&tab=`: `listOffersPage` — the desk's tab rules
  (`needs`, `drafts`, `waiting`, `accepted`, `declined`, `withdrawn`)
  moved from the browser to WHEREs on the server, `counts` by state and
  `tabs` by desk tab; "needs" sorts change requests longest-waiting first.
- `/delivery-issues?page&tab=`: `deliveryIssuesPage` — `problems` and
  `settled` page the issues themselves (oldest escalation first; latest
  settlement first, one entry per settled problem), `overdue` the lines;
  `counts` for all three.
- `/audit-log?page`: a counted page beside the keyset mode (`nextCursor`
  null, the facets stay). Found in review: the first cut clamped the page
  before counting, so page 2 answered page 1 — now count, clamp, read.
- `/briefs?page`: adds `?sport=`, `counts` (held, all, each state) and
  `facets.sports`.

Every new Prisma read carries its `tenant-scope:` note and the static scope
test stays green.

## The shared table (`components/stage-table.tsx`)

- `StageTable` — a `.sx-card` with the table scrolling inside it; `<th>`s
  from a `Column[]` (`num` right-aligns, `srOnly` for the action column).
- `Tr` (`i` staggers the entrance, `tone` tints a row that needs you),
  `Td` (`label` is what a phone prints first; `num`, `act`, `muted`),
  `Primary` (the strong line and a quiet one under it).
- `PagedTable` — `ServerList` + `PagerRow` above and below + `PendingList`
  around the table; `bare` when the page already has a `ServerList`.
- `TabStrip` / `TabLink` — the tab links (no `?page` on them, so a tab
  resets the pager).

CSS (`.sx-table` in `globals.css`): 10px uppercase tracked header, hairline
rows, row hover tint, left bar in a tone, rows rising in on the stage
(`--i`). Below `md` the header is visually hidden and every row becomes a
card, each cell printing `data-label` first; the action fills the width.

## The pages

Each desk reads `apiListQuery(sp, { …tab })`, keeps its tabs (now
`TabLink`s with the API's counts), its empty states and its row-level
actions (`MarkRefunded`, `PayoutRetry`, `RemindSellerButton` sit in the
action cell), and renders a `PagedTable`. The audit explorer keeps its
filters, which now go through `ServerList`'s navigation; a row expands to
a second `<tr>` with the field diff. The briefs desk's tab, search and
sport filter write the URL and the API answers; the detail panel is
unchanged.

## Verified

- Backend: tsc; the two static tests; nine endpoint tests (one per list,
  `?page=1&size=1` → one row, the page, counts equal to the unpaged call;
  no `page` key without `?page`).
- Frontend: tsc, eslint, 1167 unit tests.
- Playwright `e2e/admin-lists-paged.spec.ts` as BTG_ADMIN: the ten desks on
  the stage, a table or rows with the pager above and below (or an empty
  state), no console error, no horizontal overflow; `?size=24` shown by the
  control; a tab link resets `?page`.
